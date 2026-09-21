import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecisionChannel } from '../src/decision-channel.js';
const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},events:[],proposals:[]};
test('decision relay rejects forged reflection/action and ignores cancelled replies',async()=>{
 const sent:any[]=[];const relay=new DecisionChannel(v=>sent.push(v));const abort=new AbortController();
 const first=relay.reflect(view,abort.signal);abort.abort();await assert.rejects(first,/cancelled/);
 const second=relay.reflect(view,new AbortController().signal);
 relay.receive({type:'decision-result',id:sent[0].id,output:{kind:'continue',reason:'old'}});
 const id=sent[2].id;
 assert.throws(()=>relay.receive({type:'decision-result',id,output:{kind:'move',actor:'other',x:1,z:1}}));
 relay.receive({type:'decision-result',id,output:{kind:'continue',reason:'native'}});
 assert.deepEqual(await second,{kind:'continue',reason:'native'});relay.close();
});
