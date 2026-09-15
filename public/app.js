// API Base URL
const API_BASE = '/api';

// Estado global
const state = {
  isRunning: false,
  mt5Connected: false,
  priceData: [],
  trades: [],
  currentTimeframe: '1m',
  totalProfit: 0,
  wins: 0,
  total: 0,
  chart: null,
  chartInstance: null,
  soundEnabled: true,
  notificationsEnabled: true
};

// ============= AUDIO NOTIFICATIONS =============
function playSound(type = 'signal') {
  if (!state.soundEnabled) return;
  
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  if (type === 'signal') {
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } else if (type === 'profit') {
    oscillator.frequency.value = 1000;
    oscillator.type = 'triangle';
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  }
}

function requestNotificationPermission() {
  if (!state.notificationsEnabled || !('Notification' in window)) return;
  
  if (Notification.permission === 'granted') return;
  if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

function sendDesktopNotification(title, options = {}) {
  if (!state.notificationsEnabled || Notification.permission !== 'granted') return;
  
  new Notification(title, {
    icon: '🎯',
    badge: '🎯',
    ...options
  });
}

// ============= GRÁFICO AVANÇADO =============
function initChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Preço XAUUSD',
          data: [],
          borderColor: '#302b63',
          backgroundColor: 'rgba(48, 43, 99, 0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 1,
          pointBackgroundColor: '#302b63',
          pointBorderColor: '#302b63',
        },
        {
          label: 'MA20',
          data: [],
          borderColor: '#ffc107',
          borderWidth: 1.5,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderDash: [5, 5]
        },
        {
          label: 'MA50',
          data: [],
          borderColor: '#17a2b8',
          borderWidth: 1.5,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderDash: [8, 4]
        },
        {
          label: 'Suporte',
          data: [],
          borderColor: '#dc3545',
          borderWidth: 1,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderDash: [10, 5]
        },
        {
          label: 'Resistência',
          data: [],
          borderColor: '#28a745',
          borderWidth: 1,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderDash: [10, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding: 15,
            font: { size: 11 },
            usePointStyle: true,
            boxWidth: 8
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return value.toFixed(2);
            }
          }
        }
      }
    }
  });
}

function updateChart(priceData) {
  if (!state.chartInstance) return;

  const labels = priceData.map((_, i) => i);
  const prices = priceData.map(d => d.price);
  const ma20 = calculateMA(prices, 20);
  const ma50 = calculateMA(prices, 50);
  const support = Math.min(...prices.slice(-20));
  const resistance = Math.max(...prices.slice(-20));

  state.chartInstance.data.labels = labels;
  state.chartInstance.data.datasets[0].data = prices;
  state.chartInstance.data.datasets[1].data = ma20;
  state.chartInstance.data.datasets[2].data = ma50;
  state.chartInstance.data.datasets[3].data = Array(prices.length).fill(support);
  state.chartInstance.data.datasets[4].data = Array(prices.length).fill(resistance);
  state.chartInstance.update('none');
}

// ============= CÁLCULOS TÉCNICOS AVANÇADOS =============
function calculateMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return sum / period;
  });
}

function calculateRSI(prices, period = 14) {
  if (prices.length < period) return 50;

  let gains = 0, losses = 0;
  
  for (let i = 1; i < period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  const rs = avgGain / avgLoss || 0;
  const rsi = 100 - (100 / (1 + rs));
  return rsi;
}

function calculateMACD(prices) {
  if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
  
  // Signal line (EMA 9 do MACD)
  const macdValues = [];
  for (let i = 25; i < prices.length; i++) {
    const e12 = calculateEMA(prices.slice(0, i + 1), 12);
    const e26 = calculateEMA(prices.slice(0, i + 1), 26);
    macdValues.push(e12[e12.length - 1] - e26[e26.length - 1]);
  }
  const signalLine = calculateEMA(macdValues, 9)[macdValues.length - 1] || macdLine;
  const histogram = macdLine - signalLine;
  
  return { macd: macdLine, signal: signalLine, histogram: histogram };
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  
  return ema;
}

function calculateBollingerBands(prices, period = 20, stdDevMultiplier = 2) {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };
  
  const ma = prices.slice(-period).reduce((a, b) => a + b) / period;
  const variance = prices.slice(-period).reduce((sum, p) => sum + Math.pow(p - ma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: ma + (stdDev * stdDevMultiplier),
    middle: ma,
    lower: ma - (stdDev * stdDevMultiplier)
  };
}

function calculateStochastic(prices, period = 14, smoothK = 3, smoothD = 3) {
  if (prices.length < period) return { k: 50, d: 50 };
  
  const highest = Math.max(...prices.slice(-period));
  const lowest = Math.min(...prices.slice(-period));
  const lastPrice = prices[prices.length - 1];
  
  const rawK = ((lastPrice - lowest) / (highest - lowest)) * 100;
  const k = isFinite(rawK) ? rawK : 50;
  
  return { k: k, d: 50 };
}

function calculateATR(prices, period = 14) {
  if (prices.length < period) return 0;
  
  let trSum = 0;
  for (let i = 1; i < prices.length; i++) {
    const tr = prices[i] - prices[i - 1];
    trSum += Math.abs(tr);
  }
  
  return trSum / prices.length;
}

// ============= ALGORITMO SNIPER ULTRA AVANÇADO =============
function detectSniperSignal() {
  if (state.priceData.length < 50) return null;

  const prices = state.priceData.map(d => d.price);
  const lastPrice = prices[prices.length - 1];
  const previousPrice = prices[prices.length - 2];
  const priceChange3 = prices[prices.length - 4] || lastPrice;
  
  // Indicadores
  const rsi = calculateRSI(prices);
  const macdData = calculateMACD(prices);
  const bb = calculateBollingerBands(prices);
  const stoch = calculateStochastic(prices);
  const atr = calculateATR(prices);
  const ma20 = calculateMA(prices, 20)[prices.length - 1] || lastPrice;
  const ma50 = calculateMA(prices, 50)[prices.length - 1] || lastPrice;
  const ma200 = calculateMA(prices, 200)[prices.length - 1] || lastPrice;

  // Atualizar display de indicadores
  document.getElementById('rsi-value').textContent = rsi.toFixed(2);
  document.getElementById('macd-value').textContent = macdData.histogram.toFixed(4);
  document.getElementById('bb-upper').textContent = bb.upper.toFixed(2);
  document.getElementById('bb-lower').textContent = bb.lower.toFixed(2);
  document.getElementById('ma20').textContent = ma20.toFixed(2);

  // Detectar tendência
  const trend = lastPrice > ma50 ? 'ALTA' : lastPrice < ma50 ? 'BAIXA' : 'LATERAL';
  document.getElementById('trend-value').textContent = trend;

  let signal = null;

  // ===== SINAL SNIPER: BUY (Compra Agressiva) =====
  const buyConditions = {
    rsiSobrevendido: rsi < 30,
    precoAbaixoMA20: lastPrice < ma20,
    precoAbaixoSuporteForte: lastPrice <= bb.lower,
    macdiNegativo: macdData.histogram < -0.0001,
    quedaRecente: previousPrice > lastPrice,
    tendenciaRecuperacao: priceChange3 < lastPrice,
    stochBaixo: stoch.k < 20,
    bbLowerCross: previousPrice > bb.lower && lastPrice <= bb.lower // Cruzamento BB
  };

  const buyScore = Object.values(buyConditions).filter(Boolean).length;

  if (buyScore >= 5) {
    const strength = Math.min(100, 50 + (buyScore * 8));
    signal = {
      type: 'BUY',
      price: lastPrice,
      reason: `Convergência Bullish (${buyScore}/8)`,
      rsi,
      strength: strength,
      takeProfit: lastPrice * 1.0030,  // +0.30%
      stopLoss: lastPrice * 0.9970,    // -0.30%
      scoreBreakdown: buyConditions,
      confidence: ((buyScore / 8) * 100).toFixed(0)
    };
    
    playSound('signal');
    sendDesktopNotification('🎯 SINAL BUY DETECTADO', {
      body: `Preço: $${lastPrice.toFixed(2)} | Força: ${strength.toFixed(0)}%`,
      tag: 'buy-signal'
    });
  }

  // ===== SINAL SNIPER: SELL (Venda Agressiva) =====
  const sellConditions = {
    rsiSobrecomprado: rsi > 70,
    precoAcimaMA20: lastPrice > ma20,
    precoAcimaResistencia: lastPrice >= bb.upper,
    macdiPositivo: macdData.histogram > 0.0001,
    subidaRecente: previousPrice < lastPrice,
    tendenciaQueda: priceChange3 > lastPrice,
    stochAlto: stoch.k > 80,
    bbUpperCross: previousPrice < bb.upper && lastPrice >= bb.upper // Cruzamento BB
  };

  const sellScore = Object.values(sellConditions).filter(Boolean).length;

  if (sellScore >= 5 && !signal) {
    const strength = Math.min(100, 50 + (sellScore * 8));
    signal = {
      type: 'SELL',
      price: lastPrice,
      reason: `Convergência Bearish (${sellScore}/8)`,
      rsi,
      strength: strength,
      takeProfit: lastPrice * 0.9970,  // -0.30%
      stopLoss: lastPrice * 1.0030,    // +0.30%
      scoreBreakdown: sellConditions,
      confidence: ((sellScore / 8) * 100).toFixed(0)
    };
    
    playSound('signal');
    sendDesktopNotification('🎯 SINAL SELL DETECTADO', {
      body: `Preço: $${lastPrice.toFixed(2)} | Força: ${strength.toFixed(0)}%`,
      tag: 'sell-signal'
    });
  }

  return signal;
}

// ============= GERENCIAMENTO DE TRADES =============
function executeTrade(signal) {
  const trade = {
    id: Date.now(),
    type: signal.type,
    entryPrice: signal.price,
    entry: new Date().toLocaleTimeString('pt-PT'),
    tp: signal.takeProfit,
    sl: signal.stopLoss,
    rsi: signal.rsi.toFixed(2),
    strength: signal.strength.toFixed(0),
    confidence: signal.confidence,
    status: 'ABERTO',
    profit: 0,
    profitPercent: 0,
    reason: signal.reason,
    exitReason: null
  };

  // Simular fechamento com probabilidade realista
  const closeTimeout = setTimeout(() => {
    const random = Math.random();
    let closePrice;
    
    if (signal.type === 'BUY') {
      if (random < 0.55) {
        closePrice = signal.takeProfit; // 55% TP
        trade.exitReason = 'TP Atingido';
      } else if (random < 0.30) {
        closePrice = signal.stopLoss; // 30% SL
        trade.exitReason = 'SL Atingido';
      } else {
        closePrice = signal.price + (Math.random() - 0.5) * 10;
        trade.exitReason = 'Saída Manual';
      }
    } else {
      if (random < 0.55) {
        closePrice = signal.takeProfit; // 55% TP
        trade.exitReason = 'TP Atingido';
      } else if (random < 0.30) {
        closePrice = signal.stopLoss; // 30% SL
        trade.exitReason = 'SL Atingido';
      } else {
        closePrice = signal.price - (Math.random() - 0.5) * 10;
        trade.exitReason = 'Saída Manual';
      }
    }

    trade.exitPrice = closePrice;
    trade.exit = new Date().toLocaleTimeString('pt-PT');
    trade.profit = signal.type === 'BUY'
      ? closePrice - signal.price
      : signal.price - closePrice;
    trade.profitPercent = (trade.profit / signal.price * 100).toFixed(4);

    trade.status = trade.profit > 0.5 ? 'LUCRO' : trade.profit < -0.5 ? 'PREJUÍZO' : 'BREAKEVEN';

    if (trade.status === 'LUCRO') {
      state.wins++;
      playSound('profit');
      sendDesktopNotification('💰 LUCRO!', {
        body: `${trade.type}: +$${trade.profit.toFixed(2)} (+${trade.profitPercent}%)`,
        tag: 'profit'
      });
    }
    state.total++;
    state.totalProfit += trade.profit;

    updateTradeCard(trade);
    updateStats();
  }, 3000);

  trade.closeTimeout = closeTimeout;
  state.trades.unshift(trade);
  addTradeCard(trade);
  updateStats();

  return trade;
}

function addTradeCard(trade) {
  const container = document.getElementById('trades-container');
  
  if (container.querySelector('.no-trades')) {
    container.innerHTML = '';
  }

  const card = document.createElement('div');
  card.className = `trade-card ${trade.type.toLowerCase()}`;
  card.id = `trade-${trade.id}`;
  
  card.innerHTML = `
    <div class="trade-info">
      <div class="trade-type ${trade.type.toLowerCase()}">
        ${trade.type === 'BUY' ? '📈 COMPRA' : '📉 VENDA'} - ${trade.strength}% | Confiança: ${trade.confidence}%
      </div>
      <div class="trade-details">
        <span>⏰ ${trade.entry}</span>
        <span>💰 $${trade.entryPrice.toFixed(2)}</span>
        <span>📊 RSI: ${trade.rsi}</span>
        <span>🎯 TP: $${trade.tp.toFixed(2)}</span>
        <span>🛑 SL: $${trade.sl.toFixed(2)}</span>
      </div>
      <div class="trade-reason" style="font-size: 0.7rem; color: #888; margin-top: 4px;">
        ${trade.reason}
      </div>
    </div>
    <div class="trade-profit ${trade.status === 'ABERTO' ? 'neutral' : (trade.profit > 0 ? 'positive' : 'negative')}">
      ${trade.status === 'ABERTO' ? '⏳ Aberto' : `$${trade.profit.toFixed(4)}`}
    </div>
  `;

  container.insertBefore(card, container.firstChild);
}

function updateTradeCard(trade) {
  const card = document.getElementById(`trade-${trade.id}`);
  if (!card) return;

  const profitDiv = card.querySelector('.trade-profit');
  profitDiv.className = `trade-profit ${trade.profit > 0 ? 'positive' : 'negative'}`;
  profitDiv.innerHTML = `
    <strong>$${trade.profit.toFixed(4)}</strong><br>
    <small>${trade.profitPercent > 0 ? '+' : ''}${trade.profitPercent}%</small><br>
    <small>${trade.exitReason}</small>
  `;
}

function updateStats() {
  document.getElementById('total-trades').textContent = state.total;
  
  const profitColor = state.totalProfit > 0 ? '#28a745' : state.totalProfit < 0 ? '#dc3545' : '#666';
  const profitSpan = document.getElementById('total-profit');
  profitSpan.textContent = state.totalProfit > 0
    ? `+$${state.totalProfit.toFixed(2)}`
    : `$${state.totalProfit.toFixed(2)}`;
  profitSpan.style.color = profitColor;
  
  const winRate = state.total > 0
    ? ((state.wins / state.total) * 100).toFixed(1)
    : '0';
  document.getElementById('win-rate').textContent = winRate + '%';
}

function clearTrades() {
  state.trades.forEach(trade => {
    if (trade.closeTimeout) clearTimeout(trade.closeTimeout);
  });
  state.trades = [];
  state.totalProfit = 0;
  state.wins = 0;
  state.total = 0;
  document.getElementById('trades-container').innerHTML = '<div class="no-trades">Aguardando sinais...</div>';
  updateStats();
  showNotification('🗑️ Histórico limpo!', 'success');
}

// ============= GERAÇÃO DE DADOS REALISTA =============
function generateRealisticPrice() {
  const lastPrice = state.priceData.length > 0
    ? state.priceData[state.priceData.length - 1].price
    : 2000;

  const trend = Math.sin(Date.now() / 15000) * 0.3;
  const volatility = (Math.random() - 0.5) * 12;
  const change = volatility + trend;
  const newPrice = Math.max(1950, Math.min(2050, lastPrice + change));
  const spread = 2.5;

  return {
    price: parseFloat(newPrice.toFixed(2)),
    bid: parseFloat((newPrice - spread / 2).toFixed(2)),
    ask: parseFloat((newPrice + spread / 2).toFixed(2)),
    timestamp: new Date()
  };
}

function updateMarketData() {
  const data = generateRealisticPrice();
  state.priceData.push(data);
  
  if (state.priceData.length > 300) {
    state.priceData.shift();
  }

  document.getElementById('current-price').textContent = `$${data.price.toFixed(2)}`;
  document.getElementById('current-bid').textContent = `$${data.bid.toFixed(2)}`;
  document.getElementById('current-ask').textContent = `$${data.ask.toFixed(2)}`;
  document.getElementById('current-spread').textContent = `${(data.ask - data.bid).toFixed(2)} pips`;

  updateChart(state.priceData);

  if (state.isRunning && state.priceData.length >= 50) {
    const signal = detectSniperSignal();
    if (signal) {
      executeTrade(signal);
    }
  }
}

// ============= CONTROLES =============
async function checkStatus() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    updateStatus(true, `✅ Online - ${new Date(data.timestamp).toLocaleTimeString('pt-PT')}`);
  } catch (error) {
    updateStatus(false, '❌ Offline');
  }
}

function updateStatus(online, message) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-indicator ${online ? 'online' : 'offline'}`;
  
  const info = document.getElementById('server-info');
  info.textContent = online ? '✅ Pronto' : '❌ Indisponível';
}

async function connectMT5() {
  try {
    const response = await fetch(`${API_BASE}/mt5/connect`, { method: 'POST' });
    const data = await response.json();
    state.mt5Connected = true;
    showNotification('🔗 MT5 Conectado!', 'success');
  } catch (error) {
    showNotification('❌ Erro ao conectar MT5', 'error');
  }
}

function startSniper() {
  if (!state.mt5Connected) {
    showNotification('⚠️ Conecte ao MT5 primeiro!', 'error');
    return;
  }
  
  requestNotificationPermission();
  state.isRunning = true;
  showNotification('🎯 Sniper ATIVADO!', 'success');
}

function stopSniper() {
  state.isRunning = false;
  showNotification('⏹️ Sniper PARADO', 'error');
}

function changeTimeframe(tf) {
  state.currentTimeframe = tf;
  
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  showNotification(`📊 Timeframe: ${tf}`, 'success');
}

// ============= NOTIFICAÇÕES =============
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: bold;
    z-index: 1000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  notification.textContent = message;
  notification.style.backgroundColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
  
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// ============= INICIALIZAÇÃO =============
window.addEventListener('load', () => {
  checkStatus();
  initChart();
  requestNotificationPermission();
  
  setInterval(updateMarketData, 500);
  setInterval(checkStatus, 30000);
  
  showNotification('🚀 RB Gold Sniper Trader INICIADO!', 'success');
});
