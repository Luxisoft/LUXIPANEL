import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemandCoordinator, runScheduledOnce } from './dispatcher.mjs';
import net from 'node:net';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('empty durable queues leave no polling timer or worker', async () => {
  let calls = 0;
  const coordinator = new DemandCoordinator({ jobs: [{ id: 'test' }], query: async () => { calls++; return { ready: false }; }, run: () => assert.fail('empty queue must not launch') });
  await coordinator.scan(); await pause(80);
  assert.equal(calls, 1); assert.equal(coordinator.timers.size, 0); coordinator.close();
});

test('notifications during execution coalesce and accepted new work is drained', async () => {
  let pending = 2, runs = 0, active = 0, maxActive = 0;
  const coordinator = new DemandCoordinator({ jobs: [{ id: 'test' }], query: async () => ({ ready: pending > 0 }), run: async () => {
    runs++; active++; maxActive = Math.max(maxActive, active);
    await pause(25); pending--; active--;
  } });
  await coordinator.scan(); await Promise.all(Array.from({ length: 10 }, () => coordinator.scan()));
  await pause(190); assert.equal(runs, 2); assert.equal(maxActive, 1); assert.equal(pending, 0);
  coordinator.close();
});

test('runner failures back off rather than repeatedly starting a process', async () => {
  let runs = 0;
  const coordinator = new DemandCoordinator({ jobs: [{ id: 'test' }], query: async () => ({ ready: true }), retryMs: 1000, run: async () => { runs++; throw new Error('offline'); } });
  await coordinator.scan(); await pause(10); await coordinator.scan(); await pause(100);
  assert.equal(runs, 1); coordinator.close();
});

test('a failed finite launch closes its live connection and ignores unrelated databases', async () => {
  const socket = net.createServer();
  const environments = [], launches = [];
  class Client {
    async connect() { await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); }
    async query() { return { rows: [{ ready: true }] }; }
    async end() { await new Promise(resolve => socket.close(resolve)); }
  }
  try {
    await assert.rejects(runScheduledOnce({ databases: [
      { id: 'unrelated', envFile: '/not-connected', scheduled: [{ id: 'other' }] },
      { id: 'store', envFile: '/store', scheduled: [{ id: 'store-fast' }] },
    ] }, 'store-fast', { Client, environment: async file => { environments.push(file); return { DATABASE_URL: 'fixture' }; },
      run: async job => { launches.push(job.id); throw new Error('work_waiting_for_memory'); },
    }), /work_waiting_for_memory/);
    assert.equal(socket.listening, false);
    assert.deepEqual(environments, ['/store']);
    assert.deepEqual(launches, ['store-fast']);
  } finally { if (socket.listening) await new Promise(resolve => socket.close(resolve)); }
});

test('finite jobs honor disabled flags and close connections after a successful run', async () => {
  let closes = 0;
  class Client { async connect() {} async query() { return { rows: [{ ready: true }] }; } async end() { closes++; } }
  const runs = [];
  await runScheduledOnce({ databases: [{ envFile: '/store', scheduled: [
    { id: 'store-fast', envFile: '/disabled', enabledFlag: 'ENABLED' }, { id: 'store-fast' },
  ] }] }, 'store-fast', { Client, environment: async () => ({ ENABLED: 'false' }), run: async job => runs.push(job.id) });
  assert.deepEqual(runs, ['store-fast']); assert.equal(closes, 1);
});
