import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHistory, getHistory } from '../worker.js';

const makeTrade = (i, status = 'ALERTA') => ({
  type: i % 2 ? 'SELL' : 'BUY',
  status,
  signalTimestamp: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  key: 'trade-' + i,
  price: 100,
  tp: 110,
  sl: 95
});

test('history merge preserves more than 500 records and sorts newest first', () => {
  const trades = Array.from({ length: 750 }, (_, i) => makeTrade(i));
  const merged = mergeHistory(trades, []);
  assert.equal(merged.length, 750);
  assert.equal(merged[0].key, 'trade-749');
  assert.equal(merged.at(-1).key, 'trade-0');
});

test('history merge preserves BE status and indicator snapshot on duplicate keys', () => {
  const original = { ...makeTrade(1), indicatorSnapshot: { indicators: { rsi: 48.5 } } };
  const resolved = { ...makeTrade(1, 'BE'), beArmed: true, beArmedAt: '2026-01-01T00:02:00.000Z' };
  const [merged] = mergeHistory([original], [resolved]);
  assert.equal(merged.status, 'BE');
  assert.equal(merged.beArmed, true);
  assert.equal(merged.indicatorSnapshot.indicators.rsi, 48.5);
});

test('history API returns the newest requested records, not the oldest', async () => {
  const trades = Array.from({ length: 600 }, (_, i) => makeTrade(i));
  const payload = Buffer.from(JSON.stringify({
    exportedAt: '2026-11-03T00:00:00.000Z',
    total: trades.length,
    trades
  })).toString('base64');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    sha: 'blob-sha',
    content: payload,
    encoding: 'base64'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await getHistory({ GITHUB_TOKEN: 'test-token' }, 3);
    assert.equal(result.total, 600);
    assert.deepEqual(result.trades.map(t => t.key), ['trade-599', 'trade-598', 'trade-597']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
