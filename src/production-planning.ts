import {Action,type Build,type Cook,type Domain,type GameState,type Pawn,type Proposal} from './protocol.js';
export const workMap=(p:Proposal)=>p.action.kind==='rescue'?p.rescueMap:p.action.kind==='haul'?p.haulMap:p.productionMap;
export const workSteps=(p:Proposal)=>p.action.kind==='haul'?p.action.trips:p.action.kind==='cook'?p.action.meals:1;
export const workReady=(p:Proposal,own?:Pawn)=>p.action.kind==='rescue'?own?.rescueReady:p.action.kind==='build'?own?.buildReady:p.action.kind==='cook'?own?.cookReady:own?.workReady;
export const workKind=(p:Proposal)=>p.action.kind==='move'?'haul':p.action.kind;
export function held(d:Domain){return Object.values(d.proposals).filter(p=>p.status==='pending'||p.standing?.status==='running'||!!p.actionId&&d.characters[p.pawn]?.commitment===p.actionId);}
export function productionConflict(p:Proposal,a:Build|Cook,mapId:number){
 const b=p.action;
 if('thing' in b&&b.thing===a.thing)return true;
 if(a.kind==='cook'&&b.kind==='cook'&&a.target===b.target)return true;
 return (workMap(p)===undefined||workMap(p)===mapId)&&a.x===b.x&&a.z===b.z;
}
export function productionView(d:Domain,g:GameState,own:Pawn){
 const v=structuredClone(own.production??null);
 if(!v)return null;
 if(v.epoch!==g.epoch||v.tick!==g.ticks||!Number.isInteger(v.mapId)||v.mapId<0){v.options=[];v.supplies=[];return v;}
 const holds=held(d).filter(p=>p.pawn!==own.id);
 v.options=v.options.filter(a=>Action.safeParse(a).success&&!holds.some(p=>productionConflict(p,a,v.mapId)));
 v.supplies=v.supplies.filter(s=>v.options.some(a=>a.thing===s.thing));return v;
}
export function planProduction(d:Domain,g:GameState,pawn:string,a:Build|Cook){
 const own=g.pawns.find(p=>p.id===pawn),v=own&&productionView(d,g,own);
 if(!v||!Number.isInteger(v.mapId)||v.tick!==g.ticks||v.epoch!==g.epoch)throw Error('Fresh production observation required');
 if(held(d).some(p=>p.pawn===pawn||productionConflict(p,a,v.mapId)))throw Error('Production pawn, source or site already held');
 const option=v.options.find(o=>o.kind===a.kind&&o.thing===a.thing&&o.x===a.x&&o.z===a.z&&(o.kind!=='cook'||a.kind==='cook'&&o.target===a.target&&o.count===a.count&&a.meals<=o.meals));
 const supply=v.supplies.find(s=>s.thing===a.thing);
 if(!option||a.maxTicks>option.maxTicks||!supply||supply.count<(a.kind==='build'?20:a.count*a.meals))throw Error('Production scope exceeds observed option or supply');
 return v.mapId;
}
