import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { readEnvironment } from './environment.mjs';
import { unitQuote } from './units.mjs';
const [root,mode]=process.argv.slice(2);
if(!path.isAbsolute(root||''))throw new Error('absolute_runtime_root_required');
const cwd='/var/www/LP-LICENSE-SERVER/backend', envFile=path.join(root,'license-backend.env.json');
const raw=JSON.parse(await readFile(envFile,'utf8'));
raw.DEMAND_PROJECT_ENV=path.join(cwd,'.env');raw.LICENSE_JOB_STATE_DIR=path.join(root,'license-jobs');
await writeFile(envFile,JSON.stringify(raw),{mode:0o600});
const vars=await readEnvironment(envFile);
const hours=(key,fallback)=>{const value=Number(vars[key]||fallback);if(!Number.isInteger(value)||value<1||value>24)throw new Error('invalid_schedule_'+key);return value;};
const minutes=(key,fallback)=>{const value=Number(vars[key]||fallback);if(!Number.isInteger(value)||value<1||value>60)throw new Error('invalid_schedule_'+key);return value;};
const job=(id,selector,calendar,extra={})=>({id:'license-'+id,selector,cwd,envFile,script:path.join(cwd,'dist/resource-worker.js'),calendar,memoryMib:768,heavy:false,...extra});
const clock=(h,m)=>`*-*-* ${h}:${m}:00 America/Bogota`;
const scheduled=[
 job('secrets','secrets',clock('*','11')),
 job('retention','retention',clock('03','41')),
 job('blog','blog',clock('*','0/'+minutes('BLOG_AUTOMATION_CHECK_MINUTES',1)),{heavy:true,memoryMib:1536,checkSql:"SELECT EXISTS(SELECT 1 FROM blog_automation_jobs WHERE enabled AND next_run_at<=now()) AS ready"}),
 job('worklog','worklog',clock('0/'+hours('WORKLOG_ROLLUP_CHECK_HOURS',6),'22')),
 job('offers','offers',clock('*','0/'+minutes('JOBS_OFFER_SWEEP_CHECK_MINUTES',30)),{checkSql:"SELECT EXISTS(SELECT 1 FROM job_offers WHERE status='sent' AND expires_at<now()) AS ready"}),
 job('billing','billing',clock('0/'+hours('MODULE_BILLING_CHECK_HOURS',6),'23'),{checkSql:"SELECT EXISTS(SELECT 1 FROM module_subscriptions WHERE status='active' AND next_billing_at<=now()) AS ready"})
];
const client=new pg.Client({connectionString:vars.DATABASE_URL});await client.connect();
try{for(const task of scheduled)await client.query('EXPLAIN '+(task.checkSql||'SELECT true AS ready'));}finally{await client.end();}
const configFile=path.join(root,'store.json'),config=JSON.parse(await readFile(configFile,'utf8'));
config.databases=[...config.databases.filter(row=>row.id!=='license'),{id:'license',envFile,jobs:[],scheduled}];
await writeFile(configFile,JSON.stringify(config,null,2),{mode:0o600});
const release=JSON.parse(await readFile(path.join(root,'store-release.json'),'utf8'));
const dispatcher=path.join(root,'releases',release.dispatcherHash,'dispatcher.mjs');
const units=path.join(os.homedir(),'.config/systemd/user');
for(const task of scheduled){const unit='backend-clock-'+task.id;
 await writeFile(path.join(units,unit+'.service'),`[Unit]
Description=Finite ${task.id}
[Service]
Type=oneshot
ExecStart=/usr/bin/node ${unitQuote(dispatcher)} ${unitQuote(configFile)} --once ${task.id}
TimeoutStartSec=2h
MemoryMax=128M
UMask=0077
`);
 await writeFile(path.join(units,unit+'.timer'),`[Unit]
Description=Clock for ${task.id}
[Timer]
OnCalendar=${task.calendar}
Persistent=true
AccuracySec=1s
[Install]
WantedBy=timers.target
`);
}
execFileSync('systemctl',['--user','daemon-reload']);
if(mode==='--activate'){
 for(const task of scheduled)execFileSync('systemctl',['--user','enable','--now','backend-clock-'+task.id+'.timer']);
 execFileSync('systemctl',['--user','restart','backend-demand-dispatcher.service']);
}
console.log(JSON.stringify({schedules:scheduled.length,activated:mode==='--activate'}));
