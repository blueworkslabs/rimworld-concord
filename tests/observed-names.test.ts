import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observedPeople} from '../src/observed-names.js';
import {groundedPawn} from '../src/grounded-pawn.js';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import type {GameState,GameBridge,Domain} from '../src/protocol.js';
const game:GameState={world:'w',epoch:'e',ticks:1,paused:true,loaded:true,actions:[],pawns:[{id:'A',name:'Ada',x:0,z:0,job:'Wait',health:1,casualties:{epoch:'e',tick:1,mapId:0,radius:12,observations:[],visibleSubjects:[{target:'B',downed:false,inBed:false}]}},{id:'B',name:'Bea',x:1,z:1,job:'Wait',health:1,facts:[{key:'memory',value:'PRIVATE',level:1}]},{id:'C',name:'Hidden',x:99,z:99,job:'Wait',health:1}]};
test('local names expose labels only, reject stale sighting and never enumerate unseen pawns',()=>{
 const g=structuredClone(game);assert.deepEqual(observedPeople(g,g.pawns[0]!),[{id:'B',name:'Bea'}]);
 const domain:Domain={schema:1,world:'w',epoch:'e',branch:'b',characters:{},proposals:{},outcomes:{}};
 const p=groundedPawn(domain,g,g.pawns[0]!);assert.deepEqual(p.observedPeople,[{id:'B',name:'Bea'}]);assert.equal((p.observedPeople![0] as any).facts,undefined);assert(!p.observedPeople!.some(x=>x.id==='C'));
 g.pawns[0]!.casualties!.epoch='old';assert.deepEqual(observedPeople(g,g.pawns[0]!),[]);assert.equal(groundedPawn(domain,g,{...g.pawns[0]!,observedPeople:[{id:'C',name:'injected'}]}).observedPeople,undefined);
});
test('event subject names come from local sight and survive their native experience snapshot',async()=>{
 const g=structuredClone(game);g.eventSeq=2;g.events=[{seq:1,tick:1,pawn:'A',kind:'memory',detail:'DeepTalk',subject:'B'},{seq:2,tick:1,pawn:'A',kind:'memory',detail:'Unknown',subject:'C'}];
 const bridge={state:async()=>structuredClone(g)} as GameBridge;const s=new Store(':memory:'),c=new Coordinator(s,bridge);await c.open();await c.observe();
 const events=c.inspect().characters.A!.experiences!.map(x=>x.event);assert.equal(events[0]!.subjectName,'Bea');assert.equal(events[1]!.subjectName,undefined);g.pawns[1]!.name='Changed';assert.equal(events[0]!.subjectName,'Bea');s.close();
});
