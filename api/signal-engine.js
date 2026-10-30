function ts(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const n = Number(v);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const d = Date.parse(v);
  return Number.isFinite(d) ? d : NaN;
}

function keyOf(t) {
  return t?.signalKey || t?.key || ((t?.type || '') + '-' + (t?.signalTimestamp || t?.time || ''));
}

function movementKey(a) {
  const t = a?.tactical || {};
  const side = a?.type || 'WAIT';
  const ev = side === 'BUY' ? t.buyEvent : t.sellEvent;
  const level = side === 'BUY' ? t.buyLevel : t.sellLevel;
  if (ev?.type && Number.isFinite(+level)) return `${ev.type}-${level}`;
  return `${side}-${String(a?.signalTimestamp || a?.time || '')}`;
}

function normalizeTradeRecord(trade) {
  if (!trade || typeof trade !== 'object') return trade;
  const type = String(trade.type || 'WAIT').toUpperCase();
  const normalizedType = ['BUY', 'SELL', 'WAIT'].includes(type) ? type : 'WAIT';
  const status = String(trade.status || 'ALERTA').toUpperCase();
  const normalizedStatus = ['WIN', 'LOSS', 'ALERTA', 'BE'].includes(status) ? status : 'ALERTA';

  return {
    ...trade,
    type: normalizedType,
    status: normalizedStatus,
    signalKey: trade.signalKey || trade.key || `${normalizedType}-${trade.signalTimestamp || trade.time || new Date().toISOString()}`,
    signalTimestamp: trade.signalTimestamp || trade.time || null,
    price: trade.price != null ? Number(trade.price) : null,
    tp: trade.tp != null ? Number(trade.tp) : null,
    sl: trade.sl != null ? Number(trade.sl) : null,
    source: trade.source || 'UNKNOWN',
    signalKind: trade.signalKind || trade.source || 'SNIPER'
  };
}

function normalizeSignal(signal) {
  if (!signal || typeof signal !== 'object') return null;
  const type = String(signal.type || 'WAIT').toUpperCase();
  const normalizedType = ['BUY', 'SELL', 'WAIT'].includes(type) ? type : 'WAIT';

  return {
    ...signal,
    type: normalizedType,
    status: 'ALERTA',
    signalKey: signal.signalKey || signal.key || `${normalizedType}-${signal.signalTimestamp || signal.time || new Date().toISOString()}`,
    signalTimestamp: signal.signalTimestamp || signal.time || new Date().toISOString(),
    source: signal.source || 'UNKNOWN',
    signalKind: signal.signalKind || signal.source || 'SNIPER',
    price: signal.price != null ? Number(signal.price) : null,
    tp: signal.tp != null ? Number(signal.tp) : null,
    sl: signal.sl != null ? Number(signal.sl) : null,
    rr: signal.rr != null ? Number(signal.rr) : (signal.rr1 != null ? Number(signal.rr1) : null),
    aiScore: signal.aiScore != null ? Number(signal.aiScore) : null,
    aiWinRate: signal.aiWinRate != null ? Number(signal.aiWinRate) : null,
    __schemaVersion: 2
  };
}

function normalizeTrade(t) {
  if (!t) return t;
  const safeTrade = normalizeTradeRecord(t);
  const s = String(safeTrade.status || 'ALERTA').toUpperCase();
  if (['WIN', 'LOSS', 'ALERTA'].includes(s)) return { ...safeTrade, status: s };
  if (s === 'BE') return { ...safeTrade, status: 'BE', outcomeReason: safeTrade.outcomeReason || 'Break Even' };
  return { ...safeTrade, status: 'ALERTA' };
}

module.exports = {
  ts,
  keyOf,
  movementKey,
  normalizeTradeRecord,
  normalizeSignal,
  normalizeTrade
};
