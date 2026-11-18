// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import type { ControllerScope } from "./controller-scope";
import { moduleElementVisible } from "./module-table-layout";

/** Native controller inputs retain their identity, listeners and scoped lookup. */
export function mountNativeModuleControls(scope: ControllerScope): () => void {
  if (hasOwnModuleLayout(scope.root.dataset.internalModule)) return () => {};
  const slot = scope.root.closest(".lxp-workspace-quick-drawer")?.querySelector<HTMLElement>("[data-module-header-native-slot]");
  if (!slot) return () => {};
  const owner = document.createElement("div");
  owner.className = "lxp-module-native-controls";
  slot.append(owner);
  const release = scope.registerOwnedRoot(owner);
  const homes = new Map<HTMLElement, Comment>();
  const movedLabels = new Set<HTMLLabelElement>();
  const selectors: Record<string, string> = {
    expo: "#expo-bh-status, #expo-bh-platform, #expo-bh-profile, #expo-bh-daterange, #expo-bh-clear, #expo-env-filter-text, #expo-env-filter-scope, #expo-env-filter-visibility, #expo-env-filter-env, #expo-env-add",
    cron: "#cron-user, #jobs-filter, #cron-text-filter",
    cloudflare: "#cf-zone",
  };
  const extra: Record<string, string> = {
    "repository-store": "#repo-search-control, #repo-catalog-filters",
    modules: "#mod-search, #category-filter-select, #status-filter-select",
    obsidian: "#obs-search",
    terminal: "#btn-new-tab, #terminal-status, #btn-reconnect",
    files: "#files-search, #btn-search-mode, #btn-search-case, #btn-search-replace",
  };
  const selector = [selectors[scope.root.dataset.internalModule || ""], extra[scope.root.dataset.internalModule || ""], "[data-module-topbar-region]"].filter(Boolean).join(",");
  const owners = new Map<string, HTMLElement>([["filters", owner]]);
  // Overflow controls remain part of this scope after leaving their inline owner.
  const popups = scope.root.closest(".lxp-workspace-quick-drawer")?.querySelectorAll<HTMLElement>("[data-topbar-content]") ?? [];
  const releases = [release];
  let popupReleases: Array<() => void> = [];
  function destination(node: HTMLElement) {
    const region = node.dataset.moduleTopbarRegion || (node.id === "terminal-status" ? "controls" : node.querySelector("#files-search") ? "search" : node.matches("input[type=search], #expo-env-filter-text, #cron-text-filter, #repo-search, #mod-search, #obs-search") ? "search" : node.matches("#btn-search-mode, #btn-search-case, #btn-search-replace") ? "filters" : node.matches("button") ? "native-actions" : "filters");
    if (owners.has(region)) return owners.get(region)!;
    const target = scope.root.closest(".lxp-workspace-quick-drawer")?.querySelector(`[data-module-header-${region}-slot]`);
    if (!target) return owner;
    const container = document.createElement("div");
    container.className = "lxp-module-native-controls";
    target.append(container); owners.set(region, container);
    releases.push(scope.registerOwnedRoot(container));
    return container;
  }
  const desktopTerminal = scope.root.dataset.internalModule === "terminal" ? window.matchMedia("(min-width: 1025px)") : null;
  const sync = () => {
    if (scope.root.hidden) { for (const dispose of popupReleases) dispose(); popupReleases = []; }

    for (const [node, home] of homes) if (home.parentElement) {
      const show = (!desktopTerminal || desktopTerminal.matches) && !scope.root.hidden && moduleElementVisible(home.parentElement, scope.root);
      if (show && node.parentElement !== destination(node)) destination(node).append(node);
      if (!show && [...owners.values()].includes(node.parentElement!)) home.after(node);
    }
    for (const [node, home] of homes) if (home.parentElement) {
      const parent = home.parentElement;
      for (const label of parent.querySelectorAll<HTMLLabelElement>(":scope > label[for]")) if (label.htmlFor === node.id) {
        label.setAttribute("data-module-native-label", ""); movedLabels.add(label);
        if (!node.hasAttribute("aria-label") && !node.hasAttribute("aria-labelledby")) node.setAttribute("aria-label", label.textContent?.trim() ?? "");
      }
      parent.toggleAttribute("data-module-native-source-row", ![...parent.children].some(child => !child.hasAttribute("data-module-native-label") && moduleElementVisible(child as HTMLElement, scope.root)));
    }
    if (!selector || (desktopTerminal && !desktopTerminal.matches)) return;
    for (const input of scope.root.querySelectorAll<HTMLElement>(selector)) {
      const node = ["expo-bh-daterange", "proc-mode-live", "files-search"].includes(input.id) ? input.parentElement! : input;
      if (homes.has(node) || node.closest("dialog, [data-module-toolbar]")) continue;
      const home = document.createComment("module-control-home");
      node.before(home); homes.set(node, home);
    }
    for (const [node, home] of homes) if (home.parentElement && !scope.root.hidden && moduleElementVisible(home.parentElement, scope.root)) destination(node).append(node);
    if (!scope.root.hidden && homes.size && !popupReleases.length) popupReleases = [...popups].map(node => scope.registerOwnedRoot(node));
  };
  const observer = new MutationObserver(sync);
  observer.observe(scope.root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  desktopTerminal?.addEventListener("change", sync);
  sync();
  return () => { observer.disconnect(); desktopTerminal?.removeEventListener("change", sync); for (const label of movedLabels) label.removeAttribute("data-module-native-label"); for (const [node, home] of homes) { home.parentElement?.removeAttribute("data-module-native-source-row"); home.replaceWith(node); } for (const dispose of popupReleases) dispose(); for (const releaseOwner of releases) releaseOwner(); for (const container of owners.values()) container.remove(); };
}
