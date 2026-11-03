const crypto = require('node:crypto');

const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const BRANCH = 'main';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';

function send(res, status, body) { return res.status(status).json(body); }
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function parseTimestamp(value) {
  const time = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}
function normalizeTrade(trade) {
  if (!trade || typeof trade !== 'object' || Array.isArray(trade)) return null;
  const type = String(trade.type || '').toUpperCase();
  const status = String(trade.status || 'ALERTA').toUpperCase();
  const signalTimestamp = trade.signalTimestamp || trade.time || null;
  const signalKey = trade.signalKey || trade.key || (signalTimestamp ? `${type}-${signalTimestamp}` : null);
  if (!['BUY', 'SELL'].includes(type) || !signalKey || parseTimestamp(signalTimestamp) === null) return null;
  return {
    ...trade, type,
    status: ['WIN', 'LOSS', 'ALERTA', 'BE'].includes(status) ? status : 'ALERTA',
    price: numberOrNull(trade.price), tp: numberOrNull(trade.tp), sl: numberOrNull(trade.sl),
    signalTimestamp, signalKey: String(signalKey)
  };
}
function parseHistoryPayload(payload) {
  const trades = Array.isArray(payload) ? payload : payload?.trades;
  if (!Array.isArray(trades)) throw new Error('Stored history has an invalid schema; refusing to continue.');
  return trades.map(normalizeTrade).filter(Boolean);
}

/**
 * Resolves only with ordered closed candles after the signal. Same-candle TP+SL
 * is conservatively a loss. BE arms at 50% favorable excursion and is terminal
 * only if a later closed candle returns to entry. The arm is returned so callers
 * can persist it across polls when its original candle falls out of the feed.
 */
function resolveTradeOutcomeFromCandles(trade, candles) {
  if (!trade || !Array.isArray(candles)) return { status: 'ALERTA', reason: 'Invalid trade or candles' };
  const type = String(trade.type || '').toUpperCase();
  const entry = numberOrNull(trade.price), tp = numberOrNull(trade.tp), sl = numberOrNull(trade.sl);
  const signalTime = parseTimestamp(trade.signalTimestamp || trade.time);
  if (!['BUY', 'SELL'].includes(type) || entry === null || tp === null || sl === null || signalTime === null) {
    return { status: 'ALERTA', reason: 'Trade levels or timestamp are invalid' };
  }
  const ordered = candles.map(candle => ({ candle, time: parseTimestamp(candle?.timestamp) }))
    .filter(({ candle, time }) => time !== null && time > signalTime && candle?.complete !== false && candle?.isOpen !== true)
    .sort((a, b) => a.time - b.time);

  const beDistance = Math.abs(tp - entry) * 0.5;
  let beArmedAt = trade.beArmedAt || null;
  let beTriggerPrice = numberOrNull(trade.beTriggerPrice);
  let beArmed = parseTimestamp(beArmedAt) !== null;

  for (const { candle, time } of ordered) {
    const high = numberOrNull(candle.high), low = numberOrNull(candle.low);
    if (high === null || low === null || high < low) continue;
    const hitTp = type === 'BUY' ? high >= tp : low <= tp;
    const hitSl = type === 'BUY' ? low <= sl : high >= sl;
    if (hitTp && hitSl) return { status: 'LOSS', reason: 'TP and SL touched in same candle; conservative outcome is LOSS', when: candle.timestamp };
    if (hitTp) return { status: 'WIN', reason: 'Take profit touched on a closed candle', when: candle.timestamp };
    if (hitSl) return { status: 'LOSS', reason: 'Stop loss touched on a closed candle', when: candle.timestamp };

    if (beArmed) {
      if (time > parseTimestamp(beArmedAt)) {
        const returned = type === 'BUY' ? low <= entry : high >= entry;
        if (returned) return {
          status: 'BE', reason: 'Price returned to entry on a later closed candle after 50% BE activation',
          when: candle.timestamp, beArmedAt, beTriggeredAt: candle.timestamp,
          beTriggerPrice: beTriggerPrice ?? entry + (type === 'BUY' ? beDistance : -beDistance), beExitPrice: entry
        };
      }
      continue;
    }

    const favorable = type === 'BUY' ? high - entry : entry - low;
    if (beDistance > 0 && favorable >= beDistance) {
      beArmed = true;
      beArmedAt = candle.timestamp;
      beTriggerPrice = entry + (type === 'BUY' ? beDistance : -beDistance);
    }
  }

  return {
    status: 'ALERTA', reason: 'No terminal result on closed candles',
    ...(beArmed ? { beArmedAt, beTriggerPrice, beArmed: true } : {})
  };
}

async function readHistoryFromGitHub() {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'RB-TRADER-PRO'
  };
  const response = await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { headers });
  if (response.status === 404) return { trades: [], sha: null, exportedAt: null };
  const metadata = await response.json();
  if (!response.ok) throw new Error(metadata?.message || 'Failed to read history from GitHub.');
  let raw;
  if (typeof metadata.content === 'string' && metadata.content.length) {
    raw = Buffer.from(metadata.content.replace(/\s/g, ''), 'base64').toString('utf8');
  } else {
    const rawResponse = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`, { cache: 'no-store' });
    if (!rawResponse.ok) throw new Error(`Failed to read raw history (${rawResponse.status}); refusing to treat it as empty.`);
    raw = await rawResponse.text();
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Stored history is invalid JSON; refusing to treat it as empty.'); }
  return { trades: parseHistoryPayload(parsed), sha: metadata.sha || null, exportedAt: parsed?.exportedAt || null };
}

async function writeHistoryToGitHub(trades, sha) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not configured; history write disabled.');
  const payload = { exportedAt: new Date().toISOString(), source: 'RB TRADER PRO', formatVersion: 2, total: trades.length, trades };
  const response = await fetch(`${API}/repos/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'RB-TRADER-PRO'
    },
    body: JSON.stringify({
      message: `RB TRADER PRO — resolve closed-candle history — ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
      branch: BRANCH, ...(sha ? { sha } : {})
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message || 'Failed to write history to GitHub.');
  return result;
}

function validResolveToken(req) {
  const expected = process.env.TRADE_RESOLVE_TOKEN;
  if (!expected || expected.length < 32) return false;
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(auth.slice(7).trim()), secret = Buffer.from(expected);
  return supplied.length === secret.length && crypto.timingSafeEqual(supplied, secret);
}

async function getTradesList(limit = 1000) {
  const { trades, sha, exportedAt } = await readHistoryFromGitHub();
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  return { ok: true, trades: trades.slice(-safeLimit), total: trades.length, source: 'github', branch: BRANCH, exportedAt, sha };
}

async function resolveTrades() {
  const history = await readHistoryFromGitHub();
  const market = await require('./market').getMarket('1m', 2000);
  const candles = market.candles || [];
  let changed = false;
  let resolved = 0;
  const next = history.trades.map((trade) => {
    if (trade.status !== 'ALERTA') return trade;
    const outcome = resolveTradeOutcomeFromCandles(trade, candles);
    if (outcome.status !== 'ALERTA') {
      changed = true;
      resolved += 1;
      return {
        ...trade, status: outcome.status, resolvedAt: outcome.when,
        outcomeReason: outcome.reason, resolutionSource: 'closed-candles',
        ...(outcome.beArmedAt ? { beArmedAt: outcome.beArmedAt, beTriggeredAt: outcome.beTriggeredAt,
          beTriggerPrice: outcome.beTriggerPrice, beExitPrice: outcome.beExitPrice } : {})
      };
    }
    if (outcome.beArmedAt && (trade.beArmedAt !== outcome.beArmedAt || trade.beTriggerPrice !== outcome.beTriggerPrice)) {
      changed = true;
      return { ...trade, beArmed: true, beArmedAt: outcome.beArmedAt, beTriggerPrice: outcome.beTriggerPrice };
    }
    return trade;
  });

  if (changed) await writeHistoryToGitHub(next, history.sha);
  return { ok: true, resolved, updated: changed, trades: next };
}

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const limit = Math.min(Math.max(parseInt(req.query?.limit || '1000', 10) || 1000, 1), 5000);
      return send(res, 200, await getTradesList(limit));
    } catch (error) { return send(res, 502, { ok: false, error: error.message || 'History read failed.' }); }
  }
  if (req.method === 'POST') {
    if (!validResolveToken(req)) return send(res, process.env.TRADE_RESOLVE_TOKEN ? 403 : 503, { ok: false, error: 'Authenticated server-side resolution is not enabled.' });
    try { return send(res, 200, await resolveTrades()); }
    catch (error) { return send(res, 502, { ok: false, error: error.message || 'Trade resolution failed.' }); }
  }
  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { ok: false, error: 'Method not allowed' });
}

module.exports = handler;
module.exports.getTradesList = getTradesList;
module.exports.resolveTrades = resolveTrades;
module.exports.readHistoryFromGitHub = readHistoryFromGitHub;
module.exports.writeHistoryToGitHub = writeHistoryToGitHub;
module.exports.resolveTradeOutcomeFromCandles = resolveTradeOutcomeFromCandles;
