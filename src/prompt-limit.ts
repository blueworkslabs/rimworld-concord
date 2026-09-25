/** Model prompt limit in bytes, for every lane. Oversized inputs are trimmed to fit, never by raising it. */
export const PROMPT_LIMIT=24000;
export const TRIM_NOTE='Older items were left out to fit; they still happened.';

/** The shared fitting loop (core, reflection, harness digest): while `size()` exceeds `limit`,
 * drop the first item of the first list that is still above its floor, in the given order, and
 * count it. Lists are read through `get` so nested lists work. Returns the counts (added to any
 * prior counts) and whether the result fits. The caller owns the copy it passes in. */
export function trimToFit<K extends string>(lists:readonly (readonly [K,()=>unknown[]|undefined,number])[],size:()=>number,limit:number,prior:Partial<Record<K,number>>={},
 /** Called after every removal, before the next size check, so a note the caller adds is measured too. */
 onTrim?:(trimmed:Record<K,number>)=>void){
 const trimmed=Object.fromEntries(lists.map(([k])=>[k,prior[k]??0])) as Record<K,number>;let changed=false;
 while(size()>limit){
  const next=lists.find(([,get,keep])=>(get()?.length??0)>keep);
  if(!next)break;
  next[1]()!.shift();trimmed[next[0]]++;changed=true;onTrim?.(trimmed);
 }
 return {trimmed,changed,fits:size()<=limit};
}
