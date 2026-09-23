import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {perspectiveCases} from '../trials/perspective-cases.js';
import {perspectiveCasesV2,checkNeedsFixture} from '../trials/perspective-v2.js';
import {decisionTrials} from '../src/decision-trials.js';
test('v2 removes readiness confounds without modifying retained v1',()=>{
 const before=perspectiveCases();const v2=perspectiveCasesV2();assert.equal(v2.length,12);
 assert.deepEqual(perspectiveCases(),before);
 assert.equal(before.find(c=>c.id==='needs-low-r1')!.view.pawn.rescueReady,true);
 const low=v2.find(c=>c.id==='needs-low-r1')!.view;low.pawn.rescueReady=true;
 assert.throws(()=>checkNeedsFixture(low,'low'));
 const unknown=v2.find(c=>c.id==='needs-unknown-r1')!.view;unknown.pawn.workReady=true;
 assert.throws(()=>checkNeedsFixture(unknown,'unknown'));
});
test('needs entries require launcher and a held lock blocks all game access',()=>{
 const root=mkdtempSync(tmpdir()+'/needs-guards-');mkdirSync(root+'/concord');
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:root};delete env.CONCORD_NEEDS_LOCKED;
 for(const entry of ['needs-fixture','needs-game']){
  const r=spawnSync(process.execPath,['dist/trials/'+entry+'.js'],{env,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Use scripts\/run-needs-lab/);
 }
 for(const mode of ['fixture','game','cold']){
  const r=spawnSync('flock',['-n',root+'/concord/coordinator.lock','bash','scripts/run-needs-lab.sh',mode],{env,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.equal(existsSync(root+'/concord/request.json'),false);
 }
 assert.equal(decisionTrials['needs-v1'].calls,4);assert.equal(decisionTrials['needs-v1'].reservedEquivalentUSD,.4);
});

import {smallerHaul,NeedsRunGuard} from '../trials/needs-policy.js';
test('trial stop and observation guards reject disconnect, pause and no tick progress',()=>{
 const guard=new NeedsRunGuard();guard.sample(false,2,1);
 assert.throws(()=>guard.sample(true,2,1));assert.throws(()=>guard.sample(false,1,1));
 guard.stop();assert.throws(()=>guard.check());assert.throws(()=>guard.sample(false,2,1));
});
test('only strictly smaller same-target hauling counters receive another offer',()=>{
 const offer={kind:'haul' as const,thing:'wood',x:3,z:2,count:10,trips:2,maxTicks:3600};
 assert(!smallerHaul(offer,offer));assert(smallerHaul({...offer,trips:1},offer));
 assert(!smallerHaul({...offer,trips:1,count:11},offer));
 assert(!smallerHaul({...offer,thing:'other',trips:1},offer));
});

import {Writable} from 'node:stream';
import {needsOutput} from '../trials/needs-policy.js';
test('broken output stops once and does not crash or keep sending during cleanup',async()=>{
 let failures=0,writes=0;
 const output=new Writable({write(_chunk,_encoding,callback){writes++;callback(Error('EPIPE'));}});
 const send=needsOutput(output,()=>{failures++;send({type:'cancel'});});
 send({type:'request'});await new Promise(resolve=>setImmediate(resolve));
 send({type:'receipt'});assert.equal(failures,1);assert.equal(writes,1);
});


test('social entry is locked and has its own four-attempt allowance',()=>{
 const root=mkdtempSync(tmpdir()+'/social-guards-');mkdirSync(root+'/concord');
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:root};delete env.CONCORD_SOCIAL_LOCKED;
 const direct=spawnSync(process.execPath,['dist/trials/social-game.js'],{env,encoding:'utf8'});
 assert.notEqual(direct.status,0);assert.match(direct.stderr,/Use scripts\/run-social-lab/);
 for(const mode of ['fixture','game','cold']){
  const r=spawnSync('flock',['-n',root+'/concord/coordinator.lock','bash','scripts/run-social-lab.sh',mode],{env,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.equal(existsSync(root+'/concord/request.json'),false);
 }
 assert.equal(decisionTrials['social-v1'].calls,4);assert.equal(decisionTrials['social-v1'].reservedEquivalentUSD,.4);
});

test('retention entry is locked and has its own four-attempt allowance',()=>{
 const root=mkdtempSync(tmpdir()+'/retention-guards-');mkdirSync(root+'/concord');
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:root};delete env.CONCORD_RETENTION_LOCKED;
 const direct=spawnSync(process.execPath,['dist/trials/retention-game.js'],{env,encoding:'utf8'});
 assert.notEqual(direct.status,0);assert.match(direct.stderr,/Use scripts\/run-retention-lab/);
 for(const mode of ['fixture','game','cold']){
  const r=spawnSync('flock',['-n',root+'/concord/coordinator.lock','bash','scripts/run-retention-lab.sh',mode],{env,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.equal(existsSync(root+'/concord/request.json'),false);
 }
 assert.equal(decisionTrials['retention-game-v1'].calls,4);assert.equal(decisionTrials['retention-game-v1'].reservedEquivalentUSD,.4);
});
