(function(){
  function filterValue(label, value, state = "neutral") {
    const classes = {
      neutral: "filter-neutral",
      buy: "filter-buy",
      sell: "filter-sell",
      wait: "filter-wait"
    };
    const cls = classes[state] || classes.neutral;
    return `<div class="filter-item ${cls}"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function signalState(value) {
    if (value === "BUY") return "buy";
    if (value === "SELL") return "sell";
    if (value === "WAIT") return "wait";
    return "neutral";
  }

  function renderFilters(a) {
    const box = document.getElementById("filter-status");
    if (!box || !a) return;

    const f = a.filters || {};
    const m1 = f.m1 || {};
    const m5 = f.m5 || {};
    const m15 = f.m15 || {};
    const h1 = f.h1 || {};

    const rsi = safeNumber(f.rsi);
    const adx = safeNumber(f.adx14);
    const volume = safeNumber(f.volume);
    const volumeSma20 = safeNumber(f.volumeSma20);
    const rr = safeNumber(f.rr1 ?? f.rr);
    const atr = safeNumber(f.atr);
    const ema = safeNumber(f.ema);

    const m1Value = f.buyBreakout ? "BUY" : f.sellBreakdown ? "SELL" : "WAIT";
    const m5Value = m5.trend || (f.m5Trend || "N/D");
    const m15Value = m15.trend || (f.m15Trend || "N/D");
    const h1Value = h1.trend || (f.h1Trend || "N/D");

    const bosValue = f.bos ? "COMPRA" : f.choch ? "VENDA" : "N/D";
    const structureValue = f.structure ? "CONFIRMADA" : "N/D";
    const retestValue = f.retest ? "SIM" : "N/D";
    const rejectionValue = f.rejection ? "SIM" : "N/D";
    const continuationValue = f.continuation ? "SIM" : "N/D";

    const rsiValue = rsi === null ? "N/D" : rsi.toFixed(2);
    const adxValue = adx === null ? "N/D" : adx.toFixed(2);
    const atrValue = atr === null ? "N/D" : atr.toFixed(2);
    const rrValue = rr === null ? "N/D" : rr.toFixed(2);
    const volumeValue = volume === null ? "N/D" : volume.toLocaleString("pt-PT");
    const smaValue = volumeSma20 === null ? "N/D" : volumeSma20.toLocaleString("pt-PT");
    const emaValue = ema === null ? "N/D" : ema.toFixed(2);

    box.innerHTML = [
      filterValue("M1 gatilho", m1Value, signalState(m1Value)),
      filterValue("M5", m5Value, signalState(m5Value)),
      filterValue("M15", m15Value, signalState(m15Value)),
      filterValue("H1", h1Value, signalState(h1Value)),
      filterValue("RSI", rsiValue, rsi !== null && rsi > 70 ? "sell" : rsi !== null && rsi < 30 ? "buy" : "neutral"),
      filterValue("ADX", adxValue, adx !== null && adx >= 25 ? "buy" : "neutral"),
      filterValue("Volume", `${volumeValue} / ${smaValue}`, volume !== null && volumeSma20 !== null && volume > volumeSma20 ? "buy" : "neutral"),
      filterValue("BOS/CHOCH", bosValue, bosValue === "COMPRA" ? "buy" : bosValue === "VENDA" ? "sell" : "neutral"),
      filterValue("Estrutura", structureValue, structureValue === "CONFIRMADA" ? "buy" : "neutral"),
      filterValue("Reteste", retestValue, retestValue === "SIM" ? "buy" : "neutral"),
      filterValue("Rejeição", rejectionValue, rejectionValue === "SIM" ? "buy" : "neutral"),
      filterValue("Continuação", continuationValue, continuationValue === "SIM" ? "buy" : "neutral"),
      filterValue("EMA", emaValue, "neutral"),
      filterValue("RR", rrValue, rr !== null && rr >= 1.5 ? "buy" : "neutral"),
      filterValue("ATR", atrValue, "neutral")
    ].join("");
  }

  window.renderFilters = renderFilters;
})();
