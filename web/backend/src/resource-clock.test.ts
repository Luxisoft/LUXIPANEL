import { it,expect,afterEach } from "vitest";
import fs from "node:fs";import os from "node:os";import path from "node:path";
import { enqueueClockEvent,clockId,clockFile,recoverClockEvents } from "./resource-clock.js";
import { dueCron,dueNotification } from "./resource-schedule.js";
let directory:string|undefined;const previous=process.env.PANEL_CLOCK_ROOT;
afterEach(()=>{if(directory)fs.rmSync(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.PANEL_CLOCK_ROOT;else process.env.PANEL_CLOCK_ROOT=previous;});
it("accepted schedule events are complete, durable and deduplicated across state changes",()=>{
 directory=fs.mkdtempSync(path.join(os.tmpdir(),"panel-clock-"));process.env.PANEL_CLOCK_ROOT=directory;
 const at=new Date("2026-11-02T12:34:00Z"),id=clockId({kind:"cron",at:at.toISOString()});
 enqueueClockEvent("cron",at);enqueueClockEvent("cron",at);
 expect(fs.readdirSync(directory)).toEqual([id+".pending.json"]);
 expect(JSON.parse(fs.readFileSync(clockFile(id,"pending"),"utf8"))).toEqual({kind:"cron",at:at.toISOString()});
 fs.renameSync(clockFile(id,"pending"),clockFile(id,"running"));
 expect(recoverClockEvents()).toBe(1);enqueueClockEvent("cron",at);
 expect(fs.readdirSync(directory)).toEqual([id+".needs-review.json"]);
 expect(()=>clockFile("../other","pending")).toThrow();
});
it("aliases, six-field schedules, time zones and one-shot notification guards remain intact",()=>{
 const at=new Date("2026-11-02T05:00:00Z");
 expect(dueCron("@daily",at,"America/Bogota")).toBe(true);
 expect(dueCron("0 0 0 * * *",at,"America/Bogota")).toBe(true);
 expect(dueCron("@reboot",at)).toBe(false);
 expect(dueNotification({enabled:true,scheduleAt:at.toISOString()},at)).toBe(true);
 expect(dueNotification({enabled:true,scheduleAt:at.toISOString(),lastFiredAt:at.toISOString()},at)).toBe(false);
 expect(dueNotification({enabled:true,cron:"* * * * *",lastFiredAt:"invalid"},at)).toBe(true);
});
