import { afterEach, expect, it } from "vitest";
import { hasTopbarContent } from "./ModuleTopbarGroup";
afterEach(() => document.body.replaceChildren());
function content(html: string) {
  document.body.innerHTML = `<div id="slot">${html}</div>`;
  return document.getElementById("slot")!;
}
it("ignores empty owners and controls hidden by their ancestors", () => {
  const root = content('<div><div></div></div><div hidden><button>Create</button></div><div style="display:none"><select><option>All</option></select></div><div aria-hidden="true"><input></div>');
  expect(hasTopbarContent(root)).toBe(false);
  root.querySelector("[hidden]")!.removeAttribute("hidden");
  expect(hasTopbarContent(root)).toBe(true);
});
it("counts disabled controls and informative text as occupied", () => {
  expect(hasTopbarContent(content('<button disabled>Update</button>'))).toBe(true);
  expect(hasTopbarContent(content('<div><span>Connected</span></div>'))).toBe(true);
  expect(hasTopbarContent(content('<span style="visibility:hidden">Loading</span>'))).toBe(false);
});
it("does not treat a closed popover's presentation as an empty slot", () => {
  const root = content('<div><input value="kept"></div>');
  root.setAttribute("popover", "auto");
  expect(hasTopbarContent(root)).toBe(true);
  expect((root.querySelector("input") as HTMLInputElement).value).toBe("kept");
});
