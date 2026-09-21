import { JEV_ENDPOINT, type AppraisalTransport } from './appraisal.js';

/** OpenClaw Gateway-host exec only. Never accepts a plaintext credential fallback.
 * Requires a Node release supporting NODE_USE_ENV_PROXY (tested on 22.23.2).
 * The injected credential stays opaque until the Gateway proxy's HTTPS boundary.
 */
export function protectedJevTransport():AppraisalTransport {
  if(!process.env.OPENROUTER_API_KEY?.startsWith('oc-sent-v2')||!process.env.HTTPS_PROXY||
    !process.env.NODE_EXTRA_CA_CERTS||process.env.NODE_USE_ENV_PROXY!=='1')
    throw Error('Protected Jev transport unavailable');
  return async(body,signal)=>{
    try {
      const response=await fetch(JEV_ENDPOINT,{method:'POST',redirect:'error',signal,
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},
        body:JSON.stringify(body)});
      if(!response.ok) {await response.body?.cancel();throw Error('Provider rejected appraisal');}
      const reader=response.body?.getReader();if(!reader)throw Error('Missing response');
      const chunks:Uint8Array[]=[];let size=0;
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;
        if(size>65536){await reader.cancel();throw Error('Response too large');}chunks.push(value);}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch {throw Error('Protected Jev request failed');} // Never reflect transport headers/errors.
  };
}
