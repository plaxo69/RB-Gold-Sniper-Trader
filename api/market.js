const axios = require("axios");

// Primary feed: Binance PAXG/USDT spot. PAXG represents one troy ounce of
// allocated gold, so it is used here as the live XAU/USD proxy while TradingView
// continues to display OANDA:XAUUSD visually.
const BASE = "https://api.binance.com";
const PRODUCT = "PAXGUSDT";
const TF = {
  "1m": { interval: "1m" },
  "5m": { interval: "5m" },
  "15m": { interval: "15m" },
  "1h": { interval: "1h" }
};

const cache = new Map();
const inflight = new Map();
const CACHE_MS = 5000;
const LIMIT = 500;

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
        timeout: 8000,
        headers: {
          Accept: "application/json",
          "User-Agent": "RB-Gold-Sniper/2.0"
        }
      });
    } catch (e) {
      last = e;
      if (i < 2) await sleep(350 * (i + 1));
    }
  }
  throw last;
}

async function fetchCandles(timeframe) {
  const cfg = TF[timeframe];
  if (!cfg) throw new Error("Timeframe inválido");

  const [cr, tr] = await Promise.all([
    request(`${BASE}/api/v3/klines`, {
      symbol: PRODUCT,
      interval: cfg.interval,
      limit: LIMIT
    }),
    request(`${BASE}/api/v3/ticker/price`, {
      symbol: PRODUCT
    })
  ]);

  if (!Array.isArray(cr.data) || !cr.data.length) {
    throw new Error("Binance não devolveu candles PAXG/USDT");
  }

  const now = Date.now();
  const candles = clean(cr.data.map(x => {
    const ts = Number(x[0]);
    const closeTime = Number(x[6]);
    return {
      timestamp: new Date(ts).toISOString(),
      open: Number(x[1]),
      high: Number(x[2]),
      low: Number(x[3]),
      close: Number(x[4]),
      volume: Number(x[5] || 0),
      closeTime: new Date(closeTime).toISOString(),
      complete: closeTime <= now
    };
  })).slice(-300);

  if (candles.length < 50) {
    throw new Error(`Binance devolveu poucos candles (${candles.length})`);
  }

  const lastCandle = candles[candles.length - 1];
  const candleTs = Date.parse(lastCandle.timestamp);
  const candleAgeSec = Math.max(0, Math.round((now - candleTs) / 1000));
  const tickerPrice = Number(cr?.data?.[cr.data.length - 1]?.[4]);
  const livePrice = Number(tr?.data?.price);
  const price = Number.isFinite(livePrice) ? livePrice : tickerPrice;
  const quoteTimestamp = new Date().toISOString();

  // Binance klines are refreshed continuously. A candle may be the currently
  // forming candle, so its opening timestamp can be up to one timeframe old.
  // For M1 the hard safety limit is 150s; this prevents stale feeds from ever
  // generating a sniper signal.
  const staleLimit = timeframe === "1m" ? 150 : Math.max(240, {
    "5m": 720,
    "15m": 1500,
    "1h": 5400
  }[timeframe] || 720);

  return {
    success: true,
    source: "Binance PAXG/USDT — ouro spot (proxy)",
    symbol: "PAXG/USDT",
    displaySymbol: "OANDA:XAUUSD",
    timeframe,
    candles,
    last: lastCandle,
    price: Number.isFinite(price) ? price : lastCandle.close,
    delayedBy: candleAgeSec,
    candleTimestamp: lastCandle.timestamp,
    quoteTimestamp,
    candleAgeSec,
    candleStartAgeSec: candleAgeSec,
    quoteAgeSec: 0,
    stale: candleAgeSec > staleLimit,
    oandaLive: false,
    feedNotice: "Preço e candles ao vivo PAXG/USDT; TradingView mostra OANDA:XAUUSD"
  };
}

async function getMarket(timeframe) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");

  const key = `binance:${PRODUCT}:${timeframe}`;
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
      source: "Binance PAXG/USDT"
    });
  }
}

handler.getMarket = getMarket;
module.exports = handler;
