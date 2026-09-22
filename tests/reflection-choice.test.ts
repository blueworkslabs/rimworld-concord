import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReflectionChoice,reflectionChoices,reflectionFromChoice,validateReflectionChoice} from '../src/reflection-choice.js';
import {claudeArgs,parseClaudeResult,CLAUDE_MODEL} from '../src/claude-decision.js';
import type {AttentionView} from '../src/attention.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
export function choiceView():AttentionView{return {pawn:{id:'A',name:'Ada',x:1,z:1,job:'Concord_Haul',health:1},character:{id:'A',name:'Ada',memories:[],intention:id},events:[],proposals:[],intention:{id,pawn:'A',reason:'Supply work',status:'accepted',action:{kind:'haul',thing:'steel',x:4,z:5,count:10,trips:3,maxTicks:600},standing:{status:'running',deadline:600,steps:[]}}};}
test('explicit reflection choices preserve effect and never reinterpret contradictory prose',()=>{
 const view=choiceView();
 const keep=ReflectionChoice.parse({choice:'keep_current_activity',reason:'I will withdraw and rescue instead'});
 validateReflectionChoice(keep,view);assert.equal(reflectionFromChoice(keep).kind,'continue');
 const withdraw=ReflectionChoice.parse({choice:'withdraw_current_agreement',agreementId:id,reason:'End this agreement'});
 validateReflectionChoice(withdraw,view);assert.deepEqual(reflectionFromChoice(withdraw),{kind:'withdraw',reason:'End this agreement'});
 for(const raw of [{kind:'continue',reason:'old provider vocabulary'}, {...withdraw,agreementId:undefined},{...keep,action:{kind:'rescue'}},{...keep,actor:'B'}])assert(!ReflectionChoice.safeParse(raw).success);
});
test('only the supplied running agreement or eligible pending proposal can be selected',()=>{
 const view=choiceView(),end={choice:'withdraw_current_agreement' as const,agreementId:id,reason:'End work'};
 assert.throws(()=>validateReflectionChoice({...end,agreementId:other},view));
 for(const change of ['owner','id','state','absent']){
  const v=structuredClone(view);if(change==='owner')v.intention!.pawn='B';if(change==='id')v.character.intention=other;if(change==='state')v.intention!.standing!.status='completed';if(change==='absent')delete v.intention;
  assert.throws(()=>validateReflectionChoice(end,v));
 }
 const v=choiceView();delete v.intention;delete v.character.intention;
 v.proposals=[{id:other,pawn:'A',reason:'Offer',status:'pending',action:{kind:'move',x:2,z:2}}];
 const answer=ReflectionChoice.parse({choice:'answer_pending_proposal',proposalId:other,decision:{kind:'refuse',reason:'No'}});
 validateReflectionChoice(answer,v);assert.equal(reflectionFromChoice(answer).kind,'proposal');
 assert.throws(()=>validateReflectionChoice(answer,view));v.character.commitment='active';assert.throws(()=>validateReflectionChoice(answer,v));
 assert.deepEqual(reflectionChoices(v).map(c=>c.choice),['keep_current_activity']);
});
test('provider schema names concrete effects and parsing preserves the original choice',()=>{
 const args=claudeArgs('reflection',choiceView()),schema=JSON.parse(args[args.indexOf('--json-schema')+1]!);
 assert(schema.properties.reflection.oneOf.every((o:any)=>o.description&&o.required.includes('choice')));
 const choice={choice:'withdraw_current_agreement',agreementId:id,reason:'No replacement work authorized'};
 const parsed=parseClaudeResult({type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:1,modelUsage:{[CLAUDE_MODEL]:{}},structured_output:{reflection:choice}},'reflection');
 assert.deepEqual(parsed.providerChoice,choice);assert.equal(parsed.output.kind,'withdraw');
});
test('requesting a rescue alternative preserves the current agreement and only names an observed subject',()=>{
 const view=choiceView();view.pawn.casualties={epoch:'e',tick:1,mapId:1,radius:12,observations:[{target:'B',name:'Bee',x:4,z:5}]};
 const request=ReflectionChoice.parse({choice:'request_rescue_alternative',agreementId:id,target:'B',reason:'Can we discuss helping?'});
 validateReflectionChoice(request,view);assert.deepEqual(reflectionFromChoice(request),{kind:'request_rescue',agreementId:id,target:'B',reason:'Can we discuss helping?'});
 assert.throws(()=>validateReflectionChoice({...request,target:'unseen'} as any,view));
 view.requests=[{id:other,pawn:'A',agreementId:id,target:'B',mapId:1,reason:'Already asked',status:'declined'}];
 assert.throws(()=>validateReflectionChoice(request,view));assert(!reflectionChoices(view).some(c=>c.choice==='request_rescue_alternative'));
});

function branches(view:AttentionView):any[]{
 const args=claudeArgs('reflection',view);
 return JSON.parse(args[args.indexOf('--json-schema')+1]!).properties.reflection.oneOf;
}
test('reflection schema omits unavailable choices and binds exact agreement and target IDs',()=>{
 assert.throws(()=>claudeArgs('reflection'),/requires/);
 const v=choiceView();v.pawn.casualties={epoch:'e',tick:1,mapId:1,radius:12,observations:[{target:'B',name:'Bee',x:4,z:5}]};
 const b=branches(v);assert.deepEqual(b.map(x=>x.properties.choice.const),reflectionChoices(v).map(x=>x.choice));
 assert.equal(b.find(x=>x.properties.choice.const==='withdraw_current_agreement').properties.agreementId.const,id);
 const request=b.find(x=>x.properties.choice.const==='request_rescue_alternative');assert.equal(request.properties.agreementId.const,id);assert.deepEqual(request.properties.target.enum,['B']);
 delete v.intention;delete v.character.intention;
 assert.deepEqual(branches(v).map(x=>x.properties.choice.const),['keep_current_activity']);
 v.proposals=[{id:other,pawn:'A',reason:'Offer',status:'pending',action:{kind:'move',x:2,z:2}}];
 assert.deepEqual(branches(v).find(x=>x.properties.choice.const==='answer_pending_proposal').properties.proposalId.enum,[other]);
 v.proposals[0]!.status='refused';assert.deepEqual(branches(v).map(x=>x.properties.choice.const),['keep_current_activity']);
});
test('outlook schema binds revision and owned evidence, requires stance subjects, retains optional continuation',()=>{
 const v=choiceView();v.character.experiences=[{event:{seq:7,epoch:'e',tick:1,pawn:'A',kind:'casualty',subject:'B',summary:'Saw Bee downed'},route:'deliberation'} as any,{event:{seq:8,epoch:'e',tick:2,pawn:'other',kind:'casualty',subject:'secret',summary:'Not ours'},route:'deliberation'} as any];
 const b=branches(v),u=b.find(x=>x.properties.choice.const==='revise_private_outlook').properties.update;
 assert(b.some(x=>x.properties.choice.const==='keep_current_activity'));
 assert.equal(u.properties.expectedRevision.const,0);
 const notes=u.properties.notes.items.oneOf;assert.deepEqual(notes[0].properties.evidenceSeqs.items.enum,[7]);
 assert.deepEqual(notes[1].properties.subject.enum,['B']);assert(notes[1].required.includes('subject'));assert(!notes[0].properties.subject);
 const stance=ReflectionChoice.parse({choice:'revise_private_outlook',reason:'A concern',update:{expectedRevision:0,notes:[{kind:'stance',text:'Worried',subject:'B',evidenceSeqs:[7]}]}});
 assert.equal(stance.choice,'revise_private_outlook');if(stance.choice!=='revise_private_outlook')throw Error();
 validateReflectionChoice(stance,v);
 assert.throws(()=>validateReflectionChoice({...stance,update:{expectedRevision:1,notes:[]}},v));
 v.character.outlook={revision:2,updatedTick:3,notes:[]};v.character.experiences=[];
 const empty=branches(v).find(x=>x.properties.choice.const==='revise_private_outlook').properties.update;
 assert.equal(empty.properties.expectedRevision.const,2);assert.equal(empty.properties.notes.maxItems,0);
 validateReflectionChoice({choice:'revise_private_outlook',reason:'Keep it empty',update:{expectedRevision:2,notes:[]}},v);
});
test('schema uses retained evidence after eviction but runtime rejects unrelated stance citations',()=>{
 const v=choiceView();const event={seq:7,epoch:'e',tick:1,pawn:'A',kind:'casualty',subject:'B',summary:'Saw Bee downed'} as any;
 v.character.outlook={revision:3,updatedTick:2,notes:[{kind:'stance',text:'Concern',subject:'B',evidence:[event]}]};
 v.character.experiences=[{event:{...event,seq:9,subject:'C'},route:'deliberation'} as any];
 const u=branches(v).find(x=>x.properties.choice.const==='revise_private_outlook').properties.update;
 assert.equal(u.properties.expectedRevision.const,3);assert.deepEqual(u.properties.notes.items.oneOf[0].properties.evidenceSeqs.items.enum,[7,9]);
 assert.throws(()=>validateReflectionChoice({choice:'revise_private_outlook',reason:'Wrong reference',update:{expectedRevision:3,notes:[{kind:'stance',subject:'B',text:'Concern',evidenceSeqs:[9]}]}},v),/subject/);
});
