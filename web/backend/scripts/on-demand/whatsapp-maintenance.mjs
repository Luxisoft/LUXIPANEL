// A finite local request wakes the API and stays open until its authorized
// maintenance finishes. No application imports or resident scheduling process.
import { readEnvironment } from './environment.mjs';
const [envFile, kind] = process.argv.slice(2);
if (!['report', 'purge'].includes(kind)) throw new Error('unknown_maintenance');
const env = await readEnvironment(envFile);
if (!env.BRIDGE_DISPATCH_TOKEN) throw new Error('maintenance_auth_not_configured');
if (kind === 'purge') {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  let ready;
  try {
    const servicesEnabled = ['1','true','yes','on'].includes(String(env.WHATSAPP_SERVICES_ENABLED || 'false').toLowerCase());
    ready = (await client.query(`SELECT EXISTS(SELECT 1 FROM whatsapp_webhook_jobs WHERE state='done' AND updated_at<now()-interval '7 days')
      OR ($1::boolean AND EXISTS(SELECT 1 FROM whatsapp_auth_sessions WHERE expires_at<=now())) AS ready`, [servicesEnabled])).rows[0].ready;
  } finally { await client.end(); }
  if (!ready) process.exit(0);
}
const body = { kind };
if (kind === 'report') {
  const cron = (env.REPORT_CRON || '59 23 * * *').split(/\s+/);
  if (cron.length !== 5 || !/^\d+$/.test(cron[0]) || !/^\d+$/.test(cron[1]) || cron.slice(2).some(field => field !== '*')) throw new Error('daily_report_schedule_required');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: env.REPORT_TIMEZONE || 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  if (Number(parts.hour) * 60 + Number(parts.minute) < Number(cron[1]) * 60 + Number(cron[0])) date.setUTCDate(date.getUTCDate() - 1);
  body.date = date.toISOString().slice(0, 10);
}
const response = await fetch('http://127.0.0.1:4010/api/bridge/maintenance', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-dispatch-token': env.BRIDGE_DISPATCH_TOKEN },
  body: JSON.stringify(body), signal: AbortSignal.timeout(600_000)
});
await response.arrayBuffer();
if (!response.ok) throw new Error('maintenance_failed_' + response.status);
