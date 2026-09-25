import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retentionMenu,noReflectionEffects,retainedDomain} from '../trials/retention-policy.js';
import {interpretationCases} from '../trials/interpretation-cases.js';
import {readFileSync} from 'node:fs';
test('native retention requires shared evidence and identical optional reflection actions, unlike old empty control',()=>{
 const cases=interpretationCases();const control=structuredClone(cases[0]!.reflection),message=structuredClone(cases[1]!.reflection);
 assert.throws(()=>retentionMenu(control));assert.throws(()=>retentionMenu(message));
 for(const v of [control,message])v.character.experiences=[{event:{seq:1,tick:20,pawn:v.character.id,kind:'needs',detail:'Food',subject:'',value:.9},route:'appraisal'}] as any;
 assert.deepEqual(retentionMenu(control),retentionMenu(message));
 control.proposals=[cases[0]!.later.proposal];assert.throws(()=>retentionMenu(control));
});
test('native restore comparison and reflection guard detect private leaks and world effects',()=>{
 const d:any={characters:{A:{id:'A'},B:{id:'B'}},proposals:{},outcomes:{},crew:{entries:[]}};
 const world:any={actions:[],pawns:[{id:'A',health:1}]};
 const after=structuredClone(d);after.characters.A.outlook={notes:[]};
 noReflectionEffects(d,after,world,world,'A');retainedDomain(after,structuredClone(after));
 after.characters.B.outlook={notes:[]};assert.throws(()=>noReflectionEffects(d,after,world,world,'A'));assert.throws(()=>retainedDomain(after,d));
 assert.throws(()=>noReflectionEffects(d,d,world,{...world,actions:[{id:'job'}]},'A'));
});
test('historical interpretation bank remains unchanged by equal-menu native verification',()=>{
 assert.equal(interpretationCases()[0]!.reflection.character.experiences?.length??0,0);
});
import {retentionDeadline} from '../trials/retention-policy.js';
import {setTimeout as wait} from 'node:timers/promises';
test('host cancels a stuck request without any remote message and releases completed deadlines',async()=>{
 const lostTransport=retentionDeadline(10),completed=retentionDeadline(10);completed.dispose();
 await wait(25);assert(lostTransport.controller.signal.aborted);assert(!completed.controller.signal.aborted);lostTransport.dispose();
});

import {retentionProtocol,retentionRequest,indirectStatement} from '../trials/retention-policy.js';
test('retention protocol freezes old requests and binds indirect wording to a distinct policy',()=>{
 assert.equal(retentionProtocol('retention-game-v1').message,retentionRequest);
 assert.equal(retentionProtocol('retention-names-v1').message,retentionRequest);
 assert.equal(retentionRequest,'Could you leave this load of wood for me? I want to finish what I started. It matters to me.');
 assert.equal(retentionProtocol('retention-indirect-v1').message,indirectStatement);
 assert.equal(indirectStatement,'I started sorting that wood earlier. Seeing that little job through matters to me.');
 assert.throws(()=>retentionProtocol('unknown'));
});

test('restore must retain self-care identity and request, not merely its outcome',()=>{
 const before:any={characters:{},proposals:{},outcomes:{eat:{status:'completed',delivered:16}},selfCare:{eat:{id:'eat',pawn:'A',questionId:'q',action:{thing:'berries',count:16}}}};
 retainedDomain(structuredClone(before),before);
 const missing=structuredClone(before);delete missing.selfCare;assert.throws(()=>retainedDomain(missing,before));
 const changed=structuredClone(before);changed.selfCare.eat.action.count=25;assert.throws(()=>retainedDomain(changed,before));
});
