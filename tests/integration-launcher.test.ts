import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';

test('integration launcher refuse an owned staging lock and direct entry points fail before transport',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-integration-lock-'));await mkdir(join(dir,'concord'));
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:dir};delete env.CONCORD_INTEGRATION_LOCKED;
 const owner=spawn('flock',['-n',join(dir,'concord/coordinator.lock'),'sh','-c','printf ready; read release'],{stdio:['pipe','pipe','pipe']});
 const closed=once(owner,'close');
 try {
  const [ready]=await once(owner.stdout,'data');assert.equal(ready.toString(),'ready');
  for(const mode of ['game','cold']){
   const result=spawnSync('bash',['scripts/run-integration-lab.sh',mode],{env,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
  for(const entry of ['integration-game']){
   const result=spawnSync(process.execPath,['dist/trials/'+entry+'.js'],{env,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.match(result.stderr,/Use scripts\/run-integration-lab.sh/);
   assert(!result.stderr.includes('Bridge timeout'));
  }
 }finally{owner.stdin.end('release\n');await closed;await rm(dir,{recursive:true,force:true});}
});
