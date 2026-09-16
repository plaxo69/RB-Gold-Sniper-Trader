(() => {
  const originalFetch = window.fetch.bind(window);
  let adjustmentPromise = null;
  let cachedOffset = 0;
  let cachedAt = 0;

  async function getOffset() {
    const now = Date.now();
    if (now - cachedAt < 45000) return cachedOffset;
    if (!adjustmentPromise) {
      adjustmentPromise = originalFetch(`/api/oanda-reference?t=${now}`, { cache: "no-store" })
        .then(r => r.json())
        .then(d => {
          cachedOffset = Number.isFinite(Number(d?.offset)) ? Number(d.offset) : 0;
          cachedAt = Date.now();
          window.RBPriceAdjustment = {
            offset: cachedOffset,
            calibrated: Boolean(d?.calibrated),
            source: d?.source || "spot reference",
            futures: d?.futures || null,
            spot: d?.spot || null
          };
          return cachedOffset;
        })
        .catch(() => cachedOffset)
        .finally(() => { adjustmentPromise = null; });
    }
    return adjustmentPromise;
  }

  function shiftCandle(c, offset) {
    if (!c || !Number.isFinite(offset)) return c;
    const out = { ...c };
    for (const k of ["open", "high", "low", "close"]) if (Number.isFinite(Number(out[k]))) out[k] = Number(out[k]) + offset;
    return out;
  }

  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.includes("/api/market?")) return originalFetch(input, init);
    const response = await originalFetch(input, init);
    const data = await response.clone().json();
    const offset = await getOffset();
    if (!Number.isFinite(offset) || offset === 0 || !Array.isArray(data?.candles)) return new Response(JSON.stringify(data), { status: response.status, headers: { "Content-Type": "application/json" } });
    data.candles = data.candles.map(c => shiftCandle(c, offset));
    if (Number.isFinite(Number(data.price))) data.price = Number(data.price) + offset;
    data.priceOffset = offset;
    data.source = "Yahoo GC=F ajustado para referência spot";
    return new Response(JSON.stringify(data), { status: response.status, headers: { "Content-Type": "application/json" } });
  };
})();
