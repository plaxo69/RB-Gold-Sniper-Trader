(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RBGoldSniper = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CONFIG = Object.freeze({ structurePeriod:20,minHistory:205,minRiskReward:2,minAtrPercent:0.00005,maxAtrPercent:0.006,minBodyAtr:0.25,maxEntryExtensionAtr:1.60 });
  function sma(v,p){if(v.length<p)return null;return v.slice(-p).reduce((a,b)=>a+b,0)/p}
  function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let x=v[0];for(let i=1;i<v.length;i++)x=v[i]*k+x*(1-k);return x}
  function rsi(v,p=14){if(v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}if(l===0)return 100;const rs=g/l;return 100-100/(1+rs)}
  function atr(c,p=14){if(c.length<p+1)return null;const r=[];for(let i=1;i<c.length;i++){const x=c[i],pc=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-pc),Math.abs(x.low-pc)))}return sma(r,p)}
  function trend(c){const v=c.map(x=>x.close),f=ema(v,20),s=ema(v,50),pf=ema(v.slice(0,-3),20),last=v.at(-1);if(f===null||s===null)return "LATERAL";if(last>f&&f>s&&pf!==null&&f>=pf)return "ALTA";if(last<f&&f<s&&pf!==null&&f<=pf)return "BAIXA";return "LATERAL"}
  function priorStructure(c,p=CONFIG.structurePeriod){const x=c.slice(-(p+1),-1);if(x.length<p)return null;return{support:Math.min(...x.map(a=>a.low)),resistance:Math.max(...x.map(a=>a.high))}}
  function rounded(v){return Number(v.toFixed(2))}
  function analyze(main,m3,m5,m15,h1){
    if(![main,m3,m5,m15,h1].every(Array.isArray)||main.length<CONFIG.minHistory||m3.length<55||m5.length<55||m15.length<55||h1.length<55)return null;
    const closed=main.slice(0,-1),signal=closed.at(-1),previous=closed.at(-2),closes=closed.map(c=>c.close),price=main.at(-1).close;
    const fast=ema(closes,20),slow=ema(closes,50),anchor=ema(closes,200),momentum=rsi(closes),volatility=atr(closed),levels=priorStructure(closed);
    if([fast,slow,anchor,momentum,volatility].some(v=>v===null)||!levels)return null;
    const trends={m3:trend(m3.slice(0,-1)),m5:trend(m5.slice(0,-1)),m15:trend(m15.slice(0,-1)),h1:trend(h1.slice(0,-1))};
    const atrPercent=volatility/signal.close,body=Math.abs(signal.close-signal.open),bodyIsDecisive=body>=volatility*CONFIG.minBodyAtr,marketIsTradable=atrPercent>=CONFIG.minAtrPercent&&atrPercent<=CONFIG.maxAtrPercent;
    const buyBreakout=signal.close>levels.resistance&&previous.close<=levels.resistance,sellBreakdown=signal.close<levels.support&&previous.close>=levels.support;
    const m3Buy=trends.m3==="ALTA",m3Sell=trends.m3==="BAIXA";
    const buyTrend=trends.m15==="ALTA"&&trends.m5==="ALTA"&&m3Buy&&trends.h1!=="BAIXA"&&signal.close>fast&&fast>slow&&slow>anchor;
    const sellTrend=trends.m15==="BAIXA"&&trends.m5==="BAIXA"&&m3Sell&&trends.h1!=="ALTA"&&signal.close<fast&&fast<slow&&slow<anchor;
    const buyMomentum=momentum>=50&&momentum<=78,sellMomentum=momentum>=22&&momentum<=50;
    const buyExtension=(signal.close-fast)/volatility,sellExtension=(fast-signal.close)/volatility,buyEntryIsControlled=buyExtension<=CONFIG.maxEntryExtensionAtr,sellEntryIsControlled=sellExtension<=CONFIG.maxEntryExtensionAtr;
    const technicalPass=marketIsTradable&&bodyIsDecisive&&((buyMomentum&&buyEntryIsControlled)||(sellMomentum&&sellEntryIsControlled));
    const buyPasses=technicalPass&&buyTrend&&buyBreakout&&buyMomentum&&buyEntryIsControlled,sellPasses=technicalPass&&sellTrend&&sellBreakdown&&sellMomentum&&sellEntryIsControlled;
    const type=buyPasses?"BUY":sellPasses?"SELL":"WAIT";
    const reasons=type==="BUY"?["M3/M5/M15 alinhados","H1 não contrário","EMA20 > EMA50 > EMA200","Breakout fechado","RSI válido","ATR/extensão aprovados"]:type==="SELL"?["M3/M5/M15 alinhados","H1 não contrário","EMA20 < EMA50 < EMA200","Breakdown fechado","RSI válido","ATR/extensão aprovados"]:[];
    const rejectionReasons=type==="WAIT"?[
      !marketIsTradable&&"ATR/volatilidade fora da faixa",
      !bodyIsDecisive&&"candle de confirmação fraco",
      !buyTrend&&!sellTrend&&"M3/M5/M15 sem alinhamento ou H1 contrário",
      !buyBreakout&&!sellBreakdown&&"sem breakout/breakdown fechado",
      !buyMomentum&&!sellMomentum&&"RSI sem momentum válido",
      !buyEntryIsControlled&&!sellEntryIsControlled&&"entrada demasiado estendida"
    ].filter(Boolean):[];
    let sl=null,tp=null,rr=null;
    if(type==="BUY"){sl=Math.min(levels.resistance-volatility*.35,signal.low-volatility*.2);const risk=price-sl;if(risk>0){tp=price+Math.max(risk*CONFIG.minRiskReward,volatility*2.5);rr=(tp-price)/risk}}
    if(type==="SELL"){sl=Math.max(levels.support+volatility*.35,signal.high+volatility*.2);const risk=sl-price;if(risk>0){tp=price-Math.max(risk*CONFIG.minRiskReward,volatility*2.5);rr=(price-tp)/risk}}
    const passed=[marketIsTradable,bodyIsDecisive,buyTrend||sellTrend,buyBreakout||sellBreakdown,buyMomentum||sellMomentum,buyEntryIsControlled||sellEntryIsControlled].filter(Boolean).length;
    return {type,score:passed,confidence:type==="WAIT"?0:Math.min(95,76+passed*3),price,rsi:momentum,ema20:fast,ema50:slow,ema200:anchor,atr:volatility,support:levels.support,resistance:levels.resistance,trend3:trends.m3,trend5:trends.m5,trend15:trends.m15,trend1:trends.h1,sl:sl===null||!Number.isFinite(sl)?null:rounded(sl),tp:tp===null||!Number.isFinite(tp)?null:rounded(tp),rr:rr===null||!Number.isFinite(rr)?null:rr,reasons,rejectionReasons,source:"candles reais fechados",filters:{marketIsTradable,bodyIsDecisive,buyTrend,sellTrend,buyBreakout,sellBreakdown,buyMomentum,sellMomentum,buyEntryIsControlled,sellEntryIsControlled,m3Buy,m3Sell,technicalPass}}
  }
  return {CONFIG,sma,ema,rsi,atr,trend,priorStructure,analyze};
});