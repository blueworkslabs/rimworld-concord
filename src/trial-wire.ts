/** Inference requests remain small; accumulated experiment receipts have a separate cap. */
export const MAX_TRIAL_RECEIPT_BYTES=16*1024*1024;
export function parseTrialMessage(line:string):any {
 const bytes=Buffer.byteLength(line,'utf8');
 if(bytes>MAX_TRIAL_RECEIPT_BYTES)throw Error('Oversized trial transport');
 const message=JSON.parse(line);
 if(message?.type!=='receipt'&&bytes>32000)throw Error('Oversized inference message');
 return message;
}
