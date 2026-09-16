const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

const TF = {
  "1m": { interval: "1m", range: "7d" },
  "3m": { interval: "1m", range: "7d" },
  "5m": { interval: "5m", range: "1mo" },
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
  const cfg = TF[timeframe];
  const symbol = "XAUUSD=X";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
  const response = await axios.get(url, {
    params: { interval: cfg.interval, range: cfg.range, includePrePost: true, events: "div,splits" },
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0 RB-Gold-Sniper/1.0" }
  });

  const result = response.data?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance não devolveu dados para XAU/USD");

  const q = result.indicators?.quote?.[0] || {};
  let candles = (result.timestamp || []).map((ts, i) => ({
    timestamp: new Date(ts * 1000).toISOString(),
    open: Number(q.open?.[i]),
    high: Number(q.high?.[i]),
    low: Number(q.low?.[i]),
    close: Number(q.close?.[i]),
    volume: Number(q.volume?.[i] || 0)
  })).filter(c => [c.open,c.high,c.low,c.close].every(Number.isFinite));

  if (timeframe === "3m") candles = aggregate3m(candles);
  candles = candles.slice(-300);
  if (!candles.length) throw new Error("Yahoo Finance não devolveu candles válidos");

  const meta = result.meta || {};
  const last = candles[candles.length - 1];
  const livePrice = Number(meta.regularMarketPrice);
  if (Number.isFinite(livePrice)) last.close = livePrice;

  return {
    source: "Yahoo Finance XAU/USD (sem API key)",
    symbol,
    timeframe,
    candles,
    last
  };
}

async function market(timeframe) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  return yahoo(timeframe);
}

app.get("/api/health", async (_req, res) => {
  try {
    const m = await market("1m");
    res.json({ status: "OK", marketConnected: true, source: m.source, symbol: m.symbol, aiEnabled: false, mode: "ALERTAS", timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: "DEGRADED", marketConnected: false, aiEnabled: false, mode: "ALERTAS", error: e.message });
  }
});

app.get("/api/market", async (req, res) => {
  const timeframe = String(req.query.timeframe || "1m");
  try {
    const m = await market(timeframe);
    const p = m.last.close;
    res.json({ success: true, source: m.source, symbol: m.symbol, timeframe, candles: m.candles, price: p, bid: null, ask: null, spread: null, timestamp: m.last.timestamp });
  } catch (e) {
    res.status(502).json({ success: false, error: "Não foi possível obter dados do ouro.", details: e.message });
  }
});

app.get("/api/settings", (_req, res) => {
  res.json({ success: true, settings: { mode: "ALERTAS", aiEnabled: false, source: "Yahoo Finance", symbol: "XAUUSD=X" } });
});

app.use((req, res) => res.status(404).json({ error: "Endpoint não encontrado", path: req.path }));
app.use((err, _req, res, _next) => res.status(500).json({ error: "Erro interno", message: err.message }));

if (require.main === module) app.listen(PORT, () => console.log(`RB Gold Sniper ativo em ${PORT}`));
module.exports = app;
