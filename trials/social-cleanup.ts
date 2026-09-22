/** Independent boundaries: an unavailable pause/contact request must not skip work stops. */
export async function socialCleanup(pause:()=>Promise<unknown>,close:()=>Promise<unknown>,stop:()=>Promise<{errors:unknown[]}>) {
 const errors:string[]=[];let work:{errors:unknown[]}|undefined;
 try{await pause();}catch(e){errors.push('pause: '+String(e));}
 try{await close();}catch(e){errors.push('conversation: '+String(e));}
 try{work=await stop();if(work.errors.length)errors.push('work: '+JSON.stringify(work.errors));}catch(e){errors.push('work: '+String(e));}
 return {errors,work};
}
