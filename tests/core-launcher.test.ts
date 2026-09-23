import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';

test('core launcher refuse an owned staging lock and direct entry points fail before transport',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-core-lock-'));await mkdir(join(dir,'concord'));
 const env:NodeJS.ProcessEnv={...process.env,RIMWORLD_LAB_ROOT:dir};delete env.CONCORD_CORE_LOCKED;delete env.CONCORD_CORE_EVENTS_LOCKED;delete env.CONCORD_CORE_LIFECYCLE_LOCKED;delete env.CONCORD_CORE_FOLLOWUP_LOCKED;delete env.CONCORD_FOOD_LOCKED;delete env.CONCORD_NATIVE_FOOD_LOCKED;delete env.CONCORD_PAWN_EATING_LOCKED;
 const owner=spawn('flock',['-n',join(dir,'concord/coordinator.lock'),'sh','-c','printf ready; read release'],{stdio:['pipe','pipe','pipe']});
 const closed=once(owner,'close');
 try {
  const [ready]=await once(owner.stdout,'data');assert.equal(ready.toString(),'ready');
  for(const mode of ['game','cold'])for(const launcher of ['scripts/run-core-lab.sh','scripts/run-core-events-lab.sh','scripts/run-core-lifecycle-lab.sh','scripts/run-core-followup-lab.sh','scripts/run-food-observation-lab.sh','scripts/run-native-food-lab.sh','scripts/run-pawn-eating-lab.sh']){
   const result=spawnSync('bash',[launcher,mode,'11111111-1111-4111-8111-111111111111'],{env,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
  for(const entry of ['core-game','core-events-game','core-lifecycle-game','core-followup-game','food-observation-game','native-food-game','pawn-eating-game']){
   const result=spawnSync(process.execPath,['dist/trials/'+entry+'.js'],{env,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1);assert.match(result.stderr,/Use (scripts\/run-core(?:-events|-lifecycle|-followup)?-lab.sh|locked food observation launcher|locked native food launcher|locked pawn eating launcher)/);
   assert(!result.stderr.includes('Bridge timeout'));
  }
 }finally{owner.stdin.end('release\n');await closed;await rm(dir,{recursive:true,force:true});}
});

test('a repeated food run cannot overwrite its receipt or reach the game',async()=>{
 const {randomUUID}=await import('node:crypto'),{writeFile,readFile,unlink}=await import('node:fs/promises');
 const run=randomUUID(),path='.runtime/food-'+run+'-game.json';await mkdir('.runtime',{recursive:true});await writeFile(path,'retained evidence',{flag:'wx'});
 try{
  const r=spawnSync(process.execPath,['dist/trials/food-observation-game.js','game',run],{env:{...process.env,CONCORD_FOOD_LOCKED:'1',RIMWORLD_LAB_ROOT:'/nonexistent-food-lab'},encoding:'utf8',timeout:5000});
  assert.equal(r.status,1);assert.match(r.stderr,/EEXIST/);assert(!r.stderr.includes('Bridge timeout'));assert.equal(await readFile(path,'utf8'),'retained evidence');
 }finally{await unlink(path);}
});

test('a repeated native food run cannot overwrite its receipt or reach the game',async()=>{
 const {randomUUID}=await import('node:crypto'),{writeFile,readFile,unlink}=await import('node:fs/promises');
 const run=randomUUID(),path='.runtime/native-food-'+run+'-game.json';await mkdir('.runtime',{recursive:true});await writeFile(path,'retained evidence',{flag:'wx'});
 try{
  const r=spawnSync(process.execPath,['dist/trials/native-food-game.js','game',run],{env:{...process.env,CONCORD_NATIVE_FOOD_LOCKED:'1',RIMWORLD_LAB_ROOT:'/nonexistent-food-lab'},encoding:'utf8',timeout:5000});
  assert.equal(r.status,1);assert.match(r.stderr,/EEXIST/);assert(!r.stderr.includes('Bridge timeout'));assert.equal(await readFile(path,'utf8'),'retained evidence');
 }finally{await unlink(path);}
});
