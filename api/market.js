const axios = require("axios");

// Gold market feed for Vercel.
// Yahoo Finance GC=F is used as the primary liquid gold futures proxy because
// it provides continuous intraday OHLC data without an API key. TradingView
// remains OANDA:XAUUSD visually. Coinbase is intentionally NOT used as the
// primary M1 source because PAXG spot can have sparse trades and stale candles.
const SYMBOL = "GC=F";
const HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com"
];
const TF = {
  "1m": { interval: "1m", range: "1d", stale: 150 },
  "5m": { interval: "5m", range: "5d", stale: 720 },
  "15m": { interval: "15m", range: "10d", stale: 1500 },
  "1h": { interval: "60m", range: "1mo", stale: 5400 }
};

const cache = new Map();
const inflight = new Map();
const CACHE_MS = 5000;
const LIMIT = 300;

function valid(c) {
  return [c.open, c.high, c.low, c.close].every(Number.isFinite) &&
    c.open > 0 &&
    c.high >= Math.max(c.open, c.close) &&
    c.low <= Math.min(c.open, c.close) &&
    c.high >= c.low;
}

function clean(a) {
  return a
    .filter(valid)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .filter((c, i, s) => i === 0 || c.timestamp !== s[i - 1].timestamp);
}

async function yahooRequest(host, cfg) {
  return axios.get(`${host}/v8/finance/chart/${encodeURIComponent(SYMBOL)}`, {
    params: {
      interval: cfg.interval,
      range: cfg.range,
      events: "history",
      includePrePost: "true"
    },
    timeout: 9000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 RB-Gold-Sniper/4.0"
    }
  });
}

async function fetchCandles(timeframe) {
  const cfg = TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");

  let lastError = null;
  for (const host of HOSTS) {
    try {
      const r = await yahooRequest(host, cfg);
      const result = r?.data?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const q = result?.indicators?.quote?.[0] || {};
      if (!timestamps.length) throw new Error("Yahoo não devolveu candles");

      const candles = clean(timestamps.map((ts, i) => ({
        timestamp: new Date(Number(ts) * 1000).toISOString(),
        open: Number(q.open?.[i]),
        high: Number(q.high?.[i]),
        low: Number(q.low?.[i]),
        close: Number(q.close?.[i]),
        volume: Number(q.volume?.[i] || 0),
        complete: true
      }))).slice(-LIMIT);

      if (candles.length < 50) throw new Error(`Yahoo devolveu poucos candles (${candles.length})`);

      const now = Date.now();
      const lastCandle = candles[candles.length - 1];
      const candleTs = Date.parse(lastCandle.timestamp);
      const candleAgeSec = Math.max(0, Math.round((now - candleTs) / 1000));
      const metaPrice = Number(result?.meta?.regularMarketPrice);
      const price = Number.isFinite(metaPrice) ? metaPrice : lastCandle.close;

      return {
        success: true,
        source: "Yahoo Finance GC=F — ouro (proxy futuros)",
        symbol: SYMBOL,
        displaySymbol: "OANDA:XAUUSD",
        timeframe,
        candles,
        last: lastCandle,
        price: Number.isFinite(price) ? price : lastCandle.close,
        delayedBy: candleAgeSec,
        candleTimestamp: lastCandle.timestamp,
        quoteTimestamp: new Date().toISOString(),
        candleAgeSec,
        candleStartAgeSec: candleAgeSec,
        quoteAgeSec: 0,
        stale: candleAgeSec > cfg.stale,
        oandaLive: false,
        feedNotice: "Candles e preço pelo mesmo feed Yahoo GC=F; TradingView mostra OANDA:XAUUSD"
      };
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(`Feed Yahoo indisponível${lastError?.message ? `: ${lastError.message}` : ""}`);
}

async function getMarket(timeframe) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");

  const key = `yahoo:${SYMBOL}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  if (inflight.has(key)) return inflight.get(key);

  const p = fetchCandles(timeframe)
    .then(v => {
      cache.set(key, { t: Date.now(), v });
      inflight.delete(key);
      return v;
    })
    .catch(e => {
      inflight.delete(key);
      throw e;
    });

  inflight.set(key, p);
  return p;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const timeframe = String(req.query.timeframe || "1m");
    const m = await getMarket(timeframe);
    res.status(200).json(m);
  } catch (e) {
    console.error("MARKET ERROR", e.message);
    res.status(502).json({
      success: false,
      error: "Falha no feed de ouro",
      details: e.message,
      source: "Yahoo Finance GC=F"
    });
  }
}

handler.getMarket = getMarket;
module.exports = handler;
