const API_BASE = "/api";
const state = { running:true, timeframe:"1m", candles:{}, lastSignalKey:null, lastRefresh:null, history:JSON.parse(localStorage.getItem("rb_sniper_history")||"[]"), tvWidget:null, refreshTimer:null };
function $(id){return document.getElementById(id)}
function notify(message,type="info"){const n=document.createElement("div");n.textContent=message;n.style.cssText="position:fixed;right:20px;top:20px;z-index:9999;padding:12px 16px;border-radius:8px;color:#fff;font-weight:700;background:"+(type==="success"?"#198754":type==="error"?"#dc3545":"#0d6efd");document.body.appendChild(n);setTimeout(()=>n.remove(),2800)}
function sma(a,p){if(a.length<p)return null;return a.slice(-p).reduce((x,y)=>x+y,0)/p}
function ema(a,p){if(!a.length)return null;const k=2/(p+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return 50;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}if(l===0)return 100;const rs=(g/p)/(l/p);return 100-100/(1+rs)}
function atr(c,p=14){if(c.length<p+1)return 0;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return sma(tr,p)||0}
function levels(c,n=20){const x=c.slice(Math.max(0,c.length-n),-1);return {support:Math.min(...x.map(v=>v.low)),resistance:Math.max(...x.map(v=>v.high))}}

/*
 * SMC estrutural:
 * - BOS = quebra na mesma direção do swing estrutural anterior.
 * - CHOCH = quebra na direção contrária ao swing estrutural anterior.
 * - Só o ÚLTIMO candle FECHADO pode gerar o evento.
 * - BOS e CHOCH nunca são somados como bloqueios opostos.
 * - Um evento antigo não cancela um evento novo.
 */
function detectStructure(c){
  const x=c.slice(0,-1);
  if(x.length<30)return {label:"NEUTRO",bias:"NEUTRAL",scoreBuy:0,scoreSell:0,level:null,event:"NONE",confirmed:false};

  const look=8;
  const last=x.at(-1);
  const previous=x.slice(-look-1,-1);
  const before=x.slice(-2*look-1,-look-1);
  const prevHigh=Math.max(...previous.map(v=>v.high));
  const prevLow=Math.min(...previous.map(v=>v.low));
  const beforeHigh=Math.max(...before.map(v=>v.high));
  const beforeLow=Math.min(...before.map(v=>v.low));

  const brokeUp=last.close>prevHigh;
  const brokeDown=last.close<prevLow;
  const structuralBull=prevHigh>beforeHigh || (previous.at(-1).close>previous[0].close && prevLow>=beforeLow);
  const structuralBear=prevLow<beforeLow || (previous.at(-1).close<previous[0].close && prevHigh<=beforeHigh);

  if(brokeUp){
    const choch=structuralBear;
    return {label:choch?"CHOCH BULLISH":"BOS BULLISH",bias:"BULLISH",scoreBuy:choch?2:2,scoreSell:0,level:prevHigh,event:choch?"CHOCH_BULLISH":"BOS_BULLISH",confirmed:true,time:last.timestamp};
  }
  if(brokeDown){
    const choch=structuralBull;
    return {label:choch?"CHOCH BEARISH":"BOS BEARISH",bias:"BEARISH",scoreBuy:0,scoreSell:choch?2:2,level:prevLow,event:choch?"CHOCH_BEARISH":"BOS_BEARISH",confirmed:true,time:last.timestamp};
  }

  const slope=last.close-x.at(-6).close;
  const bias=slope>0?"BULLISH":slope<0?"BEARISH":"NEUTRAL";
  return {label:bias==="BULLISH"?"ESTRUTURA ALTA":bias==="BEARISH"?"ESTRUTURA BAIXA":"NEUTRO",bias,scoreBuy:bias==="BULLISH"?1:0,scoreSell:bias==="BEARISH"?1:0,level:null,event:"NONE",confirmed:false,time:last.timestamp};
}

function trend(c){const z=c.slice(0,-1).map(x=>x.close),e20=ema(z,20),e50=ema(z,50),last=z.at(-1);if(last>e20&&e20>e50)return"ALTA";if(last<e20&&e20<e50)return"BAIXA";return"LATERAL"}

function analyze(main,m5,m15,h1){
  if(main.length<60||m5.length<60||m15.length<60||h1.length<60)return null;

  const closed=main.slice(0,-1),live=main.at(-1),closes=closed.map(x=>x.close),last=closes.at(-1);
  const r=rsi(closes),e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,200),a=atr(closed),s=levels(closed);
  const st5=detectStructure(m5),st15=detectStructure(m15),st1=detectStructure(h1);
  const t5=trend(m5),t15=trend(m15),t1=trend(h1);

  let buy=0,sell=0,br=[],sr=[];
  if(last>e20){buy++;br.push("Preço > EMA20")}else{sell++;sr.push("Preço < EMA20")}
  if(last>e50){buy++;br.push("Preço > EMA50")}else{sell++;sr.push("Preço < EMA50")}
  if(e200&&last>e200){buy++;br.push("Preço > EMA200")}else if(e200){sell++;sr.push("Preço < EMA200")}
  if(t5==="ALTA"){buy++;br.push("M5 alta")}else if(t5==="BAIXA"){sell++;sr.push("M5 baixa")}
  if(t15==="ALTA"){buy++;br.push("M15 alta")}else if(t15==="BAIXA"){sell++;sr.push("M15 baixa")}
  if(t1==="ALTA"){buy++;br.push("H1 alta")}else if(t1==="BAIXA"){sell++;sr.push("H1 baixa")}
  if(r>=45&&r<=68){buy++;br.push("RSI comprador")}else if(r<45){sr.push("RSI fraco para compra")}
  if(r>=32&&r<=55){sell++;sr.push("RSI vendedor")}

  buy+=st5.scoreBuy+st15.scoreBuy+st1.scoreBuy;
  sell+=st5.scoreSell+st15.scoreSell+st1.scoreSell;
  if(st5.scoreBuy)br.push(st5.label);else if(st15.scoreBuy)br.push(st15.label);else if(st1.scoreBuy)br.push(st1.label);
  if(st5.scoreSell)sr.push(st5.label);else if(st15.scoreSell)sr.push(st15.label);else if(st1.scoreSell)sr.push(st1.label);

  const prevClose=closed.at(-2).close;
  const bullBreak=last>s.resistance&&prevClose<=s.resistance;
  const bearBreak=last<s.support&&prevClose>=s.support;
  if(bullBreak){buy+=2;br.push("Rompimento confirmado")}
  if(bearBreak){sell+=2;sr.push("Rompimento confirmado")}

  const structureBuy=st5.scoreBuy+st15.scoreBuy+st1.scoreBuy;
  const structureSell=st5.scoreSell+st15.scoreSell+st1.scoreSell;

  let type="WAIT",score=Math.max(buy,sell),reasons=[];
  /*
   * Antes: >=7 e diferença >=2 podia bloquear sinais legítimos.
   * Agora: mínimo 6 + confirmação estrutural + vantagem de 2 pontos.
   * Assim BOS/CHOCH não precisam coexistir e um conflito antigo não trava a app.
   */
  if(buy>=6&&structureBuy>=2&&buy>=sell+2){type="BUY";reasons=br}
  else if(sell>=6&&structureSell>=2&&sell>=buy+2){type="SELL";reasons=sr}

  const confidence=type==="WAIT"?0:Math.min(96,62+Math.round((score-6)*6));
  let sl=null,tp=null,rr=null;
  if(type!=="WAIT"&&a>0){
    if(type==="BUY"){
      sl=Math.min(s.support-a*.20,last-a*1.20);const risk=last-sl;tp=last+Math.max(risk*2,a*2);rr=(tp-last)/risk;
    }else{
      sl=Math.max(s.resistance+a*.20,last+a*1.20);const risk=sl-last;tp=last-Math.max(risk*2,a*2);rr=(last-tp)/risk;
    }
  }
  return {type,score,confidence,price:live.close,signalPrice:last,signalTime:closed.at(-1).timestamp,rsi:r,ema20:e20,ema50:e50,ema200:e200,atr:a,support:s.support,resistance:s.resistance,trend5:t5,trend15:t15,trend1:t1,structure5:st5.label,structure15:st15.label,structure1:st1.label,structureEvent5:st5.event,structureEvent15:st15.event,structureEvent1:st1.event,sl,tp,rr,reasons,source:"candles reais BTCUSD"};
}

async function fetchTF(tf){const r=await fetch(`${API_BASE}/market?timeframe=${encodeURIComponent(tf)}&t=${Date.now()}`,{cache:"no-store"});let d;try{d=await r.json()}catch{throw new Error(`Resposta inválida (${r.status})`)}if(!r.ok||!d.success)throw new Error(d?.details||d?.error||`Erro ${r.status}`);state.candles[tf]=d;return d}
function tvInterval(tf){return ({"1m":"1","3m":"3","5m":"5","15m":"15","1h":"60"})[tf]||"1"}
function initTradingView(){const host=$("tradingview-chart");if(!host||!window.TradingView)return;state.tvWidget=new TradingView.widget({autosize:true,symbol:"COINBASE:BTCUSD",interval:tvInterval(state.timeframe),timezone:"Europe/Lisbon",theme:"dark",style:"1",locale:"pt",toolbar_bg:"#111827",enable_publishing:false,hide_top_toolbar:false,hide_legend:false,allow_symbol_change:false,save_image:false,container_id:"tradingview-chart"})}
function changeTradingViewInterval(tf){if(state.tvWidget&&typeof state.tvWidget.chart==="function")state.tvWidget.chart().setResolution(tvInterval(tf))}
function updateUI(d){const last=d.candles.at(-1);$("current-price").textContent=`$${last.close.toFixed(2)}`;$("current-bid").textContent=`$${last.close.toFixed(2)}`;$("current-ask").textContent=`$${last.close.toFixed(2)}`;$("current-spread").textContent=(last.high-last.low).toFixed(2);$("server-info").textContent=`BTCUSD • ${d.source} • ${d.timeframe} • ${new Date(d.timestamp).toLocaleTimeString("pt-PT")}`}
function saveSignal(a){if(!a||a.type==="WAIT")return;const key=`${a.type}-${a.signalTime}`;if(key===state.lastSignalKey)return;state.lastSignalKey=key;const item={...a,id:Date.now(),time:new Date().toISOString(),status:"ALERTA"};state.history.unshift(item);state.history=state.history.slice(0,100);localStorage.setItem("rb_sniper_history",JSON.stringify(state.history));renderHistory();notify(`🎯 ${a.type} ${a.confidence}% — BTCUSD $${a.price.toFixed(2)}`,"success")}
function renderAnalysis(a){if(!a)return;$("rsi-value").textContent=a.rsi.toFixed(2);$("macd-value").textContent=`ATR ${a.atr.toFixed(2)}`;$("bb-upper").textContent=a.resistance.toFixed(2);$("bb-lower").textContent=a.support.toFixed(2);$("ma20").textContent=a.ema20.toFixed(2);$("trend-value").textContent=`M5 ${a.trend5} • M15 ${a.trend15} • H1 ${a.trend1}`;const box=$("trades-container");if(a.type==="WAIT"){box.innerHTML=`<div class="no-trades">⏳ WAIT — sem confirmação Sniper. BTCUSD $${a.price.toFixed(2)} • RSI ${a.rsi.toFixed(1)} • M5 ${a.structure5} • M15 ${a.structure15}</div>`;return}box.innerHTML=`<div class="trade-card ${a.type.toLowerCase()}"><div class="trade-info"><div class="trade-type ${a.type.toLowerCase()}">${a.type==="BUY"?"📈 COMPRA":"📉 VENDA"} — ${a.confidence}%</div><div class="trade-details"><span>💰 $${a.price.toFixed(2)}</span><span>🎯 TP $${a.tp.toFixed(2)}</span><span>🛑 SL $${a.sl.toFixed(2)}</span><span>RR 1:${a.rr.toFixed(2)}</span><span>RSI ${a.rsi.toFixed(1)}</span></div><div class="trade-reason">${a.reasons.join(" • ")}</div></div><div class="trade-profit neutral">ALERTA<br>MANUAL</div></div>`}
function renderHistory(){const total=state.history.length,wins=state.history.filter(x=>x.result==="WIN").length;$("total-trades").textContent=total;$("total-profit").textContent="—";$("win-rate").textContent=total?`${((wins/total)*100).toFixed(1)}%`:"—"}
async function refresh(){try{const [m1,m5,m15,h1]=await Promise.all(["1m","5m","15m","1h"].map(fetchTF));updateUI(state.candles[state.timeframe]||m1);const a=analyze(m1.candles,m5.candles,m15.candles,h1.candles);renderAnalysis(a);if(state.running)saveSignal(a);state.lastRefresh=new Date();$("status").textContent=`🟢 BTCUSD • mercado aberto • ${state.lastRefresh.toLocaleTimeString("pt-PT")}`;$("status").className="status-indicator online";renderHistory()}catch(e){$("status").textContent="🔴 BTCUSD indisponível";$("status").className="status-indicator offline";$("server-info").textContent=e.message}}
function startSniper(){if(state.running)return;state.running=true;notify("🎯 Monitor Sniper BTCUSD ativo — execução manual no MT5","success");refresh();clearInterval(state.refreshTimer);state.refreshTimer=setInterval(()=>{if(state.running)refresh()},60000)}
function stopSniper(){state.running=false;clearInterval(state.refreshTimer);state.refreshTimer=null;notify("⏹ Monitor parado","info")}
function clearTrades(){state.history=[];localStorage.removeItem("rb_sniper_history");renderHistory();$("trades-container").innerHTML='<div class="no-trades">Histórico local limpo.</div>'}
function changeTimeframe(tf){state.timeframe=tf;document.querySelectorAll(".timeframe-btn").forEach(b=>b.classList.toggle("active",b.dataset.tf===tf));changeTradingViewInterval(tf);if(state.candles[tf])updateUI(state.candles[tf]);else refresh()}
window.addEventListener("load",()=>{renderHistory();document.querySelectorAll(".timeframe-btn").forEach(b=>b.addEventListener("click",()=>changeTimeframe(b.dataset.tf)));$("status").textContent="🟡 A obter BTCUSD real…";initTradingView();startSniper()});
