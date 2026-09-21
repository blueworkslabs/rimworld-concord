import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppraisalView } from './appraisal.js';

export const AppraisalReply=z.object({type:z.literal('appraisal-result'),id:z.string().uuid(),
  result:z.object({reflectionScore:z.number().finite().min(0).max(1)}).optional(),
  error:z.literal('Appraisal unavailable').optional()}).strict()
  .refine(v=>(v.result!==undefined)!==(v.error!==undefined));

/** Operator-only stdio relay. It carries pawn views and scores, never credentials.
 * The caller owns framing, input size limits and the parent connection lifetime.
 */
export class AppraisalChannel {
  readonly name='typesafe/jev-1.13';
  private pending=new Map<string,{resolve:(v:{reflectionScore:number})=>void;reject:(e:Error)=>void;cleanup:()=>void}>();
  private closed=false;
  constructor(private send:(message:unknown)=>void) {}
  assess(view:AppraisalView,signal:AbortSignal):Promise<{reflectionScore:number}> {
    signal.throwIfAborted();
    if(this.closed) return Promise.reject(Error('Appraisal connection closed'));
    if(this.pending.size) return Promise.reject(Error('Appraisal channel busy'));
    const id=randomUUID();
    return new Promise((resolve,reject)=>{
      const cancel=()=>{
        this.pending.delete(id);signal.removeEventListener('abort',cancel);
        try {this.send({type:'appraisal-cancel',id});} catch { /* disconnected */ }
        reject(Error('Appraisal cancelled'));
      };
      this.pending.set(id,{resolve,reject,cleanup:()=>signal.removeEventListener('abort',cancel)});
      signal.addEventListener('abort',cancel,{once:true});
      try {this.send({type:'appraisal',id,view});} catch {
        this.pending.delete(id);signal.removeEventListener('abort',cancel);reject(Error('Appraisal connection unavailable'));
      }
    });
  }
  receive(message:unknown) {
    const reply=AppraisalReply.parse(message);const pending=this.pending.get(reply.id);
    if(!pending) return; // Late/cancelled/foreign correlation IDs cannot resolve a current request.
    this.pending.delete(reply.id);pending.cleanup();
    if(reply.result) pending.resolve(reply.result);else pending.reject(Error('Appraisal unavailable'));
  }
  close() {
    this.closed=true;
    for(const p of this.pending.values()){p.cleanup();p.reject(Error('Appraisal connection closed'));}
    this.pending.clear();
  }
}
