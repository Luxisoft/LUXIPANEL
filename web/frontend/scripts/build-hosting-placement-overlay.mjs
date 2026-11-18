// Build only HOSTING's change over an existing panel release. Shared chunks,
// context identities and unrelated locally deployed UI stay byte-identical.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {transform,build} from 'esbuild';
import {internalModuleControllers} from './internal-module-controllers.mjs';

const root=path.resolve(import.meta.dirname,'..');
const [live,output]=process.argv.slice(2);
if(!live||!output)throw Error('Usage: live-dist output-directory');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim())throw Error('dirty_source');
const hash=data=>createHash('sha256').update(data).digest('hex');
const receipt={commit,baseFiles:{},files:{}};
async function read(relative){const bytes=await readFile(path.join(live,relative));receipt.baseFiles[relative]=hash(bytes);return bytes.toString();}
async function write(relative,text){const file=path.join(output,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);receipt.files[relative]=hash(text);}
const entry=await read('server/entry.mjs');
const roots=[...new Set(entry.match(/_luxi\/InternalModuleHost\.[a-zA-Z0-9_-]+\.js/g))];
if(roots.length!==1)throw Error('ambiguous_workspace_chunk');
const workspacePath='client/'+roots[0],workspace=await read(workspacePath);
const source=ts.createSourceFile('workspace.js',workspace,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const candidates=[];
function visit(node){if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='hosting'&&ts.isObjectLiteralExpression(node.initializer))candidates.push(node.initializer);ts.forEachChild(node,visit);}
visit(source);
if(candidates.length!==1)throw Error('hosting_registry_not_found');
function imported(name){const property=candidates[0].properties.find(p=>p.name?.getText(source)===name);const imports=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword)imports.push(n.arguments[0].text);ts.forEachChild(n,walk);}walk(property);if(imports.length!==1)throw Error('ambiguous_hosting_'+name);return imports[0].replace(/^\.\//,'');}
const viewName=imported('load'),controllerName=imported('controller');
const view=await read('client/_luxi/'+viewName);
const viewAst=ts.createSourceFile('hosting.js',view,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const labels=[];
function findSelect(node){
 if(ts.isPropertyAssignment(node)&&node.name.getText(viewAst)==='id'&&node.initializer.text==='provider-target'){
  let label=node.parent;
  while(label&&! (ts.isCallExpression(label)&&label.arguments[0]?.text==='label'))label=label.parent;
  if(!label)throw Error('provider_label_missing');labels.push(label);
 }
 ts.forEachChild(node,findSelect);
}
findSelect(viewAst);
if(labels.length!==1||view.includes('provider-frontend-target'))throw Error('unexpected_hosting_view');
const label=labels[0],snippet=label.getText(viewAst);
const added=snippet.replace(/([a-zA-Z_$][\w$]*)\.managedServer\b/,'($1.frontendServer??"Frontend")').replace('provider-target','provider-frontend-target');
if(added===snippet||!added.includes('frontendServer'))throw Error('label_clone_failed');
const nextView=view.slice(0,label.end)+','+added+view.slice(label.end);
if(ts.createSourceFile('new.js',nextView,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length)throw Error('invalid_view_overlay');
const nextViewName='pages_panel_hosting_index.hosting-'+hash(nextView).slice(0,12)+'.js';
await write('client/_luxi/'+nextViewName,nextView);
const controller=await internalModuleControllers().load('\0virtual:lxp-controller/pages_panel_hosting_index');
if(/^import\s/m.test(controller))throw Error('controller_requires_additional_assets');
const nextController=(await transform(controller,{loader:'js',format:'esm',target:'es2022',minify:true})).code;
const nextControllerName='pages_panel_hosting_index.hosting-'+hash(nextController).slice(0,12)+'.js';
await read('client/_luxi/'+controllerName);
await write('client/_luxi/'+nextControllerName,nextController);
const nextWorkspace=workspace.replaceAll(viewName,nextViewName).replaceAll(controllerName,nextControllerName);
const nextRoot='InternalModuleHost.hosting-'+hash(nextWorkspace).slice(0,12)+'.js';
await write('client/_luxi/'+nextRoot,nextWorkspace);
await write('server/entry.mjs',entry.replaceAll(path.basename(roots[0]),nextRoot).replaceAll(viewName,nextViewName).replaceAll(controllerName,nextControllerName));
const versionDirectories=await readdir(path.join(live,'client/i18n'));
for(const version of versionDirectories)for(const locale of await readdir(path.join(root,'src/i18n'))){
 let message,original;try{message=await readFile(path.join(root,'src/i18n',locale,'hosting.ts'),'utf8');original=await read('client/i18n/'+version+'/'+locale+'/hosting.json');}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')continue;throw error;}
 const labels=JSON.parse(message.slice(message.indexOf('{'),message.lastIndexOf('}')+1)).settingsUi;
 const messages=JSON.parse(original);messages.settingsUi.managedServer=labels.managedServer;messages.settingsUi.frontendServer=labels.frontendServer;
 await write('client/i18n/'+version+'/'+locale+'/hosting.json',JSON.stringify(messages));
}
const bundled=await build({entryPoints:[path.join(root,'src/scripts/extracted/pages/panel/hosting/provider-settings.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['/scripts/*']});
await read('client/scripts/extracted/pages/panel/hosting/provider-settings.js');
await write('client/scripts/extracted/pages/panel/hosting/provider-settings.js',bundled.outputFiles[0].text);
await writeFile(path.join(output,'hosting-overlay.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({commit,files:Object.keys(receipt.files).length,view:nextViewName,controller:nextControllerName,workspace:nextRoot}));
