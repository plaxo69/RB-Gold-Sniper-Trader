import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const appSource = readFileSync("public/app-v4.js", "utf8");
const historySource = readFileSync("public/history-v2.js", "utf8");
const aiSource = readFileSync("public/ai-sniper.js", "utf8");

function makeStorage(initial) {
  const values = new Map([["rb_gold_sniper_signals_v1", JSON.stringify(initial)]]);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values
  };
}

function loadHistoryResolver(trades) {
  const storage = makeStorage(trades);
  const events = [];
  const window = {
    fetch: async () => new Response(JSON.stringify({ trades: [] }), { status: 200 }),
    dispatchEvent(event) { events.push(event); },
    addEventListener() {},
    setTimeout() {},
    setInterval() {}
  };
  const sandbox = {
    window,
    localStorage: storage,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    Response,
    Date,
    Map,
    JSON,
    setTimeout() {},
    setInterval() {},
    console
  };
  vm.runInNewContext(historySource, sandbox);
  return { resolve: window.RBResolveTrades, storage, events };
}

function runCheckBE(trades) {
  const start = appSource.indexOf("function checkBE(price){");
  const end = appSource.indexOf("\nasync function enable()", start);
  assert.ok(start >= 0 && end > start, "checkBE function should be present");
  const fnSource = appSource.slice(start, end);
  const storage = { value: null, setItem(_key, value) { this.value = value; } };
  const events = [];
  const window = { dispatchEvent(event) { events.push(event); } };
  const CustomEvent = class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  const fn = new Function("load", "localStorage", "window", "KEY", "alertBE", "CustomEvent", fnSource + "; return checkBE;");
  return { checkBE: fn(() => trades, storage, window, "rb_gold_sniper_signals_v1", () => {}, CustomEvent), storage, events };
}

test("BE at 50% of TP alerts but does not close the trade", () => {
  const trades = [{ type: "BUY", status: "ALERTA", price: 100, tp: 110, sl: 95 }];
  const { checkBE } = runCheckBE(trades);
  checkBE(105);
  assert.equal(trades[0].status, "ALERTA");
  assert.equal(trades[0].beAlerted, true);
  assert.equal(trades[0].beArmed, true);
  assert.equal(trades[0].resolvedAt, undefined);
  assert.match(trades[0].beAlertMessage, /continua aberta/i);
});

test("BE does not alert before 50% of TP", () => {
  const trades = [{ type: "BUY", status: "ALERTA", price: 100, tp: 110, sl: 95 }];
  const { checkBE } = runCheckBE(trades);
  checkBE(104.99);
  assert.equal(trades[0].status, "ALERTA");
  assert.equal(trades[0].beAlerted, undefined);
});

test("a later TP is recorded as WIN after a BE alert", () => {
  const trade = { type: "BUY", status: "ALERTA", signalTimestamp: "2026-01-01T00:00:00Z", price: 100, tp: 110, sl: 95, beAlerted: true };
  const { resolve } = loadHistoryResolver([trade]);
  const result = resolve([{ timestamp: "2026-01-01T00:01:00Z", high: 111, low: 104 }]);
  assert.equal(result[0].status, "WIN");
  assert.equal(result[0].outcomeReason, "TP atingido");
});

test("an SL is recorded as LOSS", () => {
  const trade = { type: "BUY", status: "ALERTA", signalTimestamp: "2026-01-01T00:00:00Z", price: 100, tp: 110, sl: 95, beAlerted: true };
  const { resolve } = loadHistoryResolver([trade]);
  const result = resolve([{ timestamp: "2026-01-01T00:01:00Z", high: 103, low: 94 }]);
  assert.equal(result[0].status, "LOSS");
  assert.equal(result[0].outcomeReason, "SL atingido");
});

test("if TP and SL are both touched in one candle, conservative outcome is LOSS", () => {
  const trade = { type: "BUY", status: "ALERTA", signalTimestamp: "2026-01-01T00:00:00Z", price: 100, tp: 110, sl: 95 };
  const { resolve } = loadHistoryResolver([trade]);
  const result = resolve([{ timestamp: "2026-01-01T00:01:00Z", high: 111, low: 94 }]);
  assert.equal(result[0].status, "LOSS");
  assert.match(result[0].outcomeReason, /mesmo candle/i);
});

test("AI probability is driven by history rather than technical score alone", () => {
  const history = Array.from({ length: 40 }, (_, i) => ({
    type: i < 20 ? "BUY" : "SELL",
    status: i % 2 === 0 ? "WIN" : "LOSS",
    price: 2300, tp: 2310, sl: 2290, rsi: 65, score: 80,
    trend1: "ALTA", trend5: "ALTA", trend15: "ALTA", trendH1: "ALTA",
    filters: { emaBuy: true, structuralConfirmBuy: true }, rr: 1.5
  }));
  const window = {};
  const localStorage = { getItem(key) { return key === "rb_gold_sniper_signals_v1" ? JSON.stringify(history) : null; } };
  vm.runInNewContext(aiSource, { window, localStorage, globalThis: window, console });
  const base = { type: "BUY", price: 2300, tp: 2310, sl: 2290, rsi: 65,
    trend1: "ALTA", trend5: "ALTA", trend15: "ALTA", trendH1: "ALTA",
    filters: { emaBuy: true, structuralConfirmBuy: true }, rr: 1.5 };
  const highScore = window.RBTraderProAI.evaluate({ ...base, score: 95 });
  const lowScore = window.RBTraderProAI.evaluate({ ...base, score: 40 });
  assert.equal(highScore.pWin, lowScore.pWin);
  assert.equal(highScore.pWin, 50);
  assert.equal(highScore.modelVersion, "RB-TRADER-PRO-HYBRID-v7");
});
