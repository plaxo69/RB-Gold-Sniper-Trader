// Saves the RB Gold Sniper history export into the same branch as the RB TRADER PRO application.
const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const BRANCH = 'rb-trader-pro';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';

function json(res, status, body) { return res.status(status).json(body); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const origin = String(req.headers.origin || '');
  let allowedOrigin = !origin;
  if (origin) {
    try {
      const u = new URL(origin);
      allowedOrigin = u.protocol === 'https:' && u.hostname.endsWith('.vercel.app') &&
        (u.hostname === 'rb-gold-sniper-trader.vercel.app' || u.hostname.startsWith('rb-gold-sniper-trader-'));
    } catch {}
  }
  if (!allowedOrigin) return json(res, 403, { ok: false, error: 'Origin not allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return json(res, 500, { ok: false, error: 'GITHUB_TOKEN não está configurado no Vercel.' });

  const body = req.body || {};
  if (!Array.isArray(body.trades)) return json(res, 400, { ok: false, error: 'Formato inválido: trades[] em falta.' });

  const payload = {
    exportedAt: body.exportedAt || new Date().toISOString(),
    source: 'RB TRADER PRO',
    formatVersion: 2,
    total: body.trades.length,
    trades: body.trades
  };
  const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64');
  const headers = {
    Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
    'User-Agent': 'RB-TRADER-PRO'
  };

  try {
    let sha;
    const existing = await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { headers });
    if (existing.ok) sha = (await existing.json()).sha;
    else if (existing.status !== 404) {
      return json(res, existing.status, { ok: false, error: 'Não foi possível consultar o histórico no GitHub.' });
    }

    const commit = await fetch(`${API}/repos/${REPO}/contents/${PATH}`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        message: `RB TRADER PRO — atualizar histórico de trades — ${new Date().toISOString()}`,
        content, branch: BRANCH, ...(sha ? { sha } : {})
      })
    });
    const result = await commit.json();
    if (!commit.ok) return json(res, commit.status, { ok: false, error: result?.message || 'Falha ao gravar no GitHub.' });
    return json(res, 200, { ok: true, branch: BRANCH, path: PATH, total: payload.total, commit: result.commit?.sha || null, url: result.content?.html_url || null });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro interno.' });
  }
};
