// Finite durable-clock consumer. The API owns the receipt and the work lease;
// this client can disappear without interrupting an accepted operation.
import { readdir, access } from 'node:fs/promises';
import path from 'node:path';
const root=process.env.PANEL_CLOCK_ROOT,token=process.env.PANEL_DEMAND_TOKEN;
if(!root||!path.isAbsolute(root)||!token)throw new Error('private_panel_clock_configuration_required');
for(;;){
 const files=(await readdir(root)).filter(name=>/^(cron|backup|alerts|monitor|diagnostics)-\d{12}\.pending\.json$/.test(name)).sort((a,b)=>a.slice(a.indexOf('-')).localeCompare(b.slice(b.indexOf('-'))));
 if(!files.length)break;
 for(const file of files){
  const event=file.slice(0,-'.pending.json'.length);
  const result=await fetch('http://127.0.0.1:8080/_backend-demand/tick',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({event}),signal:AbortSignal.timeout(7200000)});
  await result.arrayBuffer();
  if(result.status===409){await access(path.join(root,event+'.needs-review.json'));continue;}
  if(!result.ok)throw new Error('panel_clock_delivery_failed_'+result.status);
 }
}
