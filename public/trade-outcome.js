(function(root){
  function resolveTradeOutcome(type, sl, tp, candles, entry) {
    if (!['BUY','SELL'].includes(type) || !Number.isFinite(Number(sl)) || !Number.isFinite(Number(tp))) return null;
    const input=Array.isArray(candles)?candles:[];
    const parseTime=v=>{if(v==null)return NaN;if(typeof v==='number')return v<1e12?v*1000:v;const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;return Date.parse(v)};
    const ordered=input.every(c=>Number.isFinite(parseTime(c?.timestamp)))
      ? [...input].sort((a,b)=>parseTime(a.timestamp)-parseTime(b.timestamp))
      : input;
    const hasEntry=Number.isFinite(Number(entry)),distance=Math.abs(Number(tp)-Number(entry));
    let beArmed=false,beArmedAt=null,beTriggerPrice=null;
    for (const candle of ordered) {
      const high=Number(candle?.high), low=Number(candle?.low);
      if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
      const hitTP=type==='BUY' ? high>=Number(tp) : low<=Number(tp);
      const hitSL=type==='BUY' ? low<=Number(sl) : high>=Number(sl);
      if (hitTP && hitSL) return {result:'LOSS', when:candle.timestamp||null, reason:'TP e SL tocados no mesmo candle; resultado conservador = LOSS'};
      if (hitTP) return {result:'WIN', when:candle.timestamp||null, reason:'TP atingido'};
      if (hitSL) return {result:'LOSS', when:candle.timestamp||null, reason:'SL atingido'};
      if (hasEntry && distance>0 && !beArmed) {
        const favorable=type==='BUY'?high-Number(entry):Number(entry)-low;
        if (favorable>=distance*.50) {beArmed=true;beArmedAt=candle.timestamp||null;beTriggerPrice=type==='BUY'?high:low;continue}
      }
      if (beArmed) {
        const returned=type==='BUY'?low<=Number(entry):high>=Number(entry);
        if(returned)return {result:'BE',when:candle.timestamp||null,reason:'Preço regressou à entrada após ativação da proteção BE aos 50% do percurso até TP',beArmedAt,beTriggerPrice,beTriggerPriceAt:beArmedAt};
      }
    }
    return null;
  }
  root.RBTradeOutcome=Object.assign(root.RBTradeOutcome||{}, {resolveTradeOutcome});
})(globalThis);
