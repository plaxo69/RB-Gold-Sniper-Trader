const axios = require("axios");

// XAUUSD market feed.
// Biquote supplies real XAUUSD OHLC candles plus a live MT5-based quote.
// TradingView remains OANDA:XAUUSD visually. Sniper strategy is unchanged.
const BASE = "https://biquote.io/api";
const SYMBOLS = { XAUUSD: "XAUUSD", BTCUSD: "BTCUSD" };
const TF = {
  "1m": { interval: "1m", stale: 150, limit: 500 },
  "5m": { interval: "5m", stale: 720, limit: 500 },
  "15m": { interval: "15m", stale: 1500, limit: 500 },
  "1h": { interval: "1h", stale: 5400, limit: 500 }
};
const cache = new Map();
const inflight = new Map();
const quoteCache = new Map();
const quoteInflight = new Map();
const CACHE_MS = 5000;
const QUOTE_CACHE_MS = 5000;
const TIMEOUT_MS = 6000;
const COINBASE_BASE = "https://api.exchange.coinbase.com";
const BTC_TF = {
  "1m": { granularity: 60, stale: 150, limit: 300 },
  "5m": { granularity: 300, stale: 720, limit: 300 },
  "15m": { granularity: 900, stale: 1500, limit: 300 },
  "1h": { granularity: 3600, stale: 5400, limit: 300 }
};
const btcCache = new Map();
const btcInflight = new Map();
const btcQuoteCache = { t: 0, v: null };
const btcQuoteInflight = { p: null };

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

async function getQuote(symbol) {
  const hit = quoteCache.get(symbol);
  if (hit && Date.now() - hit.t < QUOTE_CACHE_MS) return hit.v;
  if (quoteInflight.has(symbol)) return quoteInflight.get(symbol);
  const p = request(symbol, { allowStale: true })
    .then(r => {
      const v = r.data || {};
      quoteCache.set(symbol, { t: Date.now(), v });
      quoteInflight.delete(symbol);
      return v;
    })
    .catch(e => {
      quoteInflight.delete(symbol);
      const old = quoteCache.get(symbol);
      if (old) return old.v;
      throw e;
    });
  quoteInflight.set(symbol, p);
  return p;
}

async function requestCoinbase(path, params = {}) {
  return axios.get(`${COINBASE_BASE}/${path}`, {
    params,
    timeout: TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "User-Agent": "RB-Gold-Sniper/5.3"
    }
  });
}

async function getBtcQuote() {
  if (btcQuoteCache.v && Date.now() - btcQuoteCache.t < QUOTE_CACHE_MS) return btcQuoteCache.v;
  if (btcQuoteInflight.p) return btcQuoteInflight.p;
  btcQuoteInflight.p = requestCoinbase("products/BTC-USD/ticker")
    .then(r => {
      const v = r.data || {};
      btcQuoteCache.t = Date.now();
      btcQuoteCache.v = v;
      btcQuoteInflight.p = null;
      return v;
    })
    .catch(e => {
      btcQuoteInflight.p = null;
      if (btcQuoteCache.v) return btcQuoteCache.v;
      throw e;
    });
  return btcQuoteInflight.p;
}

async function fetchBtcCandles(timeframe) {
  const cfg = BTC_TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");

  const [cr, tick] = await Promise.all([
    requestCoinbase("products/BTC-USD/candles", {
      granularity: cfg.granularity,
      limit: cfg.limit
    }),
    getBtcQuote()
  ]);

  const raw = Array.isArray(cr.data) ? cr.data : [];
  if (!raw.length) throw new Error("Coinbase não devolveu candles BTC-USD");

  const now = Date.now();
  const candles = raw.map(row => {
    const ts = Number(row[0]) * 1000;
    return {
      timestamp: new Date(ts).toISOString(),
      open: Number(row[3]),
      high: Number(row[2]),
      low: Number(row[1]),
      close: Number(row[4]),
      volume: Number(row[5] || 0),
      complete: true,
      isOpen: false
    };
  }).filter(valid)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .filter((c, i, s) => i === 0 || c.timestamp !== s[i - 1].timestamp)
    .slice(-cfg.limit);

  if (candles.length < 50) throw new Error(`Coinbase devolveu poucos candles BTC-USD (${candles.length})`);

  const last = candles[candles.length - 1];
  const lastTs = Date.parse(last.timestamp);
  const intervalMs = cfg.granularity * 1000;
  const bucketNow = Math.floor(now / intervalMs) * intervalMs;
  const realOpenBar = Number.isFinite(lastTs) &&
    lastTs === bucketNow &&
    now - lastTs < intervalMs + 5000;
  last.isOpen = realOpenBar;
  last.complete = !realOpenBar;

  const quotePrice = Number(tick.price);
  const quoteTime = Date.parse(tick.time || "");
  const quoteAge = Number.isFinite(quoteTime)
    ? Math.max(0, Math.round((now - quoteTime) / 1000))
    : Number.POSITIVE_INFINITY;
  const price = Number.isFinite(quotePrice) ? quotePrice : last.close;
  const stale = !Number.isFinite(quoteAge) ||
    quoteAge > 300 ||
    !Number.isFinite(lastTs) ||
    now - lastTs > cfg.stale * 1000 ||
    (timeframe === "1m" && !realOpenBar && now - lastTs > 60000);
  const quoteFresh = quoteAge <= 15;

  return {
    success: true,
    source: "Coinbase BTC-USD",
    symbol: "BTCUSD",
    displaySymbol: "COINBASE:BTCUSD",
    timeframe,
    candles,
    last,
    price: Number.isFinite(price) ? price : last.close,
    delayedBy: Math.max(0, Math.round((now - lastTs) / 1000)),
    candleTimestamp: last.timestamp,
    quoteTimestamp: Number.isFinite(quoteTime) ? new Date(quoteTime).toISOString() : last.timestamp,
    candleAgeSec: Math.max(0, Math.round((now - lastTs) / 1000)),
    candleStartAgeSec: Math.max(0, Math.round((now - lastTs) / 1000)),
    quoteAgeSec: Number.isFinite(quoteAge) ? quoteAge : null,
    stale,
    marketState: "open",
    realOpenBar,
    liveM1: timeframe === "1m" && realOpenBar && quoteFresh && !stale,
    oandaLive: false,
    feedNotice: "BTC/USD via Coinbase — candles OHLC oficiais e preço live; TradingView mostra COINBASE:BTCUSD"
  };
}

async function fetchCandles(timeframe, symbol) {
  if (symbol === "BTCUSD") return fetchBtcCandles(timeframe);
  const cfg = TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");

  // One shared live quote is used by all timeframes in the same server instance.
  // This avoids four identical quote calls every 10 seconds from the browser.
  const [br, tick] = await Promise.all([
    request(`${symbol}/ohlc`, { interval: cfg.interval, limit: cfg.limit }),
    getQuote(symbol)
  ]);

  const bars = Array.isArray(br.data?.bars) ? br.data.bars : [];
  if (!bars.length) throw new Error(`Biquote não devolveu candles ${symbol}`);

  const candles = clean(bars.map(b => ({
    timestamp: new Date(b.openTime).toISOString(),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: Number(b.volume || 0),
    complete: b.isOpen !== true,
    isOpen: b.isOpen === true
  }))).slice(-cfg.limit);

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
    source: `Biquote ${symbol} — feed MT5`,
    symbol,
    displaySymbol: symbol === "BTCUSD" ? "COINBASE:BTCUSD" : "OANDA:XAUUSD",
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
    feedNotice: `${symbol}/MT5 com candle OHLC real; M1 usa apenas o candle aberto oficial do feed; nenhum candle é inventado; M5/M15/H1 permanecem oficiais; TradingView mostra ${symbol === "BTCUSD" ? "COINBASE:BTCUSD" : "OANDA:XAUUSD"}`
  };
}

async function getMarket(timeframe, symbol) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  const key = `biquote:${symbol}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  if (inflight.has(key)) return inflight.get(key);

  const p = fetchCandles(timeframe, symbol)
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
  const asset = String(req.query.asset || "XAUUSD").toUpperCase();
  try {
    const timeframe = String(req.query.timeframe || "1m");
    const symbol = SYMBOLS[asset];
    if (!symbol) return res.status(400).json({ success:false, error:"Ativo inválido", details:"Use XAUUSD ou BTCUSD" });
    const m = await getMarket(timeframe, symbol);
    res.status(200).json(m);
  } catch (e) {
    console.error("MARKET ERROR", e.message);
    res.status(502).json({
      success: false,
      error: `Falha no feed ${asset || "XAUUSD"}`,
      details: e.message,
      source: `Biquote ${asset || "XAUUSD"}`
    });
  }
}

handler.getMarket = getMarket;
module.exports = handler;
