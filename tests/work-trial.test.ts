import {test} from 'node:test';
import assert from 'node:assert/strict';
import {laterOfferEligible,workSummary,WORK_TRIAL} from '../src/work-trial.js';
import type {Domain,Proposal} from '../src/protocol.js';
// Generic completed agreement: a rescue. The delivered-units/trips summary keeps an ordered haul.
const proposal:Proposal={id:'p',pawn:'A',action:{kind:'rescue',target:'X',bed:'bed',x:1,z:1,maxTicks:600},reason:'Help',status:'accepted',standing:{status:'completed',deadline:600,steps:['a']}};
const haulProposal:Proposal={id:'p',pawn:'A',action:{kind:'haul',thing:'steel',x:1,z:1,count:10,trips:2,maxTicks:600},reason:'Supplies',status:'accepted',standing:{status:'completed',deadline:600,steps:['a','b']}};
function domain(p:Proposal=proposal):Domain{return {schema:1,world:'w',epoch:'e',branch:'b',characters:{A:{id:'A',name:'Ada',memories:[]}},proposals:{p:structuredClone(p)},outcomes:{}};}
test('later work is a new offer only after completed agreements, never a refusal/failure retry',()=>{
 assert(laterOfferEligible(domain(),'A'));assert(!laterOfferEligible(domain(),'B'));
 for(const status of ['pending','refused','withdrawn','countered'] as const){const d=domain();d.proposals.p!.status=status;assert(!laterOfferEligible(d,'A'));}
 for(const status of ['running','stopped'] as const){const d=domain();d.proposals.p!.standing!.status=status;assert(!laterOfferEligible(d,'A'));}
 for(const key of ['commitment','intention'] as const){const d=domain();d.characters.A![key]='ongoing';assert(!laterOfferEligible(d,'A'));}
 const d=domain();d.proposals={};assert(!laterOfferEligible(d,'A'));
});
test('answered counter followed by completed consent allows optional later work',()=>{
 const d=domain();d.proposals.parent={...proposal,id:'parent',status:'countered',replyId:'p',standing:undefined};assert(laterOfferEligible(d,'A'));
 d.proposals.p!.status='refused';assert(!laterOfferEligible(d,'A'));
});
// Ordered-haul specific (removed with the ordered haul): delivered units and trips.
test('summary distinguishes delivered units, completed trips and stopped intentions',()=>{
 const d=domain(haulProposal);d.outcomes.a={id:'a',actor:'A',status:'completed',reason:'Delivered',x:1,z:1,delivered:10};d.outcomes.b={id:'b',actor:'A',status:'failed',reason:'Partial',x:1,z:1,delivered:2};d.proposals.p!.standing!.status='stopped';
 const s=workSummary(d);assert.equal(s.deliveredUnits,12);assert.equal(s.completedTrips,1);assert.equal(s.stopped.length,1);
 assert.deepEqual(WORK_TRIAL,{decisions:12,appraisals:12,reflections:3,observationMs:300000,secondRoundMs:120000,maxTurns:48});
});

test('shutdown joins ongoing offers and provider cleanup before finalization, even on error path',async()=>{
 const {WorkShutdown}=await import('../src/work-trial.js');const order:string[]=[];let release!:()=>void;
 const task=new Promise<void>(r=>release=r).then(()=>{order.push('offer-cleanup');});
 const shutdown=new WorkShutdown(()=>{order.push('cancel');release();},async()=>{order.push('attention-stopped');},async()=>{order.push('host-drained');});
 shutdown.later=task;const first=shutdown.stop();assert(shutdown.stopped);assert.equal(shutdown.stop(),first);await first;order.push('store-closed');
 assert.deepEqual(order,['cancel','attention-stopped','offer-cleanup','host-drained','store-closed']);
});
test('retiring a failed offer prevents reflection retry but preserves a durably accepted decision',async()=>{
 const {Coordinator}=await import('../src/coordinator.js'),{Store}=await import('../src/store.js'),{retireUndecided}=await import('../src/work-trial.js');
 const game={async state(){return {world:'w',epoch:'e',ticks:1,loaded:true,paused:true,pawns:[{id:'A',name:'Ada',x:1,z:1,health:1,job:'Wait'}],actions:[],eventSeq:1,events:[{seq:1,pawn:'A',tick:1,kind:'memory',detail:'Significant'}]};},async move(){throw Error('Lost dispatch');},async save(){return {sha256:'h'};},async load(){},async verify(){}};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();
 const p=await c.core().propose('A',{kind:'move',x:2,z:1},'Optional');
 await assert.rejects(c.pawn('A').decide(p.id,{name:'failed',async decide(){throw Error('Unavailable');}}));
 await retireUndecided(c,p.id,'No retry');assert.equal(c.inspect().proposals[p.id]!.status,'withdrawn');
 let ran=false;const r=await c.attend('A',{name:'inspect',async reflect(view){assert.equal(view.proposals.length,0);ran=true;return {kind:'continue',reason:'Routine'};}});
 assert(ran);assert.equal(r.status,'continued');
 const accepted=await c.core().propose('A',{kind:'move',x:2,z:1},'Second distinct test');
 await assert.rejects(c.pawn('A').decide(accepted.id,{name:'accept',async decide(){return {kind:'accept',reason:'Yes'};}}),/Lost dispatch/);
 await retireUndecided(c,accepted.id,'No retry');assert.equal(c.inspect().proposals[accepted.id]!.status,'accepted');store.close();
});

test('exceptional game cleanup attempts all withdrawals despite a failed stop',async()=>{
 const {stopTrialWork}=await import('../src/work-trial.js');const d=domain();d.characters.A!.intention='p';d.characters.B={id:'B',name:'Bee',memories:[],intention:'q'};d.proposals.q={...proposal,id:'q',pawn:'B',status:'pending'};const calls:string[]=[];
 const fake={inspect:()=>d,async reconcile(){calls.push('reconcile');},pawn:(id:string)=>({async withdraw(){calls.push('withdraw '+id);if(id==='A')throw Error('transport unavailable');}}),core:()=>({async withdrawOffer(id:string){calls.push('retire '+id);}})};
 const result=await stopTrialWork(fake as any);assert.deepEqual(result.operatorStops,['A','B']);assert.equal(result.errors.length,1);
 assert.deepEqual(calls,['reconcile','withdraw A','withdraw B','retire q','reconcile']);
});

test('trial preserves but never adopts movement counters that cannot be stopped',async()=>{
 const {trialCounterSupported,stopTrialWork}=await import('../src/work-trial.js');
 const p={...proposal,status:'countered' as const,decision:{kind:'counter' as const,reason:'Elsewhere',action:{kind:'move' as const,x:2,z:1}}};
 assert.equal(trialCounterSupported(p),false);
 const d=domain();d.characters.A!.commitment='move';
 const result=await stopTrialWork({inspect:()=>d,async reconcile(){}} as any);
 assert.deepEqual(result.errors,['Executable commitment still unresolved: A']);
});
// Ordered-haul specific (removed with the ordered haul): the trial adopts ordered haul counters.
test('the trial adopts a smaller ordered haul counter',async()=>{
 const {trialCounterSupported}=await import('../src/work-trial.js');
 const p={...haulProposal,status:'countered' as const,decision:{kind:'counter' as const,reason:'Less',action:{kind:'haul' as const,thing:'steel',x:1,z:1,count:10,trips:1,maxTicks:600}}};
 assert.equal(trialCounterSupported(p),true);
});
