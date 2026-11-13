import {describe,it,expect,vi} from 'vitest';
vi.mock('./hosting-runtime.service.js',()=>({hostingRuntimeService:{capabilities:vi.fn(async()=>({disk:false}))}}));
vi.mock('../../../shared/remote-cache/apply-steps.js',()=>({applyStepsOrThrow:vi.fn()}));
import {readProviderStorage,applyProviderStorage} from './provider-storage.js';
const account={id:12,username:'hp0123456789abcdef0123',homeRoot:'/home/hp0123456789abcdef0123'} as any;
describe('provider-owned storage',()=>{
 it('returns exact bytes and never treats a failed probe as empty storage',async()=>{
  const exec=vi.fn(async()=>({exitCode:0,stdout:'1234567\t/home/hp0123456789abcdef0123\n'}));
  expect(await readProviderStorage({exec} as any,account)).toMatchObject({usedBytes:1234567,nativeQuota:false});
  exec.mockResolvedValueOnce({exitCode:1,stdout:'0'});
  await expect(readProviderStorage({exec} as any,account)).rejects.toThrow('provider_storage_measurement_unavailable');
 });
 it('rejects an escaped identity before running a command',async()=>{
  const exec=vi.fn();await expect(readProviderStorage({exec} as any,{...account,homeRoot:'/home/other'})).rejects.toThrow('Invalid provider storage identity');expect(exec).not.toHaveBeenCalled();
 });
 it('fails closed when native quotas are unavailable and never reapplies the runtime',async()=>{
  await expect(applyProviderStorage({} as any,account,1024*1024)).rejects.toThrow('provider_native_storage_quota_unavailable');
  const {applyStepsOrThrow}=await import('../../../shared/remote-cache/apply-steps.js');expect(applyStepsOrThrow).not.toHaveBeenCalled();
 });
 it.each([12,'12'])('applies a finite project quota without restarting the jail or touching another home (%s)',async(id)=>{
  const {hostingRuntimeService}=await import('./hosting-runtime.service.js');
  vi.mocked(hostingRuntimeService.capabilities).mockResolvedValueOnce({disk:true,quota:{xfsQuota:false,extProjectQuota:true,mount:'/'}} as any);
  const {applyStepsOrThrow}=await import('../../../shared/remote-cache/apply-steps.js');
  await applyProviderStorage({} as any,{...account,id},64*1024**2);
  const args=vi.mocked(applyStepsOrThrow).mock.calls.at(-1)![1];
  expect(args.steps).toHaveLength(2);
  expect(args.steps[1]).toMatchObject({argv:['setquota','-P','1500000012','0','65536','0','0','/']});
  expect(JSON.stringify(args.steps)).not.toMatch(/pkill|systemctl|usermod/);
 });
});
