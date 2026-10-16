import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../public/sniper-v2.js');
const sniper = globalThis.RBGoldSniper;

test('RSI neutro quando os preços não variam', () => {
  assert.equal(sniper.rsi(Array(15).fill(200), 14), 50);
});

test('RSI é 100 quando só há ganhos e nenhuma perda', () => {
  assert.equal(sniper.rsi(Array.from({ length: 15 }, (_, i) => 100 + i), 14), 100);
});

test('TP1 é rejeitado quando a resistência impede RR 1:2 numa compra', () => {
  const result = sniper.makeTargets(100, 98, 'BUY', {}, 1, {}, {}, 103);
  assert.equal(result.blockedByZone, true);
  assert.equal(result.tp1, null);
});

test('TP1 é rejeitado quando o suporte impede RR 1:2 numa venda', () => {
  const result = sniper.makeTargets(100, 102, 'SELL', {}, 1, {}, {}, 97);
  assert.equal(result.blockedByZone, true);
  assert.equal(result.tp1, null);
});

test('alvos mantêm RR 1:2 e 1:3 quando não há zona impeditiva', () => {
  const result = sniper.makeTargets(100, 98, 'BUY', {}, 1, {}, {}, 110);
  assert.equal(result.rr1, 2);
  assert.equal(result.rr2, 3);
  assert.equal(result.tp1, 104);
  assert.equal(result.tp2, 106);
});

test('HTML carrega a versão atual do motor Sniper', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /sniper-v2\.js\?v=19/);
  assert.doesNotMatch(html, /sniper-v2\.js\?v=18/);
  assert.match(html, /history-ui\.js\?v=9/);
});
