import {test} from 'node:test';
import assert from 'node:assert/strict';
import {foodObservation,sharedFood,foodLines,type FoodObservation} from '../src/food-observation.js';
import {coreView} from '../src/core-planner.js';
import {coreWakeSnapshot} from '../src/core-scheduler.js';
import {groundedPawn} from '../src/grounded-pawn.js';
import type {Domain,GameState,Pawn} from '../src/protocol.js';
const sight:FoodObservation={source:'shared-local-sighting',epoch:'epoch',tick:200,mapId:1,radius:12,truncated:false,
 items:[{thing:'berries',label:'Berries',x:1,z:2,count:75,nutritionGiving:true,simpleMealIngredientCount:10,forbidden:true}],campfires:[]};
function fixture(){
 const p:Pawn={id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1,production:{epoch:'epoch',tick:200,mapId:1,options:[],supplies:[]},foodObservation:structuredClone(sight),facts:[{key:'private',value:'SECRET',level:.5}],cookReady:false,buildReady:false};
 const g:GameState={loaded:true,paused:true,world:'world',epoch:'epoch',ticks:200,pawns:[p],actions:[]};
 const d:Domain={schema:1,world:'world',epoch:'epoch',branch:'branch',characters:{A:{id:'A',name:'Ada',memories:[]}},proposals:{},outcomes:{},coreState:{revision:0,brief:{id:'brief',text:'Optional coordination'},topics:[],questions:[],turns:[]}};
 return {p,g,d};
}
test('food sightings independent of skills, forbidden state and action menu; exact projection is shared without private data',()=>{
 const {p,g,d}=fixture();Object.assign(p.foodObservation!,{facts:p.facts,private:'SECRET'});Object.assign(p.foodObservation!.items[0]!,{private:'SECRET'});
 const view=coreView(d,g);assert.equal(view.opportunities.length,0);assert.deepEqual(view.foodSightings,[{observer:'A',name:'Ada',status:'observed',...sight}]);
 assert.deepEqual(groundedPawn(d,g,p).foodObservation,sight);assert.equal(p.foodObservation!.items[0]!.count,75);
 const lines=foodLines(sharedFood(d,g));assert(lines.some(x=>x.includes('75 units')));assert(lines.some(x=>x.includes('forbidden true')));assert(lines.some(x=>x.includes('elsewhere unknown')));
});
test('wrong map/timeline, future/stale/malformed/duplicate observations are unknown, not no food',()=>{
 for(const patch of [{epoch:'old'},{mapId:2},{tick:201},{tick:79},{radius:20},{items:[sight.items[0],sight.items[0]]},{items:[{...sight.items[0],count:-1}]}]){
  const {p,g,d}=fixture();Object.assign(p.foodObservation!,patch);assert.equal(foodObservation(g,p),undefined);assert.deepEqual(sharedFood(d,g),[{observer:'A',name:'Ada',status:'unknown'}]);
 }
 const {p,g,d}=fixture();delete p.foodObservation;assert.equal(sharedFood(d,g)[0]!.status,'unknown');
});
test('overlapping observers remain attributed sightings; changed quantities do not authorize jobs or add scheduler turns',()=>{
 const {p,g,d}=fixture();g.pawns.push({...structuredClone(p),id:'B',name:'Bea'});d.characters.B={id:'B',name:'Bea',memories:[]};
 const a=coreView(d,g);assert.equal(a.foodSightings!.length,2);assert.equal(a.opportunities.length,0);
 p.foodObservation!.items[0]!.count=65;p.foodObservation!.truncated=true;
 const b=coreView(d,g);assert.deepEqual(coreWakeSnapshot(a),coreWakeSnapshot(b));assert.equal(b.foodSightings![0]!.status,'observed');
 assert(foodLines(sharedFood(d,g)).some(x=>x.includes('bounded/truncated')));
});
