// SPDX-License-Identifier: AGPL-3.0-only
import { api } from "/scripts/extracted/lib/mail-api-client.js?v=20260930a";
import { accountId, S } from "./state";
import { loadFolders } from "./folders";
import { loadMessages, invalidateMessageLoads } from "./messages";
let running = false,
  complete = false;
export async function normalizeAccountQuarantine() {
  if (running || complete || document.hidden || S.mailboxCredentialBroken) return;
  running = true;
  try {
    for (let step = 0; step < 1000 && !document.hidden; step++) {
      const result = await api.post<{ folder: string; complete: boolean }>(
        `/api/mail/${accountId}/folders/normalize-quarantine`,
        {},
      );
      if (!result.ok || !result.data || typeof result.data.complete !== "boolean") {
        const status = document.querySelector<HTMLElement>("[data-quarantine-status]");
        if (status && result.status !== 404) {
          status.hidden = false;
          status.textContent = result.error || "Cuarentena";
        }
        return;
      }
      if (result.data.complete) {
        complete = true;
        const legacy =
          S.currentFolder !== result.data.folder &&
          /^(revisar-ia|quarantine|cuarentena)$/i.test(S.currentFolder.split(/[/.]/).pop() || "");
        if (legacy) {
          invalidateMessageLoads();
          S.currentFolder = result.data.folder;
          S.currentUid = null;
          S.currentPage = 1;
        }
        await loadFolders();
        if (legacy) await loadMessages();
        const status = document.querySelector<HTMLElement>("[data-quarantine-status]");
        if (status) status.hidden = true;
        return;
      }
    }
  } finally {
    running = false;
  }
}
document.addEventListener("lxp:module:visibility", () => {
  if (!document.hidden) void normalizeAccountQuarantine();
});
document.getElementById("btn-refresh")?.addEventListener("click", () => void normalizeAccountQuarantine());
