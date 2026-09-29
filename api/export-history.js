// Saves the RB Gold Sniper history export into the GitHub repository.
// Required Vercel environment variable: GITHUB_TOKEN (GitHub token with Contents: Read and write access).

const REPO = 'plaxo69/RB-Gold-Sniper-Trader';
const PATH = 'historico-trades.json';
const API = 'https://api.github.com';

function json(res, status, body) {
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const origin = req.headers.origin || '';
  const allowed = new Set([
    'https://rb-gold-sniper-trader.vercel.app',
    'https://rb-gold-sniper-live-ai-sniper.vercel.app'
  ]);
  if (origin && !allowed.has(origin)) {
    return json(res, 403, { ok: false, error: 'Origin not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return json(res, 500, {
      ok: false,
      error: 'GITHUB_TOKEN não está configurado no Vercel.'
    });
  }

  const body = req.body || {};
  if (!Array.isArray(body.trades)) {
    return json(res, 400, { ok: false, error: 'Formato inválido: trades[] em falta.' });
  }

  const payload = {
    exportedAt: body.exportedAt || new Date().toISOString(),
    source: 'RB Gold Sniper',
    formatVersion: 1,
    total: body.trades.length,
    trades: body.trades
  };

  const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'RB-Gold-Sniper'
  };

  try {
    let sha;
    const existing = await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=main`, { headers });
    if (existing.ok) {
      const current = await existing.json();
      sha = current.sha;
    } else if (existing.status !== 404) {
      const detail = await existing.text();
      return json(res, existing.status, { ok: false, error: 'Não foi possível consultar o ficheiro no GitHub.', detail });
    }

    const commit = await fetch(`${API}/repos/${REPO}/contents/${PATH}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Atualizar histórico de trades — ${new Date().toISOString()}`,
        content,
        branch: 'main',
        ...(sha ? { sha } : {})
      })
    });

    const result = await commit.json();
    if (!commit.ok) {
      return json(res, commit.status, {
        ok: false,
        error: result?.message || 'Falha ao gravar no GitHub.'
      });
    }

    return json(res, 200, {
      ok: true,
      path: PATH,
      total: payload.total,
      commit: result.commit?.sha || null,
      url: result.content?.html_url || null
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro interno.' });
  }
};
