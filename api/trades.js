const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const BRANCH = 'main';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';

function send(res, status, body) {
  return res.status(status).json(body);
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeParseJson(str, fallback = null) {
  if (typeof str !== 'string' || !str.trim()) return fallback;
  try {
    return JSON.parse(str);
  } catch (error) {
    return fallback;
  }
}

function normalizeTrade(trade) {
  if (!trade || typeof trade !== 'object') return null;
  const type = String(trade.type || '').toUpperCase();
  const normalizedType = ['BUY', 'SELL'].includes(type) ? type : trade.type || 'UNKNOWN';
  const status = String(trade.status || 'ALERTA').toUpperCase();

  return {
    ...trade,
    type: normalizedType,
    status: ['WIN', 'LOSS', 'ALERTA', 'BE'].includes(status) ? status : 'ALERTA',
    price: toNumber(trade.price, null),
    tp: toNumber(trade.tp, null),
    sl: toNumber(trade.sl, null),
    signalTimestamp: trade.signalTimestamp || trade.time || null,
    signalKey: trade.signalKey || trade.key || `${normalizedType}-${trade.signalTimestamp || trade.time || Date.now()}`
  };
}

function parseHistoryPayload(payload) {
  if (Array.isArray(payload)) {
    return { trades: payload.map(normalizeTrade).filter(Boolean), sha: null, exportedAt: null };
  }

  if (payload && Array.isArray(payload.trades)) {
    return {
      trades: payload.trades.map(normalizeTrade).filter(Boolean),
      sha: payload.sha || null,
      exportedAt: payload.exportedAt || null
    };
  }

  return {
    trades: [],
    sha: payload?.sha || null,
    exportedAt: payload?.exportedAt || null
  };
}

async function readHistoryFromGitHub() {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RB-TRADER-PRO'
  };

  const r = await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { headers });
  if (r.status === 404) return { trades: [], sha: null, exportedAt: null };

  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || 'Falha ao ler histórico do GitHub.');

  if (data?.content) {
    const raw = Buffer.from(data.content, 'base64').toString('utf8');
    const parsed = safeParseJson(raw, null);
    if (!parsed) {
      return { trades: [], sha: data.sha || null, exportedAt: null, parseError: 'JSON inválido no GitHub.' };
    }
    return { ...parseHistoryPayload(parsed), sha: data.sha || null, exportedAt: parsed?.exportedAt || null };
  }

  const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`;
  const rawRes = await fetch(rawUrl, { headers: { 'User-Agent': 'RB-TRADER-PRO' } });
  if (!rawRes.ok) return { trades: [], sha: data?.sha || null, exportedAt: null };

  const rawText = await rawRes.text();
  const parsed = safeParseJson(rawText, null);
  if (!parsed) {
    return { trades: [], sha: data?.sha || null, exportedAt: null, parseError: 'JSON inválido em raw.githubusercontent.com.' };
  }

  return { ...parseHistoryPayload(parsed), sha: data?.sha || null, exportedAt: parsed?.exportedAt || null };
}

async function writeHistoryToGitHub(trades, sha) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'RB TRADER PRO',
    formatVersion: 2,
    total: Array.isArray(trades) ? trades.length : 0,
    trades: Array.isArray(trades) ? trades : []
  };

  const body = {
    message: `RB TRADER PRO — sync ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {})
  };

  const r = await fetch(`${API}/repos/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'RB-TRADER-PRO'
    },
    body: JSON.stringify(body)
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || 'Falha ao gravar histórico no GitHub.');
  return data;
}

function classifyPriceOutcome(trade, price) {
  if (!trade || !Number.isFinite(Number(price))) return null;
  const entry = Number(trade.price);
  const tp = Number(trade.tp);
  const sl = Number(trade.sl);

  if (!Number.isFinite(entry)) return null;

  if (trade.type === 'BUY') {
    if (Number.isFinite(tp) && price >= tp) return 'WIN';
    if (Number.isFinite(sl) && price <= sl) return 'LOSS';
    return 'ALERTA';
  }

  if (trade.type === 'SELL') {
    if (Number.isFinite(tp) && price <= tp) return 'WIN';
    if (Number.isFinite(sl) && price >= sl) return 'LOSS';
    return 'ALERTA';
  }

  return null;
}

async function getTradesList(limit = 1000) {
  const { trades, sha, exportedAt } = await readHistoryFromGitHub();
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  return {
    ok: true,
    trades: trades.slice(-safeLimit),
    total: trades.length,
    source: 'github',
    branch: BRANCH,
    exportedAt,
    sha
  };
}

async function resolveTrades() {
  const history = await readHistoryFromGitHub();
  const trades = Array.isArray(history.trades) ? history.trades : [];
  const market = await require('./market').getMarket('1m');
  const currentPrice = Number(market?.price ?? market?.last?.close ?? market?.candles?.at(-1)?.close ?? NaN);

  if (!Number.isFinite(currentPrice)) {
    return { ok: true, resolved: 0, updated: false, price: null, trades };
  }

  let resolved = 0;
  const next = trades.map((trade) => {
    const normalized = normalizeTrade(trade);
    if (!normalized || !['BUY', 'SELL'].includes(String(normalized.type || '').toUpperCase()) || normalized.status !== 'ALERTA') {
      return normalized || trade;
    }

    const outcome = classifyPriceOutcome(normalized, currentPrice);
    if (!outcome || outcome === 'ALERTA') return normalized;

    resolved += 1;
    return {
      ...normalized,
      status: outcome,
      resolvedAt: new Date().toISOString(),
      outcomePrice: currentPrice,
      resolutionSource: 'server'
    };
  });

  if (resolved > 0) {
    await writeHistoryToGitHub(next, history.sha);
  }

  return {
    ok: true,
    resolved,
    updated: resolved > 0,
    price: currentPrice,
    trades: next
  };
}

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const limit = Math.min(Math.max(parseInt(req.query?.limit || '1000', 10) || 1000, 1), 5000);
      const result = await getTradesList(limit);
      return send(res, 200, result);
    } catch (error) {
      return send(res, 500, { ok: false, error: error.message || 'Erro interno.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const result = await resolveTrades();
      return send(res, 200, result);
    } catch (error) {
      return send(res, 500, { ok: false, error: error.message || 'Erro interno.' });
    }
  }

  return send(res, 405, { ok: false, error: 'Method not allowed' });
}

module.exports = handler;
module.exports.getTradesList = getTradesList;
module.exports.resolveTrades = resolveTrades;
module.exports.readHistoryFromGitHub = readHistoryFromGitHub;
module.exports.writeHistoryToGitHub = writeHistoryToGitHub;
