/** As-of rule (Gate C, docs/trials/NATIVE_HAUL_LIVE.md): every fact the core sees carries its
 * snapshot tick, completion times come from receipts, and narration built on a snapshot older
 * than the newest receipt is flagged before publication. */
import type {Domain,GameState} from './protocol.js';

/** Game events that are receipts of something having happened (not samples of state). */
export const RECEIPT_KINDS=new Set(['ingested','haul-delivered','intent-retired','intent-opened','casualty','casualty-recovered']);

export function newestReceiptTick(d:Domain,g:GameState):number{
  let newest=-1;
  for(const e of g.events??[])if(RECEIPT_KINDS.has(e.kind)&&e.tick>newest)newest=e.tick;
  for(const c of Object.values(d.characters))for(const x of c.experiences??[])if(RECEIPT_KINDS.has(x.event.kind)&&x.event.tick>newest)newest=x.event.tick;
  for(const v of Object.values(d.intentViews??{}))if(v.lastDeliveryTick>newest)newest=v.lastDeliveryTick;
  return newest;
}

/** Crew-log prefix for narration published after newer receipts arrived. */
export function staleNote(data:{asOfTick?:number;newerReceiptTick?:number}):string{
  return data.newerReceiptTick!==undefined&&data.asOfTick!==undefined?`[as of t${data.asOfTick}; newer receipts since t${data.newerReceiptTick}] `:'';
}
