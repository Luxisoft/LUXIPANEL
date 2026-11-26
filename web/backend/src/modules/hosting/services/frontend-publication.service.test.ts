import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  ownedAccount: vi.fn(async () => ({account:{status:'active'}})), frontendExecutor: vi.fn(),
  localWrite: vi.fn(), localUnlink: vi.fn(), exec: vi.fn(),
  remoteRead: vi.fn(), remoteWrite: vi.fn(), remoteExec: vi.fn(), set: vi.fn(async () => "OK"), eval: vi.fn(),
}));
vi.mock("./provider.service.js", () => ({ providerService: { ownedAccount: mocks.ownedAccount, frontendExecutor: mocks.frontendExecutor } }));
vi.mock("../../../shared/redis/index.js", () => ({ getRedis: () => ({ set: mocks.set, eval: mocks.eval }) }));
vi.mock("../../../shared/executor/index.js", () => ({
  quoteArg: (x: string) => `'${x}'`, localExecutor: {
    readFile: async (file:string) => { if(file==='/etc/machine-id')return "a".repeat(32); if (!mocks.record) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return JSON.stringify(mocks.record); },
    mkdir: vi.fn(), readdir: async () => [], writeFile: mocks.localWrite, unlink: mocks.localUnlink, exec: mocks.exec,
  },
}));
const { frontendPublicationService: service, frontendPublicationSchema } = await import("./frontend-publication.service.js");
const provider = { id: "212e003c-6c26-4419-8aee-dc2b9a6b9cb2", targetId: "local", frontendTargetId: "front" } as never;
const account = "a24e871b-d9af-4113-ad82-19bbbc596fe1", project = "f8207daa-42ab-4e13-9985-f48a7213350b";
const bytes = Buffer.from("verified archive");
const request = { versionId: "4419fffd-a519-4baf-bc90-c71f4e083714", sha256: createHash("sha256").update(bytes).digest("hex"), hosts: ["site.example.com"] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.record = null; mocks.ownedAccount.mockResolvedValue({account:{status:'active'}});
  mocks.set.mockResolvedValue("OK"); mocks.exec.mockResolvedValue({ exitCode: 0 });
  mocks.remoteExec.mockImplementation(async(command:string)=>({exitCode:0,stdout:command.includes("cat /etc/machine-id")?"b".repeat(32):JSON.stringify({removed:true,sha256:request.sha256,bytes:bytes.length})}));
  mocks.remoteRead.mockResolvedValue(bytes.toString('base64'));
  mocks.frontendExecutor.mockResolvedValue({ readFile:mocks.remoteRead, mkdir: vi.fn(), writeFile: mocks.remoteWrite, exec: mocks.remoteExec });
});
describe("frontend publication target ownership", () => {
  it("validates archive bytes before reaching another server", async () => {
    await expect(service.publish(provider, account, project, request, Buffer.from("different"))).rejects.toThrow("inválido");
    expect(mocks.frontendExecutor).not.toHaveBeenCalled();
  });
  it("does not accept paths, commands or migration adoption from the API", () => {
    for (const key of ["adoptionHashes", "path", "command", "targetId", "backendOnlyComponents"])
      expect(frontendPublicationSchema.safeParse({ ...request, [key]: "injected" }).success).toBe(false);
  });
  it("publishes only on the configured frontend executor", async () => {
    await service.publish(provider, account, project, request, bytes);
    expect(mocks.frontendExecutor).toHaveBeenCalledWith(provider);
    expect(mocks.remoteWrite).toHaveBeenCalledWith(expect.stringContaining("artifact.zip"), bytes, expect.anything());
    expect(mocks.localWrite).toHaveBeenCalledWith(expect.stringContaining(".next"), expect.stringContaining('"targetId":"front"'), expect.anything());
  });
  it("stages a suspended account without a publish command", async () => {
    mocks.ownedAccount.mockResolvedValue({account:{status:'suspended'}});
    await service.stage(provider, account, project, {...request, component:'forms'}, bytes);
    expect(mocks.remoteExec.mock.calls.some(([command])=>String(command).includes("frontend-publication stage"))).toBe(true);
    expect(mocks.localWrite).toHaveBeenCalledWith(expect.stringContaining('.next'), expect.stringContaining('"active":false'), expect.anything());
    expect(mocks.remoteWrite).toHaveBeenCalledWith(expect.stringContaining('request.json'), expect.stringContaining('"component":"forms"'), expect.anything());
    await expect(service.publish(provider, account, project, request, bytes)).rejects.toThrow('suspendida');
  });
  it("cannot stage over an active publication", async () => {
    mocks.record = {...request, targetId:'front', active:true};
    await expect(service.stage(provider, account, project, request, bytes)).rejects.toThrow('activa');
    expect(mocks.frontendExecutor).not.toHaveBeenCalled();
  });
  it('retains no interface ZIP on the panel and reads reconfiguration from the pinned frontend', async () => {
    mocks.record={...request, targetId:'front', active:true};
    await service.reconfigure(provider,account,project,['site.example.com']);
    expect(mocks.remoteRead).toHaveBeenCalledWith(expect.stringMatching(/^\/var\/www\/luxisoft\/clients\/published-sites\/[a-f0-9]{64}\/[a-f0-9-]+-[a-f0-9]{64}\/artifact\.zip$/), "base64");
    expect(mocks.localWrite.mock.calls.some(([file])=>String(file).endsWith('.zip'))).toBe(false);
  });
  it("removes from the recorded server after the preference changes", async () => {
    mocks.record = { ...request, targetId: "previous-front" };
    await service.remove(provider, account, project);
    expect(mocks.frontendExecutor).toHaveBeenCalledWith(provider, "previous-front");
    expect(mocks.localUnlink).toHaveBeenCalledOnce();
  });
  it('attests only an inactive matching split and retains it on retries', async () => {
    mocks.record={...request,active:false,targetId:'front',apiRoutes:['/api']};
    await service.confirmBackendSplit(provider,account,project,request.versionId,['app']);
    expect(mocks.localWrite).toHaveBeenCalledWith(expect.stringContaining('.next'),expect.stringContaining('"backendOnlyComponents":["app"]'),expect.anything());
    mocks.record={...mocks.record,backendOnlyComponents:['app']};
    await service.stage(provider,account,project,request,bytes);
    expect(mocks.localWrite.mock.calls.at(-1)?.[1]).toContain('"backendOnlyComponents":["app"]');
    mocks.record={...mocks.record,active:true};
    await expect(service.confirmBackendSplit(provider,account,project,request.versionId,['app'])).rejects.toThrow('pendiente');
  });
  it("rejects silently moving an existing publication", async () => {
    mocks.record = { ...request, targetId: "previous-front" };
    await expect(service.publish(provider, account, project, request, bytes)).rejects.toThrow("migración");
    expect(mocks.frontendExecutor).not.toHaveBeenCalled();
  });
  it("retains the deletion record on an SSH/helper failure", async () => {
    mocks.record = { ...request, targetId: "front" };
    mocks.remoteExec.mockResolvedValue({ exitCode: 1, stdout: "" });
    await expect(service.remove(provider, account, project)).rejects.toThrow("publicación frontend");
    expect(mocks.localUnlink).not.toHaveBeenCalled();
  });
});

describe('frontend artifact placement',()=>{
 it('fails closed for an absent target and a backend alias',async()=>{
  await expect(service.requireTarget({...provider,frontendTargetId:undefined} as never)).rejects.toThrow('frontend_target_required');
  mocks.remoteExec.mockResolvedValue({exitCode:0,stdout:'a'.repeat(32)});
  await expect(service.requireTarget(provider)).rejects.toThrow('frontend_target_unavailable_or_backend');
 });
 it('stores only metadata locally and uploads immutable bytes remotely',async()=>{
  expect(await service.putArtifact(provider,account,project,request.versionId,'web',bytes)).toEqual({sha256:request.sha256,bytes:bytes.length});
  expect(mocks.remoteExec.mock.calls.some(([command])=>String(command).includes('frontend-publication artifact'))).toBe(true);
  expect(mocks.localWrite).not.toHaveBeenCalled();
 });
 it('verifies hashes and reads binary artifacts with explicit base64',async()=>{
  expect(await service.readArtifact(provider,account,project,request.versionId,'web',{sha256:request.sha256,bytes:bytes.length})).toEqual(bytes);
  expect(mocks.remoteRead).toHaveBeenCalledWith(expect.stringContaining('/artifacts/'), 'base64');
  mocks.remoteRead.mockResolvedValue(Buffer.alloc(bytes.length).toString('base64'));
  await expect(service.readArtifact(provider,account,project,request.versionId,'web',{sha256:request.sha256,bytes:bytes.length})).rejects.toThrow('frontend_artifact_invalid');
 });
});
