import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../public/sniper-v2.js');
await import('../public/trade-outcome.js');
const outcome = globalThis.RBTradeOutcome.resolveTradeOutcome;
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
  assert.match(html, /history-ui\.js\?v=10/);
});

test('histórico consegue construir fotografia para registos antigos com indicadores guardados', async () => {
  const ui = await readFile(new URL('../public/history-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /function legacySnapshot\(t\)/);
  assert.match(ui, /t\.indicatorSnapshot\|\|legacySnapshot\(t\)/);
});

test('cache do histórico inclui a versão atual da sincronização', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /history-v2\\.js\\?v=10/);
});

test('sincronização preserva o primeiro resultado final em conflitos', async () => {
  const history = await readFile(new URL('../public/history-v2.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../public/history-ui.js', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
  assert.match(history, /chosen\.status=prev\.status/);
  assert.match(ui, /chosen\.status=prev\.status/);
  assert.match(worker, /chosen\.status=old\.status/);
});

test('build valida Worker com sintaxe de módulo ES', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /--experimental-default-type=module --check worker\.js/);
});


test('BUY: TP atingido primeiro fecha em WIN', () => {
  const result = outcome('BUY', 98, 104, [{timestamp:'2026-10-16T10:01:00Z',high:103,low:99},{timestamp:'2026-10-16T10:02:00Z',high:105,low:99}]);
  assert.equal(result.result, 'WIN');
  assert.equal(result.when, '2026-10-16T10:02:00Z');
});

test('SELL: SL atingido primeiro fecha em LOSS', () => {
  const result = outcome('SELL', 102, 96, [{timestamp:'2026-10-16T10:01:00Z',high:103,low:99}]);
  assert.equal(result.result, 'LOSS');
  assert.equal(result.reason, 'SL atingido');
});

test('TP e SL no mesmo candle é LOSS conservador para BUY e SELL', () => {
  const buy = outcome('BUY', 98, 104, [{timestamp:'c1',high:105,low:97}]);
  const sell = outcome('SELL', 102, 96, [{timestamp:'c2',high:103,low:95}]);
  assert.equal(buy.result, 'LOSS');
  assert.match(buy.reason, /mesmo candle/);
  assert.equal(sell.result, 'LOSS');
  assert.match(sell.reason, /mesmo candle/);
});

test('não inventa resultado se nenhum alvo for atingido', () => {
  assert.equal(outcome('BUY', 98, 104, [{high:103,low:99}]), null);
});


test('alvos de SELL ficam abaixo da entrada com RR 1:2 e 1:3', () => {
  const result = sniper.makeTargets(100, 102, 'SELL', {}, 1, {}, {}, 90);
  assert.equal(result.blockedByZone, false);
  assert.equal(result.tp1, 96);
  assert.equal(result.tp2, 94);
  assert.equal(result.rr1, 2);
  assert.equal(result.rr2, 3);
  assert.ok(result.tp1 < 100 && result.tp2 < result.tp1);
});

test('alvos de BUY ficam acima da entrada com RR 1:2 e 1:3', () => {
  const result = sniper.makeTargets(100, 98, 'BUY', {}, 1, {}, {}, 110);
  assert.equal(result.blockedByZone, false);
  assert.ok(result.tp1 > 100 && result.tp2 > result.tp1);
  assert.equal(result.rr1, 2);
  assert.equal(result.rr2, 3);
});
