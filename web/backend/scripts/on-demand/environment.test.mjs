import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { readEnvironment } from './environment.mjs';
test('dotenv updates remain visible and explicit application overrides retain precedence',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'demand-env-'));
 try{
  const json=path.join(dir,'app.json'), dotenv=path.join(dir,'.env');
  await writeFile(json,JSON.stringify({DEMAND_PROJECT_ENV:dotenv,EXPLICIT:'original'}));
  await writeFile(dotenv,'EXPLICIT=default\nROTATED=old\n');
  assert.equal((await readEnvironment(json)).EXPLICIT,'original');
  await writeFile(dotenv,'EXPLICIT=new\nROTATED=updated\n');
  assert.equal((await readEnvironment(json)).ROTATED,'updated');
 }finally{await rm(dir,{recursive:true,force:true});}
});
