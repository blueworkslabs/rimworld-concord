/** Operator-only fixture preparation from the owned lab-initial save. */
import {LabBridge} from './lab-bridge.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
const exec=promisify(execFile),root=new URL('../..',import.meta.url).pathname,b=new LabBridge();
await b.load('lab-initial');await b.admin('pause');const state=await b.state();
const positions=state.pawns.map(p=>{if(!p.movement?.options.length)throw Error('No grounded fixture destinations');return {...p.movement.options[0],candidates:p.movement.options,sourceX:p.x,sourceZ:p.z};});
const name='lab-concord-haul-fixture-'+Date.now();
const {stdout}=await exec('python3',[root+'/scripts/hauling-fixture.py',b.root+'/profile/Saves/lab-initial.rws',b.root+'/profile/Saves/'+name+'.rws',JSON.stringify(positions)]);
await b.load(name);await mkdir(root+'/.runtime',{recursive:true});await writeFile(root+'/.runtime/haul-fixture.json',JSON.stringify({name}));
console.log(JSON.stringify({fixture:JSON.parse(stdout),pawns:(await b.state()).pawns.map(p=>({id:p.id,hauling:p.hauling}))}));
