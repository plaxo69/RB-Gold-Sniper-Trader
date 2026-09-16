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

// Garante que a página principal abre corretamente também no Vercel/Express.
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

const TF = {
  "1m": { granularity: "M1" },
  "3m": { granularity: "M1" },
  "5m": { granularity: "M5" },
  "15m": { granularity: "M15" },
  "1h": { granularity: "H1" }
};

function aggregate3m(candles) {
  const out = [];

  for (const c of candles) {
    const bucket = Math.floor(new Date(c.timestamp).getTime() / 180000) * 180000;
    let g = out[out.length - 1];

    if (!g || g.bucket !== bucket) {
      g = {
        bucket,
        timestamp: new Date(bucket).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        bid: c.bid,
        ask: c.ask,
        volume: c.volume || 0
      };
      out.push(g);
    } else {
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close;
      if (Number.isFinite(c.bid)) g.bid = c.bid;
      if (Number.isFinite(c.ask)) g.ask = c.ask;
      g.volume += c.volume || 0;
    }
  }

  return out.map(({ bucket, ...c }) => c);
}

async function oanda(timeframe) {
  const token = process.env.OANDA_API_TOKEN;
  if (!token) {
    throw new Error("Configure OANDA_API_TOKEN para obter dados da corretora OANDA.");
  }

  const instrument = process.env.OANDA_INSTRUMENT || "XAU_USD";
  const environment = process.env.OANDA_ENVIRONMENT === "live" ? "live" : "practice";
  const baseUrl = environment === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";
  const granularity = TF[timeframe].granularity;

  const response = await axios.get(
    `${baseUrl}/v3/instruments/${instrument}/candles`,
    {
      params: {
        granularity,
        count: 500,
        price: "MBA"
      },
      timeout: 8000,
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  let candles = (response.data?.candles || [])
    .filter(c => c.complete !== false && c.mid)
    .map(c => ({
      timestamp: c.time,
      open: Number(c.mid.o),
      high: Number(c.mid.h),
      low: Number(c.mid.l),
      close: Number(c.mid.c),
      bid: Number(c.bid?.c),
      ask: Number(c.ask?.c),
      volume: Number(c.volume || 0)
    }))
    .filter(c =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    );

  if (timeframe === "3m") {
    candles = aggregate3m(candles);
  }

  candles = candles.slice(-300);

  if (!candles.length) {
    throw new Error("OANDA não devolveu candles");
  }

  return {
    source: `OANDA ${instrument} (${environment})`,
    symbol: instrument,
    timeframe,
    candles,
    last: candles[candles.length - 1]
  };
}

async function market(timeframe) {
  if (!TF[timeframe]) {
    throw new Error("Timeframe inválido");
  }
  return oanda(timeframe);
}

app.get("/api/health", async (_req, res) => {
  try {
    const m = await market("1m");
    res.json({
      status: "OK",
      marketConnected: true,
      source: m.source,
      symbol: m.symbol,
      aiEnabled: false,
      mode: "ALERTAS",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(503).json({
      status: "DEGRADED",
      marketConnected: false,
      aiEnabled: false,
      mode: "ALERTAS",
      error: e.message
    });
  }
});

app.get("/api/market", async (req, res) => {
  const timeframe = String(req.query.timeframe || "1m");

  try {
    const m = await market(timeframe);
    const p = m.last.close;
    const bid = Number.isFinite(m.last.bid) ? m.last.bid : null;
    const ask = Number.isFinite(m.last.ask) ? m.last.ask : null;

    res.json({
      success: true,
      source: m.source,
      symbol: m.symbol,
      timeframe,
      candles: m.candles,
      price: p,
      bid,
      ask,
      spread: bid !== null && ask !== null ? ask - bid : null,
      timestamp: m.last.timestamp
    });
  } catch (e) {
    res.status(502).json({
      success: false,
      error: "Não foi possível obter dados reais do ouro.",
      details: e.message
    });
  }
});

app.get("/api/settings", (_req, res) => {
  res.json({
    success: true,
    settings: {
      mode: "ALERTAS",
      aiEnabled: false,
      source: "OANDA",
      symbol: process.env.OANDA_INSTRUMENT || "XAU_USD"
    }
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint não encontrado",
    path: req.path
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: "Erro interno",
    message: err.message
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`RB Gold Sniper ativo em ${PORT}`));
}

module.exports = app;
