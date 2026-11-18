// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import { collectTopbarItems, type TopbarItemRecord } from "./topbar-items";
import { fitTopbarItems } from "./topbar-overflow";
import { useLayoutEffect, useRef, useId, type ReactNode, type RefObject } from "react";

/** Keep an open dropdown in the viewport, including after a drawer resize. */
function positionPopover(node: HTMLElement, trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const values = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(360, window.innerWidth - 16) - 8))}px`,
    top: `${rect.bottom + 6}px`,
    maxHeight: `${Math.max(80, window.innerHeight - rect.bottom - 14)}px`,
  };
  for (const key of ["left", "top", "maxHeight"] as const) if (node.style[key] !== values[key]) node.style[key] = values[key];
}

/** Slot containers stay mounted when compacted, preserving native and React state. */
export function ModuleTopbarGroup({ kind, icon, label, children }: {
  kind: string; icon: string; label: string; children: ReactNode;
}) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const node = content.current!;
    const toggle = () => {
      const open = node.matches(":popover-open");
      trigger.current?.setAttribute("aria-expanded", String(open));
      if (!open && node.contains(document.activeElement)) trigger.current?.focus();
    };
    const beforeToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed" && node.contains(document.activeElement)) trigger.current?.focus();
    };
    node.addEventListener("beforetoggle", beforeToggle);
    node.addEventListener("toggle", toggle);
    return () => { node.removeEventListener("toggle", toggle); node.removeEventListener("beforetoggle", beforeToggle); };
  }, []);
  return <div data-topbar-group={kind} onKeyDown={event => {
    if (kind !== "tabs" || event.defaultPrevented || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !(event.target as Element).closest('[role="tab"]')) return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')].filter(tab => tab.getClientRects().length);
    const index = tabs.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    next?.focus(); next?.click();
  }}>
    <button ref={trigger} type="button" data-topbar-trigger aria-label={label} title={label}
      aria-expanded="false" aria-controls={id} aria-haspopup="dialog"
      onClick={() => {
        const node = content.current!;
        if (node.matches(":popover-open")) { node.hidePopover(); return; }
        positionPopover(node, trigger.current!);
        node.showPopover();
        node.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled), a[href], summary")?.focus();
      }}><i className={`ti ti-${icon}`} aria-hidden="true" /><span data-topbar-trigger-label>{label}</span></button>
    <div data-topbar-inline data-rubber-tabs={kind === "tabs" ? "" : undefined}>{children}</div>
    <div ref={content} id={id} data-topbar-content data-rubber-tabs={kind === "tabs" ? "" : undefined} popover="auto" role="dialog" aria-label={label} onClick={event => {
      if (kind === "tabs" && event.nativeEvent.isTrusted && (event.target as Element).closest('[role="tab"]') && content.current?.matches(":popover-open")) {
        content.current.hidePopover(); trigger.current?.focus();
      }
      if (kind === "actions") queueMicrotask(() => {
        const node = content.current;
        if (node?.matches(":popover-open") && node.closest(".lxp-workspace-quick-drawer")?.querySelector("dialog[open]")) node.hidePopover();
      });
    }} />
  </div>;
}

/** Ignore presentation wrappers and closed dropdowns when checking slot occupancy. */
export function hasTopbarContent(root: HTMLElement): boolean {
  if (root.hidden || root.classList.contains("hidden") || root.getAttribute("aria-hidden") === "true") return false;
  if (!root.hasAttribute("popover") && getComputedStyle(root).display === "none") return false;
  if (root.matches('input:not([type="hidden"]),select,textarea,button,a[href],summary,[role="tab"]')) return true;
  const visible = (node: HTMLElement) => {
    for (let item: HTMLElement | null = node; item && item !== root; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (item.hidden || item.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") return false;
      if (item.parentElement instanceof HTMLDetailsElement && !item.parentElement.open && item.tagName !== "SUMMARY") return false;
    }
    return true;
  };
  for (const node of root.querySelectorAll<HTMLElement>('input:not([type="hidden"]),select,textarea,button,a[href],summary,[role="tab"],svg,i.ti')) {
    if (visible(node)) return true;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent?.trim() && node.parentElement && !node.parentElement.closest("script,style") && visible(node.parentElement)) return true;
  }
  return false;
}

export function useUniformTopbar(drawer: RefObject<HTMLElement | null>, activeKey: string | null) {
  useLayoutEffect(() => {
    if (hasOwnModuleLayout(activeKey)) return;
    const header = drawer.current?.matches(".lxp-workspace-quick-header") ? drawer.current : drawer.current?.querySelector<HTMLElement>(".lxp-workspace-quick-header");
    if (!header) return;
    header.setAttribute("data-uniform-topbar", "");
    let frame = 0, disposed = false;
    let previous = new Set<TopbarItemRecord>();
    const observeOptions = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "disabled", "aria-selected", "class", "style", "aria-hidden"] };
    const layout = () => {
      frame = 0;
      if (!header.isConnected || !header.clientWidth) return;
      const focused = header.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      const selection = focused instanceof HTMLInputElement && focused.selectionStart !== null ? [focused.selectionStart, focused.selectionEnd!] : null;
      mutations.disconnect();
      const groups = [...header.querySelectorAll<HTMLElement>("[data-topbar-group]")];
      const recordsByGroup = new Map(groups.map(group => [group, collectTopbarItems(group.querySelector<HTMLElement>("[data-topbar-inline]")!)]));
      const current = new Set([...recordsByGroup.values()].flat());
      for (const item of previous) if (!current.has(item) && !item.home.isConnected && item.node.closest("[data-topbar-content]")) item.node.remove();
      previous = current;
      header.setAttribute("data-topbar-measuring", "");
      for (const node of header.querySelectorAll("[data-topbar-empty]")) node.removeAttribute("data-topbar-empty");
      for (const group of groups) {
        group.dataset.topbarVisible = "true";
        for (const item of recordsByGroup.get(group)!) {
          item.node.style.removeProperty("--topbar-field-width");
          item.node.removeAttribute("data-topbar-grow-item");
          if (item.node.previousSibling !== item.home) item.home.after(item.node);
          item.node.toggleAttribute("data-topbar-empty", !hasTopbarContent(item.node));
          const slot = item.home.closest<HTMLElement>("[data-module-header-search-slot]");
          item.node.toggleAttribute("data-topbar-search-item", !!slot);
        }
      }
      const widths = new Map([...current].map(item => [item, item.node.getBoundingClientRect().width]));
      header.removeAttribute("data-topbar-measuring");
      for (const group of groups) {
        const popup = group.querySelector<HTMLElement>("[data-topbar-content]")!;
        const trigger = group.querySelector<HTMLElement>("[data-topbar-trigger]")!;
        const items = recordsByGroup.get(group)!.filter(item => !item.node.hasAttribute("data-topbar-empty"));
        const gap = parseFloat(getComputedStyle(group).columnGap) || 8;
        const triggerWidth = header.closest(".lxp-workspace-quick-sheet")!.clientWidth <= 400 ? 28 : 32;
        const visible = fitTopbarItems(items.map(item => widths.get(item)!), group.clientWidth, gap, triggerWidth);
        const overflow = items.filter((_, index) => !visible.has(index));
        const inlineItems = items.filter((_, index) => visible.has(index));
        const searches = inlineItems.filter(item => item.node.hasAttribute("data-topbar-search-item"));
        const fields = searches.length ? searches : inlineItems.filter(item =>
          Number(item.node.matches('select,input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])')) + item.node.querySelectorAll('select,input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])').length === 1);
        const growing = group.dataset.topbarGroup === "query" ? fields : [];
        group.toggleAttribute("data-topbar-has-grow", growing.length > 0);
        const used = inlineItems.reduce((sum, item) => sum + widths.get(item)!, 0)
          + Math.max(0, inlineItems.length - 1) * gap + (overflow.length ? triggerWidth + (inlineItems.length ? gap : 0) : 0);
        const spare = Math.max(0, group.getBoundingClientRect().width - used);
        for (const item of growing) {
          item.node.setAttribute("data-topbar-grow-item", "");
          item.node.style.setProperty("--topbar-field-width", `${widths.get(item)! + spare / growing.length}px`);
        }
        group.dataset.topbarVisible = String(items.length > 0);
        group.toggleAttribute("data-compact", overflow.length > 0);
        group.toggleAttribute("data-partial", visible.size > 0 && overflow.length > 0);
        group.toggleAttribute("data-all-overflow", items.length > 0 && visible.size === 0);
        let previousRegion = "";
        for (const item of overflow) {
          const region = [...(item.home.parentElement?.closest('[data-module-header-actions-slot],[data-module-header-tools-slot],[data-module-header-status-slot],[data-module-header-table-actions-slot],[data-module-header-native-actions-slot],[data-module-header-controls-slot],[data-module-header-search-slot],[data-module-header-filters-slot]')?.attributes ?? [])].find(attr => attr.name.startsWith("data-module-header-"))?.name ?? "";
          item.node.toggleAttribute("data-topbar-section-start", !!previousRegion && previousRegion !== region);
          previousRegion = region;
          const control = item.node.matches("button,a") ? item.node : item.node.querySelector<HTMLElement>("button,a,input,select");
          const text = control?.textContent?.trim();
          const label = control?.matches("button,a") && !text ? control.getAttribute("aria-label") || control.getAttribute("title") || "" : "";
          if (item.node.dataset.topbarItemLabel !== label) item.node.dataset.topbarItemLabel = label;
          popup.append(item.node);
        }
        if (!overflow.length && popup.matches(":popover-open")) popup.hidePopover();
        if (popup.matches(":popover-open")) positionPopover(popup, trigger);
      }
      if (focused?.isConnected && focused.getClientRects().length && document.activeElement !== focused) {
        focused.focus({ preventScroll: true });
        if (selection && focused instanceof HTMLInputElement) focused.setSelectionRange(selection[0], selection[1]);
      }
      mutations.observe(header, observeOptions);

    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(layout); };
    const resize = new ResizeObserver(schedule);
    resize.observe(header);
    window.addEventListener("resize", schedule);
    const mutations = new MutationObserver(records => {
      // React Bits paints an inert thumb every animation frame; it does not
      // change the available controls and must not trigger overflow measurement.
      const decoration = (node: Node) => node instanceof Element && !!node.closest(".lxp-rubber-thumb");
      if (records.every(record => decoration(record.target) || record.type === "childList" && [...record.addedNodes, ...record.removedNodes].length > 0 && [...record.addedNodes, ...record.removedNodes].every(decoration))) return;
      cancelAnimationFrame(frame); frame = 0; layout();
    });
    mutations.observe(header, observeOptions);
    void document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      disposed = true;
      window.removeEventListener("resize", schedule);
      resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame);
      for (const node of header.querySelectorAll<HTMLElement>("[data-topbar-content]")) if (node.matches(":popover-open")) node.hidePopover();
      for (const item of previous) if (item.home.isConnected) item.home.after(item.node); else if (item.node.closest("[data-topbar-content]")) item.node.remove();
    };
  }, [drawer, activeKey]);
}
