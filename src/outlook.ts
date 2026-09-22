import {z} from 'zod';
import type {NativeEvent,Character} from './protocol.js';
import type {SocialMessage} from './social.js';
/** Private interpretations, not game facts, native trait edits, speech or consent. */
const Note=z.object({kind:z.enum(['value','concern','stance']),text:z.string().trim().min(1).max(240),subject:z.string().min(1).max(120).optional(),evidenceSeqs:z.array(z.number().int().positive()).min(1).max(3)}).strict();
const MessageNote=Note.omit({evidenceSeqs:true}).extend({messageIds:z.array(z.string().min(1).max(120)).min(1).max(3)}).strict();
export const OutlookUpdate=z.object({expectedRevision:z.number().int().nonnegative(),notes:z.array(z.union([Note,MessageNote])).max(4)}).strict();
export type OutlookUpdate=z.infer<typeof OutlookUpdate>;
export type PrivateOutlook={revision:number;updatedTick:number;notes:{kind:'value'|'concern'|'stance';text:string;subject?:string;evidence:NativeEvent[];messages?:SocialMessage[]}[]};
export function outlookEvidence(character:Character):NativeEvent[]{
 const bySeq=new Map<number,NativeEvent>();
 for(const e of [...(character.outlook?.notes.flatMap(n=>n.evidence)??[]),...(character.experiences??[]).map(x=>x.event)])if(e.pawn===character.id)bySeq.set(e.seq,e);
 return [...bySeq.values()];
}
/** Only received speech is eligible; authored/outgoing words are not evidence of another's stance.
 * Retain exact attribution even after the recent correspondence window rolls over. */
export function outlookMessages(character:Character):SocialMessage[]{
 const byId=new Map<string,SocialMessage>();
 for(const m of [...(character.outlook?.notes.flatMap(n=>n.messages??[])??[]),...(character.messages??[])])
  if(m.to===character.id&&m.from!==character.id)byId.set(m.id,m);
 return [...byId.values()];
}
export function reviseOutlook(character:Character,update:OutlookUpdate,tick:number):PrivateOutlook{
 const u=OutlookUpdate.parse(update);if(u.expectedRevision!==(character.outlook?.revision??0))throw Error('Private outlook revision superseded');
 const evidence=outlookEvidence(character);
 const notes=u.notes.map(n=>{
  if('messageIds' in n){
   if(new Set(n.messageIds).size!==n.messageIds.length)throw Error('Duplicate message evidence');
   const available=outlookMessages(character);
   const messages=n.messageIds.map(id=>{const m=available.find(m=>m.id===id);if(!m)throw Error('Message evidence outside received perspective');return structuredClone(m);});
   if(n.kind==='stance'){if(!n.subject||!messages.some(m=>m.from===n.subject))throw Error('Message stance must name a cited sender');}
   else if(n.subject!==undefined)throw Error('Only interpersonal stances name a subject');
   return {kind:n.kind,text:n.text,...(n.subject?{subject:n.subject}:{}),evidence:[],messages};
  }
  if(new Set(n.evidenceSeqs).size!==n.evidenceSeqs.length)throw Error('Duplicate outlook evidence');
  const refs=n.evidenceSeqs.map(seq=>{const e=evidence.find(e=>e.seq===seq);if(!e)throw Error('Outlook evidence outside own perspective');return structuredClone(e);});
  if(n.kind==='stance'){if(!n.subject||!refs.some(e=>e.subject===n.subject))throw Error('Stance needs an explicitly observed subject');}
  else if(n.subject!==undefined)throw Error('Only interpersonal stances name a subject');
  return {kind:n.kind,text:n.text,...(n.subject?{subject:n.subject}:{}),evidence:refs};
 });
 return {revision:u.expectedRevision+1,updatedTick:tick,notes};
}
