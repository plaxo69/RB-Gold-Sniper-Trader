const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const TF = {
  "1m": { interval: "1m", range: "1d" },
  "3m": { interval: "1m", range: "1d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "3mo" }
};

function aggregate3m(candles) {
  const out = [];
  for (const c of candles) {
    const bucket = Math.floor(new Date(c.timestamp).getTime() / 180000) * 180000;
    let g = out[out.length - 1];
    if (!g || g.bucket !== bucket) {
      g = { bucket, timestamp: new Date(bucket).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 };
      out.push(g);
    } else {
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close;
      g.volume += c.volume || 0;
    }
  }
  return out.map(({ bucket, ...c }) => c);
}

async function yahoo(timeframe) {
  const cfg = TF[timeframe] || TF["1m"];
  const symbol = "BTC-USD";
  const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    params: { interval: cfg.interval, range: cfg.range, events: "history" },
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0 RB-Sniper" }
  });
  const x = r.data?.chart?.result?.[0];
  if (!x) throw new Error("Yahoo não devolveu dados BTCUSD");
  const q = x.indicators?.quote?.[0] || {};
  let candles = (x.timestamp || []).map((t, i) => ({
    timestamp: new Date(t * 1000).toISOString(),
    open: Number(q.open?.[i]), high: Number(q.high?.[i]), low: Number(q.low?.[i]), close: Number(q.close?.[i]), volume: Number(q.volume?.[i] || 0)
  })).filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  if (timeframe === "3m") candles = aggregate3m(candles);
  candles = candles.slice(-500);
  if (candles.length < 60) throw new Error(`Dados BTCUSD insuficientes (${candles.length} candles)`);
  return { source: "Yahoo Finance BTC-USD", symbol: "BTCUSD", timeframe, candles, last: candles.at(-1) };
}

async function oanda(timeframe) {
  const token = process.env.OANDA_API_TOKEN;
  if (!token) return null;
  const instrument = process.env.OANDA_INSTRUMENT || "BTC_USD";
  const granularity = { "1m": "M1", "3m": "M1", "5m": "M5", "15m": "M15", "1h": "H1" }[timeframe] || "M1";
  const r = await axios.get(`https://api-fxtrade.oanda.com/v3/instruments/${instrument}/candles`, {
    params: { granularity, count: 500, price: "M" }, timeout: 10000,
    headers: { Authorization: `Bearer ${token}` }
  });
  let candles = (r.data?.candles || []).filter(c => c.complete !== false && c.mid).map(c => ({
    timestamp: c.time, open: Number(c.mid.o), high: Number(c.mid.h), low: Number(c.mid.l), close: Number(c.mid.c), volume: Number(c.volume || 0)
  })).filter(c => Number.isFinite(c.close));
  if (timeframe === "3m") candles = aggregate3m(candles);
  candles = candles.slice(-500);
  if (candles.length < 60) throw new Error("OANDA devolveu poucos candles");
  return { source: `OANDA ${instrument}`, symbol: "BTCUSD", timeframe, candles, last: candles.at(-1) };
}

async function market(timeframe) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  if (process.env.OANDA_API_TOKEN) {
    try { return await oanda(timeframe); } catch (e) { console.error("OANDA falhou:", e.message); }
  }
  return yahoo(timeframe);
}

app.get("/api/health", async (_req, res) => {
  try {
    const m = await market("1m");
    res.json({ status: "OK", marketConnected: true, source: m.source, symbol: m.symbol, aiEnabled: false, mode: "MANUAL", marketOpen: true, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: "DEGRADED", marketConnected: false, aiEnabled: false, mode: "MANUAL", error: e.message });
  }
});

app.get("/api/market", async (req, res) => {
  const timeframe = String(req.query.timeframe || "1m");
  try {
    const m = await market(timeframe);
    const p = m.last.close;
    res.json({ success: true, source: m.source, symbol: m.symbol, timeframe, candles: m.candles, price: p, bid: p, ask: p, spread: m.last.high - m.last.low, timestamp: m.last.timestamp, marketOpen: true });
  } catch (e) {
    res.status(502).json({ success: false, error: "Não foi possível obter dados reais do BTCUSD.", details: e.message });
  }
});

app.get("/api/mt5/status", (_req, res) => res.json({ connected: false, trading: false, mode: "MANUAL", message: "A app analisa. A execução é feita manualmente no MT5." }));
app.post("/api/mt5/connect", (_req, res) => res.json({ success: true, connected: false, mode: "MANUAL", message: "Execução automática desativada. Use o MT5 manualmente." }));
app.get("/api/settings", (_req, res) => res.json({ success: true, settings: { mode: "MANUAL", aiEnabled: false, symbol: "BTCUSD", source: process.env.OANDA_API_TOKEN ? "OANDA" : "Yahoo Finance BTC-USD" } }));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use((req, res) => res.status(404).json({ error: "Endpoint não encontrado", path: req.path }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Erro interno", message: err.message }); });

if (require.main === module) app.listen(PORT, () => console.log(`RB Sniper BTCUSD ativo em ${PORT}`));
module.exports = app;
