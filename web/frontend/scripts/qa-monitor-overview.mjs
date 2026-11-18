// Actual module views with synthetic context; no backend operations.
// Run: node scripts/qa-monitor-overview.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const replayHistory=process.env.MONITOR_REAL_HISTORY?JSON.parse(readFileSync(process.env.MONITOR_REAL_HISTORY,'utf8')):null;
import {internalModuleControllers} from './internal-module-controllers.mjs';
const frontend = path.resolve(import.meta.dirname, '..');
const artifacts = process.env.MONITOR_QA_ARTIFACTS || '/tmp';
const require = createRequire(path.join(frontend, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const { default: tailwind } = await import(require.resolve('@tailwindcss/vite'));
const { chromium, expect } = require('@playwright/test');
const entry = `
import {createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {createViewContext,InternalViewContext} from '/src/components/workspace/view-context.tsx';
import {createControllerScope} from '/src/components/workspace/controller-scope.ts';
import {mountModuleTopbar} from '/src/components/workspace/module-topbar.ts';
import '/src/styles/starwind.css';import '/src/styles/panel-workspace.css';
const name=new URLSearchParams(location.search).get('module')||'users';
const initialView=new URLSearchParams(location.search).get('view')||'processes';
const messages=Object.fromEntries(Object.entries(import.meta.glob('/src/i18n/es/*.ts',{eager:true,import:'default'})).map(([key,value])=>[key.split('/').pop().replace('.ts',''),value]));
const views={users:()=>import('/src/components/workspace/views/pages_panel_users_index.tsx'),backups:()=>import('/src/components/workspace/views/pages_panel_backups_index.tsx'),expo:()=>import('/src/components/workspace/views/pages_panel_expo_index.tsx'),monitor:()=>import('/src/components/workspace/views/pages_panel_monitor_index.tsx'),webhooks:()=>import('/src/components/workspace/views/pages_panel_webhooks_index.tsx'),cloudflare:()=>import('/src/components/workspace/views/pages_panel_cloudflare_index.tsx')};
const root=document.getElementById('module');root.dataset.internalModule=name;document.getElementById('drawer').dataset.module=name;
root.innerHTML='';const scope=createControllerScope(root,new URL('/panel/'+name+'?workspaceView='+initialView,location.href));
const context=createViewContext({scope,url:new URL('/panel/'+name+'?workspaceView='+initialView,location.href),user:{kind:'admin',username:'admin',modules:['*'],permissions:{actions:['*'],views:['*']}},locale:'es',messages,params:{}});
const View=(await views[name]()).default;createRoot(root).render(h(InternalViewContext.Provider,{value:context},h(View)));
setTimeout(async()=>{mountModuleTopbar(root,document.getElementById('drawer')); const controller=await import('virtual:lxp-controller/pages_panel_monitor_index');controller.mount(scope);window.qa={scope};},250);
`;
const server = await createServer({configFile:false,envDir:false,root:frontend,publicDir:'public',cacheDir:artifacts+'/lxp-users-qa-vite',
 optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-table']},
 resolve:{dedupe:['react','react-dom'],alias:[{find:/^react$/,replacement:require.resolve('react')},{find:/^react-dom$/,replacement:require.resolve('react-dom')},{find:'@',replacement:path.join(frontend,'src')}]},plugins:[internalModuleControllers(),{name:'fixture',resolveId:id=>id==='/qa.js'?'\0qa.js':null,load:id=>id==='\0qa.js'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/?')&&req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="es" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="drawer" class="lxp-workspace-quick-drawer" data-open="true" data-module="users"><section class="lxp-workspace-quick-sheet"><header class="lxp-workspace-quick-header"><div data-module-header-tabs-slot class="lxp-workspace-header-tabs"></div><div data-module-header-controls-slot class="lxp-workspace-header-controls"></div><div data-module-header-table-slot class="lxp-workspace-header-controls"></div><div data-module-header-native-slot class="lxp-workspace-header-controls"></div><div class="ml-auto flex items-center gap-2"><div data-module-header-actions-slot class="lxp-workspace-header-actions"></div><button class="lxp-workspace-header-settings">Configuración</button><button class="lxp-workspace-quick-close" aria-label="Cerrar">×</button></div></header><div class="lxp-workspace-quick-body"><div id="module" class="lxp-internal-module" data-internal-module="users"><div><div><button id="tab-users" class="tab-btn text-primary">Usuarios <span>12</span></button><button id="tab-roles" class="tab-btn">Grupos <span>3</span></button></div><div><button id="btn-new-user" class="bg-primary">Nuevo usuario</button><button id="btn-hosting-plans">Permisos de usuarios</button><button id="btn-new-role" class="bg-primary" style="display:none">Nuevo grupo</button></div></div><div id="tables" class="p-4"></div></div></div></section></div><script type="module" src="/qa.js"></script></body></html>`);});}},tailwind()],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap={ts:Date.now(),cpu:{usagePercent:42.3,loadAvg1m:1.24,loadAvg5m:1.08,loadAvg15m:.86},memory:{usagePercent:63.7,totalBytes:8589934592,usedBytes:5471788400,freeBytes:3118146192},disk:{usagePercent:36.2,totalBytes:214748364800,usedBytes:77738908000,availableBytes:137009456800},network:{rxBytesPerSec:1250000,txBytesPerSec:284000},uptime:923400,topProcesses:{cpu:[{pid:20,name:'node-server-with-a-very-long-process-name',cpu:24.2,mem:4.6},{pid:21,name:'postgres',cpu:12.4,mem:12},{pid:22,name:'nginx',cpu:3.1,mem:1.2}],mem:[{pid:21,name:'postgres',cpu:12.4,mem:12},{pid:20,name:'node',cpu:24.2,mem:4.6},{pid:22,name:'nginx',cpu:3.1,mem:1.2}]}};
 for (const kind of ['cpu','mem']) snap.topProcesses[kind]=Array.from({length:25},(_,i)=>({pid:100+i,name:'process-'+i,cpu:25-i,mem:25-i}));
 let folderCalls=0;let folderFail=true;let historyReady=false;let historyFail=false;let serviceCalls=0;
 await page.route('**/api/**',route=>{
  const url=route.request().url();let data={};
  if(url.includes('/monitor/snapshot'))data=snap;
  else if(url.includes('/dashboard/overview')){folderCalls++;data=folderFail?{disk:{ok:false,error:'measurement failed'}}:{disk:{data:{topFolders:[{path:'/var/lib',bytes:26000000000},{path:'/var/www',bytes:14000000000},{path:'/usr',bytes:9000000000}]}}};}
  else if(url.includes('/monitor/history')){
   if(historyFail)return route.fulfill({status:503,json:{ok:false,error:'History unavailable'}});
   const fromTs=Number(new URL(url).searchParams.get('from'));const toTs=Number(new URL(url).searchParams.get('to'));
   const metrics={cpu:42.3,ram:63.7,disk:36.2,rx:1250000,tx:284000};
   data={fromTs,toTs,bucketMs:60000,totalSamples:historyReady?1:0,firstTs:historyReady?toTs-1000:null,lastTs:historyReady?toTs-1000:null,latestSnapshot:historyReady?{...snap,ts:toTs-1000}:null,summary:historyReady?Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,{latest:v,average:v,maximum:v}])):null,buckets:historyReady?[{index:0,fromTs,toTs,sampleCount:1,average:metrics,maximum:metrics}]:[],peaks:{cpu:[],ram:[],disk:[],rx:[],tx:[]}};
  }
  else if(url.includes('/monitor/services')){serviceCalls++;data=Array.from({length:17},(_,i)=>({name:i===0?'nginx':'service-'+i,active:i%2===0,installed:true}));}
  else if(url.includes('/monitor/watchdog'))data={config:{enabled:false,cpuPercent:null,memPercent:null},status:{lastTriggeredAt:null}};
  else if(url.includes('/monitor/assistant-admission'))data={config:{memPercent:80}};
  else if(url.includes('/monitor/system'))data={memory:{usagePercent:'63.7'}};
  else if(url.includes('/monitor/processes'))data={processes:[]};
  else if(url.includes('/auth/ws-token'))data={token:'fixture',expiresAt:Date.now()+600000};
  if(process.env.MONITOR_GAP_QA && historyReady && url.includes('/monitor/history')){
    const metrics={cpu:42.3,ram:63.7,disk:36.2,rx:1250000,tx:284000};
    data.buckets=[0,8,26].map(index=>({index,fromTs:data.fromTs+index*60000,toTs:data.fromTs+(index+1)*60000,sampleCount:1,average:metrics,maximum:metrics}));data.totalSamples=3;data.firstTs=data.fromTs+1000;data.lastTs=data.fromTs+26*60000+1000;
  }
  if(replayHistory && historyReady && url.includes('/monitor/history'))data=replayHistory;
  return route.fulfill({json:{ok:true,success:true,data}});
 });
 let socket;await page.routeWebSocket(/\/api\/monitor\/ws/,ws=>{socket=ws;ws.send(JSON.stringify({type:'connected'}));});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module=monitor');
 await page.waitForFunction(()=>!!window.qa);
 await expect(page.locator('#stat-cpu')).toHaveText('42.3');
 await expect(page.locator('#proc-updated')).toBeHidden();
 await expect(page.locator('header #proc-live-controls')).toHaveCount(0);
 await expect(page.locator('header [aria-label="Actualizar"]')).toHaveCount(0);
 await expect(page.locator('.monitor-process-toolbar #btn-refresh-procs')).toBeVisible();
 await expect(page.locator('#monitor-panel-processes h2')).toHaveCount(0);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
  const row=await page.locator('.monitor-process-toolbar').evaluate(el=>{
    const rect=el.getBoundingClientRect();
    const controls=['proc-sort-cpu','proc-sort-mem','proc-mode-live','proc-history-select'].map(id=>{
      const r=document.getElementById(id).getBoundingClientRect();return r.y+r.height/2;
    });
    return {height:rect.height,centers:controls};
  });
  expect(row.height).toBeLessThan(60);
  expect(Math.max(...row.centers)-Math.min(...row.centers)).toBeLessThan(3);
  await page.screenshot({path:artifacts+'/monitor-process-toolbar-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#proc-sort-mem').click();
 await page.locator('#proc-sort-cpu').click();
 expect(folderCalls).toBe(0);
 await page.getByRole('tab',{name:'Monitor del Sistema',exact:true}).click();
 await expect(page.locator('#monitor-folders-retry')).toBeVisible();
 folderFail=false;
 await page.locator('#monitor-folders-retry').click();
 await expect(page.locator('#monitor-top-folders > div')).toHaveCount(3);
 await expect(page.locator('#monitor-folders-retry')).toBeHidden();

 for(let i=0;i<40;i++){
   const sample={...snap,ts:snap.ts+i*5000,cpu:{...snap.cpu,usagePercent:30+Math.sin(i/3)*20},network:{rxBytesPerSec:1000000+Math.sin(i/4)*500000,txBytesPerSec:200000+Math.cos(i/3)*100000}};
   socket.send(JSON.stringify({type:'stats',data:sample}));
 }
 await expect(page.locator('[data-overview-wait="cpu"]')).toBeHidden();
 await expect(page.locator('#overview-processes-cpu > div')).not.toHaveCount(3);
 for(const theme of ['dark','light'])for(const [width,height,cols] of [[1440,900,3],[1366,768,3],[768,1024,2],[390,844,1]]){
  await page.setViewportSize({width,height});await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);await page.waitForTimeout(180);
  const layout=await page.locator('.monitor-overview-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,bottom:el.getBoundingClientRect().bottom,overflow:el.scrollWidth>el.clientWidth}));
  const capacity=await page.locator('#overview-processes-cpu').evaluate(el=>Math.min(25,Math.max(1,Math.floor(el.clientHeight/26))));
  await expect(page.locator('#overview-processes-cpu > div')).toHaveCount(capacity);
  expect(layout.columns).toBe(cols);expect(layout.overflow).toBe(false);
  if(cols===3)expect(Math.abs(layout.bottom-height)).toBeLessThan(48);
  await page.screenshot({path:artifacts+'/monitor-overview-'+theme+'-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Ver procesos',exact:true}).click();
 await expect(page.locator('[data-module-section="processes"]')).toBeVisible();
 await page.getByRole('tab',{name:'Monitor del Sistema',exact:true}).click();
 await expect(page.locator('.monitor-overview-grid')).toBeVisible();
 // Exercise every drawer tab, including clicks on content rather than buttons.
 await page.getByRole('tab',{name:'Historial',exact:true}).click();
 await expect(page.locator('#history-overlay')).toContainText('El historial aparecerá');
 await expect(page.locator('#history-gap-track span')).toHaveCount(1);
 await expect(page.locator('#history-gap-legend')).toBeVisible();
 await page.locator('#history-overlay').click();
 await expect(page.locator('[data-module-section="history"]')).toBeVisible();
 historyReady=true;
 await page.getByRole('tab',{name:'Monitor del Sistema',exact:true}).click();
 await page.getByRole('tab',{name:'Historial',exact:true}).click();
 await expect(page.locator('#history-overlay')).toBeHidden();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.locator('#chart-history').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
  await page.screenshot({path:artifacts+'/monitor-history-after-'+width+'.png'});
  const box=await page.locator('#chart-history').evaluate(el=>({width:el.width,cssWidth:el.clientWidth,height:el.height,parentHeight:el.parentElement.clientHeight}));
  expect(Math.abs(box.width-box.cssWidth)).toBeLessThan(2);expect(Math.abs(box.height-box.parentHeight)).toBeLessThan(2);
  const visiblePointPixels=await page.locator('#chart-history').evaluate(el=>{
   const data=el.getContext('2d').getImageData(0,120,el.width,el.height-150).data;let colored=0;
   for(let i=0;i<data.length;i+=4)if((data[i]>150&&data[i+1]>70&&data[i+1]<200&&data[i+2]<120)||(data[i]>120&&data[i+1]<130&&data[i+2]>160))colored++;
   return colored;
  });
  expect(visiblePointPixels).toBeGreaterThan(5);
  if(process.env.MONITOR_GAP_QA){
    await expect(page.locator('#history-gap-legend')).toBeVisible();
    const rect=await page.locator('#chart-history').boundingBox();
    await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.5);
    await expect(page.locator('#history-gap-tooltip')).toContainText('Sin datos');
    await expect(page.locator('#history-gap-tooltip')).toContainText('17 min');
    expect(await page.locator('#history-gap-tooltip').textContent()).not.toContain('%');
    await page.mouse.click(rect.x+rect.width*.35,rect.y+rect.height*.5);
    await expect(page.locator('[data-module-section="history"]')).toBeVisible();
    const red=await page.locator('#chart-history').evaluate(el=>{const rgba=el.getContext('2d').getImageData(0,120,el.width,el.height-150).data;let count=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]>200&&rgba[i+1]<130&&rgba[i+2]<130)count++;return count;});
    expect(red).toBeGreaterThan(10);
    await page.mouse.move(0,0);
  }
  await page.locator('#chart-history').screenshot({path:artifacts+'/monitor-history-chart-'+width+'.png'});
 }
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
  for(const id of ['chart-mem','chart-disk','chart-procs','chart-net']){
   await page.locator('#'+id).scrollIntoViewIfNeeded();
   await page.locator('#'+id).locator('xpath=../../..').screenshot({path:artifacts+'/history-'+id+'-'+width+'.png'});
  }
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#chart-history').click({position:{x:30,y:30}});
 await expect(page.locator('[data-module-section="history"]')).toBeVisible();
 if(process.env.MONITOR_GAP_QA){
  await page.locator('#cmp-toggle').click();
  await expect(page.locator('#history-overlay')).toBeHidden();
  const rect=await page.locator('#chart-history').boundingBox();
  await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.5);
  await expect(page.locator('#history-gap-tooltip')).toContainText('anterior');
  await page.locator('#cmp-toggle').click();
  await expect(page.locator('#history-overlay')).toBeHidden();
 }
 await page.locator('.range-btn[data-range="6h"]').click();
 await expect(page.locator('#history-overlay')).toBeHidden();
 historyFail=true;
 await page.locator('.range-btn[data-range="24h"]').click();
 await expect(page.locator('#history-overlay')).toContainText('No se pudo cargar');
 historyFail=false;
 await page.locator('.range-btn[data-range="1h"]').click();
 await expect(page.locator('#history-overlay')).toBeHidden();
 await page.getByRole('tab',{name:'Estado de servicios',exact:true}).click();
 await expect(page.locator('#services-list')).toContainText('nginx');
 await page.locator('#services-list').getByText('nginx',{exact:true}).click();
 await expect(page.locator('[data-module-section="services"]')).toBeVisible();
 await page.locator('[data-svc-filter="inactive"]').click();
 await expect(page.locator('#services-list')).toContainText('service-1');
 await expect(page.locator('[data-module-section="services"]')).toBeVisible();
 await page.locator('[data-svc-filter="all"]').click();
 await expect(page.locator('.monitor-service-row')).toHaveCount(17);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(160);
  const layout=await page.locator('.monitor-services-workspace').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length}));
  expect(layout.overflow).toBe(false);expect(layout.columns).toBe(width===1440?2:1);
  await page.screenshot({path:artifacts+'/monitor-services-after-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 expect(serviceCalls).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'Monitor del Sistema',exact:true}).click();
 await page.evaluate(()=>{window.qa.scope.setVisible(false);window.qa.scope.setVisible(true);});
 await page.evaluate(()=>window.qa.scope.dispose());
 await page.reload();await page.waitForFunction(()=>!!window.qa);
 await expect(page.locator('#stat-cpu')).toHaveText('42.3');
 await page.getByRole('tab',{name:'Monitor del Sistema',exact:true}).click();
 await expect(page.locator('[data-overview-wait="cpu"]')).toBeVisible();
 await page.evaluate(()=>window.qa.scope.dispose());
 for(const view of ['history','services']){
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module=monitor&view='+view);
  await page.waitForFunction(()=>!!window.qa);
  await expect(page.locator('[data-module-section="'+view+'"]')).toBeVisible();
  if(view==='history')await expect(page.locator('#history-overlay')).toBeHidden();
  else await expect(page.locator('#services-list')).toContainText('nginx');
  await page.locator('[data-module-section="'+view+'"] h2').first().click();
  await expect(page.locator('[data-module-section="'+view+'"]')).toBeVisible();
  await page.evaluate(()=>window.qa.scope.dispose());
 }
 expect(errors).toEqual([]);console.log('Monitor overview: live charts, six cards, eight responsive/theme layouts, navigation and disposal OK');

} finally {await browser?.close();await server.close();}
