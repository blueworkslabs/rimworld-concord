import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workKind} from '../src/production-planning.js';

test('moves cancel as moves; a native intent is never cancelled as ordered work',()=>{
 const p=(action:any)=>({id:'p',pawn:'A',status:'accepted',reason:'r',action}) as any;
 assert.equal(workKind(p({kind:'move',x:1,z:1})),'move');
 assert.equal(workKind(p({kind:'rescue',target:'X',bed:'b',x:1,z:1,maxTicks:600})),'rescue');
 assert.throws(()=>workKind(p({kind:'haul-zone'})),/not cancelled as ordered work/);
});
