import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./editor", () => ({ mediaKind: () => null, openMediaModal: vi.fn() }));
vi.mock("./folder-actions", () => ({ openCreateExpoAppDialog: vi.fn(), openFolderSnippetsDialog: vi.fn(), openProposeAgentsDialog: vi.fn() }));
vi.mock("./history-file-versions", () => ({ openFileHistory: vi.fn(), openHistoryDialog: vi.fn() }));
vi.mock("./tools", () => ({ openCleanupDialog: vi.fn(), openImageDialog: vi.fn(), openImageScanDialog: vi.fn(), openMalwareDialog: vi.fn(), openMetaDialog: vi.fn(), openProjectMap: vi.fn(), openShareDialog: vi.fn() }));
vi.mock("./toast", () => ({ showToast: vi.fn() }));

import { buildContextMenu, hideContextMenu } from "./context-menu";
import { S } from "./state";

beforeEach(() => {
  S.filesActions = null;
  S.filesClientMode = false;
  document.body.innerHTML = '<div id="files-context-menu" popover="manual" class="hidden"></div>';
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

it("preserves filenames containing quotes in context action arguments", () => {
  const name = `a'b" & report.txt`;
  const menu = document.getElementById("files-context-menu")!;
  menu.innerHTML = buildContextMenu(`/tmp/${name}`, name, false);
  expect(menu.firstElementChild?.getAttribute("data-name")).toBe(name);
  expect(menu.firstElementChild?.getAttribute("data-path")).toBe(`/tmp/${name}`);
  const rename = vi.fn();
  (window as any).handleRename = rename;
  menu.querySelector<HTMLButtonElement>('[data-action="rename"]')!.click();
  expect(rename).toHaveBeenCalledWith(`/tmp/${name}`, name);
  delete (window as any).handleRename;
});

it("shows the menu in the top layer, clamps it to the viewport and allows scrolling its options", () => {
  const menu = document.getElementById("files-context-menu")!;
  const show = vi.fn(), hide = vi.fn();
  menu.showPopover = show;
  menu.hidePopover = hide;
  vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({ width: 240, height: 320 } as DOMRect);
  const event = new MouseEvent("contextmenu", { clientX: window.innerWidth - 1, clientY: window.innerHeight - 1 });
  (window as any).showFileContextMenu(event, "/srv/app", "app", true);
  expect(show).toHaveBeenCalledOnce();
  expect(menu.classList.contains("hidden")).toBe(false);
  expect(parseInt(menu.style.left)).toBe(window.innerWidth - 246);
  expect(parseInt(menu.style.top)).toBe(window.innerHeight - 326);
  menu.dispatchEvent(new Event("scroll"));
  expect(menu.classList.contains("hidden")).toBe(false);
  hideContextMenu();
  expect(hide).toHaveBeenCalledOnce();
  expect(menu.classList.contains("hidden")).toBe(true);
});

it("keeps permission restrictions on file actions", () => {
  S.filesActions = new Set(["files.read", "files.copypath"]);
  const menu = document.getElementById("files-context-menu")!;
  menu.innerHTML = buildContextMenu("/tmp/report.txt", "report.txt", false);
  expect(menu.querySelector('[data-action="edit"]')).toBeTruthy();
  expect(menu.querySelector('[data-action="copy-path"]')).toBeTruthy();
  expect(menu.querySelector('[data-action="delete"]')).toBeNull();
  expect(menu.querySelector('[data-action="rename"]')).toBeNull();
  S.filesActions = null;
});
