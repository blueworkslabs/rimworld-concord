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
