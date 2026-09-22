const axios = require("axios");

// XAUUSD market feed.
// Biquote supplies real XAUUSD OHLC candles plus a live MT5-based quote.
// TradingView remains OANDA:XAUUSD visually. Sniper strategy is unchanged.
const BASE = "https://biquote.io/api";
const SYMBOL = "XAUUSD";
const TF = {
  "1m": { interval: "1m", stale: 150, limit: 500 },
  "5m": { interval: "5m", stale: 720, limit: 500 },
  "15m": { interval: "15m", stale: 1500, limit: 500 },
  "1h": { interval: "1h", stale: 5400, limit: 500 }
};
const cache = new Map();
const inflight = new Map();
let quoteCache = null;
let quoteInflight = null;
const CACHE_MS = 5000;
const QUOTE_CACHE_MS = 5000;
const TIMEOUT_MS = 6000;

function finite(v) { return Number.isFinite(Number(v)); }
function valid(c) {
  return [c.open, c.high, c.low, c.close].every(finite) &&
    c.open > 0 &&
    c.high >= Math.max(c.open, c.close) &&
    c.low <= Math.min(c.open, c.close) &&
    c.high >= c.low;
}
function clean(a) {
  return a.filter(valid)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .filter((c, i, s) => i === 0 || c.timestamp !== s[i - 1].timestamp);
}
async function request(path, params = {}) {
  return axios.get(`${BASE}/${path}`, {
    params,
    timeout: TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "User-Agent": "RB-Gold-Sniper/5.3"
    }
  });
}

async function getQuote() {
  if (quoteCache && Date.now() - quoteCache.t < QUOTE_CACHE_MS) return quoteCache.v;
  if (quoteInflight) return quoteInflight;
  quoteInflight = request(SYMBOL, { allowStale: true })
    .then(r => {
      const v = r.data || {};
      quoteCache = { t: Date.now(), v };
      quoteInflight = null;
      return v;
    })
    .catch(e => {
      quoteInflight = null;
      if (quoteCache) return quoteCache.v;
      throw e;
    });
  return quoteInflight;
}

async function fetchCandles(timeframe, requestedLimit = 500) {
  const cfg = TF[timeframe];
  const limit = Math.min(2000, Math.max(60, Number(requestedLimit) || cfg.limit));
  if (!cfg) throw new Error("Timeframe inválido");

  // One shared live quote is used by all timeframes in the same server instance.
  // This avoids four identical quote calls every 10 seconds from the browser.
  const [br, tick] = await Promise.all([
    request(`${SYMBOL}/ohlc`, { interval: cfg.interval, limit: limit }),
    getQuote()
  ]);

  const bars = Array.isArray(br.data?.bars) ? br.data.bars : [];
  if (!bars.length) throw new Error("Biquote não devolveu candles XAUUSD");

  const candles = clean(bars.map(b => ({
    timestamp: new Date(b.openTime).toISOString(),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: Number(b.volume || 0),
    complete: b.isOpen !== true,
    isOpen: b.isOpen === true
  }))).slice(-limit);

  if (candles.length < 50) {
    throw new Error(`Biquote devolveu poucos candles (${candles.length})`);
  }

  const now = Date.now();
  const livePrice = Number(tick.mid);
  const quoteAge = Number(tick.quoteAgeSeconds);
  const marketState = String(tick.marketState || "unknown").toLowerCase();
  const quoteTimestamp = tick.timestamp || tick.lastQuoteAt || null;
  const last = candles[candles.length - 1];
  const lastTs = Date.parse(last.timestamp);
  const age = Number.isFinite(lastTs)
    ? Math.max(0, Math.round((now - lastTs) / 1000))
    : Number.POSITIVE_INFINITY;

  const realOpenBar = last.isOpen === true;
  const effectiveAge = age;
  const quoteFresh = Number.isFinite(quoteAge) && quoteAge <= 15;
  const marketOpen = marketState === "open";
  const stale = !marketOpen ||
    !Number.isFinite(quoteAge) ||
    quoteAge > 300 ||
    !Number.isFinite(effectiveAge) ||
    effectiveAge > cfg.stale ||
    (timeframe === "1m" && !realOpenBar && effectiveAge > 60);

  const price = Number.isFinite(livePrice) ? livePrice : last.close;

  return {
    success: true,
    source: "Biquote XAUUSD — feed MT5",
    symbol: SYMBOL,
    displaySymbol: "OANDA:XAUUSD",
    timeframe,
    candles,
    last,
    price: Number.isFinite(price) ? price : last.close,
    delayedBy: effectiveAge,
    candleTimestamp: last.timestamp,
    quoteTimestamp: quoteTimestamp || last.timestamp,
    candleAgeSec: effectiveAge,
    candleStartAgeSec: effectiveAge,
    quoteAgeSec: Number.isFinite(quoteAge) ? quoteAge : null,
    stale,
    marketState,
    realOpenBar,
    liveM1: timeframe === "1m" && realOpenBar && quoteFresh && !stale,
    oandaLive: false,
    feedNotice: "XAUUSD/MT5 com candle OHLC real; M1 usa apenas o candle aberto oficial do feed; nenhum candle é inventado; M5/M15/H1 permanecem oficiais; TradingView mostra OANDA:XAUUSD"
  };
}

async function getMarket(timeframe, requestedLimit = 500) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  const limit = Math.min(2000, Math.max(60, Number(requestedLimit) || 500));
  const key = `biquote:${SYMBOL}:${timeframe}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  if (inflight.has(key)) return inflight.get(key);

  const p = fetchCandles(timeframe, limit)
    .then(v => {
      cache.set(key, { t: Date.now(), v });
      inflight.delete(key);
      return v;
    })
    .catch(e => {
      inflight.delete(key);
      // Keep the UI alive on a short upstream outage, but explicitly mark the
      // snapshot stale so the client cannot generate a signal from it.
      const old = cache.get(key);
      if (old && Date.now() - old.t < 120000) {
        return { ...old.v, stale: true, liveM1: false, feedNotice: `${old.v.feedNotice} • último snapshot mantido após falha temporária do feed` };
      }
      throw e;
    });

  inflight.set(key, p);
  return p;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const timeframe = String(req.query.timeframe || "1m");
    const requestedLimit = Math.min(2000, Math.max(60, Number(req.query.limit) || 500));
    const m = await getMarket(timeframe, requestedLimit);
    res.status(200).json(m);
  } catch (e) {
    console.error("MARKET ERROR", e.message);
    res.status(502).json({
      success: false,
      error: "Falha no feed XAUUSD",
      details: e.message,
      source: "Biquote XAUUSD"
    });
  }
}

handler.getMarket = getMarket;
module.exports = handler;
