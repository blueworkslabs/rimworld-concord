import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Coordinator } from '../src/coordinator.js';
import { Store } from '../src/store.js';
import { AttentionPump, type AttentionBackend, type AttentionView } from '../src/attention.js';
import { scripted } from '../src/backends.js';
import type { GameBridge, GameState, ActionRequest, Receipt, Activity } from '../src/protocol.js';

class Game implements GameBridge {
 data:GameState={world:'test',epoch:'start',loaded:true,paused:false,ticks:1000,pawns:[
  {id:'A',name:'Ada',x:1,z:1,job:'Work',health:1},
  {id:'B',name:'Bea',x:2,z:2,job:'Sleep',health:1}],actions:[],events:[],eventSeq:0};
 saved=new Map<string,GameState>();moves=0;activities:Activity[]=[];
 async state(){return structuredClone(this.data);}
 async setActivity(a:Activity){this.activities.push(a);}
 async save(name:string){this.saved.set(name,structuredClone(this.data));return {sha256:'hash'};}
 async verify(){}
 async load(name:string){this.data=structuredClone(this.saved.get(name)!);this.data.epoch=randomUUID();}
 async move(r:ActionRequest):Promise<Receipt>{
  this.moves++;const receipt:Receipt={id:r.id,actor:r.actor,status:'completed',reason:'arrived',x:r.action.x,z:r.action.z};
  this.data.actions.push(receipt);return receipt;
 }
 event(kind='memory',pawn='A',detail='An experience') {
  this.data.events!.push({seq:++this.data.eventSeq!,tick:this.data.ticks,pawn,kind,detail});
 }
}
const quiet:AttentionBackend={name:'scripted-quiet',async reflect(){return {kind:'continue',reason:'Continue my existing work'};}};
const low={name:'scripted-appraisal',async assess(){return {reflectionScore:0.1};}};
const action={kind:'move' as const,x:8,z:8};
async function setup(){const game=new Game(),store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();return {game,store,c};}
async function until(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await delay(2);}assert.fail('condition not reached');}

test('routine events do not call a model; need bursts coalesce; significant events bypass appraisal',async()=>{
 const {game,store,c}=await setup();let reflected=0,appraised=0;
 const backend={name:'count',async reflect(view:AttentionView){reflected++;assert(view.events.every(e=>e.pawn==='A'));return {kind:'continue',reason:'Remember this'};}};
 const appraiser={name:'count',async assess(view:any){appraised++;assert.equal(view.events.length,1);assert.equal(view.event.detail,'latest');return {reflectionScore:0.1};}};
 game.event('job');assert.equal((await c.attend('A',backend,appraiser)).status,'native');
 assert.equal(reflected+appraised,0);
 for(let i=0;i<10;i++)game.event('need-band','A',i===9?'latest':'old');
 assert.equal((await c.attend('A',backend,appraiser)).status,'native');assert.equal(appraised,1);assert.equal(reflected,0);
 game.event('memory');assert.equal((await c.attend('A',backend,appraiser)).status,'continued');
 assert.equal(reflected,1);assert.equal(appraised,1);assert.equal(game.moves,0);store.close();
});
test('cooldown defers new needs but never direct significant events; missing appraisal leaves work pending',async()=>{
 const {game,store,c}=await setup();game.event('need');
 assert.equal((await c.attend('A',quiet)).status,'unavailable');assert.equal(c.inspect().characters.A!.attention,undefined);
 await c.attend('A',quiet,low);game.event('need');
 assert.equal((await c.attend('A',quiet,low)).status,'cooldown');
 game.data.ticks+=300;assert.equal((await c.attend('A',quiet,low)).status,'native');
 game.event('health');assert.equal((await c.attend('A',quiet,low)).status,'continued');store.close();
});
test('reflection sees only own proposals and experiences; own refusal and acceptance follow the real action contract',async()=>{
 const {game,store,c}=await setup();const a=await c.core().propose('A',action,'My task');
 const b=await c.core().propose('B',action,'Secret task');game.event('memory','B','Secret experience');game.event();
 assert.equal((await c.attend('A',{name:'reject-foreign',async reflect(view){
  assert(!JSON.stringify(view).includes('Secret'));return {kind:'proposal',proposalId:b.id,decision:{kind:'accept',reason:'spoof'}};
 }})).status,'failed');assert.equal(game.moves,0);
 game.event();await c.attend('A',{name:'refuse',async reflect(){return {kind:'proposal',proposalId:a.id,decision:{kind:'refuse',reason:'Rest first'}};}});
 assert.equal(c.inspect().proposals[a.id]!.status,'refused');assert.equal(game.moves,0);
 const p=await c.core().propose('A',action,'A new task');game.event();
 assert.equal((await c.attend('A',{name:'accept',async reflect(){return {kind:'proposal',proposalId:p.id,decision:{kind:'accept',reason:'I choose this'}};}})).status,'decided');
 await c.attend('A',quiet);await c.reconcile();assert.equal(game.moves,1);store.close();
});
test('forged output cannot bypass pawn acceptance; failure consumes the attempt without an automatic retry',async()=>{
 const {game,store,c}=await setup();game.event();let calls=0;
 const backend={name:'invalid',async reflect(){calls++;return {kind:'continue',reason:'quiet',actor:'B',action};}};
 assert.equal((await c.attend('A',backend)).status,'failed');
 assert.equal((await c.attend('A',backend)).status,'idle');assert.equal(calls,1);assert.equal(game.moves,0);
 const reopened=new Coordinator(store,game);await reopened.open();assert.equal((await reopened.attend('A',backend)).status,'idle');store.close();
});
test('new significant event cancels an old thought and blocks its late action; fresh batch remains eligible',async()=>{
 const {game,store,c}=await setup();const p=await c.core().propose('A',action,'Consider');game.event();
 let release!:(r:unknown)=>void;
 const task=c.attend('A',{name:'delayed',reflect:()=>new Promise(r=>release=r)});
 await until(()=>!!release);game.event('health');await c.observe();
 assert.equal((await task).status,'interrupted');
 release({kind:'proposal',proposalId:p.id,decision:{kind:'accept',reason:'old information'}});
 assert.equal(game.moves,0);assert(c.attentionCandidates().includes('A'));
 await c.attend('A',quiet);assert.equal(c.inspect().characters.A!.attention!.cursor,2);store.close();
});
test('fresh-state validation catches significant events even without a concurrent poll',async()=>{
 const {game,store,c}=await setup();game.event();
 assert.equal((await c.attend('A',{name:'changes-world',async reflect(){game.event('health');return {kind:'continue',reason:'stale'};}})).status,'interrupted');
 assert.equal(c.inspect().characters.A!.reflections,undefined);store.close();
});
test('timeout/stop free the shared decision slot and indicator even for an uncooperative backend',async()=>{
 const {game,store,c}=await setup();game.event();
 assert.equal((await c.attend('A',{name:'offline',reflect:()=>new Promise(()=>{})},undefined,{timeoutMs:15})).status,'interrupted');
 assert.deepEqual(c.activity(),[]);assert.equal(game.activities.at(-1)!.ttlMs,0);
 game.event();const pump=new AttentionPump(c,{name:'offline',reflect:()=>new Promise(()=>{})});await pump.poll();
 await until(()=>c.activity().length===1);await pump.stop();assert.equal(pump.status().pending,0);assert.deepEqual(c.activity(),[]);
 assert(pump.results.every(r=>r.status!=='failed'));
 assert.equal(game.moves,0);assert.equal(game.data.paused,false);store.close();
});
test('attention shares a per-pawn slot with explicit decisions and waits for existing commitments',async()=>{
 const {game,store,c}=await setup();game.event();const p=await c.core().propose('A',action,'Help');
 const stop=new AbortController();const running=c.attend('A',{name:'slow',reflect:()=>new Promise(()=>{})},undefined,{},stop.signal);
 await until(()=>c.activity().length===1);
 await assert.rejects(c.pawn('A').decide(p.id,scripted({kind:'accept',reason:'compete'})),/already deliberating/);
 stop.abort();await running;
 game.move=async(r)=>({id:r.id,actor:r.actor,status:'started',reason:'working',x:8,z:8});
 await c.pawn('A').decide(p.id,scripted({kind:'accept',reason:'now free'}));game.event();
 assert.equal((await c.attend('A',quiet)).status,'busy');store.close();
});
test('paired restore rewinds attention with memories but discards the running future',async()=>{
 const {game,store,c}=await setup();game.event();await c.observe();await c.checkpoint('lab-concord-attention');
 const original=c.inspect();const p=await c.core().propose('A',action,'Future');let release!:(v:unknown)=>void;
 const future=c.attend('A',{name:'future',reflect:()=>new Promise(r=>release=r)});await until(()=>!!release);
 await c.restore('lab-concord-attention');assert.equal((await future).status,'interrupted');
 release({kind:'proposal',proposalId:p.id,decision:{kind:'accept',reason:'Discard'}});
 assert.deepEqual(c.inspect().characters,original.characters);assert.equal(game.moves,0);store.close();
});
test('restart recovers an interrupted claim without replay; checkpoint of in-flight work is quiescent',async()=>{
 const {game,store,c}=await setup();game.event();let release!:(v:unknown)=>void;
 const running=c.attend('A',{name:'hold',reflect:()=>new Promise(r=>release=r)});await until(()=>!!release);
 // Snapshot a crash boundary without a second live coordinator owning the game.
 const crashed=c.inspect();await c.checkpoint('lab-concord-claimed');await running;
 const checkpoint=store.saved('lab-concord-claimed');assert.equal(checkpoint.state.characters.A!.attention!.last!.status,'interrupted');
 store.commit(crashed,{branch:crashed.branch,kind:'test-crash-boundary',actor:'operator',data:{}});
 const reopened=new Coordinator(store,game);await reopened.open();
 assert.equal(reopened.inspect().characters.A!.attention!.last!.status,'interrupted');
 assert.equal((await reopened.attend('A',quiet)).status,'idle');release({kind:'continue',reason:'old'});store.close();
});
test('pump caps concurrent turns, observes while thinking and prioritizes significant events',async()=>{
 const {game,store,c}=await setup();game.event('need','A');game.event('memory','B');
 let release!:(v:unknown)=>void,seen='';
 const pump=new AttentionPump(c,{name:'slow',reflect:view=>{seen=view.pawn.id;return new Promise(r=>release=r);}},low,{}, {maxConcurrent:1,maxTurns:1});
 await pump.poll();await until(()=>!!release);assert.equal(seen,'B');
 game.data.ticks++;await pump.poll();assert.equal(pump.status().started,1);assert.equal(game.data.paused,false);
 release({kind:'continue',reason:'All right'});await pump.drain();await pump.poll();
 assert.equal(pump.status().started,1);assert.equal(c.inspect().characters.A!.attention,undefined);await pump.stop();store.close();
});
test('unconsumed bounded-history loss is explicitly audited',async()=>{
 const {game,store,c}=await setup();for(let i=0;i<70;i++)game.event();await c.observe();
 assert.equal(c.inspect().characters.A!.experiences!.length,64);
 assert.equal(store.events().filter(e=>e.event.kind==='attention-gap').length,6);store.close();
});

test('Chitchat queues behind a thought, coalesces and obeys cooldown without losing the new experience',async()=>{
 const {game,store,c}=await setup();game.event('memory','A','Chitchat');let release!:(v:unknown)=>void;
 const pending=c.attend('A',{name:'slow',reflect:()=>new Promise(r=>release=r)});
 await until(()=>!!release);game.event('memory','A','Chitchat');game.event('memory','A','Chitchat');await c.observe();
 release({kind:'continue',reason:'Finish this thought'});assert.equal((await pending).status,'continued');
 assert.equal(c.inspect().characters.A!.attention!.cursor,1);
 assert.equal((await c.attend('A',quiet)).status,'cooldown');
 game.data.ticks+=300;let events=0;
 assert.equal((await c.attend('A',{name:'coalesced',async reflect(v){events=v.events.length;return {kind:'continue',reason:'Recall conversation'};}})).status,'continued');
 assert.equal(events,1);assert.equal(c.inspect().characters.A!.experiences!.length,3);store.close();
});
test('explicit decisions also reject newly observed health changes without a concurrent poll',async()=>{
 const {game,store,c}=await setup(),p=await c.core().propose('A',action,'Move');
 await assert.rejects(c.pawn('A').decide(p.id,{name:'new-danger',async decide(){game.event('health');return {kind:'accept',reason:'Stale'};}}));
 assert.equal(game.moves,0);assert.equal(c.inspect().proposals[p.id]!.status,'pending');store.close();
});

class PausingGame extends Game {
 leases=new Map<string,string>();
 async setDecisionPause(p:{epoch:string;actor:string;leaseId:string;ttlMs:number}){
  if(p.epoch!==this.data.epoch)throw Error('Stale pause');
  if(p.ttlMs)this.leases.set(p.leaseId,p.actor);else this.leases.delete(p.leaseId);
 }
 async state(){return {...await super.state(),paused:this.data.paused||this.leases.size>0,manualPaused:this.data.paused,decisionPauses:this.leases.size};}
}
test('overlapping thoughts release only their own pauses and preserve a human pause',async()=>{
 const game=new PausingGame(),store=new Store(':memory:'),c=new Coordinator(store,game,{mode:'pause-at-decision'});await c.open();
 const a=await c.core().propose('A',action,'A'),b=await c.core().propose('B',action,'B');
 const replies:Array<(v:unknown)=>void>=[];const backend={name:'slow',decide:()=>new Promise(r=>replies.push(r))};
 const first=c.pawn('A').decide(a.id,backend),second=c.pawn('B').decide(b.id,backend);
 await until(()=>replies.length===2);assert.equal(game.leases.size,2);assert((await game.state()).paused);
 replies[0]!({kind:'refuse',reason:'No'});await first;assert.equal(game.leases.size,1);
 game.data.paused=true;replies[1]!({kind:'refuse',reason:'No'});await second;
 assert.equal(game.leases.size,0);assert((await game.state()).paused);store.close();
});
test('paused timeout and invalid reflection release claims without applying actions',async()=>{
 const game=new PausingGame(),store=new Store(':memory:'),c=new Coordinator(store,game,{mode:'pause-at-decision'});await c.open();
 const p=await c.core().propose('A',action,'A');
 await assert.rejects(c.pawn('A').decide(p.id,{name:'stuck',decide:()=>new Promise(()=>{})},20));
 assert.equal(game.leases.size,0);assert.equal((await game.state()).paused,false);
 game.event();assert.equal((await c.attend('A',{name:'bad',async reflect(){assert((await game.state()).paused);return {kind:'move'};}})).status,'failed');
 assert.equal(game.leases.size,0);assert.equal(game.moves,0);store.close();
});
test('pause acquisition failure prevents inference and unsupported pause mode rejects immediately',async()=>{
 assert.throws(()=>new Coordinator(new Store(':memory:'),new Game(),{mode:'pause-at-decision'}),/unsupported/);
 const game=new PausingGame(),store=new Store(':memory:');game.setDecisionPause=async()=>{throw Error('Disconnected');};
 const c=new Coordinator(store,game,{mode:'pause-at-decision'});await c.open();const p=await c.core().propose('A',action,'A');let calls=0;
 await assert.rejects(c.pawn('A').decide(p.id,{name:'unused',async decide(){calls++;return {kind:'accept',reason:'No'};}}));
 assert.equal(calls,0);assert.deepEqual(c.activity(),[]);store.close();
});

test('urgent work takes priority over queued Chitchat and legacy records obey the current quiet-memory policy',async()=>{
 const {game,store,c}=await setup();game.event('memory','A','Chitchat');game.event('health','B');await c.observe();
 assert.deepEqual(c.attentionCandidates(),['B','A']);
 const state=store.read()!;state.characters.A!.attention={cursor:0,lastAttemptTick:1000};
 delete state.characters.A!.experiences![0]!.interrupt;store.commit(state,{branch:state.branch,kind:'fixture-old-schema',actor:'operator',data:{}});
 const reopened=new Coordinator(store,game);await reopened.open();assert(!reopened.attentionCandidates().includes('A'));store.close();
});

test('event-driven revised decision sees only owner negotiation history',async()=>{
 const {c,game,store}=await setup();
 const p=await c.core().propose('A',action,'Public offer');await c.pawn('A').decide(p.id,scripted({kind:'counter',reason:'Closer',action:{...action,x:2}}));
 const other=await c.core().propose('B',action,'Private to B');await c.pawn('B').decide(other.id,scripted({kind:'counter',reason:'B only',action}));
 const q=await c.core().revise(p.id,'Your alternative');game.event();
 const result=await c.attend('A',{name:'history',async reflect(v){
   assert.equal(v.histories?.[q.id]?.[0]?.id,p.id);assert(!JSON.stringify(v).includes('B only'));
   return {kind:'proposal',proposalId:q.id,decision:{kind:'accept',reason:'Agreed'}};
 }});
 assert.equal(result.status,'decided');assert.equal(game.moves,1);store.close();
});

test('reentrant open rejects without falsely interrupting an active thought',async()=>{
 const {game,store,c}=await setup();game.event();let release!:(r:unknown)=>void;
 const running=c.attend('A',{name:'delayed',reflect:()=>new Promise(r=>release=r)});
 try {
  await until(()=>!!release);await assert.rejects(c.open(),/Cannot reopen/);
  assert.equal(c.inspect().characters.A!.attention!.last!.status,'running');
  release({kind:'continue',reason:'Finish the original thought'});assert.equal((await running).status,'continued');
  await c.open();assert.equal(c.inspect().characters.A!.attention!.last!.status,'continued');
 }finally{store.close();}
});

test('split attention preserves model turns after native exhaustion and filters trial actors',async()=>{
 const {game,store,c}=await setup();let calls=0;
 const pump=new AttentionPump(c,{name:'count',async reflect(){calls++;return {kind:'continue',reason:'considered'};}},low,{}, {maxConcurrent:1,maxNativeTurns:1,maxModelTurns:1,pawns:['A']});
 game.event('job');await pump.poll();await pump.drain();game.event('job');game.event('health','B');
 await pump.poll();await pump.drain();assert.equal(pump.status().started,1);
 game.event('casualty','A','Observed downed colonist');await pump.poll();await pump.drain();
 assert.equal(calls,1);assert.equal(pump.status().nativeStarted,1);assert.equal(pump.status().modelStarted,1);
 assert.equal(c.inspect().characters.B!.attention,undefined);await pump.stop();store.close();
});
test('split attention preserves native turns after model exhaustion; low appraisal consumes model allowance',async()=>{
 const {game,store,c}=await setup();let appraisals=0;
 const pump=new AttentionPump(c,quiet,{name:'low',async assess(){appraisals++;return {reflectionScore:.1};}}, {},{maxConcurrent:1,maxNativeTurns:1,maxModelTurns:1});
 game.event('need');await pump.poll();await pump.drain();game.event('job');await pump.poll();await pump.drain();
 game.data.ticks+=600;game.event('need');await pump.poll();await pump.drain();
 assert.equal(appraisals,1);assert.equal(pump.status().nativeStarted,1);assert.equal(pump.status().modelStarted,1);await pump.stop();store.close();
});
test('fresh casualty cannot escalate a native-only claim across the split budget boundary',async()=>{
 const {game,store,c}=await setup();let calls=0;game.event('job');await c.observe();
 assert.deepEqual(c.attentionCandidates({},true,'native'),['A']);game.event('casualty');
 const backend={name:'count',async reflect(){calls++;return {kind:'continue',reason:'Seen'};}};
 assert.equal((await c.attend('A',backend,low,{},undefined,'native')).status,'unavailable');
 assert.equal(calls,0);assert.equal(c.inspect().characters.A!.attention,undefined);
 assert.equal((await c.attend('A',backend,low,{},undefined,'model')).status,'continued');assert.equal(calls,1);store.close();
});

test('DeepTalk remains queued behind reflection and important unfamiliar memory still supersedes',async()=>{
 const {game,store,c}=await setup();game.event('casualty');let release!:(v:unknown)=>void;
 const pending=c.attend('A',{name:'slow',reflect:()=>new Promise(r=>release=r)});await until(()=>!!release);
 game.event('memory','A','DeepTalk');await c.observe();release({kind:'continue',reason:'Finish considering casualty'});
 assert.equal((await pending).status,'continued');assert.equal(c.inspect().characters.A!.attention!.cursor,1);
 assert.equal((await c.attend('A',quiet)).status,'cooldown');game.data.ticks+=300;
 let seen=false;const next=await c.attend('A',{name:'later',async reflect(v){seen=v.events.some(e=>e.detail==='DeepTalk');return {kind:'continue',reason:'Remember conversation'};}});
 assert(seen);assert.equal(next.status,'continued');
 game.event('memory','A','DeepTalk');release=undefined as any;const another=c.attend('A',{name:'slow',reflect:()=>new Promise(r=>release=r)},undefined,{cooldownTicks:0});await until(()=>!!release);
 game.event('memory','A','WitnessedDeath');await c.observe();assert.equal((await another).status,'interrupted');release({kind:'continue',reason:'Discard'});store.close();
});

test('restored legacy DeepTalk retains the experience but uses current noninterrupting cooldown',async()=>{
 const {game,store,c}=await setup();game.event('memory','A','DeepTalk');await c.observe();
 const old=c.inspect();old.characters.A!.experiences![0]!.interrupt=true;old.characters.A!.attention={cursor:0,lastAttemptTick:1000};
 store.commit(old,{branch:old.branch,kind:'legacy-fixture',actor:'operator',data:{}});const reopened=new Coordinator(store,game);await reopened.open();
 assert(!reopened.attentionCandidates().includes('A'));assert.equal((await reopened.attend('A',quiet)).status,'cooldown');
 assert.equal(reopened.inspect().characters.A!.experiences![0]!.event.detail,'DeepTalk');game.data.ticks+=300;assert.equal((await reopened.attend('A',quiet)).status,'continued');store.close();
});
