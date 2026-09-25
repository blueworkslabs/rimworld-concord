import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import type {Domain,GameBridge,GameState} from '../src/protocol.js';
import {legacyAction} from '../trials/fixtures/legacy.js';
const legacy=legacyAction({kind:'haul',thing:'steel',x:4,z:5,count:10,trips:3,maxTicks:600});
function stored(where:string):Domain{
 const actionId=randomUUID(),id=randomUUID();
 const d:Domain={schema:1,world:'w',epoch:'e',branch:'b',characters:{A:{id:'A',name:'Ada',memories:[]}},proposals:{},outcomes:{}};
 d.proposals[id]={id,pawn:'A',action:legacy,reason:'Historical work',status:'pending'};
 if(where==='running'||where==='completed'){
  d.proposals[id]!.status='accepted';d.proposals[id]!.actionId=actionId;
  d.proposals[id]!.standing={status:where,deadline:600,steps:[actionId]};
  d.outcomes[actionId]={id:actionId,actor:'A',kind:'haul',status:'completed',reason:'One of three trips',x:4,z:5,delivered:10};
  if(where==='running'){d.characters.A!.intention=id;d.characters.A!.commitment=actionId;}
 }
 if(where==='counter'){d.proposals[id]!.action={kind:'move',x:1,z:1};d.proposals[id]!.status='countered';d.proposals[id]!.decision={kind:'counter',action:legacy,reason:'Historical counter'};}
 if(where==='reoffer'){d.proposals={};d.reoffers={r:{id:'r',pawn:'A',deferredId:id,action:legacy,tick:1,reason:'Historical invitation',status:'pending'}};}
 return d;
}
function bridge(){
 const calls:string[]=[];const state:GameState={world:'w',epoch:'e',loaded:true,paused:true,ticks:10,pawns:[{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1}],actions:[]};
 const game:GameBridge={async state(){calls.push('state');return structuredClone(state);},async move(){calls.push('move');throw Error('No dispatch expected');},async save(){calls.push('save');return {sha256:'hash'};},async verify(){calls.push('verify');},async load(){calls.push('load');}};
 return {game,calls};
}
test('unsupported stored work fails before open or recovery, without rewriting history',async()=>{
 for(const where of ['pending','running','completed','counter','reoffer']){
  const store=new Store(':memory:'),d=stored(where),{game,calls}=bridge();
  try {
   store.commit(d,{branch:'b',kind:'fixture',actor:'operator',data:{}});const before=store.read(),events=store.events();
   await assert.rejects(new Coordinator(store,game).open(),/Stored action is unsupported/);
   assert.deepEqual(calls,[]);assert.deepEqual(store.read(),before);assert.deepEqual(store.events(),events);
  } finally {store.close();}
 }
});
test('unsupported paired checkpoint fails before game verification/load and preserves current binding',async()=>{
 for(const where of ['pending','running','completed','counter','reoffer']){
  const store=new Store(':memory:'),{game,calls}=bridge(),c=new Coordinator(store,game);
  try {
   await c.open();store.checkpoint('lab-concord-legacy',stored(where),'hash');const current=c.inspect(),before=store.read(),events=store.events();calls.length=0;
   await assert.rejects(c.restore('lab-concord-legacy'),/Stored action is unsupported/);
   assert.deepEqual(calls,[]);assert.deepEqual(c.inspect(),current);assert.deepEqual(store.read(),before);assert.deepEqual(store.events(),events);
  } finally {store.close();}
 }
});
