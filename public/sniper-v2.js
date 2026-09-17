(function(root){
const C={period:20,minHistory:205,minRR:2,minBodyAtr:.05,maxExtAtr:3.2,zoneAtr:.35,retestAtr:.55,reversalWickBody:.85,tacticalLookback:7,minTFAligned:1};
const sma=(v,p)=>v.length<p?null:v.slice(-p).reduce((a,b)=>a+b,0)/p;
function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let x=v[0];for(let i=1;i<v.length;i++)x=v[i]*k+x*(1-k);return x}
function rsi(v,p=14){if(v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function atr(c,p=14){if(c.length<p+1)return null;const r=[];for(let i=1;i<c.length;i++){const x=c[i],q=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-q),Math.abs(x.low-q)))}return sma(r,p)}
function trend(c){const v=c.map(x=>x.close),f=ema(v,20),s=ema(v,50);if(f==null||s==null)return'LATERAL';const last=v.at(-1),prev=v.at(-4);if(last>f&&f>=s&&f>=prev)return'ALTA';if(last<f&&f<=s&&f<=prev)return'BAIXA';return last>f?'ALTA':last<f?'BAIXA':'LATERAL'}
function structure(c,p=C.period){const x=c.slice(-(p+1),-1);return x.length<p?null:{support:Math.min(...x.map(a=>a.low)),resistance:Math.max(...x.map(a=>a.high))}}
function round(v){return Number(v.toFixed(2))}
function rejection(sig){const body=Math.abs(sig.close-sig.open),range=Math.max(sig.high-sig.low,1e-9),lower=Math.min(sig.open,sig.close)-sig.low,upper=sig.high-Math.max(sig.open,sig.close);return{bull:sig.close>sig.open&&lower>=Math.max(body*C.reversalWickBody,range*.20)&&sig.close>=sig.low+range*.55,bear:sig.close<sig.open&&upper>=Math.max(body*C.reversalWickBody,range*.20)&&sig.close<=sig.high-range*.55}}
function structureSignal(c,p=12){const x=c.slice(-(p+1));if(x.length<p+1)return{bosBuy:false,bosSell:false,chochBuy:false,chochSell:false};const last=x.at(-1),prior=x.slice(0,-1),hi=Math.max(...prior.map(v=>v.high)),lo=Math.min(...prior.map(v=>v.low));const mid=Math.floor(prior.length/2),left=prior.slice(0,mid),right=prior.slice(mid);const leftHi=Math.max(...left.map(v=>v.high)),rightHi=Math.max(...right.map(v=>v.high)),leftLo=Math.min(...left.map(v=>v.low)),rightLo=Math.min(...right.map(v=>v.low));return{bosBuy:last.close>hi,bosSell:last.close<lo,chochBuy:last.close>rightHi&&rightLo<leftLo,chochSell:last.close<rightLo&&rightHi>leftHi}}
function recentEvent(c,dir,lookback=C.tacticalLookback){const end=c.length-1,start=Math.max(20,end-lookback);for(let i=end-1;i>=start;i--){const before=c.slice(Math.max(0,i-C.period),i);if(before.length<C.period)continue;const level=dir==='BUY'?Math.max(...before.map(x=>x.high)):Math.min(...before.map(x=>x.low));const prev=c[i-1],x=c[i];if(dir==='BUY'&&x.close>level&&prev.close<=level)return{index:i,level,type:'BREAKOUT'};if(dir==='SELL'&&x.close<level&&prev.close>=level)return{index:i,level,type:'BREAKDOWN'}}return null}
function tactical(c,dir,S,A,sig,prev){const rej=rejection(sig),tol=A*C.zoneAtr;const level=dir==='BUY'?S.resistance:S.support;const direct=dir==='BUY'?sig.close>level&&prev.close<=level:sig.close<level&&prev.close>=level;const near=dir==='BUY'?sig.low<=level+tol&&sig.close>level&&rej.bull:sig.high>=level-tol&&sig.close<level&&rej.bear;const ev=recentEvent(c,dir);let retest=false,continuation=false;if(ev&&ev.index<c.length-1){const since=c.slice(ev.index+1);if(since.length){if(dir==='BUY'){retest=sig.low<=ev.level+A*C.retestAtr&&sig.close>ev.level&&rej.bull;const above=since.slice(0,-1).filter(x=>x.close>ev.level).length>=Math.min(2,since.length-1);continuation=above&&sig.close>Math.max(...since.slice(0,-1).map(x=>x.high))}else{retest=sig.high>=ev.level-A*C.retestAtr&&sig.close<ev.level&&rej.bear;const below=since.slice(0,-1).filter(x=>x.close<ev.level).length>=Math.min(2,since.length-1);continuation=below&&sig.close<Math.min(...since.slice(0,-1).map(x=>x.low))}}}return{direct,near,retest,continuation,event:ev,level}}
function analyze(main,m3,m5,m15,h1){
 if(![main,m3,m5,m15,h1].every(Array.isArray)||main.length<C.minHistory||m3.length<55||m5.length<55||m15.length<55||h1.length<55)return null;
 const closed=main.slice(0,-1),sig=closed.at(-1),prev=closed.at(-2),forming=main.at(-1),cl=closed.map(x=>x.close),price=main.at(-1).close;
 const e20=ema(cl,20),e50=ema(cl,50),e200=ema(cl,200),R=rsi(cl),prevR=rsi(cl.slice(0,-1)),A=atr(closed),S=structure(closed);if([e20,e50,e200,R,A].some(x=>x==null)||!S)return null;
 const t3=trend(m3.slice(0,-1)),t5=trend(m5.slice(0,-1)),t15=trend(m15.slice(0,-1)),t1=trend(h1.slice(0,-1));
 const ms=structureSignal(closed),rej=rejection(sig),tb=tactical(closed,'BUY',S,A,sig,prev),ts=tactical(closed,'SELL',S,A,sig,prev);
 const bull=[t3==='ALTA',t5==='ALTA',t15==='ALTA'].filter(Boolean).length,bear=[t3==='BAIXA',t5==='BAIXA',t15==='BAIXA'].filter(Boolean).length;
 const buyTF=bull>=C.minTFAligned&&t1!=='BAIXA',sellTF=bear>=C.minTFAligned&&t1!=='ALTA';
 const body=Math.abs(sig.close-sig.open),bodyOK=body>=A*C.minBodyAtr,atrOK=A/Math.max(sig.close,1)>=0.000015&&A/Math.max(sig.close,1)<=0.012;
 const buyRSI=R>=25&&R<=82,sellRSI=R>=18&&R<=75;
 const buyStructure=tb.direct||tb.near||tb.retest||tb.continuation||ms.bosBuy||ms.chochBuy;
 const sellStructure=ts.direct||ts.near||ts.retest||ts.continuation||ms.bosSell||ms.chochSell;
 // O filtro é menos rigoroso, mas a entrada NUNCA nasce apenas de momentum: tem de existir um evento táctico de preço.
 const buySetup=buyTF&&buyRSI&&atrOK&&buyStructure;
 const sellSetup=sellTF&&sellRSI&&atrOK&&sellStructure;
 const type=bodyOK&&buySetup?'BUY':bodyOK&&sellSetup?'SELL':'WAIT';
 let sl=null,tp=null,rr=null;
 if(type==='BUY'){const tacticalLow=Math.min(sig.low,S.support);sl=Math.min(tacticalLow-A*.20,e20-A*.15);const risk=price-sl;if(risk>0){tp=price+Math.max(risk*C.minRR,A*2);rr=(tp-price)/risk}}
 if(type==='SELL'){const tacticalHigh=Math.max(sig.high,S.resistance);sl=Math.max(tacticalHigh+A*.20,e20+A*.15);const risk=sl-price;if(risk>0){tp=price-Math.max(risk*C.minRR,A*2);rr=(price-tp)/risk}}
 const validRisk=Number.isFinite(rr)&&rr>=C.minRR&&Number.isFinite(tp)&&Number.isFinite(sl),finalType=validRisk?type:'WAIT';
 const tacticalBuy=tb.direct?'BREAKOUT FECHADO':tb.retest?'PULLBACK/RETESTE + REJEIÇÃO':tb.continuation?'BREAKOUT + CONTINUAÇÃO':tb.near?'REJEIÇÃO/DEFESA DA RESISTÊNCIA':ms.bosBuy?'BOS COMPRADOR':ms.chochBuy?'CHOCH COMPRADOR':null;
 const tacticalSell=ts.direct?'BREAKDOWN FECHADO':ts.retest?'RETESTE + REJEIÇÃO':ts.continuation?'BREAKDOWN + CONTINUAÇÃO':ts.near?'REJEIÇÃO DA RESISTÊNCIA':ms.bosSell?'BOS VENDEDOR':ms.chochSell?'CHOCH VENDEDOR':null;
 const setupPass=!!(tacticalBuy||tacticalSell),passed=[atrOK,bodyOK,buyTF||sellTF,buyRSI||sellRSI,setupPass].filter(Boolean).length;
 const rejReasons=[];if(!atrOK)rejReasons.push('volatilidade fora da faixa');if(!bodyOK)rejReasons.push('candle de confirmação demasiado fraca');if(!buyTF&&!sellTF)rejReasons.push('M3/M5/M15 sem alinhamento suficiente');if(!buyRSI&&!sellRSI)rejReasons.push('RSI fora da faixa');if(!setupPass)rejReasons.push('sem sequência táctica de preço');
 const formingR=rsi(main.map(x=>x.close));
 const armedBuy=tb.direct||tb.near||tb.retest||tb.continuation||forming.close>S.resistance||forming.low<=S.resistance+A*C.zoneAtr;
 const armedSell=ts.direct||ts.near||ts.retest||ts.continuation||forming.close<S.support||forming.high>=S.support-A*C.zoneAtr;
 const armed=armedBuy&&!armedSell?'BUY':armedSell&&!armedBuy?'SELL':null;
 const reasons=finalType==='BUY'?[tacticalBuy||'estrutura compradora',bull>=2?'M3/M5/M15 maioritariamente compradores':'confirmação multi-timeframe mínima','H1 não contrário','RSI dentro da zona operacional','RR 1:2+']:finalType==='SELL'?[tacticalSell||'estrutura vendedora',bear>=2?'M3/M5/M15 maioritariamente vendedores':'confirmação multi-timeframe mínima','H1 não contrário','RSI dentro da zona operacional','RR 1:2+']:[];
 return{type:finalType,score:passed,confidence:finalType==='WAIT'?0:68+passed*5,price,signalTimestamp:sig.timestamp||null,rsi:R,ema20:e20,ema50:e50,ema200:e200,atr:A,support:S.support,resistance:S.resistance,trend3:t3,trend5:t5,trend15:t15,trend1:t1,sl:sl==null?null:round(sl),tp:tp==null?null:round(tp),rr:rr==null?null:rr,reasons,rejectionReasons:rejReasons,setupState:armed?'ARMADO':'SEM SETUP',armedDirection:armed,formingPrice:forming.close,formingRsi:Number.isFinite(formingR)?formingR:null,tactical:{buy:tacticalBuy,sell:tacticalSell,buyLevel:tb.level,sellLevel:ts.level,buyEvent:tb.event,sellEvent:ts.event},source:'candles reais fechados',filters:{marketIsTradable:atrOK,bodyIsDecisive:bodyOK,buyTrend:buyTF,sellTrend:sellTF,buyBreakout:tb.direct,sellBreakdown:ts.direct,buyPullback:tb.retest,sellRetest:ts.retest,buyContinuation:tb.continuation,sellContinuation:ts.continuation,reversalBuy:tb.near,reversalSell:ts.near,bosBuy:ms.bosBuy,bosSell:ms.bosSell,chochBuy:ms.chochBuy,chochSell:ms.chochSell,bosConfirmed:finalType==='BUY'?ms.bosBuy:finalType==='SELL'?ms.bosSell:false,chochConfirmed:finalType==='BUY'?ms.chochBuy:finalType==='SELL'?ms.chochSell:false,technicalPass:atrOK&&bodyOK,m3Buy:t3==='ALTA',m3Sell:t3==='BAIXA'}};
}
root.RBGoldSniper=Object.assign(root.RBGoldSniper||{},{CONFIG:C,sma,ema,rsi,atr,trend,priorStructure:structure,structureSignal,analyze});
})(globalThis);
