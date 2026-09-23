import type {Domain,Proposal} from './protocol.js';
/** Only pawn-owned deferred offers; a request is one invitation, not renewed consent. */
export function deferredOffers(d:Domain,pawn:string):Proposal[]{
 const ch=d.characters[pawn],requests=Object.values(d.reoffers??{}),proposals=Object.values(d.proposals);
 if(!ch||ch.commitment||ch.intention||requests.some(r=>r.pawn===pawn&&r.status==='pending')||proposals.some(p=>p.pawn===pawn&&(p.status==='pending'||p.status==='countered'&&!p.replyId||p.standing?.status==='running')))return [];
 return proposals.filter(p=>p.pawn===pawn&&p.status==='deferred'&&p.action.kind!=='move'&&!requests.some(r=>r.deferredId===p.id)).slice(-8);
}
