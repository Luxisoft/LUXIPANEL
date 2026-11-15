import {execFileSync} from 'node:child_process';
import {realpathSync,readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const policy={"runtime": "/var/www/LUXIPANEL/web/backend", "component": "web/backend", "repo": "Luxisoft/LUXIPANEL", "branch": "developer", "contracts": {"modules/hosting/routes/provider.routes.js": ["storageMeteringVersion", "storageInventoryVersion", "/storage"], "modules/hosting/services/provider-storage-inventory.js": ["providerStorageInventory"]}};
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',timeout:20000}).trim();
export function checkSource(cwd=process.cwd()) {
 const root=git(cwd,'rev-parse','--show-toplevel');
 if(realpathSync(cwd)===policy.runtime)throw Error('release_build_in_runtime_forbidden');
 if(relative(root,cwd)!==policy.component)throw Error('release_wrong_component');
 if(git(root,'status','--porcelain','--untracked-files=normal'))throw Error('release_dirty_source');
 const origin=git(root,'remote','get-url','origin');
 if(!['git@github.com:'+policy.repo+'.git','https://github.com/'+policy.repo+'.git'].includes(origin))throw Error('release_wrong_repository');
 const commit=git(root,'rev-parse','HEAD');
 const published=git(root,'ls-remote','origin','refs/heads/'+policy.branch).split(/\s/)[0];
 if(!published||published!==commit)throw Error('release_not_current_published_commit');
 return {commit,repository:policy.repo,branch:policy.branch};
}
export function filesAt(root,prefix='') {return readdirSync(resolve(root,prefix)).flatMap(name=>{const path=prefix?prefix+'/'+name:name;const full=resolve(root,path);return statSync(full).isDirectory()?filesAt(root,path):[path];}).sort();}
export function assertContracts(root){
 for(const [file,patterns] of Object.entries(policy.contracts)){
  const text=readFileSync(resolve(root,file),'utf8');
  for(const pattern of patterns)if(!text.includes(pattern))throw Error('release_required_contract_missing:'+file+':'+pattern);
 }
}
export function manifest(cwd=process.cwd()) {
 const source=checkSource(cwd);const root=resolve(cwd,'dist');assertContracts(root);
 const files=Object.fromEntries(filesAt(root).filter(f=>f!=='.backend-release.json').map(f=>[f,createHash('sha256').update(readFileSync(resolve(root,f))).digest('hex')]));
 const artifactHash=createHash('sha256').update(JSON.stringify(files)).digest('hex');
 writeFileSync(resolve(root,'.backend-release.json'),JSON.stringify({...source,artifactHash,files},null,2)+'\n');
}
export function verify(root){const data=JSON.parse(readFileSync(resolve(root,'.backend-release.json'),'utf8'));if(data.repository!==policy.repo||data.branch!==policy.branch)throw Error('release_manifest_origin');
 for(const [file,hash] of Object.entries(data.files)) {if(file.includes('..')||file.startsWith('/')||createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')!==hash)throw Error('release_artifact_mismatch:'+file);}
 if(createHash('sha256').update(JSON.stringify(data.files)).digest('hex')!==data.artifactHash)throw Error('release_manifest_mismatch');assertContracts(root);return data;}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const mode=process.argv[2];if(mode==='manifest')manifest();else if(mode==='verify')verify(process.argv[3]||'dist');else checkSource();}
