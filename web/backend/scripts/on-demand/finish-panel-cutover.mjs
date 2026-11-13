// One-time guarded cutover: existing views/terminals and accepted agent work
// finish first. No resident watcher and no forced disconnection are required.
import { readFile,writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';import{promisify}from'node:util';
import path from'node:path';import{fileURLToPath}from'node:url';
import{readEnvironment}from'./environment.mjs';
const exec=promisify(execFile),[root,snapshot,candidates,state]=process.argv.slice(2);
for(const value of[root,snapshot,candidates,state])if(!path.isAbsolute(value||''))throw Error('absolute_cutover_paths_required');
const resultFile=path.join(root,'panel-cutover-result.json'),pm2='/home/jmarin/.npm-global/bin/pm2';
const save=async(status,reason)=>writeFile(resultFile,JSON.stringify({status,reason,at:new Date().toISOString()},null,2),{mode:0o600});
const incoming=(await exec('ss',['-Htn','state','established','( sport = :8080 )'])).stdout.trim();
if(incoming){await save('waiting','existing_connections_or_work');process.exit(0);}
const rows=JSON.parse((await exec(pm2,['jlist'],{maxBuffer:16*1024*1024})).stdout),app=rows.find(row=>row.name==='luxipanel-backend');
if(app?.pid){
 const sockets=(await exec('ss',['-Htn','state','established','( sport = :8080 )'])).stdout.trim();
 const children=(await exec('ps',['-eo','pid=,ppid='])).stdout.split('\n').some(line=>Number(line.trim().split(/\s+/)[1])===app.pid);
 const outgoing=(await exec('ss',['-Htnp','state','established'])).stdout.split('\n').some(line=>line.includes('pid='+app.pid+',')&&/:(443|25|465|587)\s/.test(line));
 const vars=await readEnvironment(path.join(root,'luxipanel-backend.env.json'));
 let scheduled=false;
 try{const jobs=JSON.parse(await readFile(path.join(vars.LUXIPANEL_CONFIG_DIR||'/etc/luxipanel','cron/ai-agents.json'),'utf8'));
 scheduled=Object.values(jobs).some(job=>job.lastStatus==='running'&&Date.now()-Date.parse(job.lastRunAt)<36*3600000);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(sockets||children||outgoing||scheduled){await save('waiting','existing_connections_or_work');process.exit(0);}
}
const configFile=path.join(root,'store.json'),previousConfig=await readFile(configFile);
let switched=false;
try{
 if(app){await exec('/usr/bin/node',[fileURLToPath(new URL('./switch-pm2.mjs',import.meta.url)),'luxipanel-backend',candidates,state,'200','/api/health'],{maxBuffer:2*1024*1024});switched=true;}
 else await exec('systemctl',['--user','is-enabled','backend-demand-luxipanel-backend.socket']);
 await exec('/usr/bin/node',[fileURLToPath(new URL('./install-panel.mjs',import.meta.url)),root,snapshot,'--activate'],{maxBuffer:2*1024*1024});
 await save('complete','cold_start_verified_and_schedules_activated');
 await exec('systemctl',['--user','disable','--now','backend-demand-panel-cutover.timer']);
 console.log('panel_demand_cutover_complete');
}catch(error){
 if(String(error.stderr||'').includes('application_has_active_connections')){await save('waiting','new_connection_arrived');process.exit(0);}
 if(switched){
  await exec('systemctl',['--user','disable','--now','backend-clock-panel-scan.timer']).catch(()=>{});
  await writeFile(configFile,previousConfig,{mode:0o600});
  await exec('systemctl',['--user','restart','backend-demand-dispatcher.service']);
  await exec('systemctl',['--user','disable','--now','backend-demand-luxipanel-backend.socket']);
  await exec('systemctl',['--user','stop','backend-demand-luxipanel-backend.service']);
  await exec(pm2,['start',path.join(state,'luxipanel-backend.restore.json'),'--only','luxipanel-backend'],{maxBuffer:2*1024*1024});
  await exec(pm2,['save']);
 }
 await save('failed','cutover_requires_review');
 await exec('systemctl',['--user','disable','--now','backend-demand-panel-cutover.timer']);
 console.error('panel_demand_cutover_failed_review_private_receipt');process.exitCode=1;
}
