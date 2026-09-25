import {fitReflection} from './model-perspective.js';
import {CoreAnswerChoice,EatingRevalidationError,revalidateEating,eatingOptions} from './pawn-eating.js';
import {planProduction,workMap,workSteps,workReady,workKind} from './production-planning.js';
import {sharedFood,foodLines} from './food-observation.js';
import {sharedStatus,type SharedStatus} from './shared-status.js';
import {deferredOffers} from './reoffers.js';
import {CoreScheduleConfig,coreAdmission} from './core-scheduler.js';
import {questionContext,coreView,fitCore,validateCoreChoice,CoreChoice,CoreRejection,coreFailureCause,type CoreBackend,type CoreAnswerBackend,type CoreQuestionView} from './core-planner.js';
import {observedPeople} from './observed-names.js';
import {reviseOutlook} from './outlook.js';
import {SocialChoice,socialContact,type SocialBackend,type SocialView,type SocialExchange,type SocialMessage} from './social.js';
import {recordCrew,crewReport,agreementProgress} from './crew-log.js';
import {newestReceiptTick} from './observation-age.js';
import {NativeHaulConfig,NativeHaulEntry,nativeEntries,orderedEntries,fromLegacy,IntentView,planIntentOffer,counterAdoptable,notOfferedReason,progress as intentProgress} from './native-intents.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Decision, Action, type Domain, type GameBridge, type DecisionBackend, type GameState, type Proposal,type AlternativeRequest } from './protocol.js';
import type { AppraisalView } from './appraisal.js';
import {rescueQuestionInvalid} from './decision-validity.js';
import { nativeAttention,attentionInterrupt,isFoodMemory } from './routing.js';
import { Store } from './store.js';
import {rescueView,planRescue} from './rescue-planning.js';
import {groundedPawn} from './grounded-pawn.js';
import { AttentionOptions, Reflection, bounded, coalesce, type AttentionBackend, type AppraisalBackend, type AttentionResult,type AttentionAdmission } from './attention.js';

/** Old stores stay readable via Store, but retired/unknown actions are not executable state.
 * Check before any restore, recovery or status rewrite; never reinterpret old trip counts. */
function requireSupportedStoredActions(domain:Domain){
 const check=(action:unknown)=>{
  if(!Action.safeParse(action).success)throw Error('Stored action is unsupported by this coordinator; use its original version for historical replay. No automatic migration.');
 };
 for(const p of Object.values(domain.proposals)){
  check(p.action);if(p.decision?.kind==='counter')check(p.decision.action);
 }
 for(const r of Object.values(domain.reoffers??{}))check(r.action);
}

/** Character handles bind identity in code; backend output cannot choose an actor. */
export class Coordinator {
  private domain!:Domain;
  private queue:Promise<unknown>=Promise.resolve();
  private generation=0;
  private pending=new Map<string,AbortController>();
  private questions=new Map<string,{controller:AbortController;proposal:string}>();
  private attending=new Map<string,{controller:AbortController;throughSeq:number}>();
  private observedTick=0;
  private status:SharedStatus[]=[];
  private food:{epoch:string;lines:string[]}={epoch:'',lines:[]};
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
    const report=crewReport(this.domain,this.observedTick,this.status.filter(s=>s.epoch===this.domain.epoch&&s.tick<=this.observedTick),[...this.pending.keys()]);report.foodLines=this.food.epoch===this.domain.epoch?this.food.lines:[];const key=JSON.stringify(report);
    if(key===this.crewPublished)return;
    try{await this.game.setCrewLog(report);this.crewPublished=key;this.crewSyncError=undefined;}
    catch(e){this.crewSyncError=String(e); /* Presentation failure grants no gameplay authority. Retry on next operation. */}
  }
  private noteOtherLaneFailure(lane:string,cause:string){
    const d=this.domain.diagnostics??={attentionGaps:0,attentionGapKinds:{}};
    const f=(d.laneFailures??={})[lane]??={total:0,causes:{}};f.total++;f.causes[cause]=(f.causes[cause]??0)+1;
  }
  private commit(kind:string,actor:string,data:unknown) {
    recordCrew(this.domain,kind,actor,data,this.observedTick);
    this.store.commit(this.domain,{branch:this.domain.branch,kind,actor,data});
  }
  async open() {
    return this.serial(async()=>{
      if(this.pending.size)throw Error('Cannot reopen while decisions are running');
      const previous=this.store.read();
      if(previous)requireSupportedStoredActions(previous);
      const game=await this.game.state();
      if(!game.loaded) throw Error('No loaded game');
      if(previous) {
        this.domain=previous;
        if(previous.epoch!==game.epoch || previous.world!==game.world) throw Error('Timeline changed: restore a paired checkpoint');
        this.migrateNativeScope();
        this.recoverHandovers();
        this.recoverAttention('Coordinator restarted during attention; no automatic retry');
      } else {
        this.domain={schema:1,world:game.world,epoch:game.epoch,branch:randomUUID(),characters:{},proposals:{},outcomes:{}};
        for(const p of game.pawns) this.domain.characters[p.id]={id:p.id,name:p.name,memories:[]};
        this.commit('initialized','operator',{pawns:Object.keys(this.domain.characters)});
      }
      this.observedTick=game.ticks;this.status=sharedStatus(this.domain,game);this.food={epoch:game.epoch,lines:foodLines(sharedFood(this.domain,game))};
    });
  }
  private migrateNativeScope(){
    // Historical nativeHaul stores and checkpoints were frozen intent-only scenes.
    // Absence of the new flag is not permission to expose other work on restore.
    if(this.domain.nativeHaul&&this.domain.nativeIntentOnly===undefined){
      this.domain.nativeIntentOnly=true;
      this.commit('native-scope-migrated','operator',{intentOnly:true});
    }
  }
  private async current():Promise<GameState> {
    if(!this.domain) throw Error('Coordinator not opened');
    const game=await this.game.state();
    if(!game.loaded || game.world!==this.domain.world || game.epoch!==this.domain.epoch) throw Error('Stale timeline');
    this.observedTick=game.ticks;this.status=sharedStatus(this.domain,game);this.food={epoch:game.epoch,lines:foodLines(sharedFood(this.domain,game))};
    return game;
  }
  private ingest(game:GameState) {
    this.observedTick=game.ticks;this.status=sharedStatus(this.domain,game);this.food={epoch:game.epoch,lines:foodLines(sharedFood(this.domain,game))};
    for(const e of Object.values(this.domain.exchanges??{}))if(e.status!=='closed'&&game.ticks>e.expiresTick){
      if(e.status==='running')this.pending.get(e.turn==='opening'?e.initiator:e.recipient)?.abort();
      e.status='closed';this.commit('social-expired','operator',{id:e.id});
    }
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
    for(const rawEvent of events) {
      const own=game.pawns.find(p=>p.id===rawEvent.pawn);
      const subject=own&&observedPeople(game,own).find(p=>p.id===rawEvent.subject);
      const event={...rawEvent,...(subject?{subjectName:subject.name}:{})};
      const character=this.domain.characters[event.pawn];
      if(!character) continue;
      const routed=nativeAttention(event),next=routed.next;
      // A pawn's own meal memory never cancels its answer to the core (often about that meal):
      // while an answer is pending it is queued behind it instead of interrupting.
      const answering=!!this.domain.coreState?.questions.some(q=>q.pawn===event.pawn&&q.status==='running');
      const foodQueued=routed.interrupt&&answering&&isFoodMemory(event),interrupt=routed.interrupt&&!foodQueued;
      const experiences=character.experiences??=[];
      experiences.push({event,route:next,interrupt});
      if(experiences.length>64) {
        const evicted=experiences.shift()!;
        if(evicted.event.seq>(character.attention?.cursor??0)&&evicted.route!=='native'){
          // Counted as a failure with its cause: an unprocessed experience was lost.
          const d=this.domain.diagnostics??={attentionGaps:0,attentionGapKinds:{}};d.attentionGaps++;d.attentionGapKinds[evicted.event.kind]=(d.attentionGapKinds[evicted.event.kind]??0)+1;
          this.commit('attention-gap',event.pawn,{seq:evicted.event.seq,kind:evicted.event.kind});
        }
      }
      const pending=this.pending.get(event.pawn);
      if(pending&&!pending.signal.aborted) {
        if(interrupt){
          this.commit('decision-interrupted',event.pawn,{seq:event.seq,kind:event.kind,reason:'New interrupting experience'});
          pending.abort(Error('New interrupting experience'));
        }else if(foodQueued)this.commit('experience-deferred',event.pawn,{seq:event.seq,kind:event.kind,detail:event.detail,reason:'Meal memory queued behind the pawn\'s answer'});
        else if(event.kind==='memory')this.commit('experience-deferred',event.pawn,{seq:event.seq,kind:event.kind,detail:event.detail,reason:'Conversation queued behind current thought'});
      }
      this.domain.eventCursor=event.seq;
      this.commit('native-event',event.pawn,{event,route:next});
    }
    this.domain.eventCursor=game.eventSeq;
    if(cursor!==game.eventSeq) this.commit('native-cursor','operator',{seq:game.eventSeq});
  }
  /** Polling is operator-owned. Routes are durable attention records, not automatic orders. */
  async observe() {return this.serial(async()=>{this.ingest(await this.current());});}
  /** Operator selects a bounded encounter, not its speech or either pawn's actions.
   * An idempotent ID prevents re-opening the same encounter after a lost reply. */
  async openSocial(id:string,initiator:string,recipient:string) {
    z.string().uuid().parse(id);
    return this.serial(async()=>{
      const game=await this.current();this.ingest(game);
      const old=this.domain.exchanges?.[id];
      if(old){if(old.initiator!==initiator||old.recipient!==recipient)throw Error('Social ID collision');return structuredClone(old);}
      socialContact(game,initiator,recipient);
      if(!this.domain.characters[initiator]||!this.domain.characters[recipient])throw Error('Unknown social participant');
      if(this.pending.has(initiator)||this.pending.has(recipient))throw Error('Social participant busy');
      const exchanges=this.domain.exchanges??={};
      // Fixed per-timeline bound; no autonomous encounter pump or endless history.
      if(Object.keys(exchanges).length>=32)throw Error('Social encounter limit');
      if(Object.values(exchanges).some(e=>e.status!=='closed'&&[e.initiator,e.recipient].some(p=>p===initiator||p===recipient)))throw Error('Social encounter already open');
      const exchange:SocialExchange={id,initiator,recipient,openedTick:game.ticks,expiresTick:game.ticks+3600,status:'opening',turn:'opening',messages:[]};
      exchanges[id]=exchange;this.commit('social-opened','operator',{id,initiator,recipient});return structuredClone(exchange);
    });
  }
  async closeSocial(id:string) {return this.serial(async()=>{
    await this.current();const e=this.domain.exchanges?.[id];if(!e)throw Error('Unknown social encounter');
    if(e.status==='running')this.pending.get(e.turn==='opening'?e.initiator:e.recipient)?.abort();
    e.status='closed';this.commit('social-closed','operator',{id});
  });}
  /** Consumes one speech opportunity before inference; failure/silence never rerolls. */
  async socialTurn(pawn:string,id:string,backend:SocialBackend,timeoutMs=5000,signal=new AbortController().signal) {
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>115000)throw Error('Social timeout must be 1..115000 ms');
    const prepared=await this.serial(async()=>{
      signal.throwIfAborted();const game=await this.current();this.ingest(game);
      const e=this.domain.exchanges?.[id];
      if(!e||(e.status!=='opening'&&e.status!=='reply'))throw Error('Social turn unavailable');
      const from=e.turn==='opening'?e.initiator:e.recipient,to=e.turn==='opening'?e.recipient:e.initiator;
      if(pawn!==from)throw Error('Social turn belongs to another pawn');
      if(game.ticks>e.expiresTick){e.status='closed';this.commit('social-expired',pawn,{id});throw Error('Social encounter expired');}
      if(this.pending.has(from)||this.pending.has(to))throw Error('Social participant busy');
      let contact:ReturnType<typeof socialContact>;
      try{contact=socialContact(game,from,to);}catch(error){
        e.status='closed';this.commit('social-contact-lost',pawn,{id});throw error;
      }
      const {own,other}=contact,character=this.domain.characters[from]!;
      const controller=new AbortController();this.pending.set(from,controller);
      // Reserve both participants against concurrently taking a stale private perspective.
      this.pending.set(to,controller);
      e.status='running';this.commit('social-started',pawn,{id,turn:e.turn,backend:backend.name});
      const view:SocialView=structuredClone({pawn:groundedPawn(this.domain,game,own),character,contact:{id:other.id,name:other.name},exchange:{id,turn:e.turn,messages:e.messages},
        ...(character.intention?{intention:this.domain.proposals[character.intention],agreementProgress:agreementProgress(this.domain,this.domain.proposals[character.intention]!,game.ticks,game.actions)}:{})});
      return {view,from,to,generation:this.generation,controller,activity:{epoch:game.epoch,actor:pawn,activityId:randomUUID(),ttlMs:timeoutMs+2000}};
    });
    const combined=AbortSignal.any([signal,prepared.controller.signal]);
    const timer=setTimeout(()=>prepared.controller.abort(),timeoutMs);
    try{
      const choice=SocialChoice.parse(await bounded(combined,async()=>{
        await this.decisionPause(prepared.activity);combined.throwIfAborted();
        try{await this.game.setActivity?.(prepared.activity);}catch{}
        combined.throwIfAborted();return backend.speak(prepared.view,combined);
      }));
      return await this.serial(async()=>{
        combined.throwIfAborted();if(this.generation!==prepared.generation)throw Error('Stale social turn');
        const game=await this.current();this.ingest(game);combined.throwIfAborted();
        const e=this.domain.exchanges?.[id];
        if(!e||e.status!=='running'||e.turn!==prepared.view.exchange.turn||game.ticks>e.expiresTick)throw Error('Social encounter superseded');
        const contact=socialContact(game,prepared.from,prepared.to);
        if(choice.choice==='stay_silent'){e.status='closed';this.commit('social-silent',pawn,{id});return {status:'silent' as const};}
        const message:SocialMessage={id:randomUUID(),exchangeId:id,tick:game.ticks,from:prepared.from,to:prepared.to,fromName:contact.own.name.slice(0,120),toName:contact.other.name.slice(0,120),text:choice.text};
        e.messages.push(message);e.status=e.turn==='opening'?'reply':'closed';e.turn='reply';
        for(const actor of [prepared.from,prepared.to]){
          const c=this.domain.characters[actor]!;c.messages=[...(c.messages??[]),structuredClone(message)].slice(-16);
        }
        this.commit('social-delivered',pawn,message);return {status:'delivered' as const,message:structuredClone(message)};
      });
    }catch(error){
      await this.serial(async()=>{
        if(this.generation===prepared.generation){const e=this.domain.exchanges?.[id];if(e)e.status='closed';this.commit('social-failed',pawn,{id,error:String(error)});}
      });
      return {status:combined.aborted?'interrupted' as const:'failed' as const};
    }finally{
      clearTimeout(timer);
      try{await this.decisionPause(prepared.activity,true);}catch{}
      for(const actor of [prepared.from,prepared.to])if(this.pending.get(actor)===prepared.controller)this.pending.delete(actor);
      try{await this.game.setActivity?.({...prepared.activity,ttlMs:0});}catch{}
      await this.serial(async()=>{});
    }
  }
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
        deferredOffers:deferredOffers(this.domain,pawn),
        requests:Object.values(this.domain.requests??{}).filter(r=>r.pawn===pawn).slice(-8),
        histories:Object.fromEntries(Object.values(this.domain.proposals).filter(p=>p.pawn===pawn&&p.status==='pending'&&p.parentId).slice(0,8).map(p=>[p.id,this.history(p)]))});
      return {status:'running' as const,generation:this.generation,controller,activity,view,throughSeq,significant,lease};
    });
    if(prepared.status!=='running') return {pawn,status:prepared.status,throughSeq:'throughSeq' in prepared?prepared.throughSeq:undefined};
    const combined=AbortSignal.any([signal,prepared.controller.signal]);
    const timer=setTimeout(()=>prepared.controller.abort(),config.timeoutMs);
    let shown=prepared.view;
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
        // The model is shown the trimmed copy; it is also what the channel records as the input.
        shown=fitReflection(prepared.view);
        return Reflection.parse(await backend.reflect(structuredClone(shown),combined));
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
          const next=reviseOutlook(shown.character,result.update,this.observedTick);
          if((character.outlook?.revision??0)!==result.update.expectedRevision)throw Error('Private outlook superseded');
          character.outlook=next;
          character.attention!.last={status:'continued',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          this.commit('outlook-revised',pawn,{...reflection,outlook:next});
          return {pawn,status:'continued',throughSeq};
        }
        if(result.kind==='request_reoffer') {
          if(!prepared.view.deferredOffers.some(p=>p.id===result.proposalId))throw Error('Re-invitation outside supplied perspective');
          this.requestReoffer(pawn,result.proposalId,result.reason,fresh);
          character.attention!.last={status:'continued',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          this.commit('attention-requested',pawn,reflection);
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
          const cause=coreFailureCause(error,{cancelled:combined.aborted,deadline:false,returned:false});this.noteOtherLaneFailure('reflection',cause);
          this.commit('attention-error',pawn,{throughSeq:prepared.throughSeq,status,cause,error:String(error),fallback:'continue-native'});
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
      await this.serial(async()=>{});
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
  /** Explicit operator briefing starts a bounded core; not inferred from private state. */
  async initializeCore(brief:string) {return this.serial(async()=>{
    await this.current();z.string().trim().min(1).max(600).parse(brief);
    if(this.domain.coreState){if(this.domain.coreState.brief.text!==brief)throw Error('Core already initialized');return;}
    this.domain.coreState={revision:0,brief:{id:'brief',text:brief},topics:[],questions:[],turns:[]};
    this.commit('core-initialized','operator',{brief});
  });}
  async corePerspective(){return this.serial(async()=>{const g=await this.current();return coreView(this.domain,g);});}
  async configureCoreSchedule(raw:CoreScheduleConfig){return this.serial(async()=>{
    const config=CoreScheduleConfig.parse(raw),game=await this.current(),state=this.domain.coreState;
    if(!state)throw Error('Core not initialized');
    if(state.schedule){if(JSON.stringify(state.schedule.config)!==JSON.stringify(config))throw Error('Core schedule immutable');return;}
    if(state.turns.length)throw Error('Schedule must precede first core turn');
    state.schedule={config,startTick:game.ticks,endTick:config.windowTicks===null?null:game.ticks+config.windowTicks,attempts:0,consumed:{}};
    this.commit('core-scheduled','operator',{config});
  });}
  async planCoreWhenDue(backend:CoreBackend,timeoutMs=45000,signal=new AbortController().signal){
    return this.runCore(backend,timeoutMs,signal,true);
  }
  async planCore(backend:CoreBackend,timeoutMs=45000,signal=new AbortController().signal){
    return this.runCore(backend,timeoutMs,signal,false);
  }
  private async runCore(backend:CoreBackend,timeoutMs:number,signal:AbortSignal,scheduled:boolean){
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>115000)throw Error('Invalid core timeout');
    const prepared=await this.serial(async()=>{
      signal.throwIfAborted();const game=await this.current();signal.throwIfAborted();
      const state=this.domain.coreState;if(!state)throw Error('Core not initialized');
      if(!!state.schedule!==scheduled)throw Error('Core scheduling mode mismatch');
      if(state.schedule?.config.maxAttempts!==null&&state.turns.length>=16||this.pending.has('core'))return {idle:'unavailable'} as const;
      let causes:import('./core-scheduler.js').CoreWake[]=[];
      if(scheduled){
        const admission=coreAdmission(state.schedule!,coreView(this.domain,game));
        if(!admission.ready){
          if(admission.silent){
            state.schedule!.consumed=admission.silent.snapshot;state.silentWake={tick:game.ticks,causes:admission.silent.causes};
            this.commit('core-wake-silent','core',{tick:game.ticks,causes:admission.silent.causes});
          }
          return {idle:admission.reason} as const;
        }
        causes=admission.causes;
        // Reserve and consume before inference. Failed calls are not retried.
        state.schedule!.attempts++;state.schedule!.lastAttemptTick=game.ticks;state.schedule!.consumed=admission.snapshot;
      }
      const controller=new AbortController(),id=randomUUID();this.pending.set('core',controller);
      delete state.silentWake;
      state.turns.push({id,status:'running'});state.revision++;this.commit('core-started','core',{id,causes});
      const view=coreView(this.domain,game);
      const heard=[...new Set(causes.filter(w=>w.kind==='message').map(w=>view.messages.find(m=>m.id===w.sourceId)?.from).filter((p):p is string=>!!p&&p!=='core'))];
      return {id,controller,generation:this.generation,heard,view:{...view,...(scheduled?{wakeReasons:causes}:{})}};
    });
    if('idle' in prepared)return {status:'idle' as const,reason:prepared.idle};
    let timedOut=false,returned=false,raw:unknown;
    const combined=AbortSignal.any([signal,prepared.controller.signal]),timer=setTimeout(()=>{timedOut=true;prepared.controller.abort();},timeoutMs);
    try{
      // The model is shown the trimmed copy; it is also what the channel records as the core input.
      const shown=fitCore(prepared.view);
      raw=await bounded(combined,()=>backend.plan(structuredClone(shown),combined));returned=true;
      const choice=validateCoreChoice(raw,shown);
      return await this.serial(async()=>{
        combined.throwIfAborted();if(this.generation!==prepared.generation)throw Error('Stale core turn');
        const g=await this.current();combined.throwIfAborted();
        const state=this.domain.coreState!;
        if(state.schedule&&state.schedule.endTick!==null&&g.ticks>=state.schedule.endTick)throw Error('Core schedule expired during inference');
        if(state.revision!==prepared.view.revision)throw Error('Core perspective superseded');
        validateCoreChoice(choice,coreView(this.domain,g)); // physical/consent availability can change during thought
        const turn=state.turns.find(t=>t.id===prepared.id)!;if(turn.status!=='running')throw Error('Core attempt retired');
        const a=choice.action;let proposalId:string|undefined,questionId:string|undefined;
        if(a.kind==='propose'){
          const op=prepared.view.opportunities.find(o=>o.id===a.opportunityId)!;
          proposalId=this.propose(g,op.pawn,op.action,a.reason,randomUUID(),undefined,undefined,false,op.reofferRequestId).id;
        }else if(a.kind==='adopt_counter'){
          const parent=this.domain.proposals[a.proposalId];
          if(!parent||parent.status!=='countered'||parent.decision?.kind!=='counter'||parent.replyId||(parent.round??0)>=2)throw Error('Counter unavailable');
          proposalId=this.propose(g,parent.pawn,parent.decision.action,a.reason,randomUUID(),parent).id;
        }else if(a.kind==='ask'){
          questionId=randomUUID();const m:SocialMessage={id:randomUUID(),exchangeId:questionId,tick:g.ticks,from:'core',to:a.pawn,fromName:'Core',toName:this.domain.characters[a.pawn]!.name,text:a.text};
          state.questions.push({id:questionId,pawn:a.pawn,text:a.text,status:'pending',messages:[m],...(a.reportSelfCareId?{reportSelfCareId:a.reportSelfCareId}:{}),...(state.schedule?.config.maxAttempts===null?{context:questionContext(this.domain,g,a.pawn)}:{})});
          const ch=this.domain.characters[a.pawn]!;ch.messages=[...(ch.messages??[]),structuredClone(m)].slice(-16);
          this.commit('core-question','core',{...m,...this.asOf(prepared.view.tick,g)});
        }
        for(const change of choice.topics){const update={...change,basedOnTick:prepared.view.tick,updatedTick:g.ticks};let topic=state.topics.find(t=>t.sourceId===update.sourceId);
          if(!topic){topic={...update,proposalIds:this.domain.proposals[update.sourceId]?[update.sourceId]:[]};state.topics.push(topic);}else Object.assign(topic,update);
        }
        if(proposalId&&choice.actionTopicId){const topic=state.topics.find(t=>t.sourceId===choice.actionTopicId)!;if(!topic.proposalIds.includes(proposalId))topic.proposalIds.push(proposalId);}
        // Heard but not answered: pawns whose message woke this turn and to whom it sent nothing
        // (no question, no offer). Shown whatever the core chose, not only on a wait.
        const addressed=a.kind==='ask'?a.pawn:proposalId?this.domain.proposals[proposalId]?.pawn:undefined;
        const heard=prepared.heard.filter(p=>p!==addressed);
        Object.assign(turn,{status:'applied',choice,...(proposalId?{proposalId}:{}),...(questionId?{questionId}:{}),...(heard.length?{heard}:{})});state.revision++;
        this.commit('core-planned','core',{id:prepared.id,kind:a.kind,reason:a.reason,...this.asOf(prepared.view.tick,g)});
        return {status:'applied' as const,proposalId,questionId,choice};
      });
    }catch(error){
      await this.serial(async()=>{if(this.generation===prepared.generation){const state=this.domain.coreState!,turn=state.turns.find(t=>t.id===prepared.id)!;turn.status='failed';if(state.schedule?.config.maxAttempts===null&&state.turns.slice(-3).length===3&&state.turns.slice(-3).every(t=>t.status==='failed'))state.schedule.blocked='Repeated core failures; operator diagnosis required';state.revision++;
        // Shown in-game: the cause, and for a rejected offer or question, whom it was for.
        const cause=coreFailureCause(error,{cancelled:signal.aborted,deadline:timedOut,returned});
        const f=state.failures??={total:0,causes:{}};f.total++;f.causes[cause]=(f.causes[cause]??0)+1;
        const parsed=CoreChoice.safeParse(raw),rejection=CoreRejection.safeParse((error as any)?.coreRejection),a=parsed.success?parsed.data.action:undefined;
        const pawn=a?.kind==='propose'?prepared.view.opportunities.find(o=>o.id===a.opportunityId)?.pawn:a?.kind==='adopt_counter'?prepared.view.counters.find(p=>p.id===a.proposalId)?.pawn:a?.kind==='ask'&&prepared.view.crew.some(p=>p.id===a.pawn)?a.pawn:undefined;
        this.commit('core-failed','core',{id:prepared.id,error:String(error).slice(0,300),cause,...(a?{action:{kind:a.kind,...(pawn?{pawn}:{})}}:rejection.success&&rejection.data.action?{action:{kind:rejection.data.action.kind,...(prepared.view.crew.some(p=>p.id===rejection.data.action?.pawn)?{pawn:rejection.data.action.pawn}:{})}}:{})});}});
      return {status:combined.aborted?'interrupted' as const:'failed' as const};
    }finally{clearTimeout(timer);if(this.pending.get('core')===prepared.controller)this.pending.delete('core');await this.serial(async()=>{});}
  }
  async answerCoreQuestion(id:string,backend:CoreAnswerBackend,timeoutMs=45000,signal=new AbortController().signal){
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>115000)throw Error('Invalid question timeout');
    const prepared=await this.serial(async()=>{
      signal.throwIfAborted();const g=await this.current();this.ingest(g);signal.throwIfAborted();
      const q=this.domain.coreState?.questions.find(q=>q.id===id);
      if(!q||q.status!=='pending'||this.pending.has(q.pawn))throw Error('Question unavailable');
      const own=g.pawns.find(p=>p.id===q.pawn);if(!own||own.downed){q.status='failed';this.commit('core-answer-unavailable',q.pawn,{id});throw Error('Pawn unavailable');}
      const controller=new AbortController();this.pending.set(q.pawn,controller);q.status='running';this.commit('core-answer-started',q.pawn,{id});
      const view:CoreQuestionView={observedTick:g.ticks,pawn:groundedPawn(this.domain,g,own),character:structuredClone(this.domain.characters[q.pawn]!),question:{id,text:q.text,from:'core'}};
      if(q.reportSelfCareId)view.question.reportSelfCare=coreView(this.domain,g).selfCare.find(c=>c.id===q.reportSelfCareId&&c.pawn===q.pawn);
      view.pawn.eating=own.eating?{...structuredClone(own.eating),options:this.game.eat?eatingOptions(this.domain,g,own):[]}:undefined;
      return {pawn:q.pawn,controller,generation:this.generation,view};
    });
    const combined=AbortSignal.any([signal,prepared.controller.signal]),timer=setTimeout(()=>prepared.controller.abort(),timeoutMs);
    try{
      const choice=CoreAnswerChoice.parse(await bounded(combined,()=>backend.answerCore(prepared.view,combined)));
      if(choice.choice==='eat'&&!prepared.view.pawn.eating?.options.some(o=>o.thing===choice.thing))throw Error('Eating choice was not offered');
      return await this.serial(async()=>{
        combined.throwIfAborted();if(this.generation!==prepared.generation)throw Error('Stale answer');
        const g=await this.current();this.ingest(g);combined.throwIfAborted();const q=this.domain.coreState!.questions.find(q=>q.id===id)!;
        if(q.status!=='running'||!g.pawns.some(p=>p.id===q.pawn&&!p.downed))throw Error('Question no longer answerable');
        if(choice.choice==='stay_silent'){q.status='silent';this.domain.coreState!.revision++;this.commit('core-answer-silent',q.pawn,{id});return {status:'silent' as const};}
        const ch=this.domain.characters[q.pawn]!;
        let care:import('./protocol.js').SelfCare|undefined;
        if(choice.choice==='eat'){
          const own=g.pawns.find(p=>p.id===q.pawn)!;const action=eatingOptions(this.domain,g,own).find(o=>o.thing===choice.thing);
          const validation=revalidateEating(this.domain,g,own,prepared.view.pawn,choice.thing,!!this.game.eat);
          if(validation.code)throw new EatingRevalidationError(validation);
          if(!action||validation.dispatchCount===null)throw Error('Validated eating option missing');
          care={id:randomUUID(),pawn:q.pawn,questionId:id,action:{...structuredClone(action),count:validation.dispatchCount},mapId:own.eating!.mapId,untilTick:g.ticks+action.maxTicks};
          (this.domain.selfCare??={})[care.id]=care;ch.commitment=care.id;
        }
        const m:SocialMessage={id:randomUUID(),exchangeId:id,tick:g.ticks,from:q.pawn,to:'core',fromName:ch.name,toName:'Core',text:choice.text};
        q.messages.push(m);q.status='answered';ch.messages=[...(ch.messages??[]),structuredClone(m)].slice(-16);
        this.domain.coreState!.revision++;this.commit('core-answer',q.pawn,{...m,...this.asOf(prepared.view.observedTick,g)});
        if(care){this.commit('self-care-chosen',q.pawn,care);await this.dispatchEating(care);}
        return {status:'delivered' as const};
      });
    }catch(error){await this.serial(async()=>{if(this.generation===prepared.generation){const q=this.domain.coreState!.questions.find(q=>q.id===id)!;q.status='failed';this.domain.coreState!.revision++;const cause=error instanceof EatingRevalidationError?'eating: '+error.validation.code:coreFailureCause(error,{cancelled:combined.aborted,deadline:false,returned:false});this.noteOtherLaneFailure('core-answer',cause);this.commit('core-answer-failed',q.pawn,{id,cause,error:String(error),...(error instanceof EatingRevalidationError?{eatingValidation:error.validation}:{})});}});return {status:combined.aborted?'interrupted' as const:'failed' as const};}
    finally{clearTimeout(timer);if(this.pending.get(prepared.pawn)===prepared.controller)this.pending.delete(prepared.pawn);await this.serial(async()=>{});}
  }
  /** Freeze the one shared native intent the core may offer. Pawns the game says cannot
   * haul are never offered it; the reason is recorded where a viewer can see it. */
  configureNativeHaul(raw:NativeHaulConfig){return this.serial(async()=>{
    const game=await this.current(),c=NativeHaulConfig.parse(raw);
    if(this.domain.nativeHaul&&JSON.stringify(this.domain.nativeHaul)!==JSON.stringify(c))throw Error('Native haul setup already frozen');
    if(this.domain.nativeHauls&&!this.domain.nativeHaul)throw Error('Native haul list already frozen');
    if(!this.game.intent)throw Error('Native intent bridge unavailable');
    this.domain.nativeHaul=c;this.domain.nativeHauls=[fromLegacy(c)];this.domain.nativeIntentOnly=true;this.commit('native-haul-configured','operator',c);
    this.recordNotOffered(game,c.intentId);
    return structuredClone(c);
  });}
  /** Migration (B2/B5): freeze the operator's list of stockpile hauls. Existing-stockpile
   * entries take their rectangle from the game's stockpile list; each (zone or site, def) is
   * at most one entry. */
  configureNativeHauls(raw:unknown[],options:{intentOnly?:boolean;experimentalGrowing?:boolean}={}){return this.serial(async()=>{
    const game=await this.current();
    if(!this.game.intent)throw Error('Native intent bridge unavailable');
    const entries=raw.map(r=>{
      const e=r as Record<string,unknown>,zone=typeof e.zoneId==='number'&&e.zoneId>=0?(game.stockpiles??[]).find(s=>s.zoneId===e.zoneId):undefined;
      if(typeof e.zoneId==='number'&&e.zoneId>=0&&!zone)throw Error('Unknown stockpile '+e.zoneId);
      return NativeHaulEntry.parse(zone?{...e,x:zone.x,z:zone.z,w:zone.w,h:zone.h}:e);
    });
    // The growing hold is parked after B1's two rounds: only an explicit experiment may use it.
    if(entries.some(e=>e.hold==='growing')&&!options.experimentalGrowing)throw Error('Growing hold is parked; strict is the migration configuration');
    const keys=entries.map(e=>`${e.zoneId>=0?'zone:'+e.zoneId:'site:'+e.siteId}:${e.thing}`);
    if(new Set(keys).size!==keys.length||new Set(entries.map(e=>e.intentId)).size!==entries.length)throw Error('Duplicate stockpile haul entries');
    const frozen=orderedEntries(entries);
    if(this.domain.nativeHauls&&JSON.stringify(this.domain.nativeHauls)!==JSON.stringify(frozen))throw Error('Native haul list already frozen');
    if(this.domain.nativeHauls&&!!this.domain.nativeIntentOnly!==!!options.intentOnly)throw Error('Native haul list already frozen');
    // Ordinary play keeps rescue, construction and cooking; only ordered hauling is replaced.
    // intentOnly is for frozen scenes where the stockpile hauls are the only proposable work.
    this.domain.nativeHauls=frozen;this.domain.nativeIntentOnly=!!options.intentOnly;this.commit('native-hauls-configured','operator',{entries:frozen,intentOnly:!!options.intentOnly});
    this.recordNotOffered(game,frozen[0]?.intentId);
    return structuredClone(frozen);
  });}
  private recordNotOffered(game:GameState,intentId?:string){
    for(const own of game.pawns.filter(p=>this.domain.characters[p.id])){
      const reason=notOfferedReason(own);
      if(reason&&reason!=='unavailable')this.commit('intent-not-offered','core',{intentId,pawn:own.id,reason});
    }
  }
  /** Operator end of the native intent (trial end, not a pawn's withdrawal): the game retires
   * the tag and standings follow as 'stopped by the operator'. Idempotent once retired. */
  stopNativeHaul(){return this.serial(async()=>{
    let game=await this.current();const entries=nativeEntries(this.domain);
    if(!entries.length)return undefined;
    for(const c of entries){
      const live=this.liveIntent(game,c.intentId);
      if(live?.status!=='open')continue;
      const r=await this.game.intent!({op:'intent-stop',epoch:this.domain.epoch,intentId:c.intentId});
      const stopped=this.liveIntent(r.state,c.intentId);if(!stopped||stopped.status==='open'||stopped.status==='pending')throw Error('Native operator stop unconfirmed');
      game=r.state;
    }
    this.ingestIntents(game);
    return structuredClone(this.domain.intentViews?.[entries[0]!.intentId]);
  });}
  /** Physical movement opportunities and communicated replies only; no private character state. */
  core() {
    return {
      rescueOptions:(pawn:string)=>this.serial(async()=>{
        if(!this.domain.characters[pawn])throw Error('Unknown pawn');
        const game=await this.current(),own=game.pawns.find(p=>p.id===pawn);
        if(!own)throw Error('Pawn unavailable');
        return rescueView(this.domain,game,own);
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
        // A shared intent's quota is fixed once the zone exists: the counter stays recorded.
        if(parent.decision.action.kind==='haul-zone'&&!counterAdoptable(this.liveIntent(game,parent.decision.action.intentId)))
          throw Error('Counter recorded; the quota is fixed after the first acceptance');
        // Adopting an alternative only creates a new offer. The pawn must accept it anew.
        return this.propose(game,parent.pawn,parent.decision.action,reason,id,parent);
      })
    };
  }
  private propose(game:GameState,pawn:string,action:Action,reason:string,id:string,parent?:Proposal,request?:AlternativeRequest,standalone=false,reofferRequestId?:string) {
    action=Action.parse(action);z.string().uuid().parse(id);
    if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
    if(!reason.trim()||reason.length>1000) throw Error('Invalid proposal reason');
    const prior=this.domain.proposals[id];
    if(prior) {
      if(prior.pawn!==pawn||JSON.stringify(prior.action)!==JSON.stringify(action)||prior.reason!==reason||prior.parentId!==parent?.id) throw Error('Proposal ID collision');
      return structuredClone(prior);
    }
    if(Object.values(this.domain.pendingIntentExclusions??{}).some(x=>x.actor===pawn))throw Error('Native exclusion unconfirmed; reconcile before offering other work');
    const alternative=request??(parent?.requestId?this.domain.requests?.[parent.requestId]:undefined);
    const replaces=alternative?(parent?parent.replacesAgreementId:standalone?undefined:alternative.agreementId):undefined;
    if(alternative){
      if(action.kind!=='rescue'||action.target!==alternative.target)throw Error('Alternative must address the requested patient');
      if(parent&&(alternative.status!=='offered'||alternative.proposalId!==parent.id))throw Error('Alternative reply superseded');
      const candidate={pawn,action,requestId:alternative.id,replacesAgreementId:replaces} as Proposal;
      if(!replaces&&!this.completedRequestAvailable(candidate))throw Error('Completed request origin or free pawn required');
      if(replaces&&!this.replacementActive(candidate))throw Error('Requested agreement is no longer active');
    }
    const reinvite=reofferRequestId?this.domain.reoffers?.[reofferRequestId]:undefined;
    if(reofferRequestId&&(!reinvite||reinvite.status!=='pending'||reinvite.pawn!==pawn||this.domain.proposals[reinvite.deferredId]?.status!=='deferred'||JSON.stringify(reinvite.action)!==JSON.stringify(action)))throw Error('Re-invitation unavailable');
    if(this.domain.nativeIntentOnly&&action.kind!=='haul-zone')throw Error('Native intent mode: the stockpile haul is the only proposable work');
    if(action.kind==='haul-zone')planIntentOffer(nativeEntries(this.domain),game.pawns.find(x=>x.id===pawn),action,this.liveIntent(game,action.intentId));
    const productionMap=action.kind==='build'||action.kind==='cook'?planProduction(this.domain,game,pawn,action):undefined;
    const rescueMap=action.kind==='rescue'?planRescue(this.domain,game,pawn,action,replaces):undefined;
    const p:Proposal={id,pawn,action,reason,status:'pending',...(productionMap===undefined?{}:{productionMap}),...(reofferRequestId?{reofferRequestId,reoffersProposalId:reinvite!.deferredId}:{}),...(alternative?{requestId:alternative.id,...(replaces?{replacesAgreementId:replaces}:{})}:{}),...(rescueMap===undefined?{}:{rescueMap}),...(parent?{parentId:parent.id,round:(parent.round??0)+1}:{})};
    if(action.kind==='rescue'){const invalid=rescueQuestionInvalid(game,p);if(invalid)throw Error(invalid);}
    if(alternative){if(rescueMap!==alternative.mapId)throw Error('Request map changed');alternative.status='offered';alternative.proposalId=id;alternative.replyReason=reason;}
    if(reinvite){if(reinvite.mapId!==(action.kind==='rescue'?rescueMap:productionMap))throw Error('Re-invitation map changed');reinvite.status='offered';reinvite.proposalId=id;this.domain.proposals[reinvite.deferredId]!.reofferReplyId=id;}
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
  private requestReoffer(pawn:string,proposalId:string,reason:string,g:GameState){
    z.string().trim().min(1).max(1000).parse(reason);
    const p=deferredOffers(this.domain,pawn).find(p=>p.id===proposalId);
    if(!p||!g.pawns.some(p=>p.id===pawn&&!p.downed))throw Error('Deferred offer unavailable for this pawn');
    const request:import('./protocol.js').ReofferRequest={id:randomUUID(),pawn,deferredId:p.id,action:structuredClone(p.action),mapId:workMap(p),tick:g.ticks,reason,status:'pending'};
    (this.domain.reoffers??={})[request.id]=request;
    this.commit('reoffer-requested',pawn,request);return structuredClone(request);
  }
  pawn(pawn:string) {
    if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
    return {stopEating:(reason?:string)=>this.stopEating(pawn,reason),requestReoffer:(id:string,reason:string)=>this.serial(async()=>{const g=await this.current();if(this.pending.has(pawn))throw Error('Pawn already deliberating');return this.requestReoffer(pawn,id,reason,g);}),withdraw:(reason:string)=>this.serial(async()=>{await this.current();await this.withdraw(pawn,reason);}),decide:(id:string,backend:DecisionBackend,timeoutMs=5000,signal=new AbortController().signal)=>this.decide(pawn,id,backend,timeoutMs,signal)};
  }
  private async decide(pawn:string,id:string,backend:DecisionBackend,timeoutMs:number,signal:AbortSignal) {
    const prepared=await this.serial(async()=>{
      signal.throwIfAborted();const game=await this.current();
      this.ingest(game);signal.throwIfAborted();
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
    const combined=AbortSignal.any([signal,prepared.controller.signal]);
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      timer=setTimeout(()=>prepared.controller.abort(),timeoutMs);
      const result=Decision.parse(await bounded(combined,async()=>{
        await this.decisionPause(prepared.activity);
        combined.throwIfAborted();
        return backend.decide(prepared.view,combined);
      }));
      return await this.serial(async()=>{
        if(prepared.generation!==this.generation || combined.aborted) throw Error('Stale decision');
        const fresh=await this.current();this.ingest(fresh);
        combined.throwIfAborted();
        const p=this.domain.proposals[id]!;
        if(p.status!=='pending') throw Error('Proposal already decided');
        if(this.questions.get(pawn)?.controller===prepared.controller)this.questions.delete(pawn);
        await this.applyDecision(p,result,fresh,combined);
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
      await this.serial(async()=>{});
    }
  }
  private replacementActive(p:Proposal):boolean {
    const old=this.domain.proposals[p.replacesAgreementId??''],r=this.domain.requests?.[p.requestId??''],ch=this.domain.characters[p.pawn];
    return !!(old&&r&&r.pawn===p.pawn&&r.agreementId===old.id&&r.status!=='closed'&&r.status!=='declined'&&p.action.kind==='rescue'&&p.action.target===r.target&&old.pawn===p.pawn&&old.action.kind==='haul-zone'&&old.status==='accepted'&&old.standing?.status==='running'&&ch?.intention===old.id&&(!ch.commitment||ch.commitment===old.actionId));
  }
  private completedRequestAvailable(p:Proposal):boolean {
    const r=this.domain.requests?.[p.requestId??''],old=this.domain.proposals[r?.agreementId??''],ch=this.domain.characters[p.pawn];
    return !!(r&&old&&ch&&r.pawn===p.pawn&&old.pawn===p.pawn&&old.action.kind==='haul-zone'&&old.status==='accepted'&&old.standing?.status==='completed'
      &&r.status!=='closed'&&r.status!=='declined'&&p.action.kind==='rescue'&&p.action.target===r.target&&!ch.commitment&&!ch.intention);
  }
  private refreshReceipt(p:Proposal,game:GameState) {
    // A native haul's completion is its intent's lifecycle in the game ledger, not a job
    // receipt: read it fresh, so a quota met just before an offer or a consent is seen.
    if(p.action.kind==='haul-zone'){this.ingestIntents(game);return;}
    const receipt=game.actions.find(a=>a.id===p.actionId&&a.actor===p.pawn);
    if(!receipt||receipt.status==='started')return;
    this.domain.outcomes[receipt.id]=receipt;
    if(this.domain.characters[p.pawn]!.commitment===receipt.id)delete this.domain.characters[p.pawn]!.commitment;
    this.finishStanding(p,receipt.status);this.commit('action-outcome',p.pawn,receipt);
  }
  private requestRescue(view:import('./attention.js').AttentionView,result:Extract<Reflection,{kind:'request_rescue'}>,fresh:GameState) {
    const old=this.domain.proposals[result.agreementId],ch=this.domain.characters[view.pawn.id]!,seen=view.pawn.casualties;
    if(!old||old.pawn!==view.pawn.id||old.action.kind!=='haul-zone'||old.standing?.status!=='running'||ch.intention!==old.id||view.intention?.id!==old.id)throw Error('Request agreement superseded');
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
    if(result.kind==='accept'&&p.action.kind!=='move'&&p.action.kind!=='haul-zone'&&!this.game.cancel)throw Error('Work requires scoped cancellation');
  }
  private async applyDecision(p:Proposal,result:Decision,fresh:GameState,signal?:AbortSignal) {
    if(p.replacesAgreementId)this.refreshReceipt(this.domain.proposals[p.replacesAgreementId]!,fresh);
    this.validateDecision(p,result,fresh);
    const replacedNative=p.replacesAgreementId?this.domain.proposals[p.replacesAgreementId]:undefined;
    if(p.replacesAgreementId&&result.kind==='accept'&&replacedNative?.action.kind==='haul-zone'){
      // B7: durable four-step handover. Consent first; the dispatch id exists before any send;
      // the rescue goes only after the game confirms exclusion and empty hands.
      // The pending rescue is a running standing with no step yet: owned by the pawn once the
      // old agreement is stopped, visible to conflict checks and withdrawable like any other.
      p.decision=result;p.status='accepted';
      p.standing={status:'running',deadline:this.observedTick+(p.action.kind==='move'?0:p.action.maxTicks),steps:[],reason:'Replacement handover pending'};
      if(p.requestId)this.domain.requests![p.requestId]!.status='closed';
      (this.domain.handovers??={})[p.id]={proposalId:p.id,oldId:replacedNative.id,pawn:p.pawn,intentId:replacedNative.action.intentId,step:'excluding',deadline:p.standing.deadline,dispatchId:randomUUID(),capturedJobId:fresh.pawns.find(x=>x.id===p.pawn)?.job==='HaulToCell'?fresh.pawns.find(x=>x.id===p.pawn)?.jobId:-1};
      this.claimHandover(this.domain.handovers[p.id]!,p,this.domain.characters[p.pawn]!);
      this.commit('replacement-consented',p.pawn,p);this.commit('handover-started',p.pawn,this.domain.handovers[p.id]);
      await this.advanceHandovers(await this.current());
      return;
    }
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
    if(p.action.kind==='haul-zone')return this.applyIntentDecision(p,result,fresh);
    p.decision=result;
    p.status=result.kind==='accept'?'accepted':result.kind==='refuse'?'refused':result.kind==='defer'?'deferred':'countered';
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
  /** Observation age for published narration: a snapshot older than the newest receipt is
   * flagged before it reaches the crew log. Receipts are game events, never the current tick. */
  private asOf(viewTick:number,game:GameState){
    const newest=newestReceiptTick(this.domain,game);
    return {asOfTick:viewTick,...(newest>viewTick?{newerReceiptTick:newest}:{})};
  }
  /** B7 steps 2–4, re-entrant from reconcile: confirmed exclusion, drained cargo, fresh
   * validation, then one dispatch under the persisted id. A passed deadline stops it. */
  private async advanceHandovers(game:GameState){
    for(const h of Object.values(this.domain.handovers??{})){
      if(h.step==='dispatched'||h.step==='stopped')continue;
      const p=this.domain.proposals[h.proposalId]!,c=this.domain.characters[h.pawn]!;
      const stop=(reason:string)=>{
        h.step='stopped';h.reason=reason;
        if(p.standing?.status==='running'){p.standing={...p.standing,status:'stopped',reason};if(c.intention===p.id)delete c.intention;}
        this.commit('handover-stopped',h.pawn,h);
      };
      if(this.claimHandover(h,p,c)){
        // Also after a restart between consent and withdrawal: the old agreement is stopped here.
        try{await this.flushIntentExclusions();}catch(error){this.commit('handover-uncertain',h.pawn,{proposal:p.id,error:String(error).slice(0,200)});}
      }
      if(p.standing?.status!=='running'){stop(p.standing?.reason??'Replacement withdrawn');continue;}
      if(c.intention!==p.id){stop('Pawn no longer holds the replacement');continue;}
      if(game.ticks>=h.deadline){stop('handover timed out');continue;}
      if(h.step==='excluding'){
        let live=this.liveIntent(game,h.intentId);
        if(live&&(live.status==='open'||live.status==='pending')&&!live.excluded.includes(h.pawn)){
          try{const r=await this.game.intent!({op:'intent-exclude',epoch:this.domain.epoch,intentId:h.intentId,actor:h.pawn,reason:'withdraw'});
            if(!r.state.loaded||r.state.epoch!==this.domain.epoch||r.state.world!==this.domain.world)throw Error('Stale intent exclusion response');
            game=r.state;live=this.liveIntent(game,h.intentId);}
          catch{continue;}   // uncertain: confirmed from the game's state on the next pass
        }
        if(live&&(live.status==='open'||live.status==='pending')&&!live.excluded.includes(h.pawn))continue;
        // The game confirms the exclusion the consent queued: the same fact, so it no longer
        // holds the dispatch until a later flush.
        const key=h.intentId+':'+h.pawn,queued=this.domain.pendingIntentExclusions?.[key];
        if(queued&&live?.excluded.includes(h.pawn)){delete this.domain.pendingIntentExclusions![key];this.commit('intent-exclusion-confirmed',h.pawn,queued);}
        h.step='draining';this.commit('handover-excluded',h.pawn,h);
      }
      if(h.step==='draining'){
        // A job-end is only a trigger to look; empty hands and no tagged trip are required.
        const own=game.pawns.find(x=>x.id===h.pawn);
        if(!own||own.carrying===undefined||own.carrying!==''||(h.capturedJobId===undefined?own.job==='HaulToCell':h.capturedJobId>=0&&(own.jobId===undefined||own.jobId===h.capturedJobId)))continue;
        const invalid=rescueQuestionInvalid(game,{...p,status:'pending'});
        if(invalid){stop(invalid);continue;}
        // Ownership is revalidated after every await above, immediately before dispatch.
        if(p.standing?.status!=='running'||c.intention!==p.id||c.commitment){stop('Pawn no longer holds the replacement');continue;}
        p.actionId=h.dispatchId;p.standing={status:'running',deadline:h.deadline,steps:[h.dispatchId]};
        this.domain.characters[p.pawn]!.commitment=p.actionId;this.domain.characters[p.pawn]!.intention=p.id;
        h.step='dispatched';this.commit('handover-dispatching',h.pawn,h);
        try{await this.dispatch(p);}catch(error){this.commit('handover-dispatch-uncertain',h.pawn,{proposal:p.id,error:String(error).slice(0,200)});}
      }
    }
  }
  /** Stops the replaced agreement if it still runs (idempotent; covers a restart between
   * consent and withdrawal) and gives the pending rescue to the pawn. True when exclusions
   * were queued by this call. */
  private claimHandover(h:{oldId:string;pawn:string;proposalId:string},p:Proposal,c:{intention?:string;memories:string[]}){
    const old=this.domain.proposals[h.oldId];let queued=false;
    if(old?.standing?.status==='running'&&old.action.kind==='haul-zone'){
      const reason=('Accepted replacement: '+(p.decision?.reason??'')).slice(0,1000);
      old.standing.status='stopped';old.standing.reason=reason;if(c.intention===old.id)delete c.intention;
      c.memories.push(`Stopped ${old.action.kind}: ${reason}`);
      this.queueIntentExclusion(old.action.intentId,h.pawn,'withdraw');queued=true;

    }
    const claim=p.standing?.status==='running'&&c.intention===undefined;
    if(claim)c.intention=p.id;
    if(queued||claim)this.commit('handover-owned',h.pawn,{proposal:p.id,oldId:h.oldId});
    return queued;
  }
  private recoverHandovers(){
    for(const h of Object.values(this.domain.handovers??{}))if(h.step!=='dispatched'&&h.step!=='stopped')
      this.claimHandover(h,this.domain.proposals[h.proposalId]!,this.domain.characters[h.pawn]!);
  }
  /** Deadline processing independent of the game's transport: used when exclusion flushing fails. */
  private expireHandovers(ticks:number){
    for(const h of Object.values(this.domain.handovers??{})){
      if(h.step==='dispatched'||h.step==='stopped'||ticks<h.deadline)continue;
      const p=this.domain.proposals[h.proposalId]!,c=this.domain.characters[h.pawn]!;
      h.step='stopped';h.reason='handover timed out';
      if(p.standing?.status==='running'){p.standing={...p.standing,status:'stopped',reason:h.reason};if(c.intention===p.id)delete c.intention;}
      this.commit('handover-stopped',h.pawn,h);
    }
  }
  private liveIntent(game:GameState,intentId:string):IntentView|undefined{
    const raw=(game.intents??[]).find(i=>i.intentId===intentId);return raw?IntentView.parse(raw):undefined;
  }
  private queueIntentExclusion(intentId:string,actor:string,reason:string){
    (this.domain.pendingIntentExclusions??={})[intentId+':'+actor]={intentId,actor,reason};
  }
  /** Idempotent consent stops survive lost replies, process restarts and checkpoints.
   * New admissions cannot overtake a known, unconfirmed exclusion. */
  private async flushIntentExclusions(){
    for(const [key,pending] of Object.entries(this.domain.pendingIntentExclusions??{})){
      const r=await this.game.intent!({op:'intent-exclude',epoch:this.domain.epoch,...pending});
      if(!r.state.loaded||r.state.epoch!==this.domain.epoch||r.state.world!==this.domain.world)throw Error('Stale intent exclusion response');
      if(!this.liveIntent(r.state,pending.intentId)?.excluded.includes(pending.actor))throw Error('Intent exclusion unconfirmed');
      delete this.domain.pendingIntentExclusions![key];
      this.commit('intent-exclusion-confirmed',pending.actor,pending);this.ingestIntents(r.state);
    }
  }
  /** Native intent: standing only, no job, no commitment. The mod owns the zone and ledger;
   * refusal and deferral bind in the game before any zone exists. */
  private async applyIntentDecision(p:Proposal,result:Decision,fresh:GameState){
    if(p.action.kind!=='haul-zone')throw Error('Not a native intent');
    const a=p.action;
    const live=this.liveIntent(fresh,a.intentId);
    if(live&&live.status!=='open'&&live.status!=='pending'){
      // Answered after the shared work had already closed: the answer is kept as said,
      // no agreement starts, and nothing is projected as agreed, unfulfilled or withdrawn.
      p.decision=result;p.status='lapsed';p.lapsed={intentStatus:live.status,answered:true};
      this.domain.characters[p.pawn]!.memories.push(`${result.kind} after the stockpile haul was already ${live.status}: ${result.reason}`);
      this.commit('decided',p.pawn,p);
      this.commit('intent-offer-lapsed',p.pawn,{proposal:p.id,pawn:p.pawn,answer:result.kind,intentStatus:live.status});
      return;
    }
    if(result.kind==='accept')planIntentOffer(nativeEntries(this.domain),fresh.pawns.find(x=>x.id===p.pawn),a,live);
    if(result.kind==='counter'&&(result.action.kind!=='haul-zone'||result.action.intentId!==a.intentId))throw Error('Counter must address the same shared intent');
    p.decision=result;
    p.status=result.kind==='accept'?'accepted':result.kind==='refuse'?'refused':result.kind==='defer'?'deferred':'countered';
    this.domain.characters[p.pawn]!.memories.push(`${result.kind}: ${p.reason}; ${result.reason}`);
    if(result.kind==='accept'){p.standing={status:'running',deadline:this.observedTick+a.maxTicks,steps:[]};this.domain.characters[p.pawn]!.intention=p.id;}
    if(result.kind==='refuse'||result.kind==='defer')this.queueIntentExclusion(a.intentId,p.pawn,result.kind);
    if(result.kind==='accept')(this.domain.pendingIntentAcceptances??=[]).push(p.id);
    this.commit('decided',p.pawn,p);
    if(result.kind==='counter')return;
    if(result.kind!=='accept'){await this.flushIntentExclusions();return;}
    try{await this.flushIntentExclusions();await this.flushIntentAcceptances();}
    catch(error){this.commit('intent-admission-uncertain',p.pawn,{proposal:p.id,error:String(error).slice(0,200)});}
  }
  /** The game may have accepted a timed-out request. Keep the agreement held until
   * actual game standing resolves it; retries use the same intent/pawn identity. */
  private async flushIntentAcceptances(){
    for(const id of [...(this.domain.pendingIntentAcceptances??[])]){
      const p=this.domain.proposals[id];if(!p||p.action.kind!=='haul-zone')throw Error('Missing pending native admission');
      const a=p.action,game=await this.current();let live=this.liveIntent(game,a.intentId);
      if(live?.excluded.includes(p.pawn)||p.standing?.status==='stopped'||live&&live.status!=='open'&&live.status!=='pending'&&!live.accepted.includes(p.pawn)){
        p.standing!.status='stopped';p.standing!.reason='Game did not admit this native agreement';
        if(this.domain.characters[p.pawn]!.intention===id)delete this.domain.characters[p.pawn]!.intention;
      }else if(!live?.accepted.includes(p.pawn)){
        planIntentOffer(nativeEntries(this.domain),game.pawns.find(x=>x.id===p.pawn),a,live);
        const e=nativeEntries(this.domain).find(x=>x.intentId===a.intentId);
        const r=await this.game.intent!({op:'intent-accept',epoch:this.domain.epoch,intentId:a.intentId,actor:p.pawn,thing:a.thing,x:a.x,z:a.z,w:a.w,h:a.h,quota:a.quota,maxTicks:a.maxTicks,variant:a.variant,
          zoneId:a.zoneId??-1,label:a.label??e?.label,hold:a.hold??'strict',...(e?.siteId?{siteId:e.siteId}:{})});
        live=this.liveIntent(r.state,a.intentId);
        if(r.state.epoch!==this.domain.epoch||r.state.world!==this.domain.world||!live?.accepted.includes(p.pawn))throw Error('Intent acceptance unconfirmed');
      }
      this.domain.pendingIntentAcceptances=this.domain.pendingIntentAcceptances!.filter(x=>x!==id);
      this.commit('intent-admission-confirmed',p.pawn,{proposal:id,status:p.standing?.status});
      this.ingestIntents(await this.current());
    }
  }

  /** Aggregate receipts from the mod's ledger. Per-pawn credit is the carrier's; lifecycle
   * follows the intent (met, expired, stopped). There is no needs stop for native intents. */
  private ingestIntents(game:GameState){
    for(const raw of game.intents??[]){
      const v=IntentView.parse(raw),old=this.domain.intentViews?.[v.intentId];
      if(JSON.stringify(old)!==JSON.stringify(v)){
      (this.domain.intentViews??={})[v.intentId]=v;
      const entry=nativeEntries(this.domain).find(e=>e.intentId===v.intentId);
      // Who was asked: only accepted offers are agreements; anyone else credited is helping.
      const asked=Object.values(this.domain.proposals).filter(p=>p.action.kind==='haul-zone'&&p.action.intentId===v.intentId&&p.status==='accepted').map(p=>p.pawn);
      this.commit('intent-progress','Game',{intentId:v.intentId,status:v.status,previousStatus:old?.status,previousDelivered:old?.delivered??0,
        previousFinishedAfterExclusion:old?.finishedAfterExclusion??0,finishedAfterExclusion:v.finishedAfterExclusion,...intentProgress(v),
        thingLabel:v.thingLabel??entry?.thingLabel??v.thingDef,label:entry?.label??v.label??'stockpile',asked,stopReason:v.stopReason??null,
        ordinaryByPawn:Object.fromEntries((v.ordinaryByPawn??[]).map(p=>[p.pawn,p.count])),ordinaryUnattributed:v.ordinaryUnattributed??0,ordinaryRemoved:v.ordinaryRemoved??0,
        preTagAtStart:(v.preTagAtStart??[]).map(j=>({pawn:j.pawn,planned:j.planned})),preTagByPawn:Object.fromEntries((v.preTagByPawn??[]).map(p=>[p.pawn,p.count]))});
      }
      if(v.status==='open'||v.status==='pending')continue;
      // Unanswered offers of a closed intent lapse; an answer already being thought over is
      // recorded as a lapsed answer when it arrives.
      for(const p of Object.values(this.domain.proposals)){
        if(p.action.kind!=='haul-zone'||p.action.intentId!==v.intentId||p.status!=='pending'||this.pending.has(p.pawn))continue;
        p.status='lapsed';p.lapsed={intentStatus:v.status,answered:false};
        this.commit('intent-offer-lapsed',p.pawn,{proposal:p.id,pawn:p.pawn,answer:null,intentStatus:v.status});
      }
      for(const p of Object.values(this.domain.proposals)){
        if(p.action.kind!=='haul-zone'||p.action.intentId!==v.intentId||p.standing?.status!=='running')continue;
        p.standing.status=v.status==='met'?'completed':'stopped';
        p.standing.reason=v.status==='met'?'Shared quota met':v.status==='expired'?`Intent expired at ${v.delivered}/${v.quota}; topic stays open`:'Intent stopped by the operator';
        if(this.domain.characters[p.pawn]!.intention===p.id)delete this.domain.characters[p.pawn]!.intention;
        this.commit('intent-standing',p.pawn,{proposal:p.id,status:p.standing.status,reason:p.standing.reason});
      }
    }
  }
  private recordEating(care:import('./protocol.js').SelfCare,r:import('./protocol.js').Receipt){
    if(r.id!==care.id||r.actor!==care.pawn||r.kind!=='eat')throw Error('Eating receipt ownership mismatch');
    if(JSON.stringify(this.domain.outcomes[r.id])===JSON.stringify(r))return;
    this.domain.outcomes[r.id]=structuredClone(r);
    const ch=this.domain.characters[care.pawn]!;
    if(r.status!=='started'&&ch.commitment===r.id){delete ch.commitment;ch.memories.push(`Self-care eat ${r.status}: ${r.reason}`);}
    this.commit('self-care-outcome',care.pawn,r);
  }
  private async dispatchEating(care:import('./protocol.js').SelfCare){
    if(care.stopped)throw Error('Eating was stopped');
    if(!this.game.eat)throw Error('Eating bridge unavailable');
    this.recordEating(care,await this.game.eat({id:care.id,epoch:this.domain.epoch,actor:care.pawn,action:care.action,mapId:care.mapId,untilTick:care.untilTick}));
  }
  /** Pawn-bound cancellation; no new choice or retry is implied. */
  private async stopEating(pawn:string,reason='Pawn withdrew eating choice'){return this.serial(async()=>{
    if(!reason.trim()||reason.length>240)throw Error('Invalid eating stop reason');
    await this.current();const ch=this.domain.characters[pawn],care=this.domain.selfCare?.[ch?.commitment??''];
    if(!care||care.pawn!==pawn||!this.game.cancel)throw Error('No owned eating action');
    care.stopped=true;this.commit('self-care-stopped',pawn,{id:care.id,reason});
    this.recordEating(care,await this.game.cancel({epoch:this.domain.epoch,actor:pawn,id:care.id,kind:'eat'}));
  });}
  private async dispatch(p:Proposal) {
    if(Object.values(this.domain.pendingIntentExclusions??{}).some(x=>x.actor===p.pawn))throw Error('Native exclusion unconfirmed; ordered dispatch held for reconciliation');
    if(p.status!=='accepted' || !p.actionId) throw Error('Action requires pawn acceptance');
    const receipt=await this.game.move({id:p.actionId,epoch:this.domain.epoch,actor:p.pawn,action:p.action,untilTick:p.standing?.deadline,mapId:workMap(p)});
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
      let game=await this.current();
      if(Object.keys(this.domain.pendingIntentExclusions??{}).length){
        try{await this.flushIntentExclusions();}catch(error){this.expireHandovers(game.ticks);throw error;}
      }
      if(this.domain.pendingIntentAcceptances?.length)await this.flushIntentAcceptances();
      game=await this.current();
      this.ingest(game);
      for(const care of Object.values(this.domain.selfCare??{})){
        if(care.stopped&&this.domain.characters[care.pawn]?.commitment===care.id){this.recordEating(care,await this.game.cancel!({epoch:this.domain.epoch,actor:care.pawn,id:care.id,kind:'eat'}));continue;}
        const receipt=game.actions.find(a=>a.id===care.id);
        if(receipt)this.recordEating(care,receipt);else if(!this.domain.outcomes[care.id])await this.dispatchEating(care);
      }
      for(const p of Object.values(this.domain.proposals)) {
        if(!p.actionId) continue;
        if(p.standing?.status==='stopped'&&this.domain.characters[p.pawn]!.commitment===p.actionId) {
          const cancelled=await this.game.cancel!({epoch:this.domain.epoch,actor:p.pawn,id:p.actionId,kind:workKind(p)});
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
      this.ingestIntents(game);
      await this.advanceHandovers(game);
      for(const p of Object.values(this.domain.proposals)) if(p.standing?.status==='running'&&p.action.kind!=='haul-zone') {
        const own=game.pawns.find(x=>x.id===p.pawn);
        if(game.ticks>=p.standing.deadline||!workReady(p,own))
          await this.withdraw(p.pawn,game.ticks>=p.standing.deadline?'Agreed time expired':'Needs or availability require a break');
      }
    });
  }
  private finishStanding(p:Proposal,status:string) {
    if(!p.standing||p.standing.status!=='running'||status==='started')return;
    if(status!=='completed'||p.standing.steps.length>=workSteps(p)) {
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
    if(p.action.kind==='haul-zone'){
      p.standing.status='stopped';p.standing.reason=reason;delete character.intention;
      character.memories.push(`Stopped ${p.action.kind}: ${reason}`);
      this.queueIntentExclusion(p.action.intentId,pawn,'withdraw');
      this.commit('intention-stopped',pawn,{proposal:p.id,reason});
      // A trip already carrying finishes and is flagged; the game handles it natively.
      await this.flushIntentExclusions();return;
    }
    // Persist the stop BEFORE cancellation. Reconciliation retries uncertain cancellation,
    // never schedules another trip from a stopped intention.
    p.standing.status='stopped';p.standing.reason=reason;
    delete character.intention;
    character.memories.push(`Stopped ${p.action.kind}: ${reason}`);
    this.commit('intention-stopped',pawn,{proposal:p.id,reason});
    if(character.commitment&&p.actionId) {
      const receipt=await this.game.cancel!({epoch:this.domain.epoch,actor:pawn,id:p.actionId,kind:workKind(p)});
      if(receipt.id!==p.actionId||receipt.actor!==pawn)throw Error('Cancellation receipt does not match prior job');
      this.domain.outcomes[receipt.id]=receipt;
      if(receipt.status==='completed'&&p.standing.steps.length>=workSteps(p)){
        p.standing.status='completed';p.standing.reason='Agreed work completed before cancellation';
      }
      if(receipt.status!=='started')delete character.commitment;
      this.commit('action-outcome',pawn,receipt);
    }
  }
  /** Explicit operator polling advances only previously accepted, fixed-scope work.
   * Separate from reconciliation so quiescent between-trip checkpoints are possible. */
  async advanceIntentions(admit:()=>boolean=()=>true) {
    if(!admit())return;
    await this.reconcile();
    if(!admit())return;
    return this.serial(async()=>{
      const game=await this.current();
      if(!admit())return;
      for(const p of Object.values(this.domain.proposals)) {
        if(!admit())return;
        if(p.standing?.status!=='running'||p.action.kind!=='cook')continue;
        const c=this.domain.characters[p.pawn]!;
        if(c.commitment||this.pending.has(p.pawn))continue;
        if(game.ticks>=p.standing.deadline||!workReady(p,game.pawns.find(x=>x.id===p.pawn))) {
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
    if(this.domain.coreState){const state=this.domain.coreState;let changed=false;for(const t of state.turns)if(t.status==='running'){t.status='failed';changed=true;}for(const q of state.questions)if(q.status==='running'){q.status='failed';changed=true;}if(changed){state.revision++;this.commit('core-interrupted','operator',{reason});}}
    for(const e of Object.values(this.domain.exchanges??{}))if(e.status==='running'){
      e.status='closed';this.commit('social-interrupted','operator',{id:e.id,reason});
    }
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
      requireSupportedStoredActions(saved.state);
      await this.game.verify(name,saved.sha256);
      this.cancelDecisions();
      // Invalidate the local binding before loading; a partial restore fails closed.
      this.domain={...saved.state,epoch:'restoring'};
      this.commit('restore-started','operator',{name});
      await this.game.load(name);
      const game=await this.game.state();
      if(!game.loaded || game.world!==saved.state.world) throw Error('Restored world mismatch');
      this.domain={...saved.state,epoch:game.epoch,branch:randomUUID()};
      this.observedTick=game.ticks;this.status=sharedStatus(this.domain,game);this.food={epoch:game.epoch,lines:foodLines(sharedFood(this.domain,game))};
      this.migrateNativeScope();
      this.recoverHandovers();
      this.recoverAttention('Restored an unfinished attention attempt; no automatic retry');
      this.commit('restored','operator',{name,from:saved.state.branch});
    });
  }
}
