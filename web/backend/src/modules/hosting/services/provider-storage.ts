import type { Executor } from '../../../shared/executor/types.js';
import { quoteArg } from '../../../shared/executor/quote.js';
import { ForbiddenError, ServiceUnavailableError } from '../../../shared/errors/index.js';
import type { HostingAccount } from '../models/hosting-account.model.js';
import { applyStepsOrThrow } from '../../../shared/remote-cache/apply-steps.js';
import type { MutationStep } from '../../../shared/remote-cache/submit-mutation.js';

function identity(account: HostingAccount) {
 const id=Number(account.id);
 if(String(id)!==String(account.id)||!/^hp[a-f0-9]{20}$/.test(account.username)||account.homeRoot!==`/home/${account.username}`||!Number.isSafeInteger(id)||id<1||id>647483647)throw new ForbiddenError('Invalid provider storage identity');
 return id;
}
/** Apparent bytes, no rounded MB and no silent zero on a failed probe. */
export async function readProviderStorage(executor:Executor,account:HostingAccount) {
 const id=identity(account);
 const native=await executor.exec(`if test -x /usr/lib/luxipanel/storage-helper; then sudo -n /usr/lib/luxipanel/storage-helper status ${id}; else printf '{}'; fi`,{timeoutMs:60000});
 if(native.exitCode!==0)throw new ServiceUnavailableError('provider_storage_measurement_unavailable');
 let state:{ready?:boolean;available?:boolean;usedBytes?:number;capacityBytes?:number};
 try {state=JSON.parse(native.stdout);}catch{throw new ServiceUnavailableError('provider_storage_measurement_unavailable');}
 if(state.ready){
  if(!Number.isSafeInteger(state.usedBytes)||state.usedBytes!<0||!Number.isSafeInteger(state.capacityBytes))throw new ServiceUnavailableError('provider_storage_measurement_unavailable');
  return {usedBytes:state.usedBytes!,nativeQuota:true,kernelCapacityBytes:state.capacityBytes,measuredAt:new Date().toISOString()};
 }
 // Container images and download caches are platform overhead. Persisted
 // database/application volumes live inside the excluded container directory,
 // so measure them separately rather than omitting customer data with images.
 const result=await executor.exec(`sudo -n du -sb ${quoteArg('--exclude='+account.homeRoot+'/.local/share/containers')} ${quoteArg('--exclude='+account.homeRoot+'/.cache')} -- ${quoteArg(account.homeRoot)}`,{timeoutMs:60000});
 const raw=result.stdout.trim().split(/\s+/)[0]??'';
 if(result.exitCode!==0||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new ServiceUnavailableError('provider_storage_measurement_unavailable');
 const probe="import os,sys,subprocess; p=sys.argv[1]\ntry: os.lstat(p)\nexcept FileNotFoundError: print(0)\nelse: print(subprocess.check_output(['du','-sb','--',p],text=True).split()[0])";
 const volumes=await executor.exec(`sudo -n python3 -I -c ${quoteArg(probe)} ${quoteArg(account.homeRoot+'/.local/share/containers/storage/volumes')}`,{timeoutMs:60000});
 const volumeBytes=volumes.stdout.trim();
 if(volumes.exitCode!==0||!/^\d+$/.test(volumeBytes)||!Number.isSafeInteger(Number(raw)+Number(volumeBytes)))throw new ServiceUnavailableError('provider_storage_measurement_unavailable');
 return {usedBytes:Number(raw)+Number(volumeBytes),nativeQuota:state.available===true,measuredAt:new Date().toISOString()};
}
/** Quota-only mutation: never reapply the jail or terminate customer processes. */
export async function applyProviderStorage(executor:Executor,account:HostingAccount,capacityBytes:number) {
 const id=identity(account);
 if(!Number.isSafeInteger(capacityBytes)||capacityBytes<1024||capacityBytes%1024)throw new ForbiddenError('Invalid provider storage capacity');
 const steps:MutationStep[]=[{type:'sh',argv:['/usr/lib/luxipanel/storage-helper','prepare',String(id),String(capacityBytes)],sudo:true,timeoutMs:600000}];
 await applyStepsOrThrow(executor,{module:'hosting',collection:'accounts',op:'update',steps,refresh:[],syncWaitMs:600000,notConfirmedMessage:'Provider storage quota not confirmed',notConfirmedCode:'HOSTING_JAIL_NOT_CONFIRMED'});
}
