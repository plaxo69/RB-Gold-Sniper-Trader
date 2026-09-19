const API_BASE = "/api";

const state = {
  running: false,
  timeframe: "1m",
  candles: {},
  lastSignalKey: null,
  lastRefresh: null,
  history: JSON.parse(localStorage.getItem("rb_sniper_history") || "[]"),
  chart: null
};

function $(id) { return document.getElementById(id); }

function notify(message, type = "info") {
  const n = document.createElement("div");
  n.textContent = message;
  n.style.cssText = "position:fixed;right:20px;top:20px;z-index:9999;padding:12px 16px;border-radius:8px;color:#fff;font-weight:700;background:" +
    (type === "success" ? "#198754" : type === "error" ? "#dc3545" : "#0d6efd");
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2800);
}

function sma(a, p) {
  if (a.length < p) return null;
  return a.slice(-p).reduce((x, y) => x + y, 0) / p;
}

function ema(a, p) {
  if (!a.length) return null;
  const k = 2 / (p + 1);
  let e = a[0];
  for (let i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k);
  return e;
}

function rsi(a, p = 14) {
  if (a.length < p + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = a.length - p; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = (gain / p) / (loss / p);
  return 100 - (100 / (1 + rs));
}

function atr(c, p = 14) {
  if (c.length < p + 1) return 0;
  const tr = [];
  for (let i = 1; i < c.length; i++) {
    tr.push(Math.max(
      c[i].high - c[i].low,
      Math.abs(c[i].high - c[i - 1].close),
      Math.abs(c[i].low - c[i - 1].close)
    ));
  }
  return sma(tr, p) || 0;
}

function structure(c) {
  const recent = c.slice(-20);
  return {
    support: Math.min(...recent.map(x => x.low)),
    resistance: Math.max(...recent.map(x => x.high))
  };
}

/*
 * Estrutura SMC simplificada e sem "CONFLITO".
 *
 * BOS = continuação: fecho confirmado acima/abaixo da estrutura anterior.
 * CHOCH = mudança: quebra na direção oposta ao viés estrutural anterior.
 *
 * Importante: BOS e CHOCH NÃO são condições obrigatórias simultâneas.
 * Se os dois aparecerem em sentidos diferentes, usamos o evento confirmado
 * mais recente. Assim um CHOCH antigo não bloqueia um BOS novo.
 */
function detectStructure(c, lookback = 8) {
  if (!Array.isArray(c) || c.length < lookback + 6) {
    return { event: "NONE", bias: "NEUTRO", strength: 0, text: "Sem estrutura suficiente" };
  }

  const closed = c.slice(0, -1); // candle em formação não confirma estrutura
  if (closed.length < lookback + 5) {
    return { event: "NONE", bias: "NEUTRO", strength: 0, text: "Sem estrutura suficiente" };
  }

  const last = closed[closed.length - 1];
  const previous = closed.slice(-(lookback + 1), -1);
  const prior = closed.slice(-(lookback * 2 + 1), -(lookback + 1));

  const prevHigh = Math.max(...previous.map(x => x.high));
  const prevLow = Math.min(...previous.map(x => x.low));
  const priorHigh = Math.max(...prior.map(x => x.high));
  const priorLow = Math.min(...prior.map(x => x.low));

  const bullishBreak = last.close > prevHigh;
  const bearishBreak = last.close < prevLow;
  const priorBias = prior.length
    ? (prior[prior.length - 1].close > prior[0].close ? "BULLISH" : prior[prior.length - 1].close < prior[0].close ? "BEARISH" : "NEUTRO")
    : "NEUTRO";

  if (bullishBreak) {
    const choch = priorBias === "BEARISH";
    return {
      event: choch ? "CHOCH_BULLISH" : "BOS_BULLISH",
      bias: "BULLISH",
      strength: choch ? 2 : 3,
      text: choch ? "CHOCH ↑ confirmado" : "BOS ↑ confirmado",
      level: prevHigh,
      candleTime: last.timestamp
    };
  }

  if (bearishBreak) {
    const choch = priorBias === "BULLISH";
    return {
      event: choch ? "CHOCH_BEARISH" : "BOS_BEARISH",
      bias: "BEARISH",
      strength: choch ? 2 : 3,
      text: choch ? "CHOCH ↓ confirmado" : "BOS ↓ confirmado",
      level: prevLow,
      candleTime: last.timestamp
    };
  }

  const slope = closed[closed.length - 1].close - closed[Math.max(0, closed.length - Math.min(lookback, closed.length - 1))].close;
  const bias = slope > 0 ? "BULLISH" : slope < 0 ? "BEARISH" : "NEUTRO";
  return {
    event: "NONE",
    bias,
    strength: 1,
    text: `Estrutura ${bias === "BULLISH" ? "↑" : bias === "BEARISH" ? "↓" : "neutra"}`,
    level: null,
    candleTime: last.timestamp
  };
}

function trend(c) {
  const closes = c.map(x => x.close);
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const last = closes[closes.length - 1];
  if (last > e20 && e20 > e50) return "ALTA";
  if (last < e20 && e20 < e50) return "BAIXA";
  return "LATERAL";
}

function analyze(main, m5, m15, h1) {
  const c = main;
  if (c.length < 60 || m5.length < 30 || m15.length < 30 || h1.length < 30) return null;

  const closes = c.map(x => x.close);
  const last = closes.at(-1);
  const r = rsi(closes);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const a = atr(c);
  const s = structure(c);
  const t5 = trend(m5), t15 = trend(m15), t1 = trend(h1);

  const st5 = detectStructure(m5);
  const st15 = detectStructure(m15);
  const st1 = detectStructure(h1);

  // O H1 define contexto; M5/M15 definem o gatilho.
  // Nunca existe bloqueio por "BOS/CHOCH CONFLITO".
  const structureBuy =
    (st5.bias === "BULLISH" ? st5.strength : 0) +
    (st15.bias === "BULLISH" ? st15.strength : 0) +
    (st1.bias === "BULLISH" ? 1 : 0);
  const structureSell =
    (st5.bias === "BEARISH" ? st5.strength : 0) +
    (st15.bias === "BEARISH" ? st15.strength : 0) +
    (st1.bias === "BEARISH" ? 1 : 0);

  let buy = 0, sell = 0;
  const buyReasons = [], sellReasons = [];

  if (last > e20) { buy++; buyReasons.push("Preço acima EMA20"); }
  if (last > e50) { buy++; buyReasons.push("Preço acima EMA50"); }
  if (e200 && last > e200) { buy++; buyReasons.push("Preço acima EMA200"); }
  if (t5 === "ALTA") { buy++; buyReasons.push("M5 alta"); }
  if (t15 === "ALTA") { buy++; buyReasons.push("M15 alta"); }
  if (t1 === "ALTA") { buy++; buyReasons.push("H1 alta"); }
  if (r > 45 && r < 68) { buy++; buyReasons.push("RSI favorável"); }
  if (last > s.resistance && closes.at(-2) <= s.resistance) { buy += 2; buyReasons.push("Breakout"); }

  if (last < e20) { sell++; sellReasons.push("Preço abaixo EMA20"); }
  if (last < e50) { sell++; sellReasons.push("Preço abaixo EMA50"); }
  if (e200 && last < e200) { sell++; sellReasons.push("Preço abaixo EMA200"); }
  if (t5 === "BAIXA") { sell++; sellReasons.push("M5 baixa"); }
  if (t15 === "BAIXA") { sell++; sellReasons.push("M15 baixa"); }
  if (t1 === "BAIXA") { sell++; sellReasons.push("H1 baixa"); }
  if (r > 32 && r < 55) { sell++; sellReasons.push("RSI favorável"); }
  if (last < s.support && closes.at(-2) >= s.support) { sell += 2; sellReasons.push("Breakdown"); }

  // Estrutura acrescenta confirmação, mas não exige BOS e CHOCH juntos.
  if (structureBuy >= 2) { buy += 2; buyReasons.push(st5.bias === "BULLISH" ? st5.text : "Estrutura bullish"); }
  if (structureSell >= 2) { sell += 2; sellReasons.push(st5.bias === "BEARISH" ? st5.text : "Estrutura bearish"); }

  let type = "WAIT";
  let score = Math.max(buy, sell);
  let reasons = [];

  // A direção tem de ter vantagem real. Um conflito de eventos antigos
  // não bloqueia o sinal; apenas reduz a pontuação estrutural.
  if (buy >= 7 && buy > sell + 1) { type = "BUY"; reasons = buyReasons; }
  else if (sell >= 7 && sell > buy + 1) { type = "SELL"; reasons = sellReasons; }

  const confidence = type === "WAIT" ? 0 : Math.min(95, 60 + Math.round((score - 7) * 7));
  let sl = null, tp = null, rr = null;

  if (type !== "WAIT" && a > 0) {
    if (type === "BUY") {
      sl = Math.min(s.support - a * 0.25, last - a * 1.25);
      const risk = last - sl;
      tp = last + Math.max(risk * 2.0, a * 2.0);
      rr = (tp - last) / risk;
    } else {
      sl = Math.max(s.resistance + a * 0.25, last + a * 1.25);
      const risk = sl - last;
      tp = last - Math.max(risk * 2.0, a * 2.0);
      rr = (last - tp) / risk;
    }
  }

  return {
    type, score, confidence, price: last, rsi: r, ema20: e20, ema50: e50, ema200: e200,
    atr: a, support: s.support, resistance: s.resistance,
    trend5: t5, trend15: t15, trend1: t1,
    bosChoch5: st5.text, bosChoch15: st15.text, bosChoch1: st1.text,
    structure5: st5.bias, structure15: st15.bias, structure1: st1.bias,
    structureEvent5: st5.event, structureEvent15: st15.event, structureEvent1: st1.event,
    sl, tp, rr, reasons, source: "candles reais"
  };
}

async function fetchTF(tf) {
  const r = await fetch(`${API_BASE}/market?timeframe=${encodeURIComponent(tf)}&t=${Date.now()}`);
  if (!r.ok) throw new Error((await r.json()).error || `Erro ${r.status}`);
  const d = await r.json();
  state.candles[tf] = d;
  return d;
}

function updateUI(d) {
  const c = d.candles, last = c.at(-1);
  $("current-price").textContent = `$${last.close.toFixed(2)}`;
  $("current-bid").textContent = `$${last.close.toFixed(2)}`;
  $("current-ask").textContent = `$${last.close.toFixed(2)}`;
  $("current-spread").textContent = (last.high - last.low).toFixed(2);
  $("server-info").textContent = `${d.source} • ${d.timeframe} • ${new Date(d.timestamp).toLocaleTimeString("pt-PT")}`;

  if (state.chart) {
    state.chart.data.labels = c.map(x => new Date(x.timestamp).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
    state.chart.data.datasets[0].data = c.map(x => x.close);
    state.chart.data.datasets[1].data = c.map((_, i) => i >= 19 ? sma(c.slice(0, i + 1).map(x => x.close), 20) : null);
    state.chart.update("none");
  }
}

function saveSignal(a) {
  if (a.type === "WAIT") return;
  const key = `${a.type}-${a.price.toFixed(2)}-${state.timeframe}-${new Date().toISOString().slice(0, 16)}`;
  if (key === state.lastSignalKey) return;
  state.lastSignalKey = key;

  const item = { ...a, id: Date.now(), time: new Date().toISOString(), status: "ALERTA" };
  state.history.unshift(item);
  state.history = state.history.slice(0, 100);
  localStorage.setItem("rb_sniper_history", JSON.stringify(state.history));
  renderHistory();
  notify(`🎯 ${a.type} ${a.confidence}% — entrada ${a.price.toFixed(2)}`, "success");

  fetch(`${API_BASE}/signals/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item)
  }).catch(() => {});
}

function renderAnalysis(a) {
  if (!a) return;
  $("rsi-value").textContent = a.rsi.toFixed(2);
  $("macd-value").textContent = `ATR ${a.atr.toFixed(2)}`;
  $("bb-upper").textContent = a.resistance.toFixed(2);
  $("bb-lower").textContent = a.support.toFixed(2);
  $("ma20").textContent = a.ema20.toFixed(2);
  $("trend-value").textContent = `M5 ${a.trend5} / M15 ${a.trend15}`;

  const box = $("trades-container");
  if (a.type === "WAIT") {
    box.innerHTML = `<div class="no-trades">⏳ WAIT — sem convergência Sniper suficiente. Estrutura: M5 ${a.bosChoch5} • M15 ${a.bosChoch15} • H1 ${a.bosChoch1}. Última análise: ${a.price.toFixed(2)}</div>`;
    return;
  }

  box.innerHTML = `<div class="trade-card ${a.type.toLowerCase()}">
    <div class="trade-info">
      <div class="trade-type ${a.type.toLowerCase()}">${a.type === "BUY" ? "📈 COMPRA" : "📉 VENDA"} — ${a.confidence}%</div>
      <div class="trade-details">
        <span>💰 Entrada: $${a.price.toFixed(2)}</span>
        <span>🎯 TP: $${a.tp.toFixed(2)}</span>
        <span>🛑 SL: $${a.sl.toFixed(2)}</span>
        <span>RR: 1:${a.rr.toFixed(2)}</span>
        <span>RSI: ${a.rsi.toFixed(1)}</span>
      </div>
      <div class="trade-reason">${a.reasons.join(" • ")}</div>
      <div class="trade-reason">Estrutura: M5 ${a.bosChoch5} • M15 ${a.bosChoch15} • H1 ${a.bosChoch1}</div>
    </div>
    <div class="trade-profit neutral">ALERTA<br>MANUAL</div>
  </div>`;
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
    const [m1, m5, m15, h1] = await Promise.all(["1m", "5m", "15m", "1h"].map(fetchTF));
    updateUI(state.candles[state.timeframe] || m1);
    const a = analyze(m1.candles, m5.candles, m15.candles, h1.candles);
    renderAnalysis(a);
    saveSignal(a);
    state.lastRefresh = new Date();
    $("status").textContent = `🟢 Mercado real • ${state.lastRefresh.toLocaleTimeString("pt-PT")}`;
    $("status").className = "status-indicator online";
    renderHistory();
  } catch (e) {
    $("status").textContent = "🔴 Mercado indisponível";
    $("status").className = "status-indicator offline";
    $("server-info").textContent = e.message;
  }
}

function initChart() {
  const ctx = $("priceChart").getContext("2d");
  state.chart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [
      { label: "XAUUSD/GC=F", data: [], borderWidth: 2, pointRadius: 0, tension: .2 },
      { label: "EMA20", data: [], borderWidth: 1, pointRadius: 0, borderDash: [5, 5] }
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "top" } } }
  });
}

function startSniper() {
  state.running = true;
  notify("🎯 Monitor Sniper ativo — execução manual no MT5", "success");
  refresh();
}

function stopSniper() {
  state.running = false;
  notify("⏹ Monitor parado", "info");
}

function clearTrades() {
  state.history = [];
  localStorage.removeItem("rb_sniper_history");
  renderHistory();
  $("trades-container").innerHTML = '<div class="no-trades">Histórico local limpo.</div>';
}

function connectMT5() {
  notify("ℹ️ MT5 não é ligado à app. Execute manualmente.", "info");
}

function changeTimeframe(tf) {
  state.timeframe = tf;
  document.querySelectorAll(".timeframe-btn").forEach(b => b.classList.toggle("active", b.dataset.tf === tf));
  if (state.candles[tf]) updateUI(state.candles[tf]);
}

window.addEventListener("load", () => {
  initChart();
  renderHistory();
  document.querySelectorAll(".timeframe-btn").forEach(b => b.addEventListener("click", () => changeTimeframe(b.dataset.tf)));
  $("status").textContent = "🟡 A obter mercado real…";
  refresh();
  setInterval(refresh, 60000);
});
