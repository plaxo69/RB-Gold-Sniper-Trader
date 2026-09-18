(function(root){
const C={period:20,minHistory:205,minRR:2,minBodyAtr:.18,maxExtAtr:3.2,zoneAtr:.35,retestAtr:.55,reversalWickBody:.85,tacticalLookback:12,minTFAligned:2,minCloseLocation:.62,minBreakAtr:.15};
const sma=(v,p)=>v.length<p?null:v.slice(-p).reduce((a,b)=>a+b,0)/p;
function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let x=v[0];for(let i=1;i<v.length;i++)x=v[i]*k+x*(1-k);return x}
function rsi(v,p=14){if(v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function atr(c,p=14){if(c.length<p+1)return null;const r=[];for(let i=1;i<c.length;i++){const x=c[i],q=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-q),Math.abs(x.low-q)))}return sma(r,p)}
function trend(c){const v=c.map(x=>x.close),f=ema(v,20),s=ema(v,50);if(f==null||s==null)return'LATERAL';const last=v.at(-1),prev=v.at(-4);if(last>f&&f>=s&&f>=prev)return'ALTA';if(last<f&&f<=s&&f<=prev)return'BAIXA';return last>f?'ALTA':last<f?'BAIXA':'LATERAL'}
function structure(c,p=C.period){const x=c.slice(-(p+1),-1);return x.length<p?null:{support:Math.min(...x.map(a=>a.low)),resistance:Math.max(...x.map(a=>a.high))}}
function round(v){return Number(v.toFixed(2))}
function rejection(sig){const body=Math.abs(sig.close-sig.open),range=Math.max(sig.high-sig.low,1e-9),lower=Math.min(sig.open,sig.close)-sig.low,upper=sig.high-Math.max(sig.open,sig.close);return{bull:sig.close>sig.open&&lower>=Math.max(body*C.reversalWickBody,range*.20)&&sig.close>=sig.low+range*.55,bear:sig.close<sig.open&&upper>=Math.max(body*C.reversalWickBody,range*.20)&&sig.close<=sig.high-range*.55}}
function structureSignal(c,p=12){const x=c.slice(-(p+1));if(x.length<p+1)return{bosBuy:false,bosSell:false,chochBuy:false,chochSell:false};const last=x.at(-1),prior=x.slice(0,-1),hi=Math.max(...prior.map(v=>v.high)),lo=Math.min(...prior.map(v=>v.low));const mid=Math.floor(prior.length/2),left=prior.slice(0,mid),right=prior.slice(mid);const leftHi=Math.max(...left.map(v=>v.high)),rightHi=Math.max(...right.map(v=>v.high)),leftLo=Math.min(...left.map(v=>v.low)),rightLo=Math.min(...right.map(v=>v.low));return{bosBuy:last.close>hi,bosSell:last.close<lo,chochBuy:last.close>rightHi&&rightLo<leftLo,chochSell:last.close<rightLo&&rightHi>leftHi}}
function recentEvent(c,dir,lookback=C.tacticalLookback){const end=c.length-1,start=Math.max(C.period,end-lookback);for(let i=end-1;i>=start;i--){const before=c.slice(Math.max(0,i-C.period),i);if(before.length<C.period)continue;const level=dir==='BUY'?Math.max(...before.map(x=>x.high)):Math.min(...before.map(x=>x.low));const prev=c[i-1],x=c[i];if(dir==='BUY'&&x.close>level&&prev.close<=level)return{index:i,level,type:'BREAKOUT'};if(dir==='SELL'&&x.close<level&&prev.close>=level)return{index:i,level,type:'BREAKDOWN'}}return null}
function tactical(c,dir,S,A,sig,prev){
 const rej=rejection(sig),tol=A*C.zoneAtr,level=dir==='BUY'?S.resistance:S.support;
 const direct=dir==='BUY'?sig.close>level&&prev.close<=level:sig.close<level&&prev.close>=level;
 const near=dir==='BUY'?sig.low<=level+tol&&sig.close>level&&rej.bull:sig.high>=level-tol&&sig.close<level&&rej.bear;
 const ev=recentEvent(c,dir);
 let retest=false,continuation=false,retestIndex=null;
 if(ev&&ev.index<c.length-1){
   const after=c.slice(ev.index+1,-1);
   if(after.length){
     if(dir==='BUY'){
       const touchTol=A*C.retestAtr;
       for(let j=0;j<after.length;j++){
         const p=after[j];
         const touched=p.low<=ev.level+touchTol&&p.low>=ev.level-touchTol;
         const held=p.close>=ev.level-touchTol;
         if(touched&&held){
           const confirmAfter=after.slice(j+1);
           const pullbackHigh=Math.max(p.high,...confirmAfter.map(x=>x.high));
           const currentConfirm=sig.close>p.high&&sig.close>ev.level&&rej.bull;
           const currentTouch=sig.low<=ev.level+touchTol&&sig.close>ev.level&&rej.bull;
           retest=(currentConfirm||currentTouch)&&sig.close>pullbackHigh*0.999999;
           if(retest){retestIndex=ev.index+1+j;break}
         }
       }
       const priorHigh=Math.max(...after.map(x=>x.high));
       const held=after.every(x=>x.close>=ev.level-touchTol);
       continuation=held&&sig.close>priorHigh&&sig.close>ev.level;
     }else{
       const touchTol=A*C.retestAtr;
       for(let j=0;j<after.length;j++){
         const p=after[j];
         const touched=p.high>=ev.level-touchTol&&p.high<=ev.level+touchTol;
         const held=p.close<=ev.level+touchTol;
         if(touched&&held){
           const confirmAfter=after.slice(j+1);
           const pullbackLow=Math.min(p.low,...confirmAfter.map(x=>x.low));
           const currentConfirm=sig.close<p.low&&sig.close<ev.level&&rej.bear;
           const currentTouch=sig.high>=ev.level-touchTol&&sig.close<ev.level&&rej.bear;
           retest=(currentConfirm||currentTouch)&&sig.close<pullbackLow*1.000001;
           if(retest){retestIndex=ev.index+1+j;break}
         }
       }
       const priorLow=Math.min(...after.map(x=>x.low));
       const held=after.every(x=>x.close<=ev.level+touchTol);
       continuation=held&&sig.close<priorLow&&sig.close<ev.level;
     }
   }
 }
 return{direct,near,retest,continuation,event:ev,level,retestIndex}
}
function analyze(main,m5,m15,h1){
 if(![main,m5,m15,h1].every(Array.isArray)||main.length<C.minHistory||m5.length<55||m15.length<55||h1.length<55)return null;
 const closed=main.slice(0,-1),sig=closed.at(-1),prev=closed.at(-2),forming=main.at(-1),cl=closed.map(x=>x.close),entry=sig.close;
 const e20=ema(cl,20),e50=ema(cl,50),e200=ema(cl,200),R=rsi(cl),A=atr(closed),S=structure(closed);if([e20,e50,e200,R,A].some(x=>x==null)||!S)return null;
 const t5=trend(m5.slice(0,-1)),t15=trend(m15.slice(0,-1)),t1=trend(h1.slice(0,-1));
 const ms=structureSignal(closed),tb=tactical(closed,'BUY',S,A,sig,prev),ts=tactical(closed,'SELL',S,A,sig,prev);
 const bull=[t5==='ALTA',t15==='ALTA'].filter(Boolean).length,bear=[t5==='BAIXA',t15==='BAIXA'].filter(Boolean).length;
 const buyTF=bull>=C.minTFAligned&&bear===0&&t1!=='BAIXA',sellTF=bear>=C.minTFAligned&&bull===0&&t1!=='ALTA';
 const body=Math.abs(sig.close-sig.open),range=Math.max(sig.high-sig.low,1e-9),bodyOK=body>=A*C.minBodyAtr;
 const closePos=(sig.close-sig.low)/range,closeQualityBuy=closePos>=C.minCloseLocation,closeQualitySell=closePos<=1-C.minCloseLocation;
 const emaBuy=entry>e200,emaSell=entry<e200,extensionBuy=(entry-e20)/Math.max(A,1e-9)<=C.maxExtAtr,extensionSell=(e20-entry)/Math.max(A,1e-9)<=C.maxExtAtr;
 const directBuyQuality=!tb.direct||((sig.close-tb.level)>=A*C.minBreakAtr&&closeQualityBuy),directSellQuality=!ts.direct||((ts.level-sig.close)>=A*C.minBreakAtr&&closeQualitySell);
 const buyRSI=R>50&&R<=72,sellRSI=R>=28&&R<50,atrOK=A/Math.max(entry,1)>=0.000015&&A/Math.max(entry,1)<=0.012;
 const tacticalBuy=tb.direct&&directBuyQuality?'BREAKOUT FECHADO':tb.retest&&closeQualityBuy?'PULLBACK/RETESTE + REJEIÇÃO':tb.continuation&&closeQualityBuy?'BREAKOUT + CONTINUAÇÃO':tb.near&&closeQualityBuy?'REJEIÇÃO/DEFESA DA RESISTÊNCIA':null;
 const tacticalSell=ts.direct&&directSellQuality?'BREAKDOWN FECHADO':ts.retest&&closeQualitySell?'RETESTE + REJEIÇÃO':ts.continuation&&closeQualitySell?'BREAKDOWN + CONTINUAÇÃO':ts.near&&closeQualitySell?'REJEIÇÃO/DEFESA DO SUPORTE':null;
 const bosBuyConfirm=ms.bosBuy||ms.chochBuy,bosSellConfirm=ms.bosSell||ms.chochSell,buyStructuralConfirm=bosBuyConfirm||!!tb.direct||!!tb.retest||!!tb.continuation,sellStructuralConfirm=bosSellConfirm||!!ts.direct||!!ts.retest||!!ts.continuation;
 const buySetup=buyTF&&emaBuy&&extensionBuy&&buyRSI&&atrOK&&!!tacticalBuy&&buyStructuralConfirm,sellSetup=sellTF&&emaSell&&extensionSell&&sellRSI&&atrOK&&!!tacticalSell&&sellStructuralConfirm,bothSetup=buySetup&&sellSetup;
 const type=!bothSetup&&bodyOK&&buySetup?'BUY':!bothSetup&&bodyOK&&sellSetup?'SELL':'WAIT';let sl=null,tp=null,rr=null;
 if(type==='BUY'){const tacticalLow=Math.min(sig.low,S.support);sl=Math.min(tacticalLow-A*.20,e20-A*.15);const risk=entry-sl;if(risk>0){tp=entry+Math.max(risk*C.minRR,A*2);rr=(tp-entry)/risk}}
 if(type==='SELL'){const tacticalHigh=Math.max(sig.high,S.resistance);sl=Math.max(tacticalHigh+A*.20,e20+A*.15);const risk=sl-entry;if(risk>0){tp=entry-Math.max(risk*C.minRR,A*2);rr=(entry-tp)/risk}}
 const validRisk=Number.isFinite(rr)&&rr>=C.minRR&&Number.isFinite(tp)&&Number.isFinite(sl),finalType=validRisk?type:'WAIT';
 const directionalPass=finalType==='BUY'?(buyTF&&emaBuy&&extensionBuy&&buyRSI):finalType==='SELL'?(sellTF&&emaSell&&extensionSell&&sellRSI):(buyTF&&emaBuy&&extensionBuy&&buyRSI)||(sellTF&&emaSell&&extensionSell&&sellRSI),setupPass=finalType==='BUY'?buyStructuralConfirm:finalType==='SELL'?sellStructuralConfirm:!!(tacticalBuy||tacticalSell);
 const qualityParts=[atrOK,bodyOK,directionalPass,setupPass,(finalType==='BUY'?closeQualityBuy&&directBuyQuality:finalType==='SELL'?closeQualitySell&&directSellQuality:true),validRisk],passed=qualityParts.filter(Boolean).length,rejReasons=[];
 if(!atrOK)rejReasons.push('volatilidade fora da faixa');if(!bodyOK)rejReasons.push('candle de confirmação demasiado fraca');if(!buyTF&&!sellTF)rejReasons.push('M5/M15 sem alinhamento');if(finalType==='BUY'&&!emaBuy)rejReasons.push('preço abaixo da EMA200');if(finalType==='SELL'&&!emaSell)rejReasons.push('preço acima da EMA200');if(finalType==='BUY'&&!extensionBuy)rejReasons.push('BUY demasiado esticado da EMA20');if(finalType==='SELL'&&!extensionSell)rejReasons.push('SELL demasiado esticado da EMA20');if(!buyRSI&&!sellRSI)rejReasons.push('RSI sem momentum direcional');if(!setupPass)rejReasons.push('sem confirmação estrutural BOS/CHOCH ou breakout/reteste');if(tacticalBuy&&(!closeQualityBuy||!directBuyQuality))rejReasons.push('breakout BUY sem força/fecho suficiente');if(tacticalSell&&(!closeQualitySell||!directSellQuality))rejReasons.push('breakdown SELL sem força/fecho suficiente');if(bothSetup)rejReasons.push('BUY e SELL simultaneamente — sinal ambíguo');if(!validRisk)rejReasons.push('RR inferior a 1:2');
 const formingR=rsi(main.map(x=>x.close)),tol=A*C.zoneAtr,armedBuy=!!tacticalBuy||((forming.high>=S.resistance-tol)&&(forming.close<=S.resistance+A*C.retestAtr)),armedSell=!!tacticalSell||((forming.low<=S.support+tol)&&(forming.close>=S.support-A*C.retestAtr)),armed=armedBuy&&!armedSell?'BUY':armedSell&&!armedBuy?'SELL':null;
 const reasons=finalType==='BUY'?[tacticalBuy,'M5 + M15 alinhados','H1 não contrário','preço acima da EMA200','RSI > 50','fecho do M1 com força','confirmação estrutural','RR 1:2+']:finalType==='SELL'?[tacticalSell,'M5 + M15 alinhados','H1 não contrário','preço abaixo da EMA200','RSI < 50','fecho do M1 com força','confirmação estrutural','RR 1:2+']:[];
 return{type:finalType,score:passed,confidence:finalType==='WAIT'?0:70+passed*4,price:entry,signalTimestamp:sig.timestamp||null,rsi:R,ema20:e20,ema50:e50,ema200:e200,atr:A,support:S.support,resistance:S.resistance,trend5:t5,trend15:t15,trend1:t1,sl:sl==null?null:round(sl),tp:tp==null?null:round(tp),rr:rr==null?null:rr,reasons,rejectionReasons:rejReasons,setupState:armed?'ARMADO':'SEM SETUP',armedDirection:armed,formingPrice:forming.close,formingRsi:Number.isFinite(formingR)?formingR:null,tactical:{buy:tacticalBuy,sell:tacticalSell,buyLevel:tb.level,sellLevel:ts.level,buyEvent:tb.event,sellEvent:ts.event,buyRetestIndex:tb.retestIndex,sellRetestIndex:ts.retestIndex,bosBuy:ms.bosBuy,chochBuy:ms.chochBuy,bosSell:ms.bosSell,chochSell:ms.chochSell,buyStructuralConfirm,sellStructuralConfirm},source:'candles reais fechados',filters:{marketIsTradable:atrOK,bodyIsDecisive:bodyOK,buyTrend:buyTF,sellTrend:sellTF,ema200Buy:emaBuy,ema200Sell:emaSell,extensionBuy,extensionSell,buyBreakout:tb.direct&&directBuyQuality,sellBreakdown:ts.direct&&directSellQuality,buyPullback:tb.retest,sellRetest:ts.retest,buyContinuation:tb.continuation,sellContinuation:ts.continuation,reversalBuy:tb.near&&closeQualityBuy,reversalSell:ts.near&&closeQualitySell,bosBuy:ms.bosBuy,bosSell:ms.bosSell,chochBuy:ms.chochBuy,chochSell:ms.chochSell,bosConfirmed:bosBuyConfirm,chochConfirmed:ms.chochBuy||ms.chochSell,structuralConfirmBuy:buyStructuralConfirm,structuralConfirmSell:sellStructuralConfirm,technicalPass:atrOK&&bodyOK,m5Buy:t5==='ALTA',m5Sell:t5==='BAIXA',m15Buy:t15==='ALTA',m15Sell:t15==='BAIXA',h1Buy:t1==='ALTA',h1Sell:t1==='BAIXA',closeQualityBuy,closeQualitySell,directBreakQualityBuy:directBuyQuality,directBreakQualitySell:directSellQuality}};
}
root.RBGoldSniper=Object.assign(root.RBGoldSniper||{},{CONFIG:C,sma,ema,rsi,atr,trend,priorStructure:structure,structureSignal,analyze});
})(globalThis);
