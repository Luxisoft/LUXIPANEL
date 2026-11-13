import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
export const clockKinds = ["cron","backup","alerts","monitor","diagnostics"] as const;
export type ClockKind = typeof clockKinds[number];
export type ClockEvent = { kind: ClockKind; at: string };
export function clockRoot() {
  const root = process.env.PANEL_CLOCK_ROOT;
  if (!root || !path.isAbsolute(root)) throw new Error("private_clock_directory_required");
  fs.mkdirSync(root,{recursive:true,mode:0o700});return root;
}
export function clockId(event: ClockEvent) {
  if (!clockKinds.includes(event.kind) || !Number.isFinite(Date.parse(event.at))) throw new Error("invalid_clock_event");
  return event.kind + "-" + new Date(event.at).toISOString().slice(0,16).replace(/[-:T]/g,"");
}
export function clockFile(id: string, state: string) {
  if (!/^(cron|backup|alerts|monitor|diagnostics)-\d{12}$/.test(id) || !["pending","running","done","needs-review"].includes(state)) throw new Error("invalid_clock_event");
  return path.join(clockRoot(),id+"."+state+".json");
}
export function enqueueClockEvent(kind: ClockKind, now: Date) {
  const event={kind,at:now.toISOString()},id=clockId(event);
  if (["pending","running","done","needs-review"].some(state=>fs.existsSync(clockFile(id,state))))return;
  const stage=path.join(clockRoot(),".stage-"+randomUUID());
  fs.writeFileSync(stage,JSON.stringify(event),{mode:0o600});
  try{fs.linkSync(stage,clockFile(id,"pending"));}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  finally{fs.unlinkSync(stage);}
}
export function recoverClockEvents() {
  let interrupted=0;
  for(const file of fs.readdirSync(clockRoot()))if(file.endsWith(".running.json")){
    const id=file.slice(0,-".running.json".length);
    fs.renameSync(clockFile(id,"running"),clockFile(id,"needs-review"));interrupted++;
  }
  return interrupted;
}
export function pruneClockReceipts(before = Date.now()-7*86400000) {
  for(const file of fs.readdirSync(clockRoot()))if(file.endsWith(".done.json")){
    const target=clockFile(file.slice(0,-".done.json".length),"done");
    if(fs.statSync(target).mtimeMs<before)fs.unlinkSync(target);
  }
}
