import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({exec:vi.fn(),owned:vi.fn(),assert:vi.fn(),retire:vi.fn()}));
vi.mock('./provider.service.js',()=>({providerService:{ownedAccount:m.owned,assertOperation:m.assert}}));vi.mock('./deployment-provider.service.js',()=>({deploymentProviderService:{retire:m.retire}}));
import {providerStorageInventory,purgeProviderStorage} from './provider-storage-inventory.js';
const account='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000002',revision='a'.repeat(64),provider={} as any;
beforeEach(()=>{vi.clearAllMocks();m.owned.mockResolvedValue({account:{id:12},executor:{exec:m.exec}});m.exec.mockResolvedValue({exitCode:0,stdout:JSON.stringify({version:1,items:[{id:project,projectId:project,bytes:8192,revision,kind:'runtime'}]})});});
describe('provider storage inventory and purge',()=>{
 it('uses only a provider-owned account and finite helper command',async()=>{expect((await providerStorageInventory(provider,account)).items[0]?.bytes).toBe(8192);expect(m.assert).toHaveBeenCalledWith(provider,'usage.read');expect(m.owned).toHaveBeenCalledWith(provider,account);expect(m.exec.mock.calls[0]?.[0]).toContain('storage-inventory list');});
 it('rejects foreign accounts before executing or retiring',async()=>{m.owned.mockRejectedValue(Error('not_found'));await expect(purgeProviderStorage(provider,account,project,revision)).rejects.toThrow('not_found');expect(m.exec).not.toHaveBeenCalled();expect(m.retire).not.toHaveBeenCalled();});
 it('rejects a changed inventory before retiring the application',async()=>{await expect(purgeProviderStorage(provider,account,project,'b'.repeat(64))).rejects.toThrow('storage_item_changed');expect(m.retire).not.toHaveBeenCalled();});
 it('requires write permission and confirms physical removal after retirement',async()=>{expect(await purgeProviderStorage(provider,account,project,revision)).toEqual({deleted:true});expect(m.assert).toHaveBeenCalledWith(provider,'deployments.write');expect(m.retire).toHaveBeenCalledWith(provider,account,project);expect(m.exec.mock.calls[1]?.[0]).toContain('storage-inventory purge');});
 it('never substitutes zero usage for a failed probe or claims a failed purge succeeded',async()=>{m.exec.mockResolvedValue({exitCode:1,stdout:'{}'});await expect(providerStorageInventory(provider,account)).rejects.toThrow('storage_inventory_unavailable');});
});
