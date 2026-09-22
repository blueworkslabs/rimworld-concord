/** Trusted fixture operator, never a pawn capability. */
import {LabBridge} from './lab-bridge.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.CONCORD_RESCUE_LOCKED!=='1')throw Error('Use scripts/run-rescue-lab.sh fixture to acquire the staging lock');
const b=new LabBridge(),root=new URL('../..',import.meta.url).pathname;
await b.load('lab-initial');await b.admin('pause');const state=await b.state();
const rescuer=state.pawns.find(p=>p.rescueReady&&p.movement!.options.length>=8)!;
if(!rescuer)throw Error('No ready rescuer');
const target=state.pawns.find(p=>p.id!==rescuer.id)!;
const cells=state.pawns.flatMap(p=>p.movement?.options??[]).filter((c,i,all)=>all.findIndex(d=>d.x===c.x&&d.z===c.z)===i);
// Both cells of each north-facing sleeping spot must be in the observed ground list.
const beds=cells.filter(c=>cells.some(d=>d.x===c.x&&d.z===c.z+1))
  .filter(c=>!state.pawns.some(p=>p.x===c.x&&(p.z===c.z||p.z===c.z+1)))
  .sort((a,b)=>((b.x-rescuer.x)**2+(b.z-rescuer.z)**2)-((a.x-rescuer.x)**2+(a.z-rescuer.z)**2));
const first=beds[0]!,second=beds.find(c=>c.x!==first?.x||Math.abs(c.z-first.z)>1)!;
if(!first||!second)throw Error('Need two nonoverlapping observed bed sites');
const patientCell=rescuer.movement!.options.find(c=>[first,second].every(b=>c.x!==b.x||(c.z!==b.z&&c.z!==b.z+1)))!;
const name='lab-concord-rescue-fixture-'+Date.now();
const config={target:target.id,patientCell,beds:[first,second]};
const {stdout}=await promisify(execFile)('python3',[root+'/scripts/rescue-fixture.py',b.root+'/profile/Saves/lab-initial.rws',b.root+'/profile/Saves/'+name+'.rws',JSON.stringify(config)]);
await b.load(name);await b.admin('pause');const actual=await b.state();
await mkdir(root+'/.runtime',{recursive:true});await writeFile(root+'/.runtime/rescue-fixture.json',JSON.stringify({name,target:target.id,rescuer:rescuer.id}));
console.log(JSON.stringify({fixture:JSON.parse(stdout),pawns:actual.pawns.map(p=>({id:p.id,ready:p.rescueReady,rescue:p.rescue}))}));
