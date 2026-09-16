(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RBGoldSniper = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CONFIG = Object.freeze({
    structurePeriod: 20,
    minHistory: 205,
    minRiskReward: 2,
    minAtrPercent: 0.00005,
    maxAtrPercent: 0.006,
    minBodyAtr: 0.25,
    maxEntryExtensionAtr: 1.60
  });

  function sma(values, period) {
    if (values.length < period) return null;
    return values.slice(-period).reduce((total, value) => total + value, 0) / period;
  }

  function ema(values, period) {
    if (values.length < period) return null;
    const multiplier = 2 / (period + 1);
    let value = values[0];
    for (let index = 1; index < values.length; index += 1) value = values[index] * multiplier + value * (1 - multiplier);
    return value;
  }

  function rsi(values, period = 14) {
    if (values.length < period + 1) return null;
    let gain = 0;
    let loss = 0;
    for (let index = values.length - period; index < values.length; index += 1) {
      const change = values[index] - values[index - 1];
      if (change >= 0) gain += change;
      else loss -= change;
    }
    if (loss === 0) return 100;
    const relativeStrength = gain / loss;
    return 100 - 100 / (1 + relativeStrength);
  }

  function atr(candles, period = 14) {
    if (candles.length < period + 1) return null;
    const ranges = [];
    for (let index = 1; index < candles.length; index += 1) {
      const current = candles[index];
      const previousClose = candles[index - 1].close;
      ranges.push(Math.max(current.high - current.low, Math.abs(current.high - previousClose), Math.abs(current.low - previousClose)));
    }
    return sma(ranges, period);
  }

  function trend(candles) {
    const closes = candles.map(candle => candle.close);
    const fast = ema(closes, 20);
    const slow = ema(closes, 50);
    if (fast === null || slow === null) return "LATERAL";
    const previousFast = ema(closes.slice(0, -3), 20);
    const last = closes.at(-1);
    if (last > fast && fast > slow && previousFast !== null && fast >= previousFast) return "ALTA";
    if (last < fast && fast < slow && previousFast !== null && fast <= previousFast) return "BAIXA";
    return "LATERAL";
  }

  function priorStructure(candles, period = CONFIG.structurePeriod) {
    const levels = candles.slice(-(period + 1), -1);
    if (levels.length < period) return null;
    return {
      support: Math.min(...levels.map(candle => candle.low)),
      resistance: Math.max(...levels.map(candle => candle.high))
    };
  }

  function rounded(value) { return Number(value.toFixed(2)); }

  function analyze(main, m3, m5, m15, h1) {
    if (![main, m3, m5, m15, h1].every(Array.isArray) || main.length < CONFIG.minHistory || m3.length < 55 || m5.length < 55 || m15.length < 55 || h1.length < 55) return null;

    const closed = main.slice(0, -1);
    const signal = closed.at(-1);
    const previous = closed.at(-2);
    const closes = closed.map(candle => candle.close);
    const price = main.at(-1).close;
    const fast = ema(closes, 20);
    const slow = ema(closes, 50);
    const anchor = ema(closes, 200);
    const momentum = rsi(closes);
    const volatility = atr(closed);
    const levels = priorStructure(closed);
    if ([fast, slow, anchor, momentum, volatility].some(value => value === null) || !levels) return null;

    const trends = {
      m3: trend(m3.slice(0, -1)),
      m5: trend(m5.slice(0, -1)),
      m15: trend(m15.slice(0, -1)),
      h1: trend(h1.slice(0, -1))
    };

    const atrPercent = volatility / signal.close;
    const body = Math.abs(signal.close - signal.open);
    const bodyIsDecisive = body >= volatility * CONFIG.minBodyAtr;
    const marketIsTradable = atrPercent >= CONFIG.minAtrPercent && atrPercent <= CONFIG.maxAtrPercent;

    // M15 defines the main direction. M5 must agree and M3 is the trigger confirmation.
    // H1 is a safety filter: it cannot be opposite to the intended trade.
    const buyTrend = trends.m15 === "ALTA" && trends.m5 === "ALTA" && trends.m3 === "ALTA" && trends.h1 !== "BAIXA" && signal.close > fast && fast > slow && slow > anchor;
    const sellTrend = trends.m15 === "BAIXA" && trends.m5 === "BAIXA" && trends.m3 === "BAIXA" && trends.h1 !== "ALTA" && signal.close < fast && fast < slow && slow < anchor;

    const buyBreakout = signal.close > levels.resistance && previous.close <= levels.resistance;
    const sellBreakdown = signal.close < levels.support && previous.close >= levels.support;

    const buyMomentum = momentum >= 50 && momentum <= 78;
    const sellMomentum = momentum >= 22 && momentum <= 50;
    const buyExtension = (signal.close - fast) / volatility;
    const sellExtension = (fast - signal.close) / volatility;
    const buyEntryIsControlled = buyExtension <= CONFIG.maxEntryExtensionAtr;
    const sellEntryIsControlled = sellExtension <= CONFIG.maxEntryExtensionAtr;

    const buyPasses = marketIsTradable && buyTrend && buyBreakout && bodyIsDecisive && buyMomentum && buyEntryIsControlled;
    const sellPasses = marketIsTradable && sellTrend && sellBreakdown && bodyIsDecisive && sellMomentum && sellEntryIsControlled;
    const type = buyPasses ? "BUY" : sellPasses ? "SELL" : "WAIT";

    const reasons = type === "BUY"
      ? ["Tendência M3/M5/M15 alinhada", "H1 não contrário", "EMA20 > EMA50 > EMA200", "Breakout fechado", "RSI com momentum", "Volatilidade e extensão aprovadas"]
      : type === "SELL"
        ? ["Tendência M3/M5/M15 alinhada", "H1 não contrário", "EMA20 < EMA50 < EMA200", "Breakdown fechado", "RSI com momentum", "Volatilidade e extensão aprovadas"]
        : [];

    const rejectionReasons = type === "WAIT" ? [
      !marketIsTradable && "volatilidade fora da faixa",
      !bodyIsDecisive && "candle de confirmação fraco",
      !buyTrend && !sellTrend && "M3/M5/M15 sem alinhamento ou H1 contrário",
      !buyBreakout && !sellBreakdown && "sem breakout/breakdown fechado",
      !buyMomentum && !sellMomentum && "RSI sem momentum válido",
      !buyEntryIsControlled && !sellEntryIsControlled && "entrada demasiado estendida"
    ].filter(Boolean) : [];

    let sl = null;
    let tp = null;
    let rr = null;
    if (type === "BUY") {
      sl = Math.min(levels.resistance - volatility * 0.35, signal.low - volatility * 0.2);
      const risk = price - sl;
      if (risk > 0) {
        tp = price + Math.max(risk * CONFIG.minRiskReward, volatility * 2.5);
        rr = (tp - price) / risk;
      }
    } else if (type === "SELL") {
      sl = Math.max(levels.support + volatility * 0.35, signal.high + volatility * 0.2);
      const risk = sl - price;
      if (risk > 0) {
        tp = price - Math.max(risk * CONFIG.minRiskReward, volatility * 2.5);
        rr = (price - tp) / risk;
      }
    }

    const passed = [marketIsTradable, bodyIsDecisive, buyTrend || sellTrend, buyBreakout || sellBreakdown, buyMomentum || sellMomentum, buyEntryIsControlled || sellEntryIsControlled].filter(Boolean).length;
    const confidence = type === "WAIT" ? 0 : Math.min(95, 76 + passed * 3);

    return {
      type,
      score: passed,
      confidence,
      price,
      rsi: momentum,
      ema20: fast,
      ema50: slow,
      ema200: anchor,
      atr: volatility,
      support: levels.support,
      resistance: levels.resistance,
      trend3: trends.m3,
      trend5: trends.m5,
      trend15: trends.m15,
      trend1: trends.h1,
      sl: sl === null || !Number.isFinite(sl) ? null : rounded(sl),
      tp: tp === null || !Number.isFinite(tp) ? null : rounded(tp),
      rr: rr === null || !Number.isFinite(rr) ? null : rr,
      reasons,
      rejectionReasons,
      source: "candles reais fechados",
      filters: { marketIsTradable, bodyIsDecisive, buyTrend, sellTrend, buyBreakout, sellBreakdown, buyMomentum, sellMomentum, buyEntryIsControlled, sellEntryIsControlled }
    };
  }

  return { CONFIG, sma, ema, rsi, atr, trend, priorStructure, analyze };
});
