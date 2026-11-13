// SPDX-License-Identifier: AGPL-3.0-only
/** Keep source controls in the Files controller's scope. Mirror complete rows
 * so close buttons and keyboard navigation survive alongside the tab labels. */
export function mountFilesTopbar(root: HTMLElement, tabsSlot: HTMLElement, actionsSlot: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const sources = new Set<HTMLElement>();
  tabsSlot.dataset.filesTopbar = "";
  tabsSlot.setAttribute("role", "presentation");
  const sync = () => {
    if (disposed) return;
    const previousFocus = tabsSlot.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.filesHeaderControl : undefined;
    const scroll = new Map([...tabsSlot.querySelectorAll<HTMLElement>("[role='tablist']")]
      .map((list) => [list.getAttribute("aria-label"), list.scrollLeft]));
    const copies: HTMLElement[] = [];
    for (const row of root.querySelectorAll<HTMLElement>("[data-files-header-row]")) {
      sources.add(row);
      row.setAttribute("data-module-topbar-source", "");
      const copy = row.cloneNode(true) as HTMLElement;
      copy.removeAttribute("data-module-topbar-source");
      // The tree is hidden on narrow screens; its header follows the same rule.
      copy.className = `lxp-files-header-${row.dataset.filesHeaderRow}`;
      const originals = [row, ...row.querySelectorAll<HTMLElement>("*")];
      const mirrors = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
      mirrors.forEach((element, index) => {
        element.removeAttribute("id");
        for (const attribute of [...element.attributes]) {
          if (/^(on|data-lxp-handler-)/.test(attribute.name)) element.removeAttribute(attribute.name);
        }
        const original = originals[index];
        if (element.matches("button")) {
          element.dataset.filesHeaderControl = original.id || original.dataset.managerId || `close:${original.dataset.managerClose}`;
          element.addEventListener("click", () => original.click());
          element.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            original.dispatchEvent(new KeyboardEvent("keydown", { key: event.key, bubbles: true, cancelable: true }));
            // Source handlers restore focus in their hidden row. Transfer it to
            // the corresponding visible control on the next synchronization.
            sync();
            const id = row.querySelector<HTMLElement>('[data-manager-id][aria-selected="true"]')?.dataset.managerId;
            if (id) [...tabsSlot.querySelectorAll<HTMLElement>("[data-manager-id]")]
              .find((tab) => tab.dataset.managerId === id)?.focus();
          });
        }
      });
      copies.push(copy);
    }
    tabsSlot.replaceChildren(...copies);
    for (const list of tabsSlot.querySelectorAll<HTMLElement>("[role='tablist']")) {
      list.scrollLeft = scroll.get(list.getAttribute("aria-label")) ?? 0;
    }
    if (previousFocus) [...tabsSlot.querySelectorAll<HTMLElement>("[data-files-header-control]")]
      .find((button) => button.dataset.filesHeaderControl === previousFocus)?.focus({ preventScroll: true });
  };
  const observer = new MutationObserver(() => {
    if (timer || disposed) return;
    timer = setTimeout(() => { timer = undefined; sync(); }, 60);
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["class", "hidden", "aria-selected", "aria-disabled", "disabled", "title"] });
  actionsSlot.replaceChildren();
  sync();
  return () => {
    disposed = true;
    clearTimeout(timer);
    observer.disconnect();
    for (const row of sources) row.removeAttribute("data-module-topbar-source");
    tabsSlot.replaceChildren();
    delete tabsSlot.dataset.filesTopbar;
  };
}
