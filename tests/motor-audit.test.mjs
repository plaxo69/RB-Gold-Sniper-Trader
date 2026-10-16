import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const aiSource = read("public/ai-sniper.js");
const sniperSource = read("public/sniper-v2.js");
const appSource = read("public/app-v4.js");

function loadAI() {
  const store = new Map();
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
