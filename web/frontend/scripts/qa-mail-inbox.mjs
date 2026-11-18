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
import '/src/styles/starwind.css';import '/src/styles/panel-workspace.css';
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
 let listReads=0,detailDelay=0,failNext=false;
 await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());url.pathname=url.pathname.replace(/^\/panel\/api/,"/api");let data={};
 if(url.pathname==='/api/mail/server-settings')data={selectedTargetId:'primary'};
 else if(url.pathname==='/api/accounts')data=[{id:42,address:'qa@example.test'}];
 else if(url.pathname.endsWith('/normalize-quarantine'))data={folder:'Cuarentena',complete:true};
 else if(url.pathname.endsWith('/folders'))data=[{path:'INBOX',name:'INBOX'},{path:'Sent',name:'Sent'}];
 else if(url.pathname.endsWith('/messages')){listReads++;data={messages:[{uid:1,subject:'First',from:'A'},{uid:2,subject:'Second',from:'B'}].concat(listReads>1?[{uid:3,subject:'New arrival',from:'C'}]:[]),total:listReads>1?3:2};}
 else if(/messages\/\d+$/.test(url.pathname)){if(detailDelay)await new Promise(r=>setTimeout(r,detailDelay));if(failNext){failNext=false;await route.fulfill({status:502,json:{ok:false,error:'Read failed'}});return;}data={uid:Number(url.pathname.split('/').pop()),subject:url.pathname.endsWith('/2')?'Second':'First',from:{address:'a@test'},html:'<div data-lxp-email-body style="background-color:rgb(240, 218, 188);color:rgb(10, 20, 30)"><p>Correo de prueba</p></div>'};}
 await route.fulfill({json:{ok:true,data}}).catch(()=>{});
 });
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module=inbox');
 await page.waitForFunction(()=>!!window.qa);await page.waitForTimeout(500);

 await expect(page.locator('[data-mail-uid]')).toHaveCount(2);
 await expect(page.locator('header #msg-search')).toBeVisible();
 await expect(page.frameLocator('#msg-iframe').locator('body')).toHaveCSS('background-color','rgb(240, 218, 188)');
 if(!process.env.QA_INBOX_LAYOUT_ONLY)await expect(page.locator('[data-mail-uid="3"]')).toHaveCount(1,{timeout:35000});
 await expect(page.locator('#msg-subject')).toHaveText('First');
 await page.locator('.inbox-global-actions > button').click();
 await expect(page.locator('.inbox-tools-popover #btn-open-folders-manager')).toBeVisible();
 await expect(page.locator('.inbox-tools-popover #btn-refresh')).toBeVisible();
 await expect(page.locator('.inbox-tools-popover #btn-open-contacts')).toBeVisible();
 await expect(page.locator('[data-inbox-header-region=list] button#btn-refresh')).toHaveCount(0);
 await expect(page.locator('[data-inbox-header-region=folders] #btn-open-folders-manager')).toHaveCount(0);
 await page.keyboard.press('Escape');
 detailDelay=400;
 await page.locator('[data-mail-uid="2"]').click();await expect(page.locator('#msg-loading')).toBeVisible();
 await page.locator('[data-mail-uid="1"]').click();await expect(page.locator('#msg-loading')).toBeVisible();
 await expect(page.locator('#msg-loading')).toBeHidden();await expect(page.locator('#msg-subject')).toHaveText('First');
 failNext=true;await page.locator('[data-mail-uid="2"]').click();await expect(page.locator('#msg-retry')).toBeVisible();
 await page.locator('#msg-retry').click();await expect(page.locator('#msg-loading')).toBeHidden();await expect(page.locator('#msg-subject')).toHaveText('Second');
 for(let round=0;round<2;round++){
  await page.evaluate(()=>window.qa.park());await page.evaluate(()=>window.qa.resume());
  await expect(page.locator('.inbox-global-actions')).toHaveCount(1);await expect(page.locator('.inbox-global-actions > a')).toBeVisible();
 }
 await page.locator('[data-mail-uid="2"]').click({button:'right'});
 await expect(page.locator('[role=menu]:visible')).toHaveCount(1);
 await page.keyboard.press('Escape');
 for(const width of [1440,1024,768,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(180);
  await page.screenshot({path:"/tmp/inbox-check-"+width+".png"});
  const header=await page.locator('header').boundingBox();
  const controls=page.locator('.inbox-global-actions > a,.inbox-global-actions > button,.lxp-workspace-header-settings,.lxp-workspace-quick-close');
  for(const control of await controls.all()){
   const rect=await control.boundingBox();if(!rect)continue;
   expect(rect.x).toBeGreaterThanOrEqual(header.x+4);
   expect(rect.x+rect.width).toBeLessThanOrEqual(header.x+header.width-4);
   expect(rect.y-header.y).toBeGreaterThanOrEqual(8);
   expect(header.y+header.height-rect.y-rect.height).toBeGreaterThanOrEqual(8);
   expect(Math.abs(rect.y+rect.height/2-header.y-header.height/2)).toBeLessThanOrEqual(1);
  }
  if(width<1100){await page.locator('.inbox-global-actions > button').click();await expect(page.locator('.inbox-reader-tools #btn-reply')).toBeVisible();await page.keyboard.press('Escape');}
  await page.screenshot({path:'/tmp/inbox-'+width+'.png'});
 }
 expect(errors).toEqual([]);console.log('Inbox headers, row context menu and original email background OK');
} finally {await browser?.close();await server.close();}
