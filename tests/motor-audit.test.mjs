import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

await import('../public/sniper-v2.js');
const sniper = globalThis.RBGoldSniper;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const aiSource = read("public/ai-sniper.js");
const sniperSource = read("public/sniper-v2.js");
const appSource = read("public/app-v4.js");

function loadAI(seed = []) {
  const store = new Map([["rb_gold_sniper_signals_v1", JSON.stringify(seed)]]);
  const context = {
    console,
    localStorage: { getItem: (key) => store.get(key) ?? "[]", setItem: (key, value) => store.set(key, value) },
    window: {},
  };
  context.window = context;
  vm.runInNewContext(aiSource, context, { filename: "public/ai-sniper.js" });
  return context.RBTraderProAI;
}

test("IA maps real Sniper filters and close location into features", () => {
  const ai = loadAI();
  const f = ai.features({
    type: "BUY", rsi: 65, atr: 1.2, price: 2000, rr1: 1.5, score: 80,
    adx14: 27, volume: 130, volumeSma20: 100, closeLocation: 0.72,
    trend1: "ALTA", trend5: "ALTA", trend15: "ALTA", trendH1: "ALTA",
    filters: { ema200Buy: true, structuralConfirmBuy: true, buyPullback: true, reversalBuy: true, buyContinuation: true, bodyIsDecisive: true },
    tactical: { buy: "PULLBACK/RETESTE", bosBuy: true },
  });
  assert.equal(f.align, 3);
  assert.equal(f.ema, 1);
  assert.equal(f.structure, 1);
  assert.equal(f.retest, 1);
  assert.equal(f.rejection, 1);
  assert.equal(f.continuation, 1);
  assert.equal(f.close, 1);
  assert.equal(f.volumeAboveSma, true);
});

test("missing market indicators stay missing instead of becoming zero", () => {
  const ai = loadAI();
  const f = ai.features({ type: "BUY", rsi: null, atr: null, price: 2000, adx14: null, volume: null, volumeSma20: null, filters: {} });
  assert.equal(f.adx14, null);
  assert.equal(f.volume, null);
  assert.equal(f.volumeSma20, null);
  assert.equal(f.volumeAboveSma, null);
});

test("AI does not publish an uncalibrated synthetic win probability", () => {
  const ai = loadAI();
  const result = ai.evaluate({ type: "BUY", price: 2000, rsi: 65, atr: 1, rr1: 1, score: 70, filters: {}, tactical: {} });
  assert.equal(result.pWin, null);
  assert.match(result.probabilityStatus, /não calibrada/);
  assert.equal(result.score, result.technicalScore);
});

test("historical audit exposes breakdowns and clearly labels its limitations", () => {
  const report = loadAI().auditHistory();
  assert.equal(report.samples, 0);
  assert.equal(report.winRate, null);
  assert.ok("bySource" in report);
  assert.ok("byConfidence" in report);
  assert.ok("byRsiBand" in report);
  assert.ok("byAdxBand" in report);
  assert.ok("byVolume" in report);
  assert.ok("byAlignment" in report);
  assert.ok("bySessionLisbon" in report);
  assert.match(report.note, /não é backtest fora da amostra/);
});

test("Sniper emits movement key and close location; app enforces cooldown and re-entry rules", () => {
  assert.match(sniperSource, /movementKey:outType/);
  assert.match(sniperSource, /closeLocation:closePos/);
  assert.match(appSource, /cooldownActive/);
  assert.match(appSource, /REENTRY_COOLDOWN_SEC/);
  assert.match(appSource, /previousStatus==="WIN"&&reentries<2/);
});

test("independent AI uses closed candles for timeframe direction", () => {
  assert.match(aiSource, /tfDir\(m1\.slice\(0,-1\)\),tfDir\(m5\.slice\(0,-1\)\),tfDir\(m15\.slice\(0,-1\)\)/);
});

test("history does not render null probability as 0% and shows technical score instead", () => {
  const ui = read("public/history-ui.js");
  assert.match(ui, /ai\.probabilityStatus==="calibrated"/);
  assert.match(ui, /ai\.pWin!==null&&ai\.pWin!==undefined/);
  assert.doesNotMatch(ui, /t\.aiWinRate/);
  assert.match(ui, /score técnico/);
});


test('volumeStats rejeita volume em falta na última vela e não reutiliza uma vela antiga', () => {
  const candles = Array.from({ length: 20 }, (_, i) => ({ volume: 100 + i }));
  candles[19].volume = null;
  assert.deepEqual(sniper.volumeStats(candles), { volume: null, sma20: null, ratio: null });
});

test('volumeStats calcula a média apenas quando as 20 velas têm volume válido', () => {
  const candles = Array.from({ length: 20 }, (_, i) => ({ volume: i + 1 }));
  const result = sniper.volumeStats(candles);
  assert.equal(result.volume, 20);
  assert.equal(result.sma20, 10.5);
  assert.equal(result.ratio, 20 / 10.5);
});


test("BE só fecha depois de ativar aos 50% e regressar à entrada num candle posterior", async () => {
  const source = read("public/trade-outcome.js");
  const context = {};
  vm.runInNewContext(source, context);
  const resolve = context.RBTradeOutcome.resolveTradeOutcome;
  const buy = resolve("BUY", 98, 106, [
    { timestamp: "2026-01-01T00:01:00Z", high: 104, low: 102 },
    { timestamp: "2026-01-01T00:02:00Z", high: 103, low: 100 },
  ], 100);
  assert.equal(buy.result, "BE");
  assert.equal(buy.beArmedAt, "2026-01-01T00:01:00Z");
  const sell = resolve("SELL", 102, 94, [
    { timestamp: "2026-01-01T00:01:00Z", high: 98, low: 96 },
    { timestamp: "2026-01-01T00:02:00Z", high: 100, low: 97 },
  ], 100);
  assert.equal(sell.result, "BE");
});

test("BE não é ativado e nem fecha no mesmo candle do movimento favorável", () => {
  const context = {};
  vm.runInNewContext(read("public/trade-outcome.js"), context);
  const resolve = context.RBTradeOutcome.resolveTradeOutcome;
  const sameCandle = resolve("BUY", 98, 106, [
    { timestamp: "2026-01-01T00:01:00Z", high: 104, low: 100 },
  ], 100);
  assert.equal(sameCandle, null);
});


test("IA exclui BE legado sem prova de retorno à entrada e mantém BE validado neutro", () => {
  const ai = loadAI([
    { status: "BE", type: "BUY", price: 100, beTriggeredAt: "2026-01-01T00:02:00Z", beTriggerPrice: 104 },
    { status: "BE", type: "BUY", price: 100, beArmedAt: "2026-01-01T00:01:00Z", beTriggeredAt: "2026-01-01T00:02:00Z", beExitPrice: 101 },
    { status: "BE", type: "SELL", price: 100, beArmedAt: "2026-01-01T00:01:00Z", beTriggeredAt: "2026-01-01T00:02:00Z", beExitPrice: 100 },
    { status: "WIN", type: "BUY", price: 100, tp: 104, sl: 98 }
  ]);
  const report = ai.auditHistory();
  assert.equal(report.unverifiedBes, 2);
  assert.equal(report.bes, 1);
  assert.equal(report.samples, 2);
  assert.equal(report.winRate, 100);
  assert.equal(ai.learn().samples, 2);
  assert.equal(ai.learn().baseWinRate, 100);
  assert.equal(ai.learn().neutralRate, 50);
});


test("filter UI presents EMA, ATR and RSI separately with actual values", () => {
  assert.ok(appSource.includes("metricBox('EMA (valores reais)'"));
  assert.ok(appSource.includes("metricBox('ATR (14)'"));
  assert.ok(appSource.includes("metricBox('RSI (14)'"));
  assert.ok(appSource.includes("metric(a.ema9)"));
  assert.ok(appSource.includes("metric(a.ema21)"));
  assert.ok(appSource.includes("metric(a.atr,4)"));
  assert.ok(appSource.includes("metric(a.rsi)"));
  assert.equal(appSource.includes("box('EMA / RSI / ATR'"), false);
});

test("app win rate excludes BE from the WIN/LOSS denominator", () => {
  assert.ok(appSource.includes("rate.textContent=decided?((w/decided*100).toFixed(1)+'%'):'—'"));
});

test("history merge preserves complete BE activation and exit metadata", () => {
  const source=read("public/history-v2.js");
  for (const field of ["beArmedAt","beTriggeredAt","beTriggerPrice","beExitPrice","beTriggerPriceAt"]) assert.ok(source.includes(field+":prev."));
});

test("BE alert stores the exact 50 percent threshold", () => {
  assert.ok(appSource.includes('beTriggerPrice=entry+(t.type==="BUY"?1:-1)*trigger'));
  assert.ok(appSource.includes("beArmedAt=new Date().toISOString()"));
  assert.ok(appSource.includes("const trigger=tpDistance*0.50"));
});


test("history UI merge keeps BE activation and exit metadata", () => { const source=read("public/history-ui.js"); for (const field of ["beArmedAt","beTriggeredAt","beTriggerPrice","beExitPrice","beTriggerPriceAt","beReturnedAt"]) assert.ok(source.includes(field+":prev.")); });


test("render do filtro mostra os valores numéricos reais em três cartões separados", () => {
  const nodes = new Map();
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: "", innerHTML: "", className: "" }); return nodes.get(id); },
    querySelector() { return null; },
    addEventListener() {}
  };
  const context = { document, window: {}, localStorage: { getItem: () => "[]" }, console };
  vm.runInNewContext(appSource, context, { filename: "public/app-v4.js" });
  context.render({
    type: "WAIT", price: 4010.5, rsi: 42.56, formingRsi: 44.3, atr: 1.2345,
    ema9: 4011.2, ema20: 4012.0, ema21: 4012.4, ema50: 4013.5, ema200: 4015.0,
    trend5: "ALTA", trend15: "BAIXA", trendH1: "ALTA", rejectionReasons: [],
    filters: { marketIsTradable: true, buyReversalRSI: true, buyMomentumRSI: false, sellReversalRSI: false, sellMomentumRSI: true }
  });
  const html = nodes.get("filter-status").innerHTML;
  for (const value of ["EMA (valores reais)", "4011.20", "4012.40", "ATR (14)", "1.2345", "RSI (14)", "42.56", "44.30"]) assert.ok(html.includes(value), value);
  assert.equal((html.match(/filter-metric-values/g) || []).length, 3);
});
