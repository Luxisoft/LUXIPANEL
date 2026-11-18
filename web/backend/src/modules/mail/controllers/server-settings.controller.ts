// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 LUXISOFT
import { usersService } from "../../users/services/users.service.js";
import { z } from "zod";
import { mailConfig } from "../../../config/mail.js";
import { AppError, ErrorCodes } from "../../../shared/errors/index.js";
import { apiModuleMessage } from "../../../shared/i18n/module-messages.js";
import { apiLocaleFromRequest } from "../../../shared/i18n/errors.js";
import { createModuleLogger } from "../../../shared/logger/index.js";
import { asyncHandler } from "../../../shared/types/index.js";
import { getExecutor } from "../../../shared/executor/factory.js";
import { runOnPanelHost } from "../../../shared/executor/context.js";
import { serversService } from "../../servers/services/servers.service.js";
import { viewerOf } from "../../servers/controllers/servers.controller.js";
import { resolveMailServer } from "../services/mail-server-selection.js";
import { isHostingSession } from "../../../shared/tenant/tenant-scope.js";

const selection = z.object({ targetId: z.string().trim().max(128) });
const log = createModuleLogger("mail-server-settings");
async function probeSelection(req: Parameters<typeof resolveMailServer>[0], res: Parameters<typeof resolveMailServer>[1], targetId: string) {
    const executor = await resolveMailServer(req, res, targetId);
    // Establish SSH + verify its fingerprint before the browser switches mail.
    // This probe is read-only; no mail master user is provisioned here.
    try {
      const probe = await executor.exec("true", { timeoutMs: 15000 });
      if (probe.exitCode !== 0) throw new Error("SSH_PROBE_FAILED");
    } catch (error) {
      log.warn({ error, targetId: executor.target.id }, "Mail server SSH probe failed");
      throw new AppError(apiModuleMessage(res.locals.locale ?? apiLocaleFromRequest(req), "mailServerConnectionFailed"), 502, ErrorCodes.SERVICE_UNAVAILABLE);
    }
    return executor;
}
export const mailServerSettingsController = {
  list: asyncHandler(async (req, res) => {
    const current = getExecutor(req).target;
    const targets = isHostingSession(res.locals.user) ? []
      : await runOnPanelHost(() => serversService.list(viewerOf(res)));
    const preferences = await usersService.getPreferences(res.locals.user.userId);
    res.json({ ok: true, data: {
      selectedTargetId: typeof preferences.mailServerTargetId === "string" ? preferences.mailServerTargetId : "",
      current: { id: current.id, name: current.name },
      imapPort: mailConfig.imap.port, smtpPort: mailConfig.smtp.port,
      servers: targets.filter(target => target.enabled && target.hostFingerprint && target.id !== current.id)
        .map(({ id, name, host }) => ({ id, name, host })),
    } });
  }),
  save: asyncHandler(async (req, res) => {
    const { targetId } = selection.parse(req.body);
    await probeSelection(req, res, targetId);
    const selectedTargetId = targetId === getExecutor(req).target.id ? "" : targetId;
    await usersService.updatePreferences(res.locals.user.userId, { mailServerTargetId: selectedTargetId });
    res.json({ ok: true, data: { selectedTargetId } });
  }),
  validate: asyncHandler(async (req, res) => {
    const { targetId } = selection.parse(req.body);
    const executor = await probeSelection(req, res, targetId);
    res.json({ ok: true, data: { targetId: executor.target.id, targetName: executor.target.name } });
  }),
};
