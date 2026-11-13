import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
export async function readEnvironment(file) {
  const values = JSON.parse(await readFile(file,'utf8'));
  // Preserve PM2's explicit variables, while reading dotenv defaults afresh
  // after credential/configuration changes instead of freezing their values.
  if (values.DEMAND_PROJECT_ENV) {
    if (!path.isAbsolute(values.DEMAND_PROJECT_ENV)) throw new Error('absolute_project_env_required');
    let defaults = {};
    try { defaults = parseEnv(await readFile(values.DEMAND_PROJECT_ENV,'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const [key,value] of Object.entries(defaults)) if (!(key in values)) values[key]=value;
  }
  return values;
}
