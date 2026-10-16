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

test('motor limita breakouts tardios e aplica filtro de extensão', async () => {
  const source = await readFile(new URL('../public/sniper-v2.js', import.meta.url), 'utf8');
  assert.match(source, /maxBreakAtr:1\.25/);
  assert.match(source, /maxRetestExtensionAtr:1\.5/);
  assert.match(source, /buySetup=atrOK&&adxOK&&volumeOK&&buyTF&&emaBuy&&extensionBuy/);
  assert.match(source, /sellSetup=atrOK&&adxOK&&volumeOK&&sellTF&&emaSell&&extensionSell/);
  assert.match(source, /tb\.direct&&directBuyQuality&&closeQualityBuy/);
});

test('HTML carrega a versão atual do motor Sniper', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /sniper-v2\.js\?v=22/);
  assert.doesNotMatch(html, /sniper-v2\.js\?v=20/);
  assert.match(html, /history-ui\.js\?v=10/);
});

test('histórico consegue construir fotografia para registos antigos com indicadores guardados', async () => {
  const ui = await readFile(new URL('../public/history-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /function legacySnapshot\(t\)/);
  assert.match(ui, /t\.indicatorSnapshot\|\|legacySnapshot\(t\)/);
});

test('cache do histórico inclui a versão atual da sincronização', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /history-v2\.js\?v=10/);
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

test('ordena candles por timestamp antes de resolver TP/SL', () => {
  const result = outcome('BUY', 98, 104, [
    {timestamp:'2026-10-16T10:02:00Z',high:105,low:99},
    {timestamp:'2026-10-16T10:01:00Z',high:103,low:97}
  ]);
  assert.equal(result.result, 'LOSS');
  assert.equal(result.when, '2026-10-16T10:01:00Z');
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


test('reversão BUY exige toque no suporte e rejeição bullish', () => {
  const candle = {open:100.1, low:99.5, high:101, close:100.8};
  const result = sniper.zoneReversal([candle], 'BUY', {support:100, resistance:110}, 1, candle);
  assert.equal(result.touched, true);
  assert.equal(result.rejection, true);
  assert.equal(result.ok, true);
});

test('reversão SELL exige toque na resistência e rejeição bearish', () => {
  const candle = {open:100.8, low:99, high:101.5, close:100.1};
  const result = sniper.zoneReversal([candle], 'SELL', {support:90, resistance:101}, 1, candle);
  assert.equal(result.touched, true);
  assert.equal(result.rejection, true);
  assert.equal(result.ok, true);
});

test('breakout BUY exige fecho acima da resistência após fecho anterior abaixo', () => {
  const prev = {open:99, low:98.8, high:99.5, close:99};
  const candle = {open:99.2, low:99.1, high:101.5, close:101.2};
  const result = sniper.tactical([prev,candle], 'BUY', {support:90,resistance:100}, 1, candle, prev);
  assert.equal(result.direct, true);
  assert.equal(result.level, 100);
});

test('breakdown SELL exige fecho abaixo do suporte após fecho anterior acima', () => {
  const prev = {open:101, low:100.5, high:101.5, close:101};
  const candle = {open:100.8, low:98.5, high:100.9, close:98.8};
  const result = sniper.tactical([prev,candle], 'SELL', {support:100,resistance:110}, 1, candle, prev);
  assert.equal(result.direct, true);
  assert.equal(result.level, 100);
});


function syntheticCandles(n, fn) {
  return Array.from({length:n},(_,i)=>{
    const c=fn(i);
    return {timestamp:new Date(Date.UTC(2026,9,16,0,i)).toISOString(),open:c.open,high:c.high,low:c.low,close:c.close,volume:100+(i%7)*10};
  });
}

test('breakout BUY sem filtros críticos confirmados é rejeitado', () => {
  const main=syntheticCandles(230,i=>{const close=2000+Math.sin(i*.45)*2;return{open:close-.1,close,high:close+.4,low:close-.4};});
  const j=main.length-2, resistance=Math.max(...main.slice(j-20,j).map(x=>x.high));
  main[j]={timestamp:main[j].timestamp,open:resistance-.1,low:resistance-.2,high:resistance+.8,close:resistance+.65,volume:180};
  main[j+1]={timestamp:main[j+1].timestamp,open:main[j].close,low:main[j].close-.1,high:main[j].close+.1,close:main[j].close,volume:180};
  const tf=syntheticCandles(70,i=>{const close=2000+Math.sin(i*.45)*2;return{open:close-.1,close,high:close+.4,low:close-.4};});
  const result=sniper.analyze(main,tf,tf,[]);
  assert.equal(result.type,'WAIT');
  assert.ok(result.rejectionReasons.length>0);
});

test('breakdown SELL sem filtros críticos confirmados é rejeitado', () => {
  const main=syntheticCandles(230,i=>{const close=2000+Math.sin(i*.45)*2;return{open:close+.1,close,high:close+.4,low:close-.4};});
  const j=main.length-2, support=Math.min(...main.slice(j-20,j).map(x=>x.low));
  main[j]={timestamp:main[j].timestamp,open:support+.1,low:support-.8,high:support+.2,close:support-.65,volume:180};
  main[j+1]={timestamp:main[j+1].timestamp,open:main[j].close,low:main[j].close-.1,high:main[j].close+.1,close:main[j].close,volume:180};
  const tf=syntheticCandles(70,i=>{const close=2000+Math.sin(i*.45)*2;return{open:close+.1,close,high:close+.4,low:close-.4};});
  const result=sniper.analyze(main,tf,tf,[]);
  assert.equal(result.type,'WAIT');
  assert.ok(result.rejectionReasons.length>0);
});


test('reversão BUY sem filtros críticos confirmados é rejeitada', () => {
  const main=syntheticCandles(230,i=>{const close=2000+Math.sin(i*.45)*2;return{open:close-.15,close,high:close+.45,low:close-.45};});
  const j=main.length-2, support=Math.min(...main.slice(j-20,j).map(x=>x.low));
  main[j]={...main[j],open:support+.2,low:support-.5,close:support+1,high:support+1.1,volume:180};
  main[j+1]={...main[j+1],open:main[j].close,low:main[j].close-.1,high:main[j].close+.1,close:main[j].close,volume:180};
  const tf=syntheticCandles(70,i=>{const close=2000+Math.sin(i*.45)*2;return{open:close-.15,close,high:close+.45,low:close-.45};});
  const result=sniper.analyze(main,tf,tf,[]);
  assert.equal(result.type,'WAIT');
  assert.ok(result.rejectionReasons.length>0);
});

test('reversão SELL sem filtros críticos confirmados é rejeitada', () => {
  const main=syntheticCandles(230,i=>{const close=2000+i*.15+Math.sin(i*.5)*1.5;return{open:close-.1,close,high:close+.35,low:close-.35};});
  const j=main.length-2, resistance=Math.max(...main.slice(j-20,j).map(x=>x.high));
  main[j]={...main[j],open:resistance,high:resistance+.45,low:resistance-.5,close:resistance-.35,volume:150};
  main[j+1]={...main[j+1],open:main[j].close,high:main[j].close+.1,low:main[j].close-.1,close:main[j].close,volume:150};
  const tf=syntheticCandles(70,i=>{const close=2000+i*.15+Math.sin(i*.5)*1.5;return{open:close-.1,close,high:close+.35,low:close-.35};});
  const result=sniper.analyze(main,tf,tf,[]);
  assert.equal(result.type,'WAIT');
  assert.ok(result.rejectionReasons.length>0);
});
