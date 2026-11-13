import type { Executor } from '../../../shared/executor/types.js';
import { quoteArg } from '../../../shared/executor/quote.js';
import { ForbiddenError, ServiceUnavailableError } from '../../../shared/errors/index.js';
import type { HostingAccount } from '../models/hosting-account.model.js';
import { hostingRuntimeService } from './hosting-runtime.service.js';
import { PROJECT_QUOTA_SETUP } from './hosting-project-quota.js';
import { applyStepsOrThrow } from '../../../shared/remote-cache/apply-steps.js';
import type { MutationStep } from '../../../shared/remote-cache/submit-mutation.js';

function identity(account: HostingAccount) {
 if(!/^hp[a-f0-9]{20}$/.test(account.username)||account.homeRoot!==`/home/${account.username}`||!Number.isSafeInteger(account.id)||account.id<1||account.id>647483647)throw new ForbiddenError('Invalid provider storage identity');
}
/** Apparent bytes, no rounded MB and no silent zero on a failed probe. */
export async function readProviderStorage(executor:Executor,account:HostingAccount) {
 identity(account);
 const result=await executor.exec(`sudo -n du -sb -- ${quoteArg(account.homeRoot)}`,{timeoutMs:60000});
 const raw=result.stdout.trim().split(/\s+/)[0]??'';
 if(result.exitCode!==0||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new ServiceUnavailableError('provider_storage_measurement_unavailable');
 const caps=await hostingRuntimeService.capabilities(executor);
 return {usedBytes:Number(raw),nativeQuota:caps.disk,measuredAt:new Date().toISOString()};
}
/** Quota-only mutation: never reapply the jail or terminate customer processes. */
export async function applyProviderStorage(executor:Executor,account:HostingAccount,capacityBytes:number) {
 identity(account);
 if(!Number.isSafeInteger(capacityBytes)||capacityBytes<1024||capacityBytes%1024)throw new ForbiddenError('Invalid provider storage capacity');
 const caps=await hostingRuntimeService.capabilities(executor);
 if(!caps.disk)throw new ServiceUnavailableError('provider_native_storage_quota_unavailable');
 const project=1500000000+account.id;
 const steps:MutationStep[]=[{type:'sh',argv:['python3','-c',PROJECT_QUOTA_SETUP,account.homeRoot,String(project)],sudo:true}];
 if(caps.quota.xfsQuota)steps.push({type:'sh',argv:['xfs_quota','-x','-c',`limit -p bhard=${capacityBytes/1024}k ${project}`,caps.quota.mount],sudo:true});
 else steps.push({type:'sh',argv:['setquota','-P',String(project),'0',String(capacityBytes/1024),'0','0',caps.quota.mount],sudo:true});
 await applyStepsOrThrow(executor,{module:'hosting',collection:'accounts',op:'update',steps,refresh:[],notConfirmedMessage:'Provider storage quota not confirmed',notConfirmedCode:'HOSTING_JAIL_NOT_CONFIRMED'});
}
