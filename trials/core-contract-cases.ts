import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {coreInstructions,corePrompt,type CoreView} from '../src/core-planner.js';
import {claudeArgs} from '../src/claude-decision.js';
export const coreContractVersion='core-contract-v1';
export function coreContractSuite(){
 const bytes=readFileSync(new URL('../../trials/fixtures/core-contract-v1.json',import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!=='189b23fa4010a95da2fd2ada8e68650c5f6621932817e6cd96a82306e0fc3fd1')throw Error('Frozen source changed');
 const original=JSON.parse(bytes.toString()) as CoreView;
 const cases=[];
 for(let repeat=1;repeat<=2;repeat++)for(const condition of ['original','question-or-wait','wait-only'] as const){
  const view=structuredClone(original);
  if(condition!=='original'){
   view.opportunities=[];view.counters=[];
   view.availability=view.availability.map(a=>({...a,status:'No currently eligible grounded option; unknown is not refusal.'}));
  }
  if(condition==='wait-only')view.questionRecipients=[];
  const args=claudeArgs('core',view);
  cases.push({id:`${condition}-${repeat}`,condition,repeat,view,request:{instructions:coreInstructions,prompt:JSON.stringify(corePrompt(view)),schema:JSON.parse(args[args.indexOf('--json-schema')+1]!)}});
 }
 return {version:coreContractVersion,maxAttempts:6,caseTimeoutMs:60000,stopOnFailure:true,cases};
}
