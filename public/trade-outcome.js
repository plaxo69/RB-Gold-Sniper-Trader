(function(root){
  function resolveTradeOutcome(type, sl, tp, candles) {
    if (!['BUY','SELL'].includes(type) || !Number.isFinite(Number(sl)) || !Number.isFinite(Number(tp))) return null;
    const input=Array.isArray(candles)?candles:[];
    const parseTime=v=>{if(v==null)return NaN;if(typeof v==='number')return v<1e12?v*1000:v;const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;return Date.parse(v)};
    const ordered=input.every(c=>Number.isFinite(parseTime(c?.timestamp)))
      ? [...input].sort((a,b)=>parseTime(a.timestamp)-parseTime(b.timestamp))
      : input;
    for (const candle of ordered) {
      const high=Number(candle?.high), low=Number(candle?.low);
      if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
      const hitTP=type==='BUY' ? high>=Number(tp) : low<=Number(tp);
      const hitSL=type==='BUY' ? low<=Number(sl) : high>=Number(sl);
      if (hitTP && hitSL) return {result:'LOSS', when:candle.timestamp||null, reason:'TP e SL tocados no mesmo candle; resultado conservador = LOSS'};
      if (hitTP) return {result:'WIN', when:candle.timestamp||null, reason:'TP atingido'};
      if (hitSL) return {result:'LOSS', when:candle.timestamp||null, reason:'SL atingido'};
    }
    return null;
  }
  root.RBTradeOutcome=Object.assign(root.RBTradeOutcome||{}, {resolveTradeOutcome});
})(globalThis);
