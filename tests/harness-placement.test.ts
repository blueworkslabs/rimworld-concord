import test from 'node:test';
import assert from 'node:assert/strict';
import {PlacementQuery,PlacementResult,placementWire} from '../src/harness/placement.js';

test('placement wire: unset options travel as the mod\'s -1 defaults, material only when given',()=>{
  const q=PlacementQuery.parse({by:'placement',def:'Campfire',x:10,z:12});
  assert.deepEqual(placementWire(q,'ep1'),{op:'placement',def:'Campfire',x:10,z:12,rot:-1,radius:-1,count:-1,epoch:'ep1'});
  assert.deepEqual(placementWire(PlacementQuery.parse({by:'placement',def:'Wall',x:1,z:2,rot:1,stuff:'WoodLog',radius:5,count:3})),
    {op:'placement',def:'Wall',x:1,z:2,rot:1,radius:5,count:3,stuff:'WoodLog'});
  for(const bad of [{by:'placement',def:'Campfire',x:-1,z:0},{by:'placement',def:'Campfire',x:0,z:0,rot:4},{by:'placement',def:'Campfire',x:0,z:0,radius:31},{by:'placement',def:'Campfire',x:0,z:0,extra:1}])
    assert.equal(PlacementQuery.safeParse(bad).success,false);
});

test('placement result accepts the mod\'s accepted, refused and not-buildable shapes',()=>{
  // Shapes as HarnessActions.Placement writes them (null stuff when none was asked).
  assert.equal(PlacementResult.parse({def:'Campfire',stuff:null,x:10,z:12,rot:0,size_x:1,size_z:1,ok:true,searchedRadius:12,nearest:[{x:11,z:12,distance:1}]}).ok,true);
  assert.equal(PlacementResult.parse({def:'Campfire',stuff:null,x:10,z:12,rot:0,size_x:1,size_z:1,ok:false,reason:'Space already occupied by Beatrice.',source:'game',searchedRadius:12,nearest:[]}).reason,'Space already occupied by Beatrice.');
  assert.equal(PlacementResult.parse({def:'Nope',stuff:null,x:10,z:12,ok:false,reason:'not a buildable def',source:'harness',nearest:[]}).source,'harness');
});
