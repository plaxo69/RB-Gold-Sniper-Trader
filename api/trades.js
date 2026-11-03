const crypto = require('node:crypto');

const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const BRANCH = 'main';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';

function send(res, status, body) {
  return res.status(status).json(body);
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTrade(trade) {
  if (!trade || typeof trade !== 'object' || Array.isArray(trade)) return null;
  const type = String(trade.type || '').toUpperCase();
  const status = String(trade.status || 'ALERTA').toUpperCase();
  const timestamp = trade.signalTimestamp || trade.time || null;
  const key = trade.signalKey || trade.key || (timestamp ? `${type}-${timestamp}` : null);
  if (!['BUY', 'SELL'].includes(type) || !key || !timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  return {
    ...trade,
    type,
    status: ['WIN', 'LOSS', 'ALERTA', 'BE'].includes(status) ? status : 'ALERTA',
    price: safeNumber(trade.price),
    tp: safeNumber(trade.tp),
    sl: safeNumber(trade.sl),
    signalTimestamp: timestamp,
    signalKey: String(key)
  };
}

function parseHistoryPayload(payload) {
  const list = Array.isArray(payload) ? payload : payload?.trades;
  if (!Array.isArray(list)) throw new Error('Stored history has an invalid schema; refusing to continue.');
  return list.map(normalizeTrade).filter(Boolean);
}

function parseTimestamp(value) {
  const result = Date.parse(value || '');
  return Number.isFinite(result) ? result : null;
}

/** Resolve only with chronologically ordered, closed candles after signal time.
 * TP/SL take priority within each candle. If both are touched in one candle,
 * use the conservative LOSS assumption because OHLC cannot identify intrabar order.
 * BE is terminal only after a prior closed candle reached the 50% threshold and
 * a subsequent closed candle returned to entry.
 */
function resolveTradeOutcomeFromCandles(trade, candles) {
  if (!trade || !Array.isArray(candles)) return { status: 'ALERTA', reason: 'Invalid trade or candles' };
  const type = String(trade.type || '').toUpperCase();
  const entry = safeNumber(trade.price);
  const tp = safeNumber(trade.tp);
  const sl = safeNumber(trade.sl);
  const signalTime = parseTimestamp(trade.signalTimestamp || trade.time);
  if (!['BUY', 'SELL'].includes(type) || entry === null || tp === null || sl === null || signalTime === null) {
    return { status: 'ALERTA', reason: 'Trade levels or timestamp are invalid' };
  }

  const ordered = candles.map((candle) => ({ candle, time: parseTimestamp(candle?.timestamp) }))
    .filter(({ candle, time }) => time !== null && time > signalTime && candle?.complete !== false && candle?.isOpen !== true)
    .sort((a, b) => a.time - b.time);

  let beArmed = false;
  let beArmedAt = null;
  const beDistance = Math.abs(tp - entry) * 0.5;

  for (const { candle } of ordered) {
    const high = safeNumber(candle.high);
    const low = safeNumber(candle.low);
    if (high === null || low === null || high < low) continue;

    const hitTp = type === 'BUY' ? high >= tp : low <= tp;
    const hitSl = type === 'BUY' ? low <= sl : high >= sl;
    if (hitTp && hitSl) return { status: 'LOSS', reason: 'TP and SL touched in same candle; conservative outcome is LOSS', when: candle.timestamp };
    if (hitTp) return { status: 'WIN', reason: 'Take profit touched on a closed candle', when: candle.timestamp };
    if (hitSl) return { status: 'LOSS', reason: 'Stop loss touched on a closed candle', when: candle.timestamp };

    if (!beArmed && beDistance > 0) {
      const favorable = type === 'BUY' ? high - entry : entry - low;
      if (favorable >= beDistance) {
        beArmed = true;
        beArmedAt = candle.timestamp;
        continue;
      }
    } else if (beArmed) {
      const returned = type === 'BUY' ? low <= entry : high >= entry;
      if (returned) {
        return {
          status: 'BE',
          reason: 'Price returned to entry on a later closed candle after BE activation at 50% of target distance',
          when: candle.timestamp,
          beArmedAt,
          beTriggeredAt: candle.timestamp,
          beTriggerPrice: entry + (type === 'BUY' ? beDistance : -beDistance),
          beExitPrice: entry
        };
      }
    }
  }

  return { status: 'ALERTA', reason: 'No closed-candle resolution' };
}

async function readHistoryFromGitHub() {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RB-TRADER-PRO'
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
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'RB-TRADER-PRO'
    },
    body: JSON.stringify({
      message: `RB TRADER PRO — resolve closed-candle history — ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {})
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
  const supplied = Buffer.from(auth.slice(7).trim());
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && crypto.timingSafeEqual(supplied, secret);
}

async function getTradesList(limit = 1000) {
  const { trades, sha, exportedAt } = await readHistoryFromGitHub();
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  return { ok: true, trades: trades.slice(-safeLimit), total: trades.length, source: 'github', branch: BRANCH, exportedAt, sha };
}

async function resolveTrades() {
  const history = await readHistoryFromGitHub();
  let market;
  try { market = await require('./market').getMarket('1m', 2000); }
  catch { return { ok: true, resolved: 0, updated: false, trades: history.trades }; }

  const next = history.trades.map((trade) => {
    if (trade.status !== 'ALERTA') return trade;
    const result = resolveTradeOutcomeFromCandles(trade, market.candles || []);
    if (result.status === 'ALERTA') return trade;
    return {
      ...trade,
      status: result.status,
      resolvedAt: result.when,
      outcomeReason: result.reason,
      resolutionSource: 'closed-candles',
      ...(result.beArmedAt ? {
        beArmedAt: result.beArmedAt,
        beTriggeredAt: result.beTriggeredAt,
        beTriggerPrice: result.beTriggerPrice,
        beExitPrice: result.beExitPrice
      } : {})
    };
  });

  const changed = next.some((trade, index) => trade.status !== history.trades[index].status);
  if (changed) await writeHistoryToGitHub(next, history.sha);
  return { ok: true, resolved: next.filter((trade, index) => trade.status !== history.trades[index].status).length, updated: changed, trades: next };
}

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const limit = Math.min(Math.max(parseInt(req.query?.limit || '1000', 10) || 1000, 1), 5000);
      return send(res, 200, await getTradesList(limit));
    } catch (error) {
      return send(res, 502, { ok: false, error: error.message || 'History read failed.' });
    }
  }

  if (req.method === 'POST') {
    if (!validResolveToken(req)) {
      return send(res, process.env.TRADE_RESOLVE_TOKEN ? 403 : 503, { ok: false, error: 'Authenticated server-side resolution is not enabled.' });
    }
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
