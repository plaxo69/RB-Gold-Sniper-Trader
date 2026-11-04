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

test("IA ignora resultados cuja resolução ocorreu depois do instante do sinal", () => {
  const futureTrade = {
    type: "BUY",
    status: "WIN",
    signalTimestamp: "2026-11-03T10:01:00Z",
    resolvedAt: "2026-11-03T10:02:00Z",
    rsi: 65,
    atr: 1.2,
    price: 3900,
    rr: 2,
    trend1: "ALTA",
    trend5: "ALTA",
    trend15: "ALTA",
    filters: {},
    tactical: {}
  };
  const context = browserContext({
    localStorage: { getItem: () => JSON.stringify([futureTrade]) }
  });
  vm.runInContext(fs.readFileSync(path.join(root, "public/ai-sniper.js"), "utf8"), context);
  const result = context.window.RBTraderProAI.evaluate({
    ...futureTrade,
    signalTimestamp: "2026-11-03T10:00:00Z"
  });
  assert.equal(result.setupSamples, 0);
  assert.equal(result.directionSamples, 0);
  assert.equal(result.pWin, null);
});

test("EMA-pullback é reconhecido como método adicional após tendência, toque à zona e vela confirmada", () => {
  const context = browserContext();
  vm.runInContext(fs.readFileSync(path.join(root, "public/sniper-v2.js"), "utf8"), context);
  const candles = Array.from({ length: 60 }, (_, i) => {
    const close = 100 + i * 0.1;
    return { open: close - 0.04, high: close + 0.12, low: close - 0.12, close, volume: 100 + i };
  });
  candles[58] = { ...candles[58], open: 105.65, high: 105.82, low: 105.08, close: 105.2 };
  candles[59] = { ...candles[59], open: 105.7, high: 106.2, low: 105.0, close: 106.0 };
  const closes = candles.map(c => c.close);
  const result = context.RBGoldSniper.emaPullback(
    candles, "BUY",
    context.RBGoldSniper.ema(closes, 9),
    context.RBGoldSniper.ema(closes, 21),
    context.RBGoldSniper.ema(closes, 50),
    context.RBGoldSniper.atr(candles),
    candles.at(-1)
  );
  assert.equal(result.ok, true);
  assert.equal(result.trend, true);
  assert.equal(result.touched, true);
  assert.equal(result.confirmed, true);
});
