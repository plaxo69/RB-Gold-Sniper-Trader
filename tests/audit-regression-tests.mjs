import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('cada nova entrada guarda uma fotografia imutável dos indicadores disponíveis', async () => {
  const app = await read('../public/app-v4.js');
  const snapshot = app.slice(app.indexOf('function indicatorSnapshot('), app.indexOf('function save(', app.indexOf('function indicatorSnapshot(')));
  const save = app.slice(app.indexOf('function save('), app.indexOf('function stats(', app.indexOf('function save(')));
  assert.match(snapshot, /indicators:/);
  for (const field of ['rsi', 'atr', 'ema9', 'ema20', 'ema21', 'ema50', 'ema200', 'adx14', 'volumeSma20', 'volumeRatio']) assert.ok(snapshot.includes(field), 'falta campo '+field);
  assert.match(snapshot, /filters:/);
  assert.match(snapshot, /ai:a\?\.ai/);
  assert.match(save, /indicatorSnapshot\(a\)/);
  assert.match(save, /indicatorSnapshot:snapshot/);
});

test('alerta BE não fecha a trade nem cria resultado final BE', async () => {
  const app = await read('../public/app-v4.js');
  const start = app.indexOf('function checkBE(');
  const end = app.indexOf('async function enable', start);
  assert.ok(start >= 0 && end > start, 'função checkBE encontrada');
  const be = app.slice(start, end);
  assert.match(be, /t\.beAlerted=true/);
  assert.match(be, /trade continua aberta|trade continua aberta/i);
  assert.doesNotMatch(be, /t\.status\s*=\s*['"]BE['"]/);
  assert.doesNotMatch(be, /t\.status\s*=\s*['"]WIN['"]|t\.status\s*=\s*['"]LOSS['"]/);
});

test('conciliação do histórico preserva a fotografia e os metadados BE', async () => {
  const history = await read('../public/history-v2.js');
  assert.match(history, /indicatorSnapshot:chosen\.indicatorSnapshot\|\|prev\.indicatorSnapshot\|\|t\.indicatorSnapshot/);
  assert.match(history, /indicatorSnapshotVersion:/);
  assert.match(history, /beAlerted:!!\(prev\.beAlerted\|\|t\.beAlerted\)/);
});

test('a interface escapa texto dinâmico do histórico e da IA', async () => {
  const ui = await read('../public/history-ui.js');
  assert.match(ui, /escapeHtml\(ai\.opinion\)/);
  assert.match(ui, /escapeHtml\(aiLabel\)/);
  assert.match(ui, /escapeHtml\(JSON\.stringify\(t\.indicatorSnapshot,null,2\)\)/);
});

test('os scripts corrigidos usam versões de cache novas', async () => {
  const html = await read('../public/index.html');
  assert.match(html, /history-v2\.js\?v=8/);
  assert.match(html, /app-v4\.js\?v=14/);
  assert.match(html, /history-ui\.js\?v=6/);
});
