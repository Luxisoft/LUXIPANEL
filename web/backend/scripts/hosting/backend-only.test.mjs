import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {isBackendPath} from './backend-only.mjs';
test('backend split preserves API and health while refusing UI and traversal',async()=>{
 for(const url of ['/', '/es/', '/assets/app.js', '/api/../es/', '/api/%2e%2e/es/', '/api/..%2fes/', 'http://[invalid']) assert.equal(isBackendPath(url),false,url);
 for(const url of ['/api', '/api/config?x=1', '/health']) assert.equal(isBackendPath(url),true,url);
 const server=http.createServer((req,res)=>res.end('original-handler'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port;
  for(const path of ['/api/config','/health']){const r=await fetch(base+path);assert.equal(r.status,200);assert.equal(await r.text(),'original-handler');}
  const denied=await fetch(base+'/');assert.equal(denied.status,404);assert.equal((await denied.json()).error,'not_found');
 }finally{await new Promise(r=>server.close(r));}
});
