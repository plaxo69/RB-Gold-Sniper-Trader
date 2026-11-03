import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Worker obtains large GitHub history through the blob API when contents omits content', async () => {
  const worker = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
  assert.match(worker, /async function readHistoryBlob\(sha, env\)/);
  assert.match(worker, /\/git\/blobs\/\$\{encodeURIComponent\(sha\)\}/);
  assert.match(worker, /async function historyContent\(metadata, env\)/);
  assert.match(worker, /metadata\.content\.trim\(\).*readHistoryBlob/s);
  assert.match(worker, /decodeHistoryPayload\(await historyContent\(data, env\)\)/);
});
