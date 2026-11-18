import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import DataTable from "../DataTable";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = async (
    data = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  ) =>
    act(async () =>
      root.render(
        h(DataTable, {
          tableId: "test-actions",
          columns: [{ id: "name", header: "Name", accessorKey: "name" }],
          data,
          rowActions: [{ id: "edit", label: "Edit", icon: "ti-pencil" }],
        }),
      ),
    );
  await render();
  return { host, render };
}
it("removes the actions column and dispatches the clicked row from its context menu", async () => {
  const { host } = await mount();
  expect([...host.querySelectorAll("th")].map((n) => n.textContent)).toEqual(["Name"]);
  const received = vi.fn();
  window.addEventListener("lxp:data-table:row-action", received);
  const row = host.querySelectorAll("tbody tr")[1];
  await act(async () =>
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 75, clientY: 120 }),
    ),
  );
  expect(host.querySelector("[role=menu]")).not.toBeNull();
  await act(async () => (host.querySelector("[role=menuitem]") as HTMLButtonElement).click());
  expect(received.mock.calls[0][0].detail).toMatchObject({
    tableId: "test-actions",
    actionId: "edit",
    row: { id: "b" },
  });
  window.removeEventListener("lxp:data-table:row-action", received);
});
it("opens with the keyboard and closes when the rows are replaced", async () => {
  const { host, render } = await mount();
  const row = host.querySelector("tbody tr")!;
  await act(async () =>
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }),
    ),
  );
  expect(host.querySelector("[role=menu]")).not.toBeNull();
  await render([{ id: "c", name: "C" }]);
  expect(host.querySelector("[role=menu]")).toBeNull();
});
it("switches the menu directly to another row without losing the new menu", async () => {
  const { host } = await mount();
  const rows = host.querySelectorAll("tbody tr");
  for (const row of rows) {
    await act(async () =>
      row.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 100,
        }),
      ),
    );
    expect(host.querySelector("[role=menu]")).not.toBeNull();
    expect(row.getAttribute("data-context-active")).toBe("true");
  }
});
it("only offers actions allowed for the current row and uses the local callback", async () => {
  const { host } = await mount();
  const action = vi.fn();
  await act(async () =>
    root.render(
      h(DataTable, {
        tableId: "test-actions",
        columns: [{ id: "name", header: "Name", accessorKey: "name" }],
        data: [
          { id: "a", name: "A", editable: false },
          { id: "b", name: "B", editable: true },
        ],
        rowActions: [{ id: "edit", label: "Edit", visibleWhen: { field: "editable", equals: true } }],
        onRowAction: action,
      }),
    ),
  );
  const rows = host.querySelectorAll("tbody tr");
  await act(async () =>
    rows[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector("[role=menu]")).toBeNull();
  await act(async () =>
    rows[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
  );
  await act(async () => (host.querySelector("[role=menuitem]") as HTMLButtonElement).click());
  expect(action).toHaveBeenCalledWith("edit", expect.objectContaining({ id: "b" }));
});
