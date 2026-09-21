import { z } from 'zod';
import { Decision, type Attention, type Character, type NativeEvent, type Pawn, type Proposal } from './protocol.js';
import type { AppraisalView } from './appraisal.js';
import type { Coordinator } from './coordinator.js';

/** A thought can leave native behavior alone or decide one already-known proposal.
 * No raw move, actor override, admin tool, or invented proposal is accepted here.
 */
export const Reflection=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('continue'),reason:z.string().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('proposal'),proposalId:z.string().uuid(),decision:Decision}).strict()
]);
export type Reflection=z.infer<typeof Reflection>;
export type AttentionView={pawn:Pawn;character:Character;events:NativeEvent[];proposals:Proposal[]};
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
export type AttentionResult={pawn:string;status:'idle'|'busy'|'cooldown'|'unavailable'|'native'|'continued'|'decided'|'failed'|'interrupted';throughSeq?:number};

/** Collapse repeated routine/need signals to the latest of each kind, but preserve
 * each significant event. Original events remain in the experience/audit archive.
 */
export function coalesce(events:Attention[]):Attention[] {
  const latest=new Map<string,Attention>();
  for(const e of events) latest.set(e.route==='deliberation'?`significant:${e.event.seq}`:e.event.kind,e);
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
  readonly results:AttentionResult[]=[];
  constructor(private coordinator:Coordinator,private backend:AttentionBackend,
    private appraiser?:AppraisalBackend,private options:AttentionOptions={},
    private limits={maxConcurrent:2,maxTurns:12}) {
    AttentionOptions.parse(options);
    if(!Number.isInteger(limits.maxConcurrent)||limits.maxConcurrent<1||limits.maxConcurrent>3||
      !Number.isInteger(limits.maxTurns)||limits.maxTurns<1||limits.maxTurns>100) throw Error('Invalid pump limits');
  }
  async poll() {
    if(this.controller.signal.aborted) throw Error('Attention pump stopped');
    if(this.polling) throw Error('Attention poll already in progress');
    this.polling=true;
    try {
      await this.coordinator.reconcile();
      if(this.controller.signal.aborted) return;
      for(const pawn of this.coordinator.attentionCandidates(this.options,!!this.appraiser)) {
        if(this.running.size>=this.limits.maxConcurrent||this.starts>=this.limits.maxTurns) break;
        if(this.running.has(pawn)) continue;
        this.starts++;
        const task=this.coordinator.attend(pawn,this.backend,this.appraiser,this.options,this.controller.signal)
          .then(result=>{this.results.push(result);})
          .catch(()=>{this.results.push({pawn,status:this.controller.signal.aborted?'interrupted':'failed'});})
          .finally(()=>{this.running.delete(pawn);});
        this.running.set(pawn,task);
      }
    } finally {this.polling=false;}
  }
  status(){return {started:this.starts,pending:this.running.size,stopped:this.controller.signal.aborted};}
  async drain(){await Promise.all([...this.running.values()]);}
  async stop(){this.controller.abort();await this.drain();}
}
