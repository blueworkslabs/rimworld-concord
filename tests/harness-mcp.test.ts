import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {HarnessMcp,TOOLS,type HarnessBridge} from '../src/harness/mcp.js';
import {Snapshot} from '../src/harness/perception.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const snap=()=>Snapshot.parse(JSON.parse(readFileSync(join(root,'tests/fixtures/perception-snapshot.json'),'utf8')));

test('the harness MCP server speaks JSON-RPC over stdio and logs every call in the shared format',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'concord-mcp-'));const log=join(dir,'calls.jsonl');
  try{
    let tick=2500;const acts:unknown[]=[];const times:unknown[]=[];let done='';
    const bridge:HarnessBridge={perceive:async()=>{const s=snap();s.meta.tick=tick;s.time.tick=tick;tick+=100;return s;},
      act:async(a,id)=>{acts.push(a);return {seq:acts.length,tick,requestId:id!,action:(a as any).action,ok:(a as any).x!==0,id:(a as any).x!==0?'777':null,reason:(a as any).x!==0?null:'Cannot place here',source:(a as any).x!==0?null:'game',detail:null};},
      time:async c=>{times.push(c);},placement:async()=>{throw Error('unused');}};
    const server=new HarnessMcp(bridge,log,s=>{done=s;});
    const input=new PassThrough(),output=new PassThrough();const replies:any[]=[];
    output.on('data',d=>{for(const l of String(d).split('\n').filter(Boolean))replies.push(JSON.parse(l));});
    const serving=server.serve(input,output);
    const send=(m:unknown)=>input.write(JSON.stringify(m)+'\n');
    send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{}}});
    send({jsonrpc:'2.0',method:'notifications/initialized'});
    send({jsonrpc:'2.0',id:2,method:'tools/list'});
    send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'observe',arguments:{}}});
    send({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'observe',arguments:{}}});
    send({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'act',arguments:{action:{action:'draft',pawn:201}}}});
    send({jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'act',arguments:{action:{action:'place_blueprint',def:'Campfire',x:0,z:40}}}});
    send({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'act',arguments:{action:{action:'place_blueprint',def:'Campfire',x:46,z:40}}}});
    send({jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'look',arguments:{query:{by:'def',def:'WoodLog'}}}});
    send({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'time',arguments:{control:'3'}}});
    send({jsonrpc:'2.0',id:10,method:'tools/call',params:{name:'report_done',arguments:{summary:'campfire and meals done'}}});
    send({jsonrpc:'2.0',id:11,method:'bogus'});
    input.end();await serving;
    const byId=(id:number)=>replies.find(r=>r.id===id);
    assert.equal(replies.length,11,'eleven requests, no reply to the notification');
    assert.equal(byId(1).result.serverInfo.name,'concord-harness');
    assert.deepEqual(byId(2).result.tools.map((t:any)=>t.name),['observe','look','act','time','report_done']);assert.equal(TOOLS.length,5);
    const o1=JSON.parse(byId(3).result.content[0].text),o2=JSON.parse(byId(4).result.content[0].text);
    assert.equal(o1.changedSinceLastObserve,null);assert.equal(o2.changedSinceLastObserve.fromTick,2500);assert.ok(o1.colony.fitted.fits);
    assert.equal(byId(5).result.isError,true);assert.match(byId(5).result.content[0].text,/harness/);
    assert.equal(byId(6).result.isError,true);assert.match(byId(6).result.content[0].text,/Cannot place here/);
    assert.equal(byId(7).result.isError,undefined);assert.equal(JSON.parse(byId(7).result.content[0].text).id,'777');
    assert.deepEqual(JSON.parse(byId(8).result.content[0].text).things.map((t:any)=>t.id),[101,102]);
    assert.deepEqual(times,[3]);assert.equal(done,'campfire and meals done');assert.equal(server.done,true);
    assert.equal(byId(11).error.code,-32601);
    assert.equal(acts.length,2,'an invalid action never reaches the game');
    const all=readFileSync(log,'utf8').trim().split('\n').map(l=>JSON.parse(l));
    assert.equal(all.filter(c=>c.event==='issued').length,8);
    const calls=all.filter(c=>c.event==='completed');
    assert.deepEqual(calls.map(c=>c.kind),['observation','observation','input','input','input','observation','control','done']);
    assert.ok(calls.every(c=>typeof c.at==='number'&&typeof c.bytes==='number'&&typeof c.ok==='boolean'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('the T1 task text is one file shared by both arms and names the only tool both servers must provide',()=>{
  const task=JSON.parse(readFileSync(join(root,'benchmark/tasks/T1.json'),'utf8'));
  assert.equal(task.id,'T1');assert.equal(task.checker,'T1');assert.equal(task.timeoutSeconds,1200);
  assert.match(task.prompt,/report_done/);assert.doesNotMatch(task.prompt,/observe|look|act\b|screenshot|click/i,'no interface-specific wording in the shared task');
});

test('placement is a read-only look: validated before the game, answered by the game, journalled as an observation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'concord-mcp-placement-'));const log=join(dir,'calls.jsonl');
  try{
    const asked:unknown[]=[];let acted=0,perceived=0;
    const bridge:HarnessBridge={perceive:async()=>{perceived++;return snap();},act:async()=>{acted++;throw Error('no');},time:async()=>{},
      placement:async q=>{asked.push(q);return {def:q.def,stuff:null,x:q.x,z:q.z,rot:0,size_x:1,size_z:1,ok:false,reason:'Space already occupied',source:'game',searchedRadius:12,nearest:[{x:q.x+1,z:q.z,distance:1}]};}};
    const server=new HarnessMcp(bridge,log);
    const input=new PassThrough(),output=new PassThrough();const replies:any[]=[];
    output.on('data',d=>{for(const l of String(d).split('\n').filter(Boolean))replies.push(JSON.parse(l));});
    const serving=server.serve(input,output);const send=(m:unknown)=>input.write(JSON.stringify(m)+'\n');
    send({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'look',arguments:{query:{by:'placement',def:'Campfire',x:40,z:41}}}});
    send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'look',arguments:{query:{by:'placement',def:'Campfire',x:40,z:41,place:true}}}});
    send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'look',arguments:{query:{by:'placement',def:'Campfire; rm',x:40,z:41}}}});
    input.end();await serving;
    const byId=(id:number)=>replies.find(r=>r.id===id);
    const r1=JSON.parse(byId(1).result.content[0].text);
    assert.equal(byId(1).result.isError,undefined,'a refused cell is an answer, not a tool error');
    assert.equal(r1.ok,false);assert.equal(r1.source,'game');assert.deepEqual(r1.nearest,[{x:41,z:41,distance:1}]);
    assert.equal(byId(2).result.isError,true);assert.equal(byId(3).result.isError,true);
    assert.deepEqual(asked,[{by:'placement',def:'Campfire',x:40,z:41}]);assert.equal(acted,0);assert.equal(perceived,0);
    const calls=readFileSync(log,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(c=>c.event==='completed');
    assert.deepEqual(calls.map(c=>c.kind),['observation','observation','observation']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
