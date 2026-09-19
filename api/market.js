const axios = require("axios");

// Multi-asset market feed. TradingView remains the visual chart.
// The Sniper engine receives the same OHLC structure; only the selected asset changes.
const BASE = "https://biquote.io/api";
const ASSETS = {
  XAUUSD: { displaySymbol: "OANDA:XAUUSD", label: "Ouro", stale: { "1m": 150, "5m": 720, "15m": 1500, "1h": 5400 } },
  BTCUSD: { displaySymbol: "BTCUSD", label: "Bitcoin", stale: { "1m": 150, "5m": 720, "15m": 1500, "1h": 5400 } }
};
const TF = {
  "1m": { interval: "1m", limit: 500 },
  "5m": { interval: "5m", limit: 500 },
  "15m": { interval: "15m", limit: 500 },
  "1h": { interval: "1h", limit: 500 }
};
const cache = new Map();
const inflight = new Map();
const CACHE_MS = 5000;

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
    timeout: 9000,
    headers: { Accept: "application/json", "User-Agent": "RB-Gold-Sniper/5.4" }
  });
}

async function fetchCandles(symbol, timeframe) {
  const asset = ASSETS[symbol];
  const cfg = TF[timeframe];
  if (!asset) throw new Error("Ativo inválido");
  if (!cfg) throw new Error("Timeframe inválido");

  const [br, tr] = await Promise.all([
    request(`${symbol}/ohlc`, { interval: cfg.interval, limit: cfg.limit }),
    request(symbol, { allowStale: true })
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

  if (candles.length < 50) throw new Error(`Biquote devolveu poucos candles (${candles.length})`);

  const now = Date.now();
  const tick = tr.data || {};
  const livePrice = Number(tick.mid);
  const quoteAge = Number(tick.quoteAgeSeconds);
  const marketState = String(tick.marketState || "unknown").toLowerCase();
  const quoteTimestamp = tick.timestamp || tick.lastQuoteAt || null;
  const last = candles[candles.length - 1];
  const lastTs = Date.parse(last.timestamp);
  const age = Number.isFinite(lastTs) ? Math.max(0, Math.round((now - lastTs) / 1000)) : Number.POSITIVE_INFINITY;

  // Never fabricate candles. M1 signals require the real open candle and fresh quote.
  const realOpenBar = last.isOpen === true;
  const quoteFresh = Number.isFinite(quoteAge) && quoteAge <= 15;
  const marketOpen = marketState === "open";
  const stale = !marketOpen || !Number.isFinite(quoteAge) || quoteAge > 300 ||
    !Number.isFinite(age) || age > asset.stale[timeframe] ||
    (timeframe === "1m" && !realOpenBar && age > 60);
  const price = Number.isFinite(livePrice) ? livePrice : last.close;

  return {
    success: true,
    source: `Biquote ${symbol} — feed MT5`,
    symbol,
    displaySymbol: asset.displaySymbol,
    assetLabel: asset.label,
    timeframe,
    candles,
    last,
    price: Number.isFinite(price) ? price : last.close,
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
    feedNotice: `${symbol}/MT5 com candle OHLC real; M1 usa apenas o candle aberto oficial do feed; nenhum candle é inventado; M5/M15/H1 permanecem oficiais; TradingView mostra ${asset.displaySymbol}`
  };
}

async function getMarket(symbol, timeframe) {
  if (!ASSETS[symbol]) throw new Error("Ativo inválido");
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  const key = `biquote:${symbol}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchCandles(symbol, timeframe)
    .then(v => { cache.set(key, { t: Date.now(), v }); inflight.delete(key); return v; })
    .catch(e => { inflight.delete(key); throw e; });
  inflight.set(key, p);
  return p;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const symbol = String(req.query.symbol || "XAUUSD").toUpperCase();
    const timeframe = String(req.query.timeframe || "1m");
    const m = await getMarket(symbol, timeframe);
    res.status(200).json(m);
  } catch (e) {
    console.error("MARKET ERROR", e.message);
    res.status(502).json({ success: false, error: "Falha no feed de mercado", details: e.message });
  }
}

handler.getMarket = (symbol, timeframe) => getMarket(symbol, timeframe);
handler.assets = ASSETS;
module.exports = handler;
