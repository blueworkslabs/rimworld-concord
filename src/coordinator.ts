import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Decision, Move, type Domain, type GameBridge, type DecisionBackend, type GameState, type Proposal } from './protocol.js';
import type { AppraisalView } from './appraisal.js';
import { route } from './routing.js';
import { Store } from './store.js';
import { AttentionOptions, Reflection, bounded, coalesce, type AttentionBackend, type AppraisalBackend, type AttentionResult } from './attention.js';

/** Character handles bind identity in code; backend output cannot choose an actor. */
export class Coordinator {
  private domain!:Domain;
  private queue:Promise<unknown>=Promise.resolve();
  private generation=0;
  private pending=new Map<string,AbortController>();
  private attending=new Map<string,{controller:AbortController;throughSeq:number}>();
  private observedTick=0;
  constructor(private store:Store,private game:GameBridge) {}
  private serial<T>(fn:()=>Promise<T>):Promise<T> {
    const result=this.queue.then(fn); this.queue=result.catch(()=>{}); return result;
  }
  private commit(kind:string,actor:string,data:unknown) {
    this.store.commit(this.domain,{branch:this.domain.branch,kind,actor,data});
  }
  async open() {
    return this.serial(async()=>{
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
    if(game.eventSeq===undefined) return;
    const cursor=this.domain.eventCursor??0;
    const events=(game.events??[]).filter(e=>e.seq>cursor).sort((a,b)=>a.seq-b.seq);
    if(events.length && events[0]!.seq>cursor+1) this.commit('native-event-gap','operator',{from:cursor+1,to:events[0]!.seq-1});
    for(const event of events) {
      const character=this.domain.characters[event.pawn];
      if(!character) continue;
      const next=route({urgent:event.kind==='health',significant:event.kind==='memory'||event.kind==='health',
        conflictsWithCommitment:false,routine:event.kind==='job'}).next;
      const experiences=character.experiences??=[];
      experiences.push({event,route:next});
      if(experiences.length>64) {
        const evicted=experiences.shift()!;
        if(evicted.event.seq>(character.attention?.cursor??0)&&evicted.route!=='native')
          this.commit('attention-gap',event.pawn,{seq:evicted.event.seq,kind:evicted.event.kind});
      }
      const active=this.attending.get(event.pawn);
      if(next==='deliberation'&&active&&event.seq>active.throughSeq) active.controller.abort();
      this.domain.eventCursor=event.seq;
      this.commit('native-event',event.pawn,{event,route:next});
    }
    this.domain.eventCursor=game.eventSeq;
    if(cursor!==game.eventSeq) this.commit('native-cursor','operator',{seq:game.eventSeq});
  }
  /** Polling is operator-owned. Routes are durable attention records, not automatic orders. */
  async observe() {return this.serial(async()=>{this.ingest(await this.current());});}
  /** Operator scheduling hints only. Every condition is checked again at claim time. */
  attentionCandidates(options:AttentionOptions={},hasAppraiser=false):string[] {
    const config=AttentionOptions.parse(options);
    if(!this.domain) throw Error('Coordinator not opened');
    return Object.values(this.domain.characters).filter(c=>{
      if(this.pending.has(c.id)||c.commitment) return false;
      const events=(c.experiences??[]).filter(e=>e.event.seq>(c.attention?.cursor??0));
      if(!events.length) return false;
      const significant=events.some(e=>e.route==='deliberation');
      const needsModel=events.some(e=>e.route!=='native');
      if(!significant&&needsModel&&!hasAppraiser) return false;
      return !needsModel||significant||c.attention?.lastAttemptTick===undefined||
        this.observedTick-c.attention.lastAttemptTick>=config.cooldownTicks;
    }).sort((a,b)=>{
      // Significant signals get the slots before routine needs; oldest attempt wins ties.
      const priority=(c:typeof a)=>(c.experiences??[]).some(e=>e.event.seq>(c.attention?.cursor??0)&&e.route==='deliberation')?0:1;
      return priority(a)-priority(b)||(a.attention?.lastAttemptTick??-1)-(b.attention?.lastAttemptTick??-1)||a.id.localeCompare(b.id);
    }).map(c=>c.id);
  }
  /** At-most-once attempt per captured batch, not guaranteed thought completion.
   * Claim/cursor is durable BEFORE inference. Failed/uncertain attempts are audited,
   * never silently replayed after restart. A later event may prompt fresh reflection.
   */
  async attend(pawn:string,backend:AttentionBackend,appraiser?:AppraisalBackend,
    options:AttentionOptions={},signal=new AbortController().signal):Promise<AttentionResult> {
    const config=AttentionOptions.parse(options);
    const prepared=await this.serial(async()=>{
      signal.throwIfAborted();
      const game=await this.current();this.ingest(game);
      const character=this.domain.characters[pawn];
      const own=game.pawns.find(p=>p.id===pawn);
      if(!own||!character) throw Error('Pawn unavailable');
      if(this.pending.has(pawn)||character.commitment) return {status:'busy' as const};
      const events=(character.experiences??[]).filter(e=>e.event.seq>(character.attention?.cursor??0));
      if(!events.length) return {status:'idle' as const};
      const significant=events.some(e=>e.route==='deliberation');
      const needsModel=events.some(e=>e.route!=='native');
      if(needsModel&&!significant&&!appraiser) return {status:'unavailable' as const};
      if(needsModel&&!significant&&character.attention?.lastAttemptTick!==undefined&&
        game.ticks-character.attention.lastAttemptTick<config.cooldownTicks) return {status:'cooldown' as const};
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
      const view=structuredClone({pawn:own,character,events:coalesce(events).filter(e=>e.route!=='native').map(e=>e.event),
        proposals:Object.values(this.domain.proposals).filter(p=>p.pawn===pawn&&p.status==='pending').slice(0,8)});
      return {status:'running' as const,generation:this.generation,controller,activity,view,throughSeq,significant};
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
        // Only deliberation gets the thinking badge. Appraisal is a bounded fast gate.
        try {await this.game.setActivity?.(prepared.activity);} catch { /* cognition can proceed without UI */ }
        combined.throwIfAborted();
        return Reflection.parse(await backend.reflect(prepared.view,combined));
      });
      return await this.serial(async()=>{
        combined.throwIfAborted();
        if(prepared.generation!==this.generation) throw Error('Stale attention');
        this.ingest(await this.current());
        combined.throwIfAborted(); // a freshly observed significant event supersedes this result
        const character=this.domain.characters[pawn]!;
        const throughSeq=prepared.throughSeq;
        if(result.kind==='native') {
          character.attention!.last={status:'native',throughSeq,reason:'Appraisal selected native continuation'};
          this.commit('attention-appraised',pawn,{throughSeq,reflectionScore:result.score,backend:appraiser!.name});
          return {pawn,status:'native',throughSeq};
        }
        const reason=result.kind==='continue'?result.reason:result.decision.reason;
        const reflection={tick:this.observedTick,throughSeq,backend:backend.name,reason};
        if(result.kind==='proposal') {
          if(!prepared.view.proposals.some(p=>p.id===result.proposalId)) throw Error('Proposal outside attention perspective');
          const proposal=this.domain.proposals[result.proposalId];
          if(!proposal||proposal.pawn!==pawn||proposal.status!=='pending'||character.commitment) throw Error('Attention proposal superseded');
          character.attention!.last={status:'decided',throughSeq,reason};
          character.reflections=[...(character.reflections??[]),reflection].slice(-16);
          await this.applyDecision(proposal,result.decision);
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
      if(this.pending.get(pawn)===prepared.controller) this.pending.delete(pawn);
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
      return {generation:this.generation,view:structuredClone({pawn:own,character,event:experience.event})};
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
  core() {
    return {propose:(pawn:string,action:Move,reason:string,id=randomUUID())=>this.serial(async()=>{
      await this.current();
      action=Move.parse(action);
      z.string().uuid().parse(id);
      if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
      if(!reason.trim() || reason.length>1000) throw Error('Invalid proposal reason');
      const prior=this.domain.proposals[id];
      if(prior) {
        if(prior.pawn!==pawn || JSON.stringify(prior.action)!==JSON.stringify(action) || prior.reason!==reason) throw Error('Proposal ID collision');
        return structuredClone(prior);
      }
      const p:Proposal={id,pawn,action,reason,status:'pending'};
      this.domain.proposals[id]=p;
      this.commit('proposed','core',p);
      return structuredClone(p);
    })};
  }
  pawn(pawn:string) {
    if(!this.domain.characters[pawn]) throw Error('Unknown pawn');
    return {decide:(id:string,backend:DecisionBackend,timeoutMs=5000)=>this.decide(pawn,id,backend,timeoutMs)};
  }
  private async decide(pawn:string,id:string,backend:DecisionBackend,timeoutMs:number) {
    const prepared=await this.serial(async()=>{
      const game=await this.current();
      this.ingest(game);
      const p=this.domain.proposals[id];
      if(!p || p.pawn!==pawn) throw Error('Proposal does not belong to pawn');
      if(p.status!=='pending') throw Error('Proposal already decided');
      if(this.pending.has(pawn)) throw Error('Pawn already deliberating');
      if(this.domain.characters[pawn]!.commitment) throw Error('Pawn already committed; reconcile outcome first');
      const own=game.pawns.find(x=>x.id===pawn);
      if(!own) throw Error('Pawn unavailable');
      if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>115000) throw Error('Decision timeout must be 1..115000 ms');
      const controller=new AbortController();
      const activity={epoch:game.epoch,actor:pawn,activityId:randomUUID(),ttlMs:timeoutMs+2000};
      // UI transport failure must not disable cognition. The game expires orphaned badges.
      try {await this.game.setActivity?.(activity);} catch {this.commit('indicator-unavailable',pawn,{});}
      this.pending.set(pawn,controller);
      this.commit('deliberation-started',pawn,{proposal:id,backend:backend.name});
      return {generation:this.generation,controller,activity,view:structuredClone({pawn:own,character:this.domain.characters[pawn]!,proposal:p})};
    });
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const abort=new Promise<never>((_,reject)=>{
        prepared.controller.signal.addEventListener('abort',()=>reject(Error('Decision cancelled')),{once:true});
        timer=setTimeout(()=>prepared.controller.abort(),timeoutMs);
      });
      const result=Decision.parse(await Promise.race([backend.decide(prepared.view,prepared.controller.signal),abort]));
      return await this.serial(async()=>{
        if(prepared.generation!==this.generation || prepared.controller.signal.aborted) throw Error('Stale decision');
        await this.current();
        const p=this.domain.proposals[id]!;
        if(p.status!=='pending') throw Error('Proposal already decided');
        await this.applyDecision(p,result);
        return structuredClone(p);
      });
    } catch(error) {
      await this.serial(async()=>{
        if(prepared.generation===this.generation) this.commit('decision-error',pawn,{proposal:id,error:String(error),fallback:'continue-native'});
      });
      throw error;
    } finally {
      clearTimeout(timer);
      if(this.pending.get(pawn)===prepared.controller) this.pending.delete(pawn);
      try {await this.game.setActivity?.({...prepared.activity,ttlMs:0});} catch { /* expired or old timeline */ }
    }
  }
  private async applyDecision(p:Proposal,result:Decision) {
    p.decision=result;
    p.status=result.kind==='accept'?'accepted':result.kind==='refuse'?'refused':'countered';
    this.domain.characters[p.pawn]!.memories.push(`${result.kind}: ${p.reason}; ${result.reason}`);
    if(result.kind==='accept') {
      p.actionId=randomUUID();this.domain.characters[p.pawn]!.commitment=p.actionId;
    }
    // Attention completion and pawn intent share the durable state commit before dispatch.
    this.commit('decided',p.pawn,p);
    if(result.kind==='accept') await this.dispatch(p);
  }
  private async dispatch(p:Proposal) {
    if(p.status!=='accepted' || !p.actionId) throw Error('Action requires pawn acceptance');
    const receipt=await this.game.move({id:p.actionId,epoch:this.domain.epoch,actor:p.pawn,action:p.action});
    this.domain.outcomes[receipt.id]=receipt;
    if(receipt.status!=='started') delete this.domain.characters[p.pawn]!.commitment;
    this.commit('action-outcome',p.pawn,receipt);
  }
  /** Reconcile before retry; a lost response never creates a new action ID. */
  async reconcile() {
    return this.serial(async()=>{
      const game=await this.current();
      this.ingest(game);
      for(const p of Object.values(this.domain.proposals)) {
        if(!p.actionId) continue;
        const receipt=game.actions.find(a=>a.id===p.actionId);
        if(receipt) {
          const previous=this.domain.outcomes[receipt.id];
          if(JSON.stringify(previous)!==JSON.stringify(receipt)) {
            this.domain.outcomes[receipt.id]=receipt;
            if(receipt.status!=='started') {
              delete this.domain.characters[p.pawn]!.commitment;
              this.domain.characters[p.pawn]!.memories.push(`Action ${receipt.status}: ${receipt.reason}`);
            }
            this.commit('action-outcome',p.pawn,receipt);
          }
        } else if(!this.domain.outcomes[p.actionId]) await this.dispatch(p);
      }
    });
  }
  private cancelDecisions() {
    this.generation++;
    for(const controller of this.pending.values()) controller.abort();
    this.pending.clear();
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
