import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Action,wire} from '../src/harness/actions.js';
import {Snapshot} from '../src/harness/perception.js';
import {checkT1} from '../src/harness/checker.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const fixture=()=>Snapshot.parse(JSON.parse(readFileSync(join(root,'tests/fixtures/perception-snapshot.json'),'utf8')));

test('actions v1 validate strictly and map to the flat bridge request',()=>{
  assert.deepEqual(wire({action:'place_blueprint',def:'Campfire',x:46,z:40},'r1'),{op:'act',requestId:'r1',action:'place_blueprint',def:'Campfire',x:46,z:40,rot:-1});
  assert.deepEqual(wire({action:'bill',bench:300,recipe:'CookMealSimple',repeat:'count',count:3},'r2'),{op:'act',requestId:'r2',action:'bill',thingId:300,recipe:'CookMealSimple',mode:'count',count:3,radius:-1});
  assert.deepEqual(wire({action:'zone',kind:'stockpile',cells:[{x:1,z:2},{x:2,z:2}],priority:'Important',allow:['WoodLog']},'r3'),
    {op:'act',requestId:'r3',action:'zone',mode:'stockpile',zoneId:-1,cells:'1,2;2,2',storage:'Important',allow:['WoodLog']});
  assert.deepEqual(wire({action:'forbid',thing:101,forbidden:false},'r4'),{op:'act',requestId:'r4',action:'forbid',thingId:101,flag:false});
  assert.deepEqual(wire({action:'work_priority',pawn:201,work:'Cooking',priority:1},'r5'),{op:'act',requestId:'r5',action:'work_priority',thingId:201,work:'Cooking',priority:1});
  for(const bad of [{action:'draft',pawn:201},{action:'designate',kind:'mine'},{action:'zone',cells:[]},{action:'bill',bench:1,recipe:'X',repeat:'count'},
    {action:'place_blueprint',def:'Campfire',x:-1,z:0},{action:'schedule',pawn:1,hour:24,assignment:'Sleep'},{action:'forbid',thing:1,forbidden:true,extra:1}])
    assert.throws(()=>Action.parse(bad),JSON.stringify(bad));
  assert.throws(()=>wire({action:'forbid',thing:1,forbidden:true},''),/requestId/);
});

test('the T1 checker reads only game state: a new campfire, a new bill counted to zero, three meals cooked',()=>{
  const start=fixture();for(const p of start.pawns)p.records={mealsCooked:2,thingsConstructed:0};
  const end=structuredClone(start);end.meta.tick=9000;
  assert.deepEqual(checkT1(start,end).missing,['no campfire built during the run','no simple-meal bill configured during the run','only 0 meals cooked since the start']);
  end.map.things.push({id:500,kind:'building',def:'Campfire',label:'campfire',x:46,z:40,rot:0,stack:1,forbidden:false,faction:'player',workbench:true});
  end.bills=[{bench:500,benchDef:'Campfire',x:46,z:40,bills:[{loadId:'Bill_CookMealSimple_7',recipe:'CookMealSimple',suspended:false,ingredientRadius:999,restrictedTo:-1,repeatMode:'RepeatCount',repeatCount:1,targetCount:10,paused:false}]}];
  end.pawns[1]!.records={mealsCooked:4,thingsConstructed:0};
  assert.deepEqual(checkT1(start,end).missing,['the new simple-meal bill has not counted down to zero','only 2 meals cooked since the start']);
  end.bills[0]!.bills[0]!.repeatCount=0;end.pawns[0]!.records={mealsCooked:3,thingsConstructed:1};
  const ok=checkT1(start,end);assert.equal(ok.completed,true);assert.deepEqual(ok.evidence.mealsCookedSinceStart,3);assert.deepEqual(ok.evidence.campfires,[500]);
  const other={...end,meta:{...end.meta,world:'w2'}};assert.equal(checkT1(start,other).completed,false);
  const preexisting=structuredClone(start);preexisting.map.things.push(end.map.things.at(-1)!);assert.ok(checkT1(preexisting,end).missing.includes('no campfire built during the run'),'a campfire present at the start does not count');
});
