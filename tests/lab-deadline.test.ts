import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LabBridge} from '../src/lab-bridge.js';

test('expired lab deadline rejects queued domain and admin commands before dispatch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'concord-deadline-'));
 try{
  await mkdir(join(root,'concord'));await mkdir(join(root,'bin'));
  const b=new LabBridge(root,()=>Date.now()-1);
  await assert.rejects(b.state(),/deadline/);
  await assert.rejects(b.state(),/deadline/);
  await assert.rejects(b.admin('run'),/deadline/);
  assert.deepEqual(await readdir(join(root,'concord')),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('slow load is bounded by the shared deadline and cannot enter state polling',async()=>{
 const root=await mkdtemp(join(tmpdir(),'concord-deadline-'));
 try{
  await mkdir(join(root,'bin'));
  await writeFile(join(root,'bin/lab.py'),`import sys,time,pathlib
p=pathlib.Path(__file__).parent.parent/'calls'
with p.open('a') as f: f.write(sys.argv[2]+'\\n')
time.sleep(5)
print('{"state":{"loaded":true,"loading":false}}')
`);
  const start=Date.now(),b=new LabBridge(root,()=>start+500);
  await assert.rejects(b.load('lab-concord-test'));
  assert(Date.now()-start<3000);
  assert.equal(await readFile(join(root,'calls'),'utf8'),'load\n');
  await assert.rejects(b.admin('state'),/deadline/);
  assert.equal(await readFile(join(root,'calls'),'utf8'),'load\n');
 }finally{await rm(root,{recursive:true,force:true});}
});
