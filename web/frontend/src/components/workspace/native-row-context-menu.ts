// SPDX-License-Identifier: AGPL-3.0-only
import { showContextMenu } from "@/lib/context-menu";
/** Keep native row handlers connected to their controller while removing their cells. */
export function mountNativeRowContextMenus(root: HTMLElement, actionLabel: string): () => void {
  const rows = new WeakMap<HTMLTableRowElement, HTMLButtonElement[]>();
  const indices = new WeakMap<HTMLTableElement, number>();
  const menu = document.createElement("div");
  menu.className = "hidden lxp-row-context-menu";
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "menu");
  root.append(menu);
  let close: (() => void) | undefined;
  const known = new Set([
    "forwards-tbody",
    "disk-usage-tbody",
    "contacts-list-body",
    "mail-track-delivery-tbody",
  ]);
  const scan = () => {
    if (close && !root.querySelector("[data-native-context-active]")) {
      close();
      close = undefined;
    }
    for (const table of root.querySelectorAll<HTMLTableElement>("table")) {
      if (table.closest("[data-table-id]") || table.hasAttribute("data-infinite-files")) continue;
      const bodies = [...table.querySelectorAll<HTMLTableSectionElement>(":scope > tbody")];
      const bodyRows = bodies.flatMap((body) => [
        ...body.querySelectorAll<HTMLTableRowElement>(":scope > tr"),
      ]);
      const isKnown = bodies.some((body) => known.has(body.id));
      const headers = [...table.querySelectorAll<HTMLTableCellElement>("thead th")];
      let index = headers.findIndex((th) => th.textContent?.trim() === actionLabel);
      if (index < 0 && isKnown && !indices.has(table)) {
        const actionCell = bodyRows
          .flatMap((row) => [...row.children])
          .find((cell) => cell.querySelector("button") && !cell.querySelector("input,select,textarea"));
        if (actionCell) index = [...actionCell.parentElement!.children].indexOf(actionCell);
      }
      if (index >= 0 && (isKnown || bodyRows.some((row) => row.children[index]?.querySelector("button")))) {
        indices.set(table, index);
        headers[index]?.remove();
      } else index = indices.get(table) ?? -1;
      if (index < 0) continue;
      for (const row of bodyRows) {
        const cells = [...row.querySelectorAll<HTMLTableCellElement>(":scope > td")];
        if (rows.has(row)) continue;
        if (cells.length === 1 && cells[0].colSpan > 1) {
          cells[0].colSpan = table.querySelectorAll("thead th").length || Math.max(1, cells[0].colSpan - 1);
          rows.set(row, []);
          continue;
        }
        const cell = cells[index];
        if (!cell) continue;
        if (!cell.querySelector("button")) {
          if (cell.colSpan > 1) cell.colSpan = Math.max(1, cell.colSpan - 1);
          continue;
        }
        const buttons = [...cell.querySelectorAll<HTMLButtonElement>("button")];
        const holder = document.createElement("span");
        holder.hidden = true;
        holder.style.display = "none";
        holder.dataset.rowMenuOriginal = "";
        while (cell.firstChild) holder.append(cell.firstChild);
        cell.remove();
        row.querySelector("td")?.append(holder);
        rows.set(row, buttons);
        if (buttons.length) row.tabIndex = 0;
      }
    }
  };
  const open = (event: MouseEvent | KeyboardEvent) => {
    const target = event.target as Element;
    if (target.closest("input:not([type=checkbox]),textarea,[contenteditable=true]")) return;
    const row = target.closest<HTMLTableRowElement>("tr");
    if (!row) return;
    const buttons = rows
      .get(row)
      ?.filter(
        (button) => !button.hidden && !button.classList.contains("hidden") && button.style.display !== "none",
      );
    if (!buttons?.length) return;
    event.preventDefault();
    event.stopPropagation();
    close?.();
    (row.closest<HTMLElement>("dialog[open]") ?? root).append(menu);
    menu.replaceChildren();
    for (const original of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.className = "ctx-item";
      button.disabled = original.disabled;
      const icon = original.querySelector("i");
      if (icon) button.append(icon.cloneNode(true));
      const label = document.createElement("span");
      label.textContent =
        original.textContent?.trim() || original.getAttribute("aria-label") || original.title || actionLabel;
      button.append(label);
      if (original.className.includes("destructive")) button.classList.add("text-destructive");
      button.onclick = () => {
        close?.();
        if (row.isConnected && !original.disabled) original.click();
      };
      menu.append(button);
    }
    row.dataset.nativeContextActive = "true";
    const rect = row.getBoundingClientRect();
    close = showContextMenu(
      menu,
      "clientX" in event && (event.clientX || event.clientY)
        ? event
        : { clientX: rect.left + 12, clientY: rect.top + rect.height / 2 },
      () => {
        delete row.dataset.nativeContextActive;
        if (menu.contains(document.activeElement) && row.isConnected) row.focus();
      },
    );
    if (!("clientX" in event)) menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) open(event);
  };
  const observer = new MutationObserver((records) => {
    const active = root.querySelector<HTMLElement>("[data-native-context-active]");
    let node: HTMLElement | null = active;
    while (node) {
      if (
        node.hidden ||
        node.classList.contains("hidden") ||
        node.getAttribute("aria-hidden") === "true" ||
        (node.tagName === "DIALOG" && !node.hasAttribute("open"))
      ) {
        close?.();
        close = undefined;
        break;
      }
      node = node.parentElement;
    }
    if (root.hidden || root.getAttribute("aria-hidden") === "true") {
      close?.();
      close = undefined;
    }
    if (records.some((r) => (r.target as Element).closest?.("tbody"))) {
      close?.();
      close = undefined;
    }
    scan();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden", "aria-hidden", "class", "open"],
  });
  scan();
  root.addEventListener("contextmenu", open);
  root.addEventListener("keydown", key);
  return () => {
    observer.disconnect();
    close?.();
    menu.remove();
    root.removeEventListener("contextmenu", open);
    root.removeEventListener("keydown", key);
  };
}
