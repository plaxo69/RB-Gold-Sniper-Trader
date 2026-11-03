// Authenticated, fail-closed persistence for RB TRADER PRO history.
const crypto = require('node:crypto');

const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const BRANCH = process.env.HISTORY_BRANCH || 'main';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://rb-gold-sniper-trader.vercel.app,https://rb-gold-sniper-live-ai-sniper.vercel.app')
    .split(',').map((value) => value.trim()).filter(Boolean)
);

function json(res, status, body) {
  return res.status(status).json(body);
}

function authorized(req) {
  const expected = process.env.EXPORT_TOKEN;
  if (!expected || expected.length < 32) return false;
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(auth.slice(7).trim());
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && crypto.timingSafeEqual(supplied, secret);
}

function timestamp(trade) {
  const value = Date.parse(trade?.signalTimestamp || trade?.time || '');
  return Number.isFinite(value) ? value : null;
}

function keyOf(trade) {
  const key = trade?.signalKey || trade?.key;
  return typeof key === 'string' && key.length > 0 && key.length <= 200 ? key : null;
}

function validTrade(trade) {
  if (!trade || typeof trade !== 'object' || Array.isArray(trade)) return false;
  if (!['BUY', 'SELL'].includes(String(trade.type || '').toUpperCase())) return false;
  if (!['ALERTA', 'WIN', 'LOSS', 'BE'].includes(String(trade.status || 'ALERTA').toUpperCase())) return false;
  if (!keyOf(trade) || timestamp(trade) === null) return false;
  for (const field of ['price', 'tp', 'sl']) {
    if (trade[field] !== null && trade[field] !== undefined && !Number.isFinite(Number(trade[field]))) return false;
  }
  return true;
}

function mergeTrades(remoteTrades, incomingTrades) {
  if (!Array.isArray(remoteTrades) || remoteTrades.some((trade) => !validTrade(trade))) {
    throw new Error('Stored history contains invalid records; refusing to discard or overwrite any record.');
  }
  const map = new Map();
  for (const trade of remoteTrades) map.set(keyOf(trade), trade);
  for (const incoming of incomingTrades) {
    const key = keyOf(incoming);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, incoming);
      continue;
    }

    const oldStatus = String(previous.status || 'ALERTA').toUpperCase();
    const newStatus = String(incoming.status || 'ALERTA').toUpperCase();
    const oldResolved = oldStatus !== 'ALERTA';
    const newResolved = newStatus !== 'ALERTA';

    // Never let an incoming open trade undo a resolved result, nor let a
    // conflicting resolved result rewrite the already persisted outcome.
    if (oldResolved && (!newResolved || oldStatus !== newStatus)) continue;

    map.set(key, {
      ...previous,
      ...incoming,
      ...(oldResolved ? { status: oldStatus, resolvedAt: previous.resolvedAt || incoming.resolvedAt,
        outcomeReason: previous.outcomeReason || incoming.outcomeReason } : {})
    });
  }
  return [...map.values()].sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 500);
}

async function readExisting(headers) {
  const response = await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { headers });
  if (response.status === 404) return { sha: null, trades: [] };
  const metadata = await response.json();
  if (!response.ok) throw new Error(`GitHub history read failed (${response.status}).`);

  let raw;
  if (typeof metadata.content === 'string' && metadata.content.length) {
    raw = Buffer.from(metadata.content.replace(/\s/g, ''), 'base64').toString('utf8');
  } else {
    const rawResponse = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`, {
      headers: { 'User-Agent': 'RB-TRADER-PRO' }, cache: 'no-store'
    });
    if (!rawResponse.ok) throw new Error(`GitHub raw history read failed (${rawResponse.status}).`);
    raw = await rawResponse.text();
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Stored history is invalid JSON; refusing to overwrite it.'); }
  const trades = Array.isArray(parsed) ? parsed : parsed?.trades;
  if (!Array.isArray(trades)) throw new Error('Stored history has an invalid schema; refusing to overwrite it.');
  return { sha: metadata.sha || null, trades };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const origin = String(req.headers.origin || '');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(res, 403, { ok: false, error: 'Origin not allowed' });
  }
  if (!authorized(req)) {
    return json(res, process.env.EXPORT_TOKEN ? 403 : 503, {
      ok: false,
      error: process.env.EXPORT_TOKEN ? 'Authentication required.' : 'History writes are disabled until EXPORT_TOKEN (32+ characters) is configured.'
    });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) return json(res, 503, { ok: false, error: 'GITHUB_TOKEN is not configured.' });

  const incoming = req.body?.trades;
  if (!Array.isArray(incoming) || incoming.length > 500 || !incoming.every(validTrade)) {
    return json(res, 400, { ok: false, error: 'Invalid trades payload; expected at most 500 validated trade records.' });
  }

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'RB-TRADER-PRO'
  };

  try {
    let existing = await readExisting(headers);
    let result = null;
    let trades = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      trades = mergeTrades(existing.trades, incoming);
      const payload = {
        exportedAt: new Date().toISOString(), source: 'RB TRADER PRO',
        formatVersion: 2, total: trades.length, trades
      };
      const commit = await fetch(`${API}/repos/${REPO}/contents/${PATH}`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          message: `RB TRADER PRO — atualizar histórico — ${new Date().toISOString()}`,
          content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
          branch: BRANCH, ...(existing.sha ? { sha: existing.sha } : {})
        })
      });
      result = await commit.json();
      if (commit.ok) {
        return json(res, 200, {
          ok: true, branch: BRANCH, path: PATH, total: payload.total,
          commit: result.commit?.sha || null, url: result.content?.html_url || null
        });
      }
      if (commit.status !== 409 && commit.status !== 422) {
        return json(res, commit.status, { ok: false, error: result?.message || 'GitHub write failed.' });
      }
      existing = await readExisting(headers);
    }
    return json(res, 409, { ok: false, error: 'History changed concurrently; retry limit reached without overwriting newer data.' });
  } catch (error) {
    return json(res, 502, { ok: false, error: error.message || 'History persistence failed.' });
  }
};
