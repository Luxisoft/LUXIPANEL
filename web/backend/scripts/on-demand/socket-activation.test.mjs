import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, unlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { appUnits } from './units.mjs';

const exec = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const systemctl = (...args) => exec('systemctl', ['--user', ...args]);
const enabled = process.env.RUN_SYSTEMD_DEMAND_TESTS === '1';

test('real systemd activation: single startup, drain, sleep and wake', { skip: !enabled }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'demand-socket-test-'));
  const unitsDir = path.join(os.homedir(), '.config/systemd/user'); await mkdir(unitsDir, { recursive: true });
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const name = 'canary-' + process.pid;
  const base = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.join(directory, 'env.json'); await writeFile(envFile, '{}', { mode: 0o600 });
  const config = appUnits({ name, cwd: directory, script: path.join(base, 'socket-fixture.mjs'),
    envFile, preload: path.join(base, 'node-runtime.mjs'), port, host: '127.0.0.1', idleMs: 250 });
  const files = [path.join(unitsDir, config.unit + '.service'), path.join(unitsDir, config.unit + '.socket')];
  const state = async () => (await systemctl('show', config.unit + '.service', '-p', 'ActiveState', '--value')).stdout.trim();
  const get = route => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: route, agent: false }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve(text));
    }); req.on('error', reject);
  });
  const asleep = async () => {
    for (let attempt = 0; attempt < 80; attempt++) { if (await state() === 'inactive') return; await pause(25); }
    throw new Error('application_did_not_sleep');
  };
  try {
    await writeFile(files[0], config.service); await writeFile(files[1], config.socket);
    await systemctl('daemon-reload'); await systemctl('start', config.unit + '.socket');
    assert.equal(await state(), 'inactive');
    const pids = await Promise.all(Array.from({ length: 10 }, () => get('/pid')));
    assert.equal(new Set(pids).size, 1);
    assert.deepEqual(JSON.parse(await get('/command')), { stdout: 'account', stderr: 'diagnostic' });
    await asleep();
    const secondPid = await get('/pid'); assert.notEqual(secondPid, pids[0]);
    const response = get('/slow'); await pause(400); assert.equal(await state(), 'active');
    await response; await asleep();
    const ws = net.connect(port, '127.0.0.1');
    ws.write('GET /socket HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
    await once(ws, 'data'); await pause(450); assert.equal(await state(), 'active');
    ws.destroy(); await asleep();
  } finally {
    await systemctl('stop', config.unit + '.socket', config.unit + '.service').catch(() => {});
    for (const file of files) await unlink(file).catch(() => {});
    await systemctl('daemon-reload'); await rm(directory, { recursive: true, force: true });
  }
});
