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
const KRAKEN_BASE = "https://api.kraken.com/0/public";
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

async function requestKraken(path, params = {}) {
  return axios.get(KRAKEN_BASE + "/" + path, {
    params, timeout: TIMEOUT_MS,
    headers: { Accept: "application/json", "User-Agent": "RB-Gold-Sniper/5.3" }
  });
}

async function fetchBtcCandles(timeframe) {
  const cfg = BTC_TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");

  let candles = [], quotePrice = NaN, quoteTime = NaN;
  let source = "Coinbase BTC-USD";

  try {
    const [cr, tick] = await Promise.all([
      requestCoinbase("products/BTC-USD/candles", { granularity: cfg.granularity, limit: cfg.limit }),
      getBtcQuote()
    ]);
    const raw = Array.isArray(cr.data) ? cr.data : [];
    candles = raw.map(row => ({
      timestamp: new Date(Number(row[0]) * 1000).toISOString(),
      open: Number(row[3]), high: Number(row[2]), low: Number(row[1]), close: Number(row[4]),
      volume: Number(row[5] || 0), complete: true, isOpen: false
    })).filter(valid).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))
      .filter((c,i,s)=>i===0 || c.timestamp!==s[i-1].timestamp).slice(-cfg.limit);
    quotePrice = Number(tick.price);
    quoteTime = Date.parse(tick.time || "");
    if (candles.length < 50 || !Number.isFinite(quotePrice)) throw new Error("Coinbase devolveu dados BTC incompletos");
  } catch (coinbaseError) {
    source = "Kraken BTC/USD (fallback)";
    const [cr, tick] = await Promise.all([
      requestKraken("OHLC", { pair: "XBTUSD", interval: cfg.granularity / 60 }),
      requestKraken("Ticker", { pair: "XBTUSD" })
    ]);
    if (Array.isArray(cr.data?.error) && cr.data.error.length) throw new Error("Coinbase indisponível; Kraken: " + cr.data.error.join(", "));
    const result = cr.data?.result || {}, key = Object.keys(result).find(k=>k!=="last");
    const raw = key && Array.isArray(result[key]) ? result[key] : [];
    candles = raw.map(row => ({
      timestamp: new Date(Number(row[0]) * 1000).toISOString(),
      open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
      volume: Number(row[6] || 0), complete: false, isOpen: false
    })).filter(valid).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))
      .filter((c,i,s)=>i===0 || c.timestamp!==s[i-1].timestamp).slice(-cfg.limit);
    const tickerKey = Object.keys(tick.data?.result || {})[0];
    quotePrice = Number(tickerKey ? tick.data.result[tickerKey]?.c?.[0] : NaN);
    quoteTime = Date.now();
    if (candles.length < 50 || !Number.isFinite(quotePrice))
      throw new Error("Coinbase indisponível e Kraken não devolveu candles BTC/USD: " + coinbaseError.message);
  }

  const now = Date.now(), last = candles[candles.length - 1], lastTs = Date.parse(last.timestamp);
  const intervalMs = cfg.granularity * 1000, bucketNow = Math.floor(now / intervalMs) * intervalMs;
  // Coinbase/Kraken OHLC endpoints normally return completed candles. Build the
  // current live candle from the exchange ticker so M1 does not freeze between
  // completed candles. No historical candle is fabricated; only the open candle
  // is reconstructed from the previous close + current live price.
  if (Number.isFinite(quotePrice) && Number.isFinite(lastTs) && lastTs < bucketNow) {
    const liveOpen = Number(last.close);
    candles.push({
      timestamp: new Date(bucketNow).toISOString(),
      open: liveOpen,
      high: Math.max(liveOpen, quotePrice),
      low: Math.min(liveOpen, quotePrice),
      close: quotePrice,
      volume: 0,
      complete: false,
      isOpen: true
    });
  }
  const currentLast = candles[candles.length - 1], currentLastTs = Date.parse(currentLast.timestamp);
  const realOpenBar = Number.isFinite(currentLastTs) && currentLastTs === bucketNow && now - currentLastTs < intervalMs + 5000;
  const liveLast = candles[candles.length - 1];
  liveLast.isOpen = realOpenBar; liveLast.complete = !realOpenBar;
  const quoteAge = Number.isFinite(quoteTime) ? Math.max(0, Math.round((now - quoteTime) / 1000)) : Number.POSITIVE_INFINITY;
  const price = Number.isFinite(quotePrice) ? quotePrice : liveLast.close;
  const stale = !Number.isFinite(quoteAge) || quoteAge > 300 || !Number.isFinite(currentLastTs) || now-currentLastTs > cfg.stale*1000 || (timeframe==="1m" && !realOpenBar && now-currentLastTs>60000);
  const quoteFresh = quoteAge <= 15;
  return { success:true, source, symbol:"BTCUSD", displaySymbol:"COINBASE:BTCUSD", timeframe, candles, last:liveLast,
    price:Number.isFinite(price)?price:last.close, delayedBy:Math.max(0,Math.round((now-currentLastTs)/1000)),
    candleTimestamp:liveLast.timestamp, quoteTimestamp:Number.isFinite(quoteTime)?new Date(quoteTime).toISOString():liveLast.timestamp,
    candleAgeSec:Math.max(0,Math.round((now-currentLastTs)/1000)), candleStartAgeSec:Math.max(0,Math.round((now-currentLastTs)/1000)),
    quoteAgeSec:Number.isFinite(quoteAge)?quoteAge:null, stale, marketState:"open", realOpenBar,
    liveM1:timeframe==="1m" && realOpenBar && quoteFresh && !stale, oandaLive:false,
    feedNotice:source==="Coinbase BTC-USD" ? "BTC/USD via Coinbase — candles OHLC e preço live; TradingView mostra COINBASE:BTCUSD" : "BTC/USD via Kraken (fallback) — candles OHLC e preço live; TradingView mostra COINBASE:BTCUSD" };
}



async function fetchXauCandles(timeframe, requestedLimit = 500, from = null, to = null) {
  const cfg = TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");
  const limit = Math.min(2000, Math.max(60, Number(requestedLimit) || cfg.limit));

  const [br, tick] = await Promise.all([
    request(`XAUUSD/ohlc`, {
      interval: cfg.interval,
      limit: Math.min(limit, 1000),
      ...(from ? { from } : {}),
      ...(to ? { to } : {})
    }),
    getQuote("XAUUSD")
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

  if (candles.length < 50) throw new Error(`Biquote devolveu poucos candles (${candles.length})`);

  const now = Date.now();
  const livePrice = Number(tick.mid);
  const quoteAge = Number(tick.quoteAgeSeconds);
  const marketState = String(tick.marketState || "unknown").toLowerCase();
  const quoteTimestamp = tick.timestamp || tick.lastQuoteAt || null;
  const last = candles[candles.length - 1];
  const lastTs = Date.parse(last.timestamp);
  const age = Number.isFinite(lastTs) ? Math.max(0, Math.round((now - lastTs) / 1000)) : Number.POSITIVE_INFINITY;
  const realOpenBar = last.isOpen === true;
  const quoteFresh = Number.isFinite(quoteAge) && quoteAge <= 15;
  const marketOpen = marketState === "open";
  const stale = !marketOpen || !Number.isFinite(quoteAge) || quoteAge > 300 ||
    !Number.isFinite(age) || age > cfg.stale ||
    (timeframe === "1m" && !realOpenBar && age > 60);

  return {
    success: true,
    source: "Biquote XAUUSD — feed MT5",
    symbol: "XAUUSD",
    displaySymbol: "OANDA:XAUUSD",
    timeframe,
    candles,
    last,
    price: Number.isFinite(livePrice) ? livePrice : last.close,
    delayedBy: age,
    candleTimestamp: last.timestamp,
    quoteTimestamp: quoteTimestamp || last.timestamp,
    candleAgeSec: age,
    candleStartAgeSec: age,
    quoteAgeSec: Number.isFinite(quoteAge) ? quoteAge : null,
    stale,
    marketState,
    realOpenBar,
    liveM1: timeframe === "1m" && realOpenBar && quoteFresh && !stale,
    oandaLive: false,
    feedNotice: "XAUUSD/MT5 com candle OHLC real; M1 usa apenas o candle aberto oficial do feed; nenhum candle é inventado; M5/M15/H1 permanecem oficiais; TradingView mostra OANDA:XAUUSD"
  };
}

async function getMarket(timeframe, requestedLimit = 500, from = null, to = null, asset = "XAUUSD") {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  const symbol = String(asset || "XAUUSD").toUpperCase();
  if (!SYMBOLS[symbol]) throw new Error("Ativo inválido");

  if (symbol === "BTCUSD") return fetchBtcCandles(timeframe);

  const limit = Math.min(2000, Math.max(60, Number(requestedLimit) || 500));
  const key = `biquote:XAUUSD:${timeframe}:${limit}:${from || ''}:${to || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  if (inflight.has(key)) return inflight.get(key);

  const p = fetchXauCandles(timeframe, limit, from, to)
    .then(v => {
      cache.set(key, { t: Date.now(), v });
      inflight.delete(key);
      return v;
    })
    .catch(e => {
      inflight.delete(key);
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
    const requestedLimit = Math.min(2000, Math.max(60, Number(req.query.limit) || 500));
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const m = await getMarket(timeframe, requestedLimit, from, to, asset);
    res.status(200).json(m);
  } catch (e) {
    console.error("MARKET ERROR", e.message);
    res.status(502).json({
      success: false,
      error: `Falha no feed ${asset}`,
      details: e.message,
      source: `Biquote ${asset}`
    });
  }
}

handler.getMarket = getMarket;
module.exports = handler;
