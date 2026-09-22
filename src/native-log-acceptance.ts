/** Read-only observer feature exercised through disposable, operator-authored saves. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from './lab-bridge.js';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import type {GameState} from './protocol.js';
if(process.env.CONCORD_RESCUE_LOCKED!=='1')throw Error('Use scripts/run-rescue-lab.sh native-log|native-log-cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold');
const receipt:any={passed:false,inferenceCalls:0,checks:[]};let s:Store|undefined,c:Coordinator|undefined;
const name=(label:string)=>'lab-concord-native-'+label+'-'+Date.now();
async function runUntil(test:(g:GameState)=>boolean,observe=true){
 await b.admin('run');const end=Date.now()+18000;let g=await b.state();
 while(!test(g)&&Date.now()<end){if(observe)await c!.observe();await delay(80);g=await b.state();}
 await b.admin('pause');if(observe)await c!.observe();assert(test(g),'Native observation deadline');return b.state();
}
async function copyFixture(source:string,target:string,config:unknown){
 await promisify(execFile)('python3',['-c',`import sys,json,xml.etree.ElementTree as E
src,dst,raw=sys.argv[1:];c=json.loads(raw);r=E.parse(src)
for p in r.findall('.//maps/li/things/thing'):
 if p.findtext('def')!='Human':continue
 ident='Thing_'+str(p.findtext('id'))
 if ident==c['target'] and 'duration' in c:
  h=next(h for h in p.findall('healthTracker/hediffSet/hediffs/li') if h.findtext('def')=='Anesthetic')
  for k in ['ticksToDisappear','disappearsAfterTicks']:h.find(k).text=str(c['duration'])
 relocated=False
 if c.get('hide') and ident!=c['target']:p.find('pos').text='(3, 0, 3)';relocated=True
 if ident==c.get('observer') and 'near' in c:p.find('pos').text='(%s, 0, %s)'%(c['near']['x'],c['near']['z']);relocated=True
 if relocated:
  # A saved in-flight path otherwise steps back to its old nextCell on load.
  for key in ['jobs','pather']:
   node=p.find(key)
   if node is not None:node.clear()
with open(dst,'xb') as f:r.write(f,encoding='utf-8',xml_declaration=True)
`,b.root+'/profile/Saves/'+source+'.rws',b.root+'/profile/Saves/'+target+'.rws',JSON.stringify(config)]);
}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/native-log-latest.json','utf8'));
  await b.load(saved.checkpoint);await b.admin('pause');const offline=await b.state();assert.deepEqual(offline.crewLog?.entries,saved.report.entries);
  s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);
  const before=await b.state(),count=before.events!.filter(e=>e.kind==='casualty-recovered'&&e.subject===saved.target).length;
  const after=await runUntil(g=>g.ticks>=before.ticks+120);assert.equal(after.events!.filter(e=>e.kind==='casualty-recovered'&&e.subject===saved.target).length,count);
  assert.equal(after.pawns.find(p=>p.id===saved.target)?.downed,false);assert.equal(after.actions.length,0);
  assert.deepEqual(after.crewLog!.entries,saved.report.entries);receipt.report=after.crewLog;
  receipt.checks.push('game-only saved log, paired cold restore and no repeated recovery after restart');
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/rescue-fixture.json','utf8')),fixture=name('fixture');await copyFixture(f.name,fixture,{target:f.target,duration:600});
  await b.load(fixture);await b.admin('pause');const db=root+'/.runtime/native-log-'+Date.now()+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  const own=(await b.state()).pawns.find(p=>p.id===f.rescuer)!;assert(own.casualties?.observations.some(o=>o.target===f.target));
  const seen=await runUntil(g=>!!g.events?.some(e=>e.pawn===f.rescuer&&e.subject===f.target&&e.kind==='casualty'));
  assert.equal(seen.pawns.find(p=>p.id===f.target)?.downed,true);assert(seen.crewLog!.entries.some(e=>e.subject===f.target&&e.text.includes('downed and outside a bed')));
  const baseline=name('baseline');await c.checkpoint(baseline);const baselineReport=(await b.state()).crewLog!,baselineSeq=seen.eventSeq!;
  // Explicit saved-fixture relocations, not a claim of native navigation or global awareness.
  const hidden=name('hidden');await copyFixture(baseline,hidden,{target:f.target,duration:60,hide:true});await b.load(hidden);await b.admin('pause');
  const hiddenStart=await b.state();
  const distant=(g:GameState)=>{const t=g.pawns.find(p=>p.id===f.target)!;return g.pawns.filter(p=>p.id!==f.target).every(p=>Math.max(Math.abs(p.x-t.x),Math.abs(p.z-t.z))>12);};
  assert(distant(hiddenStart),'Relocated observers must really be out of range');
  const hiddenEnd=await runUntil(g=>g.ticks>=hiddenStart.ticks+120,false);
  assert(distant(hiddenEnd),'Observers must remain out of range through recovery');
  assert.equal(hiddenEnd.pawns.find(p=>p.id===f.target)?.downed,false);
  assert(!hiddenEnd.events!.some(e=>e.seq>baselineSeq&&e.kind==='casualty-recovered'&&e.subject===f.target));
  const hiddenSave=name('hidden-saved');await b.save(hiddenSave);const near=name('near');await copyFixture(hiddenSave,near,{target:f.target,observer:f.rescuer,near:{x:own.x,z:own.z}});
  await b.load(near);await b.admin('pause');const reobserved=await runUntil(g=>!!g.events?.some(e=>e.seq>baselineSeq&&e.kind==='casualty-recovered'&&e.pawn===f.rescuer&&e.subject===f.target),false);
  assert.equal(reobserved.actions.length,0);receipt.checks.push('out-of-view recovery emits nothing; persisted prior sighting produces recovery only on local reacquisition');
  await c.restore(baseline);assert.deepEqual((await b.state()).crewLog!.entries,baselineReport.entries);
  assert(!(await b.state()).events!.some(e=>e.seq>baselineSeq&&e.kind==='casualty-recovered'));
  const recovered=await runUntil(g=>!!g.events?.some(e=>e.kind==='casualty-recovered'&&e.pawn===f.rescuer&&e.subject===f.target));
  assert.equal(recovered.pawns.find(p=>p.id===f.target)?.downed,false);assert.equal(recovered.actions.length,0);
  const events=recovered.events!.filter(e=>e.kind==='casualty-recovered'&&e.subject===f.target),entries=recovered.crewLog!.entries.filter(e=>e.subject===f.target&&e.text.includes('no longer downed'));
  assert.equal(events.filter(e=>e.pawn===f.rescuer).length,1);assert.equal(entries.length,events.length);
  for(const e of events){const row=entries.find(r=>r.key===`native-observation:${e.seq}`);assert(row);assert.equal(row.tick,e.tick);assert.equal(row.kind,'record');assert.equal(row.recipient,'observer');}
  const after=await runUntil(g=>g.ticks>=recovered.ticks+120);assert.equal(after.events!.filter(e=>e.kind==='casualty-recovered'&&e.subject===f.target).length,events.length);
  receipt.checks.push('observed native recovery without a rescue job, correct observation ticks and per-observer deduplication');
  await c.restore(baseline);assert.deepEqual((await b.state()).crewLog!.entries,baselineReport.entries);
  assert(!(await b.state()).crewLog!.entries.some(e=>e.text.includes('no longer downed')));
  await runUntil(g=>!!g.events?.some(e=>e.kind==='casualty-recovered'&&e.pawn===f.rescuer&&e.subject===f.target));
  receipt.checks.push('rewinding before recovery removes later public recovery records');
  const checkpoint=name('final');await c.checkpoint(checkpoint);const report=(await b.state()).crewLog!;await c.restore(checkpoint);assert.deepEqual((await b.state()).crewLog!.entries,report.entries);
  await writeFile(root+'/.runtime/native-log-latest.json',JSON.stringify({db,checkpoint,report,target:f.target}));receipt.report=report;receipt.events=events;receipt.pairedRestore=true;receipt.noActions=after.actions.length===0;
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{try{await b.admin('pause');}catch{}s?.close();await writeFile(root+'/.runtime/native-log-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));}
