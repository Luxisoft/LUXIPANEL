import { expect, it, vi } from "vitest";
vi.mock("./module-registry", () => ({ MODULE_REGISTRY: { nginx: { route: "/panel/nginx" } } }));
import { describeModule } from "./module-descriptor";
it.each(["perf", "performance", "status", "tab-perf", "tab-status"])("opens legacy NGINX %s links in the unified summary", value => {
  const module = describeModule(`/panel/nginx?workspaceView=${value}`, "https://panel.test");
  expect(module?.url.searchParams.get("workspaceView")).toBe("overview");
});
it("keeps DNS aliases and log navigation compatible", () => {
  expect(describeModule("/panel/dns?tab=status", "https://panel.test")?.url.pathname).toBe("/panel/nginx");
  expect(describeModule("/panel/dns?tab=status", "https://panel.test")?.url.searchParams.get("tab")).toBe("overview");
  expect(describeModule("/panel/nginx?workspaceView=logs", "https://panel.test")?.url.searchParams.get("workspaceView")).toBe("logs");
});
