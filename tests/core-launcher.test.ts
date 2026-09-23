import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';

test('core launcher refuse an owned staging lock and direct entry points fail before transport',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-core-lock-'));await mkdir(join(dir,'concord'));
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:dir};delete env.CONCORD_CORE_LOCKED;delete env.CONCORD_CORE_EVENTS_LOCKED;delete env.CONCORD_CORE_LIFECYCLE_LOCKED;delete env.CONCORD_CORE_FOLLOWUP_LOCKED;
 const owner=spawn('flock',['-n',join(dir,'concord/coordinator.lock'),'sh','-c','printf ready; read release'],{stdio:['pipe','pipe','pipe']});
 const closed=once(owner,'close');
 try {
  const [ready]=await once(owner.stdout,'data');assert.equal(ready.toString(),'ready');
  for(const mode of ['game','cold'])for(const launcher of ['scripts/run-core-lab.sh','scripts/run-core-events-lab.sh','scripts/run-core-lifecycle-lab.sh','scripts/run-core-followup-lab.sh']){
   const result=spawnSync('bash',[launcher,mode],{env,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
  for(const entry of ['core-game','core-events-game','core-lifecycle-game','core-followup-game']){
   const result=spawnSync(process.execPath,['dist/trials/'+entry+'.js'],{env,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.match(result.stderr,/Use scripts\/run-core(?:-events|-lifecycle|-followup)?-lab.sh/);
   assert(!result.stderr.includes('Bridge timeout'));
  }
 }finally{owner.stdin.end('release\n');await closed;await rm(dir,{recursive:true,force:true});}
});
