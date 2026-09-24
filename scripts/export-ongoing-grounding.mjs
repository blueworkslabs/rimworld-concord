import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {codexRequest} from '../dist/src/codex-decision.js';
const source=new URL('../docs/evidence/luna-ongoing-integration.json',import.meta.url);
export function caseBank(){
 const bytes=readFileSync(source),e=JSON.parse(bytes);
 const specs=[['eligible-recipients',1],['newer-testimony',3],['completed-self-care',5]];
 return {version:'ongoing-grounding-v1',source:'docs/evidence/luna-ongoing-integration.json',sourceSha256:createHash('sha256').update(bytes).digest('hex'),
  models:['gpt-5.6-luna','gpt-5.6-terra'],effort:'low',cases:specs.map(([id,index])=>{
   const input=e.publicCoreInputs[index];
   return {id,index,view:input.view,request:codexRequest('core',input.view)};
  })};
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(caseBank()));
