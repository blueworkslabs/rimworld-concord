import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
test('perception launcher and direct entry fail before transport without exclusive ownership',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-perception-lock-'));await mkdir(join(dir,'concord'));
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:dir};delete env.CONCORD_HARNESS_LOCKED;
 const owner=spawn('flock',['-n',join(dir,'concord/coordinator.lock'),'sh','-c','printf ready; read release'],{stdio:['pipe','pipe','pipe']});const closed=once(owner,'close');
 try{await once(owner.stdout,'data');
  const locked=spawnSync('bash',['scripts/run-harness-perceive.sh','--save=lab-unused'],{env,encoding:'utf8',timeout:5000});assert.equal(locked.status,1);assert.equal(locked.stdout,'');assert.equal(locked.stderr,'');
  const direct=spawnSync(process.execPath,['dist/trials/harness-perceive.js'],{env,encoding:'utf8',timeout:5000});assert.equal(direct.status,1);assert.match(direct.stderr,/Exclusive lab lock required/);
  assert.deepEqual(await readdir(join(dir,'concord')),['coordinator.lock']);
 }finally{owner.stdin.end('release\n');await closed;await rm(dir,{recursive:true,force:true});}
});
