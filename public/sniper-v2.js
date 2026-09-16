(function(root){
const C={period:20,minHistory:205,minRR:2,minBodyAtr:.15,maxExtAtr:2.2};
const sma=(v,p)=>v.length<p?null:v.slice(-p).reduce((a,b)=>a+b,0)/p;
function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let x=v[0];for(let i=1;i<v.length;i++)x=v[i]*k+x[i]*(1-k);return x}
function rsi(v,p=14){if(v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function atr(c,p=14){if(c.length<p+1)return null;const r=[];for(let i=1;i<c.length;i++){const x=c[i],q=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-q),Math.abs(x.low-q)))}return sma(r,p)}
function trend(c){const v=c.map(x=>x.close),f=ema(v,20),s=ema(v,50);if(f==null||s==null)return'LATERAL';const last=v.at(-1),prev=v.at(-4);if(last>f&&f>=s&&f>=prev)return'ALTA';if(last<f&&f<=s&&f<=prev)return'BAIXA';return last>f?'ALTA':last<f?'BAIXA':'LATERAL'}
function structure(c,p=C.period){const x=c.slice(-(p+1),-1);return x.length<p?null:{support:Math.min(...x.map(a=>a.low)),resistance:Math.max(...x.map(a=>a.high))}}
function round(v){return Number(v.toFixed(2))}
function analyze(main,m3,m5,m15,h1){
 if(![main,m3,m5,m15,h1].every(Array.isArray)||main.length<C.minHistory||m3.length<55||m5.length<55||m15.length<55||h1.length<55)return null;
 const closed=main.slice(0,-1),sig=closed.at(-1),prev=closed.at(-2),cl=closed.map(x=>x.close),price=main.at(-1).close;
 const e20=ema(cl,20),e50=ema(cl,50),e200=ema(cl,200),R=rsi(cl),A=atr(closed),S=structure(closed);if([e20,e50,e200,R,A].some(x=>x==null)||!S)return null;
 const t3=trend(m3.slice(0,-1)),t5=trend(m5.slice(0,-1)),t15=trend(m15.slice(0,-1)),t1=trend(h1.slice(0,-1));
 const buyBreak=sig.close>S.resistance&&prev.close<=S.resistance,buyNear=sig.low<=e20+A*.35&&sig.close>e20&&sig.close>sig.open;
 const sellBreak=sig.close<S.support&&prev.close>=S.support,sellNear=sig.high>=e20-A*.35&&sig.close<e20&&sig.close<sig.open;
 const bull=[t3==='ALTA',t5==='ALTA',t15==='ALTA'].filter(Boolean).length,bear=[t3==='BAIXA',t5==='BAIXA',t15==='BAIXA'].filter(Boolean).length;
 const buyTrend=bull>=2&&t1!=='BAIXA'&&price>e20&&e20>=e50&&e50>=e200;
 const sellTrend=bear>=2&&t1!=='ALTA'&&price<e20&&e20<=e50&&e50<=e200;
 const body=Math.abs(sig.close-sig.open),bodyOK=body>=A*C.minBodyAtr,atrOK=A/Math.max(sig.close,1)>=0.00003&&A/Math.max(sig.close,1)<=0.008;
 const buyMom=R>=48&&R<=76,sellMom=R>=24&&R<=52,extBuy=(sig.close-e20)/A,extSell=(e20-sig.close)/A;
 const buySetup=buyTrend&&buyMom&&extBuy<=C.maxExtAtr&&(buyBreak||buyNear),sellSetup=sellTrend&&sellMom&&extSell<=C.maxExtAtr&&(sellBreak||sellNear);
 const type=bodyOK&&atrOK&&buySetup?'BUY':bodyOK&&atrOK&&sellSetup?'SELL':'WAIT';
 let sl=null,tp=null,rr=null;
 if(type==='BUY'){sl=Math.min(sig.low-A*.25,S.support-A*.15);const risk=price-sl;if(risk>0){tp=price+Math.max(risk*C.minRR,A*2);rr=(tp-price)/risk}}
 if(type==='SELL'){sl=Math.max(sig.high+A*.25,S.resistance+A*.15);const risk=sl-price;if(risk>0){tp=price-Math.max(risk*C.minRR,A*2);rr=(price-tp)/risk}}
 const passed=[atrOK,bodyOK,buyTrend||sellTrend,buyBreak||buyNear||sellBreak||sellNear,buyMom||sellMom,(type==='BUY'?extBuy:extSell)<=C.maxExtAtr].filter(Boolean).length;
 const rej=[];if(!atrOK)rej.push('volatilidade fora da faixa');if(!bodyOK)rej.push('candle fraco');if(!buyTrend&&!sellTrend)rej.push('tendência M3/M5/M15 sem alinhamento');if(!(buyBreak||buyNear||sellBreak||sellNear))rej.push('sem breakout/pullback confirmado');if(!buyMom&&!sellMom)rej.push('RSI sem momentum');
 return{type,score:passed,confidence:type==='WAIT'?0:Math.min(95,72+passed*4),price,rsi:R,ema20:e20,ema50:e50,ema200:e200,atr:A,support:S.support,resistance:S.resistance,trend3:t3,trend5:t5,trend15:t15,trend1:t1,sl:sl==null?null:round(sl),tp:tp==null?null:round(tp),rr:rr==null?null:rr,reasons:type==='BUY'?["M3/M5/M15 favoráveis",buyBreak?'breakout fechado':'pullback EMA20',"H1 não contrário","EMA alinhada","RSI/ATR aprovados"]:type==='SELL'?["M3/M5/M15 favoráveis",sellBreak?'breakdown fechado':'pullback EMA20',"H1 não contrário","EMA alinhada","RSI/ATR aprovados"]:[],rejectionReasons:rej,source:'candles reais fechados',filters:{marketIsTradable:atrOK,bodyIsDecisive:bodyOK,buyTrend,sellTrend,buyBreakout:buyBreak,sellBreakdown:sellBreak,buyMomentum:buyMom,sellMomentum:sellMom,buyEntryIsControlled:extBuy<=C.maxExtAtr,sellEntryIsControlled:extSell<=C.maxExtAtr,technicalPass:atrOK&&bodyOK,m3Buy:t3==='ALTA',m3Sell:t3==='BAIXA'}};
}
root.RBGoldSniper=Object.assign(root.RBGoldSniper||{},{CONFIG:C,sma,ema,rsi,atr,trend,priorStructure:structure,analyze});
})(globalThis);