import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppraisalChannel } from '../src/appraisal-channel.js';
const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Haul',health:1},character:{id:'A',name:'Ada',memories:[]},event:{seq:1,tick:1,pawn:'A',kind:'food',detail:'low'}};
test('appraisal relay correlates responses and rejects malformed scores before resolution',async()=>{
 const sent:any[]=[];const channel=new AppraisalChannel(m=>sent.push(m));
 const p=channel.assess(view,new AbortController().signal);
 channel.receive({type:'appraisal-result',id:randomUUID(),result:{reflectionScore:0.9}});
 assert.throws(()=>channel.receive({type:'appraisal-result',id:sent[0].id,result:{reflectionScore:2}}));
 channel.receive({type:'appraisal-result',id:sent[0].id,result:{reflectionScore:0.2}});
 assert.equal((await p).reflectionScore,0.2);channel.close();
});
test('cancelled relay response cannot satisfy a new request; disconnect fails pending work',async()=>{
 const sent:any[]=[];const channel=new AppraisalChannel(m=>sent.push(m));const abort=new AbortController();
 const first=channel.assess(view,abort.signal);abort.abort();await assert.rejects(first,/cancelled/);
 assert.equal(sent[1].type,'appraisal-cancel');
 const next=channel.assess(view,new AbortController().signal);
 channel.receive({type:'appraisal-result',id:sent[0].id,result:{reflectionScore:0.9}});
 channel.close();await assert.rejects(next,/closed/);
 await assert.rejects(channel.assess(view,new AbortController().signal),/closed/);
});
test('relay never leaks remote error text and refuses concurrent or pre-aborted requests',async()=>{
 const sent:any[]=[];const channel=new AppraisalChannel(m=>sent.push(m));
 const first=channel.assess(view,new AbortController().signal);
 await assert.rejects(channel.assess(view,new AbortController().signal),/busy/);
 assert.throws(()=>channel.receive({type:'appraisal-result',id:sent[0].id,error:'arbitrary server error'}));
 channel.receive({type:'appraisal-result',id:sent[0].id,error:'Appraisal unavailable'});
 await assert.rejects(first,/unavailable/);
 assert.throws(()=>channel.assess(view,AbortSignal.abort()));assert.equal(sent.length,1);channel.close();
});
