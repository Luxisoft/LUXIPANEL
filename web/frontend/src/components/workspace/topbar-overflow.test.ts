import { expect, it } from "vitest";
import { fitTopbarItems } from "./topbar-overflow";
it("keeps every item visible without reserving an unnecessary trigger", () => {
  expect([...fitTopbarItems([100, 90], 198, 8, 32)]).toEqual([0, 1]);
});
it("keeps a primary action and a smaller tool when another action does not fit", () => {
  expect([...fitTopbarItems([110, 135, 36, 120], 270, 8, 32)]).toEqual([0, 2]);
});
it("does not let an oversized item hide smaller controls that fit", () => {
  expect([...fitTopbarItems([400, 32, 32], 120, 8, 32)]).toEqual([1, 2]);
});
it("uses only the trigger when no individual control fits", () => {
  expect([...fitTopbarItems([160, 90], 80, 8, 32)]).toEqual([]);
});
it("fits a single item without adding a trigger", () => {
  expect([...fitTopbarItems([60], 60, 8, 32)]).toEqual([0]);
});
it("handles empty sections and compact mobile buttons", () => {
  expect([...fitTopbarItems([], 0, 4, 28)]).toEqual([]);
  expect([...fitTopbarItems([28, 100], 60, 4, 28)]).toEqual([0]);
});
