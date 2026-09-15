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
  chart: null
};

// ============= GRÁFICO =============
function initChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Preço XAUUSD',
          data: [],
          borderColor: '#302b63',
          backgroundColor: 'rgba(48, 43, 99, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: '#302b63',
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
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding: 15,
            font: { size: 12 },
            usePointStyle: true
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
  if (!state.chart) return;

  const labels = priceData.map((_, i) => i);
  const prices = priceData.map(d => d.price);
  const ma20 = calculateMA(prices, 20);
  const support = Math.min(...prices.slice(-20));
  const resistance = Math.max(...prices.slice(-20));

  state.chart.data.labels = labels;
  state.chart.data.datasets[0].data = prices;
  state.chart.data.datasets[1].data = ma20;
  state.chart.data.datasets[2].data = Array(prices.length).fill(support);
  state.chart.data.datasets[3].data = Array(prices.length).fill(resistance);
  state.chart.update('none');
}

// ============= CÁLCULOS TÉCNICOS =============
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
  if (prices.length < 26) return 0;
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12[ema12.length - 1] - ema26[ema26.length - 1];
  return macd;
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  
  return ema;
}

function calculateBollingerBands(prices, period = 20) {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };
  
  const ma = prices.slice(-period).reduce((a, b) => a + b) / period;
  const variance = prices.slice(-period).reduce((sum, p) => sum + Math.pow(p - ma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: ma + (stdDev * 2),
    middle: ma,
    lower: ma - (stdDev * 2)
  };
}

function calculateStochastic(prices, period = 14) {
  if (prices.length < period) return { k: 50, d: 50 };
  
  const highest = Math.max(...prices.slice(-period));
  const lowest = Math.min(...prices.slice(-period));
  const lastPrice = prices[prices.length - 1];
  
  const k = ((lastPrice - lowest) / (highest - lowest)) * 100;
  return { k: isFinite(k) ? k : 50, d: 50 };
}

// ============= ALGORITMO SNIPER AVANÇADO =============
function detectSniperSignal() {
  if (state.priceData.length < 50) return null;

  const prices = state.priceData.map(d => d.price);
  const lastPrice = prices[prices.length - 1];
  const previousPrice = prices[prices.length - 2];
  
  // Indicadores
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  const bb = calculateBollingerBands(prices);
  const stoch = calculateStochastic(prices);
  const ma20 = calculateMA(prices, 20)[prices.length - 1] || lastPrice;
  const ma50 = calculateMA(prices, 50)[prices.length - 1] || lastPrice;
  const ma200 = calculateMA(prices, 200)[prices.length - 1] || lastPrice;

  // Atualizar display de indicadores
  document.getElementById('rsi-value').textContent = rsi.toFixed(2);
  document.getElementById('macd-value').textContent = macd.toFixed(4);
  document.getElementById('bb-upper').textContent = bb.upper.toFixed(2);
  document.getElementById('bb-lower').textContent = bb.lower.toFixed(2);
  document.getElementById('ma20').textContent = ma20.toFixed(2);

  // Detectar tendência
  const trend = lastPrice > ma50 ? 'ALTA' : lastPrice < ma50 ? 'BAIXA' : 'LATERAL';
  document.getElementById('trend-value').textContent = trend;

  let signal = null;
  let strength = 0;

  // ===== SINAL SNIPER: BUY (Compra Agressiva) =====
  // Condições: Preço em sobrevendido, toque suporte, divergência bullish
  const buyConditions = {
    rsiSobrevendido: rsi < 30,                          // RSI < 30
    precoAbaixoMA20: lastPrice < ma20,                 // Preço abaixo MA20
    precoAbaixoSuporteForte: lastPrice <= bb.lower,   // Toque banda inferior
    macdiNegativo: macd < -0.0001,                      // MACD negativo (antes de cruzar)
    quedaRecente: previousPrice > lastPrice,           // Candle vermelho
    tendenciaRecuperacao: prices[prices.length - 3] < lastPrice,  // Recuperação em andamento
    stochBaixo: stoch.k < 20                            // Estocástico < 20
  };

  const buyScore = Object.values(buyConditions).filter(Boolean).length;

  if (buyScore >= 4) {
    strength = Math.min(100, 40 + (buyScore * 10));
    signal = {
      type: 'BUY',
      price: lastPrice,
      reason: `Sniper BUY Entry (${buyScore}/7 condições)`,
      rsi,
      strength: strength,
      takeProfit: lastPrice * 1.0025,  // +0.25% (~$5 em $2000)
      stopLoss: lastPrice * 0.9985,    // -0.15% (~$3 em $2000)
      scoreBreakdown: buyConditions
    };
  }

  // ===== SINAL SNIPER: SELL (Venda Agressiva) =====
  // Condições: Preço em sobrecomprado, toque resistência, divergência bearish
  const sellConditions = {
    rsiSobrecomprado: rsi > 70,                          // RSI > 70
    precoAcimaMA20: lastPrice > ma20,                  // Preço acima MA20
    precoAcimaResistencia: lastPrice >= bb.upper,     // Toque banda superior
    macdiPositivo: macd > 0.0001,                       // MACD positivo (antes de cruzar)
    subidaRecente: previousPrice < lastPrice,         // Candle verde
    tendenciaQueda: prices[prices.length - 3] > lastPrice,  // Reversão em andamento
    stochAlto: stoch.k > 80                             // Estocástico > 80
  };

  const sellScore = Object.values(sellConditions).filter(Boolean).length;

  if (sellScore >= 4 && !signal) {
    strength = Math.min(100, 40 + (sellScore * 10));
    signal = {
      type: 'SELL',
      price: lastPrice,
      reason: `Sniper SELL Entry (${sellScore}/7 condições)`,
      rsi,
      strength: strength,
      takeProfit: lastPrice * 0.9975,  // -0.25% (~$5 em $2000)
      stopLoss: lastPrice * 1.0015,    // +0.15% (~$3 em $2000)
      scoreBreakdown: sellConditions
    };
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
    status: 'ABERTO',
    profit: 0,
    profitPercent: 0,
    reason: signal.reason
  };

  // Simular fechamento após 3 ciclos (1.5 segundos em tempo real)
  const closeTimeout = setTimeout(() => {
    const pricesAtuais = state.priceData.slice(-10).map(d => d.price);
    let closePrice;
    
    if (signal.type === 'BUY') {
      // Para BUY, pode atingir TP ou SL
      const hitTP = Math.random() < 0.6; // 60% de chance
      closePrice = hitTP ? signal.takeProfit : signal.stopLoss;
    } else {
      // Para SELL, pode atingir TP ou SL
      const hitTP = Math.random() < 0.6; // 60% de chance
      closePrice = hitTP ? signal.takeProfit : signal.stopLoss;
    }

    trade.exitPrice = closePrice;
    trade.exit = new Date().toLocaleTimeString('pt-PT');
    trade.profit = signal.type === 'BUY'
      ? closePrice - signal.price
      : signal.price - closePrice;
    trade.profitPercent = (trade.profit / signal.price * 100).toFixed(4);

    trade.status = trade.profit > 0 ? 'LUCRO' : trade.profit < 0 ? 'PREJUÍZO' : 'BREAKEVEN';

    if (trade.status === 'LUCRO') state.wins++;
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
        ${trade.type === 'BUY' ? '📈 COMPRA' : '📉 VENDA'} - ${trade.strength}% Força
      </div>
      <div class="trade-details">
        <span>⏰ ${trade.entry}</span>
        <span>💰 $${trade.entryPrice.toFixed(2)}</span>
        <span>📊 RSI: ${trade.rsi}</span>
        <span>🎯 TP: $${trade.tp.toFixed(2)}</span>
        <span>🛑 SL: $${trade.sl.toFixed(2)}</span>
      </div>
      <div class="trade-reason" style="font-size: 0.8rem; color: #666; margin-top: 5px; font-style: italic;">
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
    <strong>$${trade.profit.toFixed(4)}</strong>
    <small>${trade.profitPercent > 0 ? '+' : ''}${trade.profitPercent}%</small>
  `;

  const tradeInfo = card.querySelector('.trade-info');
  const details = tradeInfo.querySelector('.trade-details');
  details.innerHTML += `<span>📍 ${trade.exit}</span>`;
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

  // Movimento mais realista com tendências
  const trend = Math.sin(Date.now() / 10000) * 0.5; // Onda lenta
  const randomWalk = (Math.random() - 0.5) * 10;
  const change = randomWalk + trend;
  const newPrice = Math.max(1900, Math.min(2100, lastPrice + change));
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
  
  if (state.priceData.length > 250) {
    state.priceData.shift();
  }

  // Atualizar display
  document.getElementById('current-price').textContent = `$${data.price.toFixed(2)}`;
  document.getElementById('current-bid').textContent = `$${data.bid.toFixed(2)}`;
  document.getElementById('current-ask').textContent = `$${data.ask.toFixed(2)}`;
  document.getElementById('current-spread').textContent = `${(data.ask - data.bid).toFixed(2)} pips`;

  // Atualizar gráfico
  updateChart(state.priceData);

  // Detectar sinais
  if (state.isRunning && state.priceData.length >= 50) {
    const signal = detectSniperSignal();
    if (signal) {
      executeTrade(signal);
      showNotification(
        `🎯 ${signal.type === 'BUY' ? '📈' : '📉'} ${signal.type} - Força: ${signal.strength.toFixed(0)}%`,
        'success'
      );
    }
  }
}

// ============= CONTROLES =============
async function checkStatus() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    updateStatus(true, `✅ Servidor Online - ${new Date(data.timestamp).toLocaleTimeString('pt-PT')}`);
  } catch (error) {
    updateStatus(false, '❌ Servidor Offline');
    console.error('Erro ao verificar status:', error);
  }
}

function updateStatus(online, message) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-indicator ${online ? 'online' : 'offline'}`;
  
  const info = document.getElementById('server-info');
  info.textContent = online ? '✅ Sistema Pronto' : '❌ Sistema Indisponível';
}

async function connectMT5() {
  try {
    const response = await fetch(`${API_BASE}/mt5/connect`, { method: 'POST' });
    const data = await response.json();
    state.mt5Connected = true;
    showNotification('🔗 MT5 Conectado com Sucesso!', 'success');
  } catch (error) {
    showNotification('❌ Erro ao conectar MT5', 'error');
    console.error('Erro:', error);
  }
}

function startSniper() {
  if (!state.mt5Connected) {
    showNotification('⚠️ Conecte ao MT5 primeiro!', 'error');
    return;
  }
  
  state.isRunning = true;
  showNotification('🎯 Sniper ATIVADO! Procurando sinais...', 'success');
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
  
  // Gerar preços a cada 500ms (simula tempo real)
  setInterval(updateMarketData, 500);
  
  // Atualizar status a cada 30 segundos
  setInterval(checkStatus, 30000);
  
  showNotification('🚀 RB Gold Sniper Trader INICIADO!', 'success');
});
