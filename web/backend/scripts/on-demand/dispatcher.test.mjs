import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemandCoordinator } from './dispatcher.mjs';
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
