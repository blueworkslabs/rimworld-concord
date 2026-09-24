import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntentView, HaulZone, intentWakes, topicOutcome, invariantFindings, counterAdoptable, progress } from '../src/native-intents.js';
import { nativeAttention } from '../src/routing.js';

const base=(o:Partial<IntentView>={}):IntentView=>IntentView.parse({intentId:'i1',thingDef:'WoodLog',variant:'attribution',status:'open',zoneId:7,
  quota:30,delivered:0,reserved:0,remaining:30,overshoot:0,incidental:0,unattributed:0,removed:0,violations:0,rejectedStarts:0,
  finishedAfterExclusion:0,createdTick:1000,untilTick:31000,lastDeliveryTick:-1,accepted:['A'],excluded:[],byPawn:[],drops:[],...o});

test('new native kinds route without waking or interrupting per event',()=>{
  for(const kind of ['job-start','job-end','ingested','haul-delivered','quota-escape','intent-admitted-start','intent-retired','intent-incidental','intent-trued-up','lab-drafted'])
    assert.deepEqual(nativeAttention({kind,detail:''}),{next:'native',interrupt:false},kind);
  assert.deepEqual(nativeAttention({kind:'interaction',detail:'Chitchat'}),{next:'deliberation',interrupt:false});
  assert.deepEqual(nativeAttention({kind:'interaction',detail:'Insult'}),{next:'deliberation',interrupt:true});
});

test('core wakes on first delivery, quota and expiry, not per trip',()=>{
  assert.deepEqual(intentWakes({view:base(),tick:1100},{view:base({delivered:10,byPawn:[{pawn:'A',count:10}],lastDeliveryTick:1200}),tick:1200},2500),['first-delivery']);
  assert.deepEqual(intentWakes({view:base({delivered:10,lastDeliveryTick:1200}),tick:1200},{view:base({delivered:20,lastDeliveryTick:1300}),tick:1300},2500),[]);
  assert.deepEqual(intentWakes({view:base({delivered:20}),tick:1300},{view:base({delivered:30,status:'met'}),tick:1400},2500),['quota']);
  assert.deepEqual(intentWakes({view:base({delivered:20}),tick:30990},{view:base({delivered:20,status:'expired'}),tick:31000},99999),['expired']);
});

test('stall wakes once per quiet period',()=>{
  const v=base({delivered:5,lastDeliveryTick:2000});
  assert.deepEqual(intentWakes({view:v,tick:4000},{view:v,tick:4600},2500),['stall']);
  assert.deepEqual(intentWakes({view:v,tick:4600},{view:v,tick:5000},2500),[]);
});

test('partial expiry keeps the topic open; only the quota resolves it',()=>{
  assert.equal(topicOutcome(base({status:'expired',delivered:20})),'expired');
  assert.equal(topicOutcome(base({status:'met',delivered:30})),'resolved');
  assert.equal(topicOutcome(base()),'open');
});

test('escapes and violations are findings, never hidden; injected escape must be detected',()=>{
  const escaped=base({status:'met',delivered:40,overshoot:10,byPawn:[{pawn:'A',count:40}]});
  assert.deepEqual(invariantFindings(escaped),['quota escapes: 10']);
  assert.deepEqual(invariantFindings(escaped,{escapeInjected:true}),[]);
  assert.deepEqual(invariantFindings(base({status:'met',delivered:30,byPawn:[{pawn:'A',count:30}]}),{escapeInjected:true}),['injected escape not detected']);
  assert.ok(invariantFindings(base({violations:1})).includes('consent violations: 1'));
  assert.ok(invariantFindings(base({status:'met',delivered:30,reserved:5,byPawn:[{pawn:'A',count:30}]})).includes('reservations held after retirement'));
});

test('aggregate receipt credits carriers and reports incidental arrivals',()=>{
  assert.deepEqual(progress(base({delivered:12,incidental:3,unattributed:2,byPawn:[{pawn:'A',count:7},{pawn:'B',count:5}]})),
    {delivered:12,quota:30,overshoot:0,incidental:5,byPawn:{A:7,B:5}});
});

test('quota counters are adoptable only before the first acceptance',()=>{
  assert.equal(counterAdoptable(undefined),true);
  assert.equal(counterAdoptable(base({status:'pending'})),true);
  assert.equal(counterAdoptable(base()),false);
});

test('haul-zone intent is bounded',()=>{
  const ok={kind:'haul-zone',intentId:'8f14e45f-ceea-467a-9575-0fbc5a3b7a7e',thing:'WoodLog',x:76,z:84,w:4,h:4,quota:30,maxTicks:30000,variant:'attribution'};
  assert.ok(HaulZone.safeParse(ok).success);
  assert.ok(!HaulZone.safeParse({...ok,quota:76}).success);
  assert.ok(!HaulZone.safeParse({...ok,w:9,h:8}).success);
});
