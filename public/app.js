const API_BASE = "/api";

const state = {
  running: false,
  timeframe: "1m",
  candles: {},
  lastSignalKey: null,
  lastRefresh: null,
  history: JSON.parse(localStorage.getItem("rb_sniper_history") || "[]"),
  tvWidget: null,
  refreshTimer: null
};

function $(id) { return document.getElementById(id); }
function formatPrice(value) { return Number.isFinite(value) ? `$${value.toFixed(2)}` : "—"; }

function notify(message, type = "info") {
  const n = document.createElement("div");
  n.textContent = message;
  n.style.cssText = "position:fixed;right:20px;top:20px;z-index:9999;padding:12px 16px;border-radius:8px;color:#fff;font-weight:700;background:" +
    (type === "success" ? "#198754" : type === "error" ? "#dc3545" : "#0d6efd");
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2800);
}

function analyze(main, m3, m5, m15, h1) {
  return window.RBGoldSniper.analyze(main, m3, m5, m15, h1);
}

async function fetchTF(tf) {
  const r = await fetch(`${API_BASE}/market?timeframe=${encodeURIComponent(tf)}&t=${Date.now()}`, { cache: "no-store" });
  let d = null;
  try { d = await r.json(); } catch { throw new Error(`Resposta inválida (${r.status})`); }
  if (!r.ok || !d.success) throw new Error(d?.details || d?.error || `Erro ${r.status}`);
  state.candles[tf] = d;
  return d;
}

function tvInterval(tf) { return ({ "1m": "1", "3m": "3", "5m": "5", "15m": "15", "1h": "60" })[tf] || "1"; }

function initTradingView() {
  const host = $("tradingview-chart");
  if (!host || !window.TradingView) return;
  state.tvWidget = new TradingView.widget({
    autosize: true,
    symbol: "OANDA:XAUUSD",
    interval: tvInterval(state.timeframe),
    timezone: "Europe/Lisbon",
    theme: "dark",
    style: "1",
    locale: "pt",
    toolbar_bg: "#111827",
    enable_publishing: false,
    hide_top_toolbar: false,
    hide_legend: false,
    allow_symbol_change: false,
    save_image: false,
    container_id: "tradingview-chart"
  });
}

function changeTradingViewInterval(tf) {
  if (state.tvWidget && typeof state.tvWidget.chart === "function") state.tvWidget.chart().setResolution(tvInterval(tf));
}

function updateUI(d) {
  const c = d.candles, last = c.at(-1);
  $("current-price").textContent = formatPrice(last.close);
  $("current-bid").textContent = formatPrice(d.bid);
  $("current-ask").textContent = formatPrice(d.ask);
  $("current-spread").textContent = Number.isFinite(d.spread) ? d.spread.toFixed(3) : "—";
  $("server-info").textContent = `${d.source} • ${d.timeframe} • ${new Date(d.timestamp).toLocaleTimeString("pt-PT")}`;
}

function saveSignal(a) {
  if (!a || a.type === "WAIT" || !Number.isFinite(a.tp) || !Number.isFinite(a.sl)) return;
  const bucket = new Date().toISOString().slice(0, 16);
  const key = `${a.type}-${a.price.toFixed(2)}-${state.timeframe}-${bucket}`;
  if (key === state.lastSignalKey) return;
  state.lastSignalKey = key;
  const item = { ...a, id: Date.now(), time: new Date().toISOString(), status: "ALERTA" };
  state.history.unshift(item);
  state.history = state.history.slice(0, 100);
  localStorage.setItem("rb_sniper_history", JSON.stringify(state.history));
  renderHistory();
  notify(`🎯 ${a.type} ${a.confidence}% — entrada ${a.price.toFixed(2)}`, "success");
}

function renderAnalysis(a) {
  if (!a) return;
  $("rsi-value").textContent = a.rsi.toFixed(2);
  $("macd-value").textContent = `ATR ${a.atr.toFixed(2)}`;
  $("bb-upper").textContent = a.resistance.toFixed(2);
  $("bb-lower").textContent = a.support.toFixed(2);
  $("ma20").textContent = a.ema20.toFixed(2);
  $("trend-value").textContent = `M3 ${a.trend3} / M5 ${a.trend5} / M15 ${a.trend15} / H1 ${a.trend1}`;

  const box = $("trades-container");
  if (a.type === "WAIT") {
    const rejected = a.rejectionReasons?.length ? ` Filtros pendentes: ${a.rejectionReasons.join(" • ")}.` : "";
    box.innerHTML = `<div class="no-trades">⏳ WAIT — sem convergência Sniper suficiente.${rejected} Última análise: ${a.price.toFixed(2)}</div>`;
    return;
  }

  box.innerHTML = `<div class="trade-card ${a.type.toLowerCase()}"><div class="trade-info"><div class="trade-type ${a.type.toLowerCase()}">${a.type === "BUY" ? "📈 COMPRA" : "📉 VENDA"} — ${a.confidence}%</div><div class="trade-details"><span>💰 Entrada: $${a.price.toFixed(2)}</span><span>🎯 TP: $${a.tp.toFixed(2)}</span><span>🛑 SL: $${a.sl.toFixed(2)}</span><span>RR: 1:${a.rr.toFixed(2)}</span><span>RSI: ${a.rsi.toFixed(1)}</span></div><div class="trade-reason">${a.reasons.join(" • ")}</div></div><div class="trade-profit neutral">ALERTA<br>MANUAL</div></div>`;
}

function renderHistory() {
  const total = state.history.length;
  const wins = state.history.filter(x => x.result === "WIN").length;
  $("total-trades").textContent = total;
  $("total-profit").textContent = "—";
  $("win-rate").textContent = total ? `${((wins / total) * 100).toFixed(1)}%` : "—";
}

async function refresh() {
  try {
    const [m1, m3, m5, m15, h1] = await Promise.all(["1m", "3m", "5m", "15m", "1h"].map(fetchTF));
    updateUI(state.candles[state.timeframe] || m1);
    const a = analyze(m1.candles, m3.candles, m5.candles, m15.candles, h1.candles);
    renderAnalysis(a);
    if (state.running) saveSignal(a);
    state.lastRefresh = new Date();
    $("status").textContent = `🟢 OANDA disponível • ${state.lastRefresh.toLocaleTimeString("pt-PT")}`;
    $("status").className = "status-indicator online";
    renderHistory();
  } catch (e) {
    $("status").textContent = "🔴 Mercado indisponível";
    $("status").className = "status-indicator offline";
    $("server-info").textContent = e.message;
  }
}

function startSniper() {
  if (state.running) return;
  state.running = true;
  notify("🎯 Monitor Sniper ativo — apenas alertas, sem execução de ordens", "success");
  refresh();
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => { if (state.running) refresh(); }, 60000);
}

function stopSniper() {
  state.running = false;
  clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  notify("⏹ Monitor parado", "info");
}

function clearTrades() {
  state.history = [];
  localStorage.removeItem("rb_sniper_history");
  renderHistory();
  $("trades-container").innerHTML = '<div class="no-trades">Histórico local limpo.</div>';
}

function changeTimeframe(tf) {
  state.timeframe = tf;
  document.querySelectorAll(".timeframe-btn").forEach(b => b.classList.toggle("active", b.dataset.tf === tf));
  changeTradingViewInterval(tf);
  if (state.candles[tf]) updateUI(state.candles[tf]); else refresh();
}

window.addEventListener("load", () => {
  renderHistory();
  document.querySelectorAll(".timeframe-btn").forEach(b => b.addEventListener("click", () => changeTimeframe(b.dataset.tf)));
  $("status").textContent = "🟡 A ligar à OANDA…";
  initTradingView();
  refresh();
});
