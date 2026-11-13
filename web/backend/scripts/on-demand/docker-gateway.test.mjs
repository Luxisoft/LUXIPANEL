import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { ContainerRuntime, createGateway } from './docker-gateway.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const close = server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
const request = (port, body, route = '/write') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: route, method: body ? 'POST' : 'GET', agent: false,
    headers: body ? { 'content-type': 'application/octet-stream', 'x-test-signature': 'unchanged' } : {} }, res => {
    let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: text }));
  }); req.on('error', reject); req.end(body);
});

test('cold POST bodies survive startup; simultaneous requests start once and drain', async () => {
  let starts = 0, stops = 0, running = false;
  const backend = http.createServer((req, res) => {
    if (req.url === '/health/ready') return res.end('ready');
    const hash = createHash('sha256'); req.on('data', data => hash.update(data));
    req.on('end', () => { assert.equal(req.headers['x-test-signature'], 'unchanged'); res.writeHead(201); res.end(hash.digest('hex')); });
  }); backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const engine = async (method, endpoint) => {
    if (endpoint.endsWith('/start')) { starts++; await pause(25); running = true; }
    else if (endpoint.includes('/stop')) { stops++; running = false; }
    else return { State: { Running: running }, NetworkSettings: { Networks: { test: { IPAddress: '127.0.0.1' } } } };
  };
  const runtime = new ContainerRuntime({ container: 'test-api', network: 'test', port: backend.address().port, engine, idleMs: 40 });
  const gateway = createGateway(runtime); gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  try {
    const body = Buffer.from([0, 255, 13, 10, 128, 34, 0, 32]);
    const responses = await Promise.all(Array.from({ length: 8 }, () => request(gateway.address().port, body)));
    assert.equal(starts, 1); assert.equal(runtime.active, 0);
    for (const response of responses) { assert.equal(response.status, 201); assert.equal(response.body, createHash('sha256').update(body).digest('hex')); }
    await pause(70); assert.equal(stops, 1);
  } finally { runtime.close(); await close(gateway); await close(backend); }
});

test('health checks never start the API and dependency failure is visible', async () => {
  let operations = 0;
  const runtime = new ContainerRuntime({ container: 'test-api', network: 'test', engine: async () => { operations++; throw new Error('must_not_wake'); } });
  const gateway = createGateway(runtime, { dependencies: ['database'], healthEngine: async () => ({ State: { Running: false } }) });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  try {
    assert.equal((await request(gateway.address().port, undefined, '/health/live')).status, 200);
    assert.equal((await request(gateway.address().port, undefined, '/health/ready')).status, 503);
    assert.equal(operations, 0);
  } finally { runtime.close(); await close(gateway); }
});

test('a request arriving during stop waits for stop before starting again', async () => {
  let finishStop, stopped = false, starts = 0, enteredStop;
  const stopping = new Promise(resolve => { enteredStop = resolve; });
  const engine = async (_method, endpoint) => {
    if (endpoint.includes('/stop')) { enteredStop(); await new Promise(resolve => { finishStop = resolve; }); stopped = true; }
    else if (endpoint.endsWith('/start')) { assert.equal(stopped, true); starts++; }
    else return { State: { Running: false }, NetworkSettings: { Networks: { test: { IPAddress: '127.0.0.1' } } } };
  };
  const runtime = new ContainerRuntime({ container: 'test', network: 'test', engine, idleMs: 10 });
  runtime.waitReady = async () => {};
  runtime.arm();
  const keepAlive = setTimeout(() => {}, 500);
  try {
    await stopping;
    const release = runtime.acquire(); const ready = runtime.ensureReady();
    await pause(20); assert.equal(starts, 0);
    finishStop(); await ready; assert.equal(starts, 1); release();
  } finally { clearTimeout(keepAlive); runtime.close(); }
});
