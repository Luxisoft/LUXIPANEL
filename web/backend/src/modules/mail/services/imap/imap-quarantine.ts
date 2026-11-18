// SPDX-License-Identifier: AGPL-3.0-only
import type { ImapFlow } from "imapflow";
import { withImap } from "./imap-connection.js";
import { mailConfig } from "../../../../config/mail.js";
import { QUARANTINE_FOLDER, quarantineAliases, folderLeaf } from "../mail-folder-policy.js";
import { AppError } from "../../../../shared/errors/errors.js";
import { getContextExecutor } from "../../../../shared/executor/context.js";
import {
  withResourceCreationLock,
  assertHostingCreationLease,
} from "../../../../shared/quota/resource-creation-lock.js";

/** One resumable step; only native MOVE is used, so an interrupted response cannot duplicate mail. */
export async function normalizeQuarantineStep(
  client: ImapFlow,
  assertLease = () => {},
): Promise<{ folder: string; complete: boolean; moved: number }> {
  const all = await client.list();
  const canonical = QUARANTINE_FOLDER;
  const legacy = all
    .filter((f) => f.path !== canonical && quarantineAliases.has(folderLeaf(f)))
    .sort((a, b) => a.path.length - b.path.length);
  if (!all.some((f) => f.path === canonical)) {
    assertLease();
    if (legacy.length) {
      await client.mailboxRename(legacy[0]!.path, canonical);
      return { folder: canonical, complete: false, moved: 0 };
    }
    await client.mailboxCreate(canonical);
    return { folder: canonical, complete: true, moved: 0 };
  }
  if (!legacy.length) return { folder: canonical, complete: true, moved: 0 };
  const source = legacy[0]!;
  // Move deepest children first, preserving each relative path under Cuarentena.
  const children = all
    .filter((f) => f.path.startsWith(source.path + source.delimiter))
    .sort((a, b) => b.path.length - a.path.length);
  const current = children[0] || source;
  const relative = current.path.slice(source.path.length);
  const destination = canonical + relative;
  if (!all.some((f) => f.path === destination)) {
    assertLease();
    await client.mailboxCreate(destination);
  }
  const lock = await client.getMailboxLock(current.path);
  let moved = 0;
  try {
    const result = await client.search({ all: true }, { uid: true });
    const uids = Array.isArray(result) ? result : [];
    if (uids.length) {
      if (!client.capabilities.has("MOVE"))
        throw new AppError(
          "El servidor no admite MOVE seguro; se conserva la carpeta original",
          409,
          "MAIL_QUARANTINE_MOVE_UNSUPPORTED",
        );
      assertLease();
      const response = await client.messageMove(uids.slice(0, 500), destination, { uid: true });
      if (!response)
        throw new AppError(
          "No se confirmó el movimiento; se conserva la carpeta original",
          409,
          "MAIL_QUARANTINE_MOVE_UNCONFIRMED",
        );
      moved = Math.min(500, uids.length);
    }
    // Never purge an old folder. A fresh search must prove it empty.
    const remaining = await client.search({ all: true }, { uid: true });
    if (!Array.isArray(remaining) || remaining.length) return { folder: canonical, complete: false, moved };
  } finally {
    lock.release();
  }
  assertLease();
  await client.mailboxDelete(current.path);
  return { folder: canonical, complete: false, moved };
}
export async function normalizeQuarantine(address: string, password: string | null) {
  const executor = getContextExecutor();
  return withResourceCreationLock(`${executor?.target.id || "local"}:${address}`, "mail-quarantine", () =>
    withImap(address, password, mailConfig.imap.host, mailConfig.imap.port, (client) =>
      normalizeQuarantineStep(client, assertHostingCreationLease),
    ),
  );
}
export async function ensureCanonicalQuarantine(address: string, password: string | null) {
  for (let step = 0; step < 1000; step++) {
    const result = await normalizeQuarantine(address, password);
    if (result.complete) return result.folder;
  }
  throw new AppError(
    "Quedan carpetas pendientes de unificar; vuelve a abrir la cuenta para continuar",
    409,
    "MAIL_QUARANTINE_PENDING",
  );
}
