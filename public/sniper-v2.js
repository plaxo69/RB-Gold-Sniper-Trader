(function(root){
const C={period:20,minHistory:205,minRR:2,minBodyAtr:.10,maxExtAtr:2.6,reversalSupportAtr:1.8,reversalWickBody:1.05,structureLookback:12};
const sma=(v,p)=>v.length<p?null:v.slice(-p).reduce((a,b)=>a+b,0)/p;
function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let x=v[0];for(let i=1;i<v.length;i++)x=v[i]*k+x*(1-k);return x}
function rsi(v,p=14){if(v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function atr(c,p=14){if(c.length<p+1)return null;const r=[];for(let i=1;i<c.length;i++){const x=c[i],q=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-q),Math.abs(x.low-q)))}return sma(r,p)}
function trend(c){const v=c.map(x=>x.close),f=ema(v,20),s=ema(v,50);if(f==null||s==null)return'LATERAL';const last=v.at(-1),prev=v.at(-4);if(last>f&&f>=s&&f>=prev)return'ALTA';if(last<f&&f<=s&&f<=prev)return'BAIXA';return last>f?'ALTA':last<f?'BAIXA':'LATERAL'}
function structure(c,p=C.period){const x=c.slice(-(p+1),-1);return x.length<p?null:{support:Math.min(...x.map(a=>a.low)),resistance:Math.max(...x.map(a=>a.high))}}
function round(v){return Number(v.toFixed(2))}
function rejection(sig){const body=Math.abs(sig.close-sig.open),range=Math.max(sig.high-sig.low,1e-9),lower=Math.min(sig.open,sig.close)-sig.low,upper=sig.high-Math.max(sig.open,sig.close);return{bull:sig.close>sig.open&&lower>=Math.max(body*C.reversalWickBody,range*.25)&&sig.close>=sig.low+range*.55,bear:sig.close<sig.open&&upper>=Math.max(body*C.reversalWickBody,range*.25)&&sig.close<=sig.high-range*.55}}
function structureSignal(c,p=C.structureLookback){const x=c.slice(-(p+1),-1);if(x.length<p+1)return{bosBuy:false,bosSell:false,chochBuy:false,chochSell:false};const last=x.at(-1),prior=x.slice(0,-1),hi=Math.max(...prior.map(v=>v.high)),lo=Math.min(...prior.map(v=>v.low));const mid=Math.floor(prior.length/2),left=prior.slice(0,mid),right=prior.slice(mid);const leftHi=Math.max(...left.map(v=>v.high)),rightHi=Math.max(...right.map(v=>v.high)),leftLo=Math.min(...left.map(v=>v.low)),rightLo=Math.min(...right.map(v=>v.low));return{bosBuy:last.close>hi,bosSell:last.close<lo,chochBuy:last.close>rightHi&&rightLo<leftLo,chochSell:last.close<rightLo&&rightHi>leftHi}}
function analyze(main,m3,m5,m15,h1){
 if(![main,m3,m5,m15,h1].every(Array.isArray)||main.length<C.minHistory||m3.length<55||m5.length<55||m15.length<55||h1.length<55)return null;
 const closed=main.slice(0,-1),sig=closed.at(-1),prev=closed.at(-2),forming=main.at(-1),cl=closed.map(x=>x.close),price=main.at(-1).close;
 const e20=ema(cl,20),e50=ema(cl,50),e200=ema(cl,200),R=rsi(cl),prevR=rsi(cl.slice(0,-1)),A=atr(closed),S=structure(closed);if([e20,e50,e200,R,A].some(x=>x==null)||!S)return null;
 const t3=trend(m3.slice(0,-1)),t5=trend(m5.slice(0,-1)),t15=trend(m15.slice(0,-1)),t1=trend(h1.slice(0,-1));
 const ms=structureSignal(closed),rej=rejection(sig);
 const buyBreak=sig.close>S.resistance&&prev.close<=S.resistance,buyNear=sig.low<=e20+A*.45&&sig.close>e20&&sig.close>sig.open;
 const sellBreak=sig.close<S.support&&prev.close>=S.support,sellNear=sig.high>=e20-A*.45&&sig.close<e20&&sig.close<sig.open;
 const supportBounce=sig.low<=S.support+A*C.reversalSupportAtr&&sig.close>sig.open&&rej.bull&&R>=32&&R<=66&&Number.isFinite(prevR)&&R>prevR;
 const resistanceReject=sig.high>=S.resistance-A*C.reversalSupportAtr&&sig.close<sig.open&&rej.bear&&R>=34&&R<=68&&Number.isFinite(prevR)&&R<prevR;
 const bull=[t3==='ALTA',t5==='ALTA',t15==='ALTA'].filter(Boolean).length,bear=[t3==='BAIXA',t5==='BAIXA',t15==='BAIXA'].filter(Boolean).length;
 const buyTrend=bull>=2&&t1!=='BAIXA'&&price>e20&&e20>=e50&&e50>=e200;
 const sellTrend=bear>=2&&t1!=='ALTA'&&price<e20&&e20<=e50&&e50<=e200;
 const momentumBuy=bull>=1&&t1!=='BAIXA'&&price>e20&&sig.close>prev.close&&R>=48&&R<=78;
 const momentumSell=bear>=1&&t1!=='ALTA'&&price<e20&&sig.close<prev.close&&R>=22&&R<=55;
 const reversalBuy=bull>=1&&t1!=='BAIXA'&&supportBounce;
 const reversalSell=bear>=1&&t1!=='ALTA'&&resistanceReject;
 const bosBuyConfirm=ms.bosBuy||buyBreak,bosSellConfirm=ms.bosSell||sellBreak;
 const chochBuyConfirm=ms.chochBuy||reversalBuy,chochSellConfirm=ms.chochSell||reversalSell;
 const structureBuy=bosBuyConfirm||chochBuyConfirm,structureSell=bosSellConfirm||chochSellConfirm;
 const body=Math.abs(sig.close-sig.open),bodyOK=body>=A*C.minBodyAtr,atrOK=A/Math.max(sig.close,1)>=0.00002&&A/Math.max(sig.close,1)<=0.012;
 const buyMom=R>=32&&R<=80,sellMom=R>=20&&R<=68,extBuy=(sig.close-e20)/A,extSell=(e20-sig.close)/A;
 const buySetup=(buyTrend&&buyMom&&extBuy<=C.maxExtAtr&&(buyBreak||buyNear||structureBuy))||momentumBuy||reversalBuy;
 const sellSetup=(sellTrend&&sellMom&&extSell<=C.maxExtAtr&&(sellBreak||sellNear||structureSell))||momentumSell||reversalSell;
 const type=bodyOK&&atrOK&&buySetup?'BUY':bodyOK&&atrOK&&sellSetup?'SELL':'WAIT';
 let sl=null,tp=null,rr=null;
 if(type==='BUY'){sl=Math.min(sig.low-A*.25,S.support-A*.15);const risk=price-sl;if(risk>0){tp=price+Math.max(risk*C.minRR,A*2);rr=(tp-price)/risk}}
 if(type==='SELL'){sl=Math.max(sig.high+A*.25,S.resistance+A*.15);const risk=sl-price;if(risk>0){tp=price-Math.max(risk*C.minRR,A*2);rr=(price-tp)/risk}}
 const validRisk=Number.isFinite(rr)&&rr>=C.minRR&&Number.isFinite(tp)&&Number.isFinite(sl),finalType=validRisk?type:'WAIT';
 const setupPass=buyBreak||sellBreak||buyNear||sellNear||supportBounce||resistanceReject||ms.bosBuy||ms.bosSell||ms.chochBuy||ms.chochSell||momentumBuy||momentumSell;
 const passed=[atrOK,bodyOK,buyTrend||sellTrend||momentumBuy||momentumSell||reversalBuy||reversalSell,setupPass,buyMom||sellMom,(type==='BUY'?extBuy:extSell)<=C.maxExtAtr].filter(Boolean).length;
 const rejReasons=[];if(!atrOK)rejReasons.push('volatilidade fora da faixa');if(!bodyOK)rejReasons.push('candle fraco');if(!buyTrend&&!sellTrend&&!momentumBuy&&!momentumSell&&!reversalBuy&&!reversalSell)rejReasons.push('sem direção confirmada');if(!setupPass)rejReasons.push('sem breakout/pullback/BOS/CHOCH/rejeição');if(!buyMom&&!sellMom)rejReasons.push('RSI sem momentum');
 const formingBody=Math.abs(forming.close-forming.open),formingRange=Math.max(forming.high-forming.low,1e-9),formingR=rsi(main.map(x=>x.close));
 const armedBuy=forming.close>S.resistance||forming.high>S.resistance|| (forming.low<=e20+A*.45&&forming.close>e20&&forming.close>forming.open);
 const armedSell=forming.close<S.support||forming.low<S.support|| (forming.high>=e20-A*.45&&forming.close<e20&&forming.close<forming.open);
 const armed=armedBuy&&!armedSell?'BUY':armedSell&&!armedBuy?'SELL':null;
 const reasons=finalType==='BUY'?["M1 confirmou movimento comprador",ms.bosBuy?'BOS comprador':ms.chochBuy?'CHOCH comprador':buyBreak?'breakout fechado':buyNear?'pullback EMA20':reversalBuy?'rejeição de suporte + RSI a recuperar':'momentum comprador',"RSI + estrutura confirmados","H1 não contrário","gestão RR 1:2+"]:finalType==='SELL'?["M1 confirmou movimento vendedor",ms.bosSell?'BOS vendedor':ms.chochSell?'CHOCH vendedor':sellBreak?'breakdown fechado':sellNear?'pullback EMA20':reversalSell?'rejeição de resistência + RSI a perder força':'momentum vendedor',"RSI + estrutura confirmados","H1 não contrário","gestão RR 1:2+"]:[];
 return{type:finalType,score:passed,confidence:finalType==='WAIT'?0:Math.min(95,72+passed*4),price,signalTimestamp:sig.timestamp||null,rsi:R,ema20:e20,ema50:e50,ema200:e200,atr:A,support:S.support,resistance:S.resistance,trend3:t3,trend5:t5,trend15:t15,trend1:t1,sl:sl==null?null:round(sl),tp:tp==null?null:round(tp),rr:rr==null?null:rr,reasons,rejectionReasons:rejReasons,setupState:armed?'ARMADO':'SEM SETUP',armedDirection:armed,formingPrice:forming.close,formingRsi:Number.isFinite(formingR)?formingR:null,source:'candles reais fechados',filters:{marketIsTradable:atrOK,bodyIsDecisive:bodyOK,buyTrend,sellTrend,buyBreakout:buyBreak,sellBreakdown:sellBreak,buyMomentum:buyMom,sellMomentum:sellMom,buyEntryIsControlled:extBuy<=C.maxExtAtr,sellEntryIsControlled:extSell<=C.maxExtAtr,reversalBuy,reversalSell,supportBounce,resistanceReject,momentumBuy,momentumSell,bosBuy:ms.bosBuy,bosSell:ms.bosSell,chochBuy:ms.chochBuy,chochSell:ms.chochSell,bosConfirmed:finalType==='BUY'?bosBuyConfirm:finalType==='SELL'?bosSellConfirm:false,chochConfirmed:finalType==='BUY'?chochBuyConfirm:finalType==='SELL'?chochSellConfirm:false,technicalPass:atrOK&&bodyOK,m3Buy:t3==='ALTA',m3Sell:t3==='BAIXA'}};
}
root.RBGoldSniper=Object.assign(root.RBGoldSniper||{},{CONFIG:C,sma,ema,rsi,atr,trend,priorStructure:structure,structureSignal,analyze});
})(globalThis);