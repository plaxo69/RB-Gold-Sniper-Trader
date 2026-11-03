(function(root){
  function parseTime(value) {
    if (value == null) return NaN;
    if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function resolveTradeOutcome(type, sl, tp, candles, trade = {}) {
    if (!['BUY', 'SELL'].includes(type) ||
        !Number.isFinite(Number(sl)) || !Number.isFinite(Number(tp))) return null;

    const entry = Number(trade.price);
    if (!Number.isFinite(entry) || entry <= 0) {
      const input = Array.isArray(candles) ? candles : [];
      const parse = value => {
        if (value == null) return NaN;
        if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
        const n = Number(value);
        if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
        return Date.parse(value);
      };
      const ordered = input.every(c => Number.isFinite(parse(c?.timestamp)))
        ? [...input].sort((a, b) => parse(a.timestamp) - parse(b.timestamp))
        : input;
      for (const candle of ordered) {
        const high = Number(candle?.high), low = Number(candle?.low);
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
        const hitTP = type === 'BUY' ? high >= Number(tp) : low <= Number(tp);
        const hitSL = type === 'BUY' ? low <= Number(sl) : high >= Number(sl);
        if (hitTP && hitSL) return { result: 'LOSS', when: candle.timestamp || null, reason: 'TP e SL tocados no mesmo candle; resultado conservador = LOSS' };
        if (hitTP) return { result: 'WIN', when: candle.timestamp || null, reason: 'TP atingido' };
        if (hitSL) return { result: 'LOSS', when: candle.timestamp || null, reason: 'SL atingido' };
      }
      return null;
    }

    const signalTime = parseTime(trade.signalTimestamp || trade.time);
    const armedAt = parseTime(trade.beArmedAt);
    const beDistance = Math.abs(Number(tp) - entry) * 0.5;
    const input = Array.isArray(candles) ? candles : [];
    const ordered = input
      .map(candle => ({ candle, time: parseTime(candle?.timestamp) }))
      .filter(({ candle, time }) =>
        Number.isFinite(time) &&
        (!Number.isFinite(signalTime) || time > signalTime) &&
        candle?.complete !== false &&
        candle?.isOpen !== true
      )
      .sort((a, b) => a.time - b.time);

    let beArmedAt = Number.isFinite(armedAt) ? trade.beArmedAt : null;
    let armedTime = Number.isFinite(armedAt) ? armedAt : null;
    let beTriggerPrice = Number.isFinite(Number(trade.beTriggerPrice))
      ? Number(trade.beTriggerPrice)
      : null;
    let beArmed = Number.isFinite(armedAt);

    for (const { candle, time } of ordered) {
      const high = Number(candle?.high);
      const low = Number(candle?.low);
      if (!Number.isFinite(high) || !Number.isFinite(low) || high < low) continue;

      const hitTP = type === 'BUY' ? high >= Number(tp) : low <= Number(tp);
      const hitSL = type === 'BUY' ? low <= Number(sl) : high >= Number(sl);

      if (hitTP && hitSL) {
        return { result: 'LOSS', when: candle.timestamp || null,
          reason: 'TP e SL tocados no mesmo candle; resultado conservador = LOSS',
          ...(beArmedAt ? { beArmedAt, beTriggerPrice } : {}) };
      }
      if (hitTP) return { result: 'WIN', when: candle.timestamp || null,
        reason: 'TP atingido', ...(beArmedAt ? { beArmedAt, beTriggerPrice } : {}) };
      if (hitSL) return { result: 'LOSS', when: candle.timestamp || null,
        reason: 'SL atingido', ...(beArmedAt ? { beArmedAt, beTriggerPrice } : {}) };

      if (beArmed) {
        if (Number.isFinite(armedTime) && time > armedTime) {
          const returnedToEntry = type === 'BUY' ? low <= entry : high >= entry;
          if (returnedToEntry) return {
            result: 'BE',
            when: candle.timestamp || null,
            reason: 'Preço regressou à entrada depois de ativar proteção BE aos 50% do TP',
            beArmedAt,
            beTriggerPrice: beTriggerPrice ?? entry + (type === 'BUY' ? beDistance : -beDistance),
            beExitPrice: entry
          };
        }
        continue;
      }

      const favorable = type === 'BUY' ? high - entry : entry - low;
      if (beDistance > 0 && favorable >= beDistance) {
        beArmed = true;
        beArmedAt = candle.timestamp;
        armedTime = time;
        beTriggerPrice = entry + (type === 'BUY' ? beDistance : -beDistance);
      }
    }

    return beArmed ? { beArmed: true, beArmedAt, beTriggerPrice } : null;
  }

  root.RBTradeOutcome = Object.assign(root.RBTradeOutcome || {}, { resolveTradeOutcome });
})(globalThis);
