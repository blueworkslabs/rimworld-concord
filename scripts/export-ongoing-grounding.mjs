import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
/** Historical v1 requests are immutable even when production prompts change. */
export function caseBank(){
 const e=JSON.parse(readFileSync(new URL('../docs/evidence/ongoing-grounding-comparison.json',import.meta.url)));
 const source='docs/evidence/luna-ongoing-integration.json';
 const bytes=readFileSync(new URL('../'+source,import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!==e.sourceSha256)throw Error('Historical source changed');
 return {version:'ongoing-grounding-v1',source,sourceSha256:e.sourceSha256,models:e.models,effort:'low',cases:e.requests};
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(caseBank()));
