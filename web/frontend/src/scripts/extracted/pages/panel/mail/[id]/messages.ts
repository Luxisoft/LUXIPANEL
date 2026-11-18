// Mailbox inbox viewer — message list + single-message reader (fetch, render
// rows, open a message into the viewer with HTML iframe / text fallback +
// attachments). Owns the last-fetch cache and the open-generation guard.
import {
  api,
  resolvePanelApiPath,
  scopeHeaders,
} from "/scripts/extracted/lib/mail-api-client.js?v=20260930a";
import { accountId, fallback, PAGE_SIZE, S } from "./state";
import { escapeHtml, formatAddress, formatBytes } from "./helpers";
import {
  isMailboxCredentialError,
  isMailboxImapUnavailable,
  rememberCredentialFailure,
  renderMailboxCredentialBlockedState,
  renderMessagesLoading,
} from "./status-render";
import { createMessageReader } from "./reader-state";
const reader = createMessageReader(document);
let readController: AbortController | undefined;
let resumeUid: number | null = null;

let lastLoadedMessages: any[] = [];
/** Incremented on every openMessage call; stale async operations check this
 *  before touching the DOM so rapid clicks don't paint the wrong content. */
let openGeneration = 0;
let listGeneration = 0;

export function invalidateMessageLoads() {
  ++openGeneration;
  ++listGeneration;
  readController?.abort();
  reader.reset();
  (window as any)._currentUid = null;
}

export async function loadMessages(
  options: { autoOpenLatest?: boolean; showLoading?: boolean; loadingText?: string } = {},
) {
  const autoOpenLatest = options.autoOpenLatest ?? true;
  const generation = ++listGeneration,
    folder = S.currentFolder,
    page = S.currentPage;
  const showLoading = options.showLoading ?? true;
  const loadingText = options.loadingText ?? fallback("inbox.loading", "Cargando mensajes...");
  if (S.mailboxCredentialBroken) {
    renderMailboxCredentialBlockedState();
    return;
  }

  if (showLoading) {
    renderMessagesLoading(loadingText);
  }

  const search = (document.getElementById("msg-search") as HTMLInputElement).value.trim();
  const email = (document.getElementById("msg-filter-email") as HTMLInputElement | null)?.value.trim() || "";
  const dateFrom = (document.getElementById("msg-filter-date-from") as HTMLInputElement | null)?.value || "";
  const dateTo = (document.getElementById("msg-filter-date-to") as HTMLInputElement | null)?.value || "";
  const sort =
    (
      (document.getElementById("msg-sort-order") as HTMLSelectElement | null)?.value || "desc"
    ).toLowerCase() === "asc"
      ? "asc"
      : "desc";

  const res = await api.get<any>(`/api/mail/${accountId}/messages`, {
    fresh: true,
    params: {
      folder: S.currentFolder,
      page: S.currentPage,
      limit: PAGE_SIZE,
      search: search || undefined,
      email: email || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort,
    },
  });

  if (
    generation !== listGeneration ||
    folder !== S.currentFolder ||
    page !== S.currentPage ||
    document.hidden
  )
    return;
  const list = document.getElementById("messages-list")!;

  if (!res.ok || !res.data) {
    if (isMailboxCredentialError(res)) {
      rememberCredentialFailure(res);
      S.mailboxCredentialBroken = true;
      renderMailboxCredentialBlockedState();
      return;
    }

    if (options.showLoading === false) {
      const refresh = document.getElementById("btn-refresh");
      if (refresh)
        refresh.title = res.error || fallback("inbox.error.loadMessages", "Error al cargar mensajes");
      return;
    }
    if (isMailboxImapUnavailable(res)) {
      list.innerHTML = `<div class="p-4 text-center text-xs text-amber-200">${fallback("inbox.imapUnavailable", "No se pudo conectar al servidor IMAP para cargar mensajes.")}</div>`;
      return;
    }

    list.innerHTML = `<div class="p-6 text-center text-xs text-muted-foreground">${fallback("inbox.error.loadMessages", "Error al cargar mensajes")}</div>`;
    return;
  }

  const refresh = document.getElementById("btn-refresh");
  if (refresh) refresh.title = fallback("inbox.titleRefresh", "Actualizar");
  const data = res.data as any;
  const messages: any[] = Array.isArray(data) ? data : (data.messages ?? []);
  S.totalMessages = data.total ?? messages.length;
  lastLoadedMessages = messages;

  if (messages.length === 0) {
    S.currentUid = null;
    document.getElementById("viewer-empty")!.classList.remove("hidden");
    document.getElementById("viewer-content")!.classList.add("hidden");
    list.innerHTML = `<div class="flex flex-col items-center justify-center p-8 text-center">
      <i class="ti ti-inbox-off text-2xl text-muted-foreground/40 mb-2"></i>
      <p class="text-xs text-muted-foreground">${fallback("inbox.noMessages", "Sin mensajes")}</p>
    </div>`;
  } else {
    list.innerHTML = messages.map((m) => renderMessageRow(m)).join("");
  }

  // Folder count badge
  const countEl = document.getElementById("folder-count")!;
  if (S.totalMessages > 0) {
    countEl.textContent = String(S.totalMessages);
    countEl.classList.remove("hidden");
  } else {
    countEl.classList.add("hidden");
  }

  // Pagination
  const pagEl = document.getElementById("msg-pagination")!;
  if (S.totalMessages > PAGE_SIZE) {
    pagEl.classList.remove("hidden");
    document.getElementById("page-info")!.textContent =
      `${(S.currentPage - 1) * PAGE_SIZE + 1}–${Math.min(S.currentPage * PAGE_SIZE, S.totalMessages)} ${fallback("inbox.paginationOf", "de")} ${S.totalMessages}`;
    (document.getElementById("btn-prev-page") as HTMLButtonElement).disabled = S.currentPage <= 1;
    (document.getElementById("btn-next-page") as HTMLButtonElement).disabled =
      S.currentPage * PAGE_SIZE >= S.totalMessages;
  } else {
    pagEl.classList.add("hidden");
  }

  if (!autoOpenLatest || messages.length === 0) return;

  const selectedStillVisible =
    S.currentUid !== null && messages.some((item) => Number(item.uid) === S.currentUid);
  if (!selectedStillVisible) {
    const firstUid = Number(messages[0]?.uid || 0);
    if (firstUid > 0) {
      // false = don't re-render the list we just painted above
      await (window as any).openMessage(firstUid, false);
    }
  }
}

function renderMessageRow(m: any): string {
  const date = new Date(m.date ?? m.receivedAt ?? Date.now());
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const dateStr = sameDay
    ? date.toLocaleTimeString(document.documentElement.lang || undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleDateString(document.documentElement.lang || undefined, { day: "2-digit", month: "short" });

  const from = m.from?.name || m.from?.address || m.from || fallback("inbox.noSender", "Sin remitente");
  const unread = !m.seen && !m.flags?.includes("\\Seen");

  const fromEsc = escapeHtml(String(from));
  const subjectEsc = escapeHtml(String(m.subject || fallback("inbox.noSubject", "Sin asunto")));
  const previewEsc = escapeHtml(String(m.preview || m.snippet || ""));
  const dateStrEsc = escapeHtml(String(dateStr));
  return `
    <div data-mail-uid="${Number(m.uid) || 0}" tabindex="0" role="button" onclick="openMessage(${Number(m.uid) || 0})"
      class="msg-row p-3 cursor-pointer transition-colors hover:bg-accent ${S.currentUid === m.uid ? "bg-primary/5 border-l-2 border-primary" : ""} ${unread ? "bg-muted/20" : ""}">
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="text-xs ${unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"} truncate">${fromEsc}</span>
        <span class="text-[10px] text-muted-foreground shrink-0">${dateStrEsc}</span>
      </div>
      <p class="text-xs ${unread ? "font-medium text-foreground" : "text-muted-foreground"} truncate mb-0.5">${subjectEsc}</p>
      <p class="text-[11px] text-muted-foreground/70 truncate">${previewEsc}</p>
      <div class="flex gap-1 mt-1">
        ${m.flags?.includes("\\Flagged") ? '<i class="ti ti-flag-filled text-[10px] text-amber-500"></i>' : ""}
        ${m.hasAttachments || m.attachments?.length ? '<i class="ti ti-paperclip text-[10px] text-muted-foreground"></i>' : ""}
        ${unread ? '<span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary"></span>' : ""}
      </div>
    </div>`;
}

/** Re-paint the message list from the last fetch without hitting the network. */
function rerenderMessageList() {
  const list = document.getElementById("messages-list");
  if (!list || lastLoadedMessages.length === 0) return;
  list.innerHTML = lastLoadedMessages.map((m) => renderMessageRow(m)).join("");
}

function renderMessageBody(msg: any) {
  reader.render(
    { ...msg, text: msg.text || msg.body || fallback("inbox.noContent", "Sin contenido") },
    openGeneration,
  );
}

(window as any).openMessage = async function (uid: number, refreshList = true) {
  if (S.mailboxCredentialBroken) {
    renderMailboxCredentialBlockedState();
    return;
  }

  const layout = document.querySelector<HTMLElement>("[data-inbox-layout]");
  if (layout) layout.dataset.inboxPane = "reader";
  S.currentUid = uid;
  const gen = ++openGeneration,
    folder = S.currentFolder,
    page = S.currentPage;
  reader.begin(gen, () => void (window as any).openMessage(uid));
  readController?.abort();
  const controller = new AbortController();
  readController = controller;
  (window as any)._currentUid = null;
  document.getElementById("msg-attachments")?.classList.add("hidden");
  document.getElementById("mail-pgp-unlock")?.classList.add("hidden");

  // Synchronously update list highlight — no network round-trip needed
  if (refreshList) {
    rerenderMessageList();
  }

  document.getElementById("viewer-empty")!.classList.add("hidden");
  document.getElementById("viewer-content")!.classList.remove("hidden");

  // Loading state in viewer
  document.getElementById("msg-subject")!.textContent = fallback("inbox.loading", "Cargando...");
  document.getElementById("msg-from")!.textContent = "";
  document.getElementById("msg-to")!.textContent = "";
  document.getElementById("msg-date")!.textContent = "";
  document.getElementById("msg-text")!.classList.add("hidden");

  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60000);
  let res: any;
  try {
    res = await api.get<any>(`/api/mail/${accountId}/messages/${uid}`, {
      params: { folder },
      signal: controller.signal,
    });
  } catch {
    res = {
      ok: false,
      error: fallback("inbox.error.loadMessageRetry", "No se pudo cargar el mensaje. Intenta de nuevo."),
    };
  } finally {
    clearTimeout(deadline);
    if (readController === controller) readController = undefined;
  }

  // Another click arrived while we were fetching — discard this result
  if (
    gen !== openGeneration ||
    folder !== S.currentFolder ||
    page !== S.currentPage ||
    S.currentUid !== uid ||
    document.hidden
  )
    return;

  if (!res.ok || !res.data) {
    if (isMailboxCredentialError(res)) {
      rememberCredentialFailure(res);
      S.mailboxCredentialBroken = true;
      reader.reset();
      renderMailboxCredentialBlockedState();
      return;
    }
    // Show error so viewer doesn't stay frozen on loading state
    document.getElementById("msg-subject")!.textContent = fallback(
      "inbox.error.loadMessage",
      "Error al cargar el mensaje",
    );
    reader.error(
      gen,
      timedOut
        ? fallback("inbox.readerTimeout", "La carga ha tardado demasiado. Vuelve a intentarlo.")
        : res.error ||
            fallback("inbox.error.loadMessageRetry", "No se pudo cargar el mensaje. Intenta de nuevo."),
    );
    return;
  }

  const msg = res.data as any;
  const cached = lastLoadedMessages.find((m) => Number(m.uid) === uid);
  if (cached) {
    cached.seen = true;
    cached.flags = [...new Set([...(cached.flags || []), "\\Seen"])];
    rerenderMessageList();
  }

  document.getElementById("mail-pgp-unlock")?.classList.toggle("hidden", !msg.encrypted);
  const pgpPassphrase = document.getElementById("mail-pgp-passphrase") as HTMLInputElement | null;
  if (pgpPassphrase) pgpPassphrase.value = "";
  const pgpError = document.getElementById("mail-pgp-error");
  if (pgpError) {
    pgpError.textContent = "";
    pgpError.classList.add("hidden");
  }
  document
    .getElementById("btn-edit-draft")
    ?.classList.toggle(
      "hidden",
      !S.folders.some(
        (folder) =>
          folder.path === S.currentFolder &&
          (folder.specialUse === "\\Drafts" || /^drafts$/i.test(folder.path)),
      ),
    );

  // Header
  document.getElementById("msg-subject")!.textContent =
    msg.subject || `(${fallback("inbox.noSubject", "Sin asunto")})`;
  document.getElementById("msg-from")!.textContent = formatAddress(msg.from);
  document.getElementById("msg-to")!.textContent = formatAddress(msg.to);
  document.getElementById("msg-date")!.textContent = msg.date
    ? new Date(msg.date).toLocaleString(document.documentElement.lang || undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const ccRow = document.getElementById("msg-cc-row")!;
  if (msg.cc) {
    document.getElementById("msg-cc")!.textContent = formatAddress(msg.cc);
    ccRow.classList.remove("hidden");
  } else {
    ccRow.classList.add("hidden");
  }

  // The generation-owned iframe reveals only the current message.
  renderMessageBody(
    msg.encrypted
      ? { text: fallback("inbox.pgpUnlockPrompt", "Introduce la frase para abrir este mensaje.") }
      : msg,
  );

  // Attachments
  const attachDiv = document.getElementById("msg-attachments")!;
  const attachList = document.getElementById("attachments-list")!;
  if (msg.attachments?.length) {
    attachDiv.classList.remove("hidden");
    attachList.innerHTML = msg.attachments
      .map((a: any, index: number) => {
        const attName = escapeHtml(String(a.filename ?? a.name ?? fallback("inbox.attachment", "adjunto")));
        const attSize = escapeHtml(String(a.size ? formatBytes(a.size) : ""));
        return `
      <button type="button" data-mail-attachment-url="/api/mail/${encodeURIComponent(accountId)}/messages/${uid}/attachments/${index}?folder=${encodeURIComponent(S.currentFolder)}" data-mail-attachment-name="${attName}" class="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 hover:bg-accent">
        <i class="ti ti-paperclip text-muted-foreground text-xs"></i>
        <span class="text-xs">${attName}</span>
        <span class="text-[10px] text-muted-foreground">${attSize}</span>
      </button>`;
      })
      .join("");
  } else {
    attachDiv.classList.add("hidden");
  }

  // Store uid for actions
  (window as any)._currentUid = uid;
};

document.addEventListener("click", async (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-mail-attachment-url]");
  if (!button) return;
  button.disabled = true;
  try {
    const response = await fetch(resolvePanelApiPath(button.dataset.mailAttachmentUrl ?? ""), {
      credentials: "include",
      headers: scopeHeaders(),
    });
    if (!response.ok)
      throw new Error(fallback("inbox.downloadAttachmentError", "No se pudo descargar el adjunto"));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = button.dataset.mailAttachmentName ?? "adjunto";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    window.alert(
      error instanceof Error
        ? error.message
        : fallback("inbox.downloadAttachmentError", "No se pudo descargar el adjunto"),
    );
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("#mail-pgp-decrypt")) return;
  const uid = (window as any)._currentUid;
  const input = document.getElementById("mail-pgp-passphrase") as HTMLInputElement | null;
  const error = document.getElementById("mail-pgp-error");
  const button = document.getElementById("mail-pgp-decrypt") as HTMLButtonElement | null;
  if (!uid || !input?.value || !button) return;
  button.disabled = true;
  const gen = openGeneration,
    folder = S.currentFolder;
  const res = await api.post<any>(`/api/mail/${accountId}/messages/${uid}/decrypt`, {
    folder: S.currentFolder,
    passphrase: input.value,
  });
  input.value = "";
  button.disabled = false;
  if (gen !== openGeneration || folder !== S.currentFolder || document.hidden) return;
  if (!res.ok || !res.data) {
    if (error) {
      error.textContent =
        res.error ?? fallback("inbox.decryptMessageError", "No se pudo descifrar el mensaje");
      error.classList.remove("hidden");
    }
    return;
  }
  if (error) error.classList.add("hidden");
  renderMessageBody(res.data);
  const attachDiv = document.getElementById("msg-attachments");
  const list = document.getElementById("attachments-list");
  if (!attachDiv || !list) return;
  const attachments = res.data.attachments ?? [];
  attachDiv.classList.toggle("hidden", attachments.length === 0);
  list.replaceChildren();
  for (const item of attachments) {
    const binary = atob(item.contentBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = item.filename || fallback("inbox.attachmentFilename", "adjunto");
    link.className = "rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent";
    link.textContent = `${item.filename || "adjunto"} (${formatBytes(item.size || bytes.length)})`;
    list.append(link);
    link.addEventListener("click", () => setTimeout(() => URL.revokeObjectURL(url), 30000), { once: true });
  }
});

document.addEventListener("lxp:module:dispose", invalidateMessageLoads);

document.addEventListener("lxp:module:visibility", () => {
  if (document.hidden) {
    resumeUid = reader.isLoading ? S.currentUid : null;
    invalidateMessageLoads();
  } else if (resumeUid !== null && resumeUid === S.currentUid) {
    const uid = resumeUid;
    resumeUid = null;
    void (window as any).openMessage(uid);
  }
});
