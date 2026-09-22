import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReflectionPacer} from '../src/reflection-pacing.js';
const routine={pawn:'A',events:[{seq:1,kind:'memory'}],needsAppraisal:false};
const urgent={...routine,events:[{seq:2,kind:'casualty'}]};
test('ordinary reflections have spaced slots, emergencies have separate reserves, unused intervals do not bank',()=>{
 let now=0;const p=new ReflectionPacer({windowMs:300000,routineSlots:4,urgentSlots:2},()=>now);
 const first=p.claim(routine)!;assert(first.consume());first.release();assert(!p.canClaim(routine));
 for(let i=0;i<2;i++){const lease=p.claim(urgent)!;assert(lease.consume());lease.release();}assert(!p.canClaim(urgent));
 now=75000;assert(p.claim(routine)!.consume());assert(!p.canClaim(routine));
 now=225000;assert(p.claim(routine)!.consume());assert(!p.canClaim(routine)); // Unused 150s interval was not banked.
 assert.equal(p.status().used,5);now=300000;assert(!p.canClaim(urgent));
});
test('appraisal-only releases admission, consumed failures cannot refund, expiry prevents late reflection',()=>{
 let now=0;const p=new ReflectionPacer({windowMs:100,routineSlots:1,urgentSlots:0},()=>now);
 const a=p.claim(routine)!;assert(!p.canClaim(routine));a.release();assert(p.canClaim(routine));assert(!a.consume());
 const b=p.claim(routine)!;assert(b.consume());assert(!b.consume());b.release();assert(!p.canClaim(routine));
 const q=new ReflectionPacer({windowMs:100,routineSlots:1,urgentSlots:0},()=>now),c=q.claim(routine)!;
 now=100;assert(!c.consume());c.release();assert.equal(q.status().used,0);assert.equal(q.status().held,0);
});
