/** Inference requests remain small; accumulated experiment receipts have a separate cap. */
export function parseTrialMessage(line:string):any {
 const bytes=Buffer.byteLength(line,'utf8');
 if(bytes>1024*1024)throw Error('Oversized trial transport');
 const message=JSON.parse(line);
 if(message?.type!=='receipt'&&bytes>32000)throw Error('Oversized inference message');
 return message;
}
