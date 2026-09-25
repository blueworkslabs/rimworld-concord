import {z} from 'zod';
import {randomUUID} from 'node:crypto';

/** The harness's action half, v1 (docs/HARNESS.md): the player's controls minus draft, one wire
 * command each, answered by a receipt. `ok:true` is the game's acceptance (an ID), not completed
 * work; `ok:false` carries the game's own refusal (`source:'game'`) or a harness validation error
 * (`source:'harness'`). A repeated requestId returns the first receipt and creates nothing new. */
const id=z.number().int().nonnegative();
const cell={x:z.number().int().nonnegative(),z:z.number().int().nonnegative()};
export const Action=z.discriminatedUnion('action',[
  z.object({action:z.literal('place_blueprint'),def:z.string().min(1),...cell,rot:z.number().int().min(0).max(3).optional(),stuff:z.string().min(1).optional()}).strict(),
  z.object({action:z.literal('designate'),kind:z.enum(['deconstruct','cancel','mine','harvest','cut','hunt','haul']),thing:id.optional(),x:cell.x.optional(),z:cell.z.optional()}).strict(),
  z.object({action:z.literal('zone'),kind:z.enum(['stockpile','growing']).optional(),zone:id.optional(),cells:z.array(z.object(cell)).max(400).default([]),label:z.string().max(60).optional(),
    priority:z.enum(['Low','Normal','Preferred','Important','Critical']).optional(),allow:z.array(z.string().min(1)).max(200).optional(),plant:z.string().min(1).optional()}).strict(),
  z.object({action:z.literal('bill'),bench:id,recipe:z.string().min(1),repeat:z.enum(['count','forever','until']),count:z.number().int().min(1).max(999).optional(),radius:z.number().int().min(1).max(999).optional()}).strict(),
  z.object({action:z.literal('bill_edit'),bill:z.string().min(1),repeat:z.enum(['count','forever','until']).optional(),count:z.number().int().min(1).max(999).optional(),radius:z.number().int().min(1).max(999).optional(),suspended:z.boolean().optional()}).strict(),
  z.object({action:z.literal('bill_delete'),bill:z.string().min(1)}).strict(),
  z.object({action:z.literal('work_priority'),pawn:id,work:z.string().min(1),priority:z.number().int().min(0).max(4)}).strict(),
  z.object({action:z.literal('schedule'),pawn:id,hour:z.number().int().min(0).max(23),assignment:z.enum(['Anything','Work','Joy','Sleep','Meditate'])}).strict(),
  z.object({action:z.literal('forbid'),thing:id,forbidden:z.boolean()}).strict(),
  z.object({action:z.literal('allow_area'),pawn:id,area:z.string().min(1).nullable()}).strict(),
]).superRefine((a,ctx)=>{
  if(a.action==='designate'&&a.thing===undefined&&(a.x===undefined||a.z===undefined))ctx.addIssue({code:'custom',message:'designate needs a thing or a cell'});
  if(a.action==='zone'&&a.zone===undefined&&(a.kind===undefined||a.cells.length===0))ctx.addIssue({code:'custom',message:'a new zone needs a kind and cells'});
  if(a.action==='bill'&&a.repeat!=='forever'&&a.count===undefined)ctx.addIssue({code:'custom',message:'count and until bills need a count'});
});
export type Action=z.infer<typeof Action>;
export const Receipt=z.object({seq:z.number().int(),tick:z.number().int(),requestId:z.string(),action:z.string().nullable(),ok:z.boolean(),
  id:z.string().nullable(),reason:z.string().nullable(),source:z.string().nullable(),detail:z.string().nullable()});
export type Receipt=z.infer<typeof Receipt>;

/** The mod's Request fields for one action (the wire is flat, as for every bridge op). */
export function wire(raw:unknown,requestId:string=randomUUID()):Record<string,unknown>{
  if(!requestId||requestId.length>80)throw Error('requestId must be 1-80 characters');
  const a=Action.parse(raw);const base={op:'act',requestId,action:a.action};
  switch(a.action){
    case 'place_blueprint':return {...base,def:a.def,x:a.x,z:a.z,rot:a.rot??-1,...(a.stuff?{stuff:a.stuff}:{})};
    case 'designate':return {...base,mode:a.kind,thingId:a.thing??-1,x:a.x??0,z:a.z??0};
    case 'zone':return {...base,mode:a.kind??'',zoneId:a.zone??-1,cells:a.cells.map((c:{x:number;z:number})=>`${c.x},${c.z}`).join(';'),...(a.label?{label:a.label}:{}),
      ...(a.priority?{storage:a.priority}:{}),...(a.allow?{allow:a.allow}:{}),...(a.plant?{def:a.plant}:{})};
    case 'bill':return {...base,thingId:a.bench,recipe:a.recipe,mode:a.repeat,count:a.count??0,radius:a.radius??-1};
    case 'bill_edit':return {...base,target:a.bill,mode:a.repeat??'',count:a.count??0,radius:a.radius??-1,suspend:a.suspended===undefined?-1:a.suspended?1:0};
    case 'bill_delete':return {...base,target:a.bill};
    case 'work_priority':return {...base,thingId:a.pawn,work:a.work,priority:a.priority};
    case 'schedule':return {...base,thingId:a.pawn,hour:a.hour,mode:a.assignment};
    case 'forbid':return {...base,thingId:a.thing,flag:a.forbidden};
    case 'allow_area':return {...base,thingId:a.pawn,label:a.area??''};
  }
  throw Error('unreachable');
}
