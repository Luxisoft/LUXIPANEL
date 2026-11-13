import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const applications = {
  'license-backend': { port: 3300, host: '127.0.0.1', memory: 768, nodeWarmArgs: ['--require','./node_modules/express'] },
  'whatsapp-bridge': { port: 4010, host: '127.0.0.1', memory: 1536 },
  'luxisoft-backend': { port: 3200, host: '0.0.0.0', memory: 1024 },
  'luxisoft-site-server': { port: 3400, host: '0.0.0.0', memory: 1024 },
  'luxisoft-ai-proxy': { port: 3450, host: '127.0.0.1', memory: 512 },
  'luxipanel-backend': { port: 8080, host: '127.0.0.1', memory: 1024, nodeWarmArgs: ['--require','./node_modules/express'] },
  'luxipanel-frontend': { port: 4321, host: '127.0.0.1', memory: 512 },
};

export function unitQuote(value) {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value)) throw new Error('invalid_unit_argument');
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => '$$') + '"';
}

export function appUnits({ name, cwd, script, nodeArgs = [], nodeOptions, envFile, preload, port, host, stdoutFile, stderrFile, memory = 768, idleMs = 60_000 }) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(name) || !Number.isInteger(port) || port < 1024 || port > 65535 || !['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('invalid_application_spec');
  if (!Number.isInteger(memory) || memory < 64 || memory > 4096 || !Number.isInteger(idleMs) || idleMs < 1 || idleMs > 3_600_000) throw new Error('invalid_resource_limits');
  for (const value of [cwd, script, envFile, preload]) if (!path.isAbsolute(value)) throw new Error('absolute_runtime_paths_required');
  unitQuote(cwd);
  for (const file of [stdoutFile, stderrFile]) if (file && (!path.isAbsolute(file) || /[\0\r\n]/.test(file))) throw new Error('absolute_log_paths_required');
  const unit = `backend-demand-${name}`;
  const service = `[Unit]
Description=On-demand ${name}
Requires=${unit}.socket
After=${unit}.socket
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=exec
WorkingDirectory=${cwd.replaceAll('%', '%%')}
Environment=DEMAND_RUNTIME_ENABLED=1
Environment=DEMAND_SOCKET_PORT=${port}
Environment=DEMAND_IDLE_MS=${idleMs}
${nodeOptions ? 'Environment=' + unitQuote('NODE_OPTIONS='+nodeOptions) : ''}
Environment=${unitQuote('DEMAND_ENV_FILE=' + envFile)}
ExecStart=/usr/bin/node ${nodeArgs.map(unitQuote).join(' ')} --import ${unitQuote(preload)} ${unitQuote(script)}
${stdoutFile ? 'StandardOutput=append:' + stdoutFile.replaceAll('%','%%') : ''}
${stderrFile ? 'StandardError=append:' + stderrFile.replaceAll('%','%%') : ''}
Restart=on-failure
RestartSec=3
TimeoutStopSec=600
KillMode=control-group
MemoryAccounting=yes
MemoryMax=${memory}M
CPUQuota=200%
TasksMax=512
UMask=0077
`;
  const socket = `[Unit]
Description=Activation socket for ${name}

[Socket]
ListenStream=${host}:${port}
Accept=no
NoDelay=true
Backlog=128
Service=${unit}.service
FileDescriptorName=http

[Install]
WantedBy=sockets.target
`;
  return { unit, service, socket };
}

export function pm2Environment(e) {
  const ignored = new Set(['SSH_AUTH_SOCK','SSH_CLIENT','SSH_CONNECTION','SSH_TTY','CODEX_THREAD_ID','CODEX_TURN_ID']);
  return Object.fromEntries(Object.entries({...e.env,...e}).filter(([key,value])=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)&&typeof value==='string'&&!ignored.has(key)));
}

export async function preparePm2(snapshot, destination, unitsDirectory, only = Object.keys(applications)) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await mkdir(unitsDirectory, { recursive: true });
  const source = await readFile(new URL('./node-runtime.mjs', import.meta.url));
  const hash = createHash('sha256').update(source).digest('hex');
  const release = path.join(destination, 'releases', hash);
  await mkdir(release, { recursive: true, mode: 0o700 });
  const preload = path.join(release, 'node-runtime.mjs');
  await writeFile(preload, source, { mode: 0o600 });
  const prepared = [];
  for (const app of snapshot) {
    if (!only.includes(app.name) || !applications[app.name]) continue;
    const e = app.pm2_env;
    if (!e || !path.isAbsolute(e.pm_exec_path)) throw new Error('invalid_pm2_snapshot');
    const variables = pm2Environment(e);
    variables.PATH = '/home/jmarin/.npm-global/bin:/home/jmarin/.local/share/pnpm/bin:/usr/local/bin:/usr/bin:/bin';
    const envFile = path.join(destination, app.name + '.env.json');
    try { await writeFile(envFile, JSON.stringify(variables), { mode: 0o600, flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = JSON.parse(await readFile(envFile,'utf8'));
      await writeFile(envFile,JSON.stringify({...variables,...existing}),{mode:0o600});
    }
    const panelRoot = app.name.startsWith('luxipanel-') && e.pm_cwd.includes('/.releases/') ? e.pm_cwd.split('/.releases/')[0] : undefined;
    const cwd = panelRoot ? path.join(panelRoot,'web',app.name === 'luxipanel-frontend' ? 'frontend' : 'backend') : e.pm_cwd;
    const script = panelRoot ? path.join(cwd, app.name === 'luxipanel-frontend' ? 'dist/server/entry.mjs' : 'dist/server.js') : e.pm_exec_path;
    const units = appUnits({ name: app.name, cwd, script,
      nodeArgs: [...(applications[app.name].nodeWarmArgs || []), ...(e.node_args || [])], nodeOptions:e.NODE_OPTIONS||e.env?.NODE_OPTIONS, envFile, preload, stdoutFile:e.pm_out_log_path, stderrFile:e.pm_err_log_path, ...applications[app.name] });
    await writeFile(path.join(unitsDirectory, units.unit + '.service'), units.service);
    await writeFile(path.join(unitsDirectory, units.unit + '.socket'), units.socket);
    prepared.push({ name: app.name, unit: units.unit, ...applications[app.name] });
  }
  await writeFile(path.join(destination, 'prepared.json'), JSON.stringify({ preloadHash: hash, applications: prepared }, null, 2), { mode: 0o600 });
  return prepared;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [snapshot, destination, unitsDirectory, ...only] = process.argv.slice(2);
  if (!snapshot || !destination || !unitsDirectory) throw new Error('Usage: units.mjs SNAPSHOT DESTINATION UNITS_DIR [APP...]');
  console.log(JSON.stringify(await preparePm2(JSON.parse(await readFile(snapshot, 'utf8')), destination, unitsDirectory, only.length ? only : undefined)));
}
