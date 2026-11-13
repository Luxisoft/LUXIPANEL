import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  exec: vi.fn(),
  findByUsername: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../../shared/executor/context.js", () => ({
  getContextExecutor: () => ({ exec: state.exec }),
}));
vi.mock("../../auth/repositories/panel-user.repository.js", () => ({ panelUserRepository: state }));

import { systemAccountsService } from "./system-accounts.service.js";

const alice = { id: 1, username: "alice", managedBySystem: true, enabled: true, displayName: "Alice", passwordHash: "SYSTEM_AUTH_MANAGED_EXTERNALLY" };
const removed = { ...alice, id: 2, username: "removed" };
const passwd = "root:x:0:0:root:/root:/usr/sbin/nologin\nalice:x:1000:1000:Alice:/home/alice:/bin/bash";
const result = (stdout: string, exitCode = 0) => ({ stdout, stderr: "", exitCode });

beforeEach(() => {
  vi.resetAllMocks();
  state.findByUsername.mockResolvedValue(alice);
  state.findById.mockResolvedValue(alice);
  state.findAll.mockResolvedValue([alice, removed]);
  state.exec.mockImplementation(async (cmd: string) => {
    if (cmd.includes("getent 'passwd'")) return result(passwd);
    if (cmd.includes("getent 'group'")) return result("alice:x:1000:");
    return result("alice P");
  });
});

describe("system account sync preserves accounts when enumeration fails", () => {
  it.each([
    ["empty output", "", 0],
    ["failed enumeration", "", 1],
    ["partial failed enumeration", passwd, 2],
    ["malformed enumeration", passwd + "\ntruncated:record", 0],
  ])("aborts without any writes for %s", async (_label, stdout, code) => {
    state.exec.mockResolvedValue(result(stdout, code));
    await expect(systemAccountsService.syncAllUsersToDatabase()).rejects.toThrow();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("still disables confirmed missing users after a valid enumeration", async () => {
    await systemAccountsService.syncAllUsersToDatabase();
    expect(state.update).toHaveBeenCalledWith(1, expect.objectContaining({ enabled: true, systemUid: 1000 }));
    expect(state.update).toHaveBeenCalledWith(2, expect.objectContaining({ enabled: false }));
  });

  it("still respects the Linux locked status", async () => {
    state.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes("getent 'passwd'")) return result(passwd);
      if (cmd.includes("getent 'group'")) return result("alice:x:1000:");
      return result("alice L");
    });
    await systemAccountsService.syncAllUsersToDatabase();
    expect(state.update).toHaveBeenCalledWith(1, expect.objectContaining({ enabled: false }));
  });
});
