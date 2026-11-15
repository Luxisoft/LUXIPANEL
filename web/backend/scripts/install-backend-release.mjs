import {checkSource,verify,policy} from './check-backend-release.mjs';
import {execFileSync} from 'node:child_process';
import {cpSync,renameSync,existsSync} from 'node:fs';
const source=checkSource();const built=verify('dist');
if(source.commit!==built.commit)throw Error('release_commit_mismatch');
// Official redeploy never writes a build into live dist. Lock is held by npm redeploy.
const runtime=policy.runtime,stamp=Date.now()+'-'+process.pid,next=runtime+'/dist.next-'+stamp,previous=runtime+'/dist.prev-'+stamp;
const probe=async()=>{
 const base=process.env.LUXIPANEL_RELEASE_PROBE_BASE,key=process.env.LUXIPANEL_RELEASE_PROBE_KEY,account=process.env.LUXIPANEL_RELEASE_PROBE_ACCOUNT;
 if(!base||!key||!account)throw Error('authenticated_provider_release_probe_required');
 for(const path of ['/capabilities',`/accounts/${encodeURIComponent(account)}/storage`,`/accounts/${encodeURIComponent(account)}/storage/items`]){
  const response=await fetch(base.replace(/\/$/,'')+path,{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});const body=await response.json();
  if(!response.ok||!body.ok)throw Error('provider_release_probe_failed');
  if(path==='/capabilities'&&(body.data.storageMeteringVersion!==1||body.data.storageInventoryVersion!==1))throw Error('provider_storage_contract_missing');
  if(path!=='/capabilities'&&body.data.version!==1)throw Error('provider_storage_response_invalid');
 }
};
// Refuse to restart while a CLI task is running; authenticated CLI sessions on disk are preserved.
try{execFileSync('pgrep',['-u',String(process.getuid()),'-f','codex exec|claude.*--print'],{stdio:'ignore'});throw Error('active_cli_tasks_retry_deploy_later');}catch(error){if(!error.status)throw error;}
await probe();checkSource();cpSync('dist',next,{recursive:true});verify(next);
const restart=()=>execFileSync('node',[runtime+'/scripts/on-demand/restart-app.mjs','luxipanel-backend'],{stdio:'inherit'});
let swapped=false;
try{renameSync(runtime+'/dist',previous);renameSync(next,runtime+'/dist');swapped=true;restart();verify(runtime+'/dist');await probe();}
catch(error){if(existsSync(previous)){if(existsSync(runtime+'/dist'))renameSync(runtime+'/dist',next+'.failed');renameSync(previous,runtime+'/dist');restart();}throw error;}
console.log(JSON.stringify({commit:source.commit,artifactHash:built.artifactHash,backup:previous}));
