(function(root){
  function resolveTradeOutcome(type, sl, tp, candles) {
    if (!['BUY','SELL'].includes(type) || !Number.isFinite(Number(sl)) || !Number.isFinite(Number(tp))) return null;
    for (const candle of Array.isArray(candles) ? candles : []) {
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
