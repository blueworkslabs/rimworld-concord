/** Serialize inference cleanup, not just cancellation requests. Queued cancellation
 * never invokes the provider; all callers retain their independent cancellation signal. */
export class InferenceLane {
 async drain(){await this.tail;}
 private tail:Promise<unknown>=Promise.resolve();
 run<T>(signal:AbortSignal,task:()=>Promise<T>):Promise<T> {
  const result=this.tail.then(()=>{signal.throwIfAborted();return task();});
  this.tail=result.catch(()=>{});return result;
 }
}
