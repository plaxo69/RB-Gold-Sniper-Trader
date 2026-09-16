const axios = require("axios");

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

async function quote(symbol) {
  const r = await axios.get(`${YAHOO}${encodeURIComponent(symbol)}`, {
    params: { interval: "1m", range: "1d", includePrePost: true },
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0 RB-Gold-Sniper/3.0" }
  });
  const result = r.data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const price = Number(meta.regularMarketPrice ?? result?.indicators?.quote?.[0]?.close?.filter(Number.isFinite).at(-1));
  const ts = Number(meta.regularMarketTime || result?.timestamp?.at(-1));
  if (!Number.isFinite(price)) throw new Error(`Sem preço para ${symbol}`);
  return { symbol, price, timestamp: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const futures = await quote("GC=F");
    let spot = null;
    try { spot = await quote("XAUUSD=X"); } catch (_) {}
    if (!spot) {
      return res.json({ success: true, calibrated: false, offset: 0, futures, spot: null, note: "Referência spot XAUUSD=X indisponível" });
    }
    const offset = Number((spot.price - futures.price).toFixed(4));
    res.json({ success: true, calibrated: Number.isFinite(offset), offset: Number.isFinite(offset) ? offset : 0, futures, spot, source: "Yahoo XAUUSD=X como proxy spot" });
  } catch (e) {
    res.status(502).json({ success: false, calibrated: false, offset: 0, error: e.message });
  }
};
