// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import { useLayoutEffect, type HTMLAttributes, type ReactNode } from "react";
import { useViewContext } from "./view-context";
import { mountModuleTableLayout } from "./module-table-layout";

export function ModuleContent({ children }: { children: ReactNode }) {
  const { scope } = useViewContext();
  useLayoutEffect(() => { const drawer = scope.root.closest<HTMLElement>(".lxp-workspace-quick-drawer"); return drawer && !hasOwnModuleLayout(scope.root.dataset.internalModule) ? mountModuleTableLayout(scope.root, drawer) : undefined; }, [scope]);
  return <div data-module-content-root>{children}</div>;
}

export function ModuleCard({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} data-module-card className={className}>{children}</section>;
}
