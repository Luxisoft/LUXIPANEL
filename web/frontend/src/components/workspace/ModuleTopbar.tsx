// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import { useRef, type ReactNode } from "react";
import { TopbarItem } from "./topbar-items";
import { ModuleTopbarGroup, useUniformTopbar } from "./ModuleTopbarGroup";

export default function ModuleTopbar({ title, moduleKey, labels, context, settingsAvailable = false, onSettings, onClose }: {
  title: string; moduleKey: string | null;
  labels: { search?: string; filters: string; actions: string; context: string; tools: string; settings: string; close: string };
  context?: ReactNode; settingsAvailable?: boolean; onSettings?: () => void; onClose: () => void;
}) {
  const header = useRef<HTMLElement>(null);
  useUniformTopbar(header, moduleKey);
  if (hasOwnModuleLayout(moduleKey)) return <header key={moduleKey?.split(":")[0]} ref={header} className="lxp-workspace-quick-header" data-files-legacy-topbar={moduleKey?.startsWith("files") ? "" : undefined} data-terminal-legacy-topbar={moduleKey?.startsWith("terminal") ? "" : undefined}>
    <h2 id="workspace-quick-title" className="sr-only">{title}</h2>
    <div data-module-header-tabs-slot className="lxp-workspace-header-tabs" />
    <div data-module-header-controls-slot className="lxp-workspace-header-controls" />
    <div className="ml-auto flex items-center gap-2">
      <div data-module-header-actions-slot className="lxp-workspace-header-actions" />
      <div data-module-header-status-slot className="lxp-workspace-header-status" />
      <button id="workspace-quick-settings" type="button" hidden={!settingsAvailable} className="lxp-workspace-header-settings" onClick={onSettings}><i className="ti ti-settings text-sm" />{labels.settings}</button>
      <button type="button" className="lxp-workspace-quick-close" data-close-drawer onClick={onClose} aria-label={labels.close}><i className="ti ti-x text-lg" /></button>
    </div>
  </header>;
  return <header key="uniform" ref={header} className="lxp-workspace-quick-header" data-uniform-topbar>
    <h2 id="workspace-quick-title" className="sr-only">{title}</h2>
    <div data-topbar-block="navigation">
      <ModuleTopbarGroup kind="tabs" icon="selector" label={title}>
        <div data-module-header-tabs-slot className="lxp-workspace-header-tabs" />
        <div data-module-header-navigation-slot />
      </ModuleTopbarGroup>
    </div>
    <div data-topbar-block="query">
      <ModuleTopbarGroup kind="query" icon="search" label={labels.search ?? labels.filters}>
        <div data-topbar-search><div data-module-header-search-slot /></div>
        <div data-module-header-filters-slot /><div data-module-header-table-slot /><div data-module-header-native-slot />
      </ModuleTopbarGroup>
    </div>
    <div data-topbar-block="actions">
      <ModuleTopbarGroup kind="actions" icon="dots" label={labels.actions}>
        <div data-module-header-table-actions-slot /><div data-module-header-native-actions-slot />
        <div data-module-header-actions-slot className="lxp-workspace-header-actions" />
        <div data-module-header-controls-slot className="lxp-workspace-header-controls" />
        <div data-module-header-status-slot className="lxp-workspace-header-status" /><TopbarItem>{context}</TopbarItem>
        <div data-module-header-tools-slot />
        <TopbarItem><button id="workspace-quick-settings" type="button" hidden={!settingsAvailable} className="lxp-workspace-header-settings" onClick={onSettings}>
          <i className="ti ti-settings text-sm" />{labels.settings}
        </button></TopbarItem>
      </ModuleTopbarGroup>
      <button type="button" className="lxp-workspace-quick-close" data-close-drawer onClick={onClose} aria-label={labels.close}>
        <i className="ti ti-x text-lg" />
      </button>
    </div>
  </header>;
}
