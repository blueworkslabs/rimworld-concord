import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
test('construction entry points reject direct invocation before accessing an empty lab',()=>{
 const lab=mkdtempSync(join(tmpdir(),'concord-construction-guard-'));
 try{
  const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:lab};delete env.CONCORD_NATIVE_CONSTRUCTION_LOCKED;
  for(const entry of ['native-construction-game','native-construction-restore']){
   const r=spawnSync(process.execPath,[join(root,'dist/trials',entry+'.js')],{env,encoding:'utf8'});
   assert.notEqual(r.status,0);assert.match(r.stderr,/Exclusive lab lock required/);
   assert.deepEqual(readdirSync(lab),[]);
  }
  const r=spawnSync(process.execPath,[join(root,'dist/trials/native-construction-game.js'),'--case=invalid'],{env:{...env,CONCORD_NATIVE_CONSTRUCTION_LOCKED:'1'},encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Unknown construction case/);assert.deepEqual(readdirSync(lab),[]);
 }finally{rmSync(lab,{recursive:true,force:true});}
});
test('construction launcher rejects a held coordinator lock before touching the bridge',()=>{
 const lab=mkdtempSync(join(tmpdir(),'concord-construction-lock-'));mkdirSync(join(lab,'concord'));
 try{
  const r=spawnSync('flock',['-n',join(lab,'concord/coordinator.lock'),'bash',join(root,'scripts/run-native-construction-lab.sh'),'--case=1-accept-build'],{env:{...process.env,RIMWORLD_LAB_ROOT:lab},encoding:'utf8'});
  assert.notEqual(r.status,0);assert.deepEqual(readdirSync(join(lab,'concord')),['coordinator.lock']);
 }finally{rmSync(lab,{recursive:true,force:true});}
});
