import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {stopArm} from '../src/harness/process-lifecycle.js';
test('stop owns the actual detached MCP group, including an in-flight tool child',async()=>{
 const dir=mkdtempSync(tmpdir()+'/concord-arm-stop-'),file=dir+'/process.json';
 const module=new URL('../src/harness/process-lifecycle.js',import.meta.url).href;
 const c=spawn(process.execPath,['--input-type=module','-e',`import {registerArm} from ${JSON.stringify(module)};import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';registerArm();const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);writeFileSync(${JSON.stringify(dir+'/child')},String(p.pid));setInterval(()=>{},1000);`],{detached:true,stdio:'ignore',env:{...process.env,CONCORD_BENCH_PROCESS_FILE:file}});
 const end=Date.now()+3000;while(!existsSync(dir+'/child')&&Date.now()<end)await delay(10);
 try{assert.ok(existsSync(file));assert.ok(existsSync(dir+'/child'));await stopArm(file);
 const pid=Number(readFileSync(dir+'/child','utf8'));
 const live=()=>{try{return !readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1]!.startsWith('Z ');}catch{return false;}};
 for(let n=0;n<100&&live();n++)await delay(10);assert.equal(live(),false);
 }finally{if(c.pid)try{process.kill(-c.pid,'SIGKILL');}catch{}}
});
test('stale process receipts cannot kill a reused process ID',async()=>{
 const dir=mkdtempSync(tmpdir()+'/concord-stale-arm-'),file=dir+'/process.json';writeFileSync(file,JSON.stringify({pid:process.pid,started:'not-the-current-start'}));await stopArm(file);assert.ok(existsSync(file+'.stop'));
});
