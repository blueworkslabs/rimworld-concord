/** Operator-authored short anesthesia expiry, actual native recovery, no inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from './lab-bridge.js';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
if(process.env.CONCORD_RESCUE_LOCKED!=='1')throw Error('Use scripts/run-rescue-lab.sh interruptions|interruptions-cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold');
let store:Store|undefined;const receipt:any={passed:false,inferenceCalls:0,cold};
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/interrupt-acceptance-latest.json','utf8'));store=new Store(saved.db);const c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.domain.characters);assert.deepEqual(c.inspect().proposals,saved.domain.proposals);assert.deepEqual(c.inspect().outcomes,saved.domain.outcomes);
  assert.notEqual(c.inspect().epoch,saved.domain.epoch);assert.equal((await b.state()).pawns.find(p=>p.id===saved.target)?.downed,false);receipt.coldRestore=true;
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/rescue-fixture.json','utf8')),name='lab-concord-recovery-'+Date.now();
  await promisify(execFile)('python3',['-c',`import sys,xml.etree.ElementTree as E
src,dst,target=sys.argv[1:];r=E.parse(src)
p=next(t for t in r.findall('.//thing') if 'Thing_'+str(t.findtext('id'))==target)
h=next(h for h in p.findall('healthTracker/hediffSet/hediffs/li') if h.findtext('def')=='Anesthetic')
for key in ['ticksToDisappear','disappearsAfterTicks']:h.find(key).text='180'
with open(dst,'xb') as f:r.write(f,encoding='utf-8',xml_declaration=True)
`,b.root+'/profile/Saves/'+fixture.name+'.rws',b.root+'/profile/Saves/'+name+'.rws',fixture.target]);
  await b.load(name);await b.admin('pause');const db=root+'/.runtime/interrupt-acceptance-'+Date.now()+'.db';store=new Store(db);const c=new Coordinator(store,b);await c.open();
  const action=(await c.core().rescueOptions(fixture.rescuer))?.options.find(a=>a.target===fixture.target);assert(action);assert((await b.state()).pawns.find(p=>p.id===fixture.target)?.downed);
  const p=await c.core().propose(fixture.rescuer,action,'Scripted question while patient recovers');let release!:(v:unknown)=>void,entered!:()=>void;
  const ready=new Promise<void>(r=>entered=r);
  const task=c.pawn(fixture.rescuer).decide(p.id,{name:'scripted-held-answer',decide:()=>{entered();return new Promise(r=>release=r);}},15000).then(()=>false,()=>true);
  await ready;await b.admin('run');const end=Date.now()+12000;
  while(c.activity().length&&Date.now()<end){await c.observe();await delay(80);}
  await b.admin('pause');assert(await task,'Pending answer must be invalidated');release({kind:'accept',reason:'Late answer must not act'});await c.reconcile();
  const state=await b.state();assert.equal(state.pawns.find(p=>p.id===fixture.target)?.downed,false,'Actual patient recovered');assert.equal(state.actions.length,0,'No native rescue dispatched');
  assert.equal(c.inspect().proposals[p.id]!.decision,undefined);const audit=store.events().filter(e=>e.event.kind==='decision-invalidated');assert.equal(audit.length,1);
  await c.core().withdrawOffer(p.id,'Question retired after actual patient recovery; no retry');
  const checkpoint='lab-concord-interrupt-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await c.restore(checkpoint);assert.deepEqual(c.inspect().proposals,domain.proposals);
  await writeFile(root+'/.runtime/interrupt-acceptance-latest.json',JSON.stringify({db,checkpoint,domain,target:fixture.target}));receipt.recoveredPatient=true;receipt.noDispatch=true;receipt.pairedRestore=true;receipt.audit=audit.map(e=>e.event);
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{try{await b.admin('pause');}catch{}store?.close();await writeFile(root+'/.runtime/interrupt-acceptance-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
