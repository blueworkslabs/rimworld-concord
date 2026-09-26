import {appendFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import type {Snapshot} from './perception.js';
import type {ObserverHooks} from './tool-server.js';
export function configuredCandidate(start:Snapshot,s:Snapshot):boolean{
 if(s.meta.world!==start.meta.world||s.meta.epoch!==start.meta.epoch||s.meta.mapId!==start.meta.mapId)return false;
 const oldThings=new Set(start.map.things.map(t=>t.id)),oldBills=new Set(start.bills.flatMap(b=>b.bills.map(x=>x.loadId)));
 const fires=new Set(s.map.things.filter(t=>t.def==='Campfire'&&t.kind==='building'&&t.faction==='player'&&!oldThings.has(t.id)).map(t=>t.id));
 return s.bills.some(b=>fires.has(b.bench)&&b.bills.some(x=>!oldBills.has(x.loadId)&&x.recipe==='CookMealSimple'&&x.repeatMode==='RepeatCount'&&x.repeatCount===3));
}
/** Identical trusted hidden observer for both arms; never returns state to the UI controller. */
export class BenchmarkObserver implements ObserverHooks {
 constructor(private bridge:{perceive():Promise<Snapshot>;admin(op:string):Promise<unknown>},private dir:string,private start:Snapshot){}
 private async sample(){
  const t=Date.now(),s=await this.bridge.perceive();
  appendFileSync(this.dir+'/observer.jsonl',JSON.stringify({at:Date.now(),durationMs:Date.now()-t,meta:s.meta,bills:s.bills,records:s.pawns.map(p=>({id:p.id,records:p.records}))})+'\n');
  if(configuredCandidate(this.start,s)&&!existsSync(this.dir+'/configured.json'))writeFileSync(this.dir+'/configured.json',JSON.stringify(s),{flag:'wx'});
  return s;
 }
 async before(){await this.sample();}
 async after(done:boolean){if(done)await this.bridge.admin('pause');const s=await this.sample();if(done)writeFileSync(this.dir+'/done.json',JSON.stringify({at:Date.now(),snapshot:s}),{flag:'wx'});}
}
export function observerFromEnv(bridge:ConstructorParameters<typeof BenchmarkObserver>[0]){
 const dir=process.env.CONCORD_BENCH_DIR;if(!dir)throw Error('CONCORD_BENCH_DIR required');
 return new BenchmarkObserver(bridge,dir,JSON.parse(readFileSync(dir+'/start.json','utf8')));
}
