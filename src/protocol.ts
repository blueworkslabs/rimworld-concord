import type {PrivateOutlook} from './outlook.js';
import type {SocialMessage,SocialExchange} from './social.js';
import type {AgreementProgress,CrewArchive,CrewReport} from './crew-log.js';
import { z } from 'zod';

export const Move = z.object({kind:z.literal('move'), x:z.number().int().nonnegative(), z:z.number().int().nonnegative()}).strict();
export type Move = z.infer<typeof Move>;
export const Haul = z.object({kind:z.literal('haul'),thing:z.string().min(1).max(120),
  x:z.number().int().nonnegative(),z:z.number().int().nonnegative(),count:z.number().int().min(1).max(25),
  trips:z.number().int().min(1).max(3),maxTicks:z.number().int().min(60).max(3600)}).strict();
export type Haul = z.infer<typeof Haul>;
export const Rescue = z.object({kind:z.literal('rescue'),target:z.string().min(1).max(120),bed:z.string().min(1).max(120),
  x:z.number().int().nonnegative(),z:z.number().int().nonnegative(),maxTicks:z.number().int().min(60).max(3600)}).strict();
export type Rescue = z.infer<typeof Rescue>;
export type RescueView = {epoch:string;tick:number;mapId:number;status:'available'|'unavailable';options:Rescue[];
  observations:{target:string;targetName:string;bed:string;bedLabel:string}[]};
export const Action = z.discriminatedUnion('kind',[Move,Haul,Rescue]);
export type Action = z.infer<typeof Action>;
/** Physical quantities are observations, independent of the proposed consent bounds. */
export type HaulSupply = {thing:string;label:string;x:number;z:number;sourceCount:number;destinationFree:number};
export type HaulingView = {epoch:string;tick:number;mapId?:number;status:'available'|'unavailable';options:Haul[];supplies?:HaulSupply[]};
export const Decision = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('accept'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('refuse'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('counter'),reason:z.string().min(1).max(1000),action:Action}).strict()
]);
export type Decision = z.infer<typeof Decision>;
export type Outcome = 'started'|'completed'|'failed'|'interrupted';
/** Bounded local opportunities, not a route, reservation or future success guarantee. */
export type MovementView = {epoch:string;tick:number;originX:number;originZ:number;radius:number;
  status:'available'|'unavailable';options:Move[]};
export type Pawn = {observedPeople?:{id:string;name:string}[];id:string;name:string;x:number;z:number;job:string;health:number;facts?:{key:string;value:string;level:number}[];movement?:MovementView;hauling?:HaulingView;casualties?:{epoch:string;tick:number;mapId:number;radius:number;observations:{target:string;name:string;x:number;z:number}[];visibleSubjects?:{target:string;downed:boolean;inBed:boolean}[];visibleBeds?:{bed:string;x:number;z:number;medical:boolean;occupied:boolean;prisoner:boolean;slave:boolean;colonyOwned:boolean;forbidden:boolean}[]};downed?:boolean;currentBed?:string;carrying?:string;rescue?:RescueView;rescueReady?:boolean;workReady?:boolean};
export type Receipt = {id:string;actor:string;status:Outcome;reason:string;x:number;z:number;kind?:string;thing?:string;count?:number;delivered?:number;target?:string;bed?:string};
export type GameState = {
  world:string;epoch:string;ticks:number;paused:boolean;loaded:boolean;manualPaused?:boolean;decisionPauses?:number;
  pawns:Pawn[];actions:Receipt[];crewLog?:CrewReport;events?:NativeEvent[];eventSeq?:number;
};
export type NativeEvent = {seq:number;tick:number;pawn:string;kind:string;detail:string;subject?:string;subjectName?:string};
export type Attention = {event:NativeEvent;route:'native'|'appraisal'|'deliberation';interrupt?:boolean};
export type DecisionPause = {epoch:string;actor:string;leaseId:string;ttlMs:number};
export type Activity = {epoch:string;actor:string;activityId:string;ttlMs:number};
export type ActionRequest = {id:string;epoch:string;actor:string;action:Action;untilTick?:number;mapId?:number};
/** Admin capability: held by the coordinator/runner only, never provided to a character backend. */
export interface GameBridge {
  state():Promise<GameState>;
  setCrewLog?(report:CrewReport):Promise<void>;
  setActivity?(activity:Activity):Promise<void>;
  setDecisionPause?(pause:DecisionPause):Promise<void>;
  cancel?(request:{epoch:string;actor:string;id:string;kind?:'haul'|'rescue'}):Promise<Receipt>;
  move(request:ActionRequest):Promise<Receipt>;
  save(name:string):Promise<{sha256:string}>;
  load(name:string):Promise<void>;
  verify(name:string,hash:string):Promise<void>;
}
export type AttentionProgress = {
  cursor:number;lastAttemptTick?:number;
  last?:{status:'running'|'continued'|'decided'|'native'|'failed'|'interrupted';throughSeq:number;reason:string};
};
export type Character = {messages?:SocialMessage[];outlook?:PrivateOutlook;id:string;name:string;memories:string[];commitment?:string;intention?:string;experiences?:Attention[];
  attention?:AttentionProgress;
  reflections?:{tick:number;throughSeq:number;backend:string;reason:string}[];
};
export type AlternativeRequest = {id:string;pawn:string;agreementId:string;target:string;mapId:number;reason:string;status:'pending'|'offered'|'declined'|'closed';replyReason?:string;proposalId?:string};
export type Proposal = {replacesAgreementId?:string;requestId?:string;id:string;pawn:string;action:Action;reason:string;status:'pending'|'accepted'|'refused'|'countered'|'withdrawn';withdrawalReason?:string;haulMap?:number;rescueMap?:number;decision?:Decision;actionId?:string;parentId?:string;replyId?:string;round?:number;standing?:{status:'running'|'completed'|'stopped';deadline:number;steps:string[];reason?:string}};
export type Perspective = {pawn:Pawn;character:Character;proposal:Proposal;agreementProgress?:AgreementProgress;history?:Proposal[]};
export interface DecisionBackend {
  readonly name:string;
  decide(view:Perspective, signal:AbortSignal):Promise<unknown>;
}
export type Domain = {
  coreState?:import('./core-planner.js').CoreState;
  exchanges?:Record<string,SocialExchange>;
  eventCursor?:number;crew?:CrewArchive;
  schema:1;world:string;epoch:string;branch:string;
  characters:Record<string,Character>;proposals:Record<string,Proposal>;
  outcomes:Record<string,Receipt>;requests?:Record<string,AlternativeRequest>;
};
export type Event = {branch:string;kind:string;actor:string;data:unknown};
