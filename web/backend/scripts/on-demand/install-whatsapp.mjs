import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import pg from 'pg';
import { build } from 'esbuild';
import { unitQuote } from './units.mjs';
import { readEnvironment } from './environment.mjs';
const [root, mode] = process.argv.slice(2);
if (!path.isAbsolute(root || '')) throw new Error('absolute_runtime_root_required');
const envFile = path.join(root, 'whatsapp-bridge.env.json');
const env = await readEnvironment(envFile);
if (!env.BRIDGE_DISPATCH_TOKEN || env.BRIDGE_STORE !== 'postgres' || !env.REPORT_STATE_FILE) throw new Error('durable_whatsapp_configuration_required');
const cron = (env.REPORT_CRON || '59 23 * * *').split(/\s+/);
if (cron.length !== 5 || !/^\d+$/.test(cron[0]) || !/^\d+$/.test(cron[1]) || cron.slice(2).some(field => field !== '*')) throw new Error('daily_report_schedule_required');
const hour = Number(cron[1]), minute = Number(cron[0]), timezone = env.REPORT_TIMEZONE || 'America/Bogota';
if (hour>23 || minute>59 || !/^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone)) throw new Error('invalid_report_schedule');
const compiled = await build({ entryPoints:[new URL('./whatsapp-maintenance.mjs',import.meta.url).pathname], bundle:true, write:false,
  platform:'node',format:'esm',target:'node22',external:['pg-native'],
  banner:{js:"import {createRequire as demandCreateRequire} from 'node:module'; const require=demandCreateRequire(import.meta.url);"},logLevel:'silent' });
const source = compiled.outputFiles[0].contents;
const hash = createHash('sha256').update(source).digest('hex');
const release = path.join(root,'releases',hash);await mkdir(release,{recursive:true,mode:0o700});
await writeFile(path.join(release,'whatsapp-maintenance.mjs'),source,{mode:0o600});
const units = path.join(os.homedir(),'.config/systemd/user');
for (const [kind, calendar] of [['report',`*-*-* ${hour}:${minute}:00 ${timezone}`],['purge','*-*-* *:0/5:00 America/Bogota']]) {
  const unit='backend-clock-whatsapp-'+kind;
  await writeFile(path.join(units,unit+'.service'),`[Unit]
Description=Finite WhatsApp ${kind}
[Service]
Type=oneshot
ExecStart=/usr/bin/node ${unitQuote(path.join(release,'whatsapp-maintenance.mjs'))} ${unitQuote(envFile)} ${kind}
TimeoutStartSec=610
MemoryMax=96M
CPUQuota=20%
UMask=0077
`);
  await writeFile(path.join(units,unit+'.timer'),`[Unit]
Description=Clock for WhatsApp ${kind}
[Timer]
OnCalendar=${calendar}
Persistent=true
AccuracySec=1s
[Install]
WantedBy=timers.target
`);
}
execFileSync('systemctl',['--user','daemon-reload']);
if (mode === '--activate') {
  const client=new pg.Client({connectionString:env.DATABASE_URL});await client.connect();
  try {
    await client.query('EXPLAIN SELECT 1 FROM whatsapp_webhook_jobs WHERE state=\'pending\'');
    const before=(await client.query("SELECT pg_get_functiondef(to_regprocedure('public.backend_demand_notify()')) AS ddl")).rows;
    try {await writeFile(path.join(root,'whatsapp-notifications-before.json'),JSON.stringify(before),{mode:0o600,flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
    await client.query(`BEGIN;
      CREATE OR REPLACE FUNCTION public.backend_demand_notify() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_notify('backend_demand_work',TG_TABLE_NAME); RETURN NULL; END; $$;
      DROP TRIGGER IF EXISTS backend_demand_wake ON whatsapp_webhook_jobs;
      CREATE TRIGGER backend_demand_wake AFTER INSERT OR UPDATE OR DELETE ON whatsapp_webhook_jobs FOR EACH STATEMENT EXECUTE FUNCTION public.backend_demand_notify();
      COMMIT;`);
  }finally{await client.end();}
  const configFile=path.join(root,'store.json');const config=JSON.parse(await readFile(configFile,'utf8'));
  const database={id:'whatsapp',envFile,jobs:[{id:'whatsapp-webhooks',serviceUnit:'backend-demand-whatsapp-bridge.service',
    checkSql:"SELECT EXISTS(SELECT 1 FROM whatsapp_webhook_jobs WHERE state='pending') AS ready"}]};
  config.databases=[...config.databases.filter(row=>row.id!==database.id),database];
  await writeFile(configFile,JSON.stringify(config,null,2),{mode:0o600});
  execFileSync('systemctl',['--user','restart','backend-demand-dispatcher.service']);
  for(const kind of ['report','purge'])execFileSync('systemctl',['--user','enable','--now','backend-clock-whatsapp-'+kind+'.timer']);
}
console.log(JSON.stringify({prepared:true,activated:mode==='--activate',dailyReport:`${hour}:${minute} ${timezone}`,purgeMinutes:5}));
