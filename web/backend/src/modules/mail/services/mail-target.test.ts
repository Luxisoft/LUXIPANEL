// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 LUXISOFT
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executor: { target: { id: "frontend" }, readFile: vi.fn() },
  context: vi.fn(), get: vi.fn(),
}));
vi.mock("../../../shared/executor/index.js", () => ({
  getContextExecutor: mocks.context, runOnPanelHost: (fn: () => unknown) => fn(), LOCAL_TARGET_ID: "local",
}));
vi.mock("../../servers/index.js", () => ({ targetsRepository: { get: mocks.get } }));
vi.mock("../../../config/mail.js", () => ({ mailConfig: { postfix: { vmailbox: "/etc/postfix/vmailbox" } } }));
import { resolveMailTargetHost } from "./mail-target.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.executor.target.id = "frontend";
  mocks.context.mockReturnValue(mocks.executor);
  mocks.get.mockResolvedValue({ host: "198.252.105.131" });
  mocks.executor.readFile.mockResolvedValue("myhostname = mail.luxisoft.com\n");
});

describe("mail target certificate identity", () => {
  it("reads identity from the selected target while preserving its address", async () => {
    await expect(resolveMailTargetHost()).resolves.toEqual({
      targetHost: "198.252.105.131", tlsServername: "mail.luxisoft.com",
    });
    expect(mocks.get).toHaveBeenCalledWith("frontend");
    expect(mocks.executor.readFile).toHaveBeenCalledWith("/etc/postfix/main.cf", "utf8");
  });
  it("does not reuse identity across servers", async () => {
    await resolveMailTargetHost();
    mocks.executor.target.id = "other";
    mocks.get.mockResolvedValue({ host: "203.0.113.8" });
    mocks.executor.readFile.mockResolvedValue("myhostname = mail.other.test\n");
    await expect(resolveMailTargetHost()).resolves.toEqual({
      targetHost: "203.0.113.8", tlsServername: "mail.other.test",
    });
  });
  it("keeps strict existing fallback when target configuration is unreadable", async () => {
    mocks.executor.readFile.mockRejectedValue(new Error("permission denied"));
    await expect(resolveMailTargetHost()).resolves.toEqual({ targetHost: "198.252.105.131" });
  });
  it("keeps local and named targets independent of Postfix configuration", async () => {
    mocks.executor.target.id = "local";
    await expect(resolveMailTargetHost()).resolves.toEqual({});
    mocks.executor.target.id = "frontend";
    mocks.get.mockResolvedValue({ host: "mail.example.test" });
    await expect(resolveMailTargetHost()).resolves.toEqual({ targetHost: "mail.example.test" });
    expect(mocks.executor.readFile).not.toHaveBeenCalled();
  });
  it("fails closed without a selected server or its vault host", async () => {
    mocks.context.mockReturnValue(null);
    await expect(resolveMailTargetHost()).rejects.toMatchObject({ code: "MAIL_NO_SERVER_EXECUTOR" });
    mocks.context.mockReturnValue(mocks.executor);
    mocks.get.mockResolvedValue(null);
    await expect(resolveMailTargetHost()).rejects.toMatchObject({ code: "MAIL_REMOTE_HOST_UNRESOLVED" });
    expect(mocks.executor.readFile).not.toHaveBeenCalled();
  });
});
