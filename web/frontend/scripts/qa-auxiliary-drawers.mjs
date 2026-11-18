// Actual module views with synthetic context; no backend operations.
// Run: node scripts/qa-module-drawers.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const frontend = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(frontend, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const {internalModuleControllers}=await import('./internal-module-controllers.mjs');
const { default: tailwind } = await import(require.resolve('@tailwindcss/vite'));
const { chromium, expect } = require('@playwright/test');
const entry = `
import {createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {createViewContext,InternalViewContext} from '/src/components/workspace/view-context.tsx';
import {createControllerScope} from '/src/components/workspace/controller-scope.ts';
import {mountInboxTopbar} from '/src/components/workspace/inbox-topbar.ts';
import {mountModuleTopbar} from '/src/components/workspace/module-topbar.ts';
import '/src/styles/modal-drawer.css';import '/src/styles/starwind.css';import '/src/styles/panel-workspace.css';
const name=new URLSearchParams(location.search).get('module')||'inbox';
const messages=Object.fromEntries(Object.entries(import.meta.glob('/src/i18n/es/*.ts',{eager:true,import:'default'})).map(([key,value])=>[key.split('/').pop().replace('.ts',''),value]));
const views={inbox:()=>import('/src/components/workspace/views/pages_panel_mail__id__inbox.tsx'),users:()=>import('/src/components/workspace/views/pages_panel_users_index.tsx'),backups:()=>import('/src/components/workspace/views/pages_panel_backups_index.tsx'),expo:()=>import('/src/components/workspace/views/pages_panel_expo_index.tsx'),monitor:()=>import('/src/components/workspace/views/pages_panel_monitor_index.tsx'),webhooks:()=>import('/src/components/workspace/views/pages_panel_webhooks_index.tsx'),cloudflare:()=>import('/src/components/workspace/views/pages_panel_cloudflare_index.tsx')};
const root=document.getElementById('module');root.dataset.internalModule=name==='inbox'?'mail/[id]/inbox':name;document.getElementById('drawer').dataset.module=root.dataset.internalModule;
root.innerHTML='';const scope=createControllerScope(root,new URL('/panel/mail/42/inbox',location.href));
const context=createViewContext({scope,url:new URL('/panel/mail/42/inbox',location.href),user:{kind:'admin',username:'admin',modules:['*'],permissions:{actions:['*'],views:['*']}},locale:'es',messages,params:{id:'42'}});
const View=(await views[name]()).default;createRoot(root).render(h(InternalViewContext.Provider,{value:context},h(View)));
setTimeout(async()=>{const controller=await import('virtual:lxp-controller/pages_panel_mail__id__inbox');let disposeTopbar=mountInboxTopbar(scope,messages.mail.inbox);controller.mount(scope);window.qa={scope,park:()=>{disposeTopbar();scope.setVisible(false);root.hidden=true;document.querySelector('[data-module-header-tabs-slot]').replaceChildren();document.querySelector('[data-module-header-actions-slot]').replaceChildren();},resume:()=>{root.hidden=false;scope.setVisible(true);disposeTopbar=mountInboxTopbar(scope,messages.mail.inbox);}};},250);
`;
const server = await createServer({configFile:false,envDir:false,root:frontend,publicDir:'public',cacheDir:'/tmp/lxp-users-qa-vite',
 optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-table']},
 resolve:{dedupe:['react','react-dom'],alias:[{find:/^react$/,replacement:require.resolve('react')},{find:/^react-dom$/,replacement:require.resolve('react-dom')},{find:'@',replacement:path.join(frontend,'src')}]},plugins:[internalModuleControllers(),{name:'fixture',resolveId:id=>id==='/qa.js'?'\0qa.js':null,load:id=>id==='\0qa.js'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/?')&&req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="es" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="drawer" class="lxp-workspace-quick-drawer" data-open="true" data-module="users"><section class="lxp-workspace-quick-sheet"><header class="lxp-workspace-quick-header"><div data-module-header-tabs-slot class="lxp-workspace-header-tabs"></div><div data-module-header-controls-slot class="lxp-workspace-header-controls"></div><div data-module-header-table-slot class="lxp-workspace-header-controls"></div><div data-module-header-native-slot class="lxp-workspace-header-controls"></div><div class="ml-auto flex items-center gap-2"><div data-module-header-actions-slot class="lxp-workspace-header-actions"></div><button class="lxp-workspace-header-settings">Configuración</button><button class="lxp-workspace-quick-close" aria-label="Cerrar">×</button></div></header><div id="module" class="lxp-internal-module" data-internal-module="users"><div><div><button id="tab-users" class="tab-btn text-primary">Usuarios <span>12</span></button><button id="tab-roles" class="tab-btn">Grupos <span>3</span></button></div><div><button id="btn-new-user" class="bg-primary">Nuevo usuario</button><button id="btn-hosting-plans">Permisos de usuarios</button><button id="btn-new-role" class="bg-primary" style="display:none">Nuevo grupo</button></div></div><div id="tables" class="p-4"></div></div></section></div><script type="module" src="/qa.js"></script></body></html>`);});}},tailwind()],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let listReads=0,detailDelay=0,failNext=false,moveRequests=0,moveFails=true;
 await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());url.pathname=url.pathname.replace(/^\/panel\/api/,"/api");let data={};
 if(url.pathname.endsWith('/move')){moveRequests++;await new Promise(r=>setTimeout(r,250));if(moveFails){moveFails=false;await route.fulfill({status:500,json:{ok:false,error:'Move failed'}});return;}}
 if(url.pathname==='/api/mail/server-settings')data={selectedTargetId:'primary'};
 else if(url.pathname==='/api/accounts')data=[{id:42,address:'qa@example.test'}];
 else if(url.pathname.endsWith('/normalize-quarantine'))data={folder:'Cuarentena',complete:true};
 else if(url.pathname.endsWith('/folders'))data=[{path:'INBOX',name:'INBOX'},{path:'Sent',name:'Sent'},...Array.from({length:30},(_,i)=>({path:'Projects/Folder '+i,name:'Folder '+i}))];
 else if(url.pathname.endsWith('/messages')){listReads++;data={messages:[{uid:1,subject:'First',from:'A'},{uid:2,subject:'Second',from:'B'}].concat(listReads>1?[{uid:3,subject:'New arrival',from:'C'}]:[]),total:listReads>1?3:2};}
 else if(/messages\/\d+$/.test(url.pathname)){if(detailDelay)await new Promise(r=>setTimeout(r,detailDelay));if(failNext){failNext=false;await route.fulfill({status:502,json:{ok:false,error:'Read failed'}});return;}data={uid:Number(url.pathname.split('/').pop()),subject:url.pathname.endsWith('/2')?'Second':'First',from:{address:'a@test'},html:'<div data-lxp-email-body style="background-color:rgb(240, 218, 188);color:rgb(10, 20, 30)"><p>Correo de prueba</p></div>'};}
 await route.fulfill({json:{ok:true,data}}).catch(()=>{});
 });
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module=inbox');
 await page.waitForFunction(()=>!!window.qa);await page.waitForTimeout(500);

 for(const theme of ['dark','light'])for(const width of [390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(theme=>{document.documentElement.className=theme;},theme);
  await page.evaluate(()=>document.querySelector('[data-inbox-layout]').dataset.inboxPane='list');
  await page.locator('[data-mail-uid="1"]').click({button:'right'});
  await page.locator('.ctx-item').filter({hasText:/^Mover$/}).click();
  await expect(page.locator('#dlg-move')).toBeVisible();
  await expect(page.locator('#move-confirm')).toBeDisabled();
  await expect(page.locator('#move-account')).toContainText('qa@example.test');
  await page.locator('#move-search').fill('Sent');
  await expect(page.locator('#move-folders-list [role=radio]')).toHaveCount(1);
  await page.locator('#move-folders-list [role=radio]').click();
  await expect(page.locator('#move-confirm')).toBeEnabled();
  expect(moveRequests).toBe(theme==='light'?2:0);
  const footer=await page.locator('#dlg-move [data-aux-footer]').boundingBox();
  expect(footer.y+footer.height).toBeLessThanOrEqual(901);
  if(footer.y<700)console.log(await page.locator('#dlg-move').evaluate(el=>[el,...el.children].map(n=>({tag:n.tagName,attr:n.getAttribute('data-aux-body'),rect:n.getBoundingClientRect().toJSON(),height:getComputedStyle(n).height,flex:getComputedStyle(n).flex,display:getComputedStyle(n).display}))));
  expect(footer.y).toBeGreaterThan(700);
  await page.screenshot({path:frontend+'/.cache/aux-'+theme+'-'+width+'.png'});
  if(theme==='dark'&&width===1440){
   await page.locator('#move-confirm').click();await expect(page.locator('#move-confirm')).toBeDisabled();
   await expect(page.locator('#move-error')).toContainText('Move failed');
   await expect(page.locator('#move-folders-list [aria-checked=true]')).toHaveCount(1);
   await page.locator('#move-confirm').click();await expect(page.locator('#dlg-move')).not.toBeVisible();expect(moveRequests).toBe(2);
  }else{await page.locator('#move-cancel').click();await expect(page.locator('#dlg-move')).not.toBeVisible();}
 }
 expect(errors).toEqual([]);console.log('PASS auxiliary drawer themes, four widths, selection, cancellation, pending, failure and retry');
} finally {await browser?.close();await server.close();}
