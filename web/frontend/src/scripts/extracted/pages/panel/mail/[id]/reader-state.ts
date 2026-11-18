// SPDX-License-Identifier: AGPL-3.0-only
import { messageDocument } from "./message-document";
const actionIds = ["btn-reply", "btn-forward", "btn-move", "btn-delete-msg", "btn-edit-draft"];
/** A frame belongs to exactly one loading generation, including its resource deadline. */
export function createMessageReader(doc: Document) {
  let current = 0,
    loading = false,
    deadline: ReturnType<typeof setTimeout> | undefined;
  let frame: HTMLIFrameElement | null = null;
  const node = (id: string) => doc.getElementById(id);
  const cancelFrame = () => {
    clearTimeout(deadline);
    if (frame) frame.onload = null;
    frame?.remove();
    frame = null;
  };
  const busy = (value: boolean) => {
    loading = value;
    node("viewer-content")?.setAttribute("aria-busy", String(value));
    for (const id of actionIds) {
      const button = node(id) as HTMLButtonElement | null;
      if (button) button.disabled = value;
    }
    const spinner = node("msg-loading");
    if (spinner) spinner.hidden = !value;
  };
  const state = (value: string) => {
    const viewport = doc.querySelector<HTMLElement>("[data-mail-body-viewport]");
    if (viewport) {
      viewport.dataset.readerState = value;
      viewport.style.overflow = value === "ready-html" ? "hidden" : "auto";
    }
  };
  const hide = (id: string) => {
    const el = node(id);
    if (el) el.hidden = true;
  };
  return {
    get isLoading() {
      return loading;
    },
    begin(generation: number, retry: () => void) {
      current = generation;
      cancelFrame();
      hide("msg-html-host");
      hide("msg-retry");
      node("msg-text")?.classList.add("hidden");
      node("msg-attachments")?.classList.add("hidden");
      const button = node("msg-retry") as HTMLButtonElement | null;
      if (button) button.onclick = retry;
      state("loading");
      busy(true);
    },
    reset() {
      current++;
      cancelFrame();
      busy(false);
      hide("msg-html-host");
      hide("msg-retry");
      node("msg-text")?.classList.add("hidden");
      state("idle");
      for (const id of actionIds) {
        const button = node(id) as HTMLButtonElement | null;
        if (button) button.disabled = true;
      }
    },
    error(generation: number, message: string) {
      if (generation !== current) return;
      cancelFrame();
      busy(false);
      state("error");
      hide("msg-html-host");
      const text = node("msg-text");
      if (text) {
        text.textContent = message;
        text.classList.remove("hidden");
      }
      const button = node("msg-retry");
      if (button) button.hidden = false;
      for (const id of actionIds) {
        const button = node(id) as HTMLButtonElement | null;
        if (button) button.disabled = true;
      }
    },
    render(message: any, generation: number) {
      if (generation !== current) return;
      cancelFrame();
      hide("msg-retry");
      const html = typeof message.html === "string" ? message.html.trim() : "";
      const rich = typeof message.htmlDocument === "string" ? message.htmlDocument.trim() : "";
      if (html || rich) {
        busy(true);
        state("loading");
        const host = node("msg-html-host");
        if (!host) {
          busy(false);
          return;
        }
        node("msg-text")?.classList.add("hidden");
        host.hidden = false;
        frame = doc.createElement("iframe");
        const ownFrame = frame;
        frame.id = "msg-iframe";
        frame.title = host.dataset.title || "";
        frame.className = "w-full h-full border-0 block";
        frame.style.visibility = "hidden";
        frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
        const ready = () => {
          if (current !== generation || frame !== ownFrame || !ownFrame.isConnected) return;
          clearTimeout(deadline);
          ownFrame.style.visibility = "visible";
          busy(false);
          state("ready-html");
        };
        frame.onload = ready;
        frame.srcdoc = rich || messageDocument(html);
        host.replaceChildren(frame);
        deadline = setTimeout(ready, 10000);
      } else {
        hide("msg-html-host");
        const text = node("msg-text");
        if (text) {
          text.textContent = message.text || message.body || "";
          text.classList.remove("hidden");
        }
        busy(false);
        state("ready-text");
      }
    },
  };
}
