// API Base URL
const API_BASE = '/api';

// Check server health
async function checkStatus() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    updateStatus(true, `Servidor Online - ${new Date(data.timestamp).toLocaleTimeString('pt-PT')}`);
  } catch (error) {
    updateStatus(false, 'Servidor Offline');
    console.error('Erro ao verificar status:', error);
  }
}

// Update status display
function updateStatus(online, message) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-indicator ${online ? 'online' : 'offline'}`;
}

// Connect to MT5
async function connectMT5() {
  try {
    const response = await fetch(`${API_BASE}/mt5/connect`, { method: 'POST' });
    const data = await response.json();
    showNotification(data.message || 'Conectado ao MT5', 'success');
  } catch (error) {
    showNotification('Erro ao conectar MT5', 'error');
    console.error('Erro:', error);
  }
}

// Start trading
async function startTrading() {
  try {
    const response = await fetch(`${API_BASE}/mt5/trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' })
    });
    const data = await response.json();
    showNotification('Trading iniciado', 'success');
    updateData(data);
  } catch (error) {
    showNotification('Erro ao iniciar trading', 'error');
    console.error('Erro:', error);
  }
}

// Stop trading
async function stopTrading() {
  try {
    const response = await fetch(`${API_BASE}/mt5/trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
    const data = await response.json();
    showNotification('Trading parado', 'success');
    updateData(data);
  } catch (error) {
    showNotification('Erro ao parar trading', 'error');
    console.error('Erro:', error);
  }
}

// Get market analysis
async function getAnalysis() {
  try {
    const response = await fetch(`${API_BASE}/analyze/market`);
    const data = await response.json();
    showNotification('Análise obtida', 'success');
    updateData(data);
  } catch (error) {
    showNotification('Erro ao obter análise', 'error');
    console.error('Erro:', error);
  }
}

// Update data display
function updateData(data) {
  const dataDiv = document.getElementById('data');
  dataDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

// Show notification
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 5px;
    color: white;
    font-weight: bold;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  notification.style.backgroundColor = type === 'success' ? '#28a745' : '#dc3545';
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

// Check status on load
window.addEventListener('load', checkStatus);

// Auto-refresh status every 30 seconds
setInterval(checkStatus, 30000);
