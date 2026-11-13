import { cronMatches } from "./shared/cron/cron-match.js";
import { CRON_ALIASES } from "./modules/cron/constants.js";
export function dueCron(schedule: string, now: Date, clock: "local" | "utc" | (string & {}) = "local") {
  let expression = CRON_ALIASES[schedule.trim()] ?? schedule.trim();
  const fields = expression.split(/\s+/);
  if (fields.length === 6) expression = fields.slice(1).join(" ");
  return expression !== "@reboot" && cronMatches(expression, now, clock);
}
export function dueNotification(row: Record<string, any>, now: Date) {
  if (!row.enabled) return false;
  if (row.cron) {
    if(!dueCron(row.cron,now,row.timeZone || "utc"))return false;
    const last=row.lastFiredAt ? new Date(row.lastFiredAt).getTime() : NaN;
    return !Number.isFinite(last) || now.getTime()-last>=60000;
  }
  return !row.lastFiredAt && row.scheduleAt && new Date(row.scheduleAt).getTime() <= now.getTime();
}
