// SPDX-License-Identifier: AGPL-3.0-only
/** Shared Files/row-menu placement. Popovers stay inside their controller scope. */
export function showContextMenu(
  menu: HTMLElement,
  point: {
    clientX: number;
    clientY: number;
  },
  onClose?: () => void,
): () => void {
  const doc = menu.ownerDocument,
    win = doc.defaultView!;
  doc.dispatchEvent(new Event("lxp:context-menu:opening"));
  menu.classList.remove("hidden");
  menu.style.position = "fixed";
  menu.style.inset = "auto";
  menu.style.margin = "0";
  menu.style.maxHeight = "calc(100dvh - 12px)";
  menu.style.maxWidth = "calc(100vw - 12px)";
  menu.style.overflowY = "auto";
  try {
    menu.showPopover?.();
  } catch {
    /* Older browsers keep the fixed-position fallback. */
  }
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(point.clientX, win.innerWidth - rect.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(point.clientY, win.innerHeight - rect.height - 6))}px`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      menu.hidePopover?.();
    } catch {}
    menu.classList.add("hidden");
    cleanup();
    onClose?.();
  };
  const outside = (e: Event) => {
    if (!menu.contains(e.target as Node)) close();
  };
  const scroll = (e: Event) => {
    if (!menu.contains(e.target as Node)) close();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = items.indexOf(doc.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      items[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : ((index < 0 ? (e.key === "ArrowUp" ? 0 : -1) : index) +
                (e.key === "ArrowUp" ? -1 : 1) +
                items.length) %
              items.length
      ]?.focus();
    }
    if (e.key === "Tab") close();
  };
  const cleanup = () => {
    doc.removeEventListener("pointerdown", outside, true);
    doc.removeEventListener("scroll", scroll, true);
    doc.removeEventListener("keydown", key, true);
    doc.removeEventListener("lxp:context-menu:opening", close);
    win.removeEventListener("resize", close);
  };
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("scroll", scroll, true);
  doc.addEventListener("keydown", key, true);
  doc.addEventListener("lxp:context-menu:opening", close);
  win.addEventListener("resize", close);
  return close;
}
