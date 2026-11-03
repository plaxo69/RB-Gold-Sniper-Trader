import test from 'node:test';
import assert from 'node:assert/strict';

test('AI learning includes BE as neutral evidence without counting it as WIN or LOSS', async () => {
  const trades = [
    { type: 'BUY', status: 'WIN', signalTimestamp: '2026-11-01T10:00:00.000Z', price: 100, rsi: 60 },
    { type: 'SELL', status: 'LOSS', signalTimestamp: '2026-11-01T11:00:00.000Z', price: 100, rsi: 40 },
    { type: 'BUY', status: 'BE', signalTimestamp: '2026-11-01T12:00:00.000Z', price: 100, rsi: 50 }
  ];
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: key => key === 'rb_gold_sniper_signals_v1' ? JSON.stringify(trades) : null };
  await import('../public/ai-sniper.js');
  const learned = globalThis.RBTraderProAI.learn();
  assert.equal(learned.samples, 3);
  assert.equal(learned.wins, 1);
  assert.equal(learned.losses, 1);
  assert.equal(learned.beSamples, 1);
  assert.equal(learned.baseWinRate, 50);
  assert.equal(learned.outcomeScore, 50);
  const audit = globalThis.RBTraderProAI.auditHistory();
  assert.equal(audit.samples, 3);
  assert.equal(audit.wins, 1);
  assert.equal(audit.losses, 1);
  assert.equal(audit.bes, 1);
  assert.equal(audit.winRate, 50);
});
