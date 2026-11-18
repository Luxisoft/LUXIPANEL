// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import { useState, useLayoutEffect, type ReactNode } from "react";
import { splitSlots, useViewContext } from "./view-context";
import { ModuleContent } from "./ModuleContent";
import { ModuleSectionContext } from "./ModuleSections";
import { mountNativeRowContextMenus } from "./native-row-context-menu";
import { mountNativeModuleControls } from "./native-module-controls";
export default function ModuleFrame({
  children,
  activeModule,
  flush = false,
  fullBleed = false,
  sections,
}: {
  children: ReactNode;
  title?: string;
  activeModule?: string;
  flush?: boolean;
  fullBleed?: boolean;
  titleInActions?: boolean;
  sections?: { id: string; label: string; sourceId?: string; onActivate?: () => void }[];
}) {
  const { scope, url, messages } = useViewContext();
  const ownLayout = hasOwnModuleLayout(scope.root.dataset.internalModule ?? activeModule);
  useLayoutEffect(() => {
    if (!ownLayout) return;
    for (const name of ["data-module-uniform-content", "data-module-layout", "data-module-workspace"]) scope.root.removeAttribute(name);
    for (const node of scope.root.querySelectorAll("[data-module-surface],[data-module-stack],[data-module-pane],[data-module-card-body],[data-module-table-path],[data-module-content-frame]")) {
      for (const name of ["data-module-surface", "data-module-stack", "data-module-pane", "data-module-card-body", "data-module-table-path", "data-module-content-frame"]) node.removeAttribute(name);
    }
    if (!scope.root.hidden) scope.root.closest(".lxp-workspace-quick-drawer")?.removeAttribute("data-module-table-layout");
  }, [scope, ownLayout]);
  useLayoutEffect(() => mountNativeRowContextMenus(scope.root, messages.components?.dataTable?.actions ?? "Acciones"), [scope]);
  const [activeSection, setActiveSection] = useState(() => {
    const requested = url.searchParams.get("workspaceView");
    return sections?.find(section => section.id === requested)?.id ?? sections?.[0]?.id ?? "";
  });
  useLayoutEffect(() => mountNativeModuleControls(scope), [scope]);
  useLayoutEffect(() => {
    scope.window.dispatchEvent(new CustomEvent("lxp:module:section-changed", { detail: { module: activeModule, section: activeSection } }));
    const timer = scope.setTimeout(() => sections?.find(section => section.id === activeSection)?.onActivate?.(), 80);
    const onClick = (event: Event) => {
      const id = (event.target as Element)?.closest?.("button")?.id;
      const section = sections?.find(section => Boolean(section.sourceId) && section.sourceId === id);
      if (section) setActiveSection(section.id);
    };
    scope.root.addEventListener("click", onClick);
    return () => { scope.clearTimeout(timer); scope.root.removeEventListener("click", onClick); };
  }, [scope, activeSection]);
  const slots = splitSlots(children);
  return (
    <>
      <div data-module-toolbar>
        {slots["title-actions"]}
        {activeModule === "mail" && !slots["title-actions"] && (
          <button id="mail-settings-modal-trigger" type="button">
            <i className="ti ti-settings" aria-hidden />
          </button>
        )}
      </div>
      <main
        data-panel-content
        className={`min-h-0 min-w-0 flex-1 ${flush || fullBleed ? "" : "p-4 lg:p-6"}`}
      >
        <ModuleSectionContext.Provider value={{ active: activeSection, activate: setActiveSection }}>
          {sections && <div data-module-sections-tabs role="tablist" className="flex gap-1">
            {sections.map(section => <button key={section.id} id={`module-section-${section.id}`} type="button" role="tab" aria-selected={activeSection === section.id} className={`tab-btn ${activeSection === section.id ? "text-primary border-primary" : "text-muted-foreground"}`} onClick={() => setActiveSection(section.id)}>{section.label}</button>)}
          </div>}
          {ownLayout ? slots.default : <ModuleContent>{slots.default}</ModuleContent>}
        </ModuleSectionContext.Provider>
      </main>
    </>
  );
}
