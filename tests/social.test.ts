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
 assert.equal((await c.socialTurn('A',id,{name:'changes',async speak(){if(change==='visibility')g.visible=false;if(change==='downed')g.data.pawns[1]!.downed=true;if(change==='expiry')g.data.ticks+=3601;return {choice:'say',text:'Hello'};}})).status,change==='expiry'?'interrupted':'failed');assert.equal(c.inspect().characters.B!.messages,undefined);s.close();}
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

test('lost contact before claim closes the encounter rather than allowing a later retry',async()=>{
 const {c,s,g}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');g.visible=false;await assert.rejects(c.socialTurn('A',id,say('not delivered')));assert.equal(c.inspect().exchanges![id]!.status,'closed');g.visible=true;await assert.rejects(c.socialTurn('A',id,say('retry')));assert.equal(c.inspect().characters.B!.messages,undefined);s.close();
});
test('expired unanswered encounters no longer block participants, while IDs remain retired',async()=>{
 for(const reply of [false,true]){const {c,s,g}=await setup(),id=randomUUID();await c.openSocial(id,'A','B');if(reply)await c.socialTurn('A',id,say('Hello'));g.data.ticks+=3601;await c.observe();assert.equal(c.inspect().exchanges![id]!.status,'closed');assert.equal((await c.openSocial(id,'A','B')).status,'closed');await c.openSocial(randomUUID(),'B','C');s.close();}
});
import {socialCleanup} from '../trials/social-cleanup.js';
test('native work cleanup is attempted even when pause and conversation closure both fail',async()=>{
 const calls:string[]=[];const cleanup=await socialCleanup(async()=>{calls.push('pause');throw Error('transport');},async()=>{calls.push('close');throw Error('lost contact response');},async()=>{calls.push('stop');return {errors:[]};});assert.deepEqual(calls,['pause','close','stop']);assert.equal(cleanup.errors.length,2);assert.deepEqual(cleanup.work,{errors:[]});
});

import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {reviseOutlook,outlookMessages} from '../src/outlook.js';
import {reflectionChoiceSchema,ReflectionChoice,validateReflectionChoice} from '../src/reflection-choice.js';
test('received-message interpretation is private, survives SQLite reopen, revises after correction and rewinds',async()=>{
 const g=new Game(),file=mkdtempSync(tmpdir()+'/received-outlook-')+'/state.db';let s=new Store(file),c=new Coordinator(s,g);await c.open();
 const event=()=>{g.data.events??=[];g.data.events.push({seq:(g.data.eventSeq??0)+1,tick:++g.data.ticks,pawn:'B',kind:'memory',detail:'DeepTalk'});g.data.eventSeq=(g.data.eventSeq??0)+1;};
 const deliver=async(text:string)=>{const id=randomUUID();await c.openSocial(id,'A','B');const r=await c.socialTurn('A',id,say(text));assert.equal(r.status,'delivered');await c.closeSocial(id);return c.inspect().characters.B!.messages!.at(-1)!;};
 const message=await deliver('I would like to finish this load myself.');await c.checkpoint('lab-concord-before-interpretation');
 const before=crewReport(c.inspect(),g.data.ticks).entries;event();let reflections=0;
 const result=await c.attend('B',{name:'interpret',async reflect(v){reflections++;assert.equal(v.character.outlook,undefined);return {kind:'revise_outlook',reason:'Private assessment',update:{expectedRevision:0,notes:[{kind:'stance',subject:'A',text:'A asked to finish the load; I may leave it for them.',messageIds:[message.id]}]}};}},undefined,{cooldownTicks:0});
 assert.equal(reflections,1);assert.equal(result.status,'continued');assert.equal(g.moves,0);assert.deepEqual(g.data.actions,[]);
 const outlook=c.inspect().characters.B!.outlook!;assert.deepEqual(outlook.notes[0]!.messages,[message]);assert.deepEqual(outlook.notes[0]!.evidence,[]);
 for(const id of ['A','C'])assert.equal(c.inspect().characters[id]!.outlook,undefined);
 assert.deepEqual(crewReport(c.inspect(),g.data.ticks).entries,before);
 await c.checkpoint('lab-concord-interpretation');s.close();s=new Store(file);c=new Coordinator(s,g);await c.open();assert.deepEqual(c.inspect().characters.B!.outlook,outlook);
 let decisions=0;const proposal=await c.core().propose('B',{kind:'move',x:4,z:1},'Optional separate work');const answer=await c.pawn('B').decide(proposal.id,{name:'later-choice',async decide(v){decisions++;assert.deepEqual(v.character.outlook,outlook);return {kind:'refuse',reason:'My independent choice'};}});assert.equal(decisions,1);assert.equal(answer.status,'refused');assert.equal(g.moves,0);
 let other=0;const own=await c.core().propose('C',{kind:'move',x:4,z:1},'Optional');assert.equal((await c.pawn('C').decide(own.id,{name:'third',async decide(v){other++;assert.equal(v.character.outlook,undefined);assert.equal(v.character.messages,undefined);return {kind:'refuse',reason:'Not now'};}})).status,'refused');assert.equal(other,1);
 // More delivered speech evicts the original from the 16-message window, not its source snapshot.
 for(let i=0;i<16;i++)await deliver('Routine message '+i);
 assert(!c.inspect().characters.B!.messages!.some(m=>m.id===message.id));assert(outlookMessages(c.inspect().characters.B!).some(m=>m.id===message.id));
 const correction=await deliver('Correction: I no longer want to finish it; please take it if you wish.');event();
 assert.equal((await c.attend('B',{name:'revise',async reflect(){return {kind:'revise_outlook',reason:'A newer report, not an order',update:{expectedRevision:1,notes:[{kind:'stance',subject:'A',text:'A withdrew the request. I can reconsider.',messageIds:[message.id,correction.id]}]}};}},undefined,{cooldownTicks:0})).status,'continued');assert.equal(c.inspect().characters.B!.outlook!.revision,2);
 event();assert.equal((await c.attend('B',{name:'remove',async reflect(){return {kind:'revise_outlook',reason:'No current concern',update:{expectedRevision:2,notes:[]}};}},undefined,{cooldownTicks:0})).status,'continued');assert.deepEqual(c.inspect().characters.B!.outlook!.notes,[]);
 await c.restore('lab-concord-interpretation');assert.deepEqual(c.inspect().characters.B!.outlook,outlook);
 await c.restore('lab-concord-before-interpretation');assert.equal(c.inspect().characters.B!.outlook,undefined);event();
 let release!:(v:unknown)=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r);const pending=c.attend('B',{name:'late',async reflect(){entered();return new Promise(r=>release=r);}},undefined,{cooldownTicks:0});await ready;await c.restore('lab-concord-before-interpretation');release({kind:'revise_outlook',reason:'Old future',update:{expectedRevision:0,notes:[{kind:'concern',text:'Not applicable',messageIds:[message.id]}]}});assert.equal((await pending).status,'interrupted');assert.equal(c.inspect().characters.B!.outlook,undefined);s.close();
});
test('message evidence rejects foreign, outgoing, forged, duplicate and unrelated-subject citations',()=>{
 const message={id:'received',exchangeId:'exchange',tick:1,from:'B',to:'A',text:'C wants something, according to me.'};
 const character={id:'A',name:'Ada',memories:[],messages:[message,{...message,id:'outgoing',from:'A',to:'B'},{...message,id:'foreign',from:'B',to:'C'}]};
 const note={kind:'stance' as const,text:'B says something about C; I am uncertain.',subject:'B',messageIds:['received']};
 for(const n of [{...note,messageIds:['outgoing']},{...note,messageIds:['foreign']},{...note,messageIds:['invented']},{...note,messageIds:['received','received']},{...note,subject:'C'},{...note,kind:'concern'},{...note,evidenceSeqs:[1]}])assert.throws(()=>reviseOutlook(character,{expectedRevision:0,notes:[n]} as any,2));
 assert.throws(()=>reviseOutlook(character,{expectedRevision:1,notes:[note]},2));
 const view={character,pawn:{id:'A',name:'Ada',x:1,z:1,health:1,job:'Wait'},events:[],proposals:[]};
 const schema=reflectionChoiceSchema(view,{}),u:any=schema.oneOf.find((x:any)=>x.properties.choice.const==='revise_private_outlook');
 assert(u);const notes=u.properties.update.properties.notes.items.oneOf;assert.equal(notes.length,2);assert.deepEqual(notes[0].properties.messageIds.items.enum,['received']);assert.deepEqual(notes[1].properties.subject.enum,['B']);assert(!JSON.stringify(schema).includes('"enum":[]'));
 const choice=ReflectionChoice.parse({choice:'revise_private_outlook',reason:'Optional interpretation',update:{expectedRevision:0,notes:[note]}});validateReflectionChoice(choice,view);
 const out=reviseOutlook(character,{expectedRevision:0,notes:[note]},2);message.text='later mutation';assert.notEqual(out.notes[0]!.messages![0]!.text,message.text);
});

test('delivered display names survive note retention and reopen without revealing a third pawn',async()=>{
 const g=new Game();g.data.pawns[0]!.name='Ada';g.data.pawns[1]!.name='Bea';g.data.pawns[2]!.name='Hidden';
 const file=mkdtempSync(tmpdir()+'/message-names-')+'/state.db';let s=new Store(file),c=new Coordinator(s,g);await c.open();
 const id=randomUUID();await c.openSocial(id,'A','B');assert.equal((await c.socialTurn('A',id,say('Please leave the wood.'))).status,'delivered');await c.closeSocial(id);
 const m=c.inspect().characters.B!.messages![0]!;assert.equal(m.fromName,'Ada');assert.equal(m.toName,'Bea');assert.equal(c.inspect().characters.C!.messages,undefined);
 const o=reviseOutlook(c.inspect().characters.B!,{expectedRevision:0,notes:[{kind:'stance',subject:'A',text:'Consider the request',messageIds:[m.id]}]},100);assert.equal(o.notes[0]!.messages![0]!.fromName,'Ada');
 await c.checkpoint('lab-concord-names');s.close();s=new Store(file);c=new Coordinator(s,g);await c.open();assert.deepEqual(c.inspect().characters.B!.messages![0],m);
 // Label is a delivery snapshot, not a retroactive rewrite after a rename.
 g.data.pawns[0]!.name='Changed';assert.equal(c.inspect().characters.B!.messages![0]!.fromName,'Ada');await c.restore('lab-concord-names');assert.deepEqual(c.inspect().characters.B!.messages![0],m);s.close();
});
