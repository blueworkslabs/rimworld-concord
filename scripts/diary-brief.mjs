#!/usr/bin/env node
/** Prepare a reviewable Kimi request. Never calls a model or publishes anything. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2);
const mode=args[0],value=args[1];
if(!['--pr','--summary'].includes(mode)||!value||args.length!==2) {
 console.error('Usage: node scripts/diary-brief.mjs --pr NUMBER | --summary facts.json');process.exit(1);
}
let input,stem;
if(mode==='--pr') {
 if(!/^[1-9][0-9]*$/.test(value))throw Error('Expected a positive PR number');
 const pr=JSON.parse(execFileSync('gh',['pr','view',value,'--repo','blueworkslabs/rimworld-concord','--json','number,title,body,url,mergedAt,files'],{encoding:'utf8',maxBuffer:1024*1024}));
 input={project:'RimWorld Concord',date:pr.mergedAt?.slice(0,10)??null,sourceStatus:pr.mergedAt?'merged':'unmerged—do not describe as shipped',
  sourceClaims:{title:pr.title,body:pr.body,changedFiles:pr.files.map(f=>f.path)},
  evidence:[{label:`Implementation PR ${pr.number}`,url:pr.url}],
  editorialNote:'These are PR claims, not independent verification. The editor must verify them and add explicit acceptance evidence before requesting a draft.'};
 stem=`pr-${value}`;
} else {
 input=JSON.parse(readFileSync(resolve(value),'utf8'));stem='summary';
}
const request={provider:'openrouter',model:'moonshotai/kimi-k2',maxTokens:1800,timeoutMs:60000,temperature:0.7,
 prompt:readFileSync(join(root,'docs/diary/writer-prompt.txt'),'utf8'),input,
 schema:JSON.parse(readFileSync(join(root,'docs/diary/entry.schema.json'),'utf8'))};
const dir=join(root,'.diary-work');mkdirSync(dir,{recursive:true});
const target=join(dir,`${stem}-${Date.now()}.request.json`);
writeFileSync(target,JSON.stringify(request,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(target);
console.log('Review the brief before invoking the host-owned llm-task tool. This command made no paid request.');
