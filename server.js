const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const TRADES_FILE = path.join(__dirname, "trades.json");
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
  const symbol = "GC=F";
  const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    params: { interval: cfg.interval, range: cfg.range, events: "history" },
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0 RB-Sniper" }
  });
  const x = r.data?.chart?.result?.[0];
  if (!x) throw new Error("Yahoo não devolveu dados XAUUSD");
  const q = x.indicators?.quote?.[0] || {};
  let candles = (x.timestamp || []).map((t, i) => ({
    timestamp: new Date(t * 1000).toISOString(),
    open: Number(q.open?.[i]), high: Number(q.high?.[i]), low: Number(q.low?.[i]), close: Number(q.close?.[i]), volume: Number(q.volume?.[i] || 0)
  })).filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  if (timeframe === "3m") candles = aggregate3m(candles);
  candles = candles.slice(-500);
  if (candles.length < 60) throw new Error(`Dados XAUUSD insuficientes (${candles.length} candles)`);
  return { source: "Yahoo Finance GC=F", symbol: "XAUUSD", timeframe, candles, last: candles.at(-1) };
}

async function oanda(timeframe) {
  const token = process.env.OANDA_API_TOKEN;
  if (!token) return null;
  const instrument = process.env.OANDA_INSTRUMENT || "XAU_USD";
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
  return { source: `OANDA ${instrument}`, symbol: "XAUUSD", timeframe, candles, last: candles.at(-1) };
}

async function market(timeframe) {
  if (!TF[timeframe]) throw new Error("Timeframe inválido");
  if (process.env.OANDA_API_TOKEN) {
    try { return await oanda(timeframe); } catch (e) { console.error("OANDA falhou:", e.message); }
  }
  return yahoo(timeframe);
}

async function readTradesFile() {
  try {
    const raw = await fs.promises.readFile(TRADES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeTradesFile(trades) {
  await fs.promises.writeFile(TRADES_FILE, JSON.stringify(trades, null, 2) + "\n", "utf8");
}

function githubConfigured() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

async function githubGetTrades() {
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_BRANCH || "fixed-app";
  const url = `https://api.github.com/repos/${repo}/contents/trades.json?ref=${encodeURIComponent(ref)}`;
  const r = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "RB-Gold-Sniper"
    },
    timeout: 10000
  });
  const content = Buffer.from(r.data.content.replace(/\\n/g, ""), "base64").toString("utf8");
  return { sha: r.data.sha, trades: Array.isArray(JSON.parse(content)) ? JSON.parse(content) : [] };
}

async function githubSaveTrades(trades) {
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_BRANCH || "fixed-app";
  const url = `https://api.github.com/repos/${repo}/contents/trades.json`;
  let current = await githubGetTrades();
  const merged = [...current.trades, ...trades.filter(t => !current.trades.some(x => String(x.id) === String(t.id)))];
  const content = Buffer.from(JSON.stringify(merged, null, 2) + "\n").toString("base64");
  const r = await axios.put(url, {
    message: "chore: guardar histórico de trades",
    content,
    sha: current.sha,
    branch: ref
  }, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "RB-Gold-Sniper"
    },
    timeout: 15000
  });
  return { trades: merged, commit: r.data.commit?.sha || null };
}

app.delete("/api/trades", async (_req, res) => {
  try {
    if (githubConfigured()) {
      const current = await githubGetTrades();
      const repo = process.env.GITHUB_REPO;
      const ref = process.env.GITHUB_BRANCH || "fixed-app";
      const url = `https://api.github.com/repos/${repo}/contents/trades.json`;
      const content = Buffer.from("[]\\n").toString("base64");
      const r = await axios.put(url, {
        message: "chore: limpar histórico de trades",
        content,
        sha: current.sha,
        branch: ref
      }, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "RB-Gold-Sniper" },
        timeout: 15000
      });
      return res.json({ success: true, persistent: true, file: "trades.json", trades: [], commit: r.data.commit?.sha || null });
    }
    await writeTradesFile([]);
    res.json({ success: true, persistent: true, file: "trades.json", trades: [] });
  } catch (e) {
    res.status(500).json({ success: false, error: "Falha a limpar trades.json", details: e.message });
  }
});

app.get("/api/trades", async (_req, res) => {
  try {
    const data = githubConfigured() ? await githubGetTrades() : { trades: await readTradesFile() };
    res.json({ success: true, persistent: githubConfigured(), file: "trades.json", trades: data.trades });
  } catch (e) {
    res.status(500).json({ success: false, error: "Não foi possível ler trades.json", details: e.message });
  }
});

app.post("/api/trades", async (req, res) => {
  try {
    const incoming = req.body && req.body.id ? [req.body] : Array.isArray(req.body) ? req.body : [];
    if (!incoming.length) return res.status(400).json({ success: false, error: "Trade inválida" });

    if (githubConfigured()) {
      const current = await githubGetTrades();
      const merged = [...current.trades];
      for (const trade of incoming) {
        if (!merged.some(x => String(x.id) === String(trade.id))) merged.push(trade);
      }
      const saved = await githubSaveTrades(merged);
      return res.json({ success: true, persistent: true, file: "trades.json", trades: saved.trades });
    }

    const current = await readTradesFile();
    for (const trade of incoming) {
      if (!current.some(x => String(x.id) === String(trade.id))) current.push(trade);
    }
    await writeTradesFile(current);
    res.json({ success: true, persistent: true, file: "trades.json", trades: current });
  } catch (e) {
    res.status(500).json({ success: false, persistent: false, error: "Falha a guardar trades.json", details: e.message });
  }
});

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
    const marketOpen = (() => { const d=new Date(); const day=d.getUTCDay(); const h=d.getUTCHours(); return day!==0 && day!==6 && h>=22 || day===1 && h>=0 || day>=2 && day<=5 || day===5 && h<22; })();
    res.json({ success: true, source: m.source, symbol: m.symbol, timeframe, candles: m.candles, price: p, bid: p, ask: p, spread: m.last.high - m.last.low, timestamp: m.last.timestamp, marketOpen });
  } catch (e) {
    res.status(502).json({ success: false, error: "Não foi possível obter dados reais do XAUUSD.", details: e.message });
  }
});

app.get("/api/mt5/status", (_req, res) => res.json({ connected: false, trading: false, mode: "MANUAL", message: "A app analisa. A execução é feita manualmente no MT5." }));
app.post("/api/mt5/connect", (_req, res) => res.json({ success: true, connected: false, mode: "MANUAL", message: "Execução automática desativada. Use o MT5 manualmente." }));
app.get("/api/settings", (_req, res) => res.json({ success: true, settings: { mode: "MANUAL", aiEnabled: false, symbol: "XAUUSD", source: process.env.OANDA_API_TOKEN ? "OANDA" : "Yahoo Finance GC=F" } }));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use((req, res) => res.status(404).json({ error: "Endpoint não encontrado", path: req.path }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Erro interno", message: err.message }); });

if (require.main === module) app.listen(PORT, () => console.log(`RB Sniper XAUUSD ativo em ${PORT}`));
module.exports = app;
