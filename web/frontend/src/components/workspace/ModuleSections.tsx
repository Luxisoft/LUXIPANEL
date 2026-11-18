// SPDX-License-Identifier: AGPL-3.0-only
import { createContext, useContext, useState, type ReactNode } from "react";
export const ModuleSectionContext = createContext<{ active: string; activate: (id: string) => void } | null>(null);
export function ModuleSubsections({ sections, children }: { sections: {id: string; label: string}[]; children: ReactNode }) {
  const [active, activate] = useState(sections[0].id);
  return <ModuleSectionContext.Provider value={{ active, activate }}><div className="lxp-module-section">
    <div role="tablist" className="flex shrink-0 gap-2 border-b border-border px-4 py-2">{sections.map(section => <button key={section.id} type="button" role="tab" aria-selected={active === section.id} className={active === section.id ? "text-primary" : "text-muted-foreground"} onClick={() => activate(section.id)}>{section.label}</button>)}</div>
    {children}
  </div></ModuleSectionContext.Provider>;
}
export function ModuleSection({ id, children }: { id: string; children: ReactNode }) {
  const state = useContext(ModuleSectionContext);
  return <div data-module-section={id} className={state && state.active !== id ? "hidden" : "lxp-module-section"}>{children}</div>;
}
