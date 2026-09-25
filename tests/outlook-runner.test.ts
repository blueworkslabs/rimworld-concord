import {test} from 'node:test';
import {legacyPawn} from '../src/protocol.js';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {runOutlookClaude} from '../trials/run-outlook-claude.js';
import {preparedOutlookCases,bankVersion} from '../trials/outlook-cases.js';
test('outlook bank must match before a backend is created, and started failures cannot replay',async()=>{
 const root=mkdtempSync(tmpdir()+'/outlook-run-'),file=root+'/cases.json',out=root+'/run';
 const suite={version:bankVersion,authored:true,cases:preparedOutlookCases()};
 const changed=structuredClone(suite);legacyPawn(changed.cases[6]!.view.pawn).workReady=false;
 writeFileSync(file,JSON.stringify(changed));let created=0,calls=0;
 const backend:any={receipts:[],rawResponses:[],failures:[],requestSizes:[],close(){},summary:()=>({attempts:calls}),async reflect(){calls++;const r=JSON.parse(readFileSync(out+'/receipt.json','utf8'));assert.equal(r.attempts,1);assert.equal(r.results[0].status,'started');throw Error('Retained failure');}};
 await assert.rejects(runOutlookClaude(file,out,()=>{created++;return backend;}),/Frozen/);assert.equal(created,0);
 writeFileSync(file,JSON.stringify(suite));const result=await runOutlookClaude(file,out,()=>backend);
 assert.equal(calls,1);assert.equal(result.results[0].status,'failed');
 await assert.rejects(runOutlookClaude(file,out,()=>backend),/EEXIST/);assert.equal(calls,1);
});
