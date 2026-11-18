import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import UsersDataTable from "./UsersDataTable";
import { InternalViewContext, type ViewContext } from "./view-context";
import { ModuleVisibilityContext } from "./module-visibility";
import { DATATABLE_EVENTS } from "@/lib/datatable-events";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let reactRoot: ReturnType<typeof createRoot>;
afterEach(async () => {
  if (reactRoot) await act(async () => reactRoot.unmount());
  document.body.replaceChildren();
  localStorage.clear();
});

it("keeps only the active table tools in the header and preserves selection across tabs and reopening", async () => {
  document.body.innerHTML = '<div class="lxp-workspace-quick-drawer"><header><div data-module-header-controls-slot></div></header><div id="module"></div></div>';
  const module = document.querySelector<HTMLElement>("#module")!;
  const header = document.querySelector("header")!;
  const context = { scope: { root: module } } as ViewContext;
  reactRoot = createRoot(module);
  const render = async (visible: boolean) => act(async () => reactRoot.render(
    h(InternalViewContext.Provider, { value: context },
      h(ModuleVisibilityContext.Provider, { value: visible },
        ...["users", "roles"].map((name) => h("div", { key: name, id: `panel-${name}`, className: name === "roles" ? "hidden" : "" },
          h(UsersDataTable, {
            tableId: `${name}-main-table`,
            columns: [{ id: "name", header: "Nombre", accessorKey: "name" }],
            data: [{ name: "ana" }],
            filters: [{ id: "search", type: "text", label: `Buscar ${name}`, accessorKey: "name" }],
            quickActions: [{ id: "delete", label: "Eliminar selección", icon: "ti-trash" }],
          }),
        )),
      ),
    ),
  ));
  await render(true);
  expect(header.querySelectorAll("input")).toHaveLength(1);
  expect(header.querySelector("input")?.getAttribute("aria-label")).toBe("Buscar users");
  expect(module.querySelector("#panel-users [data-data-table-toolbar]")).toBeNull();
  await act(async () => module.querySelector<HTMLInputElement>('#panel-users tbody input[type="checkbox"]')!.click());
  const quickAction = vi.fn();
  window.addEventListener(DATATABLE_EVENTS.QUICK_ACTION, quickAction);
  await act(async () => header.querySelector<HTMLButtonElement>('[aria-label="Eliminar selección"]')!.click());
  expect(quickAction).toHaveBeenCalledOnce();
  expect(quickAction.mock.calls[0][0].detail.tableId).toBe("users-main-table");
  window.removeEventListener(DATATABLE_EVENTS.QUICK_ACTION, quickAction);
  await act(async () => {
    module.querySelector("#panel-users")!.classList.add("hidden");
    module.querySelector("#panel-roles")!.classList.remove("hidden");
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(header.querySelectorAll("input")).toHaveLength(1);
  expect(header.querySelector("input")?.getAttribute("aria-label")).toBe("Buscar roles");
  expect(header.querySelector('[aria-label="Eliminar selección"]')).toBeNull();
  await render(false);
  expect(header.querySelector("[data-data-table-toolbar]")).toBeNull();
  await render(true);
  expect(header.querySelector("input")?.getAttribute("aria-label")).toBe("Buscar roles");
  await act(async () => {
    module.querySelector("#panel-roles")!.classList.add("hidden");
    module.querySelector("#panel-users")!.classList.remove("hidden");
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(header.querySelector('[aria-label="Eliminar selección"]')).not.toBeNull();
  await act(async () => reactRoot.unmount());
  expect(header.querySelector("[data-data-table-toolbar]")).toBeNull();
});
