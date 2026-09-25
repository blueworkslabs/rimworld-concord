import {legacyPawn} from '../trials/fixtures/legacy.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreClaims,scoreClaim,sourceCatalog,bandOf,Claims} from '../trials/claims.js';
import {claimExamples} from '../trials/claims-examples.js';
import {outlookCases} from '../trials/outlook-cases.js';

const view=(id:string)=>outlookCases().find(c=>c.caseId===id&&c.repetition===1)!.view;
const full=()=>view('needs-full'),low=()=>view('needs-low'),unknown=()=>view('needs-unknown'),protect=()=>view('outlook-protect-time');
const FOOD='pawn.needs.Food.fractionFilled',REST='pawn.needs.Rest.fractionFilled';
const fact=(text:string,source:string,assertion:any,subject?:string)=>({kind:'fact' as const,text,source,assertion,...(subject?{subject}:{})});

test('source catalog is derived from the model projection and cites only what was shown',()=>{
 const s=sourceCatalog(protect());const ids=s.map(x=>x.id);
 assert(ids.includes(FOOD));assert(ids.includes('character.outlook.notes[0]'));assert(ids.includes('character.experiences.seq:1'));
 assert(ids.includes('pawn.hauling.supplies.wood@4,2.sourceCount'));assert(ids.some(i=>i.startsWith('offer.')&&i.endsWith('.trips')));
 assert.equal(s.find(x=>x.id===FOOD)!.value,.4);assert.equal(s.find(x=>x.id==='pawn.needs.Mood.fractionFilled')!.known,false);
 assert.equal(sourceCatalog(view('needs-full')).some(x=>x.category==='outlook'),false);
});

test('numeric and percent equivalents, comparisons and negation resolve against the same field',()=>{
 const r=scoreClaims([
  fact('Food is at 90%',FOOD,{op:'eq',value:90,unit:'percent'}),
  fact('Food is at 0.9',FOOD,{op:'eq',value:.9}),
  fact('Food is above 0.35',FOOD,{op:'gt',value:.35}),
  fact('Food is not at 10%',FOOD,{op:'ne',value:10,unit:'percent'}),
  fact('Food is at 10%',FOOD,{op:'eq',value:10,unit:'percent'}),
  fact('Food is below the stop threshold',FOOD,{op:'lt',value:.35}),
 ],full(),'ignored prose');
 assert.deepEqual(r.claims.map(c=>c.verdict),['supported','supported','supported','supported','contradicted','contradicted']);
 assert.equal(r.counts.supported,4);assert.equal(r.counts.contradicted,2);assert.equal(r.coverage.reasonCharacters,13);
});

test('qualitative band words are checkable only for need meters, and negated bands invert',()=>{
 assert.equal(bandOf(.1),'low');assert.equal(bandOf(.35),'moderate');assert.equal(bandOf(.7),'high');
 const r=scoreClaims([
  fact('I am very hungry',FOOD,{op:'band',value:'low'}),
  fact('I am not exhausted',REST,{op:'band',value:'low',negated:true}),
  fact('I am well fed',FOOD,{op:'band',value:'high'}),
 ],low());
 assert.deepEqual(r.claims.map(c=>c.verdict),['supported','contradicted','contradicted']);
 const supply=scoreClaims([fact('the wood pile is low','pawn.hauling.supplies.wood@4,2.sourceCount',{op:'band',value:'low'})],protect());
 assert.equal(supply.claims[0]!.verdict,'unscorable');assert.match(supply.claims[0]!.notes.join(' '),/need meters only/);
});

test('unknown fields are reported as unknown, and claiming unknown is itself checkable',()=>{
 const r=scoreClaims([
  fact('Food is at 90%',FOOD,{op:'eq',value:90,unit:'percent'}),
  fact('Food is unknown',FOOD,{op:'unknown'}),
  fact('Rest is unknown',REST,{op:'unknown'}),
 ],unknown());
 assert.equal(r.claims[0]!.verdict,'unknown_reference');assert.equal(r.claims[1]!.verdict,'supported');
 assert.equal(scoreClaims([fact('Food is unknown',FOOD,{op:'unknown'})],full()).claims[0]!.verdict,'contradicted');
});

test('a citation that exists but is about something else is irrelevant, not supporting',()=>{
 const r=scoreClaims([
  fact('Food is at 90%',REST,{op:'eq',value:90,unit:'percent'},'Food'),
  fact('Rest is at 90%',REST,{op:'eq',value:90,unit:'percent'},'Rest'),
  fact('Food is at 90%','pawn.needs.Hunger.fractionFilled',{op:'eq',value:90,unit:'percent'},'Food'),
 ],full());
 assert.deepEqual(r.claims.map(c=>c.verdict),['irrelevant_source','supported','source_missing']);
 assert.equal(r.claims[0]!.sourceExists,true);assert.equal(r.claims[2]!.sourceExists,false);
});

test('forecasts are counted and never verified; labelling something a forecast does not validate it',()=>{
 const r=scoreClaims([
  {kind:'forecast',text:"I'd collapse before completing one trip",basis:[FOOD]},
  {kind:'forecast',text:'there is no risk of stopping early',basis:[]},
  {kind:'forecast',text:'Food is at 90%',basis:[FOOD]},
  {kind:'forecast',text:'the sky will fall',basis:['pawn.needs.Doom.fractionFilled']},
 ],low());
 assert(r.claims.every(c=>c.verdict==='forecast_unverified'));assert.equal(r.counts.forecast_unverified,4);
 assert.equal(r.claims[2]!.labelSuspect,'reads_like_fact');assert.equal(r.claims[3]!.sourceExists,false);
 assert.equal(r.counts.supported,0,'a forecast never counts as supported');
});

test('fact labels that read like predictions are flagged as suspect without changing the verdict',()=>{
 const r=scoreClaims([fact('Food will drop below 35% mid-trip',FOOD,{op:'gt',value:.35})],protect());
 assert.equal(r.claims[0]!.verdict,'supported');assert.equal(r.claims[0]!.labelSuspect,'reads_like_forecast');assert.equal(r.counts.labelSuspect,1);
});

test('preferences may cite an outlook note or trait, or be new; new is counted and never an error',()=>{
 const r=scoreClaims([
  {kind:'preference',text:'I prefer to eat first',source:'character.outlook.notes[0]'},
  {kind:'preference',text:'I dislike wood',},
  {kind:'preference',text:'I prefer steel',source:'character.outlook.notes[7]'},
  {kind:'preference',text:'I prefer facts',source:FOOD},
 ],protect());
 assert.deepEqual(r.claims.map(c=>c.verdict),['preference_sourced','preference_new','source_missing','irrelevant_source']);
 assert.match(r.claims[3]!.notes.join(' '),/non-outlook/);
 assert.equal(scoreClaims([{kind:'preference',text:'I prefer to eat first',source:'character.outlook.notes[0]'}],view('outlook-empty')).claims[0]!.verdict,'source_missing');
});

test('coverage is honest: prose stays unscored and zero contradictions is not a truth score',()=>{
 const r=scoreClaims([],full(),'A long reason with no claims at all that the scorer cannot see into.');
 assert.equal(r.coverage.claimCount,0);assert.equal(r.coverage.unscoredProse,true);assert.equal(r.counts.contradicted,0);
 assert.match(r.limitation,/not a truth score/);
 const partial=scoreClaims([fact('Food is at 90%',FOOD,{op:'eq',value:90,unit:'percent'})],full(),'Food is at 90% and I will definitely finish.');
 assert(partial.coverage.claimTextCharacters<partial.coverage.reasonCharacters!);assert.equal(partial.coverage.sourcesCited,1);
});

test('malformed claims are rejected before scoring',()=>{
 assert.throws(()=>Claims.parse([{kind:'fact',text:'x',source:FOOD}]));
 assert.throws(()=>Claims.parse([{kind:'fact',text:'x',source:FOOD,assertion:{op:'eq',value:.9},extra:1}]));
 assert.throws(()=>Claims.parse(new Array(13).fill({kind:'preference',text:'too many'})));
 assert.throws(()=>Claims.parse([{kind:'fact',text:'x',source:FOOD,assertion:{op:'eq',value:.9,tolerance:.5}}]));
 assert.throws(()=>scoreClaims([{kind:'opinion',text:'x'}],full()));
});

test('reviewer-encoded examples from retained evidence produce the expected verdicts',()=>{
 const expect:Record<string,string[]>={
  'claude-needs-low-r1':['supported','supported','supported','forecast_unverified'],
  'claude-outlook-protect-time-r2':['supported','unscorable','forecast_unverified','preference_sourced'],
  'luna-needs-low-r1':['supported','supported'],
  'luna-outlook-protect-time-r1':['preference_sourced','supported'],
  'authored-luna-hunger-mixup':['contradicted','contradicted'],
 };
 const views:Record<string,()=>any>={'needs-low':low,'outlook-protect-time':protect,probe:full};
 for(const ex of claimExamples){
  const r=scoreClaims(ex.claims,views[ex.caseId]!(),ex.reason);
  assert.deepEqual(r.claims.map(c=>c.verdict),expect[ex.id],ex.id);
  for(const c of r.claims){const cl=c.claim;if(cl.kind==='fact'&&cl.subject)assert.equal(cl.subject.toLowerCase(),sourceCatalog(views[ex.caseId]!()).find(s=>s.id===cl.source)?.subject.toLowerCase(),ex.id);}
 }
 const collapse=scoreClaim(claimExamples[0]!.claims[3]!,sourceCatalog(low()));
 assert.equal(collapse.verdict,'forecast_unverified');assert.equal(collapse.sourceExists,true);
});


test('supply references include destination identity and are independent of list order',()=>{
 const v=protect();const legacy=legacyPawn(v.pawn);const first=legacy.hauling!.supplies![0]!;
 legacy.hauling!.supplies!.push({...first,x:5,z:2,destinationFree:10});
 const claim=fact('the second destination has capacity 10','pawn.hauling.supplies.wood@5,2.destinationFree',{op:'eq',value:10});
 for(let i=0;i<2;i++){
  const catalog=sourceCatalog(v);assert.equal(new Set(catalog.map(s=>s.id)).size,catalog.length);
  const r=scoreClaims([claim],v).claims[0]!;assert.equal(r.verdict,'supported');assert.equal(r.reference,10);
  legacy.hauling!.supplies!.reverse();
 }
});

test('native skills, memories and relations are not classified as preference traits',()=>{
 const v=protect();
 for(const key of ['trait','skill','memory','relation'])v.pawn.facts!.push({key,value:'sample',level:2});
 for(const key of ['trait','skill','memory','relation']){
  const source=`pawn.facts.${key}.sample`;
  const r=scoreClaims([{kind:'preference',text:'I prefer this',source}],v).claims[0]!;
  assert.equal(r.verdict,key==='trait'?'preference_sourced':'irrelevant_source');
 }
});

test('numeric units cannot turn an absolute quantity into a percentage',()=>{
 const source='pawn.hauling.supplies.wood@4,2.sourceCount';
 const r=scoreClaims([
  fact('30 units',source,{op:'eq',value:30}),
  fact('3000 percent',source,{op:'eq',value:3000,unit:'percent'}),
  fact('30 as a fraction',source,{op:'eq',value:30,unit:'fraction'}),
 ],protect());
 assert.deepEqual(r.claims.map(c=>c.verdict),['supported','unscorable','unscorable']);
 assert.throws(()=>Claims.parse([fact('infinite',FOOD,{op:'gt',value:Infinity})]));
});
