import { afterEach, expect, it, vi } from "vitest";
import { mountNativeRowContextMenus } from "./native-row-context-menu";
afterEach(() => document.body.replaceChildren());
it("moves connected native handlers out of the removed column and preserves the row identity", async () => {
  document.body.innerHTML =
    '<div id="root"><table><thead><tr><th>Name</th><th>Acciones</th></tr></thead><tbody id="forwards-tbody"><tr data-id="42"><td>row</td><td><button data-id="42">Edit</button></td></tr></tbody></table></div>';
  const root = document.querySelector<HTMLElement>("#root")!,
    button = root.querySelector("button")!,
    handler = vi.fn();
  root.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button[data-id]"))
      handler((event.target as HTMLElement).closest("tr")?.getAttribute("data-id"));
  });
  const stop = mountNativeRowContextMenus(root, "Acciones");
  await new Promise((r) => setTimeout(r, 0));
  expect(root.querySelectorAll("th")).toHaveLength(1);
  expect(root.querySelectorAll("tbody td")).toHaveLength(1);
  expect(button.isConnected).toBe(true);
  root
    .querySelector("tbody tr")!
    .dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 60, clientY: 70 }),
    );
  (root.querySelector("[role=menuitem]") as HTMLButtonElement).click();
  expect(handler).toHaveBeenCalledWith("42");
  stop();
});
