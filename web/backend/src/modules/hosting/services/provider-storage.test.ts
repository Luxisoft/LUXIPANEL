import {describe,it,expect,vi} from 'vitest';
vi.mock('../../../shared/remote-cache/apply-steps.js',()=>({applyStepsOrThrow:vi.fn()}));
import {readProviderStorage,applyProviderStorage} from './provider-storage.js';
const account={id:12,username:'hp0123456789abcdef0123',homeRoot:'/home/hp0123456789abcdef0123'} as any;
describe('provider-owned storage',()=>{
 it('keeps legacy measurements until migration and never hides a failed probe',async()=>{
  const exec=vi.fn(async(command:string)=>({exitCode:0,stdout:command.includes('storage-helper')?'{}':command.includes('python3')?'17':'1234550\t/home/example\n'}));
  expect(await readProviderStorage({exec} as any,account)).toMatchObject({usedBytes:1234567,nativeQuota:false});
  expect(exec.mock.calls[1]![0]).toContain('--exclude=');
  expect(exec.mock.calls[2]![0]).toContain('/storage/volumes');
  exec.mockResolvedValueOnce({exitCode:1,stdout:'0'});
  await expect(readProviderStorage({exec} as any,account)).rejects.toThrow('provider_storage_measurement_unavailable');
 });
 it('uses kernel accounting once mounted and rejects malformed accounting',async()=>{
  const exec=vi.fn(async()=>({exitCode:0,stdout:JSON.stringify({ready:true,usedBytes:8192,capacityBytes:65536})}));
  expect(await readProviderStorage({exec} as any,account)).toMatchObject({usedBytes:8192,nativeQuota:true,kernelCapacityBytes:65536});
  expect(exec).toHaveBeenCalledTimes(1);
  exec.mockResolvedValueOnce({exitCode:0,stdout:JSON.stringify({ready:true,usedBytes:-1})});
  await expect(readProviderStorage({exec} as any,account)).rejects.toThrow('provider_storage_measurement_unavailable');
 });
 it('rejects an escaped identity before running a command',async()=>{
  const exec=vi.fn();await expect(readProviderStorage({exec} as any,{...account,homeRoot:'/home/other'})).rejects.toThrow('Invalid provider storage identity');expect(exec).not.toHaveBeenCalled();
 });
 it.each([12,'12'])('delegates only the validated account and finite capacity to the installed helper (%s)',async(id)=>{
  const {applyStepsOrThrow}=await import('../../../shared/remote-cache/apply-steps.js');
  await applyProviderStorage({} as any,{...account,id},64*1024**2);
  const args=vi.mocked(applyStepsOrThrow).mock.calls.at(-1)![1];
  expect(args.steps).toEqual([{type:'sh',argv:['/usr/lib/luxipanel/storage-helper','prepare','12','67108864'],sudo:true,timeoutMs:600000}]);
 });
});
