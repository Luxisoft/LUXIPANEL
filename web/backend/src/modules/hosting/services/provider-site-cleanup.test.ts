import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({site:vi.fn(), account:vi.fn(), read:vi.fn(), remove:vi.fn(), deleted:vi.fn(), set:vi.fn(), eval:vi.fn(), target:vi.fn(), vault:vi.fn()}));
vi.mock('../repositories/provider.repository.js',()=>({providerRepository:{findSite:m.site,findAccount:m.account,deleteSite:m.deleted}}));
vi.mock('../../nginx/services/nginx-sites.service.js',()=>({nginxSitesService:{readRaw:m.read,deleteSite:m.remove}}));
vi.mock('../../../shared/redis/index.js',()=>({getRedis:()=>({set:m.set,eval:m.eval})}));
vi.mock('../../servers/repositories/targets.repository.js',()=>({targetsRepository:{getView:m.target}}));
vi.mock('../../../shared/executor/vault-executor.js',()=>({getVaultExecutor:m.vault}));
import {providerService} from './provider.service.js';
const provider={id:'owner',targetId:'different-default'} as never;
beforeEach(()=>{vi.resetAllMocks();m.site.mockResolvedValue({id:'binding',externalAccountId:'account',domain:'form.example.com',targetId:'recorded'});m.set.mockResolvedValue('OK');m.target.mockResolvedValue({enabled:true,hostFingerprint:'pinned'});m.vault.mockResolvedValue({});m.read.mockResolvedValue('# LUXIPANEL_PROVIDER owner:account:gh:project:forms:hash\nconfig');});
it('cleans a stored owned binding after the account has disappeared',async()=>{
 await providerService.unbindSite(provider,'account','gh:project:forms:hash');
 expect(m.account).not.toHaveBeenCalled();expect(m.vault).toHaveBeenCalledWith('recorded');expect(m.remove).toHaveBeenCalledWith({},'form.example.com');expect(m.deleted).toHaveBeenCalledWith('binding');
});
it('does not delete another account or altered nginx content',async()=>{
 await expect(providerService.unbindSite(provider,'foreign','gh:project:forms:hash')).rejects.toThrow();
 m.read.mockResolvedValue('# foreign configuration');
 await expect(providerService.unbindSite(provider,'account','gh:project:forms:hash')).rejects.toThrow('NGINX');
 expect(m.remove).not.toHaveBeenCalled();expect(m.deleted).not.toHaveBeenCalled();
});
