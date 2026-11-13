// Finite metadata scan, without importing the API, AI providers or collectors.
import { env } from "./config/env.js";
import { localExecutor, runOnPanelHost, runWithExecutor, type Executor } from "./shared/executor/index.js";
import { dataStore } from "./shared/data-store/index.js";
import { getVaultExecutor, disposeAllVaultExecutors } from "./shared/executor/vault-executor.js";
import { targetsRepository } from "./modules/servers/repositories/targets.repository.js";
import { getRedis, connectRedis } from "./shared/redis/index.js";
import { dueCron, dueNotification } from "./resource-schedule.js";
import { enqueueClockEvent, type ClockKind } from "./resource-clock.js";

async function main() {
  await connectRedis(env.REDIS_URL);
  const now = new Date(), kinds = new Set<ClockKind>(), probe = process.argv.includes("--probe");
  const add = (kind: ClockKind) => { kinds.add(kind); if(!probe)enqueueClockEvent(kind,now); };
  if(now.getHours()===3 && now.getMinutes()===43)add("diagnostics");
  const rows = (executor: Executor, module: string, collection: string) => dataStore<Record<string, any>>(executor, module, collection).list();
  await runOnPanelHost(async () => {
    const cron = await rows(localExecutor,"cron","ai-agents");
    if (cron.some(job => job.enabled && dueCron(job.schedule || "",now))) add("cron");
    if ((await rows(localExecutor,"monitor","alert-rules")).some(rule => rule.enabled)) add("monitor");
  });
  const inspect = async (executor: Executor) => runWithExecutor(executor, async () => {
    if (executor === localExecutor || env.BACKUP_SCHEDULER_REMOTE_TARGETS) {
      if ((await rows(executor,"backup","schedules")).some(job => job.enabled && dueCron(job.schedule || "",now))) add("backup");
    }
    if (env.SERVER_ALERTS_WORKER_ENABLED) {
      const scheduled = await rows(executor,"server-alerts","scheduled");
      const rules = await rows(executor,"server-alerts","rules");
      if (rules.some(rule => rule.enabled) || scheduled.some(row => dueNotification(row,now))) add("alerts");
    }
  });
  await inspect(localExecutor);
  if (env.BACKUP_SCHEDULER_REMOTE_TARGETS || env.SERVER_ALERTS_WORKER_ENABLED) {
    const targets = await runOnPanelHost(() => targetsRepository.listView());
    for (const target of targets) {
      if (!target.enabled || !target.hostFingerprint) continue;
      try { const executor = await getVaultExecutor(target.id); if (executor) await inspect(executor); }
      catch { console.error("panel_schedule_target_unavailable",target.id); }
    }
  }
  if (process.argv.includes("--probe")) { console.log(JSON.stringify({ dueKinds: [...kinds] })); return; }
}
try { await main(); }
catch { console.error("panel_schedule_scan_failed");process.exitCode=1; }
finally {
  await disposeAllVaultExecutors();
  try { getRedis().disconnect(); } catch { /* connect failed before a client existed */ }
  // Credentials caches also own lazy Redis clients; no daemon survives a scan.
  process.exit(process.exitCode || 0);
}
