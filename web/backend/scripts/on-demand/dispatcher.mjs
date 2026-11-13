// Durable queues own work; this process only listens, sets due timers and launches
// allowlisted finite runners. It imports no application business modules.
import { readFile, readdir } from 'node:fs/promises';
import { watch, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEnvironment } from './environment.mjs';

export class DemandCoordinator {
  constructor({ jobs, query, run, retryMs = 30_000 }) {
    this.jobs = jobs; this.query = query; this.run = run; this.retryMs = retryMs;
    this.running = new Map(); this.timers = new Map(); this.scanning = false;
    this.again = false; this.closed = false; this.blockedUntil = new Map();
  }
  async scan() {
    if (this.closed) return;
    if (this.scanning) { this.again = true; return; }
    this.scanning = true;
    try {
      for (const job of this.jobs) {
        if (this.closed || this.running.has(job.id)) continue;
        clearTimeout(this.timers.get(job.id)); this.timers.delete(job.id);
        const blocked = this.blockedUntil.get(job.id) || 0;
        if (blocked > Date.now()) { this.schedule(job.id, blocked - Date.now()); continue; }
        const result = await this.query(job);
        if (result.ready) {
          const pending = Promise.resolve().then(() => this.run(job));
          this.running.set(job.id, pending);
          pending.then(() => { if (job.serviceUnit) this.blockedUntil.set(job.id, Date.now() + this.retryMs); }).catch(() => this.blockedUntil.set(job.id, Date.now() + this.retryMs)).finally(() => {
            this.running.delete(job.id);
            // Re-read the durable queue after a runner exits. No notification
            // race or missed in-flight enqueue can strand an accepted job.
            if (!this.closed) this.schedule(job.id, 50);
          });
        } else if (result.nextAt) {
          const delay = new Date(result.nextAt).getTime() - Date.now();
          // A past but ineligible row waits for a real state change (e.g. a
          // browser device coming online), rather than becoming a busy loop.
          if (delay > 0) this.schedule(job.id, Math.max(50, delay));
        }
      }
    } finally {
      this.scanning = false;
      if (this.again) { this.again = false; this.schedule('_rescan', 20); }
    }
  }
  schedule(id, delay) {
    clearTimeout(this.timers.get(id));
    const timer = setTimeout(() => { this.timers.delete(id); void this.scan().catch(() => this.schedule(id, this.retryMs)); }, Math.min(delay, 2_147_000_000));
    timer.unref?.(); this.timers.set(id, timer);
  }
  close() { this.closed = true; for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); }
}

export function runJob(job, { spawnProcess = spawn } = {}) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(job.id)) throw new Error('invalid_job_id');
  if (job.serviceUnit) {
    if (!/^backend-demand-[a-z0-9-]+\.service$/.test(job.serviceUnit)) throw new Error('invalid_activation_unit');
    return new Promise((resolve, reject) => {
      const child = spawnProcess('/usr/bin/systemctl', ['--user', 'start', job.serviceUnit], { stdio: 'ignore' });
      child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('activation_failed')));
    });
  }
  for (const value of [job.cwd, job.envFile, job.script]) if (!path.isAbsolute(value)) throw new Error('absolute_job_paths_required');
  const memoryMib = job.memoryMib || 1536;
  const cpu = job.cpuPercent || 200;
  if (!Number.isInteger(memoryMib) || memoryMib < 64 || memoryMib > 3072 || !Number.isInteger(cpu) || cpu < 1 || cpu > 200) throw new Error('invalid_job_resources');
  const available = Number(readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0) / 1024;
  if (available < memoryMib + 1536) return Promise.reject(new Error('work_waiting_for_memory'));
  const launcher = fileURLToPath(new URL('./launch-job.mjs', import.meta.url));
  if (job.lockPath && !/^\/run\/lock\/backend-demand-[a-z0-9-]+\.lock$/.test(job.lockPath)) throw new Error('invalid_job_lock');
  const args = ['--user', '--quiet', '--wait', '--collect', '--unit=backend-job-' + job.id,
    '--slice=backend-jobs.slice',
    '--property=Type=exec', '--property=WorkingDirectory=' + job.cwd,
    '--property=MemoryMax=' + memoryMib + 'M',
    '--property=CPUQuota=' + cpu + '%',
    '--property=TasksMax=512', '--property=TimeoutStopSec=600',
    '/usr/bin/flock', '-w', '7200', job.lockPath || (job.heavy === false ? '/run/lock/backend-demand-light.lock' : '/run/lock/luxipanel-assistant-build.lock'),
    '/usr/bin/node', launcher, job.envFile, job.script, job.selector, String(memoryMib)];
  const nodeOptions = JSON.parse(readFileSync(job.envFile,'utf8')).NODE_OPTIONS;
  if(nodeOptions){
    if(typeof nodeOptions!=='string'||/[\0\r\n]/.test(nodeOptions))throw new Error('invalid_job_node_options');
    args.splice(5,0,'--setenv=NODE_OPTIONS='+nodeOptions);
  }
  return new Promise((resolve, reject) => {
    const child = spawnProcess('/usr/bin/systemd-run', args, { stdio: ['ignore', 'ignore', 'ignore'] });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('finite_job_failed')));
  });
}

async function main() {
  const [configFile, mode, selected] = process.argv.slice(2);
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const { Client } = await import('pg');
  const clients = new Map(), coordinators = [], watches = [];
  if (mode === '--once' && !(config.databases || []).some(database => [...(database.jobs || []), ...(database.scheduled || [])].some(job => job.id === selected))) throw new Error('unknown_finite_job');
  let closing = false;
  for (const database of config.databases || []) {
    if (mode !== '--once' && !(database.jobs || []).length) continue;
    const vars = await readEnvironment(database.envFile);
    const client = new Client({ connectionString: vars[database.urlKey || 'DATABASE_URL'], connectionTimeoutMillis: 5000 });
    clients.set(database.id, client); await client.connect();
    const jobs = (mode === '--once' ? [...(database.jobs || []), ...(database.scheduled || [])].filter(job => job.id === selected) : database.jobs || []);
    const query = async job => {
      if (job.enabledFlag) {
        const values = await readEnvironment(job.envFile);
        if (!['1', 'true', 'yes', 'on'].includes(String(values[job.enabledFlag] || '').toLowerCase())) return { ready: false };
      }
      const row = (await client.query(job.checkSql || 'SELECT true AS ready')).rows[0] || {};
      const nextAt = !row.ready && job.nextSql ? (await client.query(job.nextSql)).rows[0]?.next_at : undefined;
      return { ready: row.ready === true, nextAt };
    };
    if (mode === '--once') {
      for (const job of jobs) if ((await query(job)).ready) await runJob(job);
      continue;
    }
    const coordinator = new DemandCoordinator({ jobs, query, run: runJob });
    coordinators.push(coordinator);
    client.on('notification', event => {
      if (event.channel === 'backend_demand_work') coordinator.schedule('_notify', 50);
    });
    // Listen first, then recover durable pending work: commits at startup are
    // either found by the scan or delivered through NOTIFY.
    await client.query('LISTEN backend_demand_work');
    await coordinator.scan();
    client.on('error', () => { if (!closing) { console.error('demand_dispatch_database_disconnected'); process.exit(1); } });
  }
  if (mode === '--once') { for (const client of clients.values()) await client.end(); return; }
  const fileCoordinator = new DemandCoordinator({ jobs: config.fileJobs || [], run: runJob,
    query: async job => ({ ready: (await readdir(job.watchPath)).some(name => job.filename ? name === job.filename : name.endsWith(job.pendingExtension || '.pending.json')) }) });
  coordinators.push(fileCoordinator);
  for (const job of config.fileJobs || []) {
    const watcher = watch(job.watchPath, () => fileCoordinator.schedule('_notify',50));
    watcher.on('error', () => { console.error('demand_file_watch_failed', job.id); process.exitCode = 1; void shutdown(); });
    watches.push(watcher);
  }
  await fileCoordinator.scan();
  const shutdown = async () => {
    if (closing) return; closing = true;
    for (const coordinator of coordinators) coordinator.close();
    for (const watcher of watches) watcher.close();
    // Finite jobs live in separate units and continue after this listener exits.
    for (const client of clients.values()) await client.end();
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('demand_dispatcher_failed'); process.exitCode = 1; });
