import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMessageReader } from "./reader-state";
let reader: ReturnType<typeof createMessageReader>;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<button id="btn-reply"></button><div id="viewer-content"><div data-mail-body-viewport><div id="msg-loading" hidden></div><div id="msg-html-host" hidden data-title="Mail"></div><pre id="msg-text" class="hidden"></pre><button id="msg-retry" hidden></button></div></div>';
  reader = createMessageReader(document);
});
afterEach(() => {
  reader.reset();
  vi.useRealTimers();
  document.body.replaceChildren();
});
it("shows the loader immediately and reveals HTML after its own frame loads", () => {
  reader.begin(1, vi.fn());
  expect(document.getElementById("msg-loading")!.hidden).toBe(false);
  expect((document.getElementById("btn-reply") as HTMLButtonElement).disabled).toBe(true);
  reader.render({ html: "<p>One</p>" }, 1);
  const frame = document.getElementById("msg-iframe")!;
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  frame.dispatchEvent(new Event("load"));
  expect(document.getElementById("msg-loading")!.hidden).toBe(true);
  expect((document.getElementById("btn-reply") as HTMLButtonElement).disabled).toBe(false);
});
it("ignores an old frame event and an old error after another message is selected", () => {
  reader.begin(1, vi.fn());
  reader.render({ html: "<p>One</p>" }, 1);
  const old = document.getElementById("msg-iframe")!;
  reader.begin(2, vi.fn());
  old.dispatchEvent(new Event("load"));
  reader.error(1, "Old error");
  expect(reader.isLoading).toBe(true);
  reader.render({ text: "Two" }, 2);
  expect(reader.isLoading).toBe(false);
  expect(document.getElementById("msg-text")!.textContent).toBe("Two");
});
it("shows retry on error and permits retrying the captured message", () => {
  const retry = vi.fn();
  reader.begin(3, retry);
  reader.error(3, "Failed");
  expect(reader.isLoading).toBe(false);
  expect(document.getElementById("msg-retry")!.hidden).toBe(false);
  document.getElementById("msg-retry")!.click();
  expect(retry).toHaveBeenCalledOnce();
});
it("releases the spinner after the resource deadline and cancels it on reset", () => {
  reader.begin(4, vi.fn());
  reader.render({ html: '<img src="https://example.test/slow.png">' }, 4);
  vi.advanceTimersByTime(10000);
  expect(reader.isLoading).toBe(false);
  reader.begin(5, vi.fn());
  reader.render({ html: "new" }, 5);
  reader.reset();
  vi.runAllTimers();
  expect(document.getElementById("msg-iframe")).toBeNull();
  expect(reader.isLoading).toBe(false);
});
