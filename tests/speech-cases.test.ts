import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {preparedSpeechCases,speechCases,checkSpeechResult,bankVersion} from '../trials/speech-cases.js';
import {runSpeechClaude} from '../trials/run-speech-claude.js';
import {modelPrompt} from '../src/model-perspective.js';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
test('speech contrasts vary only correspondence; rubrics stay out of prompts, not new truth/consent',()=>{
 const cases=preparedSpeechCases();assert.equal(cases.length,12);
 const strip=(v:typeof cases[number]['view'])=>{const copy=structuredClone(v);delete copy.character.messages;return copy;};
 for(let i=0;i<cases.length;i++){
  const c=cases[i]!;assert.deepEqual(strip(c.view),strip(cases[0]!.view));
  if(i<6)assert.deepEqual(c.view,cases[i+6]!.view);
  assert.deepEqual(JSON.parse(c.prompt).perspective.character.messages,c.view.character.messages);assert(!c.prompt.includes(c.rubric));
  assert.equal(c.view.proposals[0]!.status,'pending');assert.equal(c.view.character.intention,undefined);
  assert.equal(c.view.character.outlook,undefined);assert(!('otherPawns' in c.view));
  for(const m of c.view.character.messages??[]){assert.equal(m.from,'B');assert.equal(m.to,'A');assert(m.tick<40);}
  assert.equal(checkSpeechResult(c.id,{reflection:{choice:'keep_current_activity',reason:'Unchanged'}}).choice,'keep_current_activity');
  for(const kind of ['refuse','accept'])assert.doesNotThrow(()=>checkSpeechResult(c.id,{reflection:{choice:'answer_pending_proposal',proposalId:c.view.proposals[0]!.id,decision:{kind,reason:'My independent choice'}}}));
 }
 assert.equal(speechCases().find(c=>c.caseId==='corrected-report')!.view.character.messages!.length,2);
 assert.throws(()=>checkSpeechResult(cases[0]!.id,{reflection:{choice:'answer_pending_proposal',proposalId:'wrong',decision:{kind:'accept',reason:'Claimed'}}}));
});
test('archived speech bank rejects provider-contract drift before opening a backend or spending',async()=>{
 const root=mkdtempSync(tmpdir()+'/speech-archive-'),file=root+'/cases.json';
 writeFileSync(file,JSON.stringify({version:bankVersion,authored:true,cases:preparedSpeechCases()}));
 let calls=0;await assert.rejects(runSpeechClaude(file,root+'/run',()=>{calls++;throw Error('must not create');}),/original build/);assert.equal(calls,0);
});
test('cold-reader exporter contains only retained public log and neutral questions, no answer key or private context',()=>{
 const exported=JSON.parse(execFileSync(process.execPath,['scripts/export-log-reader.mjs'],{encoding:'utf8'}));
 const fixture=JSON.parse(readFileSync('trials/fixtures/social-public-log.json','utf8'));
 assert.equal(exported.cases.length,1);assert.equal(fixture.source.synthetic,false);
 const prompt=JSON.parse(exported.cases[0].prompt);assert.deepEqual(prompt.log,fixture.log);
 assert.deepEqual(Object.keys(prompt).sort(),['log','questions']);assert.deepEqual(Object.keys(prompt.log).sort(),['agreements','entries']);
 for(const e of prompt.log.entries)assert.deepEqual(Object.keys(e).sort(),['actor','key','kind','recipient','seq','subject','text','tick']);
 assert(!exported.cases[0].prompt.includes(fixture.source.receiptSha256));
});
