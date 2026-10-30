const webpush = require('web-push');
const marketModule = require('./market');
const {
  ts,
  keyOf,
  movementKey,
  normalizeTrade,
  normalizeSignal,
  normalizeTradeRecord
} = require('./signal-engine');

const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const BRANCH = 'main';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';
const PROD_AUD = 'https://rb-gold-sniper-trader.vercel.app/api/monitor';

function out(res, status, body) {
  return res.status(status).json(body);
}

function safeParseJson(raw, fallback = null) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

async function readHistory(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RB-TRADER-PRO-MONITOR'
  };

  const contentRes = await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { headers });
  if (contentRes.status === 404) return { trades: [], sha: null };

  const contentData = await contentRes.json();
  if (!contentRes.ok) throw new Error(contentData?.message || 'Falha ao ler histórico');

  if (contentData?.content) {
    const raw = Buffer.from(contentData.content, 'base64').toString('utf8');
    const parsed = safeParseJson(raw, null);
    if (!parsed) {
      throw new Error('Histórico GitHub em JSON inválido. Operação cancelada para evitar sobrescrever dados vazios.');
    }
    const trades = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.trades) ? parsed.trades : []);
    return { trades: trades.map(normalizeTrade), sha: contentData.sha || null };
  }

  const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`;
  const rawRes = await fetch(rawUrl, { headers: { 'User-Agent': 'RB-TRADER-PRO-MONITOR' } });
  if (!rawRes.ok) return { trades: [], sha: contentData?.sha || null };

  const rawBody = await rawRes.text();
  const parsed = safeParseJson(rawBody, null);
  if (!parsed) {
    throw new Error('Histórico raw em GitHub inválido. Operação cancelada para evitar sobrescrever dados vazios.');
  }

  const trades = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.trades) ? parsed.trades : []);
  return { trades: trades.map(normalizeTrade), sha: contentData?.sha || null };
}

async function writeHistory(token, trades, sha, message) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'RB-TRADER-PRO-MONITOR'
  };

  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'RB TRADER PRO',
    formatVersion: 2,
    total: Array.isArray(trades) ? trades.length : 0,
    trades: Array.isArray(trades) ? trades.map(normalizeTradeRecord) : []
  };

  const body = {
    message,
    content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {})
  };

  const r = await fetch(`${API}/repos/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Falha ao gravar histórico');
  return d;
}

async function sendPush(title, body, tag, subsToken) {
  const r = await fetch(`${API}/repos/${REPO}/contents/push-subscriptions.json?ref=${BRANCH}`, {
    headers: {
      Authorization: `Bearer ${subsToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'RB-TRADER-PRO-MONITOR'
    }
  });

  if (r.status === 404) return 0;
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Falha ao ler subscriptions');

  let subs = [];
  try {
    subs = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8'));
  } catch (error) {
    return 0;
  }

  if (!Array.isArray(subs) || !subs.length) return 0;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:rbtraderpro@users.noreply.github.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({ title, body, url: '/', tag });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(s, payload);
      sent++;
    } catch (error) {
      // skip invalid or expired subscriptions
    }
  }
  return sent;
}

async function verifyGitHubOIDC(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) throw Object.assign(new Error('OIDC em falta'), { status: 401 });

  const token = auth.slice(7);
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  const JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://token.actions.githubusercontent.com',
    audience: PROD_AUD
  });

  if (payload.repository !== REPO || payload.ref !== 'refs/heads/main') {
    throw Object.assign(new Error('GitHub Actions não autorizado'), { status: 403 });
  }

  return payload;
}

async function runMonitor() {
  const gh = process.env.GITHUB_TOKEN;
  if (!gh) throw new Error('GITHUB_TOKEN não configurado');

  const h = await readHistory(gh);
  const trades = (h.trades || []).map(normalizeTrade);
  global.__RB_HISTORY = trades;

  const m1 = await marketModule.getMarket('1m', 500);
  const result = {
    checkedAt: new Date().toISOString(),
    marketState: m1.marketState,
    price: m1.price,
    events: []
  };

  let changed = false;
  let activeCandles = [];
  let active = trades.filter((t) => ['BUY', 'SELL'].includes(t.type) && t.status === 'ALERTA')
    .sort((a, b) => (ts(b.signalTimestamp || b.time) || 0) - (ts(a.signalTimestamp || a.time) || 0))[0] || null;

  if (active) {
    const created = ts(active.signalTimestamp || active.time);
    const live = await marketModule.getMarket('1m', 2000, Number.isFinite(created) ? new Date(created).toISOString() : null, new Date().toISOString());
    const candles = (live.candles || []).filter((c) => ts(c.timestamp) > created);
    activeCandles = candles;

    const entry = Number(active.price);
    const sl = Number(active.sl);
    const tp = Number(active.tp);
    let outcome = null;
    let when = null;
    let reason = '';

    for (const c of candles) {
      const hi = Number(c.high);
      const lo = Number(c.low);
      const hitTP = active.type === 'BUY' ? hi >= tp : lo <= tp;
      const hitSL = active.type === 'BUY' ? lo <= sl : hi >= sl;

      if (hitTP && hitSL) {
        outcome = 'LOSS';
        reason = 'TP e SL alcançados na mesma vela';
        when = c.timestamp;
        break;
      }
      if (hitTP) {
        outcome = 'WIN';
        reason = 'TP alcançado';
        when = c.timestamp;
        break;
      }
      if (hitSL) {
        outcome = 'LOSS';
        reason = 'SL alcançado';
        when = c.timestamp;
        break;
      }
    }

    if (outcome) {
      active.status = outcome;
      active.resolvedAt = when;
      active.outcomeReason = reason;
      delete active.beAlerted;
      changed = true;
      result.events.push(outcome === 'WIN' ? 'WIN' : 'LOSS');
      await sendPush(
        outcome === 'WIN' ? 'RB TRADER PRO — WIN' : 'RB TRADER PRO — LOSS',
        'Operação resolvida',
        'trade-resolve',
        gh
      );
    }
  }

  if (active) {
    const entry = Number(active.price);
    const tp = Number(active.tp);
    const dist = Math.abs(tp - entry);
    let beWhen = null;
    let bePrice = null;

    if (dist > 0) {
      for (const c of activeCandles) {
        const hi = Number(c.high);
        const lo = Number(c.low);
        const fav = active.type === 'BUY' ? hi - entry : entry - lo;
        if (Number.isFinite(fav) && fav >= dist * 0.5) {
          beWhen = c.timestamp;
          bePrice = Number(c.close);
          break;
        }
      }

      if (!beWhen && m1.marketState === 'open' && Number.isFinite(m1.price)) {
        const fav = active.type === 'BUY' ? m1.price - entry : entry - m1.price;
        if (dist > 0 && fav >= dist * 0.5) {
          beWhen = new Date().toISOString();
          bePrice = m1.price;
        }
      }

      if (beWhen && !active.bePushSent) {
        active.beAlerted = true;
        active.bePushSent = true;
        active.beTriggeredAt = active.beTriggeredAt || beWhen;
        active.beTriggerPrice = active.beTriggerPrice || bePrice;
      }
    }
  }

  if (changed) {
    trades.sort((a, b) => (ts(b.signalTimestamp || b.time) || 0) - (ts(a.signalTimestamp || a.time) || 0));
    await writeHistory(gh, trades.slice(0, 500), h.sha, `RB TRADER PRO — monitor servidor ${new Date().toISOString()}`);
  }

  result.activeTrade = active ? {
    type: active.type,
    status: active.status,
    price: active.price,
    tp: active.tp,
    sl: active.sl
  } : null;
  result.changed = changed;
  return result;
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    await verifyGitHubOIDC(req);
    const r = await runMonitor();
    return out(res, 200, { ok: true, ...r });
  } catch (e) {
    console.error('MONITOR ERROR', e);
    return out(res, e.status || 500, { ok: false, error: e.message || 'Erro do monitor' });
  }
};

module.exports.runMonitor = runMonitor;
module.exports.verifyGitHubOIDC = verifyGitHubOIDC;
module.exports.readHistory = readHistory;
module.exports.normalizeSignal = normalizeSignal;
