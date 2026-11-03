const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTradeOutcomeFromCandles } = require('../api/trades');

const base = {
  type: 'BUY', price: 100, tp: 110, sl: 95,
  signalTimestamp: '2026-11-03T10:00:00.000Z'
};
const candle = (minute, high, low, extra = {}) => ({
  timestamp: `2026-11-03T10:${String(minute).padStart(2, '0')}:00.000Z`,
  high, low, ...extra
});

test('ignores open candles and candles at/before signal time', () => {
  const result = resolveTradeOutcomeFromCandles(base, [
    candle(0, 111, 99),
    candle(1, 111, 99, { complete: false }),
    candle(2, 111, 99, { isOpen: true })
  ]);
  assert.equal(result.status, 'ALERTA');
});

test('resolves WIN from a closed candle', () => {
  const result = resolveTradeOutcomeFromCandles(base, [candle(1, 110, 99)]);
  assert.equal(result.status, 'WIN');
});

test('resolves LOSS when SL is reached', () => {
  const result = resolveTradeOutcomeFromCandles(base, [candle(1, 102, 95)]);
  assert.equal(result.status, 'LOSS');
});

test('same-candle TP and SL is conservatively LOSS', () => {
  const result = resolveTradeOutcomeFromCandles(base, [candle(1, 111, 94)]);
  assert.equal(result.status, 'LOSS');
});

test('arms BE at 50% and only closes BE on a later candle returning to entry', () => {
  const result = resolveTradeOutcomeFromCandles(base, [
    candle(1, 105, 101),
    candle(2, 104, 100)
  ]);
  assert.equal(result.status, 'BE');
  assert.equal(result.beArmedAt, '2026-11-03T10:01:00.000Z');
  assert.equal(result.beExitPrice, 100);
});

test('persists BE activation across polling windows', () => {
  const result = resolveTradeOutcomeFromCandles({
    ...base, beArmed: true, beArmedAt: '2026-11-03T10:01:00.000Z',
    beTriggerPrice: 105
  }, [candle(3, 104, 100)]);
  assert.equal(result.status, 'BE');
  assert.equal(result.beArmedAt, '2026-11-03T10:01:00.000Z');
});

test('SELL BE uses the mirrored 50% favorable move', () => {
  const sell = { ...base, type: 'SELL', tp: 90, sl: 105 };
  const result = resolveTradeOutcomeFromCandles(sell, [
    candle(1, 99, 95),
    candle(2, 100, 96)
  ]);
  assert.equal(result.status, 'BE');
});
