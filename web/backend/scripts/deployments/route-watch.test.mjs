import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { watchRouteCatalog } from './deployment-gateway.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test('route changes reload after atomic rename; idle catalogs do no polling', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gateway-watch-'));
  let calls = 0;
  const close = watchRouteCatalog(dir, async () => { calls++; }, error => { throw error; });
  try {
    await pause(100); assert.equal(calls, 0);
    const child = path.join(dir, 'deployment'); await mkdir(child);
    await writeFile(path.join(child, 'routes.pending'), '{}');
    await rename(path.join(child, 'routes.pending'), path.join(child, 'routes.json'));
    for (let n=0; n<40 && !calls; n++) await pause(25);
    assert.ok(calls > 0); await pause(150); const settled = calls;
    await pause(150); assert.equal(calls, settled);
  } finally { close(); await rm(dir, { recursive: true, force: true }); }
});
