import { it,expect,vi,afterEach } from "vitest";
import fs from "node:fs";import os from "node:os";import path from "node:path";
import express from "express";import request from "supertest";
const mock=vi.hoisted(()=>({cron:vi.fn(),backup:vi.fn(),alerts:vi.fn(),monitor:vi.fn(),prune:vi.fn()}));
vi.mock("./shared/executor/index.js",()=>({runOnPanelHost:(fn:()=>unknown)=>fn()}));
vi.mock("./modules/cron/services/ai-cron-scheduler.service.js",()=>({aiCronSchedulerService:{_tick:mock.cron}}));
vi.mock("./modules/backup/services/scheduler.service.js",()=>({backupSchedulerService:{_tick:mock.backup}}));
vi.mock("./modules/server-alerts/services/server-alerts.worker.js",()=>({serverAlertsWorker:{runOnce:mock.alerts}}));
vi.mock("./modules/monitor/services/stats-collector.service.js",()=>({statsCollectorService:{start:mock.monitor}}));
vi.mock("./shared/diagnostics/store.js",()=>({diagnosticsStore:{pruneAll:mock.prune}}));
import {registerResourceMaintenance}from"./resource-maintenance.js";
import {enqueueClockEvent,clockId,clockFile}from"./resource-clock.js";
let dir:string|undefined;const symbol=Symbol.for("luxisoft.demand.runtime"),oldActivity=Reflect.get(globalThis,symbol);
afterEach(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();Reflect.set(globalThis,symbol,oldActivity);vi.clearAllMocks();});
function setup(){dir=fs.mkdtempSync(path.join(os.tmpdir(),"panel-maint-"));vi.stubEnv("PANEL_CLOCK_ROOT",dir);vi.stubEnv("DEMAND_RUNTIME_ENABLED","1");vi.stubEnv("PANEL_DEMAND_TOKEN","test-private-capability");const app=express();app.use(express.json());registerResourceMaintenance(app);return app;}
it("the finite clock requires its private capability, including for Unicode tokens",async()=>{
 const app=setup();
 expect((await request(app).post("/_backend-demand/tick").send({event:"cron-202611021234"})).status).toBe(401);
 expect((await request(app).post("/_backend-demand/tick").set("Authorization","Bearer é".repeat(22)).send({})).status).toBe(401);
 expect((await request(app).post("/_backend-demand/tick").set("Authorization","Bearer test-private-capability").send({kind:"cron"})).status).toBe(400);
 expect(mock.cron).not.toHaveBeenCalled();
});
it("concurrent deliveries execute once and preserve the work lease until the receipt completes",async()=>{
 const app=setup();let finish!:()=>void,started!:()=>void,releases=0;
 const active=new Promise<void>(resolve=>{started=resolve;});const gate=new Promise<void>(resolve=>{finish=resolve;});
 Reflect.set(globalThis,symbol,{hold(){return()=>{releases++;};}});
 mock.cron.mockImplementation(()=>{started();return gate;});
 const at=new Date(),event=clockId({kind:"cron",at:at.toISOString()});enqueueClockEvent("cron",at);
 const post=()=>request(app).post("/_backend-demand/tick").set("Authorization","Bearer test-private-capability").send({event}).then(r=>r.status);
 const first=post();await active;const second=post();expect(releases).toBe(0);expect(fs.existsSync(clockFile(event,"running"))).toBe(true);
 finish();expect(await first).toBe(200);expect(await second).toBe(200);expect(await post()).toBe(200);
 expect(mock.cron).toHaveBeenCalledTimes(1);expect(releases).toBe(1);expect(fs.existsSync(clockFile(event,"done"))).toBe(true);
});
