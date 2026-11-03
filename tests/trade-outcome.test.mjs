import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/trade-outcome.js';

const base = {
  type: 'BUY', price: 100, tp: 110, sl: 95,
  signalTimestamp: '2026-11-03T10:00:00.000Z'
};
const candle = (minute, high, low, extra = {}) => ({
  timestamp: `2026-11-03T10:${String(minute).padStart(2, '0')}:00.000Z`,
  high, low, ...extra
});
const resolve = (trade, candles) => globalThis.RBTradeOutcome.resolveTradeOutcome(
  trade.type, trade.sl, trade.tp, candles, trade
);

test('ignores open candles and candles at/before signal time', () => {
  const result = resolve(base, [
    candle(0, 111, 99),
    candle(1, 111, 99, { complete: false }),
    candle(2, 111, 99, { isOpen: true })
  ]);
  assert.equal(result, null);
});

test('resolves WIN on a closed candle', () => {
  assert.equal(resolve(base, [candle(1, 110, 99)]).result, 'WIN');
});

test('resolves LOSS on SL and conservatively resolves same-candle TP+SL as LOSS', () => {
  assert.equal(resolve(base, [candle(1, 102, 95)]).result, 'LOSS');
  assert.equal(resolve(base, [candle(1, 111, 94)]).result, 'LOSS');
});

test('50% do TP apenas arma o alerta; sem confirmação manual não fecha como BE', () => {
  const result = resolve(base, [candle(1, 105, 101), candle(2, 104, 100)]);
  assert.equal(result.result, undefined);
  assert.equal(result.beArmed, true);
  assert.equal(result.beArmedAt, '2026-11-03T10:01:00.000Z');
});

test('mantém BE confirmado entre janelas de consulta e fecha na entrada', () => {
  const armed = {
    ...base,
    beArmed: true,
    beConfirmed: true,
    beArmedAt: '2026-11-03T10:01:00.000Z',
    beConfirmedAt: '2026-11-03T10:01:30.000Z',
    beTriggerPrice: 105
  };
  assert.equal(resolve(armed, [candle(3, 104, 100)]).result, 'BE');
});

test('aplica a mesma confirmação manual BE às operações SELL', () => {
  const sell = {
    ...base,
    type: 'SELL',
    tp: 90,
    sl: 105,
    beArmed: true,
    beConfirmed: true,
    beArmedAt: '2026-11-03T10:01:00.000Z',
    beConfirmedAt: '2026-11-03T10:01:30.000Z',
    beTriggerPrice: 95
  };
  assert.equal(resolve(sell, [candle(2, 100, 96)]).result, 'BE');
});
