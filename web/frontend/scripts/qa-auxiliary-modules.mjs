// Actual module views with synthetic context; no backend operations.
// Run: node scripts/qa-module-drawers.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const frontend = path.resolve(import.meta.dirname, '..');
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
import '/src/styles/modal-drawer.css';import '/src/styles/starwind.css';import '/src/styles/panel-workspace.css';
const name=new URLSearchParams(location.search).get('module')||'users';
const messages=Object.fromEntries(Object.entries(import.meta.glob('/src/i18n/es/*.ts',{eager:true,import:'default'})).map(([key,value])=>[key.split('/').pop().replace('.ts',''),value]));
const views={users:()=>import('/src/components/workspace/views/pages_panel_users_index.tsx'),backups:()=>import('/src/components/workspace/views/pages_panel_backups_index.tsx'),expo:()=>import('/src/components/workspace/views/pages_panel_expo_index.tsx'),webhooks:()=>import('/src/components/workspace/views/pages_panel_webhooks_index.tsx'),files:()=>import('/src/components/workspace/views/pages_panel_files_index.tsx'),databases:()=>import('/src/components/workspace/views/pages_panel_databases_index.tsx'),preferences:()=>import('/src/components/workspace/views/pages_panel_preferences_index.tsx'),firewall:()=>import('/src/components/workspace/views/pages_panel_firewall_index.tsx'),settings:()=>import('/src/components/workspace/views/pages_panel_settings_index.tsx')};
const root=document.getElementById('module');root.dataset.internalModule=name;document.getElementById('drawer').dataset.module=name;
root.innerHTML='';const scope=createControllerScope(root,new URL('/panel/'+name,location.href));
const context=createViewContext({scope,url:new URL('/panel/'+name,location.href),user:{kind:'admin',username:'admin',modules:['*'],permissions:{actions:['*'],views:['*']}},locale:'es',messages,params:{}});
const View=(await views[name]()).default;createRoot(root).render(h(InternalViewContext.Provider,{value:context},h(View)));
setTimeout(()=>{mountModuleTopbar(root,document.getElementById('drawer'));window.qa={scope};},250);
`;
const server = await createServer({configFile:false,envDir:false,root:frontend,publicDir:'public',cacheDir:'/tmp/lxp-users-qa-vite',
 optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-table']},
 resolve:{dedupe:['react','react-dom'],alias:[{find:/^react$/,replacement:require.resolve('react')},{find:/^react-dom$/,replacement:require.resolve('react-dom')},{find:'@',replacement:path.join(frontend,'src')}]},plugins:[{name:'fixture',resolveId:id=>id==='/qa.js'?'\0qa.js':null,load:id=>id==='\0qa.js'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/?')&&req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="es" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="drawer" class="lxp-workspace-quick-drawer" data-open="true" data-module="users"><section class="lxp-workspace-quick-sheet"><header class="lxp-workspace-quick-header"><div data-module-header-tabs-slot class="lxp-workspace-header-tabs"></div><div data-module-header-controls-slot class="lxp-workspace-header-controls"></div><div data-module-header-table-slot class="lxp-workspace-header-controls"></div><div data-module-header-native-slot class="lxp-workspace-header-controls"></div><div class="ml-auto flex items-center gap-2"><div data-module-header-actions-slot class="lxp-workspace-header-actions"></div><button class="lxp-workspace-header-settings">Configuración</button><button class="lxp-workspace-quick-close" aria-label="Cerrar">×</button></div></header><div id="module" class="lxp-internal-module" data-internal-module="users"><div><div><button id="tab-users" class="tab-btn text-primary">Usuarios <span>12</span></button><button id="tab-roles" class="tab-btn">Grupos <span>3</span></button></div><div><button id="btn-new-user" class="bg-primary">Nuevo usuario</button><button id="btn-hosting-plans">Permisos de usuarios</button><button id="btn-new-role" class="bg-primary" style="display:none">Nuevo grupo</button></div></div><div id="tables" class="p-4"></div></div></section></div><script type="module" src="/qa.js"></script></body></html>`);});}},tailwind()],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let checked=0;
 for(const name of ['users','backups','expo','webhooks','files','databases','preferences','firewall','settings']){
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?module='+name);
  await page.waitForFunction(()=>!!window.qa);
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   const dialogs=page.locator('dialog[data-aux-drawer]');
   for(let i=0;i<await dialogs.count();i++){
    const dialog=dialogs.nth(i);
    await dialog.evaluate(el=>el.showModal());await page.waitForTimeout(220);
    if(await dialog.isVisible()){
     const geometry=await dialog.evaluate(el=>{
      const rect=el.getBoundingClientRect();const footer=el.querySelector('[data-aux-footer]');const f=footer?.getBoundingClientRect();
      return {id:el.id,width:rect.width,height:rect.height,footerBottom:f?.bottom,footerHeight:f?.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
     });
     expect(geometry.height).toBe(900);
     if(geometry.footerBottom){expect(geometry.footerBottom,geometry.id).toBeLessThanOrEqual(901);expect(geometry.footerHeight,geometry.id).toBeLessThan(180);}
     expect(geometry.scrollWidth,geometry.id).toBeLessThanOrEqual(geometry.clientWidth+1);checked++;
    }
    await dialog.evaluate(el=>el.close());
   }
  }
 }
 console.log('Auxiliary geometry checks:',checked);
 expect(errors).toEqual([]);console.log('PASS module auxiliary geometry');
} finally {await browser?.close();await server.close();}
