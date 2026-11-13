// Prepare and activate the shared listener and finite schedules for Luxisoft.
// Configuration/credentials stay private; the application runner code must be
// installed and verified before --activate is used.
import { readFile, writeFile, mkdir, copyFile, readlink, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';
import pg from 'pg';
import { unitQuote, pm2Environment } from './units.mjs';
import { readEnvironment } from './environment.mjs';

const exec = promisify(execFile);
const [registryFile, snapshotFile, runtimeRoot, cwd, mode] = process.argv.slice(2);
for (const value of [registryFile, snapshotFile, runtimeRoot, cwd]) if (!path.isAbsolute(value || '')) throw new Error('absolute_install_paths_required');
const { storeDemandRegistry, notificationSql } = await import(pathToFileURL(registryFile).href);
const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
const computeLock = path.resolve(cwd,'../.cache/luxisoft-heavy-build.lock');
await mkdir(path.dirname(computeLock),{recursive:true});
try {
  const target = await readlink(computeLock);
  if(path.resolve(path.dirname(computeLock),target)!=='/run/lock/luxipanel-assistant-build.lock')throw new Error('shared_compute_lock_migration_required');
}catch(error){
  if(error.code==='ENOENT')await symlink('/run/lock/luxipanel-assistant-build.lock',computeLock);
  else if(error.code==='EINVAL')throw new Error('shared_compute_lock_migration_required');
  else throw error;
}
for (const name of ['luxisoft-worker', 'luxisoft-automation-worker', 'luxisoft-repair-worker']) {
  const app = snapshot.find(row => row.name === name);
  if (!app) throw new Error('missing_original_worker_' + name);
  const variables = pm2Environment(app.pm2_env);
  // dotenv in the original application uses override=false; preserve precedence.
  variables.DEMAND_PROJECT_ENV = path.join(cwd,'.env');
  variables.PATH = '/home/jmarin/.npm-global/bin:/home/jmarin/.local/share/pnpm/bin:/usr/local/bin:/usr/bin:/bin';
  await writeFile(path.join(runtimeRoot, name + '.env.json'), JSON.stringify(variables), { mode: 0o600 });
}
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const staging = path.join(runtimeRoot, 'dispatcher-staging'); await mkdir(staging, { recursive: true, mode: 0o700 });
await build({ entryPoints: [path.join(sourceDir, 'dispatcher.mjs')], outfile: path.join(staging, 'dispatcher.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['pg-native'],
  banner: { js: "import {createRequire as demandCreateRequire} from 'node:module'; const require=demandCreateRequire(import.meta.url);" }, logLevel: 'silent' });
await copyFile(path.join(sourceDir, 'launch-job.mjs'), path.join(staging, 'launch-job.mjs'));
await copyFile(path.join(sourceDir, 'environment.mjs'), path.join(staging, 'environment.mjs'));
const hash = createHash('sha256');
for (const name of ['dispatcher.mjs', 'launch-job.mjs', 'environment.mjs']) hash.update(await readFile(path.join(staging, name)));
const digest = hash.digest('hex'), release = path.join(runtimeRoot, 'releases', digest);
await mkdir(release, { recursive: true, mode: 0o700 });
for (const name of ['dispatcher.mjs', 'launch-job.mjs', 'environment.mjs']) await copyFile(path.join(staging, name), path.join(release, name));
const registry = storeDemandRegistry(cwd, runtimeRoot);
const configFile = path.join(runtimeRoot, 'store.json');
let previousConfig = { databases: [] };
try { previousConfig = JSON.parse(await readFile(configFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(configFile, JSON.stringify({ ...previousConfig, databases: [...previousConfig.databases.filter(row => row.id !== registry.id), registry] }, null, 2), { mode: 0o600 });
const vars = await readEnvironment(registry.envFile);
const client = new pg.Client({ connectionString: vars.DATABASE_URL, application_name: 'demand-install-preflight' });
await client.connect();
try {
  // Read-only validation before replacing a single worker or touching its queue.
  for (const job of [...registry.jobs, ...registry.scheduled]) {
    await client.query('EXPLAIN ' + (job.checkSql || 'SELECT true AS ready'));
    if (job.nextSql) await client.query('EXPLAIN ' + job.nextSql);
  }
  if (mode === '--activate') {
    for (const name of ['worker', 'automation-worker', 'repair-worker']) {
      if (!readFileSync(path.join(cwd, 'dist', name + '.js'), 'utf8').includes('WORKER_RUN_ONCE')) throw new Error('finite_runner_not_installed_' + name);
    }
    const tables = [...new Set(registry.jobs.flatMap(job => job.tables))];
    const rollbackFile = path.join(runtimeRoot, 'store-notifications-before.json');
    const triggers = (await client.query(`SELECT c.relname AS table_name, pg_get_triggerdef(t.oid) AS ddl
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND t.tgname='backend_demand_wake' AND c.relname=ANY($1::text[])`, [tables])).rows;
    const functions = (await client.query("SELECT pg_get_functiondef(to_regprocedure('public.backend_demand_notify()')) AS ddl")).rows;
    try { await writeFile(rollbackFile, JSON.stringify({ tables, triggers, functions }, null, 2), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await client.query(notificationSql(tables));
  }
} finally { await client.end(); }
const units = path.join(os.homedir(), '.config/systemd/user'); await mkdir(units, { recursive: true });
await writeFile(path.join(units,'backend-jobs.slice'),`[Unit]
Description=Aggregate budget for finite backend jobs
[Slice]
MemoryHigh=2560M
MemoryMax=3072M
MemorySwapMax=256M
CPUQuota=100%
TasksMax=1024
`);
await writeFile(path.join(units, 'backend-demand-dispatcher.service'), `[Unit]
Description=Backend durable work notification listener
StartLimitIntervalSec=0

[Service]
Type=exec
ExecStart=/usr/bin/node ${unitQuote(path.join(release, 'dispatcher.mjs'))} ${unitQuote(configFile)}
Restart=on-failure
RestartSec=10
MemoryMax=128M
MemorySwapMax=0
CPUQuota=20%
TasksMax=128
UMask=0077

[Install]
WantedBy=default.target
`);
for (const job of registry.scheduled) {
  const unit = 'backend-clock-' + job.id;
  await writeFile(path.join(units, unit + '.service'), `[Unit]
Description=Finite scheduled ${job.id}

[Service]
Type=oneshot
ExecStart=/usr/bin/node ${unitQuote(path.join(release, 'dispatcher.mjs'))} ${unitQuote(configFile)} --once ${job.id}
TimeoutStartSec=2h
MemoryMax=128M
UMask=0077
`);
  await writeFile(path.join(units, unit + '.timer'), `[Unit]
Description=Clock for ${job.id}

[Timer]
OnCalendar=${job.calendar}
AccuracySec=1s
Persistent=true
Unit=${unit}.service

[Install]
WantedBy=timers.target
`);
}
await exec('systemctl', ['--user', 'daemon-reload']);
if (mode === '--activate') {
  await exec('systemctl', ['--user', 'enable', '--now', 'backend-demand-dispatcher.service']);
  for (const job of registry.scheduled) await exec('systemctl', ['--user', 'enable', '--now', 'backend-clock-' + job.id + '.timer']);
}
await writeFile(path.join(runtimeRoot, 'store-release.json'), JSON.stringify({ dispatcherHash: digest, mode: mode || 'prepared', jobs: registry.jobs.map(job => job.id), scheduled: registry.scheduled.map(job => job.id) }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ dispatcherHash: digest, queueKinds: registry.jobs.length, schedules: registry.scheduled.length, activated: mode === '--activate' }));
