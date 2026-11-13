import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import { createHash,randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { unitQuote } from './units.mjs';
const [root,snapshotFile,mode]=process.argv.slice(2);
if(!path.isAbsolute(root||'')||!path.isAbsolute(snapshotFile||''))throw new Error('absolute_panel_install_paths_required');
const cwd='/var/www/LUXIPANEL/web/backend',envFile=path.join(root,'luxipanel-backend.env.json');
const vars=JSON.parse(await readFile(envFile,'utf8'));
vars.DEMAND_PROJECT_ENV=path.join(cwd,'.env');vars.PANEL_DEMAND_TOKEN ||=randomBytes(32).toString('hex');
vars.PANEL_CLOCK_ROOT=path.join(root,'panel-clock');vars.PANEL_DEMAND_LOG_SOURCES=path.join(root,'panel-log-sources.json');
await mkdir(vars.PANEL_CLOCK_ROOT,{recursive:true,mode:0o700});
const snapshot=JSON.parse(await readFile(snapshotFile,'utf8')),sources=[];
for(const app of snapshot.filter(app=>['luxipanel-backend','luxipanel-frontend'].includes(app.name)))
 for(const [key,stderr]of [['pm_out_log_path',false],['pm_err_log_path',true]]){
  const file=app.pm2_env[key];if(file&&path.isAbsolute(file))sources.push({name:app.name,file,stderr,source:app.name.endsWith('frontend')?'frontend-ssr':'backend'});
 }
await writeFile(vars.PANEL_DEMAND_LOG_SOURCES,JSON.stringify(sources),{mode:0o600});
await writeFile(envFile,JSON.stringify(vars),{mode:0o600});
const client=await readFile(new URL('./panel-clock-client.mjs',import.meta.url));
const hash=createHash('sha256').update(client).digest('hex'),release=path.join(root,'releases',hash);
await mkdir(release,{recursive:true,mode:0o700});await writeFile(path.join(release,'panel-clock-client.mjs'),client,{mode:0o600});
const storeRelease=JSON.parse(await readFile(path.join(root,'store-release.json'),'utf8'));
const launcher=path.join(root,'releases',storeRelease.dispatcherHash,'launch-job.mjs');
const configFile=path.join(root,'store.json'),config=JSON.parse(await readFile(configFile,'utf8'));
config.fileJobs=[...(config.fileJobs||[]).filter(job=>job.id!=='panel-clock'),{id:'panel-clock',cwd,envFile,script:path.join(release,'panel-clock-client.mjs'),selector:'clock',
 watchPath:vars.PANEL_CLOCK_ROOT,pendingExtension:'.pending.json',heavy:false,lockPath:'/run/lock/backend-demand-panel-clock.lock',memoryMib:96,cpuPercent:20}];
// Activate this watch only after the API is verified. Preparation never starts
// a consumer against the old resident API.
if(mode==='--activate')await writeFile(configFile,JSON.stringify(config,null,2),{mode:0o600});
const units=path.join(os.homedir(),'.config/systemd/user');
await writeFile(path.join(units,'backend-clock-panel-scan.service'),`[Unit]
Description=Finite panel schedule metadata scan
[Service]
Type=oneshot
WorkingDirectory=${cwd}
ExecStart=/usr/bin/node ${unitQuote(launcher)} ${unitQuote(envFile)} ${unitQuote(path.join(cwd,'dist/resource-scan.js'))} scan
MemoryMax=384M
MemorySwapMax=0
CPUQuota=50%
TasksMax=256
TimeoutStartSec=300
UMask=0077
`);
await writeFile(path.join(units,'backend-clock-panel-scan.timer'),`[Unit]
Description=Minute clock for configured panel schedules
[Timer]
OnCalendar=*-*-* *:*:02
AccuracySec=1s
Persistent=true
[Install]
WantedBy=timers.target
`);
execFileSync('systemctl',['--user','daemon-reload']);
if(mode==='--activate'){
 execFileSync('systemctl',['--user','restart','backend-demand-dispatcher.service']);
 execFileSync('systemctl',['--user','enable','--now','backend-clock-panel-scan.timer']);
}
console.log(JSON.stringify({prepared:true,activated:mode==='--activate',sourceLogs:sources.length,clockRoot:vars.PANEL_CLOCK_ROOT}));
