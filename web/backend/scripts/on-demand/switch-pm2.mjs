// Reversible single-application cutover. Run as the application's own user.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { applications } from './units.mjs';

const exec = promisify(execFile);
const [name, bundle, state, expectedStatus = '401', probePath = '/'] = process.argv.slice(2);
if (!applications[name] || !bundle || !state) throw new Error('Usage: switch-pm2.mjs APP UNITS_DIR STATE_DIR [STATUS] [PATH]');
const pm2 = '/home/jmarin/.npm-global/bin/pm2';
const unit = `backend-demand-${name}`;
const config = applications[name];
const sockets = (await exec('ss', ['-tn', 'state', 'established', `( sport = :${config.port} )`])).stdout.trim().split('\n');
if (sockets.length > 1) throw new Error('application_has_active_connections');
const snapshot = JSON.parse((await exec(pm2, ['jlist'], { maxBuffer: 16 * 1024 * 1024 })).stdout);
const current = snapshot.find(app => app.name === name);
if (!current) throw new Error('application_not_running_in_pm2');
await mkdir(state, { recursive: true, mode: 0o700 });
await writeFile(path.join(state, name + '.pm2-before.json'), JSON.stringify(current), { mode: 0o600 });
const restoreFile = path.join(state, name + '.restore.json');
const original = current.pm2_env;
await writeFile(restoreFile, JSON.stringify({ apps: [{ name, script: original.pm_exec_path, cwd: original.pm_cwd,
  interpreter: original.exec_interpreter || 'node', node_args: original.node_args || [], args: original.args || [],
  env: { ...original.env, ...Object.fromEntries(Object.entries(original).filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string')) },
  autorestart: original.autorestart !== false, kill_timeout: original.kill_timeout || 600000,
  out_file: original.pm_out_log_path, error_file: original.pm_err_log_path }] }), { mode: 0o600 });
const unitsDir = path.join(os.homedir(), '.config/systemd/user');
await mkdir(unitsDir, { recursive: true });
for (const extension of ['service', 'socket']) await copyFile(path.join(bundle, unit + '.' + extension), path.join(unitsDir, unit + '.' + extension));
await exec('systemctl', ['--user', 'daemon-reload']);
await exec(pm2, ['stop', name], { maxBuffer: 2 * 1024 * 1024 });
try {
  await exec('systemctl', ['--user', 'enable', '--now', unit + '.socket']);
  const status = await new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port: config.port, path: probePath, agent: false }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.setTimeout(35_000, () => request.destroy(new Error('cold_start_timeout'))); request.on('error', reject);
  });
  if (String(status) !== expectedStatus) throw new Error('cold_start_probe_unexpected_status_' + status);
  await exec(pm2, ['delete', name], { maxBuffer: 2 * 1024 * 1024 });
  await exec(pm2, ['save']);
} catch (error) {
  await exec('systemctl', ['--user', 'disable', '--now', unit + '.socket']).catch(() => {});
  await exec('systemctl', ['--user', 'stop', unit + '.service']).catch(() => {});
  await exec(pm2, ['start', restoreFile, '--only', name], { maxBuffer: 2 * 1024 * 1024 });
  await exec(pm2, ['save']);
  throw error;
}
console.log(JSON.stringify({ application: name, unit, coldStartVerified: true, idleSeconds: 60 }));
