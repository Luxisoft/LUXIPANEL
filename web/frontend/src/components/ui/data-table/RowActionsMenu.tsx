// SPDX-License-Identifier: AGPL-3.0-only
import * as React from "react";
import { showContextMenu } from "@/lib/context-menu";
import { useModuleVisibility } from "@/components/workspace/module-visibility";
import type { DataTableRowActionConfig } from "./types";

export function RowActionsMenu({
  trigger,
  point,
  focusFirst,
  actions,
  customContent,
  onSelect,
  onClose,
}: {
  trigger: HTMLElement;
  point: { clientX: number; clientY: number };
  focusFirst: boolean;
  actions: DataTableRowActionConfig[];
  customContent?: React.ReactNode;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const menu = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const visible = useModuleVisibility();

  React.useLayoutEffect(() => {
    if (!visible || !menu.current) return;
    let disposed = false;
    const close = showContextMenu(menu.current, point, () => {
      if (disposed) return;
      if (menu.current?.contains(document.activeElement) && trigger.isConnected) trigger.focus();
      closeRef.current();
    });
    if (focusFirst) menu.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const observer = new MutationObserver(() => {
      let node: HTMLElement | null = trigger;
      while (node) {
        if (
          node.hidden ||
          node.classList.contains("hidden") ||
          node.getAttribute("aria-hidden") === "true" ||
          (node.tagName === "DIALOG" && !node.hasAttribute("open"))
        ) {
          close();
          break;
        }
        node = node.parentElement;
      }
      if (!trigger.isConnected) close();
    });
    observer.observe(trigger.ownerDocument.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "aria-hidden", "open"],
    });
    return () => {
      disposed = true;
      observer.disconnect();
      close();
    };
  }, [trigger, point.clientX, point.clientY, focusFirst, visible]);

  if (!visible) return null;
  return (
    <div
      ref={menu}
      popover="manual"
      role="menu"
      data-data-table-actions-menu="true"
      className="hidden lxp-row-context-menu"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          role="menuitem"
          type="button"
          className={`ctx-item ${action.variant === "danger" ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-accent"}`}
          onClick={() => onSelect(action.id)}
        >
          <i className={`ti ${action.icon ?? "ti-dots"}`} aria-hidden="true" />
          <span>{action.label}</span>
        </button>
      ))}
      {customContent && (
        <div className="lxp-legacy-context-actions" onClick={onClose}>
          {customContent}
        </div>
      )}
    </div>
  );
}
