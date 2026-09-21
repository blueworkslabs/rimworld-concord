import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Decision, Move, type Domain, type GameBridge, type DecisionBackend, type GameState, type Proposal } from './protocol.js';
import { Store } from './store.js';

/** Character handles bind identity in code; backend output cannot choose an actor. */
export class Coordinator {
  private domain!:Domain;
  private queue:Promise<unknown>=Promise.resolve();
  private generation=0;
  private pending=new Map<string,AbortController>();
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
      } else {
        this.domain={schema:1,world:game.world,epoch:game.epoch,branch:randomUUID(),characters:{},proposals:{},outcomes:{}};
        for(const p of game.pawns) this.domain.characters[p.id]={id:p.id,name:p.name,memories:[]};
        this.commit('initialized','operator',{pawns:Object.keys(this.domain.characters)});
      }
    });
  }
  private async current():Promise<GameState> {
    if(!this.domain) throw Error('Coordinator not opened');
    const game=await this.game.state();
    if(!game.loaded || game.world!==this.domain.world || game.epoch!==this.domain.epoch) throw Error('Stale timeline');
    return game;
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
      const p=this.domain.proposals[id];
      if(!p || p.pawn!==pawn) throw Error('Proposal does not belong to pawn');
      if(p.status!=='pending') throw Error('Proposal already decided');
      if(this.pending.has(pawn)) throw Error('Pawn already deliberating');
      if(this.domain.characters[pawn]!.commitment) throw Error('Pawn already committed; reconcile outcome first');
      const own=game.pawns.find(x=>x.id===pawn);
      if(!own) throw Error('Pawn unavailable');
      const controller=new AbortController(); this.pending.set(pawn,controller);
      this.commit('deliberation-started',pawn,{proposal:id,backend:backend.name});
      return {generation:this.generation,controller,view:structuredClone({pawn:own,character:this.domain.characters[pawn]!,proposal:p})};
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
        p.decision=result;
        p.status=result.kind==='accept'?'accepted':result.kind==='refuse'?'refused':'countered';
        this.domain.characters[pawn]!.memories.push(`${result.kind}: ${p.reason}; ${result.reason}`);
        if(result.kind==='accept') {
          p.actionId=randomUUID();
          this.domain.characters[pawn]!.commitment=p.actionId;
        }
        // Persist intent BEFORE crossing into the game. Retries use exactly the same ID/payload.
        this.commit('decided',pawn,p);
        if(result.kind==='accept') await this.dispatch(p);
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
    }
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
      this.commit('restored','operator',{name,from:saved.state.branch});
    });
  }
}
