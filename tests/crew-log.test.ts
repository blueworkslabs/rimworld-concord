import {encodeCrewReport} from '../src/lab-bridge.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agreementProgress,recordCrew,crewReport,type CrewReport} from '../src/crew-log.js';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import type {Domain,Proposal,GameState,ActionRequest} from '../src/protocol.js';
const haul={kind:'haul' as const,thing:'steel',x:4,z:5,count:10,trips:3,maxTicks:600};
function fixture(){
 const p:Proposal={id:'p',pawn:'A',action:haul,reason:'Public offer',status:'accepted',actionId:'two',standing:{status:'stopped',deadline:600,steps:['one','two']}};
 const d:Domain={schema:1,world:'w',epoch:'e',branch:'b',characters:{A:{id:'A',name:'Ada',memories:['PRIVATE'],reflections:[{tick:1,throughSeq:1,backend:'mock',reason:'PRIVATE'}]}},proposals:{p},outcomes:{one:{id:'one',actor:'A',status:'completed',reason:'native',x:4,z:5,delivered:10},two:{id:'two',actor:'A',status:'started',reason:'native',x:4,z:5}}};return {d,p};
}
test('progress separates completed, active, unknown, unsuccessful and never-started trips',()=>{
 const {d,p}=fixture();let r=agreementProgress(d,p,10);assert.deepEqual([r.completed,r.active,r.notStarted,r.unfulfilled,r.delivered],[1,1,1,2,10]);assert.equal(r.status,'stopped');
 delete d.outcomes.two;r=agreementProgress(d,p,10);assert.equal(r.unconfirmed,1);assert.equal(r.active,0);
 d.outcomes.two={id:'two',actor:'A',status:'interrupted',reason:'stopped',x:4,z:5};r=agreementProgress(d,p,10);assert.equal(r.unsuccessful,1);assert.equal(r.completed,1);
 const fresh=[{...d.outcomes.two,status:'completed' as const,delivered:10}];r=agreementProgress(d,p,20,fresh);assert.equal(r.completed,2);assert.equal(r.delivered,20);assert.equal(r.unfulfilled,1);
 delete d.outcomes.one!.delivered;r=agreementProgress(d,p,20);assert.equal(r.quantityUnknown,1);recordCrew(d,'action-outcome','A',d.outcomes.one,20);assert.match(d.crew!.entries[0]!.text,/quantity not reported/);
});
test('crew log records deliberate replies but never promotes private reflections or stop reasons',()=>{
 const {d,p}=fixture();recordCrew(d,'proposed','core',p,1);recordCrew(d,'attention-reflected','A',{reason:'PRIVATE'},2);
 recordCrew(d,'intention-stopped','A',{proposal:p.id,reason:'PRIVATE'},3);
 recordCrew(d,'decided','A',{...p,decision:{kind:'accept',reason:'My work is wrapped up'}},4);
 recordCrew(d,'action-outcome','A',d.outcomes.one,5);recordCrew(d,'action-outcome','A',d.outcomes.one,6);
 assert.equal(d.crew!.entries.length,4);assert.equal(d.crew!.entries.filter(e=>e.kind==='message').length,2);
 assert(d.crew!.entries.some(e=>e.text==='accept: My work is wrapped up'));assert(!d.crew!.entries.some(e=>e.text.includes('PRIVATE')));
 const report=crewReport(d,10);assert.equal(report.agreements[0]!.progress.completed,1);assert.equal(report.agreements[0]!.progress.unfulfilled,2);
});
test('retention is bounded and display projection excludes injected private extension fields',()=>{
 const {d,p}=fixture();for(let i=0;i<140;i++)recordCrew(d,'proposed','core',{...p,id:String(i)},i);
 assert.equal(d.crew!.entries.length,128);assert.equal(d.crew!.entries[0]!.seq,13);
 (d.crew!.entries[0] as any).privateThought='PRIVATE';(p as any).secret='PRIVATE';const r=crewReport(d,200);
 assert(!('privateThought' in r.entries[0]!));assert(!('secret' in r.agreements[0]!));assert(!('memories' in r));
});
test('display failures do not fail decisions; restore removes future messages and private state is never sent',async()=>{
 const state:GameState={world:'w',epoch:'e',loaded:true,paused:true,ticks:10,pawns:[{id:'A',name:'Ada',job:'Wait',health:1,x:0,z:0}],actions:[]};
 let fail=true,snapshot:CrewReport|undefined;const saves=new Map<string,GameState>();
 const game={async state(){return structuredClone(state);},async move(r:ActionRequest){const a={id:r.id,actor:r.actor,status:'completed' as const,reason:'done',x:1,z:1};state.actions.push(a);return a;},async setCrewLog(r:CrewReport){if(fail)throw Error('display offline');snapshot=structuredClone(r);},async save(n:string){saves.set(n,structuredClone(state));return {sha256:'h'};},async verify(){},async load(n:string){Object.assign(state,structuredClone(saves.get(n)));state.epoch='new';}};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();const p=await c.core().propose('A',{kind:'move',x:1,z:1},'Known message');assert.equal((await c.pawn('A').decide(p.id,scripted({kind:'refuse',reason:'No thanks'}))).status,'refused');assert(c.crewSyncError);
 fail=false;await c.observe();assert.equal(c.crewSyncError,undefined);assert.equal(snapshot!.entries.length,2);
 await c.checkpoint('lab-concord-log');const saved=snapshot!.entries;await c.core().propose('A',{kind:'move',x:1,z:1},'Discarded future');assert(snapshot!.entries.some(e=>e.text==='Discarded future'));
 await c.restore('lab-concord-log');assert.deepEqual(snapshot!.entries,saved);assert.equal(snapshot!.epoch,'new');store.close();
});

test('maximal escaped message retention stays within native transport cap and round-trips',()=>{
 const {d,p}=fixture();d.characters.A!.name='\u0000'.repeat(80);
 for(let i=0;i<128;i++)recordCrew(d,'proposed','core',{...p,id:String(i)+'\u0000'.repeat(110),reason:'\u0000'.repeat(1000)},i);
 const report=crewReport(d,200),encoded=encodeCrewReport(report);assert(encoded.length>220000);assert(encoded.length<=2000000);const wire=JSON.parse(encoded);
 assert.deepEqual(wire.entryLines.split('\n').map((x:string)=>JSON.parse(x)),report.entries);
});

test('native log allowlist preserves observer and observation time without copying private detail',()=>{
 const {d}=fixture();d.characters.B={id:'B',name:'Bee',memories:['PRIVATE']};
 for(const [seq,kind] of ['casualty','memory','health','food','casualty-recovered'].entries())
  recordCrew(d,'native-event','A',{event:{seq,pawn:'A',kind,subject:'B',tick:20+seq,detail:'PRIVATE'}},90);
 const entries=crewReport(d,90).entries;assert.equal(entries.length,2);assert(entries.every(e=>e.kind==='record'&&e.actor==='Ada'&&e.recipient==='observer'&&e.subject==='B'));
 assert.deepEqual(entries.map(e=>e.tick),[20,24]);assert(entries[0]!.text.includes('Bee downed'));assert(entries[1]!.text.includes('Bee no longer downed'));assert(entries.every(e=>!e.text.includes('PRIVATE')));
 recordCrew(d,'native-event','A',{event:{seq:4,pawn:'A',kind:'casualty-recovered',subject:'B',tick:24,detail:'PRIVATE'}},100);assert.equal(d.crew!.entries.length,2);
 recordCrew(d,'native-event','A',{event:{seq:5,pawn:'B',kind:'casualty-recovered',subject:'B',tick:25}},100);assert.equal(d.crew!.entries.length,2);
});

test('observer reports public scheduling state and core-authored topics, never private extensions',()=>{
 const {d}=fixture();d.coreState={revision:0,brief:{id:'brief',text:'public'},topics:[{sourceId:'brief',text:'Optional food plan',status:'open',proposalIds:[],...{private:'DO NOT PROJECT'}}],questions:[{id:'q',pawn:'A',text:'Food?',status:'running',messages:[]}],turns:[],schedule:{config:{maxAttempts:2,cooldownTicks:60,windowTicks:600},startTick:0,endTick:600,attempts:2,consumed:{}}};
 let r=crewReport(d,100,[],['A']);assert.match(r.observerText!,/allowance exhausted/);assert.match(r.observerText!,/Ada: thinking/);assert.match(r.observerText!,/answering/);assert.equal(r.topicText,'[open] Optional food plan');
 assert.deepEqual(Object.keys(r).sort(),['agreements','branch','entries','epoch','observerText','revision','sharedStatus','tick','topicText','waiting','world']);
 r=crewReport(d,100,[],['core']);assert.match(r.observerText!,/^Core: thinking/);
 d.coreState.schedule!.attempts=0;assert.match(crewReport(d,601).observerText!,/window ended/);
 const wire=JSON.parse(encodeCrewReport(r));assert.equal(wire.observerText,r.observerText);assert.equal(wire.topicText,r.topicText);
 delete d.coreState;assert.equal(crewReport(d,100).topicText,'');assert.match(crewReport(d,100).observerText!,/not initialized/);
});
