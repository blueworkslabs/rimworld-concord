import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {ToolServer,result,type CallLog} from '../src/harness/tool-server.js';
import {UiMcp} from '../src/harness/ui-mcp.js';
import {BenchmarkObserver} from '../src/harness/benchmark-observer.js';
import {Snapshot} from '../src/harness/perception.js';
import {counts,usageFromEvents} from '../src/harness/benchmark-metrics.js';
import {controllerCatalog,isolationConfig} from '../src/harness/controller-config.js';
const root=new URL('../..',import.meta.url).pathname;
const snapshot=()=>Snapshot.parse(JSON.parse(readFileSync(root+'/tests/fixtures/perception-snapshot.json','utf8')));
const call=(name:string,args={})=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});

test('journal preserves failed inputs and issued uncertain calls; done freezes before reply and blocks later actions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bench-')),log=join(dir,'calls');let stopped=false,acts=0;
 try{
  const server=new ToolServer('fake',[],{act:'input',report_done:'done'},async n=>{if(n==='act'){acts++;return result('refused',true);}return result('done');},log,{before:async()=>{},after:async done=>{if(done)stopped=true;}});
  await server.handle(call('act'));await server.handle(call('report_done'));assert.equal(stopped,true);
  const late:any=await server.handle(call('act'));assert(late.result.isError);assert.equal(acts,1);
  const rows:CallLog[]=readFileSync(log,'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const c=counts(rows);assert.equal(c.inputs,2);assert.equal(c.errors,2);assert.equal(c.calls,3);assert.equal(c.unresolved,0);
  assert(rows.some(x=>x.event==='issued'&&x.tool==='act'));
  assert.equal(counts(rows.slice(0,-1)).unresolved,1);
 }finally{rmSync(dir,{recursive:true});}
});

test('hidden observer captures configured count three, not two, and pauses before done snapshot',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bench-'));const start=snapshot();start.bills=[];let s=structuredClone(start),paused=false;
 const fire={...s.map.things[0]!,id:99999,def:'Campfire',kind:'building',faction:'player'};s.map.things.push(fire);
 const existing={loadId:'fixture',recipe:'CookMealSimple',suspended:false,ingredientRadius:999,restrictedTo:-1};
 s.bills=[{bench:99999,benchDef:'Campfire',x:2,z:2,bills:[{...existing,loadId:'new',recipe:'CookMealSimple',repeatMode:'RepeatCount',repeatCount:2}]}];
 try{
  const observer=new BenchmarkObserver({perceive:async()=>s,admin:async()=>{paused=true;}},dir,start);
  await observer.before();assert(!existsSync(dir+'/configured.json'));
  s.bills[0]!.bills[0]!.repeatCount=3;await observer.after(false);assert.equal(JSON.parse(readFileSync(dir+'/configured.json','utf8')).bills[0].bills[0].repeatCount,3);
  s.bills[0]!.bills[0]!.repeatCount=0;await observer.after(true);assert(paused);assert.equal(JSON.parse(readFileSync(dir+'/done.json','utf8')).snapshot.bills[0].bills[0].repeatCount,0);
 }finally{rmSync(dir,{recursive:true});}
});

test('UI replies contain screen pixels, not hidden snapshots; backend gets only UI operation',async()=>{
 const args:unknown[]=[];let hiddenReads=0;
 const ui=new UiMcp(async a=>{args.push(a);return {image:'iVBORw0KGgo=',mimeType:'image/png'};},undefined,{before:async()=>{hiddenReads++;},after:async()=>{hiddenReads++;}});
 const reply:any=await ui.handle(call('screenshot'));
 assert.deepEqual(reply.result.content,[{type:'image',data:'iVBORw0KGgo=',mimeType:'image/png'}]);assert.equal(hiddenReads,2);assert.deepEqual(args,[{op:'screenshot'}]);
 assert.deepEqual((await ui.handle({id:3,method:'resources/list'}) as any).result.resources,[]);
 assert.equal((await ui.handle({id:4,method:'resources/read',params:{uri:'file:///private'}}) as any).error.code,-32601);
});

test('missing/partial usage stays unknown and catalog strips model-enabled privileged tools',()=>{
 assert.equal(usageFromEvents('',false).input_tokens,null);assert.equal(usageFromEvents('',false).complete,false);
 const used=usageFromEvents(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:60,output_tokens:20}})+'\n',true);
 assert.equal(used.uncached_input_tokens,40);assert.equal(used.reasoning_output_tokens,null);assert.equal(used.complete,true);
 const original={models:[{slug:'chosen',base_instructions:'unchanged',tool_mode:'code_mode_only',multi_agent_version:'v2',apply_patch_tool_type:'freeform',experimental_supported_tools:['clock']}]};
 const m=controllerCatalog(original,'chosen').models[0];assert.equal(m.apply_patch_tool_type,null);assert.equal(m.base_instructions,'unchanged');assert.equal(m.tool_mode,'direct');assert.equal(original.models[0]!.tool_mode,'code_mode_only');assert.equal(isolationConfig['agents.enabled'],false);
});

test('benchmark and UI entrypoints reject direct calls before game access; launcher rejects held lock',()=>{
 const direct=spawnSync(process.execPath,[root+'/dist/trials/benchmark-run.js'],{env:{...process.env,CONCORD_HARNESS_LOCKED:''},encoding:'utf8'});assert.notEqual(direct.status,0);assert.match(direct.stderr,/Exclusive lab lock/);
 const dir=mkdtempSync(join(tmpdir(),'bench-lock-'));try{
  execFileSync('mkdir',['-p',dir+'/concord']);
  const script=join(dir,'holder.sh');writeFileSync(script,'#!/bin/sh\nflock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" bash "'+root+'/scripts/run-benchmark.sh" --arm=harness --task=T1 --save=lab-concord-fixture --model=gpt-6-astra\n');
  const held=spawnSync('flock',[dir+'/concord/coordinator.lock','bash',script],{env:{...process.env,RIMWORLD_LAB_ROOT:dir},encoding:'utf8'});assert.notEqual(held.status,0);assert.equal(held.stdout,'');
 }finally{rmSync(dir,{recursive:true});}
});

test('observer failures retain accepted receipt and seal the server; thrown execution still gets post-observation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bench-')),log=join(dir,'calls');let executed=0,after=0;
 try{
  const server=new ToolServer('fake',[],{act:'input'},async()=>{executed++;return result({ok:true,id:'accepted'});},log,{before:async()=>{},after:async()=>{after++;throw Error('observer unavailable');}});
  const r:any=await server.handle(call('act'));assert(r.result.isError);assert.match(r.result.content[0].text,/accepted/);
  await server.handle(call('act'));assert.equal(executed,1);assert.equal(after,1);
  const row=readFileSync(log,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x)).find(x=>x.observerFailure);
  assert.match(row.actionResponse.content[0].text,/accepted/);
  const thrown=new ToolServer('fake',[],{act:'input'},async()=>{throw Error('transport uncertain');},undefined,{before:async()=>{},after:async()=>{after++;}});
  await thrown.handle(call('act'));assert.equal(after,2);
 }finally{rmSync(dir,{recursive:true});}
});
