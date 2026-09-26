import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {remoteArmCommand} from '../src/harness/controller-launch.js';
import {assertLabLockHeld} from '../src/harness/process-lifecycle.js';
import {LineChannel} from '../src/harness/controller-wire.js';
const lab=()=>{const d=mkdtempSync(tmpdir()+'/concord-xhost-lab-');mkdirSync(d+'/concord');return d;};
const hold=async(d:string)=>{const h=spawn('flock',['-n',d+'/concord/coordinator.lock','sleep','30'],{stdio:'ignore'});await delay(200);return h;};

test('remote arm command: validated target and repo, env survives the remote shell verbatim',()=>{
 const armEnv={CONCORD_BENCH_DIR:"/tmp/it's here; $HOME `id`",PATH:'/usr/bin:/bin'};
 for(const bad of [{sshTarget:'-oProxyCommand=x',remoteRepo:'/r'},{sshTarget:'a b',remoteRepo:'/r'},{sshTarget:'host',remoteRepo:'r'}])assert.throws(()=>remoteArmCommand({...bad,armEnv},'harness'));
 assert.throws(()=>remoteArmCommand({sshTarget:'host',remoteRepo:'/r',armEnv:{'BAD-NAME':'x'}},'harness'));
 const repo=mkdtempSync(tmpdir()+"/concord-xhost-repo-'q ");mkdirSync(repo+'/dist/trials',{recursive:true});
 writeFileSync(repo+'/dist/trials/ui-mcp-server.js',"console.log(JSON.stringify({dir:process.env.CONCORD_BENCH_DIR,locked:process.env.CONCORD_HARNESS_LOCKED,cwd:process.cwd()}))");
 const r=remoteArmCommand({sshTarget:'clawd@staging.lan',remoteRepo:repo,armEnv},'ui');
 assert.deepEqual(r.args.slice(0,6),['-o','BatchMode=yes','-o','ConnectTimeout=10','-T','clawd@staging.lan']);
 assert.equal(r.command,'ssh');
 // ssh hands the last argument to the remote login shell; run it through a shell here.
 const out=spawnSync('bash',['-c',r.args.at(-1)!],{encoding:'utf8'});assert.equal(out.status,0,out.stderr);
 assert.deepEqual(JSON.parse(out.stdout),{dir:armEnv.CONCORD_BENCH_DIR,locked:'1',cwd:repo});
});

test('arm servers serve only while the lab lock is held',async()=>{
 const d=lab();assert.throws(()=>assertLabLockHeld(d),/not held/);assert.throws(()=>assertLabLockHeld('relative'));
 const h=await hold(d);try{assertLabLockHeld(d);}finally{h.kill();}
});

test('arm server refuses without the lock and exits on stdin EOF with it',async()=>{
 const d=lab(),server=new URL('../trials/harness-mcp-server.js',import.meta.url).pathname;
 writeFileSync(d+'/start.json',readFileSync(new URL('../../tests/fixtures/perception-snapshot.json',import.meta.url),'utf8'));
 const env={...process.env,RIMWORLD_LAB_ROOT:d,CONCORD_HARNESS_LOCKED:'1',CONCORD_BENCH_CALL_LOG:d+'/calls.jsonl',CONCORD_BENCH_PROCESS_FILE:d+'/calls.jsonl.process.json',CONCORD_BENCH_DIR:d};
 const run=()=>new Promise<number|null>(r=>{const c=spawn(process.execPath,[server],{env,detached:true,stdio:['pipe','ignore','ignore']});c.stdin.end();c.on('exit',r);setTimeout(()=>{c.kill('SIGKILL');r(-1);},10000).unref();});
 assert.notEqual(await run(),0);
 const h=await hold(d);try{assert.equal(await run(),0);}finally{h.kill();}
});

test('wire: correlated waits, stray lines kept aside, close rejects pending waits',async()=>{
 const a=new PassThrough(),b=new PassThrough();
 const ch=new LineChannel<{type:string;runId:string},{type:string}>(a,b);let sent='';b.on('data',d=>sent+=d);
 const seen:string[]=[];ch.on(m=>seen.push(m.type));
 const wait=ch.next(m=>m.type==='launched'&&m.runId==='r1',1000);
 a.write('npm warn something\n{"type":"controller-event","runId":"r1"}\n{"type":"launched","runId":"r1"}\n');
 assert.deepEqual(await wait,{type:'launched',runId:'r1'});
 ch.send({type:'ready'});assert.equal(sent,'{"type":"ready"}\n');
 assert.deepEqual(seen,['controller-event','launched']);assert.deepEqual(ch.noise,['npm warn something']);
 const pending=ch.next(()=>false,5000);a.end();await assert.rejects(pending,/Wire closed/);assert.equal(ch.closed,true);
});
