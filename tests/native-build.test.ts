import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BuildView,buildCredit} from '../src/native-build.js';
import {nativeAttention} from '../src/routing.js';

const raw={intentId:'i1',status:'built',stage:'built',def:'Campfire',label:'campfire at the east site',siteId:'east-site',stopReason:null,finisher:'Thing_Human2',note:null,fate:'standing',held:null,
  mapId:0,x:10,z:12,rot:0,generation:1,thingId:77,createdTick:100,untilTick:60100,fateTick:-1,violations:0,rejectedStarts:1,
  accepted:['Thing_Human1'],excluded:['Thing_Human3'],
  delivered:[{pawn:'Thing_Human1',role:'accepted',def:'WoodLog',count:12,work:0},{pawn:'Thing_Human2',role:'helper',def:'WoodLog',count:8,work:0},{pawn:'Thing_Human3',role:'forced',def:'WoodLog',count:0,work:0}],
  work:[{pawn:'Thing_Human2',role:'helper',def:'',count:0,work:130.5},{pawn:'Thing_Human4',role:'pretag',def:'',count:0,work:10}],
  records:[{seq:1,tick:120,generation:1,kind:'delivery',pawn:'Thing_Human1',role:'accepted',def:'WoodLog',count:12,work:0,occurrence:'deposit:5:77:1:1',text:''}]};

test('a construction view parses strictly and credits only accepted pawns and helpers',()=>{
  const v=BuildView.parse(raw);const c=buildCredit(v);
  assert.deepEqual(c.delivered.map(d=>d.pawn),['Thing_Human1','Thing_Human2']);
  assert.deepEqual(c.work.map(w=>w.pawn),['Thing_Human2']);
  assert.deepEqual(c.uncredited.map(r=>r.role).sort(),['forced','pretag'],'forced and pre-tag stay listed, uncredited');
  assert.deepEqual(c.helpers,['Thing_Human2']);
  assert.throws(()=>BuildView.parse({...raw,delivered:[{pawn:'x',role:'owner',def:'WoodLog',count:1,work:0}]}),'an unknown role is rejected');
  assert.throws(()=>BuildView.parse({...raw,status:'met'}),'hauling statuses are not construction statuses');
});

test('construction events are native texture, never a pawn wake',()=>{
  for(const kind of ['build-opened','build-excluded','build-stage','build-delivered','build-work','build-ended','build-fate','build-pretag-marked','build-rejected-start','build-rejected-destination','build-rejected-deposit'])
    assert.deepEqual(nativeAttention({kind,detail:'intent=i1'}),{next:'native',interrupt:false},kind);
});
