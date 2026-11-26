import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({link:{} as any,locked:false,failFinal:false,apply:vi.fn()}));
vi.mock('../repositories/provider.repository.js',()=>({providerRepository:{findAccount:vi.fn(async(provider:string,external:string)=>provider==='provider'&&external==='account'?{...m.link}:null),updateAccount:vi.fn(async(_id:string,patch:any)=>{if(m.failFinal&&patch.storageRevision){m.failFinal=false;throw Error('write_failed');}Object.assign(m.link,patch);return m.link;})}}));
vi.mock('../../../shared/redis/index.js',()=>({getRedis:()=>({set:async()=>{if(m.locked)return null;m.locked=true;return 'OK';},eval:async()=>{m.locked=false;}})}));
vi.mock('./hosting.service.js',()=>({hostingService:{findById:async()=>({id:12,username:'hp0123456789abcdef0123',homeRoot:'/home/hp0123456789abcdef0123',notes:'LUXIPANEL_PROVIDER:provider:account'})}}));
vi.mock('./provider-storage.js',()=>({readProviderStorage:async()=>({usedBytes:100,nativeQuota:true}),applyProviderStorage:m.apply}));
import {providerService} from './provider.service.js';
const provider={id:'provider',targetId:'local'} as any;
beforeEach(()=>{m.link={id:'link',providerId:'provider',externalAccountId:'account',targetId:'local',accountId:12};m.locked=false;m.failFinal=false;m.apply.mockReset().mockResolvedValue(undefined);});
describe('durable native capacity ownership',()=>{
 it('retains an uncertain kernel quota in the public reservation and recovers the same revision',async()=>{
  m.failFinal=true;
  await expect(providerService.setStorage(provider,'account',{revision:0,capacityBytes:1024})).rejects.toThrow('write_failed');
  expect(await providerService.storage(provider,'account')).toMatchObject({capacityBytes:1024,pendingCapacityBytes:1024,revision:0});
  expect(await providerService.setStorage(provider,'account',{revision:0,capacityBytes:1024})).toMatchObject({capacityBytes:1024,pendingCapacityBytes:null,revision:1});
  expect(await providerService.setStorage(provider,'account',{revision:0,capacityBytes:1024})).toMatchObject({revision:1});
  expect(m.apply).toHaveBeenCalledTimes(2);
 });
 it('rejects stale revisions and a foreign account without applying a quota',async()=>{
  await expect(providerService.setStorage(provider,'account',{revision:2,capacityBytes:1024})).rejects.toThrow('revision_conflict');
  await expect(providerService.setStorage(provider,'foreign',{revision:0,capacityBytes:1024})).rejects.toThrow('not found');expect(m.apply).not.toHaveBeenCalled();
 });
 it('serializes competing capacity changes',async()=>{
  const results=await Promise.allSettled([1024,2048].map(capacityBytes=>providerService.setStorage(provider,'account',{revision:0,capacityBytes})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(m.apply).toHaveBeenCalledTimes(1);
 });
});
