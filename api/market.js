const axios = require("axios");

// Stable public gold feed for the Vercel serverless runtime.
// PAXG is a token representing one troy ounce of gold. TradingView remains
// OANDA:XAUUSD visually, while the analysis uses one consistent PAXG/USD feed.
const BASE = "https://api.exchange.coinbase.com";
const PRODUCT = "PAXG-USD";
const TF = {
  "1m": { granularity: 60, stale: 150 },
  "5m": { granularity: 300, stale: 720 },
  "15m": { granularity: 900, stale: 1500 },
  "1h": { granularity: 3600, stale: 5400 }
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function request(url, params) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      return await axios.get(url, {
        params,
        timeout: 9000,
        headers: {
          Accept: "application/json",
          "User-Agent": "RB-Gold-Sniper/3.0"
        }
      });
    } catch (e) {
      last = e;
      if (i < 2) await sleep(400 * (i + 1));
    }
  }
  throw last;
}

async function fetchCandles(timeframe) {
  const cfg = TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");

  const [cr, tr] = await Promise.all([
    request(`${BASE}/products/${PRODUCT}/candles`, {
      granularity: cfg.granularity,
      limit: LIMIT
    }),
    request(`${BASE}/products/${PRODUCT}/ticker`)
  ]);

  if (!Array.isArray(cr.data) || !cr.data.length) {
    throw new Error("Coinbase não devolveu candles PAXG/USD");
  }

  const now = Date.now();
  const candles = clean(cr.data.map(x => {
    // Coinbase Exchange candle: [time, low, high, open, close, volume]
    const ts = Number(x[0]) * 1000;
    return {
      timestamp: new Date(ts).toISOString(),
      open: Number(x[3]),
      high: Number(x[2]),
      low: Number(x[1]),
      close: Number(x[4]),
      volume: Number(x[5] || 0),
      closeTime: new Date(ts + cfg.granularity * 1000 - 1).toISOString(),
      complete: ts + cfg.granularity * 1000 <= now
    };
  })).slice(-LIMIT);

  if (candles.length < 50) {
    throw new Error(`Coinbase devolveu poucos candles (${candles.length})`);
  }

  const lastCandle = candles[candles.length - 1];
  const candleTs = Date.parse(lastCandle.timestamp);
  const candleAgeSec = Math.max(0, Math.round((now - candleTs) / 1000));
  const livePrice = Number(tr?.data?.price);
  const price = Number.isFinite(livePrice) ? livePrice : lastCandle.close;

  return {
    success: true,
    source: "Coinbase PAXG/USD — ouro spot (proxy)",
    symbol: "PAXG/USD",
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
    feedNotice: "Preço e candles ao vivo PAXG/USD; TradingView mostra OANDA:XAUUSD"
  };
}

async function getMarket(timeframe) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");

  const key = `coinbase:${PRODUCT}:${timeframe}`;
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
      source: "Coinbase PAXG/USD"
    });
  }
}

handler.getMarket = getMarket;
module.exports = handler;
