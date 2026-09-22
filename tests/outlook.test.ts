import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {crewReport} from '../src/crew-log.js';
import {reviseOutlook} from '../src/outlook.js';
import {ReflectionChoice,reflectionFromChoice,validateReflectionChoice} from '../src/reflection-choice.js';
import type {GameState,GameBridge,Receipt,ActionRequest} from '../src/protocol.js';
class Game implements GameBridge{
 data:GameState={world:'outlook',epoch:'start',ticks:100,paused:true,loaded:true,pawns:[{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},{id:'B',name:'Bea',x:2,z:1,job:'Wait',health:1}],actions:[],events:[],eventSeq:0};saved=new Map<string,GameState>();moves=0;
 async state(){return structuredClone(this.data);}async save(n:string){this.saved.set(n,structuredClone(this.data));return {sha256:'hash'};}async verify(){}async load(n:string){this.data=structuredClone(this.saved.get(n)!);this.data.epoch=randomUUID();}
 async move(r:ActionRequest):Promise<Receipt>{this.moves++;const x={id:r.id,actor:r.actor,status:'completed' as const,reason:'done',x:r.action.x,z:r.action.z};this.data.actions.push(x);return x;}
 event(pawn='A',kind='memory',subject?:string){this.data.events!.push({pawn,seq:++this.data.eventSeq!,tick:++this.data.ticks,kind,detail:'Own observed experience',...(subject?{subject}:{})});return this.data.eventSeq!;}
}
async function setup(){const g=new Game(),s=new Store(':memory:'),c=new Coordinator(s,g);await c.open();return {g,s,c};}
const note=(seq:number)=>({kind:'concern' as const,text:'Private concern about my next rest',evidenceSeqs:[seq]});
const backend=(seq:number,revision=0)=>({name:'scripted',async reflect(){return {kind:'revise_outlook',reason:'Private revision',update:{expectedRevision:revision,notes:[note(seq)]}};}});
test('private outlook persists without public speech or action and enters only own later decisions',async()=>{
 const {g,s,c}=await setup();const seq=g.event();await c.observe();const before=crewReport(c.inspect(),g.data.ticks).entries;
 assert.equal((await c.attend('A',backend(seq))).status,'continued');assert.equal(g.moves,0);const saved=c.inspect().characters.A!.outlook!;assert.equal(saved.revision,1);assert.equal(saved.notes[0]!.evidence[0]!.pawn,'A');assert.equal(c.inspect().characters.B!.outlook,undefined);assert.deepEqual(crewReport(c.inspect(),g.data.ticks).entries,before);
 await c.checkpoint('lab-concord-with-outlook');await c.restore('lab-concord-with-outlook');assert.deepEqual(c.inspect().characters.A!.outlook,saved);
 let called=0;const p=await c.core().propose('A',{kind:'move',x:3,z:1},'Optional');const out=await c.pawn('A').decide(p.id,{name:'reads-outlook',async decide(v){called++;assert.deepEqual(v.character.outlook,saved);return {kind:'refuse',reason:'I prefer to stay here'};}});assert.equal(called,1);assert.equal(out.status,'refused');assert.equal(g.moves,0);
 g.event('B');let foreign=0;assert.equal((await c.attend('B',{name:'other',async reflect(v){foreign++;assert.equal(v.character.outlook,undefined);assert.equal(v.character.id,'B');return {kind:'continue',reason:'Own routine'};}})).status,'continued');assert.equal(foreign,1);s.close();
});
test('forged references, unobserved stance subjects and stale revision cannot mutate outlook',async()=>{
 const {g,s,c}=await setup();const seq=g.event('B');const own=g.event();await c.observe();
 const original=c.inspect().characters.A!;
 for(const update of [{expectedRevision:1,notes:[note(own)]},{expectedRevision:0,notes:[note(seq)]},{expectedRevision:0,notes:[note(999)]},{expectedRevision:0,notes:[{...note(own),kind:'stance',subject:'B'}]},{expectedRevision:0,notes:[{...note(own),evidenceSeqs:[own,own]}]},{expectedRevision:0,notes:[{...note(own),subject:'B'}]}])assert.throws(()=>reviseOutlook(original,update as any,200));
 assert.equal((await c.attend('A',backend(seq))).status,'failed');assert.equal(c.inspect().characters.A!.outlook,undefined);assert.equal(g.moves,0);s.close();
});
test('retained evidence survives experience eviction, and revision may remove rather than accumulate notes',async()=>{
 const {g,s,c}=await setup();const seq=g.event('A','casualty','B');await c.observe();
 assert.equal((await c.attend('A',{name:'stance',async reflect(){return {kind:'revise_outlook',reason:'My interpretation',update:{expectedRevision:0,notes:[{kind:'stance',subject:'B',text:'I want to watch out for Bea',evidenceSeqs:[seq]}]}};}})).status,'continued');
 for(let i=0;i<70;i++)g.event('A','job');await c.observe();assert(!c.inspect().characters.A!.experiences!.some(e=>e.event.seq===seq));g.event();assert.equal((await c.attend('A',backend(seq,1))).status,'continued');assert.equal(c.inspect().characters.A!.outlook!.revision,2);
 g.event();assert.equal((await c.attend('A',{name:'remove',async reflect(){return {kind:'revise_outlook',reason:'No longer a current concern',update:{expectedRevision:2,notes:[]}};}})).status,'continued');assert.equal(c.inspect().characters.A!.outlook!.notes.length,0);s.close();
});
test('rewind removes future outlook and a late reflection cannot write into restored timeline',async()=>{
 const {g,s,c}=await setup();const seq=g.event();await c.observe();await c.checkpoint('lab-concord-before');assert.equal((await c.attend('A',backend(seq))).status,'continued');await c.restore('lab-concord-before');assert.equal(c.inspect().characters.A!.outlook,undefined);
 let release!:(v:unknown)=>void,entered!:(v?:unknown)=>void;const ready=new Promise(r=>entered=r);const pending=c.attend('A',{name:'late',async reflect(){entered();return new Promise(r=>release=r);}});await ready;await c.restore('lab-concord-before');release({kind:'revise_outlook',reason:'discarded future',update:{expectedRevision:0,notes:[note(seq)]}});assert.equal((await pending).status,'interrupted');assert.equal(c.inspect().characters.A!.outlook,undefined);s.close();
});
test('appraisal receives only its owner outlook and no automatic trait or relationship mutation',async()=>{
 const {g,s,c}=await setup();const seq=g.event();await c.attend('A',backend(seq));const before=structuredClone(g.data.pawns);g.data.ticks+=500;g.event('A','need');let called=0;const r=await c.attend('A',{name:'unused',async reflect(){assert.fail('should not reflect');}},{name:'appraisal',async assess(v){called++;assert.equal(v.character.outlook!.revision,1);assert.equal(v.character.id,'A');return {reflectionScore:.1};}});assert.equal(r.status,'native');assert.equal(called,1);assert.deepEqual(g.data.pawns,before);s.close();
});
test('provider choice maps only to private revision and rejects unknown evidence before application',()=>{
 const character={id:'A',name:'Ada',memories:[],experiences:[{event:{seq:1,tick:1,pawn:'A',kind:'health',detail:'noticed'},route:'deliberation' as const}]};const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character,events:character.experiences.map(x=>x.event),proposals:[]};const choice=ReflectionChoice.parse({choice:'revise_private_outlook',reason:'private',update:{expectedRevision:0,notes:[note(1)]}});validateReflectionChoice(choice,view);assert.equal(reflectionFromChoice(choice).kind,'revise_outlook');assert.throws(()=>validateReflectionChoice({...choice,update:{expectedRevision:0,notes:[note(2)]}} as any,view));assert.throws(()=>ReflectionChoice.parse({...choice,action:{kind:'move',x:1,z:1}}));
});
