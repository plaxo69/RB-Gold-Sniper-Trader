const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============= MIDDLEWARE =============
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============= ESTADO EM MEMÓRIA (Placeholder para DB) =============
const memoryDB = {
  trades: [],
  sessions: [],
  signals: [],
  settings: {
    riskPerTrade: 2,
    maxDailyLoss: 100,
    soundEnabled: true,
    notificationsEnabled: true
  }
};

// ============= HEALTH CHECK =============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed / 1024 / 1024,
    trades: memoryDB.trades.length,
    signals: memoryDB.signals.length
  });
});

// ============= SESSÃO =============
app.post('/api/session/start', (req, res) => {
  const session = {
    id: Date.now(),
    startTime: new Date(),
    trades: [],
    profit: 0,
    status: 'RUNNING'
  };
  
  memoryDB.sessions.push(session);
  
  res.json({
    success: true,
    sessionId: session.id,
    message: 'Sessão iniciada'
  });
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = memoryDB.sessions.find(s => s.id === parseInt(req.params.sessionId));
  
  if (!session) {
    return res.status(404).json({ error: 'Sessão não encontrada' });
  }
  
  res.json(session);
});

// ============= MT5 API =============
app.post('/api/mt5/connect', (req, res) => {
  try {
    // TODO: Implementar integração real com MT5 via WebSocket ou Python bridge
    // Por enquanto, simular conexão
    
    res.json({
      success: true,
      message: 'Conectado ao MetaTrader 5',
      status: 'connected',
      server: process.env.MT5_SERVER || 'Vantage Demo',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao conectar ao MT5',
      error: error.message
    });
  }
});

app.get('/api/mt5/status', (req, res) => {
  res.json({
    connected: true,
    trading: true,
    server: process.env.MT5_SERVER || 'Vantage Demo',
    account: process.env.MT5_LOGIN || 'DEMO',
    balance: 10000,
    equity: 10000,
    profit: memoryDB.trades.reduce((sum, t) => sum + (t.profit || 0), 0),
    timestamp: new Date()
  });
});

app.post('/api/mt5/trade', (req, res) => {
  const { action, symbol, volume, price, type } = req.body;
  
  try {
    const trade = {
      id: Date.now(),
      action,
      symbol: symbol || 'XAUUSD',
      volume: volume || 1,
      openPrice: price || 2000,
      type: type || 'BUY',
      openTime: new Date(),
      status: 'OPEN',
      profit: 0
    };
    
    memoryDB.trades.push(trade);
    
    res.json({
      success: true,
      message: `Trade ${action} executado`,
      tradeId: trade.id,
      trade: trade
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao executar trade',
      error: error.message
    });
  }
});

app.post('/api/mt5/close-trade', (req, res) => {
  const { tradeId, closePrice } = req.body;
  
  const trade = memoryDB.trades.find(t => t.id === parseInt(tradeId));
  
  if (!trade) {
    return res.status(404).json({ error: 'Trade não encontrado' });
  }
  
  trade.closePrice = closePrice;
  trade.closeTime = new Date();
  trade.status = 'CLOSED';
  
  if (trade.type === 'BUY') {
    trade.profit = closePrice - trade.openPrice;
  } else {
    trade.profit = trade.openPrice - closePrice;
  }
  
  res.json({
    success: true,
    message: 'Trade fechado',
    trade: trade,
    profit: trade.profit.toFixed(2)
  });
});

// ============= ANÁLISE DE MERCADO =============
app.get('/api/analyze/market', (req, res) => {
  try {
    const marketData = {
      symbol: 'XAUUSD',
      price: (2000 + Math.random() * 100).toFixed(2),
      bid: (1999 + Math.random() * 100).toFixed(2),
      ask: (2001 + Math.random() * 100).toFixed(2),
      change24h: (Math.random() * 20 - 10).toFixed(2),
      changePercent: (Math.random() * 2 - 1).toFixed(2),
      high24h: (2050 + Math.random() * 50).toFixed(2),
      low24h: (1950 + Math.random() * 50).toFixed(2),
      volume: Math.floor(Math.random() * 1000000),
      timestamp: new Date()
    };
    
    const analysis = {
      data: marketData,
      signals: {
        trend: Math.random() > 0.5 ? 'BULLISH' : 'BEARISH',
        strength: (Math.random() * 100).toFixed(2) + '%',
        support: (1950 + Math.random() * 50).toFixed(2),
        resistance: (2050 + Math.random() * 50).toFixed(2)
      },
      recommendation: Math.random() > 0.5 ? 'BUY' : 'SELL',
      confidence: (Math.random() * 100).toFixed(2) + '%',
      riskLevel: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
      timestamp: new Date()
    };

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao analisar mercado',
      error: error.message
    });
  }
});

app.get('/api/analyze/indicators', (req, res) => {
  try {
    const indicators = {
      rsi: (Math.random() * 100).toFixed(2),
      macd: (Math.random() * 100 - 50).toFixed(2),
      bollingerBands: {
        upper: (2050).toFixed(2),
        middle: (2000).toFixed(2),
        lower: (1950).toFixed(2)
      },
      movingAverage: {
        ma20: (2000 + Math.random() * 50).toFixed(2),
        ma50: (1995 + Math.random() * 50).toFixed(2),
        ma200: (1990 + Math.random() * 50).toFixed(2)
      },
      stochastic: {
        k: (Math.random() * 100).toFixed(2),
        d: (Math.random() * 100).toFixed(2)
      },
      atr: (Math.random() * 50).toFixed(2),
      timestamp: new Date()
    };

    res.json({
      success: true,
      indicators
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao obter indicadores',
      error: error.message
    });
  }
});

// ============= SINAIS SNIPER =============
app.post('/api/signals/create', (req, res) => {
  const { type, price, reason, strength, confidence } = req.body;
  
  const signal = {
    id: Date.now(),
    type,
    price,
    reason,
    strength,
    confidence,
    createdAt: new Date(),
    status: 'PENDING'
  };
  
  memoryDB.signals.push(signal);
  
  res.json({
    success: true,
    signal: signal
  });
});

app.get('/api/signals', (req, res) => {
  const { limit = 50, status } = req.query;
  
  let signals = memoryDB.signals;
  
  if (status) {
    signals = signals.filter(s => s.status === status);
  }
  
  res.json({
    success: true,
    count: signals.length,
    signals: signals.slice(-limit)
  });
});

app.put('/api/signals/:signalId', (req, res) => {
  const signal = memoryDB.signals.find(s => s.id === parseInt(req.params.signalId));
  
  if (!signal) {
    return res.status(404).json({ error: 'Sinal não encontrado' });
  }
  
  Object.assign(signal, req.body);
  
  res.json({
    success: true,
    signal: signal
  });
});

// ============= HISTÓRICO DE TRADES =============
app.get('/api/trades', (req, res) => {
  const { status, limit = 100 } = req.query;
  
  let trades = memoryDB.trades;
  
  if (status) {
    trades = trades.filter(t => t.status === status);
  }
  
  res.json({
    success: true,
    count: trades.length,
    totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0),
    trades: trades.slice(-limit)
  });
});

app.get('/api/trades/stats', (req, res) => {
  const closedTrades = memoryDB.trades.filter(t => t.status === 'CLOSED');
  const winTrades = closedTrades.filter(t => t.profit > 0);
  const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
  
  res.json({
    success: true,
    stats: {
      totalTrades: memoryDB.trades.length,
      closedTrades: closedTrades.length,
      openTrades: memoryDB.trades.filter(t => t.status === 'OPEN').length,
      winTrades: winTrades.length,
      lossTrades: closedTrades.length - winTrades.length,
      winRate: closedTrades.length > 0 ? ((winTrades.length / closedTrades.length) * 100).toFixed(2) : 0,
      totalProfit: totalProfit.toFixed(2),
      averageProfit: closedTrades.length > 0 ? (totalProfit / closedTrades.length).toFixed(2) : 0
    }
  });
});

// ============= CONFIGURAÇÕES =============
app.get('/api/settings', (req, res) => {
  res.json({
    success: true,
    settings: memoryDB.settings
  });
});

app.put('/api/settings', (req, res) => {
  Object.assign(memoryDB.settings, req.body);
  
  res.json({
    success: true,
    settings: memoryDB.settings
  });
});

// ============= ERRO 404 =============
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.path,
    method: req.method
  });
});

// ============= ERROR HANDLING =============
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// ============= INICIALIZAR SERVIDOR =============
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║  🎯 RB Gold Sniper Trader           ║
║  Servidor iniciado em:              ║
║  http://localhost:${PORT}                ║
╚══════════════════════════════════════╝
  `);
  console.log(`
📊 Endpoints disponíveis:
  GET  /api/health              - Health check
  GET  /api/mt5/status          - Status MT5
  POST /api/mt5/connect         - Conectar MT5
  POST /api/mt5/trade           - Executar trade
  GET  /api/analyze/market      - Análise mercado
  GET  /api/trades              - Histórico trades
  GET  /api/trades/stats        - Estatísticas
  GET  /api/signals             - Lista sinais
  POST /api/signals/create      - Criar sinal
  `);
});

module.exports = app;
