const test = require("node:test");
const assert = require("node:assert/strict");
const { analyze, priorStructure } = require("../public/sniper.js");

function candle(close, index, spread = 0.25) {
  return { timestamp: new Date(1700000000000 + index * 60000).toISOString(), open: close - 0.08, high: close + spread, low: close - spread, close, volume: 100 };
}

function rising(count, start = 2000, step = 0.12) { return Array.from({ length: count }, (_, index) => candle(start + index * step, index)); }
function steadyRise(count, start = 2000) { return Array.from({ length: count }, (_, index) => candle(start + index * 0.04 + (index % 2 ? 0.1 : 0), index)); }

test("structure excludes the trigger candle so a breakout can be detected", () => {
  const candles = rising(25);
  candles[24] = candle(2010, 24, 0.5);
  const structure = priorStructure(candles, 20);
  assert.ok(structure.resistance < candles[24].close);
});

test("sniper only emits BUY after a closed, aligned breakout", () => {
  const main = steadyRise(207);
  main[205] = candle(main[204].close - 0.08, 205, 0.2);
  main[206] = { ...candle(main[205].close + 0.4, 206, 0.25), open: main[205].close + 0.02 };
  const live = candle(main[206].close + 0.03, 207, 0.2);
  main.push(live);
  const result = analyze(main, rising(80, 1990, 0.25), rising(80, 1950, 0.4), rising(80, 1800, 2));
  assert.equal(result.type, "BUY");
  assert.ok(result.rr >= 2);
  assert.ok(result.sl < result.price && result.tp > result.price);
});

test("sniper rejects a breakout without higher-timeframe convergence", () => {
  const main = steadyRise(207);
  main[205] = candle(main[204].close - 0.08, 205, 0.2);
  main[206] = { ...candle(main[205].close + 0.4, 206, 0.25), open: main[205].close + 0.02 };
  main.push(candle(main[206].close + 0.03, 207, 0.2));
  const fallingH1 = rising(80, 2200, -1.5);
  const result = analyze(main, rising(80, 1990, 0.25), rising(80, 1950, 0.4), fallingH1);
  assert.equal(result.type, "WAIT");
});
