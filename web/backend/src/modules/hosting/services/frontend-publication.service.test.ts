import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  ownedAccount: vi.fn(async () => ({account:{status:'active'}})), frontendExecutor: vi.fn(),
  localWrite: vi.fn(), localUnlink: vi.fn(), exec: vi.fn(),
  remoteWrite: vi.fn(), remoteExec: vi.fn(), set: vi.fn(async () => "OK"), eval: vi.fn(),
}));
vi.mock("./provider.service.js", () => ({ providerService: { ownedAccount: mocks.ownedAccount, frontendExecutor: mocks.frontendExecutor } }));
vi.mock("../../../shared/redis/index.js", () => ({ getRedis: () => ({ set: mocks.set, eval: mocks.eval }) }));
vi.mock("../../../shared/executor/index.js", () => ({
  quoteArg: (x: string) => `'${x}'`, localExecutor: {
    readFile: async () => { if (!mocks.record) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return JSON.stringify(mocks.record); },
    mkdir: vi.fn(), readdir: async () => [], writeFile: mocks.localWrite, unlink: mocks.localUnlink, exec: mocks.exec,
  },
}));
const { frontendPublicationService: service, frontendPublicationSchema } = await import("./frontend-publication.service.js");
const provider = { id: "212e003c-6c26-4419-8aee-dc2b9a6b9cb2", targetId: "local", frontendTargetId: "front" } as never;
const account = "a24e871b-d9af-4113-ad82-19bbbc596fe1", project = "f8207daa-42ab-4e13-9985-f48a7213350b";
const bytes = Buffer.from("verified archive");
const request = { versionId: "4419fffd-a519-4baf-bc90-c71f4e083714", sha256: createHash("sha256").update(bytes).digest("hex"), hosts: ["site.example.com"] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.record = null;
  mocks.set.mockResolvedValue("OK"); mocks.exec.mockResolvedValue({ exitCode: 0 });
  mocks.remoteExec.mockResolvedValue({ exitCode: 0, stdout: JSON.stringify({ removed: true }) });
  mocks.frontendExecutor.mockResolvedValue({ mkdir: vi.fn(), writeFile: mocks.remoteWrite, exec: mocks.remoteExec });
});
describe("frontend publication target ownership", () => {
  it("validates archive bytes before reaching another server", async () => {
    await expect(service.publish(provider, account, project, request, Buffer.from("different"))).rejects.toThrow("inválido");
    expect(mocks.frontendExecutor).not.toHaveBeenCalled();
  });
  it("does not accept paths, commands or migration adoption from the API", () => {
    for (const key of ["adoptionHashes", "path", "command", "targetId"])
      expect(frontendPublicationSchema.safeParse({ ...request, [key]: "injected" }).success).toBe(false);
  });
  it("publishes only on the configured frontend executor", async () => {
    await service.publish(provider, account, project, request, bytes);
    expect(mocks.frontendExecutor).toHaveBeenCalledWith(provider, "front");
    expect(mocks.remoteWrite).toHaveBeenCalledWith(expect.stringContaining("artifact.zip"), bytes, expect.anything());
    expect(mocks.localWrite).toHaveBeenCalledWith(expect.stringContaining(".next"), expect.stringContaining('"targetId":"front"'), expect.anything());
  });
  it("removes from the recorded server after the preference changes", async () => {
    mocks.record = { ...request, targetId: "previous-front" };
    await service.remove(provider, account, project);
    expect(mocks.frontendExecutor).toHaveBeenCalledWith(provider, "previous-front");
    expect(mocks.localUnlink).toHaveBeenCalledOnce();
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
