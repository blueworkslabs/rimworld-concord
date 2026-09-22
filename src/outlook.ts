import {z} from 'zod';
import type {NativeEvent,Character} from './protocol.js';
/** Private interpretations, not game facts, native trait edits, speech or consent. */
const Note=z.object({kind:z.enum(['value','concern','stance']),text:z.string().trim().min(1).max(240),subject:z.string().min(1).max(120).optional(),evidenceSeqs:z.array(z.number().int().positive()).min(1).max(3)}).strict();
export const OutlookUpdate=z.object({expectedRevision:z.number().int().nonnegative(),notes:z.array(Note).max(4)}).strict();
export type OutlookUpdate=z.infer<typeof OutlookUpdate>;
export type PrivateOutlook={revision:number;updatedTick:number;notes:{kind:'value'|'concern'|'stance';text:string;subject?:string;evidence:NativeEvent[]}[]};
export function outlookEvidence(character:Character):NativeEvent[]{
 const bySeq=new Map<number,NativeEvent>();
 for(const e of [...(character.outlook?.notes.flatMap(n=>n.evidence)??[]),...(character.experiences??[]).map(x=>x.event)])if(e.pawn===character.id)bySeq.set(e.seq,e);
 return [...bySeq.values()];
}
export function reviseOutlook(character:Character,update:OutlookUpdate,tick:number):PrivateOutlook{
 const u=OutlookUpdate.parse(update);if(u.expectedRevision!==(character.outlook?.revision??0))throw Error('Private outlook revision superseded');
 const evidence=outlookEvidence(character);
 const notes=u.notes.map(n=>{
  if(new Set(n.evidenceSeqs).size!==n.evidenceSeqs.length)throw Error('Duplicate outlook evidence');
  const refs=n.evidenceSeqs.map(seq=>{const e=evidence.find(e=>e.seq===seq);if(!e)throw Error('Outlook evidence outside own perspective');return structuredClone(e);});
  if(n.kind==='stance'){if(!n.subject||!refs.some(e=>e.subject===n.subject))throw Error('Stance needs an explicitly observed subject');}
  else if(n.subject!==undefined)throw Error('Only interpersonal stances name a subject');
  return {kind:n.kind,text:n.text,...(n.subject?{subject:n.subject}:{}),evidence:refs};
 });
 return {revision:u.expectedRevision+1,updatedTick:tick,notes};
}
