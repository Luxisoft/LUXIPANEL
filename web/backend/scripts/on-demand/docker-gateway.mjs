// A socket-activated ingress for an existing Docker API. No application imports.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function dockerRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request({ socketPath: '/var/run/docker.sock', path: '/v1.45' + endpoint,
      method, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} }, response => {
      let result = ''; response.on('data', data => { result += data; if (result.length > 2 * 1024 * 1024) request.destroy(new Error('docker_response_too_large')); });
      response.on('end', () => {
        if (response.statusCode >= 400) return reject(new Error('docker_operation_failed_' + response.statusCode));
        try { resolve(result ? JSON.parse(result) : null); } catch { reject(new Error('invalid_docker_response')); }
      });
    });
    request.setTimeout(620_000, () => request.destroy(new Error('docker_timeout')));
    request.on('error', reject); request.end(payload);
  });
}

export class ContainerRuntime {
  constructor({ container, network, port = 8000, idleMs = 60_000, engine = dockerRequest, onIdle = () => {} }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container) || !network || !Number.isInteger(port)) throw new Error('invalid_container_runtime');
    Object.assign(this, { container, network, port, idleMs, engine, onIdle });
    this.active = 0; this.generation = 0;
  }
  endpoint(suffix = '') { return '/containers/' + encodeURIComponent(this.container) + suffix; }
  async ensureReady() {
    clearTimeout(this.timer);
    if (this.stopping) await this.stopping;
    if (this.starting) return this.starting;
    if (this.target) return this.target;
    this.starting = (async () => {
      let info = await this.engine('GET', this.endpoint('/json'));
      if (!info.State.Running) { await this.engine('POST', this.endpoint('/start')); info = await this.engine('GET', this.endpoint('/json')); }
      const host = info.NetworkSettings.Networks[this.network]?.IPAddress;
      if (!host || !/^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error('container_network_unavailable');
      const target = { host, port: this.port };
      await this.waitReady(target);
      this.target = target; return target;
    })().finally(() => { this.starting = undefined; });
    return this.starting;
  }
  async waitReady(target) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const status = await new Promise((resolve, reject) => {
          const request = http.get({ ...target, path: '/health/ready', agent: false }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
          request.setTimeout(1500, () => request.destroy(new Error('readiness_timeout'))); request.on('error', reject);
        });
        if (status >= 200 && status < 300) return;
      } catch { /* bounded startup retry; no user operation is repeated */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('application_start_timeout');
  }
  acquire() {
    this.active++; this.generation++; clearTimeout(this.timer);
    let released = false;
    return () => {
      if (released) return; released = true; this.active--;
      if (!this.active) this.arm();
    };
  }
  arm() {
    clearTimeout(this.timer);
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (this.active || this.starting || generation !== this.generation) return this.arm();
      this.stopping = this.engine('POST', this.endpoint('/stop?t=600')).then(() => {
        this.target = undefined;
      }).finally(() => { this.stopping = undefined; });
      this.stopping.then(() => { if (!this.active) this.onIdle(); }).catch(() => this.arm());
    }, this.idleMs);
    this.timer.unref?.();
  }
  close() { clearTimeout(this.timer); }
}

export function createGateway(runtime, { dependencies = [], healthEngine = runtime.engine } = {}) {
  const error = response => {
    if (response.headersSent) return response.destroy();
    response.writeHead(503, { 'content-type': 'application/json', 'retry-after': '3' });
    response.end('{"error":"application_temporarily_unavailable"}');
  };
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && ['/health/live', '/health/ready'].includes(request.url)) {
      try {
        if (request.url === '/health/ready') {
          for (const name of dependencies) {
            const info = await healthEngine('GET', '/containers/' + encodeURIComponent(name) + '/json');
            if (!info.State.Running || (info.State.Health && info.State.Health.Status !== 'healthy')) throw new Error('dependency_not_ready');
          }
        }
        response.writeHead(200, { 'content-type': 'application/json', 'x-backend-runtime': runtime.target ? 'running' : 'on-demand' });
        response.end(JSON.stringify({ status: request.url === '/health/live' ? 'ok' : 'ready' }));
      } catch { error(response); }
      return;
    }
    const release = runtime.acquire();
    let upstream;
    response.once('close', () => { upstream?.destroy(); release(); });
    response.once('finish', release);
    try {
      const target = await runtime.ensureReady();
      if (response.destroyed || request.aborted) return;
      upstream = http.request({ ...target, method: request.method, path: request.url, headers: request.headers }, result => {
        response.writeHead(result.statusCode, result.headers); result.pipe(response);
        result.on('error', () => response.destroy());
      });
      upstream.on('error', () => { runtime.target = undefined; error(response); });
      request.on('aborted', () => upstream.destroy()); request.pipe(upstream);
    } catch { error(response); }
  });
  server.on('upgrade', async (request, socket, head) => {
    const release = runtime.acquire();
    socket.once('close', release); socket.once('end', release); socket.once('error', release);
    try {
      const target = await runtime.ensureReady();
      if (socket.destroyed) return;
      const upstream = http.request({ ...target, method: request.method, path: request.url, headers: request.headers });
      upstream.once('upgrade', (result, remote, buffer) => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(result.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
        if (head.length) remote.write(head); if (buffer.length) socket.write(buffer);
        remote.pipe(socket); socket.pipe(remote);
        socket.on('close', () => remote.destroy()); remote.on('close', () => socket.destroy());
        remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
      });
      upstream.once('response', result => { result.resume(); socket.destroy(); });
      upstream.once('error', () => socket.destroy()); upstream.end();
    } catch { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 3\r\n\r\n'); }
  });
  return server;
}

async function main() {
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const runtime = new ContainerRuntime(config);
  const server = createGateway(runtime, config);
  runtime.onIdle = () => server.close(() => process.exit(0));
  if (Number(process.env.LISTEN_PID) !== process.pid || Number(process.env.LISTEN_FDS) !== 1) throw new Error('systemd_socket_required');
  server.listen({ fd: 3 });
  runtime.arm();
  process.on('SIGTERM', () => { runtime.close(); server.close(() => process.exit(0)); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('container_gateway_failed'); process.exitCode = 1; });
