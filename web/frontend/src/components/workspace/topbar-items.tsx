// SPDX-License-Identifier: AGPL-3.0-only
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type TopbarItemRecord = { home: HTMLElement; node: HTMLElement };
const records = new WeakMap<HTMLElement, TopbarItemRecord>();

/** React owns the portal contents; layout moves only their stable host. */
export function TopbarItem({ children, target }: { children: ReactNode; target?: HTMLElement }) {
  const home = useRef<HTMLSpanElement>(null);
  const [host] = useState(() => typeof document === "undefined" ? null : document.createElement("div"));
  useLayoutEffect(() => {
    if (!host) return;
    const marker = target ? document.createElement("span") : home.current!;
    marker.hidden = true;
    marker.dataset.topbarItemHome = "";
    host.dataset.topbarItem = "";
    records.set(marker, { home: marker, node: host });
    if (target) target.append(marker);
    marker.after(host);
    return () => { records.delete(marker); host.remove(); if (target) marker.remove(); };
  }, [host, target]);
  return <>{!target && <span ref={home} hidden data-topbar-item-home />}{host && createPortal(children, host)}</>;
}

/** Native owners are already independent nodes and keep their scope when moved. */
export function collectTopbarItems(content: HTMLElement): TopbarItemRecord[] {
  const result: TopbarItemRecord[] = [];
  const registered = new Set([...content.querySelectorAll<HTMLElement>("[data-topbar-item-home]")].map(home => records.get(home)?.node));
  function visit(parent: HTMLElement) {
    for (const child of [...parent.children] as HTMLElement[]) {
      if (child.classList.contains("lxp-rubber-thumb")) continue;
      if (child.hasAttribute("data-topbar-item") && registered.has(child)) continue;
      if (child.hasAttribute("data-topbar-item-home")) {
        const record = records.get(child);
        if (record) {
          // A native controller may have restored a hidden section's control.
          // Its old header placeholder must not pull it out of that section.
          if (!content.parentElement?.contains(record.node)) {
            records.delete(child); child.remove(); record.node.removeAttribute("data-topbar-item");
          } else result.push(record);
        }
        continue;
      }
      if (child.classList.contains("lxp-module-native-controls") || child.hasAttribute("data-topbar-search") || [...child.attributes].some(a => a.name.startsWith("data-module-header-") && a.name.endsWith("-slot"))) { visit(child); continue; }
      const marker = document.createElement("span");
      marker.hidden = true; marker.dataset.topbarItemHome = "";
      child.before(marker); child.dataset.topbarItem = "";
      const record = { home: marker, node: child };
      records.set(marker, record); result.push(record);
    }
  }
  visit(content);
  return result;
}
