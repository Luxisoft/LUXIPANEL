// SPDX-License-Identifier: AGPL-3.0-only
import { useLayoutEffect, useRef, useState } from "react";
import DataTable, { type DataTableProps } from "@/components/ui/DataTable";
import { useViewContext } from "./view-context";
import { useModuleVisibility } from "./module-visibility";
import { moduleElementVisible } from "./module-table-layout";

export default function ModuleDataTable(props: DataTableProps) {
  const { scope } = useViewContext();
  const visible = useModuleVisibility();
  const host = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(true);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const drawer = scope.root.closest(".lxp-workspace-quick-drawer");
    const slot = drawer?.querySelector<HTMLElement>("[data-module-header-table-slot]") ?? drawer?.querySelector<HTMLElement>("[data-module-header-controls-slot]") ?? null;
    const sync = () => {
      setFill(scope.root.dataset.moduleLayout !== "mixed");
      const tables = [...scope.root.querySelectorAll<HTMLElement>("[data-module-table]")]
        .filter(node => !node.closest("dialog, [data-lxp-module-settings], [data-view-settings-modal]") && moduleElementVisible(node, scope.root));
      setTarget(visible && tables[0] === host.current ? slot : null);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(scope.root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-module-layout"] });
    return () => observer.disconnect();
  }, [scope, visible]);
  const drawer = scope.root.closest(".lxp-workspace-quick-drawer");
  const toolbarTargets = target && drawer?.querySelector("[data-module-header-search-slot]") ? Object.fromEntries(
    ["search", "filters", "actions", "tools"].map(kind => [kind, drawer.querySelector<HTMLElement>(`[data-module-header-${kind === "actions" ? "table-actions" : kind}-slot]`)!])
  ) : undefined;
  return <div ref={host} data-module-table={props.tableId}><DataTable {...props} layout={target && fill ? "fill" : "default"} toolbarContainer={target} toolbarTargets={toolbarTargets} /></div>;
}
