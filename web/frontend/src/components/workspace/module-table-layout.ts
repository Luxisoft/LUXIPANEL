// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import { isMixedModuleContent, layoutModuleContent } from "./module-content-layout";
export function moduleElementVisible(node: HTMLElement, root: HTMLElement): boolean {
  for (let item: HTMLElement | null = node; item && item !== root; item = item.parentElement) {
    if (item.hasAttribute("popover") && !item.matches(":popover-open")) return false;
    if (item.hidden || item.classList.contains("hidden") || item.getAttribute("aria-hidden") === "true" || item.style.display === "none") return false;
  }
  return true;
}
export function mountModuleTableLayout(root: HTMLElement, drawer: HTMLElement): () => void {
  if (hasOwnModuleLayout(root.dataset.internalModule)) return () => {};

  const sync = () => {
    if (root.hidden || root.getAttribute("aria-hidden") === "true") return;
    for (const intro of root.querySelectorAll<HTMLElement>("[data-panel-content] > div")) {
      if (intro.querySelector(":scope > h1, :scope > h2") || (intro.children.length <= 2 && intro.querySelector(":scope > div > h2") && !intro.querySelector("input, select, textarea, [data-module-table]"))) intro.setAttribute("data-module-intro", "");
    }
    const table = [...root.querySelectorAll<HTMLElement>("[data-module-table], [data-infinite-files], #rules-list, #jails-list, #jobs-list, #agents-list, [data-panel-content] table")]
      .find(node => !node.closest("dialog, [data-lxp-module-settings], [data-view-settings-modal]") && moduleElementVisible(node, root));
    const mixed = !!table && isMixedModuleContent(root, table);
    const mode = table ? mixed ? "mixed" : "table" : "content";
    const chain = new Set<HTMLElement>();
    // Keep the native table formatting context; flex belongs to its viewport.
    if (table && (!mixed || !table.matches('table'))) for (let node: HTMLElement | null = table.matches('table') ? table.parentElement : table; node && node !== root; node = node.parentElement) { chain.add(node); if (mixed) break; }
    for (const old of root.querySelectorAll<HTMLElement>("[data-module-table-path]")) if (!chain.has(old)) old.removeAttribute("data-module-table-path");
    for (const node of chain) if (!node.hasAttribute("data-module-table-path")) node.setAttribute("data-module-table-path", "");
    drawer.toggleAttribute("data-module-table-layout", !!table && !mixed);
    layoutModuleContent(root, mode);
  };
  const observer = new MutationObserver(records => {
    const decoration = (node: Node) => node instanceof Element && !!node.closest(".lxp-rubber-thumb");
    const relevant = records.some(record => {
      if (decoration(record.target)) return false;
      if (record.type === "childList") return [...record.addedNodes, ...record.removedNodes].some(node => !decoration(node));
      if (record.attributeName === "style") {
        const old = record.oldValue ?? "", element = record.target as HTMLElement;
        return ["display", "visibility"].some(property => (old.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1]?.trim() ?? "") !== element.style.getPropertyValue(property));
      }
      return true;
    });
    if (relevant) sync();
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
  sync();
  return () => { observer.disconnect(); if (!root.hidden) drawer.removeAttribute("data-module-table-layout"); for (const node of root.querySelectorAll("[data-module-table-path]")) node.removeAttribute("data-module-table-path"); };
}
