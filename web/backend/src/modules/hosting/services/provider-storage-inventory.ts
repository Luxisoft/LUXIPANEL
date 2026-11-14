import { z } from 'zod';
import { quoteArg } from '../../../shared/executor/quote.js';
import { ConflictError, ServiceUnavailableError } from '../../../shared/errors/index.js';
import type { HostingProvider } from '../models/provider.model.js';
import { providerService } from './provider.service.js';
import { deploymentProviderService } from './deployment-provider.service.js';
const item=z.object({id:z.string().uuid(),projectId:z.string().uuid(),bytes:z.number().int().nonnegative(),revision:z.string().regex(/^[a-f0-9]{64}$/),kind:z.literal('runtime')});
export async function providerStorageInventory(provider:HostingProvider,accountRef:string){
 providerService.assertOperation(provider,'usage.read');
 const {account,executor}=await providerService.ownedAccount(provider,z.string().uuid().parse(accountRef));
 const result=await executor.exec(`sudo -n /usr/lib/luxipanel/storage-inventory list ${quoteArg(String(account.id))}`,{timeoutMs:60000});
 if(result.exitCode!==0)throw new ServiceUnavailableError('storage_inventory_unavailable');
 return z.object({version:z.literal(1),items:z.array(item)}).parse(JSON.parse(result.stdout));
}
export async function purgeProviderStorage(provider:HostingProvider,accountRef:string,projectId:string,revision:string){
 providerService.assertOperation(provider,'deployments.write');z.string().uuid().parse(projectId);
 const before=await providerStorageInventory(provider,accountRef),row=before.items.find(i=>i.id===projectId);
 if(row&&row.revision!==revision)throw new ConflictError('storage_item_changed');
 const {account,executor}=await providerService.ownedAccount(provider,accountRef);
 await deploymentProviderService.retire(provider,accountRef,projectId);
 const result=await executor.exec(`sudo -n /usr/lib/luxipanel/storage-inventory purge ${quoteArg(String(account.id))} ${quoteArg(projectId)}`,{timeoutMs:130000});
 if(result.exitCode!==0)throw new ServiceUnavailableError('storage_purge_not_confirmed');
 return {deleted:true};
}
