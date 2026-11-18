// Mailbox inbox viewer — viewer toolbar actions (delete / reply / forward / move
// / refresh / mark-all-read), the move-to-folder dialog, pagination controls and
// the filters + search bar. Owns the debounce timer for search/filter refresh.
import { api } from "/scripts/extracted/lib/mail-api-client.js?v=20260930a";
import { openConfirm } from "/scripts/extracted/lib/confirm.js?v=3";
import { accountId, fallback, PAGE_SIZE, S } from "./state";
import { createMoveDialog } from "./move-dialog";
import { loadFolders } from "./folders";
import { loadMessages } from "./messages";
import { showContextMenu } from "@/lib/context-menu";

// Every action captures the row identity before any confirmation or request.
const moveDialog = createMoveDialog(document, {
  folders: () => S.folders,
  currentFolder: () => S.currentFolder,
  copy: key => fallback(`inbox.moveUi.${key}`, key),
  move: (target, destination) => api.post(`/api/mail/${accountId}/messages/${target.uid}/move`, { folder: target.folder, destFolder: destination }),
  success: target => {
    if (target.folder !== S.currentFolder) return;
    if (S.currentUid === target.uid) {
      S.currentUid = null; (window as any)._currentUid = null;
      document.getElementById("viewer-content")?.classList.add("hidden");
      document.getElementById("viewer-empty")?.classList.remove("hidden");
    }
    void loadMessages({ autoOpenLatest: false }); void loadFolders();
  },
});
export async function performMessageAction(action: string, uid: number, folder: string) {
  if (!uid) return;
  if (action === "open") {
    (window as any).openMessage(uid);
    return;
  }
  if (["reply", "forward", "edit-draft"].includes(action)) {
    const query = new URLSearchParams({ from: accountId, folder });
    query.set(action === "reply" ? "replyTo" : action === "forward" ? "forward" : "draftUid", String(uid));
    window.location.href = "/panel/mail/compose?" + query;
    return;
  }
  if (action === "move") {
    const row = document.querySelector(`[data-mail-uid="${uid}"]`);
    moveDialog.open({ uid, folder,
      account: document.getElementById("account-email")?.textContent?.trim() || accountId,
      subject: row?.querySelector("p")?.textContent || fallback("inbox.noSubject", "Sin asunto"),
    });
    return;
  }
  if (action === "delete") {
    if (
      !(await openConfirm(fallback("inbox.confirm.deleteMessage", "¿Eliminar este mensaje?"), {
        title: fallback("inbox.confirm.deleteMessageTitle", "Eliminar mensaje"),
        variant: "danger",
      }))
    )
      return;
    const result = await api.delete(`/api/mail/${accountId}/messages/${uid}`, { params: { folder } });
    if (result.ok && folder === S.currentFolder) {
      if (S.currentUid === uid) {
        S.currentUid = null;
        (window as any)._currentUid = null;
        document.getElementById("viewer-empty")?.classList.remove("hidden");
        document.getElementById("viewer-content")?.classList.add("hidden");
      }
      void loadMessages({ autoOpenLatest: false });
      void loadFolders();
    }
  }
}
for (const [id, action] of Object.entries({
  "btn-delete-msg": "delete",
  "btn-reply": "reply",
  "btn-forward": "forward",
  "btn-edit-draft": "edit-draft",
  "btn-move": "move",
})) {
  document
    .getElementById(id)
    ?.addEventListener("click", () =>
      performMessageAction(action, (window as any)._currentUid, S.currentFolder),
    );
}
document.getElementById("btn-refresh")?.addEventListener("click", () => {
  void loadFolders();
  void loadMessages({ showLoading: false, autoOpenLatest: false });
});
document.getElementById("btn-mark-all-read")?.addEventListener("click", async () => {
  const folder = S.currentFolder;
  if (
    !(await openConfirm(fallback("inbox.confirm.markAllRead", "¿Marcar todos como leídos?"), {
      title: fallback("inbox.titleMarkAllRead", "Marcar como leídos"),
    }))
  )
    return;
  await api.post(`/api/mail/${accountId}/messages/mark-all-read`, { folder });
  if (folder === S.currentFolder) {
    void loadMessages({ autoOpenLatest: false });
    void loadFolders();
  }
});
const messageList = document.getElementById("messages-list");
const menu = document.createElement("div");
menu.className = "hidden lxp-row-context-menu";
menu.setAttribute("popover", "manual");
menu.setAttribute("role", "menu");
messageList?.parentElement?.append(menu);
let closeMenu: (() => void) | undefined;
function openRowActions(event: MouseEvent | KeyboardEvent) {
  const row = (event.target as Element).closest<HTMLElement>("[data-mail-uid]");
  if (!row) return;
  const uid = Number(row.dataset.mailUid),
    folder = S.currentFolder;
  if (!uid) return;
  event.preventDefault();
  event.stopPropagation();
  closeMenu?.();
  menu.replaceChildren();
  const actions = [
    ["open", "inbox.msgIframeTitle", "Abrir", "mail-opened"],
    ["reply", "inbox.titleReply", "Responder", "arrow-back-up"],
    ["forward", "inbox.titleForward", "Reenviar", "arrow-forward-up"],
    ["move", "inbox.titleMove", "Mover", "folder"],
    ["delete", "inbox.titleDelete", "Eliminar", "trash"],
  ];
  if (S.folders.some((f) => f.path === folder && (f.specialUse === "\\Drafts" || /^drafts$/i.test(f.path))))
    actions.splice(1, 0, ["edit-draft", "inbox.editDraft", "Editar borrador", "pencil"]);
  for (const [action, key, label, icon] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ctx-item" + (action === "delete" ? " text-destructive" : "");
    button.setAttribute("role", "menuitem");
    const i = document.createElement("i");
    i.className = "ti ti-" + icon;
    button.append(i, document.createTextNode(fallback(key, label)));
    button.onclick = () => {
      closeMenu?.();
      if (row.isConnected && folder === S.currentFolder) void performMessageAction(action, uid, folder);
    };
    menu.append(button);
  }
  const rect = row.getBoundingClientRect();
  closeMenu = showContextMenu(
    menu,
    "clientX" in event ? event : { clientX: rect.left + 12, clientY: rect.top + 12 },
  );
  if (!("clientX" in event)) menu.querySelector("button")?.focus();
}
messageList?.addEventListener("contextmenu", openRowActions);
messageList?.addEventListener("keydown", (event) => {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openRowActions(event);
  else if (event.key === "Enter" || event.key === " ") {
    const row = (event.target as Element).closest<HTMLElement>("[data-mail-uid]");
    if (row) {
      event.preventDefault();
      (window as any).openMessage(Number(row.dataset.mailUid));
    }
  }
});
const rowObserver = new MutationObserver(() => closeMenu?.());
if (messageList) rowObserver.observe(messageList, { childList: true });
for (const type of ["lxp:module:visibility", "lxp:module:dispose"])
  document.addEventListener(type, () => closeMenu?.());
document.getElementById("btn-show-folders")?.addEventListener("click", () => {
  const root = document.querySelector("[data-inbox-layout]");
  if (root) (root as HTMLElement).dataset.inboxPane = "folders";
});
// ── Pagination ─────────────────────────────────────────────
document.getElementById("btn-prev-page")?.addEventListener("click", () => {
  if (S.currentPage > 1) {
    S.currentPage--;
    loadMessages();
  }
});
document.getElementById("btn-next-page")?.addEventListener("click", () => {
  if (S.currentPage * PAGE_SIZE < S.totalMessages) {
    S.currentPage++;
    loadMessages();
  }
});

// ── Filters & Search ───────────────────────────────────────
let searchTimeout: ReturnType<typeof setTimeout>;
function queueMessageRefresh() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    S.currentPage = 1;
    loadMessages();
  }, 400);
}

document.getElementById("msg-search")?.addEventListener("input", () => {
  queueMessageRefresh();
});
document.getElementById("msg-filter-email")?.addEventListener("input", queueMessageRefresh);
document.getElementById("msg-filter-date-from")?.addEventListener("change", queueMessageRefresh);
document.getElementById("msg-filter-date-to")?.addEventListener("change", queueMessageRefresh);
document.getElementById("msg-sort-order")?.addEventListener("change", queueMessageRefresh);

document.getElementById("btn-clear-filters")?.addEventListener("click", () => {
  const emailInput = document.getElementById("msg-filter-email") as HTMLInputElement | null;
  const dateFromInput = document.getElementById("msg-filter-date-from") as HTMLInputElement | null;
  const dateToInput = document.getElementById("msg-filter-date-to") as HTMLInputElement | null;
  const sortSelect = document.getElementById("msg-sort-order") as HTMLSelectElement | null;
  const searchInput = document.getElementById("msg-search") as HTMLInputElement | null;

  if (emailInput) emailInput.value = "";
  if (dateFromInput) dateFromInput.value = "";
  if (dateToInput) dateToInput.value = "";
  if (sortSelect) sortSelect.value = "desc";
  if (searchInput) searchInput.value = "";

  S.currentPage = 1;
  loadMessages();
});
