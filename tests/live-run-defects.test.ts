import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecisionChannel } from '../src/decision-channel.js';
import { failureCause, fitReflection, codexRequest, PROMPT_LIMIT } from '../src/codex-decision.js';
import { newestReceiptTick, staleNote } from '../src/observation-age.js';
import { recordCrew } from '../src/crew-log.js';
import type { Domain, GameState } from '../src/protocol.js';

test('a failed request carries its cause across the wire instead of a bare "unavailable"',async()=>{
  const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},events:[],proposals:[]};
  const sent:any[]=[];const relay=new DecisionChannel(v=>sent.push(v));const p=relay.reflect(view as any,new AbortController().signal);
  relay.receive({type:'decision-result',id:sent[0].id,error:'Decision unavailable',cause:'context-too-large'});
  await assert.rejects(p,(e:any)=>e.failureCause==='context-too-large'&&/context-too-large/.test(e.message));
  assert.throws(()=>relay.receive({type:'decision-result',id:sent[0].id,error:'Decision unavailable',cause:'free text'}));relay.close();
});

test('failure causes are classified without content',()=>{
  assert.equal(failureCause(Error('Context too large'),false,false),'context-too-large');
  assert.equal(failureCause(Error('Complete request too large'),false,false),'request-too-large');
  assert.equal(failureCause(Error('x'),true,true),'cancelled');
  assert.equal(failureCause(Error('bad json'),false,true),'invalid-output');
  assert.equal(failureCause(Error('Native decision unavailable'),false,true),'backend');
});

test('reflection perspectives are trimmed oldest-first to fit, never by raising the limit',()=>{
  const big='x'.repeat(900);
  const view:any={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1,facts:[]},events:[],proposals:[],
    character:{id:'A',name:'Ada',memories:Array.from({length:30},(_,i)=>`memory ${i} ${big}`),experiences:Array.from({length:20},(_,i)=>({event:{seq:i,tick:i,pawn:'A',kind:'food',detail:big},route:'appraisal'}))}};
  const request=codexRequest('reflection',view);
  assert.ok(Buffer.byteLength(request.prompt)<=PROMPT_LIMIT);
  assert.ok(view.trimmed.experiences+view.trimmed.memories>0);
  assert.equal(view.character.memories.at(-1),`memory 29 ${big}`,'newest memory kept');
  // Nothing left to trim: the failure is reported, the limit is unchanged.
  const tiny:any={size:0};let n=PROMPT_LIMIT+1;const trimmed=fitReflection(tiny,()=>n);assert.deepEqual(trimmed,{experiences:0,memories:0,messages:0});
});

test('narration built on a snapshot older than the newest receipt is flagged before publication',()=>{
  const g={events:[{seq:5,tick:20205,pawn:'B',kind:'ingested',detail:'RawBerries;count=16'},{seq:6,tick:20300,pawn:'B',kind:'food',detail:'0.6'}]} as unknown as GameState;
  const d={characters:{},intentViews:{}} as unknown as Domain;
  assert.equal(newestReceiptTick(d,g),20205,'samples are not receipts');
  assert.equal(staleNote({asOfTick:20100,newerReceiptTick:20205}),'[as of t20100; newer receipts since t20205] ');
  assert.equal(staleNote({asOfTick:20100}),'');
  const domain={characters:{core:{id:'core',name:'Core',memories:[]}},proposals:{}} as unknown as Domain;
  recordCrew(domain,'core-planned','core',{id:'t1',reason:'Her receipt shows none consumed.',asOfTick:20100,newerReceiptTick:20205},21034);
  assert.equal(domain.crew!.entries[0]!.text,'[as of t20100; newer receipts since t20205] Her receipt shows none consumed.');
});
