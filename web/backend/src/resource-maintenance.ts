// Composition-root endpoint for the installation's finite clock. This narrow
// capability never accepts commands, target credentials or arbitrary jobs.
import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { runOnPanelHost } from "./shared/executor/index.js";
import { aiCronSchedulerService } from "./modules/cron/services/ai-cron-scheduler.service.js";
import { backupSchedulerService } from "./modules/backup/services/scheduler.service.js";
import { serverAlertsWorker } from "./modules/server-alerts/services/server-alerts.worker.js";
import { statsCollectorService } from "./modules/monitor/services/stats-collector.service.js";
import { diagnosticsStore } from "./shared/diagnostics/store.js";
import { clockFile, clockId, recoverClockEvents, pruneClockReceipts, type ClockEvent } from "./resource-clock.js";

let recovered = false;

export function registerResourceMaintenance(app: Express): void {
  if (process.env.DEMAND_RUNTIME_ENABLED !== "1") return;
  if(!recovered && Number(process.env.LISTEN_PID) === process.pid){
    const interrupted = recoverClockEvents();recovered=true;
    if (interrupted) console.error("panel_clock_interrupted_needs_review", interrupted);
  }
  const inFlight = new Map<string, Promise<void>>();
  const tasks: Record<string, (at: Date) => Promise<void>> = {
    cron: at => aiCronSchedulerService._tick(true, at),
    backup: at => backupSchedulerService._tick(at),
    alerts: at => serverAlertsWorker.runOnce(at),
    monitor: () => statsCollectorService.start(),
    diagnostics: async () => { await diagnosticsStore.pruneAll();pruneClockReceipts(); },
  };
  app.post("/_backend-demand/tick", (req, res, next) => {
    const configured = process.env.PANEL_DEMAND_TOKEN;
    const provided = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
    const expectedBytes = Buffer.from(configured ?? ""), suppliedBytes = Buffer.from(provided);
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
    if (!local || !configured || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
      res.status(401).json({ ok: false, error: "unauthorized" }); return;
    }
    const id = req.body?.event;
    if (typeof id !== "string" || !/^(cron|backup|alerts|monitor|diagnostics)-\d{12}$/.test(id) || Object.keys(req.body).length !== 1) {
      res.status(400).json({ ok: false, error: "invalid_maintenance" }); return;
    }
    const pending = clockFile(id,"pending");
    if (fs.existsSync(clockFile(id,"done")) || fs.existsSync(clockFile(id,"needs-review"))) {
      fs.rmSync(pending,{force:true});
      res.status(fs.existsSync(clockFile(id,"done")) ? 200 : 409).json({ ok: fs.existsSync(clockFile(id,"done")) }); return;
    }
    let work = inFlight.get(id);
    if (!work) {
      if (!fs.existsSync(pending)) { res.status(404).json({ ok:false,error:"event_not_pending" });return; }
      let event: ClockEvent;
      try {
        event = JSON.parse(fs.readFileSync(pending,"utf8")) as ClockEvent;
        if (clockId(event) !== id || !Object.hasOwn(tasks,event.kind)) throw new Error("invalid_clock_event");
      } catch {
        fs.renameSync(pending,clockFile(id,"needs-review"));
        res.status(400).json({ok:false,error:"invalid_clock_event"});return;
      }
      fs.renameSync(pending,clockFile(id,"running"));
      const activity = Reflect.get(globalThis,Symbol.for("luxisoft.demand.runtime"));
      const release: () => void = activity?.hold("accepted_panel_maintenance") ?? (() => {});
      work = Promise.resolve().then(() => runOnPanelHost(() => tasks[event.kind]!(new Date(event.at))))
        .then(() => { fs.renameSync(clockFile(id,"running"),clockFile(id,"done")); })
        .catch(error => { if(fs.existsSync(clockFile(id,"running")))fs.renameSync(clockFile(id,"running"),clockFile(id,"needs-review")); throw error; })
        .finally(() => { inFlight.delete(id);release(); });
      inFlight.set(id,work);
    }
    void work.then(() => { res.json({ ok: true }); }, next);
  });
}
