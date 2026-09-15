const express = require('express');
const router = express.Router();

// Mock MT5 connection state
let mt5Connected = false;
let tradingActive = false;

// Connect to MT5
router.post('/connect', (req, res) => {
  try {
    mt5Connected = true;
    res.json({
      success: true,
      message: 'Conectado ao MetaTrader 5 com sucesso',
      status: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao conectar ao MT5',
      error: error.message
    });
  }
});

// Handle trading actions
router.post('/trade', (req, res) => {
  try {
    const { action } = req.body;

    if (!mt5Connected) {
      return res.status(400).json({
        success: false,
        message: 'MT5 não está conectado'
      });
    }

    if (action === 'start') {
      tradingActive = true;
      res.json({
        success: true,
        message: 'Trading iniciado',
        status: 'trading',
        timestamp: new Date()
      });
    } else if (action === 'stop') {
      tradingActive = false;
      res.json({
        success: true,
        message: 'Trading parado',
        status: 'stopped',
        timestamp: new Date()
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Ação inválida'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao processar ação de trading',
      error: error.message
    });
  }
});

// Get MT5 status
router.get('/status', (req, res) => {
  res.json({
    connected: mt5Connected,
    trading: tradingActive,
    timestamp: new Date()
  });
});

module.exports = router;
