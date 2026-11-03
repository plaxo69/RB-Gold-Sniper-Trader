import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function browserContext(extra = {}) {
  const context = {
    window: {},
    localStorage: { getItem: () => "[]" },
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    ...extra
  };
  vm.createContext(context);
  return context;
}

test("Sniper não calcula filtro de volume quando a fotografia está indisponível", () => {
  const context = browserContext();
  vm.runInContext(fs.readFileSync(path.join(root, "public/sniper-v2.js"), "utf8"), context);
  const candles = Array.from({ length: 20 }, (_, i) => ({
    open: 1, high: 2, low: 0.5, close: 1.5, volume: i === 19 ? null : 100
  }));
  const result = context.RBGoldSniper.volumeStats(candles, 20);
  assert.equal(result.volume, null);
  assert.equal(result.sma20, null);
  assert.equal(result.ratio, null);
});

test("AI apresenta estatística descritiva sem alegar treino de modelo", () => {
  const context = browserContext();
  vm.runInContext(fs.readFileSync(path.join(root, "public/ai-sniper.js"), "utf8"), context);
  const status = context.window.RBTraderProAI.learn();
  assert.equal(status.trained, false);
  assert.equal(status.learningStatus, "OBSERVAÇÃO");
  assert.equal(status.descriptiveStatsOnly, true);
  assert.equal(status.probabilityCalibrated, false);
});

test("Retorno à entrada não é BE sem confirmação manual de SL", () => {
  const context = browserContext();
  vm.runInContext(fs.readFileSync(path.join(root, "public/trade-outcome.js"), "utf8"), context);
  const resolve = context.RBTradeOutcome.resolveTradeOutcome;
  const candles = [
    { timestamp: "2026-11-03T10:01:00Z", high: 106, low: 101, complete: true },
    { timestamp: "2026-11-03T10:02:00Z", high: 104, low: 99.5, complete: true }
  ];
  const trade = { price: 100, signalTimestamp: "2026-11-03T10:00:00Z" };
  const result = resolve("BUY", 95, 110, candles, trade);
  assert.notEqual(result?.result, "BE");
});

test("BE só é reconhecido depois da confirmação manual do SL na entrada", () => {
  const context = browserContext();
  vm.runInContext(fs.readFileSync(path.join(root, "public/trade-outcome.js"), "utf8"), context);
  const resolve = context.RBTradeOutcome.resolveTradeOutcome;
  const candles = [
    { timestamp: "2026-11-03T10:01:00Z", high: 106, low: 101, complete: true },
    { timestamp: "2026-11-03T10:02:00Z", high: 104, low: 99.5, complete: true }
  ];
  const trade = {
    price: 100,
    signalTimestamp: "2026-11-03T10:00:00Z",
    beConfirmed: true,
    beConfirmedAt: "2026-11-03T10:01:30Z"
  };
  const result = resolve("BUY", 95, 110, candles, trade);
  assert.equal(result?.result, "BE");
});
