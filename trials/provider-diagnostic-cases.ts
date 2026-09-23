import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {coreInstructions,corePrompt,type CoreView} from '../src/core-planner.js';
import {claudeArgs} from '../src/claude-decision.js';
export function providerDiagnosticSuite(){
 const bytes=readFileSync(new URL('../../trials/fixtures/provider-diagnostic-v1.json',import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!=='3d34b168fe9b0a75243c7f03017e974a957874998fd9bec4d7ff1d029cb8128d')throw Error('Frozen source changed');
 const views=JSON.parse(bytes.toString()) as CoreView[];const cases=[];
 for(let repeat=1;repeat<=2;repeat++)for(const [i,condition] of ['initial-with-food','final-without-local-food'].entries()){
  const view=structuredClone(views[i]!);const args=claudeArgs('core',view);
  cases.push({id:`${condition}-${repeat}`,condition,repeat,view,request:{instructions:coreInstructions,prompt:JSON.stringify(corePrompt(view)),schema:JSON.parse(args[args.indexOf('--json-schema')+1]!)}});
 }
 return {version:'provider-diagnostic-v1',maxAttempts:4,caseTimeoutMs:60000,stopOnFailure:false,stopOnPreflightFailure:true,cases};
}
