import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const worker = read("worker.js");
const sniper = read("public/sniper-v2.js");
const ai = read("public/ai-sniper.js");
const app = read("public/app-v4.js");

test("large GitHub history uses raw download when Contents API omits content", () => {
  assert.match(worker, /async function readHistoryDocument/);
  assert.match(worker, /d\.download_url/);
  assert.match(worker, /Accept:"application\/vnd\.github\.raw"/);
});

test("malformed or unreadable history blocks writes instead of silently resetting trades", () => {
  assert.match(worker, /gravação bloqueada para evitar perda de operações/);
  assert.match(worker, /Formato do histórico inválido; gravação bloqueada/);
  assert.match(worker, /const parsed=await readHistoryDocument\(d,env\);remote=parsed\.trades/);
});

test("entry extension is capped at 1.5 ATR from EMA20", () => {
  assert.match(sniper, /maxEntryExtensionAtr:1\.5/);
  assert.match(sniper, /extensionBuy=entry>=e20&&\(entry-e20\)\/Math\.max\(A,1e-9\)<=C\.maxEntryExtensionAtr/);
  assert.match(sniper, /extensionSell=\(e20-entry\)\/Math\.max\(A,1e-9\)<=C\.maxEntryExtensionAtr/);
});

test("EMA20 pullback setups require a closed confirmation candle and bounded continuation", () => {
  assert.match(sniper, /emaPullbackBuy=/);
  assert.match(sniper, /emaPullbackSell=/);
  assert.match(sniper, /tb\.continuation&&closeQualityBuy&&\(emaPullbackBuy/);
  assert.match(sniper, /ts\.continuation&&closeQualitySell&&\(emaPullbackSell/);
});

test("direct breakouts and retests remain eligible under their own quality checks", () => {
  assert.match(sniper, /tb\.direct&&directBuyQuality&&closeQualityBuy/);
  assert.match(sniper, /tb\.retest&&closeQualityBuy/);
  assert.match(sniper, /ts\.direct&&directSellQuality&&closeQualitySell/);
  assert.match(sniper, /ts\.retest&&closeQualitySell/);
});

test("SELL technical score is side-relative and the UI calls it a technical score", () => {
  assert.match(sniper, /technicalScore:outType==='SELL'\?100-score:score/);
  assert.match(sniper, /confidence:outType==='WAIT'\?0:\(outType==='SELL'\?100-score:score\)/);
  assert.match(ai, /a\?\.technicalScore\?\?a\?\.confidence\?\?a\?\.score/);
  assert.match(app, /score técnico \$\{active\.confidence\}\/100/);
});
