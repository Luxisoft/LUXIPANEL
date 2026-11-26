#!/usr/bin/env node
/** Trusted supervisor bridge. Only owned job bytes are transferred; no nginx mutation. */
import {readFile,writeFile,lstat,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.LUXIPANEL_BACKEND_ROOT??'/var/www/LUXIPANEL/web/backend';
const load=p=>import(pathToFileURL(path.join(root,'dist',p)).href);
const {providerRepository}=await load('modules/hosting/repositories/provider.repository.js');
const {frontendPublicationService}=await load('modules/hosting/services/frontend-publication.service.js');
const {connectRedis,getRedis}=await load('shared/redis/index.js');
const {disposeAllVaultExecutors}=await load('shared/executor/vault-executor.js');
const file=process.argv[2];
if(!/^\/etc\/luxipanel\/hosting\/deployments\/[a-f0-9]{64}\/jobs\/[a-f0-9-]{36}\/input\.json$/.test(file))throw Error('invalid_handoff_path');
const job=JSON.parse(await readFile(file,'utf8'));let input='';for await(const chunk of process.stdin)input+=chunk;
const result=JSON.parse(input);if(result.versionId!==job.versionId)throw Error('handoff_version_mismatch');
await connectRedis(process.env.REDIS_URL);
try{
 const provider=await providerRepository.get(job.providerId);if(!provider)throw Error('handoff_provider_missing');
 const metadata={};
 for(const part of result.components){
  if(part.surface!=='static')continue;
  if(!/^[a-z][a-z0-9-]{0,29}$/.test(part.name))throw Error('handoff_component_invalid');
  const meta=part.staticArchive;
  if(!/^[a-f0-9]{64}$/.test(meta?.sha256??'')||!Number.isInteger(meta.bytes)||meta.bytes<1||meta.bytes>33554432)throw Error('handoff_archive_invalid');
  if(job.frontendArtifacts?.[part.name]) {
    await frontendPublicationService.readArtifact(provider,job.accountId,job.projectId,job.versionId,part.name,meta);
  }else{
    const archive=path.join(path.dirname(file),'static',part.name+'.zip'),stat=await lstat(archive);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==meta.bytes)throw Error('handoff_archive_invalid');
    const bytes=await readFile(archive);if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error('handoff_hash_mismatch');
    await frontendPublicationService.putArtifact(provider,job.accountId,job.projectId,job.versionId,part.name,bytes);
  }
  metadata[part.name]={sha256:meta.sha256,bytes:meta.bytes};
 }
 if(Object.keys(metadata).length){
  const target=path.join(job.versionRoot,'frontend-artifacts.json');
  await writeFile(target+'.next',JSON.stringify(metadata),{mode:0o600});await rename(target+'.next',target);
 }
}finally{await disposeAllVaultExecutors();getRedis().disconnect();}
