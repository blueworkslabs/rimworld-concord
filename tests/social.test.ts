import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {crewReport} from '../src/crew-log.js';
import {SocialChoice,socialPrompt} from '../src/social.js';
import {claudeArgs,parseClaudeResult,CLAUDE_MODEL} from '../src/claude-decision.js';
import {DecisionChannel} from '../src/decision-channel.js';
import type {GameState,GameBridge,Receipt,ActionRequest} from '../src/protocol.js';
class Game implements GameBridge {
 data:GameState={world:'social',epoch:'first',ticks:100,paused:true,loaded:true,pawns:['A','B','C'].map((id,i)=>({id,name:id,x:i+1,z:1,job:'Wait',health:1,downed:false})),actions:[]};saved=new Map<string,GameState>();moves=0;visible=true;
 async state(){const g=structuredClone(this.data);for(const p of g.pawns)p.casualties={epoch:g.epoch,tick:g.ticks,mapId:1,radius:12,observations:[],visibleSubjects:this.visible?g.pawns.filter(q=>q!==p).map(q=>({target:q.id,downed:!!q.downed,inBed:false})):[]};return g;}
 async save(n:string){this.saved.set(n,structuredClone(this.data));return {sha256:'hash'};}async verify(){}async load(n:string){this.data=structuredClone(this.saved.get(n)!);this.data.epoch=randomUUID();}
 async move(r:ActionRequest):Promise<Receipt>{this.moves++;const receipt={id:r.id,actor:r.actor,status:'completed' as const,reason:'done',x:r.action.x,z:r.action.z};this.data.actions.push(receipt);return receipt;}
}
async function setup(){const g=new Game(),s=new Store(':memory:'),c=new Coordinator(s,g);await c.open();return {g,s,c};}
const say=(text:string)=>({name:'scripted',async speak(){return {choice:'say',text};}});
test('bounded addressed exchange is participant-only, no action or belief; later decision sees speech',async()=>{
 const {g,s,c}=await setup(),id=randomUUID();const before=await g.state();
 await c.openSocial(id,'A','B');let called=0;
 assert.equal((await c.socialTurn('A',id,{name:'private-view',async speak(v){called++;assert.equal(v.character.id,'A');assert.deepEqual(v.contact,{id:'B',name:'B'});assert.equal((v.contact as any).character,undefined);return {choice:'say',text:'I would rather rest. Could you help with wood?'};}})).status,'delivered');assert.equal(called,1);
 assert.equal(g.moves,0);assert.deepEqual(await g.state(),before);assert.equal(c.inspect().characters.C!.messages,undefined);assert.equal(c.inspect().characters.B!.outlook,undefined);
 let replies=0;assert.equal((await c.socialTurn('B',id,{name:'reply',async speak(v){replies++;assert.equal(v.exchange.messages.length,1);assert.equal(v.character.messages![0]!.from,'A');return {choice:'say',text:'I can consider it, but that is not consent to a job.'};}})).status,'delivered');assert.equal(replies,1);
 await assert.rejects(c.socialTurn('A',id,say('Third turn')));assert.equal(c.inspect().exchanges![id]!.messages.length,2);
 const p=await c.core().propose('B',{kind:'move',x:4,z:1},'Optional separate offer');let decisions=0;
 const answer=await c.pawn('B').decide(p.id,{name:'independent-choice',async decide(v){decisions++;assert.equal(v.character.messages!.length,2);return {kind:'refuse',reason:'I decline this separate offer'};}});assert.equal(answer.status,'refused');assert.equal(decisions,1);assert.equal(g.moves,0);
 const entries=crewReport(c.inspect(),100).entries.filter(e=>e.key.startsWith('social:'));assert.equal(entries.length,2);assert.deepEqual(entries.map(e=>[e.actor,e.recipient]),[['A','B'],['B','A']]);s.close();
});
test('silence on either turn ends encounter and delivers no reason, no retry',async()=>{
 for(const reply of [false,true]){const {c,s}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');if(reply)await c.socialTurn('A',id,say('Hello'));
 assert.equal((await c.socialTurn(reply?'B':'A',id,{name:'silent',async speak(){return {choice:'stay_silent'};}})).status,'silent');
 assert.equal(c.inspect().exchanges![id]!.messages.length,reply?1:0);assert.equal(crewReport(c.inspect(),100).entries.length,reply?1:0);await assert.rejects(c.socialTurn('A',id,say('again')));s.close();}
});
test('forged actor, oversized or action-bearing output cannot deliver or execute',async()=>{
 const {c,s,g}=await setup();for(const output of [{choice:'say',text:'x'.repeat(241)},{choice:'say',text:'Move now',from:'C'},{choice:'say',text:'Move now',action:{kind:'move',x:4,z:1}},{choice:'say',text:'   '}]){
 const id=randomUUID();await c.openSocial(id,'A','B');assert.equal((await c.socialTurn('A',id,{name:'invalid',async speak(){return output;}})).status,'failed');assert.equal(c.inspect().characters.B!.messages,undefined);
 }assert.equal(g.moves,0);s.close();
});
test('contact and expiry checked at both claim and delivery; no remote delivery',async()=>{
 for(const change of ['visibility','downed','expiry'] as const){const {c,s,g}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');
 assert.equal((await c.socialTurn('A',id,{name:'changes',async speak(){if(change==='visibility')g.visible=false;if(change==='downed')g.data.pawns[1]!.downed=true;if(change==='expiry')g.data.ticks+=3601;return {choice:'say',text:'Hello'};}})).status,'failed');assert.equal(c.inspect().characters.B!.messages,undefined);s.close();}
 const {c,s,g}=await setup();g.visible=false;await assert.rejects(c.openSocial(randomUUID(),'A','B'));s.close();
});
test('attempt is durable, participant-reserved and timeout cannot retry or deliver late',async()=>{
 const {c,s}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');let release!:(v:unknown)=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r);
 const turn=c.socialTurn('A',id,{name:'slow',async speak(){entered();return new Promise(r=>release=r);}},100);
 await ready;assert.equal(c.inspect().exchanges![id]!.status,'running');await assert.rejects(c.socialTurn('A',id,say('duplicate')));await assert.rejects(c.openSocial(randomUUID(),'B','C'));
 assert.equal((await turn).status,'interrupted');release({choice:'say',text:'Late'});assert.equal(c.inspect().characters.B!.messages,undefined);await assert.rejects(c.socialTurn('A',id,say('retry')));s.close();
});
test('paired restore retains delivered speech; rewind removes it and late result stays in old timeline',async()=>{
 const {c,s}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');await c.checkpoint('lab-concord-social-before');await c.socialTurn('A',id,say('Remember this claim, not a fact.'));
 await c.checkpoint('lab-concord-social-after');const messages=c.inspect().characters.B!.messages;await c.restore('lab-concord-social-after');assert.deepEqual(c.inspect().characters.B!.messages,messages);assert.equal(c.inspect().exchanges![id]!.status,'reply');
 await c.restore('lab-concord-social-before');assert.equal(c.inspect().characters.B!.messages,undefined);assert.equal(crewReport(c.inspect(),100).entries.length,0);
 let release!:(v:unknown)=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r);const turn=c.socialTurn('A',id,{name:'late',async speak(){entered();return new Promise(r=>release=r);}});await ready;await c.restore('lab-concord-social-before');release({choice:'say',text:'Discarded future'});assert.equal((await turn).status,'interrupted');assert.equal(c.inspect().characters.B!.messages,undefined);s.close();
});
test('idempotent encounter IDs, overlap and ownership fail closed; close preserves already-delivered speech',async()=>{
 const {c,s}=await setup(),id=randomUUID();const opened=await c.openSocial(id,'A','B');assert.deepEqual(await c.openSocial(id,'A','B'),opened);await assert.rejects(c.openSocial(id,'A','C'));await assert.rejects(c.openSocial(randomUUID(),'B','C'));await assert.rejects(c.socialTurn('C',id,say('forged')));
 await c.socialTurn('A',id,say('Hello'));await c.closeSocial(id);assert.equal(c.inspect().characters.B!.messages!.length,1);await assert.rejects(c.socialTurn('B',id,say('late reply')));s.close();
});
test('provider and relay expose only say/silence, with no work authority',async()=>{
 const args=claudeArgs('social'),schema=JSON.parse(args[args.indexOf('--json-schema')+1]!);assert.deepEqual(schema.required,['social']);assert.equal(schema.properties.social.oneOf.length,2);
 const event={type:'result',subtype:'success',is_error:false,total_cost_usd:0,modelUsage:{[CLAUDE_MODEL]:{}},num_turns:1,structured_output:{social:{choice:'say',text:'Could you help?'}}};assert.equal(parseClaudeResult(event,'social').output.choice,'say');assert.throws(()=>SocialChoice.parse({choice:'accept',reason:'yes'}));
 const {c,s}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');const requests:any[]=[];const channel=new DecisionChannel(m=>requests.push(m));const turn=c.socialTurn('A',id,channel);while(!requests.length)await new Promise(r=>setImmediate(r));const request=requests[0];assert.equal(request.mode,'social');assert.equal(socialPrompt(request.view).task,'social');channel.receive({type:'decision-result',id:request.id,output:{choice:'stay_silent'}});assert.equal((await turn).status,'silent');s.close();
});
