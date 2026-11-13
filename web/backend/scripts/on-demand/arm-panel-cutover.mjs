import{readFile,writeFile,mkdir,copyFile}from'node:fs/promises';
import{createHash}from'node:crypto';import path from'node:path';import os from'node:os';
import{execFileSync}from'node:child_process';import{unitQuote}from'./units.mjs';
const [root,snapshot,candidates,state]=process.argv.slice(2);
for(const value of[root,snapshot,candidates,state])if(!path.isAbsolute(value||''))throw Error('absolute_cutover_paths_required');
const names=['finish-panel-cutover.mjs','switch-pm2.mjs','install-panel.mjs','panel-clock-client.mjs','units.mjs','environment.mjs'];
const hash=createHash('sha256');for(const name of names)hash.update(await readFile(new URL('./'+name,import.meta.url)));
const release=path.join(root,'releases',hash.digest('hex'));await mkdir(release,{recursive:true,mode:0o700});
for(const name of names)await copyFile(new URL('./'+name,import.meta.url),path.join(release,name));
const units=path.join(os.homedir(),'.config/systemd/user');
await writeFile(path.join(units,'backend-demand-panel-cutover.service'),`[Unit]
Description=One-time panel cutover after current connections finish
[Service]
Type=oneshot
ExecStart=/usr/bin/node ${[path.join(release,'finish-panel-cutover.mjs'),root,snapshot,candidates,state].map(unitQuote).join(' ')}
MemoryMax=128M
CPUQuota=20%
TimeoutStartSec=120
UMask=0077
`);
await writeFile(path.join(units,'backend-demand-panel-cutover.timer'),`[Unit]
Description=Guarded one-time panel migration
[Timer]
OnBootSec=15s
OnUnitActiveSec=60s
[Install]
WantedBy=timers.target
`);
execFileSync('systemctl',['--user','daemon-reload']);
execFileSync('systemctl',['--user','enable','--now','backend-demand-panel-cutover.timer']);
console.log(JSON.stringify({armed:true,keepsExistingConnections:true,release}));
