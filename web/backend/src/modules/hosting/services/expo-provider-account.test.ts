import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({update:vi.fn(),get:vi.fn(),viewer:vi.fn(),projectOwner:vi.fn()}));
vi.mock("../../../config/env.js",()=>({env:{LOG_LEVEL:"silent",NODE_ENV:"test",CREDENTIAL_VAULT_KEY:"00".repeat(32)}}));
vi.mock("../../../shared/executor/index.js",()=>({pathExists:vi.fn(),quoteArg:vi.fn(),runWithExecutor:vi.fn()}));
vi.mock("../../../shared/logger/index.js",()=>({createModuleLogger:()=>({warn:vi.fn(),error:vi.fn()})}));
vi.mock("../../../config/paths.js",()=>({panelConfigDir:()=>"/test"}));
vi.mock("./provider.service.js",()=>({providerService:{ownedAccount:async()=>({account:{status:"active"},executor:{}})}}));
vi.mock("../../../shared/data-store/index.js",()=>({dataStore:()=>m}));
vi.mock("../../../shared/redis/index.js",()=>({getRedis:()=>({set:async()=>"OK",eval:async()=>1})}));
vi.mock("../../expo/services/expo-api.service.js",()=>({expoApiService:m}));
vi.mock("../../../shared/expo-provider-bridge.js",()=>({expoProviderToken:async()=>"managed"}));
import {expoProviderService} from "./expo-provider.service.js";
const args=[{id:"provider"} as never,"00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002"] as const;
describe("app Expo account",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({projectId:"project"});m.viewer.mockResolvedValue({accounts:["team"]});m.projectOwner.mockResolvedValue("team");});
 it("inspects memberships without writing credentials",async()=>{
  expect(await expoProviderService.expoAccount(...args,{mode:"inspect",token:"example"})).toEqual({accounts:["team"]});
  expect(m.update).not.toHaveBeenCalled();
 });
 it("retains the EAS project and stores only a sealed credential",async()=>{
  expect(await expoProviderService.expoAccount(...args,{mode:"connect",owner:"team",token:"example"})).toEqual({expoOwner:"team"});
  expect(m.projectOwner).toHaveBeenCalledWith("example","project");
  expect(m.update.mock.calls[0]?.[1].expoSecret).not.toContain("example");
 });
 it("refuses an incompatible managed account during disconnect",async()=>{
  m.projectOwner.mockResolvedValue(null);
  await expect(expoProviderService.expoAccount(...args,{mode:"managed"})).rejects.toThrow();
  expect(m.update).not.toHaveBeenCalled();
 });
});
