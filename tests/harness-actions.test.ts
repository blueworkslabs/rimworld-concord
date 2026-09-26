import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Action,wire} from '../src/harness/actions.js';
import {Snapshot} from '../src/harness/perception.js';
import {checkT1} from '../src/harness/checker.js';
const context={world:'w1',epoch:'e1',mapId:0};
const root=fileURLToPath(new URL('../..',import.meta.url));
const fixture=()=>Snapshot.parse(JSON.parse(readFileSync(join(root,'tests/fixtures/perception-snapshot.json'),'utf8')));

test('actions v1 validate strictly and map to the flat bridge request',()=>{
  assert.deepEqual(wire({action:'place_blueprint',def:'Campfire',x:46,z:40},context,'r1'),{...context,op:'act',requestId:'r1',action:'place_blueprint',def:'Campfire',x:46,z:40,rot:-1});
  assert.deepEqual(wire({action:'bill',bench:300,recipe:'CookMealSimple',repeat:'count',count:3},context,'r2'),{...context,op:'act',requestId:'r2',action:'bill',thingId:300,recipe:'CookMealSimple',mode:'count',count:3,radius:-1});
  assert.deepEqual(wire({action:'zone',kind:'stockpile',cells:[{x:1,z:2},{x:2,z:2}],priority:'Important',allow:['WoodLog']},context,'r3'),
    {...context,op:'act',requestId:'r3',action:'zone',mode:'stockpile',zoneId:-1,cells:'1,2;2,2',storage:'Important',allow:['WoodLog'],hasAllow:true});
  assert.deepEqual(wire({action:'forbid',thing:101,forbidden:false},context,'r4'),{...context,op:'act',requestId:'r4',action:'forbid',thingId:101,flag:false});
  assert.deepEqual(wire({action:'work_priority',pawn:201,work:'Cooking',priority:1},context,'r5'),{...context,op:'act',requestId:'r5',action:'work_priority',thingId:201,work:'Cooking',priority:1});
  for(const bad of [{action:'draft',pawn:201},{action:'designate',kind:'mine'},{action:'zone',cells:[]},{action:'bill',bench:1,recipe:'X',repeat:'count'},
    {action:'place_blueprint',def:'Campfire',x:-1,z:0},{action:'schedule',pawn:1,hour:24,assignment:'Sleep'},{action:'forbid',thing:1,forbidden:true,extra:1}])
    assert.throws(()=>Action.parse(bad),JSON.stringify(bad));
  assert.deepEqual(wire({action:'assign_bed',bed:310,pawn:201},context,'r6'),{...context,op:'act',requestId:'r6',action:'assign_bed',thingId:310,pawnId:201});
  for(const bad of [{action:'assign_bed',bed:310},{action:'assign_bed',bed:310,pawn:201,force:true},{action:'assign_bed',bed:-1,pawn:201}])assert.throws(()=>wire(bad,context,'r7'));
  assert.throws(()=>wire({action:'forbid',thing:1,forbidden:true},context,''),/requestId/);
  assert.throws(()=>wire({action:'forbid',thing:1,forbidden:true},undefined as any),/./);
  assert.equal(wire({action:'bill_edit',bill:'B',count:5},context).count,5);
  assert.equal(wire({action:'bill_edit',bill:'B',repeat:'count'},context).count,-1);
  assert.deepEqual(wire({action:'zone',zone:1,allow:[]},context).allow,[]);
  assert.equal(wire({action:'zone',zone:1,allow:[]},context).hasAllow,true);
});

test('T1 requires observed three-iteration configuration and comparable native records',()=>{
 const start=fixture();for(const p of start.pawns)p.records={mealsCooked:2,thingsConstructed:0};
 const configured=structuredClone(start);configured.meta.tick=8000;
 configured.map.things.push({id:500,kind:'building',def:'Campfire',label:'campfire',x:46,z:40,rot:0,stack:1,forbidden:false,faction:'player',workbench:true});
 configured.bills=[{bench:500,benchDef:'Campfire',x:46,z:40,bills:[{loadId:'Bill_CookMealSimple_7',recipe:'CookMealSimple',suspended:false,ingredientRadius:999,restrictedTo:-1,repeatMode:'RepeatCount',repeatCount:3,targetCount:10,paused:false}]}];
 const end=structuredClone(configured);end.meta.tick=9000;end.bills[0]!.bills[0]!.repeatCount=0;end.pawns[0]!.records!.mealsCooked=5;
 assert.equal(checkT1(start,end).completed,false,'two endpoints cannot prove configured count');
 assert.equal(checkT1(start,end,configured).completed,true);
 const one=structuredClone(configured);one.bills[0]!.bills[0]!.repeatCount=1;
 assert.equal(checkT1(start,end,one).completed,false,'one-count bill plus unrelated meals is not three-iteration evidence');
 const three=structuredClone(one);three.bills[0]!.bills.push({...three.bills[0]!.bills[0]!,loadId:'B2'},{...three.bills[0]!.bills[0]!,loadId:'B3'});
 assert.equal(checkT1(start,end,three).completed,false,'three count-one bills are not the configured task');
 for(const patch of [{world:'other'},{epoch:'reloaded'},{tick:0}])assert.equal(checkT1(start,{...end,meta:{...end.meta,...patch}},configured).completed,false);
 const missing=structuredClone(start);delete missing.pawns[0]!.records;assert.equal(checkT1(missing,end,configured).completed,false);
 const newcomer=structuredClone(end);newcomer.pawns[0]!.id=999;assert.equal(checkT1(start,newcomer,configured).completed,false,'new pawn lifetime totals are not run work');
 const preexisting=structuredClone(start);preexisting.map.things.push(end.map.things.at(-1)!);assert.equal(checkT1(preexisting,end,configured).completed,false);
});
