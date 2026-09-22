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
 const args=claudeArgs('reflection'),schema=JSON.parse(args[args.indexOf('--json-schema')+1]!);
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
