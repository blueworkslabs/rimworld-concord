import assert from 'node:assert/strict';
import {LabBridge} from '../src/lab-bridge.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.CONCORD_NEEDS_LOCKED!=='1')throw Error('Use scripts/run-needs-lab.sh fixture');
const exec=promisify(execFile),root=new URL('../..',import.meta.url).pathname,b=new LabBridge();
await b.load('lab-initial');await b.admin('pause');
const state=await b.state();assert(state.pawns.every(p=>!p.downed));
const actors=state.pawns.filter(p=>p.workReady&&p.movement?.options.length).slice(0,2);assert.equal(actors.length,2);
const positions=actors.map(p=>({id:p.id,...p.movement!.options[0]!,candidates:p.movement!.options,sourceX:p.x,sourceZ:p.z}));
const name='lab-concord-needs-fixture-'+Date.now();
const {stdout}=await exec('python3',[root+'/scripts/needs-fixture.py',b.root+'/profile/Saves/lab-initial.rws',b.root+'/profile/Saves/'+name+'.rws',JSON.stringify(positions)]);
await b.load(name);await b.admin('pause');const actual=await b.state();
for(const [i,actor] of actors.entries()){
 const p=actual.pawns.find(p=>p.id===actor.id)!;
 const food=p.facts?.find(f=>f.key==='need'&&f.value==='Food')?.level;
 assert(Math.abs(food!-(i===0?.4:.9))<.01);assert(p.workReady);
 assert(p.hauling?.options.some(o=>actual.pawns.find(x=>x.id===p.id)?.hauling?.supplies?.some(s=>s.thing===o.thing&&s.label.toLowerCase().includes('wood'))),'Grounded wood option required');
}
assert(actual.pawns.every(p=>!p.downed));
await mkdir(root+'/.runtime',{recursive:true});
await writeFile(root+'/.runtime/needs-fixture.json',JSON.stringify({name,actors:actors.map((p,i)=>({id:p.id,condition:i===0?'hungry':'full'}))}));
console.log(JSON.stringify({fixture:JSON.parse(stdout),actors:actual.pawns.map(p=>({id:p.id,name:p.name,needs:p.facts?.filter(f=>f.key==='need'),hauling:p.hauling}))}));
