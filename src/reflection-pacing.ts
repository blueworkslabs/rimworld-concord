import type {AttentionAdmission,AttentionClaim,AttentionLease} from './attention.js';
/** One routine slot per wall-clock interval; unused intervals do not accumulate.
 * Reserve slots admit health/casualty events at any time, within the same window.
 * Process-local scheduling only; provider ledgers remain the durable spending guard.
 */
export class ReflectionPacer implements AttentionAdmission {
 private slots=new Map<string,{state:'held'|'used';index:number}>();
 private trace:{pawn:string;throughSeq:number;slot:string;atMs:number;reflectionAtMs?:number;released?:boolean}[]=[];
 private origin:number;
 constructor(private options:{windowMs:number;routineSlots:number;urgentSlots:number},private clock:()=>number=()=>performance.now()){
  if(!Number.isFinite(options.windowMs)||options.windowMs<=0||![options.routineSlots,options.urgentSlots].every(n=>Number.isInteger(n)&&n>=0&&n<=100)||options.routineSlots+options.urgentSlots<1)throw Error('Invalid reflection pacing limits');
  this.origin=clock();if(!Number.isFinite(this.origin))throw Error('Invalid pacing clock');
 }
 private elapsed(){const n=this.clock()-this.origin;if(!Number.isFinite(n)||n<0)throw Error('Pacing clock moved backwards');return n;}
 private available(c:AttentionClaim):string|undefined {
  const now=this.elapsed();if(now>=this.options.windowMs)return;
  if(c.events.some(e=>e.kind==='health'||e.kind==='casualty')){
   for(let i=0;i<this.options.urgentSlots;i++){const slot='urgent:'+i;if(!this.slots.has(slot))return slot;}
  }
  if(this.options.routineSlots){const slot='routine:'+Math.floor(now/(this.options.windowMs/this.options.routineSlots));if(!this.slots.has(slot))return slot;}
 }
 canClaim(c:AttentionClaim){return this.available(c)!==undefined;}
 claim(c:AttentionClaim):AttentionLease|undefined {
  const slot=this.available(c);if(slot===undefined)return;
  const row={pawn:c.pawn,throughSeq:Math.max(...c.events.map(e=>e.seq)),slot,atMs:this.elapsed()};
  const index=this.trace.push(row)-1,token={state:'held' as 'held'|'used',index};this.slots.set(slot,token);
  let released=false;
  return {
   consume:()=>{
    if(released||token.state!=='held'||this.elapsed()>=this.options.windowMs)return false;
    token.state='used';this.trace[index]!.reflectionAtMs=this.elapsed();return true;
   },
   release:()=>{
    if(released)return;released=true;
    if(token.state==='held'){this.slots.delete(slot);this.trace[index]!.released=true;}
   }
  };
 }
 status(){return {windowMs:this.options.windowMs,routineSlots:this.options.routineSlots,urgentSlots:this.options.urgentSlots,elapsedMs:this.elapsed(),used:[...this.slots.values()].filter(s=>s.state==='used').length,held:[...this.slots.values()].filter(s=>s.state==='held').length,claims:structuredClone(this.trace)};}
}
