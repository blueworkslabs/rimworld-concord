import type {AgreementProgress} from './crew-log.js';
import {OutlookUpdate} from './outlook.js';
import { z } from 'zod';
import { attentionInterrupt } from './routing.js';
import { Decision, type Attention, type Character, type NativeEvent, type Pawn, type Proposal,type AlternativeRequest } from './protocol.js';
import type { AppraisalView } from './appraisal.js';
import type { Coordinator } from './coordinator.js';

/** A thought can leave native behavior alone or decide one already-known proposal.
 * No raw move, actor override, admin tool, or invented proposal is accepted here.
 */
export const Reflection=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('request_reoffer'),proposalId:z.string().uuid(),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('revise_outlook'),update:OutlookUpdate,reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('request_rescue'),agreementId:z.string().uuid(),target:z.string().min(1).max(120),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('withdraw'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('continue'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('proposal'),proposalId:z.string().uuid(),decision:Decision}).strict()
]);
export type Reflection=z.infer<typeof Reflection>;
export type AttentionView={pawn:Pawn;character:Character;events:NativeEvent[];proposals:Proposal[];deferredOffers?:Proposal[];intention?:Proposal;agreementProgress?:AgreementProgress;histories?:Record<string,Proposal[]>;requests?:AlternativeRequest[]};
export interface AttentionBackend {
  readonly name:string;
  reflect(view:AttentionView,signal:AbortSignal):Promise<unknown>;
}
export interface AppraisalBackend {
  readonly name:string;
  assess(view:AppraisalView,signal:AbortSignal):Promise<unknown>;
}
export const AttentionOptions=z.object({
  cooldownTicks:z.number().int().min(0).max(60000).default(300),
  timeoutMs:z.number().int().min(1).max(115000).default(5000)
}).strict();
export type AttentionOptions=z.input<typeof AttentionOptions>;
/** Admission is operator-owned, synchronous and rechecked in the serialized claim. */
export type AttentionClaim={pawn:string;events:{seq:number;kind:string}[];needsAppraisal:boolean};
export interface AttentionLease {consume():boolean;release():void;}
export interface AttentionAdmission {canClaim(claim:AttentionClaim):boolean;claim(claim:AttentionClaim):AttentionLease|undefined;}
export type AttentionResult={pawn:string;status:'idle'|'busy'|'cooldown'|'paced'|'unavailable'|'native'|'continued'|'decided'|'failed'|'interrupted';throughSeq?:number};

/** Collapse repeated routine/need signals to the latest of each kind, but preserve
 * each significant event. Original events remain in the experience/audit archive.
 */
export function coalesce(events:Attention[]):Attention[] {
  const latest=new Map<string,Attention>();
  for(const e of events) latest.set(e.route==='deliberation'&&(attentionInterrupt(e))?`significant:${e.event.seq}`:`${e.event.kind}:${e.event.kind==='memory'?e.event.detail:''}`,e);
  return [...latest.values()].sort((a,b)=>a.event.seq-b.event.seq);
}

/** Abort even a backend which ignores its signal, and always remove our listener. */
export async function bounded<T>(signal:AbortSignal,fn:()=>Promise<T>):Promise<T> {
  signal.throwIfAborted();
  let onAbort:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{
    onAbort=()=>reject(Error('Attention cancelled'));signal.addEventListener('abort',onAbort,{once:true});
  });
  try {return await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return fn();}),cancelled]);}
  finally {signal.removeEventListener('abort',onAbort);}
}

/** Operator-owned, explicitly polled and bounded; never starts a background service.
 * Native observation/reconciliation keep running while model promises are pending.
 * Live adapters must enforce their own durable, non-rewindable billing limits.
 */
export class AttentionPump {
  private running=new Map<string,Promise<void>>();
  private controller=new AbortController();
  private polling=false;
  private starts=0;
  private nativeStarts=0;
  private modelStarts=0;
  readonly results:AttentionResult[]=[];
  constructor(private coordinator:Coordinator,private backend:AttentionBackend,
    private appraiser?:AppraisalBackend,private options:AttentionOptions={},
    private limits:{maxConcurrent:number;maxTurns?:number;maxNativeTurns?:number;maxModelTurns?:number;pawns?:string[]}={maxConcurrent:2,maxTurns:12},private admission?:AttentionAdmission) {
    AttentionOptions.parse(options);
    if(!Number.isInteger(limits.maxConcurrent)||limits.maxConcurrent<1||limits.maxConcurrent>3||
      (limits.maxTurns!==undefined?(!Number.isInteger(limits.maxTurns)||limits.maxTurns<1||limits.maxTurns>100||limits.maxNativeTurns!==undefined||limits.maxModelTurns!==undefined):
       (![limits.maxNativeTurns,limits.maxModelTurns].every(n=>Number.isInteger(n)&&n!>=0&&n!<=100)||!limits.maxNativeTurns&&!limits.maxModelTurns))||
      (limits.pawns!==undefined&&(!limits.pawns.length||limits.pawns.length>3||limits.pawns.some(p=>typeof p!=='string'||!p))))throw Error('Invalid pump limits');
  }
  async poll() {
    if(this.controller.signal.aborted) throw Error('Attention pump stopped');
    if(this.polling) throw Error('Attention poll already in progress');
    this.polling=true;
    try {
      await this.coordinator.reconcile();
      if(this.controller.signal.aborted) return;
      const split=this.limits.maxTurns===undefined;
      const model=new Set(this.coordinator.attentionCandidates(this.options,!!this.appraiser,'model',this.admission));
      for(const pawn of this.coordinator.attentionCandidates(this.options,!!this.appraiser,undefined,this.admission)) {
        if(this.running.size>=this.limits.maxConcurrent||(!split&&this.starts>=this.limits.maxTurns!))break;
        if(this.running.has(pawn)||this.limits.pawns&&!this.limits.pawns.includes(pawn))continue;
        const mode=model.has(pawn)?'model':'native';
        if(split&&(mode==='model'?this.modelStarts>=this.limits.maxModelTurns!:this.nativeStarts>=this.limits.maxNativeTurns!))continue;
        this.starts++;if(mode==='model')this.modelStarts++;else this.nativeStarts++;
        const task=this.coordinator.attend(pawn,this.backend,this.appraiser,this.options,this.controller.signal,split?mode:undefined,this.admission)
          .then(result=>{if(result.status==='paced'){this.starts--;if(mode==='model')this.modelStarts--;else this.nativeStarts--;}else this.results.push(result);})
          .catch(()=>{this.results.push({pawn,status:this.controller.signal.aborted?'interrupted':'failed'});})
          .finally(()=>{this.running.delete(pawn);});
        this.running.set(pawn,task);
      }
    } finally {this.polling=false;}
  }
  status(){return {started:this.starts,nativeStarted:this.nativeStarts,modelStarted:this.modelStarts,pending:this.running.size,stopped:this.controller.signal.aborted};}
  async drain(){await Promise.all([...this.running.values()]);}
  async stop(){this.controller.abort();await this.drain();}
}
