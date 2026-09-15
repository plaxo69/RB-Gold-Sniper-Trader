const express = require('express');
const router = express.Router();

// Mock market data
const getMockMarketData = () => {
  return {
    symbol: 'XAUUSD',
    name: 'Gold vs US Dollar',
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
};

// Analyze market
router.get('/market', (req, res) => {
  try {
    const marketData = getMockMarketData();
    
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

// Get technical indicators
router.get('/indicators', (req, res) => {
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

module.exports = router;
