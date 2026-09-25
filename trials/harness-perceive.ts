/** Harness perception capture (docs/HARNESS.md, sequence item 2): load a save (or use the running
 * game), take one read-only snapshot, and retain the full snapshot, the model digest and a size
 * summary. No actions, no model calls. The first capture replaces the synthetic test fixture and
 * answers the page's open question on thought-list size from real numbers. */
import {writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {LabBridge} from '../src/lab-bridge.js';
import {digest,since} from '../src/harness/perception.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const args=process.argv.slice(2);const save=args.find(a=>a.startsWith('--save='))?.slice(7);
if(args.some(a=>!a.startsWith('--save=')))throw Error('Usage: harness-perceive [--save=lab-...]');
const b=new LabBridge(undefined,()=>Date.now()+120000);
if(save){await b.load(save);await b.admin('pause');}
const t0=Date.now();const first=await b.perceive();const ms=Date.now()-t0;
const second=await b.perceive();
const d=digest(first);const runId=randomUUID();
const bytes=(x:unknown)=>Buffer.byteLength(JSON.stringify(x));
const summary={runId,save:save??null,at:new Date().toISOString(),perceiveMs:ms,
  fullBytes:bytes(first),digestBytes:bytes(d),digestFitted:d.fitted,
  counts:{things:first.map.things.length,byKind:first.map.things.reduce((m:Record<string,number>,t)=>(m[t.kind]=(m[t.kind]??0)+1,m),{}),
    alerts:first.alerts.length,letters:first.letters.length,zones:first.zones.length,bills:first.bills.reduce((n,x)=>n+x.bills.length,0),
    designations:first.designations.length,pawns:first.pawns.length,threats:first.threats.length,
    thoughtsPerPawn:first.pawns.map(p=>({name:p.name,thoughts:p.mood.thoughts?.length??0,bytes:bytes(p.mood.thoughts??[])}))},
  // Two reads with the game paused: the diff must be empty apart from the snapshot ID.
  pausedDiff:since(first,second),
  sha256:createHash('sha256').update(JSON.stringify(first)).digest('hex')};
await writeFile(root+`/.runtime/harness-perceive-${runId}.json`,JSON.stringify({summary,snapshot:first,digest:d},null,1));
console.log(JSON.stringify(summary));
