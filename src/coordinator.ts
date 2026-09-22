import {reviseOutlook} from './outlook.js';
import {recordCrew,crewReport,agreementProgress} from './crew-log.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Decision, Action, type Domain, type GameBridge, type DecisionBackend, type GameState, type Proposal,type AlternativeRequest } from './protocol.js';
import type { AppraisalView } from './appraisal.js';
import {rescueQuestionInvalid} from './decision-validity.js';
import { nativeAttention,attentionInterrupt } from './routing.js';
import { Store } from './store.js';
import {rescueView,planRescue} from './rescue-planning.js';
import {groundedPawn,haulingView,planHaul} from './haul-planning.js';
import { AttentionOptions, Reflection, bounded, coalesce, type AttentionBackend, type AppraisalBackend, type AttentionResult,type AttentionAdmission } from './attention.js';

/** Character handles bind identity in code; backend output cannot choose an actor. */
export class Coordinator {
  private domain!:Domain;
  private queue:Promise<unknown>=Promise.resolve();
  private generation=0;
  private pending=new Map<string,AbortController>();
  private questions=new Map<string,{controller:AbortController;proposal:string}>();
  private attending=new Map<string,{controller:AbortController;throughSeq:number}>();
  private observedTick=0;
  private crewPublished='';
  crewSyncError:string|undefined;
  constructor(private store:Store,private game:GameBridge,private timing:{mode:'continuous'|'pause-at-decision'}={mode:'continuous'}) {
    if(!['continuous','pause-at-decision'].includes(timing.mode))throw Error('Invalid timing mode');
    if(timing.mode==='pause-at-decision'&&!game.setDecisionPause)throw Error('Game-owned decision pause unsupported');
  }
  private async decisionPause(activity:{epoch:string;actor:string;activityId:string;ttlMs:number},release=false) {
    if(this.timing.mode==='pause-at-decision')await this.game.setDecisionPause!({epoch:activity.epoch,actor:activity.actor,leaseId:activity.activityId,ttlMs:release?0:activity.ttlMs});
  }
  private serial<T>(fn:()=>Promise<T>):Promise<T> {
    const result=this.queue.then(async()=>{try{return await fn();}finally{await this.publishCrew();}}); this.queue=result.catch(()=>{}); return result;
  }
  private async publishCrew(){
    if(!this.domain||!this.game.setCrewLog)return;
    const report=crewReport(this.domain,this.observedTick),key=JSON.stringify(report);
    if(key===this.crewPublished)return;
    try{await this.game.setCrewLog(report);this.crewPublished=key;this.crewSyncError=undefined;}
    catch(e){this.crewSyncError=String(e); /* Presentation failure grants no gameplay authority. Retry on next operation. */}
  }
  private commit(kind:string,actor:string,data:unknown) {
    recordCrew(this.domain,kind,actor,data,this.observedTick);
    this.store.commit(this.domain,{branch:this.domain.branch,kind,actor,data});
  }
  async open() {
    return this.serial(async()=>{
      if(this.pending.size)throw Error('Cannot reopen while decisions are running');
      const game=await this.game.state();
      if(!game.loaded) throw Error('No loaded game');
      const previous=this.store.read();
      if(previous) {
        this.domain=previous;
        if(previous.epoch!==game.epoch || previous.world!==game.world) throw Error('Timeline changed: restore a paired checkpoint');
        this.recoverAttention('Coordinator restarted during attention; no automatic retry');
      } else {
        this.domain={schema:1,world:game.world,epoch:game.epoch,branch:randomUUID(),characters:{},proposals:{},outcomes:{}};
        for(const p of game.pawns) this.domain.characters[p.id]={id:p.id,name:p.name,memories:[]};
        this.commit('initialized','operator',{pawns:Object.keys(this.domain.characters)});
      }
      this.observedTick=game.ticks;
    });
  }
  private async current():Promise<GameState> {
    if(!this.domain) throw Error('Coordinator not opened');
    const game=await this.game.state();
    if(!game.loaded || game.world!==this.domain.world || game.epoch!==this.domain.epoch) throw Error('Stale timeline');
    return game;
  }
  private ingest(game:GameState) {
    this.observedTick=game.ticks;
    for(const [pawn,q] of this.questions) {
      const p=this.domain.proposals[q.proposal];
      const reason=p?(p.replacesAgreementId&&!this.replacementActive(p)?'Replacement agreement is no longer active':rescueQuestionInvalid(game,p)):'Offer is missing';
      if(reason&&!q.controller.signal.aborted){
        this.commit('decision-invalidated',pawn,{proposal:q.proposal,reason});
        q.controller.abort(Error(reason));
      }
    }
    if(game.eventSeq===undefined) return;
    const cursor=this.domain.eventCursor??0;
    const events=(game.events??[]).filter(e=>e.seq>cursor).sort((a,b)=>a.seq-b.seq);
    if(events.length && events[0]!.seq>cursor+1) this.commit('native-event-gap','operator',{from:cursor+1,to:events[0]!.seq-1});
    for(const event of events) {
      const character=this.domain.characters[event.pawn];
      if(!character) continue;
      const {next,interrupt}=nativeAttention(event);
      const experiences=character.experiences??=[];
      experiences.push({event,route:next,interrupt});
      if(experiences.length>64) {
        const evicted=experiences.shift()!;
        if(evicted.event.seq>(character.attention?.cursor??0)&&evicted.route!=='native')
          this.commit('attention-gap',event.pawn,{seq:evicted.event.seq,kind:evicted.event.kind});
      }
      const pending=this.pending.get(event.pawn);
      if(pending&&!pending.signal.aborted) {
        if(interrupt){
          this.commit('decision-interrupted',event.pawn,{seq:event.seq,kind:event.kind,reason:'New interrupting experience'});
          pending.abort(Error('New interrupting experience'));
        }else if(event.kind==='memory')this.commit('experience-deferred',event.pawn,{seq:event.seq,kind:event.kind,detail:event.detail,reason:'Conversation queued behind current thought'});
      }
      this.domain.eventCursor=event.seq;
      this.commit('native-event',event.pawn,{event,route:next});
    }
    this.domain.eventCursor=game.eventSeq;
    if(cursor!==game.eventSeq) this.commit('native-cursor','operator',{seq:game.eventSeq});
  }
  /** Polling is operator-owned. Routes are durable attention records, not automatic orders. */
  async observe() {return this.serial(async()=>{this.ingest(await this.current());});}
  /** Operator scheduling hints only. Every condition is checked again at claim time. */
  attentionCandidates(options:AttentionOptions={},hasAppraiser=false,mode?:'native'|'model',admission?:AttentionAdmission):string[] {
    const config=AttentionOptions.parse(options);
    if(!this.domain) throw Error('Coordinator not opened');
    return Object.values(this.domain.characters).filter(c=>{
      if(this.pending.has(c.id)||(c.commitment&&!c.intention)) return false;
      const events=(c.experiences??[]).filter(e=>e.event.seq>(c.attention?.cursor??0));
      if(!events.length) return false;
      const significant=events.some(e=>e.route==='deliberation');
      const interrupting=events.some(e=>attentionInterrupt(e));
      const needsModel=events.some(e=>e.route!=='native');
      if(mode==='native'&&needsModel||mode==='model'&&!needsModel)return false;
      if(!significant&&needsModel&&!hasAppraiser) return false;
      if(needsModel&&admission&&!admission.canClaim({pawn:c.id,events:events.map(e=>({seq:e.event.seq,kind:e.event.kind})),needsAppraisal:!significant}))return false;
      return !needsModel||interrupting||c.attention?.lastAttemptTick===undefined||
        this.observedTick-c.attention.lastAttemptTick>=config.cooldownTicks;
    }).sort((a,b)=>{
      // Significant signals get the slots before routine needs; oldest attempt wins ties.
      const priority=(c:typeof a)=>(c.experiences??[]).some(e=>e.event.seq>(c.attention?.cursor??0)&&(attentionInterrupt(e)))?0:1;
      return priority(a)-priority(b)||(a.attention?.lastAttemptTick??-1)-(b.attention?.lastAttemptTick??-1)||a.id.localeCompare(b.id);
    }).map(c=>c.id);
  }
  /** At-most-once attempt per captured batch, not guaranteed thought completion.
   * Claim/cursor is durable BEFORE inference. Failed/uncertain attempts are audited,
   * never silently replayed after restart. A later event may prompt fresh reflection.
   */
  async attend(pawn:string,backend:AttentionBackend,appraiser?:AppraisalBackend,
    options:AttentionOptions={},signal=new AbortController().signal,mode?:'native'|'model',admission?:AttentionAdmission):Promise<AttentionResult> {
    const config=AttentionOptions.parse(options);
    const prepared=await this.serial(async()=>{
      signal.throwIfAborted();
      const game=await this.current();this.ingest(game);
      const character=this.domain.characters[pawn];
      const own=game.pawns.find(p=>p.id===pawn);
      if(!own||!character) throw Error('Pawn unavailable');
      if(this.pending.has(pawn)||(character.commitment&&!character.intention)) return {status:'busy' as const};
      const events=(character.experiences??[]).filter(e=>e.event.seq>(character.attention?.cursor??0));
      if(!events.length) return {status:'idle' as const};
      const significant=events.some(e=>e.route==='deliberation');
      const interrupting=events.some(e=>attentionInterrupt(e));
      const needsModel=events.some(e=>e.route!=='native');
      // A native-only scheduling claim must never escalate after fresh ingestion.
      if(mode==='native'&&needsModel||mode==='model'&&!needsModel)return {status:'unavailable' as const};
      if(needsModel&&!significant&&!appraiser) return {status:'unavailable' as const};
      if(needsModel&&!interrupting&&character.attention?.lastAttemptTick!==undefined&&
        game.ticks-character.attention.lastAttemptTick<config.cooldownTicks) return {status:'cooldown' as const};
      const lease=needsModel?admission?.claim({pawn,events:events.map(e=>({seq:e.event.seq,kind:e.event.kind})),needsAppraisal:!significant}):undefined;
      if(needsModel&&admission&&!lease)return {status:'paced' as const};
      const throughSeq=events.at(-1)!.event.seq;
      const progress=character.attention??={cursor:0};
      progress.cursor=throughSeq;
      if(!needsModel) {
        progress.last={status:'native',throughSeq,reason:'Routine events: continue native behavior'};
        this.commit('attention-native',pawn,{throughSeq,count:events.length});
        return {status:'native' as const,throughSeq};
      }
      progress.lastAttemptTick=game.ticks;
      progress.last={status:'running',throughSeq,reason:'Bounded attention attempt'};
      const controller=new AbortController();
      this.pending.set(pawn,controller);this.attending.set(pawn,{controller,throughSeq});
      const activity={epoch:game.epoch,actor:pawn,activityId:randomUUID(),ttlMs:config.timeoutMs+2000};
      this.commit('attention-started',pawn,{throughSeq,count:events.length,backend:backend.name,appraiser:significant?null:appraiser?.name});
      const view=structuredClone({pawn:groundedPawn(this.domain,game,own),character,...(character.intention?{intention:this.domain.proposals[character.intention],agreementProgress:agreementProgress(this.domain,this.domain.proposals[character.intention]!,game.ticks,game.actions)}:{}),events:coalesce(events).filter(e=>e.route!=='native').map(e=>e.event),
        proposals:Object.values(this.domain.proposals).filter(p=>p.pawn===pawn&&p.status==='pending').slice(0,8),
        requests:Object.values(this.domain.requests??{}).filter(r=>r.pawn===pawn).slice(-8),
        histories:Object.fromEntries(Object.values(this.domain.proposals).filter(p=>p.pawn===pawn&&p.status==='pending'&&p.parentId).slice(0,8).map(p=>[p.id,this.history(p)]))});
      return {status:'running' as const,generation:this.generation,controller,activity,view,throughSeq,significant,lease};
    });
    if(prepared.status!=='running') return {pawn,status:prepared.status,throughSeq:'throughSeq' in prepared?prepared.throughSeq:undefined};
    const combined=AbortSignal.any([signal,prepared.controller.signal]);
    const timer=setTimeout(()=>prepared.controller.abort(),config.timeoutMs);
    try {
      const result=await bounded(combined,async()=>{
        if(!prepared.significant) {
          const score=z.object({reflectionScore:z.number().finite().min(0).max(1)}).passthrough().parse(
            await appraiser!.assess({...prepared.view,event:prepared.view.events.at(-1)!},combined));
          combined.throwIfAborted();
          if(score.reflectionScore<0.5) return {kind:'native' as const,score:score.reflectionScore};
        }
        await this.decisionPause(prepared.activity);
        combined.throwIfAborted();
        // Only deliberation gets the thinking badge. Appraisal is a bounded fast gate.
        try {await this.game.setActivity?.(prepared.activity);} catch { /* cognition can proceed without UI */ }
        combined.throwIfAborted();
        if(prepared.lease&&!prepared.lease.consume())throw Error('Reflection admission expired');
        return Reflection.parse(await backend.reflect(prepared.view,combined));
      });
      return await this.serial(async()=>{
        combined.throwIfAborted();
        if(prepared.generation!==this.generation) throw Error('Stale attention');
        const fresh=await this.current();this.ingest(fresh);
        combined.throwIfAborted(); // a freshly observed significant event supersedes this result
        const character=this.domain.characters[pawn]!;
        const throughSeq=prepared.throughSeq;
        if(result.kind==='native') {
          character.attention!.last={status:'native',throughSeq,reason:'Appraisal selected native continuation'};
          this.commit('attention-appraised',pawn,{throughSeq,reflectionScore:result.score,backend:appraiser!.name});
          return {pawn,status:'native',throughSeq};
        }
        const reason=result.kind==='proposal'?result.decision.reason:result.reason;
        const reflection={tick:this.observedTick,throughSeq,backend:backend.name,reason};
        if(result.kind==='revise_outlook') {
          // Validate against the frozen supplied perspective, then recheck the live revision.
          const next=reviseOutlook(prepared.view.character,result.update,this.observedTick);
          if((character.outlook?.revision??0)!==result.update.expectedRevision)throw Error('Private outlook superseded');
          character.outlook=next;
          character.attention!.last={status:'continued',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          this.commit('outlook-revised',pawn,{...reflection,outlook:next});
          return {pawn,status:'continued',throughSeq};
        }
        if(result.kind==='request_rescue') {
          this.requestRescue(prepared.view,result,fresh);
          character.attention!.last={status:'continued',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          this.commit('attention-requested',pawn,reflection);
          return {pawn,status:'continued',throughSeq};
        }
        if(result.kind==='withdraw') {
          if(!prepared.view.intention||character.intention!==prepared.view.intention.id)throw Error('Reflection agreement superseded');
          await this.withdraw(pawn,result.reason);
          character.attention!.last={status:'continued',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          this.commit('attention-withdrawn',pawn,reflection);
          return {pawn,status:'continued',throughSeq};
        }
        if(result.kind==='proposal') {
          if(!prepared.view.proposals.some(p=>p.id===result.proposalId)) throw Error('Proposal outside attention perspective');
          const proposal=this.domain.proposals[result.proposalId];
          if(!proposal||proposal.pawn!==pawn||proposal.status!=='pending'||character.commitment||character.intention) throw Error('Attention proposal superseded');
          this.validateDecision(proposal,result.decision,fresh);
          character.attention!.last={status:'decided',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          await this.applyDecision(proposal,result.decision,fresh,combined);
          return {pawn,status:'decided',throughSeq};
        }
        character.attention!.last={status:'continued',throughSeq,reason};
        character.reflections=[...(character.reflections??[]),reflection].slice(-16);
        this.commit('attention-reflected',pawn,reflection);
        return {pawn,status:'continued',throughSeq};
      });
    } catch(error) {
      return await this.serial(async()=>{
        const status=combined.aborted?'interrupted' as const:'failed' as const;
        if(prepared.generation===this.generation) {
          const progress=this.domain.characters[pawn]!.attention!;
          // A lost dispatch reply does not undo a durably accepted decision.
          if(progress.last?.status==='running') progress.last={status,throughSeq:prepared.throughSeq,reason:'Backend unavailable, cancelled or invalid; continue native behavior'};
          this.commit('attention-error',pawn,{throughSeq:prepared.throughSeq,status,error:String(error),fallback:'continue-native'});
        }
        return {pawn,status,throughSeq:prepared.throughSeq};
      });
    } finally {
      clearTimeout(timer);
      prepared.lease?.release();
      try {await this.decisionPause(prepared.activity,true);} catch { /* game lease expires even if transport is lost */ }
      if(this.pending.get(pawn)===prepared.controller) this.pending.delete(pawn);
      if(this.questions.get(pawn)?.controller===prepared.controller)this.questions.delete(pawn);
      if(this.attending.get(pawn)?.controller===prepared.controller) this.attending.delete(pawn);
      try {await this.game.setActivity?.({...prepared.activity,ttlMs:0});} catch { /* old timeline or expired badge */ }
    }
  }
  /** Explicit bounded appraisal; important events routed directly to deliberation cannot be downgraded. */
  async appraise(pawn:string,seq:number,backend:{name:string;assess(view:AppraisalView,signal:AbortSignal):Promise<unknown>},signal:AbortSignal) {
    const prepared=await this.serial(async()=>{
      const game=await this.current();this.ingest(game);
      const character=this.domain.characters[pawn];
      const experience=character?.experiences?.find(e=>e.event.seq===seq);
      const own=game.pawns.find(p=>p.id===pawn);
      if(!own||!character||!experience||experience.route!=='appraisal') throw Error('No eligible appraisal');
      return {generation:this.generation,view:structuredClone({pawn:groundedPawn(this.domain,game,own),character,event:experience.event})};
    });
    signal.throwIfAborted();
    const result=z.object({reflectionScore:z.number().finite().min(0).max(1)}).passthrough().parse(await backend.assess(prepared.view,signal));
    return this.serial(async()=>{
      signal.throwIfAborted();
      if(prepared.generation!==this.generation) throw Error('Stale appraisal');
      await this.current();
      const experience=this.domain.characters[pawn]?.experiences?.find(e=>e.event.seq===seq);
      if(!experience||experience.route!=='appraisal') throw Error('Appraisal superseded');
      experience.route=result.reflectionScore>=0.5?'deliberation':'native';
      this.commit('appraised',pawn,{seq,backend:backend.name,reflectionScore:result.reflectionScore,route:experience.route});
      return structuredClone(experience);
    });
  }
  inspect() { return structuredClone(this.domain); }
  activity() { return [...this.pending.keys()].map(pawn=>({pawn,status:'deliberating' as const})); }
  /** Physical movement opportunities and communicated replies only; no private character state. */
  core() {
    return {
      rescueOptions:(pawn:string)=>this.serial(async()=>{
        if(!this.domain.characters[pawn])throw Error('Unknown pawn');
        const game=await this.current(),own=game.pawns.find(p=>p.id===pawn);
        if(!own)throw Error('Pawn unavailable');
        return rescueView(this.domain,game,own);
      }),
      haulingOptions:(pawn:string)=>this.serial(async()=>{
        if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
        const game=await this.current();
        const own=game.pawns.find(p=>p.id===pawn);
        if(!own) throw Error('Pawn unavailable');
        return haulingView(this.domain,game,own);
      }),
      movementOptions:(pawn:string)=>this.serial(async()=>{
        if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
        const game=await this.current();
        const own=game.pawns.find(p=>p.id===pawn);
        if(!own) throw Error('Pawn unavailable');
        // Older bridges return null, never a fabricated safe destination.
        return structuredClone(own.movement??null);
      }),
      requests:()=>Object.values(this.domain.requests??{}).map(r=>({id:r.id,pawn:r.pawn,agreementId:r.agreementId,target:r.target,mapId:r.mapId,reason:r.reason,status:r.status,replyReason:r.replyReason,proposalId:r.proposalId})),
      declineRequest:(id:string,reason:string)=>this.serial(async()=>{
        await this.current();const r=this.domain.requests?.[id];
        if(!r||r.status!=='pending'||!reason.trim()||reason.length>1000)throw Error('Invalid pending request reply');
        r.status='declined';r.replyReason=reason;this.commit('alternative-declined','core',r);return structuredClone(r);
      }),
      offerAlternative:(requestId:string,action:Action,reason:string,id=randomUUID())=>this.serial(async()=>{
        const game=await this.current(),r=this.domain.requests?.[requestId];
        if(!r||r.status!=='pending')throw Error('Expected unanswered pawn request');
        return this.propose(game,r.pawn,action,reason,id,undefined,r);
      }),
      /** Answer an unanswered goal using a fresh offer; never reinterpret an issued replacement. */
      offerRequestedRescue:(requestId:string,action:Action,reason:string,id=randomUUID())=>this.serial(async()=>{
        const game=await this.current(),r=this.domain.requests?.[requestId];
        if(!r||r.status!=='pending')throw Error('Expected unanswered pawn request');
        const old=this.domain.proposals[r.agreementId];
        if(old)this.refreshReceipt(old,game);
        this.ingest(game);
        return this.propose(game,r.pawn,action,reason,id,undefined,r,old?.standing?.status==='completed');
      }),
      inbox:()=>structuredClone(Object.values(this.domain.proposals).filter(p=>p.status==='countered'&&!p.replyId)),
      propose:(pawn:string,action:Action,reason:string,id=randomUUID())=>this.serial(async()=>{
        return this.propose(await this.current(),pawn,action,reason,id);
      }),
      withdrawOffer:(id:string,reason:string)=>this.serial(async()=>{
        await this.current();
        if(!reason.trim()||reason.length>1000)throw Error('Invalid withdrawal reason');
        const p=this.domain.proposals[id];
        if(!p||p.status!=='pending')throw Error('Only pending offers may be withdrawn by the core');
        p.status='withdrawn';p.withdrawalReason=reason;
        if(p.requestId&&this.domain.requests?.[p.requestId]?.proposalId===p.id)this.domain.requests[p.requestId]!.status='closed';
        // Do not cancel an unrelated thought by this pawn. Status invalidates late acceptance.
        this.commit('offer-withdrawn','core',{id,reason});
        return structuredClone(p);
      }),
      revise:(counterId:string,reason:string,id=randomUUID())=>this.serial(async()=>{
        const game=await this.current();
        const parent=this.domain.proposals[counterId];
        if(!parent||parent.status!=='countered'||parent.decision?.kind!=='counter') throw Error('Expected a communicated counterproposal');
        if((parent.round??0)>=2) throw Error('Negotiation round limit reached');
        if(parent.replyId&&parent.replyId!==id) throw Error('Counterproposal already answered');
        // Adopting an alternative only creates a new offer. The pawn must accept it anew.
        return this.propose(game,parent.pawn,parent.decision.action,reason,id,parent);
      })
    };
  }
  private propose(game:GameState,pawn:string,action:Action,reason:string,id:string,parent?:Proposal,request?:AlternativeRequest,standalone=false) {
    action=Action.parse(action);z.string().uuid().parse(id);
    if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
    if(!reason.trim()||reason.length>1000) throw Error('Invalid proposal reason');
    const prior=this.domain.proposals[id];
    if(prior) {
      if(prior.pawn!==pawn||JSON.stringify(prior.action)!==JSON.stringify(action)||prior.reason!==reason||prior.parentId!==parent?.id) throw Error('Proposal ID collision');
      return structuredClone(prior);
    }
    const alternative=request??(parent?.requestId?this.domain.requests?.[parent.requestId]:undefined);
    const replaces=alternative?(parent?parent.replacesAgreementId:standalone?undefined:alternative.agreementId):undefined;
    if(alternative){
      if(action.kind!=='rescue'||action.target!==alternative.target)throw Error('Alternative must address the requested patient');
      if(parent&&(alternative.status!=='offered'||alternative.proposalId!==parent.id))throw Error('Alternative reply superseded');
      const candidate={pawn,action,requestId:alternative.id,replacesAgreementId:replaces} as Proposal;
      if(!replaces&&!this.completedRequestAvailable(candidate))throw Error('Completed request origin or free pawn required');
      if(replaces&&!this.replacementActive(candidate))throw Error('Requested agreement is no longer active');
    }
    const haulMap=action.kind==='haul'?planHaul(this.domain,game,pawn,action):undefined;
    const rescueMap=action.kind==='rescue'?planRescue(this.domain,game,pawn,action,replaces):undefined;
    const p:Proposal={id,pawn,action,reason,status:'pending',...(alternative?{requestId:alternative.id,...(replaces?{replacesAgreementId:replaces}:{})}:{}),...(rescueMap===undefined?{}:{rescueMap}),...(haulMap===undefined?{}:{haulMap}),...(parent?{parentId:parent.id,round:(parent.round??0)+1}:{})};
    if(action.kind==='rescue'){const invalid=rescueQuestionInvalid(game,p);if(invalid)throw Error(invalid);}
    if(alternative){if(rescueMap!==alternative.mapId)throw Error('Request map changed');alternative.status='offered';alternative.proposalId=id;alternative.replyReason=reason;}
    if(parent)parent.replyId=id;
    this.domain.proposals[id]=p;this.commit(parent?'proposal-revised':'proposed','core',p);
    return structuredClone(p);
  }
  private history(proposal:Proposal):Proposal[] {
    const history:Proposal[]=[];let id=proposal.parentId;
    while(id) {
      const p=this.domain.proposals[id];
      if(!p||p.pawn!==proposal.pawn||history.length>=2||history.some(h=>h.id===id))throw Error('Invalid proposal lineage');
      history.unshift(p);id=p.parentId;
    }
    return history;
  }
  pawn(pawn:string) {
    if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
    return {withdraw:(reason:string)=>this.serial(async()=>{await this.current();await this.withdraw(pawn,reason);}),decide:(id:string,backend:DecisionBackend,timeoutMs=5000)=>this.decide(pawn,id,backend,timeoutMs)};
  }
  private async decide(pawn:string,id:string,backend:DecisionBackend,timeoutMs:number) {
    const prepared=await this.serial(async()=>{
      const game=await this.current();
      this.ingest(game);
      const p=this.domain.proposals[id];
      if(!p || p.pawn!==pawn) throw Error('Proposal does not belong to pawn');
      if(p.status!=='pending') throw Error('Proposal already decided');
      if(this.pending.has(pawn)) throw Error('Pawn already deliberating');
      if((this.domain.characters[pawn]!.commitment||this.domain.characters[pawn]!.intention)&&!this.replacementActive(p)) throw Error('Pawn already committed; reconcile outcome first');
      if(p.replacesAgreementId&&!this.replacementActive(p))throw Error('Replacement agreement no longer active');
      const own=game.pawns.find(x=>x.id===pawn);
      if(!own) throw Error('Pawn unavailable');
      if(p.action.kind==='rescue'){const invalid=rescueQuestionInvalid(game,p);if(invalid)throw Error(invalid);}
      if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>115000) throw Error('Decision timeout must be 1..115000 ms');
      const controller=new AbortController();
      const activity={epoch:game.epoch,actor:pawn,activityId:randomUUID(),ttlMs:timeoutMs+2000};
      // UI transport failure must not disable cognition. The game expires orphaned badges.
      try {await this.game.setActivity?.(activity);} catch {this.commit('indicator-unavailable',pawn,{});}
      this.pending.set(pawn,controller);
      if(p.action.kind==='rescue')this.questions.set(pawn,{controller,proposal:id});
      this.commit('deliberation-started',pawn,{proposal:id,backend:backend.name});
      const progressId=p.replacesAgreementId??(p.requestId?this.domain.requests?.[p.requestId]?.agreementId:undefined)??this.domain.characters[pawn]!.intention;
      return {generation:this.generation,controller,activity,view:structuredClone({pawn:groundedPawn(this.domain,game,own),character:this.domain.characters[pawn]!,proposal:p,...(progressId?{agreementProgress:agreementProgress(this.domain,this.domain.proposals[progressId]!,game.ticks,game.actions)}:{}),...(p.parentId?{history:this.history(p)}:{})})};
    });
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      timer=setTimeout(()=>prepared.controller.abort(),timeoutMs);
      const result=Decision.parse(await bounded(prepared.controller.signal,async()=>{
        await this.decisionPause(prepared.activity);
        prepared.controller.signal.throwIfAborted();
        return backend.decide(prepared.view,prepared.controller.signal);
      }));
      return await this.serial(async()=>{
        if(prepared.generation!==this.generation || prepared.controller.signal.aborted) throw Error('Stale decision');
        const fresh=await this.current();this.ingest(fresh);
        prepared.controller.signal.throwIfAborted();
        const p=this.domain.proposals[id]!;
        if(p.status!=='pending') throw Error('Proposal already decided');
        if(this.questions.get(pawn)?.controller===prepared.controller)this.questions.delete(pawn);
        await this.applyDecision(p,result,fresh,prepared.controller.signal);
        return structuredClone(p);
      });
    } catch(error) {
      await this.serial(async()=>{
        if(prepared.generation===this.generation) this.commit('decision-error',pawn,{proposal:id,error:String(error),fallback:'continue-native'});
      });
      throw error;
    } finally {
      clearTimeout(timer);
      try {await this.decisionPause(prepared.activity,true);} catch { /* game lease expires even if transport is lost */ }
      if(this.pending.get(pawn)===prepared.controller) this.pending.delete(pawn);
      if(this.questions.get(pawn)?.controller===prepared.controller)this.questions.delete(pawn);
      try {await this.game.setActivity?.({...prepared.activity,ttlMs:0});} catch { /* expired or old timeline */ }
    }
  }
  private replacementActive(p:Proposal):boolean {
    const old=this.domain.proposals[p.replacesAgreementId??''],r=this.domain.requests?.[p.requestId??''],ch=this.domain.characters[p.pawn];
    return !!(old&&r&&r.pawn===p.pawn&&r.agreementId===old.id&&r.status!=='closed'&&r.status!=='declined'&&p.action.kind==='rescue'&&p.action.target===r.target&&old.pawn===p.pawn&&old.action.kind==='haul'&&old.status==='accepted'&&old.standing?.status==='running'&&ch?.intention===old.id&&(!ch.commitment||ch.commitment===old.actionId));
  }
  private completedRequestAvailable(p:Proposal):boolean {
    const r=this.domain.requests?.[p.requestId??''],old=this.domain.proposals[r?.agreementId??''],ch=this.domain.characters[p.pawn];
    return !!(r&&old&&ch&&r.pawn===p.pawn&&old.pawn===p.pawn&&old.action.kind==='haul'&&old.status==='accepted'&&old.standing?.status==='completed'
      &&r.status!=='closed'&&r.status!=='declined'&&p.action.kind==='rescue'&&p.action.target===r.target&&!ch.commitment&&!ch.intention);
  }
  private refreshReceipt(p:Proposal,game:GameState) {
    const receipt=game.actions.find(a=>a.id===p.actionId&&a.actor===p.pawn);
    if(!receipt||receipt.status==='started')return;
    this.domain.outcomes[receipt.id]=receipt;
    if(this.domain.characters[p.pawn]!.commitment===receipt.id)delete this.domain.characters[p.pawn]!.commitment;
    this.finishStanding(p,receipt.status);this.commit('action-outcome',p.pawn,receipt);
  }
  private requestRescue(view:import('./attention.js').AttentionView,result:Extract<Reflection,{kind:'request_rescue'}>,fresh:GameState) {
    const old=this.domain.proposals[result.agreementId],ch=this.domain.characters[view.pawn.id]!,seen=view.pawn.casualties;
    if(!old||old.pawn!==view.pawn.id||old.action.kind!=='haul'||old.standing?.status!=='running'||ch.intention!==old.id||view.intention?.id!==old.id)throw Error('Request agreement superseded');
    if(!seen||!seen.observations.some(t=>t.target===result.target)||Object.values(this.domain.requests??{}).some(r=>r.agreementId===old.id))throw Error('Unobserved casualty or duplicate agreement request');
    const current=fresh.pawns.find(p=>p.id===view.pawn.id)?.casualties;
    if(current?.epoch===fresh.epoch&&current.tick===fresh.ticks){
      const t=current.visibleSubjects?.find(t=>t.target===result.target);
      if(current.mapId!==seen.mapId||t&&(!t.downed||t.inBed))throw Error('Observed request target changed');
    }
    const r:AlternativeRequest={id:randomUUID(),pawn:view.pawn.id,agreementId:old.id,target:result.target,mapId:seen.mapId,reason:result.reason,status:'pending'};
    (this.domain.requests??={})[r.id]=r;this.commit('alternative-requested',r.pawn,r);
  }
  private validateDecision(p:Proposal,result:Decision,fresh:GameState) {
    if(p.replacesAgreementId&&!this.replacementActive(p))throw Error('Replacement agreement no longer active');
    if(p.requestId&&!p.replacesAgreementId&&!this.completedRequestAvailable(p))throw Error('Requested standalone offer no longer valid');
    if(p.requestId&&result.kind==='counter'&&(result.action.kind!=='rescue'||p.action.kind!=='rescue'||result.action.target!==p.action.target))throw Error('Replacement counter outside requested patient');
    if(result.kind==='accept'&&p.action.kind==='rescue'){const invalid=rescueQuestionInvalid(fresh,p);if(invalid)throw Error(invalid);}
    if(result.kind==='accept'&&p.action.kind!=='move'&&!this.game.cancel)throw Error('Work requires scoped cancellation');
  }
  private async applyDecision(p:Proposal,result:Decision,fresh:GameState,signal?:AbortSignal) {
    if(p.replacesAgreementId)this.refreshReceipt(this.domain.proposals[p.replacesAgreementId]!,fresh);
    this.validateDecision(p,result,fresh);
    if(p.replacesAgreementId&&result.kind==='accept') {
      // Consent is durable before any cancellation. An interrupted handover never
      // auto-dispatches the replacement: no action ID exists until stop is confirmed.
      p.decision=result;p.status='accepted';p.standing={status:'stopped',deadline:this.observedTick+(p.action.kind==='move'?0:p.action.maxTicks),steps:[],reason:'Replacement handover not dispatched'};
      if(p.requestId)this.domain.requests![p.requestId]!.status='closed';
      this.commit('replacement-consented',p.pawn,p);
      await this.withdraw(p.pawn,('Accepted replacement: '+result.reason).slice(0,1000));
      if(this.domain.proposals[p.replacesAgreementId]!.standing?.status==='completed')throw Error('Previous agreement completed during handover');
      if(this.domain.characters[p.pawn]!.commitment)throw Error('Previous job cancellation unconfirmed');
      const after=await this.current();this.ingest(after);signal?.throwIfAborted();
      const invalid=rescueQuestionInvalid(after,{...p,status:'pending'});if(invalid)throw Error(invalid);
    }
    p.decision=result;
    p.status=result.kind==='accept'?'accepted':result.kind==='refuse'?'refused':'countered';
    if(p.requestId&&result.kind!=='counter')this.domain.requests![p.requestId]!.status='closed';
    this.domain.characters[p.pawn]!.memories.push(`${result.kind}: ${p.reason}; ${result.reason}`);
    if(result.kind==='accept') {
      p.actionId=randomUUID();this.domain.characters[p.pawn]!.commitment=p.actionId;
      if(p.action.kind!=='move') {
        p.standing={status:'running',deadline:this.observedTick+p.action.maxTicks,steps:[p.actionId]};
        this.domain.characters[p.pawn]!.intention=p.id;
      }
    }
    // Attention completion and pawn intent share the durable state commit before dispatch.
    this.commit('decided',p.pawn,p);
    if(result.kind==='accept') await this.dispatch(p);
  }
  private async dispatch(p:Proposal) {
    if(p.status!=='accepted' || !p.actionId) throw Error('Action requires pawn acceptance');
    const receipt=await this.game.move({id:p.actionId,epoch:this.domain.epoch,actor:p.pawn,action:p.action,untilTick:p.standing?.deadline,mapId:p.action.kind==='rescue'?p.rescueMap:p.haulMap});
    this.domain.outcomes[receipt.id]=receipt;
    if(receipt.status!=='started') {
      if(this.domain.characters[p.pawn]!.commitment===receipt.id)delete this.domain.characters[p.pawn]!.commitment;
      this.domain.characters[p.pawn]!.memories.push(`Action ${receipt.status}: ${receipt.reason}`);
    }
    this.finishStanding(p,receipt.status);
    this.commit('action-outcome',p.pawn,receipt);
  }
  /** Reconcile before retry; a lost response never creates a new action ID. */
  async reconcile() {
    return this.serial(async()=>{
      const game=await this.current();
      this.ingest(game);
      for(const p of Object.values(this.domain.proposals)) {
        if(!p.actionId) continue;
        if(p.standing?.status==='stopped'&&this.domain.characters[p.pawn]!.commitment===p.actionId) {
          const cancelled=await this.game.cancel!({epoch:this.domain.epoch,actor:p.pawn,id:p.actionId,kind:p.action.kind==='rescue'?'rescue':'haul'});
          game.actions=game.actions.filter(a=>a.id!==cancelled.id).concat(cancelled);
        }
        const receipt=game.actions.find(a=>a.id===p.actionId);
        if(receipt) {
          const previous=this.domain.outcomes[receipt.id];
          if(JSON.stringify(previous)!==JSON.stringify(receipt)) {
            this.domain.outcomes[receipt.id]=receipt;
            if(receipt.status!=='started') {
              if(this.domain.characters[p.pawn]!.commitment===receipt.id)delete this.domain.characters[p.pawn]!.commitment;
              this.domain.characters[p.pawn]!.memories.push(`Action ${receipt.status}: ${receipt.reason}`);
            }
            this.finishStanding(p,receipt.status);
            this.commit('action-outcome',p.pawn,receipt);
          }
        } else if(!this.domain.outcomes[p.actionId]) await this.dispatch(p);
      }
      for(const p of Object.values(this.domain.proposals)) if(p.standing?.status==='running') {
        const own=game.pawns.find(x=>x.id===p.pawn);
        if(game.ticks>=p.standing.deadline||!(p.action.kind==='rescue'?own?.rescueReady:own?.workReady))
          await this.withdraw(p.pawn,game.ticks>=p.standing.deadline?'Agreed time expired':'Needs or availability require a break');
      }
    });
  }
  private finishStanding(p:Proposal,status:string) {
    if(!p.standing||p.standing.status!=='running'||status==='started')return;
    if(status!=='completed'||p.action.kind==='rescue'||(p.action.kind==='haul'&&p.standing.steps.length>=p.action.trips)) {
      p.standing.status=status==='completed'?'completed':'stopped';
      p.standing.reason=status==='completed'?'Agreed work completed':'Work did not complete; no automatic retry';
      if(this.domain.characters[p.pawn]!.intention===p.id)delete this.domain.characters[p.pawn]!.intention;
    }
  }
  private async withdraw(pawn:string,reason:string) {
    if(!reason.trim()||reason.length>1000)throw Error('Invalid withdrawal reason');
    const character=this.domain.characters[pawn]!;
    const p=this.domain.proposals[character.intention??''];
    if(!p?.standing||p.standing.status!=='running')throw Error('No running intention');
    // Persist the stop BEFORE cancellation. Reconciliation retries uncertain cancellation,
    // never schedules another trip from a stopped intention.
    p.standing.status='stopped';p.standing.reason=reason;
    delete character.intention;
    character.memories.push(`Stopped ${p.action.kind}: ${reason}`);
    this.commit('intention-stopped',pawn,{proposal:p.id,reason});
    if(character.commitment&&p.actionId) {
      const receipt=await this.game.cancel!({epoch:this.domain.epoch,actor:pawn,id:p.actionId,kind:p.action.kind==='rescue'?'rescue':'haul'});
      if(receipt.id!==p.actionId||receipt.actor!==pawn)throw Error('Cancellation receipt does not match prior job');
      this.domain.outcomes[receipt.id]=receipt;
      if(receipt.status==='completed'&&p.action.kind==='haul'&&p.standing.steps.length>=p.action.trips){
        p.standing.status='completed';p.standing.reason='Agreed work completed before cancellation';
      }
      if(receipt.status!=='started')delete character.commitment;
      this.commit('action-outcome',pawn,receipt);
    }
  }
  /** Explicit operator polling advances only previously accepted, fixed-scope work.
   * Separate from reconciliation so quiescent between-trip checkpoints are possible. */
  async advanceIntentions() {
    await this.reconcile();
    return this.serial(async()=>{
      const game=await this.current();
      for(const p of Object.values(this.domain.proposals)) {
        if(p.standing?.status!=='running'||p.action.kind!=='haul')continue;
        const c=this.domain.characters[p.pawn]!;
        if(c.commitment||this.pending.has(p.pawn))continue;
        if(game.ticks>=p.standing.deadline||!game.pawns.find(x=>x.id===p.pawn)?.workReady) {
          await this.withdraw(p.pawn,'Needs, availability or expiry require a break');continue;
        }
        p.actionId=randomUUID();p.standing.steps.push(p.actionId);c.commitment=p.actionId;
        this.commit('intention-trip',p.pawn,{proposal:p.id,action:p.actionId});
        await this.dispatch(p);
      }
    });
  }
  private cancelDecisions() {
    this.generation++;
    for(const controller of this.pending.values()) controller.abort();
    this.pending.clear();this.questions.clear();
    this.attending.clear();
    this.recoverAttention('Attention cancelled for checkpoint or restore; no automatic retry');
  }
  private recoverAttention(reason:string) {
    if(!this.domain) return;
    for(const c of Object.values(this.domain.characters)) if(c.attention?.last?.status==='running') {
      c.attention.last.status='interrupted';c.attention.last.reason=reason;
      this.commit('attention-interrupted',c.id,c.attention.last);
    }
  }
  async checkpoint(name:string) {
    return this.serial(async()=>{
      await this.current();
      // MVP checkpoints are quiescent; active-job continuation is explicitly deferred.
      if(Object.values(this.domain.characters).some(c=>c.commitment)) throw Error('Reconcile/finish active actions before checkpoint');
      if(!/^lab-concord-[a-zA-Z0-9-]{1,40}$/.test(name)) throw Error('Invalid checkpoint name');
      try { this.store.saved(name); throw Error('Checkpoint already exists'); }
      catch(e) { if(String(e)!=='Error: Unknown paired checkpoint') throw e; }
      this.cancelDecisions();
      await this.publishCrew();
      const saved=await this.game.save(name);
      await this.current();
      this.store.checkpoint(name,this.domain,saved.sha256);
      this.commit('checkpoint','operator',{name,sha256:saved.sha256});
      return saved;
    });
  }
  async restore(name:string) {
    return this.serial(async()=>{
      const saved=this.store.saved(name);
      await this.game.verify(name,saved.sha256);
      this.cancelDecisions();
      // Invalidate the local binding before loading; a partial restore fails closed.
      this.domain={...saved.state,epoch:'restoring'};
      this.commit('restore-started','operator',{name});
      await this.game.load(name);
      const game=await this.game.state();
      if(!game.loaded || game.world!==saved.state.world) throw Error('Restored world mismatch');
      this.domain={...saved.state,epoch:game.epoch,branch:randomUUID()};
      this.observedTick=game.ticks;
      this.recoverAttention('Restored an unfinished attention attempt; no automatic retry');
      this.commit('restored','operator',{name,from:saved.state.branch});
    });
  }
}
