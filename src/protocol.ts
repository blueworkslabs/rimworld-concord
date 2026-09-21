import { z } from 'zod';

export const Move = z.object({kind:z.literal('move'), x:z.number().int().nonnegative(), z:z.number().int().nonnegative()}).strict();
export type Move = z.infer<typeof Move>;
export const Decision = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('accept'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('refuse'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('counter'),reason:z.string().min(1).max(1000),action:Move}).strict()
]);
export type Decision = z.infer<typeof Decision>;
export type Outcome = 'started'|'completed'|'failed'|'interrupted';
export type Pawn = {id:string;name:string;x:number;z:number;job:string;health:number;facts?:{key:string;value:string;level:number}[]};
export type Receipt = {id:string;actor:string;status:Outcome;reason:string;x:number;z:number};
export type GameState = {
  world:string;epoch:string;ticks:number;paused:boolean;loaded:boolean;
  pawns:Pawn[];actions:Receipt[];events?:NativeEvent[];eventSeq?:number;
};
export type NativeEvent = {seq:number;tick:number;pawn:string;kind:string;detail:string};
export type Attention = {event:NativeEvent;route:'native'|'appraisal'|'deliberation'};
export type Activity = {epoch:string;actor:string;activityId:string;ttlMs:number};
export type ActionRequest = {id:string;epoch:string;actor:string;action:Move};
/** Admin capability: held by the coordinator/runner only, never provided to a character backend. */
export interface GameBridge {
  state():Promise<GameState>;
  setActivity?(activity:Activity):Promise<void>;
  move(request:ActionRequest):Promise<Receipt>;
  save(name:string):Promise<{sha256:string}>;
  load(name:string):Promise<void>;
  verify(name:string,hash:string):Promise<void>;
}
export type Character = {id:string;name:string;memories:string[];commitment?:string;experiences?:Attention[]};
export type Proposal = {id:string;pawn:string;action:Move;reason:string;status:'pending'|'accepted'|'refused'|'countered';decision?:Decision;actionId?:string};
export type Perspective = {pawn:Pawn;character:Character;proposal:Proposal};
export interface DecisionBackend {
  readonly name:string;
  decide(view:Perspective, signal:AbortSignal):Promise<unknown>;
}
export type Domain = {
  eventCursor?:number;
  schema:1;world:string;epoch:string;branch:string;
  characters:Record<string,Character>;proposals:Record<string,Proposal>;
  outcomes:Record<string,Receipt>;
};
export type Event = {branch:string;kind:string;actor:string;data:unknown};
