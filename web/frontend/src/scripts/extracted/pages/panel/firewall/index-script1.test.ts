import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FirewallView from "@/components/workspace/views/pages_panel_firewall_index";
import { createViewContext, InternalViewContext } from "@/components/workspace/view-context";
import firewall from "@/i18n/es/firewall";
import components from "@/i18n/es/components";
import panelLayout from "@/i18n/es/panelLayout";
import { mountModuleTopbar } from "@/components/workspace/module-topbar";

const state = vi.hoisted(() => ({
  get: vi.fn(), installed: true, audit: true, preferences: new Map<string, string>(),
}));
vi.mock("/scripts/extracted/lib/api-client.js", () => ({ api: {
  get: (...args: any[]) => state.get(...args), put: vi.fn(), post: vi.fn(), delete: vi.fn(),
} }));
vi.mock("/scripts/extracted/lib/live-data.js", () => ({ watchModuleData: vi.fn() }));
vi.mock("/scripts/extracted/lib/install-modal.js", () => ({ runInstall: vi.fn(), bindInstallModalClose: vi.fn() }));
vi.mock("/scripts/extracted/lib/assistant-request.js", () => ({ requestAssistant: vi.fn() }));
vi.mock("/scripts/extracted/lib/scoped-preferences.js", () => ({
  readScopedPreference: (_module: string, key: string, fallback: string) => state.preferences.get(key) ?? fallback,
  writeScopedPreference: (_module: string, key: string, value: string) => state.preferences.set(key, value),
}));

function render(search = "?workspaceView=rules", admin = true) {
  const url = new URL("http://localhost:3000/panel/firewall" + search);
  history.replaceState(null, "", url);
  const context = createViewContext({ user: { kind: admin ? "admin" : "user", modules: ["firewall"], permissions: {} } as any,
    locale: "es", messages: { firewall, components, panelLayout }, url, params: {}, scope: { document, window } as any });
  document.body.innerHTML = renderToStaticMarkup(createElement(InternalViewContext.Provider,
    { value: context }, createElement(FirewallView)));
}
async function start(search?: string, admin = true) {
  render(search, admin);
  await import("./index-script1");
  await vi.waitFor(() => expect(document.getElementById("fw-status-label")?.textContent).toBe("Activo"));
}
const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();
const next = (id: string) => click(`#${id} button:last-child`);
const visible = (id: string) => !document.getElementById(id)!.classList.contains("hidden");

beforeEach(() => {
  vi.resetModules();
  state.installed = true; state.audit = true; state.preferences.clear();
  state.get.mockReset().mockImplementation(async (url: string) => {
    if (url === "/api/firewall/status") return { ok: true, data: { ufw: { installed: state.installed, active: true, logging: "on (low)" } } };
    if (url === "/api/firewall/rules") return { ok: true, data: Array.from({ length: 27 }, (_, i) => ({ number: i + 1, to: `port-${i + 1}`, from: "any", action: "ALLOW" })) };
    if (url === "/api/firewall/fail2ban/jails") return { ok: true, data: [{ name: "sshd", currentlyBanned: 24, bannedIPs: Array.from({ length: 24 }, (_, i) => `192.0.2.${i + 1}`) }] };
    if (url === "/api/security-audit/reports") return state.audit ? { ok: true, data: [] } : { ok: false, status: 404 };
    return { ok: true, data: [] };
  });
});
afterEach(() => { document.dispatchEvent(new Event("astro:before-swap")); document.body.innerHTML = ""; });

it("keeps all three panels mounted and shows only the requested tab, including embedded entry", async () => {
  await start("?workspaceView=rules&embed=1");
  expect(document.querySelectorAll("[data-firewall-tab]")).toHaveLength(3);
  expect(visible("fw-rules-panel")).toBe(true);
  expect(visible("fw-fail2ban-panel")).toBe(false);
  expect(visible("security-audit-section")).toBe(false);
  click("#fw-tab-fail2ban");
  expect(visible("fw-rules-panel")).toBe(false);
  expect(visible("fw-fail2ban-panel")).toBe(true);
  click("#fw-tab-audit");
  expect(visible("security-audit-section")).toBe(true);
  expect(visible("fw-fail2ban-panel")).toBe(false);
});

it("pages rules by ten and resets the current page when a filter changes", async () => {
  await start();
  const rows = () => document.querySelectorAll("#rules-list button[onclick^='deleteRule']");
  await vi.waitFor(() => expect(rows()).toHaveLength(10));
  next("rules-pagination");
  expect(rows()[0]?.getAttribute("onclick")).toBe("deleteRule(11)");
  next("rules-pagination");
  expect(rows()).toHaveLength(7);
  const search = document.getElementById("fw-rule-search") as HTMLInputElement;
  search.value = "port-1"; search.dispatchEvent(new Event("input"));
  expect(rows()).toHaveLength(10);
  expect(rows()[0]?.getAttribute("onclick")).toBe("deleteRule(1)");
  next("rules-pagination"); expect(rows()).toHaveLength(1);
  expect(rows()[0]?.getAttribute("onclick")).toBe("deleteRule(19)");
});

it("pages every blocked IP by ten while retaining its jail and unban action", async () => {
  await start("?workspaceView=fail2ban");
  const rows = () => document.querySelectorAll("[data-fail2ban-entry]");
  await vi.waitFor(() => expect(rows()).toHaveLength(10));
  next("jails-pagination"); expect(rows()).toHaveLength(10);
  expect(rows()[0]?.textContent).toContain("192.0.2.11");
  next("jails-pagination"); expect(rows()).toHaveLength(4);
  expect(rows()[3]?.querySelector("button")?.getAttribute("onclick")).toBe("unbanIp('sshd', '192.0.2.24')");
});

it("falls back to rules when audit is unavailable and respects the audit permission gate", async () => {
  state.audit = false;
  await start("?workspaceView=audit");
  await vi.waitFor(() => expect(visible("fw-rules-panel")).toBe(true));
  expect(visible("fw-tab-audit")).toBe(false);
  render("?workspaceView=audit", false);
  expect(document.getElementById("fw-tab-audit")).toBeNull();
  expect(document.getElementById("security-audit-section")).toBeNull();
});

it("keeps Fail2ban usable when UFW is not installed", async () => {
  state.installed = false;
  render("?workspaceView=fail2ban");
  await import("./index-script1");
  await vi.waitFor(() => expect(document.querySelectorAll("[data-fail2ban-entry]")).toHaveLength(10));
  expect(visible("fw-fail2ban-panel")).toBe(true);
  expect(visible("fw-status-card")).toBe(false);
  expect(visible("fw-not-installed")).toBe(false);
  click("#fw-tab-rules"); expect(visible("fw-not-installed")).toBe(true);
});

it("keeps status and only the selected tab's actions live in the topbar without duplicate IDs", async () => {
  await start();
  const root = document.createElement("div"); root.dataset.internalModule = "firewall";
  root.append(...document.body.childNodes);
  const drawer = document.createElement("div");
  drawer.innerHTML = '<header><div data-module-header-tabs-slot></div><div data-module-header-controls-slot></div><div data-module-header-actions-slot></div></header>';
  drawer.append(root); document.body.append(drawer);
  const dispose = mountModuleTopbar(root, drawer);
  try {
    const summary = () => drawer.querySelector("[data-module-header-controls-slot]")!;
    const actions = () => drawer.querySelector("[data-module-header-actions-slot]")!;
    expect(summary().textContent).toContain("Activo");
    expect(summary().textContent).toContain("Logging: on (low)");
    expect(document.querySelectorAll("#fw-status-label")).toHaveLength(1);
    expect(root.querySelector("#fw-status-card")?.hasAttribute("data-module-topbar-source")).toBe(true);
    expect(actions().textContent).toContain("Desactivar");
    expect(actions().textContent).toContain("Sugerir reglas");
    const fail2ban = [...drawer.querySelectorAll<HTMLButtonElement>("header [role='tab']")].find(tab => tab.textContent === "Fail2ban")!;
    fail2ban.click();
    await vi.waitFor(() => expect(actions().textContent).toContain("Sugerir bloqueos"));
    expect(actions().textContent).not.toContain("Sugerir reglas");
    expect(visible("fw-fail2ban-panel")).toBe(true);
  } finally { dispose(); }
  expect(drawer.querySelector("[data-module-header-controls-slot]")?.childElementCount).toBe(0);
  expect(root.querySelector("#fw-status-card")?.hasAttribute("data-module-topbar-source")).toBe(false);
});
