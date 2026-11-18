// Actual module views with synthetic context; no backend operations.
// Run: node scripts/qa-module-drawers.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {internalModuleControllers} from './internal-module-controllers.mjs';
const terminalTools = process.argv.includes("--terminal-tools");
const reactSettingsAudit=process.argv.includes('--react-settings-audit');
const settingsAudit = process.argv.includes("--settings-audit");
const settingsChecks=[];
const mailController = process.argv.includes('--mail-controller');
const contentReview = process.argv.includes('--content-review');
const reviewRows = [], reviewFindings = [];
function reviewCheck(ok,message,details){if(!ok)reviewFindings.push({message,...details});}
const paneSelector = '[data-mail-main-panel],.tab-panel,[data-module-section],[role=tabpanel],[data-mail-spam-view],[data-preferences-panel],[data-settings-panel]';
const nginxController = process.argv.includes('--nginx-controller');
const repositoryController = process.argv.includes('--repository-controller');
const frontend = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(frontend, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const { default: tailwind } = await import(require.resolve('@tailwindcss/vite'));
const { chromium, expect } = require('@playwright/test');
const registrySource=readFileSync(path.join(frontend,'src/components/workspace/module-registry.ts'),'utf8');
const registeredViews=Object.fromEntries([...registrySource.matchAll(/^  (?:"([^"]+)"|(\w+)): \{([\s\S]*?)^  \},/gm)].map(m=>[m[1]||m[2], '/src/components/workspace/views/'+m[3].match(/load:.*import\("\.\/views\/([^"]+)"/)[1]+'.tsx']));
const spacingAudit=process.argv.includes('--spacing-audit');
const auditOnly=process.argv.includes('--intro-audit')||spacingAudit||contentReview||settingsAudit;
const qaLocale=process.env.LXP_QA_LOCALE||'es';
const entry = `
import {createElement as h,Fragment} from 'react';
import {createRoot} from 'react-dom/client';
import ModuleTopbar from '/src/components/workspace/ModuleTopbar.tsx';
import {useRef,useState} from 'react';
import {createViewContext,InternalViewContext} from '/src/components/workspace/view-context.tsx';
import {createControllerScope} from '/src/components/workspace/controller-scope.ts';
import {mountInboxTopbar} from '/src/components/workspace/inbox-topbar.ts';
import {mountModuleTopbar} from '/src/components/workspace/module-topbar.ts';
import {mountModuleAiFooter} from '/src/lib/module-ai-footer.ts';
import '/src/styles/modal-drawer.css';import '/src/styles/starwind.css';import '/src/styles/panel-workspace.css';import '/src/styles/reactbits-controls.css';
import { startNativeControls } from '/src/components/reactbits-controls/native-controls.ts';
startNativeControls();
const name=new URLSearchParams(location.search).get('module')||'users';
const messages=Object.fromEntries(Object.entries(import.meta.glob('/src/i18n/${qaLocale}/*.ts',{eager:true,import:'default'})).map(([key,value])=>[key.split('/').pop().replace('.ts',''),value]));
const loaders=import.meta.glob('/src/components/workspace/views/pages_panel_*.tsx');
const views=Object.fromEntries(Object.entries(${JSON.stringify(registeredViews)}).map(([name,file])=>[name,loaders[file]]));
createRoot(document.querySelector('header').parentElement.insertBefore(document.createElement('div'),document.querySelector('header'))).render(h(ModuleTopbar,{title:name,moduleKey:name,labels:{search:'Buscar y filtrar',filters:'Filtros',actions:'Acciones',context:'Contexto',tools:'Herramientas',settings:'Configuración',close:'Cerrar'},settingsAvailable:true,onSettings:()=>document.querySelector('[data-view-settings-modal] > button,#mail-settings-modal-trigger,[data-module-toolbar] button')?.click(),onClose:()=>{}}));
document.querySelector('header').remove();
const root=document.getElementById('module');const body=document.createElement('div');body.className='lxp-workspace-quick-body';root.before(body);body.append(root);root.dataset.internalModule=name;document.getElementById('drawer').dataset.module=name;
root.innerHTML='';const scope=createControllerScope(root,new URL('/panel/'+name,location.href));
const context=createViewContext({scope,url:new URL('/panel/'+name,location.href),user:{kind:new URLSearchParams(location.search).has('hosting')?'hosting':'admin',username:'admin',modules:['*'],permissions:{sidebar:['*'],actions:['*'],views:['*']}},locale:'${qaLocale}',messages,params:{id:'qa',owner:'qa',repo:'sample'}});
const View=(await views[name]()).default;createRoot(root).render(h(InternalViewContext.Provider,{value:context},h(View)));
setTimeout(async()=>{if(${settingsAudit})document.getElementById('drawer').setAttribute('data-workspace-shell','');await import('/src/scripts/extracted/components/ui/view-settings-modal.ts');if(new URLSearchParams(location.search).has('controller')){try{const factory=name==='mail'?await import('virtual:lxp-controller/pages_panel_mail_index'):name==='nginx'?await import('virtual:lxp-controller/pages_panel_nginx_index'):await import('virtual:lxp-controller/pages_panel_repository_store_index');factory.mount(scope);scope.mounted();}catch(error){window.qaError=String(error);throw error;}}name==='mail/[id]/inbox'?mountInboxTopbar(scope,messages.mail.inbox):mountModuleTopbar(root,document.getElementById('drawer'));const footer=document.createElement('footer');footer.className='lxp-workspace-module-ai-footer';document.querySelector('.lxp-workspace-quick-sheet').append(footer);mountModuleAiFooter(footer,scope.document);window.qa={scope,messages,seedTools:async()=>{const {S}=await import('/src/scripts/extracted/components/floating-terminal/state.ts');const {renderSnippetUI}=await import('/src/scripts/extracted/components/floating-terminal/snippets.ts');S.snippetState={categories:[{id:1,name:'Sistema'}],tags:[],snippets:[{id:7,name:'Verificar estado del servicio NGINX con un nombre de comando largo',command:'systemctl status nginx',categoryId:1,tagIds:[]}]};renderSnippetUI();},openAssistant:async()=>{const {AssistantSettingsModal}=await import('/src/components/floating-assistant/AssistantSettingsModal.tsx');const host=document.createElement('div');document.body.append(host);function Probe(){const [open,setOpen]=useState(true),[section,setSection]=useState('general');return h(AssistantSettingsModal,{open,section,locale:'es',config:null,dataTableI18n:messages.components.dataTable,onClose:()=>setOpen(false),onSectionChange:setSection,onConfigChange:()=>{}});}createRoot(host).render(h(Probe));}};},250);
`;
const server = await createServer({configFile:false,envDir:false,root:frontend,publicDir:'public',cacheDir:path.join(frontend,'.cache/topbar-qa-vite'),
 optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-table','motion/react','motion','clsx','mermaid','tailwind-merge','vaul','@hugeicons/core-free-icons','@xterm/xterm','@xterm/addon-fit','@xterm/addon-web-links']},
 resolve:{dedupe:['react','react-dom'],alias:[{find:/^react$/,replacement:require.resolve('react')},{find:/^react-dom$/,replacement:require.resolve('react-dom')},{find:'@',replacement:path.join(frontend,'src')}]},plugins:[{name:'qa-lazy-public-imports',enforce:'pre',transform(code,id){if(id.includes('virtual:lxp-controller/')||id.endsWith('/floating-terminal/editor.ts'))return code.replace(/(?<!typeof )import\(\s*("\/scripts\/[^"]+")\s*\)/g,'import(/* @vite-ignore */ String($1))');}},internalModuleControllers(),{name:'fixture',resolveId:id=>id==='/qa.js'?'\0qa.js':null,load:id=>id==='\0qa.js'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/?')&&req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="es" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="drawer" class="lxp-workspace-quick-drawer" data-open="true" data-module="users"><section class="lxp-workspace-quick-sheet"><header class="lxp-workspace-quick-header"><div data-module-header-tabs-slot class="lxp-workspace-header-tabs"></div><div data-module-header-controls-slot class="lxp-workspace-header-controls"></div><div data-module-header-table-slot class="lxp-workspace-header-controls"></div><div data-module-header-native-slot class="lxp-workspace-header-controls"></div><div class="ml-auto flex items-center gap-2"><div data-module-header-actions-slot class="lxp-workspace-header-actions"></div><button class="lxp-workspace-header-settings">Configuración</button><button class="lxp-workspace-quick-close" aria-label="Cerrar">×</button></div></header><div id="module" class="lxp-internal-module" data-internal-module="users"><div><div><button id="tab-users" class="tab-btn text-primary">Usuarios <span>12</span></button><button id="tab-roles" class="tab-btn">Grupos <span>3</span></button></div><div><button id="btn-new-user" class="bg-primary">Nuevo usuario</button><button id="btn-hosting-plans">Permisos de usuarios</button><button id="btn-new-role" class="bg-primary" style="display:none">Nuevo grupo</button></div></div><div id="tables" class="p-4"></div></div></section></div><script type="module" src="/qa.js"></script></body></html>`);});}},tailwind()],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
 if(terminalTools){const source=readFileSync(path.join(frontend,'src/i18n/es/terminal.ts'),'utf8');const terminalMessages=JSON.parse(source.slice(source.indexOf('{'),source.lastIndexOf('}')+1));await page.route('**/i18n/**/terminal.json',route=>route.fulfill({json:terminalMessages}));}
 let nginxReads=[];
 if(nginxController)await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;nginxReads.push(path);
  const data=path.includes('/system-deps/')?{module:'nginx',dependencies:[{key:'nginx',installed:true,optional:false}],allRequiredInstalled:true,anyInstalled:true}:path.endsWith('/status')?{running:true,version:'nginx/1.26',enabledSites:1,availableSites:1,configTest:{ok:true}}:path.endsWith('/sites')&&!path.includes('renewal')?[{name:'example.test',enabled:true,ssl:true,domains:['example.test']}]:path.endsWith('/performance')?{gzip:true,workerProcesses:'auto',workerConnections:1024}:path.endsWith('/config')?{content:'worker_processes auto;'}:path.endsWith('/logs')?{lines:Array.from({length:150},(_,i)=>'Log '+i).join('\n'),path:'/var/log/nginx/error.log'}:path.includes('renewal')?{installed:true,automatic:true,scheduler:'systemd'}:{dependencies:[],installed:true};
  await route.fulfill({json:{ok:true,data}});
 });
 let stateFailure=false, searchFailure=false; const searchQueries=[];
 if(repositoryController) await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/search'))searchQueries.push(new URL(route.request().url()).searchParams.get('q'));
  if((path.endsWith('/state')&&stateFailure)||(path.endsWith('/search')&&searchFailure)){await route.fulfill({status:503,json:{ok:false,error:'Simulated service failure'}});return;}
  const data=path.endsWith('/state')?{saved:['openai/sample'],clones:[],preferences:{defaultTab:'all',sort:'relevance',pageSize:36}}:path.endsWith('/config')?{tokenConfigured:false}:path.endsWith('/search')?{items:[{full_name:'openai/sample',description:'Test catalog',stargazers_count:1000}],total_count:1}:path.endsWith('/detect')?{git:{installed:true,version:'2.0'}}:{};
  await route.fulfill({json:{ok:true,data}});
 });
 const mailReads=[];
 if(mailController)await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.replace(/^\/panel(?=\/api\/)/,'');mailReads.push(path+url.search);
  const data=path==='/api/mail/server-settings'?{selectedTargetId:'',current:{id:'',name:'Local',host:'localhost'},servers:[],imapPort:993,smtpPort:465}:path.includes('/system-deps/')?{allRequiredInstalled:true,anyInstalled:true,dependencies:[]}:path==='/api/mail/track-delivery'?{items:[{queueId:'QA001',recipient:'recipient@example.test',fromAddress:'sender@example.test',sentTime:'2026-11-17T12:00:00Z',status:'success',result:'Delivered'}],total:1,retainedDays:30}:path==='/api/mail/spam-filters'?{enabled:true,requiredScore:5,spamBoxEnabled:false,autoDeleteEnabled:false,autoDeleteScore:10,whitelistFrom:[],blacklistFrom:[],calculatedScores:[]}:path.endsWith('/score-types')?['BAYES_50']:[];
  await route.fulfill({json:{ok:true,data}});
 });
 const boundaries=new Map();
 async function checkGeometry(name,width){
   const geometry=await page.locator('header').evaluate(el=>{
    const style=getComputedStyle(el),rect=el.getBoundingClientRect();
    const blocks=[...el.querySelectorAll('[data-topbar-block]')].map(node=>{const r=node.getBoundingClientRect();return {kind:node.dataset.topbarBlock,x:r.x,width:r.width,line:getComputedStyle(node,'::before').content};});
    const close=el.querySelector('.lxp-workspace-quick-close').getBoundingClientRect();
    return {height:rect.height,inner:rect.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),blocks,close:close.right,end:rect.right-parseFloat(style.paddingRight)};
   });
   expect(geometry.height).toBe(56);
   const fill = await page.locator('[data-topbar-group="query"][data-topbar-has-grow]').evaluateAll(groups=>groups.map(group=>{
    const inline=group.querySelector('[data-topbar-inline]'),trigger=group.querySelector('[data-topbar-trigger]');
    const items=[...inline.querySelectorAll('[data-topbar-item]')].filter(n=>n.getClientRects().length);
    const end=group.hasAttribute('data-compact') ? trigger.getBoundingClientRect().left-parseFloat(getComputedStyle(group).columnGap) : group.getBoundingClientRect().right;
    return Math.abs(items.at(-1).getBoundingClientRect().right-end);
   }));
   for(const remaining of fill)expect(remaining,name+' fills central region at '+width).toBeLessThan(2);
   await expect.poll(()=>page.locator('header [data-topbar-inline]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).some(n=>n.scrollWidth>n.clientWidth+1)),{timeout:2000}).toBe(false);
   expect(Math.abs(geometry.end-geometry.close)).toBeLessThan(2);
   expect(geometry.blocks.map(b=>b.kind)).toEqual(['navigation','query','actions']);
   const ratios=[.25,.45,.30];
   geometry.blocks.forEach((block,i)=>{
    expect(Math.abs(block.width-geometry.inner*ratios[i]),name+' block ratio '+i+' at '+width).toBeLessThan(1);
    if(i)expect(block.line).toBe('""');
   });
   const key=name+':'+width, previous=boundaries.get(key);
   if(previous)geometry.blocks.forEach((block,i)=>{expect(Math.abs(previous[i].x-block.x)).toBeLessThan(1);expect(Math.abs(previous[i].width-block.width)).toBeLessThan(1);});
   else boundaries.set(key,geometry.blocks);
 }
 for(const name of (terminalTools?['terminal']:reactSettingsAudit?['chat']:mailController?['mail']:nginxController?['nginx']:repositoryController?['repository-store']:auditOnly?Object.keys(registeredViews).filter(name=>(!process.env.LXP_QA_HOSTING||['mail','nginx','firewall','backups'].includes(name))&&(!process.env.LXP_QA_MODULES||process.env.LXP_QA_MODULES.split(',').includes(name))):process.argv.length>2?process.argv.slice(2):['users','backups','expo','monitor','webhooks','cloudflare','files','firewall','hosting','cron','databases','obsidian','nginx','mail','modules','repository-store','preferences','settings','server-alerts','terminal','mail/[id]/inbox','bitninja','openclaw'])){
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module='+name+(mailController||repositoryController||nginxController?'&controller=1':'')+(process.env.LXP_QA_HOSTING?'&hosting=1':''));
  await page.waitForFunction(()=>!!window.qa||!!window.qaError);if(await page.evaluate(()=>window.qaError))throw Error(await page.evaluate(()=>window.qaError));
  if(reactSettingsAudit){continue;}
  if(settingsAudit){
   const dialogs=page.locator('dialog[data-lxp-module-settings]:not(#files-editor-panel)');
   if(!await dialogs.count())console.log('NO SETTINGS',name);
   for(let d=0;d<await dialogs.count();d++){
    const dialog=dialogs.nth(d),id=await dialog.getAttribute('id')||'custom';
    for(const theme of ['dark','light'])for(const width of [390,768,1024,1440]){
     await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.className=theme,theme);
     await dialog.evaluate(el=>{const wrapper=el.closest('[data-view-settings-modal]'),trigger=wrapper&&document.getElementById(wrapper.dataset.triggerId);trigger?.click();if(!el.open)el.showModal();});
     await page.waitForTimeout(220);
     const geometry=await dialog.evaluate(el=>{
      const rect=el.getBoundingClientRect(),nav=el.querySelector('nav'),n=nav?.getBoundingClientRect();
      const labels=nav?[...nav.querySelectorAll('button span')].filter(n=>n.textContent.trim()&&n.classList.contains('@xl:inline')).map(n=>({text:n.textContent.trim(),visible:getComputedStyle(n).display!=='none'})):[];
      return {height:rect.height,overflow:el.scrollWidth-el.clientWidth,navInset:n?n.left-rect.left:null,navWidth:n?.width,labels,aux:!!el.querySelector(':scope > [data-aux-body]'),normalized:!!el.querySelector('[data-module-surface],[data-module-pane],[data-module-stack]'),offenders:[...el.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>rect.right+1&&getComputedStyle(n).display!=='none').slice(0,6).map(n=>({id:n.id,tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width}))};
     });
     if(geometry.overflow>1){console.log('SETTINGS OVERFLOW',name,width,geometry);await page.screenshot({path:path.join(frontend,'.cache/settings-overflow.png')});}
     expect(geometry.height,name+' settings height').toBe(900);expect(geometry.overflow,name+' settings overflow').toBeLessThanOrEqual(1);
     expect(geometry.aux,name+' original settings body').toBe(false);expect(geometry.normalized,name+' settings isolated from content normalization').toBe(false);
     if(geometry.navInset!==null){expect(geometry.navInset,name+' flush menu').toBeLessThanOrEqual(1.1);if(geometry.navWidth>100)for(const label of geometry.labels)expect(label.visible,name+' '+label.text).toBe(true);}
     // Exercise each existing menu button; the source controller/React remains owner.
     for(const button of await dialog.locator('nav button').all())await button.evaluate(el=>el.click());
     await page.screenshot({path:path.join(frontend,'.cache/settings-'+name.replaceAll('/','_')+'-'+id+'-'+theme+'-'+width+'.png')});
     settingsChecks.push({module:name,id,theme,width,...geometry});
     await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
    }
   }
   console.log('SETTINGS AUDIT',name,await dialogs.count());continue;
  }
  if(name==='files'){
   await page.waitForTimeout(300);
   await expect(page.locator('[data-files-legacy-topbar]')).toBeVisible();
   await expect(page.locator('[data-uniform-topbar],[data-module-content-root],[data-module-surface]')).toHaveCount(0);
   await expect(page.locator('#module #files-search')).toHaveCount(1);
   await expect(page.locator('header #files-search')).toHaveCount(0);
   await expect(page.locator('#dialog-mkdir[data-aux-drawer],#dialog-rename[data-aux-drawer],#files-settings-modal[data-aux-drawer]')).toHaveCount(0);
   for(const width of [1440,1024,390,320]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
    expect(await page.locator('[data-panel-content]').evaluate(el=>getComputedStyle(el).padding)).toBe('0px');
    await page.screenshot({path:path.join(frontend,'.cache/files-original-'+width+'.png')});
   }
   console.log('Files retains its original header, search, body and dialogs');continue;
  }
  if(terminalTools){
   await page.evaluate(()=>window.qa.seedTools());
   for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
    await page.evaluate(width=>{const button=width<768?document.querySelector('button[aria-label="Comandos guardados"]'):document.querySelector('[data-terminal-sidebar-tab="snippets"]');button.click();},width);
    await page.waitForTimeout(300);
    const heading=page.locator('[data-saved-command-heading]');await expect(heading).toBeVisible();
    const geometry=await heading.evaluate(el=>{const row=el.getBoundingClientRect(),title=el.firstElementChild.getBoundingClientRect(),actions=el.querySelector('[data-saved-command-actions]').getBoundingClientRect();return {right:row.right-actions.right,overlap:title.right-actions.left,aligned:Math.abs(title.top-actions.top)};});
    expect(geometry.right).toBeLessThan(14);expect(geometry.overlap).toBeLessThanOrEqual(0);expect(geometry.aligned).toBeLessThan(2);
    await expect(page.locator('#panel-snippets')).not.toContainText('Selecciona una categoría para filtrar');
    await page.screenshot({path:path.join(frontend,'.cache/saved-commands-'+width+'.png')});
    await page.evaluate(width=>{const button=width<768?document.querySelector('button[aria-label="Historial"]'):document.querySelector('[data-terminal-sidebar-tab="history"]');button.click();},width);
    await page.waitForTimeout(150);
    for(const mode of ['commands','codex','claude']){
     await page.evaluate(mode=>window.dispatchEvent(new CustomEvent('lxp-terminal:history-data',{detail:{mode,items:Array.from({length:3},(_,i)=>({id:String(i),rawIndex:i,command:'systemctl status nginx '+i,sessionId:'session-'+i,title:'Conversación '+i,project:'/project',source:mode,entryCount:2,preview:'History',copyCommand:'codex resume '+i})),total:3,visible:3,hasMore:false,loading:false,error:null}})),mode);
     await page.waitForTimeout(200);
     const dimensions=await page.locator('#history-list').evaluate(el=>{const r=el.getBoundingClientRect(),table=el.querySelector('[data-table-layout]')?.getBoundingClientRect(),scroll=el.querySelector('[data-table-scroll]')?.getBoundingClientRect();return {height:r.height,table:table?.height,scroll:scroll?.height,overflow:el.scrollWidth-el.clientWidth};});
     expect(dimensions.table,mode+' table fills history pane at '+width).toBeGreaterThan(dimensions.height-2);expect(dimensions.scroll).toBeGreaterThan(200);expect(dimensions.overflow).toBeLessThanOrEqual(1);
     await page.screenshot({path:path.join(frontend,'.cache/terminal-history-'+mode+'-'+width+'.png')});
    }
   }
   console.log('Saved command title/actions and all history modes fill the available space');continue;
  }
  if(name==='terminal'){
   await expect(page.locator('[data-terminal-legacy-topbar]')).toBeVisible();
   await expect(page.locator('[data-uniform-topbar],[data-module-content-root],[data-module-surface],[data-module-table-path]')).toHaveCount(0);
   for(const width of [1440,1024,390,320,1440]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(250);
    const geometry=await page.locator('[data-panel-content]').evaluate(main=>{const body=main.closest('.lxp-workspace-quick-body'),view=main.querySelector(':scope > div'),m=main.getBoundingClientRect(),b=body.getBoundingClientRect(),v=view.getBoundingClientRect();return {padding:getComputedStyle(main).padding,bodyPadding:getComputedStyle(body).padding,dx:v.left-b.left,dy:v.top-b.top,width:v.width,height:v.height,bodyWidth:b.width,bodyHeight:b.height};});
    await expect(page.locator('#terminal-container #lxp-terminal-loading')).toBeVisible();
    const center=await page.locator('#terminal-container').evaluate(host=>{const h=host.getBoundingClientRect(),s=host.querySelector('#lxp-terminal-loading > span').getBoundingClientRect();return {x:Math.abs(s.left+s.width/2-h.left-h.width/2),y:Math.abs(s.top+s.height/2-h.top-h.height/2)};});
    expect(center.x).toBeLessThan(1);expect(center.y).toBeLessThan(1);
    const header=await page.locator('[data-terminal-legacy-topbar]').evaluate(el=>({overflow:el.scrollWidth-el.clientWidth,right:el.getBoundingClientRect().right,close:el.querySelector('[data-close-drawer]').getBoundingClientRect().right}));
    expect(header.overflow).toBeLessThanOrEqual(1);expect(header.close).toBeLessThanOrEqual(header.right);
    expect(geometry.padding).toBe('0px');expect(geometry.bodyPadding).toBe('0px');
    expect(Math.abs(geometry.dx)).toBeLessThan(1);expect(Math.abs(geometry.dy)).toBeLessThan(1);
    expect(Math.abs(geometry.width-geometry.bodyWidth)).toBeLessThan(1);expect(Math.abs(geometry.height-geometry.bodyHeight)).toBeLessThan(1);
    if(width>1024){await expect(page.locator('header [data-terminal-toolbar]')).toHaveCount(1);await expect(page.locator('header #btn-new-tab')).toHaveCount(1);}
    else await expect(page.locator('header [data-terminal-toolbar]')).toHaveCount(0);
    await page.screenshot({path:path.join(frontend,'.cache/terminal-own-layout-'+width+'.png')});
   }
   console.log('Terminal retains native topbar, live controls and edge-to-edge body');continue;
  }
  if(mailController){
   await expect.poll(()=>mailReads.some(path=>path.startsWith('/api/accounts'))).toBe(true).catch(error=>{console.log('MAIL REQUESTS',mailReads);throw error;});
   async function activateMail(tab){
    await page.setViewportSize({width:1440,height:1000});
    const label=(await page.locator('#module [data-mail-main-tab="'+tab+'"]').textContent()).trim().replace(/\s+/g,' ');
    const button=page.locator('header').getByRole('tab',{name:label,exact:true});
    if(!await button.isVisible())await page.locator('[data-topbar-group="tabs"] [data-topbar-trigger]').click();
    await button.click();await expect(page.locator('[data-mail-main-panel="'+tab+'"]')).toBeVisible();
    await page.waitForTimeout(150);
   }
   for(const tab of ['spam-filters','track-delivery','global-filters','emails','track-delivery']){
    await activateMail(tab);
    if(tab==='track-delivery'){
     await expect(page.locator('#mail-track-delivery-tbody')).toContainText('recipient@example.test');
     await page.locator('#mail-track-delivery-recipient').fill('recipient@example.test');
     await page.locator('#mail-track-delivery-run').click();
     await expect.poll(()=>mailReads.some(path=>path.includes('recipient=recipient%40example.test'))).toBe(true);
     await page.locator('#mail-track-delivery-show-success').uncheck();
     await expect.poll(()=>mailReads.some(path=>path.includes('showSuccess=0'))).toBe(true);
     await page.locator('#mail-track-delivery-columns-toggle').click();
     await expect(page.locator('#mail-track-delivery-columns-panel')).toBeVisible();
     await page.locator('#mail-track-delivery-columns-close').click();
     await expect(page.locator('#mail-track-delivery-columns-panel')).toBeHidden();
    }
    for(const width of [1440,390]){
     await page.setViewportSize({width,height:1000});await page.waitForTimeout(150);
     if(tab==='track-delivery'||tab==='global-filters'){
      await expect(page.locator('#module')).toHaveAttribute('data-module-layout','mixed');
      expect(await page.locator('[data-panel-content]').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBe(width>=1024?40:32);
      const inset=await page.locator('[data-panel-content]').evaluate(el=>el.querySelector('[data-module-surface=outer]').getBoundingClientRect().top-el.getBoundingClientRect().top);
      expect(inset,'one top inset in '+tab).toBe(width>=1024?40:32);
     }
     if(tab==='track-delivery'){
      const controls=await page.evaluate(()=>{const button=document.getElementById('mail-track-delivery-columns-toggle').getBoundingClientRect(),table=document.querySelector('#mail-track-delivery-tbody').closest('table').getBoundingClientRect();return {buttonBottom:button.bottom,tableTop:table.top};});
      expect(controls.buttonBottom).toBeLessThanOrEqual(controls.tableTop);
      await page.locator('#mail-track-delivery-columns-toggle').click();
      await expect(page.locator('#mail-track-delivery-columns-panel')).toBeVisible();
      const popup=await page.locator('#mail-track-delivery-columns-panel').evaluate(el=>{const r=el.getBoundingClientRect(),sheet=el.closest('.lxp-workspace-quick-sheet').getBoundingClientRect();return {left:r.left,right:r.right,start:sheet.left,end:sheet.right};});
      expect(popup.left).toBeGreaterThanOrEqual(popup.start);expect(popup.right).toBeLessThanOrEqual(popup.end);
      await page.locator('#mail-track-delivery-columns-close').click();await expect(page.locator('#mail-track-delivery-columns-panel')).toBeHidden();
     }
     await page.screenshot({path:path.join(frontend,'.cache/mail-controller-'+tab+'-'+width+'.png'),fullPage:true});
    }
   }
   console.log('Mail real controller: navigation, report query, filters, columns and mixed content spacing OK');continue;
  }
  if(auditOnly){
   await page.waitForTimeout(300);
   const forbidden=await page.evaluate(()=>[window.qa.messages.mail.globalFilters.sectionTitle,window.qa.messages.mail.globalFilters.sectionDesc]);
   const nav=page.locator('[data-uniform-topbar] [role=tab]');
   const labels=await nav.allTextContents();
   for(const label of [null,...labels]){
    if(label!==null){const tab=nav.filter({hasText:label.trim()}).first();await tab.evaluate(el=>el.click());await page.waitForTimeout(100);}
    for(const text of forbidden)await expect(page.locator('[data-internal-module]')).not.toContainText(text);
   }
   if(name==='mail'){
    // Native mail tabs are controller driven; exercise their rendered panes directly in the view fixture.
    await page.evaluate(()=>{for(const pane of document.querySelectorAll('[data-mail-main-panel]')){pane.classList.toggle('hidden',pane.dataset.mailMainPanel!=='global-filters');}});
    await page.waitForTimeout(150);
    const panel=page.locator('[data-mail-main-panel="global-filters"]');
    await expect(panel.locator('#mail-global-filters-new,#mail-global-filters-test-run')).toHaveCount(2);
    await expect(panel.locator('#mail-global-filters-test-message')).toHaveCount(1);
    await expect(panel.locator('h4')).toHaveCount(0);
    await expect(panel.locator('#mail-global-filters-new')).toBeVisible();
    await expect(panel.locator('#mail-global-filters-test-message')).toBeVisible();
   }
   if(spacingAudit||contentReview){
    const panes=await page.locator('#module').locator(paneSelector).evaluateAll(nodes=>nodes.filter(node=>!node.closest('dialog,[data-view-settings-modal]')).length);
    for(let index=-1;index<panes;index++){
     if(index>=0)await page.evaluate(index=>{
      const nodes=[...document.querySelector('#module').querySelectorAll('[data-mail-main-panel],.tab-panel,[data-module-section],[role=tabpanel],[data-mail-spam-view],[data-preferences-panel],[data-settings-panel]')].filter(node=>!node.closest('dialog,[data-view-settings-modal]'));
      for(const node of nodes)node.classList.add('hidden');
      for(let node=nodes[index];node&&!node.hasAttribute('data-internal-module');node=node.parentElement){node.classList.remove('hidden');node.hidden=false;}
     },index);
     for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
      const metrics=await page.locator('[data-panel-content]').first().evaluate(el=>{
       const root=el.closest('[data-internal-module]'),mode=root.dataset.moduleLayout;
       return {mode,padding:parseFloat(getComputedStyle(el).paddingLeft),cards:[...root.querySelectorAll('[data-module-surface]')].filter(n=>n.getClientRects().length).map(n=>({type:n.dataset.moduleSurface,padding:parseFloat(getComputedStyle(n).paddingLeft),border:parseFloat(getComputedStyle(n).borderLeftWidth)}))};
      });
      if(contentReview){
       const review=await page.locator('#module').evaluate((root)=>{
        const visible=node=>{for(let n=node;n&&n!==root;n=n.parentElement)if(n.hidden||n.classList.contains('hidden')||n.style.display==='none'||n.getAttribute('aria-hidden')==='true'||n.matches('dialog:not([open])'))return false;return !!node.getClientRects().length;};
        const fields=[...root.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(n=>visible(n)&&!n.closest('dialog,table,[data-module-table],[data-module-toolbar],[data-data-table-toolbar],[data-table-pagination],[data-module-topbar-source-row],[data-module-native-source-row]'));
        const tables=[...root.querySelectorAll('table,[data-module-table]')].filter(visible);
        const main=root.querySelector('[data-panel-content]'),box=main.getBoundingClientRect();
        return {fields:fields.map(n=>({id:n.id||n.tagName,x:n.getBoundingClientRect().left-box.left,width:n.getBoundingClientRect().width,surface:!!n.closest('[data-module-surface]')})),tables:tables.length,tableDisplay:[...root.querySelectorAll('table')].filter(visible).map(n=>getComputedStyle(n).display),mode:root.dataset.moduleLayout,outerInsets:[...root.querySelectorAll('[data-module-surface=outer]')].filter(visible).map(n=>({x:n.getBoundingClientRect().left-box.left,top:n.getBoundingClientRect().top-box.top})),overflow:main.scrollWidth-main.clientWidth,overflowNodes:[...main.querySelectorAll('*')].filter(n=>visible(n)&&n.getBoundingClientRect().right>box.right+1).slice(0,12).map(n=>({tag:n.tagName,id:n.id,classes:n.className,right:n.getBoundingClientRect().right,display:getComputedStyle(n).display,minWidth:getComputedStyle(n).minWidth,width:getComputedStyle(n).width}))};
       });
       if(review.fields.length&&review.tables)reviewCheck(metrics.mode==='mixed','fields beside table need mixed layout',{module:name,pane:index,width,mode:metrics.mode});
       for(const field of review.fields){reviewCheck(field.surface,'field needs a container',{module:name,pane:index,width,field});reviewCheck(field.x>=(width>=1024?40:32),'field must clear pane edge',{module:name,pane:index,width,field});}
       for(const display of review.tableDisplay)reviewCheck(display==='table','native table formatting',{module:name,pane:index,width,display});
       reviewCheck(review.overflow<=1,'body horizontal overflow',{module:name,pane:index,width,overflow:review.overflow,nodes:review.overflowNodes});
       for(const inset of review.outerInsets)reviewCheck(Math.abs(inset.x-(width>=1024?40:32))<=1,'one horizontal outer inset',{module:name,pane:index,width,inset});
       const shot=name.replaceAll('/','_')+'-'+index+'-'+width;
       reviewRows.push({module:name,pane:index,width,...review});
       await page.screenshot({path:path.join(frontend,'.cache/content-review-'+shot+'.png')});
      }
      expect(metrics.padding,name+' content inset').toBe(metrics.mode==='table'?0:width>=1024?40:32);
      for(const card of metrics.cards){expect(card.padding,name+' card padding').toBe(card.type==='outer'?16:12);expect(card.border).toBe(1);}
     }
    }
   }
   for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(frontend,'.cache/intro-audit-'+name.replaceAll('/','_')+'-'+qaLocale+'-'+width+'.png')});}
   console.log('INTRO AUDIT',name,labels);continue;
  }
  if(repositoryController){await expect(page.locator('#repo-grid article')).toHaveCount(1);
   await expect(page.locator('#repo-store-root h1')).toHaveCount(0);
   await expect(page.locator('#repo-stack-row #repo-stack-pills')).toBeVisible();
   await expect(page.locator('header #repo-stack-pills')).toHaveCount(0);
   await expect(page.locator('#repo-catalog-filters')).toBeHidden();
   await expect(page.locator('#tab-all')).toContainText('Catálogo');
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
    const gap=await page.evaluate(()=>document.querySelector('#repo-stack-row').getBoundingClientRect().top-document.querySelector('header').getBoundingClientRect().bottom);
    // Categories share the content card: outside inset + border + 16px padding.
    expect(gap,'GitHub shortcuts top spacing at '+width).toBe((width>=1024?40:32)+17);
   }
   await page.setViewportSize({width:1440,height:900});await expect(page.locator('#repo-loading')).toBeHidden();
   await page.evaluate(()=>{window.qa.scope.document.querySelector('#repo-stack-pills [data-stack=web]').click();});
   await expect(page.locator('#repo-category-pills [data-category=frontend]')).toHaveCount(1);
   await expect.poll(()=>searchQueries.some(q=>q.includes('topic:web'))).toBe(true);
   await expect(page.locator('#repo-category-pills [data-category=all]')).toContainText('Todas las categorías');
   await page.evaluate(()=>{const select=window.qa.scope.document.getElementById('repo-category-select');select.value='frontend';select.dispatchEvent(new Event('change',{bubbles:true}));});
   await expect.poll(()=>searchQueries.some(q=>q.includes('topic:frontend'))).toBe(true);
  }
  await page.waitForTimeout(300);
  if(nginxController){
   await expect(page.locator('header [role=tab]')).toHaveCount(4);
   await expect(page.locator('#panel-overview #form-perf')).toHaveCount(1);
   await expect(page.locator('#panel-overview .svc-btn')).toHaveCount(5);
   await expect(page.locator('#panel-overview #nginx-renewal-status')).toHaveCount(1);
   await expect(page.locator('#status-cards,#tab-perf,#tab-status')).toHaveCount(0);
   await expect.poll(()=>nginxReads.some(path=>path.endsWith('/nginx/performance'))).toBe(true);
   await page.locator('#perf-workers').fill('5');
  }
  await expect(page.locator('[data-internal-module] [data-panel-title]')).toHaveCount(0);
  if(name==='backups'){
   await expect(page.locator('#backup-summary-panel')).toBeVisible();
   await expect(page.locator('header [data-module-header-actions-slot] button')).not.toHaveCount(0);
   await expect(page.locator('[data-module-toolbar] h1')).toHaveCount(0);
  }
  const tabTrigger=page.locator('[data-topbar-group=tabs][data-compact] > button');
  if(await tabTrigger.isVisible())await tabTrigger.click();
  const tabs=page.locator('header [data-topbar-group=tabs] button[role=tab]');
  const labels=await tabs.allTextContents();console.log(name,labels);
  for(let index=0;index<labels.length;index++){
   if(!await tabs.nth(index).isVisible()&&await tabTrigger.isVisible())await tabTrigger.click();
   await tabs.nth(index).click();await page.waitForTimeout(160);
   for(const width of [1440,1024,768,390,320]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(150);await checkGeometry(name,width);
   }
   await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);
   if(nginxController&&labels[index].includes('Logs')){
    await expect(page.locator('#log-output')).toContainText('Log 149');
    const dims=await page.locator('#log-output').boundingBox();
    expect(dims.height).toBeGreaterThan(450);
   }
   const tables=page.locator('[data-module-table]:visible');
   if(await tables.count()){
    await expect(page.locator('header [data-data-table-configure]')).toHaveCount(1);
    const rect=await tables.first().boundingBox();if(rect.height<180)throw Error(name+' table too short '+rect.height);
   }
  }
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
   await page.screenshot({path:path.join(frontend,'.cache/uniform-'+name+'-'+width+'.png')});
   expect(await page.locator('header [data-topbar-group]').evaluateAll(els=>els.map(el=>el.dataset.topbarGroup))).toEqual(['tabs','query','actions']);
   await checkGeometry(name,width);
   const visibleTabs=page.locator('[data-uniform-topbar] [role=tab]:visible');
   for(const tab of await visibleTabs.all())await expect(tab).toHaveAttribute('data-rubber-item','');
   await expect(page.locator('[data-module-header-tabs-slot] > .lxp-rubber-thumb')).toHaveCount(0);
   for(const group of await page.locator('[data-uniform-topbar] [data-rubber-segment]').all())await expect(group.locator(':scope > .lxp-rubber-thumb')).toHaveCount(1);
   await expect.poll(()=>page.locator('header').evaluate(el=>el.scrollWidth>el.clientWidth+1),{timeout:2000}).toBe(false);
   const overflow=await page.locator('header').evaluate(el=>el.scrollWidth>el.clientWidth+1);
   if(overflow)console.log('OVERFLOW',name,width,await page.locator('header').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,out:[...el.querySelectorAll('*')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>el.getBoundingClientRect().right+1}).map(n=>({tag:n.tagName,cls:n.className,id:n.id,right:n.getBoundingClientRect().right,html:n.outerHTML.slice(0,160)}))})));
   expect(overflow,name+' overflow at '+width).toBe(false);
   if(name==='users'&&width===1440){await expect(page.locator('[data-topbar-block=actions] [data-topbar-inline] button:visible')).toHaveCount(2);await expect(page.locator('header [data-module-header-proxy=action]').filter({hasText:'Nuevo usuario'})).toBeVisible();}
   for (const trigger of await page.locator('[data-topbar-trigger]:visible').all()) {
    await trigger.click();
    const popup=page.locator('[data-topbar-content]:popover-open');await expect(popup).toHaveCount(1);
    if(await popup.getAttribute('data-rubber-tabs')!==null){await expect(popup).toHaveAttribute('data-rubber-segment','');await expect(popup.locator(':scope > .lxp-rubber-thumb')).toHaveCount(1);}
    const inactiveSubset=await popup.evaluate(el=>{const tabs=[...el.querySelectorAll('[role=tab]')].filter(tab=>tab.closest('[data-rubber-tabs],[role=tablist]')===el);return tabs.length>0&&tabs.every(tab=>tab.getAttribute('aria-selected')==='false');});
    if(inactiveSubset)await expect(popup.locator(':scope > .lxp-rubber-thumb')).toBeHidden();
    const rows=await popup.locator(':scope > [data-topbar-item]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().toJSON()));for(let i=1;i<rows.length;i++){expect(rows[i].y).toBeGreaterThanOrEqual(rows[i-1].bottom);expect(Math.abs(rows[i].x-rows[0].x)).toBeLessThan(1);expect(Math.abs(rows[i].width-rows[0].width)).toBeLessThan(1);}
    const box=await popup.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(900);
    if(name==='users'&&width===1440)await page.screenshot({path:frontend+'/.cache/users-overflow-menu.png'});
    await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);
   }
  }
  if(name==='users'){
   await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(700);
   const inlineTabs=page.locator('[data-topbar-group=tabs] [data-topbar-inline] button[role=tab]');
   const thumb=page.locator('[data-topbar-group=tabs] [data-topbar-inline] > .lxp-rubber-thumb');
   await expect(thumb).toBeVisible();
   const start=await thumb.evaluate(el=>el.style.transform+'/'+el.style.width);
   // The view fixture has no Users backend controller. Model its native tab
   // selection so the test exercises the real proxies and Rubber Segment.
   await page.evaluate(()=>{
    const tabs=[...window.qa.scope.root.querySelectorAll('button.tab-btn')];
    for(const tab of tabs)tab.addEventListener('click',()=>{for(const item of tabs){item.setAttribute('aria-selected',String(item===tab));item.classList.remove('text-primary','border-primary','bg-card');}});
   });
   await inlineTabs.locator('xpath=self::*[@aria-selected="false"]').first().click();
   await page.waitForTimeout(100);
   expect(await thumb.evaluate(el=>el.style.transform+'/'+el.style.width)).not.toBe(start);
   const landed=()=>page.locator('[data-topbar-group=tabs] [data-topbar-inline]').evaluate(el=>{
    const thumb=el.querySelector(':scope > .lxp-rubber-thumb'),active=el.querySelector('[aria-selected="true"]');
    const a=active.getBoundingClientRect(),t=thumb.getBoundingClientRect();return Math.abs(a.x-t.x)<2&&Math.abs(a.width-t.width)<2;
   });
   await expect.poll(landed,{timeout:2500}).toBe(true);
   await page.emulateMedia({reducedMotion:'reduce'});
   await inlineTabs.locator('xpath=self::*[@aria-selected="false"]').first().click();
   await expect.poll(landed,{timeout:600}).toBe(true);
   await page.emulateMedia({reducedMotion:'no-preference'});
   console.log('Rubber Segment animates selection and respects reduced motion');
  }
  // Compaction must preserve the live input, its value and its scoped listeners.
  if(!nginxController&&!repositoryController){
   await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);
   const input=page.locator('header [data-topbar-search-item] input:not(:disabled), header input[data-topbar-search-item]:not(:disabled)').first();
   if(await input.count()){
    const queryTrigger=page.locator('[data-topbar-group=query][data-compact] > button');
    if(await queryTrigger.isVisible()&&!await input.isVisible())await queryTrigger.click();
    const value=await input.inputValue();await input.fill('qa-retained');
    const node=await input.elementHandle();
    await page.setViewportSize({width:320,height:900});await page.waitForTimeout(150);
    if(await queryTrigger.isVisible()&&!await input.isVisible())await queryTrigger.click();
    await expect(input).toHaveValue('qa-retained');
    const popup=page.locator('[data-topbar-content]:popover-open');if(await popup.count()){const box=await popup.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(320);}
    expect(await input.evaluate((el,old)=>el===old,node)).toBe(true);
    await input.fill(value);await page.keyboard.press('Escape');
   }
  }

 }
 if(nginxController){
  await page.setViewportSize({width:1440,height:900});
  const logsTab=page.locator('header [role=tab]').filter({hasText:'Logs'});
  if(!await logsTab.isVisible())await page.locator('[data-topbar-group=tabs] > [data-topbar-trigger]').click();
  await logsTab.click();
  await page.locator('#log-auto').check();
  await expect.poll(()=>nginxReads.filter(path=>path.endsWith('/logs')).length).toBeGreaterThan(0);
  await page.locator('header [role=tab]').first().click();
  await page.waitForTimeout(200);
  const logReads=nginxReads.filter(path=>path.endsWith('/logs')).length;
  await page.waitForTimeout(5200);
  expect(nginxReads.filter(path=>path.endsWith('/logs')).length).toBe(logReads);
  await expect(page.locator('#perf-workers')).toHaveValue('5');
  await expect(page.locator('header #nginx-ai-overview')).toHaveCount(1);
  await expect(page.locator('header #nginx-ai-overview')).toHaveCount(1);
  const actionTrigger=page.locator('[data-topbar-group=actions][data-compact] > button');if(await actionTrigger.isVisible())await actionTrigger.click();
  const ai=await page.locator('#nginx-ai-overview').boundingBox(),settings=await page.locator('#workspace-quick-settings').boundingBox();
  expect(ai).not.toBeNull();expect(settings).not.toBeNull();await page.keyboard.press('Escape');
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
   const overflow=await page.locator('#panel-overview').evaluate(el=>el.scrollWidth>el.clientWidth+1);expect(overflow).toBe(false);
   const gaps=await page.locator('.nginx-summary-column').evaluateAll(cols=>cols.flatMap(col=>{const children=[...col.children];return children.slice(1).map((node,index)=>node.getBoundingClientRect().top-children[index].getBoundingClientRect().bottom);}));
   for(const gap of gaps)expect(Math.abs(gap-12)).toBeLessThan(2);
   const conf=await page.locator('[data-nginx-global-config]').boundingBox(),workspace=await page.locator('.nginx-summary-columns').boundingBox();
   expect(Math.abs(conf.width-workspace.width)).toBeLessThan(2);
   if(width===1440){
    const left=await page.locator('.nginx-summary-column').first().boundingBox(),performance=await page.locator('[data-nginx-performance]').boundingBox();
    expect(Math.abs(left.y+left.height-performance.y-performance.height)).toBeLessThan(2);
    expect(Math.abs(conf.y-performance.y-performance.height-12)).toBeLessThan(2);
   }
   await page.screenshot({path:path.join(frontend,'.cache/nginx-summary-polished-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:path.join(frontend,'.cache/nginx-summary.png')});
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module=nginx&controller=1&hosting=1');
  await page.waitForFunction(()=>!!window.qa);
  await expect(page.locator('header [role=tab]')).toHaveCount(3);
  await expect(page.locator('#form-perf,.svc-btn,#conf-preview')).toHaveCount(0);
  console.log('NGINX summary, logs, draft preservation and hosting permissions OK');
 }
 if(repositoryController){
  stateFailure=true;
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module=repository-store&controller=1');
  await page.waitForFunction(()=>!!window.qa);
  await expect(page.locator('#repo-grid article')).toHaveCount(1);
  await expect(page.locator('#repo-loading')).toBeHidden();
  searchFailure=true;await page.locator('#repo-refresh').click();
  await expect(page.locator('#repo-banner')).toContainText('Simulated service failure');
  await expect(page.locator('#repo-loading')).toBeHidden();
  searchFailure=false;await page.locator('#repo-refresh').click();
  await expect(page.locator('#repo-grid article')).toHaveCount(1);
  await page.waitForTimeout(150);await page.screenshot({path:path.join(frontend,'.cache/github-catalog-ready.png')});
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});await expect(page.locator('#repo-stack-pills [data-stack=web]')).toBeVisible();await page.screenshot({path:path.join(frontend,'.cache/github-shortcuts-'+width+'.png')});}
  console.log('Catalog loads despite state failure; filters and retry OK');
 }
 if(reactSettingsAudit){
  await page.route('**/api/**',route=>route.fulfill({json:{ok:false,error:'Read unavailable in layout fixture'}}));
  for(const kind of ['chat','assistant'])for(const theme of ['dark','light'])for(const width of [390,768,1024,1440,1920]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.className=theme,theme);
   if(kind==='chat')await page.evaluate(()=>window.dispatchEvent(new CustomEvent('luxipanel:chat-settings-open',{detail:{section:'general'}})));
   else await page.evaluate(()=>window.qa.openAssistant());
   const dialog=page.locator('[role=dialog][data-lxp-module-settings]');await expect(dialog).toBeVisible();await page.waitForTimeout(250);
   const metrics=await dialog.evaluate(el=>{const body=el.querySelector('[data-aux-body]'),nav=el.querySelector('nav'),card=nav.closest('.fixed'),r=nav.getBoundingClientRect(),c=card.getBoundingClientRect();return {padding:getComputedStyle(body).padding,navInset:r.left-c.left,navWidth:r.width,labels:[...nav.querySelectorAll('button span')].map(n=>getComputedStyle(n).display!=='none')};});
   expect(metrics.padding).toBe('0px');expect(metrics.navInset).toBeLessThanOrEqual(1.1);
   if(metrics.navWidth>100)for(const visible of metrics.labels)expect(visible).toBe(true);
   // Use the React navigation handlers and retain the real active-state owner.
   for(let i=0;i<await dialog.locator('nav button').count();i++){await dialog.locator('nav button').nth(i).click();await page.waitForTimeout(100);}
   await page.screenshot({path:path.join(frontend,'.cache/settings-react-'+kind+'-'+theme+'-'+width+'.png')});
   await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
  console.log('React chat and assistant settings: responsive labels, flush navigation, zero body inset and close OK');
 }
 if(settingsAudit)writeFileSync(path.join(frontend,'.cache/settings-review.json'),JSON.stringify(settingsChecks,null,2));
 if(contentReview){writeFileSync(path.join(frontend,'.cache/module-content-review.json'),JSON.stringify({rows:reviewRows,findings:reviewFindings},null,2));expect(reviewFindings).toEqual([]);}
 expect(errors).toEqual([]);console.log('Actual module views and tabs OK');
} finally {await browser?.close();await server.close();}
