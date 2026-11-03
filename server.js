const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const marketModule = require('./api/market');
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const AI_OPINION_TOKEN = process.env.AI_OPINION_TOKEN || null;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://rb-gold-sniper-trader.vercel.app,https://rb-gold-sniper-live-ai-sniper.vercel.app').split(',').map((value) => value.trim()).filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? ALLOWED_ORIGINS.includes(origin) : false;
  } catch (error) {
    return false;
  }
}

function requireAiToken(req, res, next) {
  if (!AI_OPINION_TOKEN) {
    return res.status(503).json({ success: false, error: 'AI opinion disabled. Set AI_OPINION_TOKEN to enable this endpoint.' });
  }

  const auth = String(req.headers.authorization || '');
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (provided !== AI_OPINION_TOKEN) {
    return res.status(403).json({ success: false, error: 'Unauthorized.' });
  }

  return next();
}

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'));
  },
  credentials: false
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const market = marketModule.getMarket;

async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const response = await axios.get(url, { params: { interval: '1m', range: '1d' } });
  const result = response.data?.chart?.result?.[0];
  return result || null;
}

async function spotReference() {
  const futures = await yahooQuote('GC=F');
  return { calibrated: false, offset: 0, futures, spot: null, source: 'Yahoo Finance GC=F — referência' };
}

function extractAIText(d) {
  if (typeof d?.output_text === 'string' && d.output_text.trim()) return d.output_text.trim();
  const parts = [];
  for (const item of Array.isArray(d?.output) ? d.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function parseConfidence(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const match = String(v ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

async function aiOpinion(signal, marketData) {
  if (!OPENAI_API_KEY) {
    return { available: false, confidence: null, opinion: 'NEUTRO', note: 'IA indisponível' };
  }

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'Responda em português. Dê uma opinião técnica curta e útil para XAUUSD. Não invente dados.' },
      { role: 'user', content: JSON.stringify({ technicalSignal: signal?.type || 'WAIT', marketData, notes: 'Trader manual e sem execução automática.' }) }
    ],
    temperature: 0.2
  };

  const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    timeout: 20000
  });

  const text = extractAIText(response.data);
  // Token usage is not a confidence score; never fabricate a percentage.

  return {
    available: true,
    confidence: null,
    opinion: text || 'NEUTRO',
    note: 'IA consultada com feedback técnico.'
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    const m = await market('1m');
    res.json({ status: 'OK', marketConnected: true, source: m.source, symbol: m.symbol, history: 'github', aiEnabled: Boolean(OPENAI_API_KEY) });
  } catch (error) {
    res.status(502).json({ status: 'ERROR', marketConnected: false, error: error.message || 'Market unavailable' });
  }
});

app.get('/api/oanda-reference', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...(await spotReference()) });
  } catch (error) {
    res.status(502).json({ success: false, calibrated: false, source: 'Yahoo Finance GC=F', error: error.message || 'Fallback unavailable' });
  }
});

app.get('/api/market', async (req, res) => {
  try {
    const m = await market(String(req.query.timeframe || '1m'));
    res.json({ success: true, ...m, price: m.price ?? m.last?.close, quoteTimestamp: m.quoteTimestamp ?? m.last?.timestamp });
  } catch (error) {
    res.status(502).json({ success: false, error: 'Falha no feed XAUUSD', details: error.message || 'Market unavailable', source: 'Biquote XAUUSD' });
  }
});

app.post('/api/ai/opinion', requireAiToken, async (req, res) => {
  try {
    const signal = req.body?.signal || null;
    const candles = Array.isArray(req.body?.candles) ? req.body.candles : [];
    const result = await aiOpinion(signal, candles);
    res.json({ success: true, ...result, model: OPENAI_MODEL });
  } catch (error) {
    console.error('AI opinion error:', error.message || error);
    res.status(502).json({ success: false, error: 'Falha ao consultar a IA', details: error.message || 'Unknown error' });
  }
});

app.listen(PORT, () => {
  console.log(`RB Gold Sniper running on port ${PORT}`);
});
