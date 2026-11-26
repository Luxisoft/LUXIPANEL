import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readEnvironment } from './environment.mjs';

const [envFile, script, selector, memoryMib] = process.argv.slice(2);
if (!path.isAbsolute(envFile || '') || !path.isAbsolute(script || '') || !selector || !/^[A-Za-z0-9_-]{1,80}$/.test(selector)) throw new Error('invalid_finite_job');
const vars = await readEnvironment(envFile);
if (memoryMib) {
  const available = Number((await readFile('/proc/meminfo', 'utf8')).match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0) / 1024;
  if (available < Number(memoryMib) + 1536) throw new Error('work_waiting_for_memory');
}
for (const [key, value] of Object.entries(vars)) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string' && !key.startsWith('LISTEN_') && key !== 'NODE_OPTIONS') process.env[key] = value;
process.env.WORKER_RUN_ONCE = selector;
process.env.DEMAND_RUNTIME_ENABLED = '1';
process.argv = [process.execPath, script];
await import(pathToFileURL(script).href);
