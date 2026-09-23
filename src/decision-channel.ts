import {CoreAnswerChoice} from './pawn-eating.js';
import {CoreChoice,type CoreView,type CoreQuestionView} from './core-planner.js';
import {SocialChoice,type SocialView} from './social.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Decision,type Perspective } from './protocol.js';
import { Reflection,type AttentionView } from './attention.js';

/** Trusted operator SSH relay; no action/admin handles or credentials cross it. */
export class DecisionChannel {
 readonly name='claude-sonnet-4-6';
 private pending?:{id:string;mode:'decision'|'reflection'|'social'|'core'|'core-answer';resolve:(v:unknown)=>void;reject:(e:Error)=>void;cleanup:()=>void};
 private closed=false;
 constructor(private send:(value:unknown)=>void){}
 plan(view:CoreView,signal:AbortSignal){return this.request('core',view,signal);}
 answerCore(view:CoreQuestionView,signal:AbortSignal){return this.request('core-answer',view,signal);}
 decide(view:Perspective,signal:AbortSignal){return this.request('decision',view,signal);}
 speak(view:SocialView,signal:AbortSignal){return this.request('social',view,signal);}
 reflect(view:AttentionView,signal:AbortSignal){return this.request('reflection',view,signal);}
 private request(mode:'decision'|'reflection'|'social'|'core'|'core-answer',view:unknown,signal:AbortSignal):Promise<unknown>{
   signal.throwIfAborted();if(this.closed||this.pending)return Promise.reject(Error('Decision channel unavailable'));
   const id=randomUUID();
   return new Promise((resolve,reject)=>{
     const cancel=()=>{this.pending=undefined;signal.removeEventListener('abort',cancel);
       try{this.send({type:'decision-cancel',id});}catch{}reject(Error('Decision cancelled'));};
     this.pending={id,mode,resolve,reject,cleanup:()=>signal.removeEventListener('abort',cancel)};
     signal.addEventListener('abort',cancel,{once:true});
     try{this.send({type:'decision-request',id,mode,view});}catch{this.close();}
   });
 }
 receive(raw:unknown){
   const r=z.object({type:z.literal('decision-result'),id:z.string().uuid(),output:z.unknown().optional(),error:z.literal('Decision unavailable').optional()}).strict().parse(raw);
   const p=this.pending;if(!p||p.id!==r.id)return;
   if(r.error!==undefined&&r.output!==undefined)throw Error('Ambiguous decision result');
   const value=r.error?undefined:(p.mode==='core'?CoreChoice:p.mode==='core-answer'?CoreAnswerChoice:p.mode==='social'?SocialChoice:p.mode==='decision'?Decision:Reflection).parse(r.output);
   p.cleanup();this.pending=undefined;if(r.error)p.reject(Error(r.error));else p.resolve(value);
 }
 close(){
   this.closed=true;const p=this.pending;this.pending=undefined;
   if(p){p.cleanup();try{this.send({type:'decision-cancel',id:p.id});}catch{}p.reject(Error('Decision channel closed'));}
 }
}
