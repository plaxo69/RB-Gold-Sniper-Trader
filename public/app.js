const API_BASE="/api";
const state={running:true,timeframe:"1m",candles:{},lastSignalKey:null,lastRefresh:null,history:JSON.parse(localStorage.getItem("rb_sniper_history")||"[]"),audit:JSON.parse(localStorage.getItem("rb_sniper_audit")||"[]"),tvWidget:null,refreshTimer:null,busy:false};
function $(id){return document.getElementById(id)}
function notify(message,type="info"){const n=document.createElement("div");n.textContent=message;n.style.cssText="position:fixed;right:20px;top:20px;z-index:9999;padding:12px 16px;border-radius:8px;color:#fff;font-weight:700;background:"+(type==="success"?"#198754":type==="error"?"#dc3545":"#0d6efd");document.body.appendChild(n);setTimeout(()=>n.remove(),2800)}
function sma(a,p){return a.length<p?null:a.slice(-p).reduce((x,y)=>x+y,0)/p}
function ema(a,p){if(!a.length)return null;const k=2/(p+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return 50;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}if(l===0)return 100;return 100-100/(1+(g/p)/(l/p))}
function atr(c,p=14){if(c.length<p+1)return 0;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return sma(tr,p)||0}
function levels(c,n=20){const x=c.slice(Math.max(0,c.length-n-1),-1);return x.length?{support:Math.min(...x.map(v=>v.low)),resistance:Math.max(...x.map(v=>v.high))}:{support:null,resistance:null}}
function pivots(c,side=1){const out=[];for(let i=side;i<c.length-side;i++){let hi=true,lo=true;for(let j=1;j<=side;j++){if(c[i].high<=c[i-j].high||c[i].high<c[i+j].high)hi=false;if(c[i].low>=c[i-j].low||c[i].low>c[i+j].low)lo=false}if(hi)out.push({i,type:"H",price:c[i].high,time:c[i].timestamp});if(lo)out.push({i,type:"L",price:c[i].low,time:c[i].timestamp})}return out}
function detectStructure(c){
  const x=c.slice(0,-1);if(x.length<40)return{label:"NEUTRO",bias:"NEUTRAL",scoreBuy:0,scoreSell:0,event:"NONE",level:null,confirmed:false,time:null};
  const p=pivots(x,2);const highs=p.filter(v=>v.type==="H").slice(-4),lows=p.filter(v=>v.type==="L").slice(-4),last=x.at(-1);
  const ph=highs.at(-1),pl=lows.at(-1),prevH=highs.at(-2),prevL=lows.at(-2);
  const bullStructure=!!(ph&&prevH&&pl&&prevL&&ph.price>prevH.price&&pl.price>prevL.price);
  const bearStructure=!!(ph&&prevH&&pl&&prevL&&ph.price<prevH.price&&pl.price<prevL.price);
  const resistance=ph?.price??Math.max(...x.slice(-12).map(v=>v.high));const support=pl?.price??Math.min(...x.slice(-12).map(v=>v.low));
  const brokeUp=last.close>resistance&&last.close>=last.open;const brokeDown=last.close<support&&last.close<=last.open;
  if(brokeUp)return{label:bullStructure?"BOS BULLISH":"CHOCH BULLISH",bias:"BULLISH",scoreBuy:3,scoreSell:0,event:bullStructure?"BOS_BULLISH":"CHOCH_BULLISH",level:resistance,confirmed:true,time:last.timestamp};
  if(brokeDown)return{label:bearStructure?"BOS BEARISH":"CHOCH BEARISH",bias:"BEARISH",scoreBuy:0,scoreSell:3,event:bearStructure?"BOS_BEARISH":"CHOCH_BEARISH",level:support,confirmed:true,time:last.timestamp};
  const slope=last.close-x[Math.max(0,x.length-7)].close;const bias=slope>0?"BULLISH":slope<0?"BEARISH":"NEUTRAL";
  return{label:bias==="BULLISH"?"ESTRUTURA ALTA":bias==="BEARISH"?"ESTRUTURA BAIXA":"NEUTRO",bias,scoreBuy:bias==="BULLISH"?1:0,scoreSell:bias==="BEARISH"?1:0,event:"NONE",level:bias==="BULLISH"?resistance:support,confirmed:false,time:last.timestamp};
}
function trend(c){const z=c.slice(0,-1).map(x=>x.close),e20=ema(z,20),e50=ema(z,50),last=z.at(-1);if(last>e20&&e20>e50)return"ALTA";if(last<e20&&e20<e50)return"BAIXA";return"LATERAL"}
function evaluate(main,m5,m15,h1){
  if(main.length<80||m5.length<60||m15.length<60||h1.length<60)return null;
  const closed=main.slice(0,-1),live=main.at(-1),closes=closed.map(x=>x.close),last=closes.at(-1),r=rsi(closes),e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,200),a=atr(closed),lv=levels(closed);
  const s5=detectStructure(m5),s15=detectStructure(m15),s1=detectStructure(h1),t5=trend(m5),t15=trend(m15),t1=trend(h1);
  let buy=0,sell=0,br=[],sr=[];
  if(last>e20){buy+=1;br.push("Preço > EMA20")}else{sell+=1;sr.push("Preço < EMA20")}
  if(last>e50){buy+=1;br.push("Preço > EMA50")}else{sell+=1;sr.push("Preço < EMA50")}
  if(e200){if(last>e200){buy+=1;br.push("Preço > EMA200")}else{sell+=1;sr.push("Preço < EMA200")}}
  if(t5==="ALTA"){buy+=2;br.push("M5 alta")}else if(t5==="BAIXA"){sell+=2;sr.push("M5 baixa")}
  if(t15==="ALTA"){buy+=1;br.push("M15 alta")}else if(t15==="BAIXA"){sell+=1;sr.push("M15 baixa")}
  if(t1==="ALTA"){buy+=1;br.push("H1 alta")}else if(t1==="BAIXA"){sell+=1;sr.push("H1 baixa")}
  if(r>=45&&r<=70){buy+=1;br.push("RSI favorável BUY")}
  if(r>=30&&r<=55){sell+=1;sr.push("RSI favorável SELL")}
  buy+=s5.scoreBuy+s15.scoreBuy+s1.scoreBuy;sell+=s5.scoreSell+s15.scoreSell+s1.scoreSell;
  if(s5.scoreBuy)br.push(s5.label);else if(s15.scoreBuy)br.push(s15.label);else if(s1.scoreBuy)br.push(s1.label);
  if(s5.scoreSell)sr.push(s5.label);else if(s15.scoreSell)sr.push(s15.label);else if(s1.scoreSell)sr.push(s1.label);
  const bullBreak=last>lv.resistance&&closed.at(-2).close<=lv.resistance;const bearBreak=last<lv.support&&closed.at(-2).close>=lv.support;
  if(bullBreak){buy+=3;br.push("Rompimento confirmado")};if(bearBreak){sell+=3;sr.push("Rompimento confirmado")}
  const bullishStructure=s5.scoreBuy>0||s15.scoreBuy>0||s1.scoreBuy>0;const bearishStructure=s5.scoreSell>0||s15.scoreSell>0||s1.scoreSell>0;
  const htfBull=t15!=="BAIXA"&&t1!=="BAIXA",htfBear=t15!=="ALTA"&&t1!=="ALTA";
  const pullbackBuy=last>e20&&last<=e20+a*0.55&&r>=45&&r<=65;const pullbackSell=last<e20&&last>=e20-a*0.55&&r>=35&&r<=55;
  let type="WAIT",reasons=[],score=Math.max(buy,sell);
  if(buy>=7&&buy>=sell+2&&bullishStructure&&htfBull){type="BUY";reasons=br}
  else if(sell>=7&&sell>=buy+2&&bearishStructure&&htfBear){type="SELL";reasons=sr}
  else if(buy>=6&&buy>=sell+2&&pullbackBuy&&htfBull){type="BUY";reasons=[...br,"Pullback confirmado"]}
  else if(sell>=6&&sell>=buy+2&&pullbackSell&&htfBear){type="SELL";reasons=[...sr,"Pullback confirmado"]}
  const confidence=type==="WAIT"?Math.min(69,45+Math.max(0,score-4)*5):Math.min(96,65+Math.max(0,score-7)*5);
  let sl=null,tp=null,rr=null;if(type!=="WAIT"&&a>0){if(type==="BUY"){sl=Math.min(lv.support-a*.15,last-a*1.15);const risk=last-sl;tp=last+Math.max(risk*2,a*2.2);rr=(tp-last)/risk}else{sl=Math.max(lv.resistance+a*.15,last+a*1.15);const risk=sl-last;tp=last-Math.max(risk*2,a*2.2);rr=(last-tp)/risk}}
  return{type,score,confidence,price:live.close,signalPrice:last,signalTime:closed.at(-1).timestamp,rsi:rsi(closes),ema20:e20,ema50:e50,ema200:e200,atr:a,support:lv.support,resistance:lv.resistance,trend5:t5,trend15:t15,trend1:t1,structure5:s5.label,structure15:s15.label,structure1:s1.label,structureEvent5:s5.event,structureEvent15:s15.event,structureEvent1:s1.event,sl,tp,rr,reasons,source:"candles reais BTCUSD",bullBreak,bearBreak};
}
async function fetchTF(tf){const r=await fetch(`${API_BASE}/market?timeframe=${encodeURIComponent(tf)}&t=${Date.now()}`,{cache:"no-store"});let d;try{d=await r.json()}catch{throw new Error(`Resposta inválida (${r.status})`)}if(!r.ok||!d.success)throw new Error(d?.details||d?.error||`Erro ${r.status}`);state.candles[tf]=d;return d}
function tvInterval(tf){return({"1m":"1","3m":"3","5m":"5","15m":"15","1h":"60"})[tf]||"1"}
function initTradingView(){const host=$("tradingview-chart");if(!host||!window.TradingView)return;state.tvWidget=new TradingView.widget({autosize:true,symbol:"COINBASE:BTCUSD",interval:tvInterval(state.timeframe),timezone:"Europe/Lisbon",theme:"dark",style:"1",locale:"pt",enable_publishing:false,hide_top_toolbar:false,hide_legend:false,allow_symbol_change:false,save_image:false,container_id:"tradingview-chart"})}
function changeTradingViewInterval(tf){if(state.tvWidget?.chart)state.tvWidget.chart().setResolution(tvInterval(tf))}
function updateUI(d){const last=d.candles.at(-1);$("current-price").textContent=`$${last.close.toFixed(2)}`;$("current-bid").textContent=`$${last.close.toFixed(2)}`;$("current-ask").textContent=`$${last.close.toFixed(2)}`;$("current-spread").textContent=(last.high-last.low).toFixed(2);$("server-info").textContent=`BTCUSD • ${d.source} • ${d.timeframe} • ${new Date(d.timestamp).toLocaleTimeString("pt-PT")}`}
function logAudit(a){if(!a)return;const today=new Date().toISOString().slice(0,10);if(!a.signalTime?.startsWith(today))return;const key=`${a.signalTime}-${a.type}-${a.score}-${a.structure5}-${a.structure15}-${a.structure1}`;if(state.audit.some(x=>x.key===key))return;state.audit.unshift({key,time:a.signalTime,price:a.price,type:a.type,score:a.score,confidence:a.confidence,reason:a.reasons?.join(" • ")||"",rsi:a.rsi,structure5:a.structure5,structure15:a.structure15,structure1:a.structure1});state.audit=state.audit.slice(0,2000);localStorage.setItem("rb_sniper_audit",JSON.stringify(state.audit))}
function saveSignal(a){if(!a||a.type==="WAIT")return;const key=`${a.type}-${a.signalTime}`;if(key===state.lastSignalKey)return;state.lastSignalKey=key;const item={...a,id:Date.now(),time:new Date().toISOString(),status:"ALERTA",result:null};state.history.unshift(item);state.history=state.history.slice(0,100);localStorage.setItem("rb_sniper_history",JSON.stringify(state.history));renderHistory();notify(`🎯 ${a.type} ${a.confidence}% — BTCUSD $${a.price.toFixed(2)}`,"success")}
function auditSummary(){const today=new Date().toISOString().slice(0,10),x=state.audit.filter(v=>v.time?.startsWith(today)),wait=x.filter(v=>v.type==="WAIT");return{evaluations:x.length,wait:wait.length,signals:x.filter(v=>v.type!=="WAIT").length}}
function renderAudit(){const s=auditSummary();const el=$("audit-summary");if(el)el.textContent=`Auditoria hoje: ${s.evaluations} avaliações • ${s.signals} sinais • ${s.wait} WAIT registados`}
function renderAnalysis(a){if(!a)return;$("rsi-value").textContent=a.rsi.toFixed(2);$("macd-value").textContent=`ATR ${a.atr.toFixed(2)}`;$("bb-upper").textContent=a.resistance.toFixed(2);$("bb-lower").textContent=a.support.toFixed(2);$("ma20").textContent=a.ema20.toFixed(2);$("trend-value").textContent=`M5 ${a.trend5} • M15 ${a.trend15} • H1 ${a.trend1}`;const box=$("trades-container");if(!box)return;if(a.type==="WAIT"){box.innerHTML=`<div class="no-trades">⏳ WAIT — sem confirmação Sniper. BTCUSD $${a.price.toFixed(2)} • RSI ${a.rsi.toFixed(1)} • M5 ${a.structure5} • M15 ${a.structure15}</div>`;return}box.innerHTML=`<div class="trade-card ${a.type.toLowerCase()}"><div class="trade-info"><div class="trade-type ${a.type.toLowerCase()}">${a.type==="BUY"?"📈 COMPRA":"📉 VENDA"} — ${a.confidence}%</div><div class="trade-details"><span>💰 $${a.price.toFixed(2)}</span><span>🎯 TP $${a.tp.toFixed(2)}</span><span>🛑 SL $${a.sl.toFixed(2)}</span><span>RR 1:${a.rr.toFixed(2)}</span><span>RSI ${a.rsi.toFixed(1)}</span></div><div class="trade-reason">${a.reasons.join(" • ")}</div></div><div class="trade-profit neutral">ALERTA<br>MANUAL</div></div>`}
function renderHistory(){const total=state.history.length,wins=state.history.filter(x=>x.result==="WIN").length;$("total-trades").textContent=total;$("total-profit").textContent="—";$("win-rate").textContent=total?`${((wins/total)*100).toFixed(1)}%`:"—";renderAudit()}
async function refresh(){if(state.busy)return;state.busy=true;try{const [m1,m5,m15,h1]=await Promise.all(["1m","5m","15m","1h"].map(fetchTF));updateUI(state.candles[state.timeframe]||m1);const a=evaluate(m1.candles,m5.candles,m15.candles,h1.candles);renderAnalysis(a);logAudit(a);if(state.running)saveSignal(a);state.lastRefresh=new Date();$("status").textContent=`🟢 BTCUSD • mercado aberto • ${state.lastRefresh.toLocaleTimeString("pt-PT")}`;$("status").className="status-indicator online";renderHistory()}catch(e){$("status").textContent="🔴 BTCUSD indisponível";$("status").className="status-indicator offline";$("server-info").textContent=e.message}finally{state.busy=false}}
function startSniper(){state.running=true;clearInterval(state.refreshTimer);refresh();state.refreshTimer=setInterval(refresh,60000)}
function stopSniper(){state.running=false;clearInterval(state.refreshTimer);state.refreshTimer=null;notify("⏹ Monitor parado","info")}
function clearTrades(){state.history=[];localStorage.removeItem("rb_sniper_history");renderHistory();$("trades-container").innerHTML='<div class="no-trades">Histórico local limpo.</div>'}
function changeTimeframe(tf){state.timeframe=tf;document.querySelectorAll(".timeframe-btn").forEach(b=>b.classList.toggle("active",b.dataset.tf===tf));changeTradingViewInterval(tf);if(state.candles[tf])updateUI(state.candles[tf]);else refresh()}
window.addEventListener("load",()=>{renderHistory();document.querySelectorAll(".timeframe-btn").forEach(b=>b.addEventListener("click",()=>changeTimeframe(b.dataset.tf)));$("status").textContent="🟡 A obter BTCUSD real…";initTradingView();startSniper()});
