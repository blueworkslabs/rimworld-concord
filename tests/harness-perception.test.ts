import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {readFile,writeFile,unlink,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import {Snapshot,since,look,digest} from '../src/harness/perception.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const fixtureText=readFileSync(join(root,'tests/fixtures/perception-snapshot.json'),'utf8');
const fixture=()=>Snapshot.parse(JSON.parse(fixtureText));

test('a perception snapshot round-trips over the bridge wire unchanged',async()=>{
  const lab=mkdtempSync(join(tmpdir(),'concord-perceive-'));mkdirSync(join(lab,'concord'));
  try{
    const b=new LabBridge(lab);let seen:any;
    // The mod's side of the wire: take the request, answer with the snapshot as the receipt.
    const mod=(async()=>{for(let i=0;i<200;i++){try{const req=JSON.parse(await readFile(join(lab,'concord/request.json'),'utf8'));seen=req;await unlink(join(lab,'concord/request.json'));
      const text=`{"id":${JSON.stringify(req.id)},"error":"","ok":true,"receipt":${fixtureText},"state":{"loaded":true,"pawns":[],"actions":[]}}`;
      await writeFile(join(lab,'concord/response.json.tmp'),text);await rename(join(lab,'concord/response.json.tmp'),join(lab,'concord/response.json'));return;}catch{await delay(10);}}})();
    const snap=await b.perceive('e1');await mod;
    assert.equal(seen.op,'perceive');assert.equal(seen.epoch,'e1');
    assert.deepEqual(snap,JSON.parse(fixtureText),'wire, parse and schema preserve every field');
    assert.deepEqual(Snapshot.parse(JSON.parse(JSON.stringify(snap))),snap,'re-serialising changes nothing');
    assert.equal(snap.letters[0]!.text,'Three survivors "crash"\nland.','escaped text survives');
  }finally{rmSync(lab,{recursive:true,force:true});}
});

test('since reports what changed between two snapshots and resets across a load',()=>{
  const a=fixture(),b=structuredClone(a);
  b.meta.tick=3100;b.meta.snapshotId=2;
  b.map.things=b.map.things.filter(t=>t.id!==102);b.map.things.find(t=>t.id===101)!.stack=95;
  b.map.things.push({...b.map.things.find(t=>t.id===104)!,id:107,kind:'frame',def:'Frame_Campfire'});b.map.things=b.map.things.filter(t=>t.id!==104);
  b.alerts=b.alerts.filter(x=>x.type!=='Alert_LowFood');b.letters.push({label:'Raid',def:'ThreatBig',tick:3000,text:null,targets:[]});
  b.pawns[0]!.job.def='HaulToContainer';b.pawns[0]!.needs[0]!.level=0.15;
  b.resources=[{def:'RawBerries',label:'berries',category:'PlantFoodRaw',count:48},{def:'WoodLog',label:'wood',category:'ResourcesRaw',count:95}];
  const d=since(a,b);if(d.reset)throw Error('unexpected reset');
  assert.deepEqual(d.things.appeared.map(t=>t.id),[107]);assert.deepEqual(d.things.disappeared.map(t=>t.id).sort(),[102,104]);
  assert.deepEqual(d.things.changed,[{id:101,def:'WoodLog',from:{stack:75},to:{stack:95}}]);
  assert.deepEqual(d.alerts,{raised:[],cleared:['Alert_LowFood:Low food']});assert.deepEqual(d.letters,[{label:'Raid',tick:3000}]);
  assert.deepEqual(d.pawns,[{id:201,name:'Pedro',changes:['job Wait_Wander -> HaulToContainer','Food low -> urgent']}]);
  assert.deepEqual(d.resources,[{def:'WoodLog',from:120,to:95,crossed:[100]}]);
  const loaded=structuredClone(b);loaded.meta.epoch='e2';assert.deepEqual(since(a,loaded),{reset:true,reason:'the game was loaded since the previous snapshot'});
});

test('look answers area, category, capability and pawn queries as slices of one snapshot',()=>{
  const s=fixture();
  const near=look(s,{by:'area',thing:104,radius:5});
  s.threats.push({id:999,def:'Human',label:'raider',x:10,z:10,hostile:true,manhunter:false,predator:false,downed:false});
  assert.doesNotThrow(()=>look(s,{by:'area',thing:999,radius:5}));
  assert.deepEqual(near.things!.map(t=>t.id).sort(),[103,104,105]);assert.deepEqual(near.pawns!.map(p=>p.name),['Pedro','Beatrice']);
  assert.deepEqual(look(s,{by:'category',category:'beds'}).things!.map(t=>t.id),[105]);
  assert.deepEqual(look(s,{by:'category',category:'food'}).things!.map(t=>t.id),[103]);
  assert.deepEqual((look(s,{by:'capability',work:'Construction'}) as any).pawns.map((p:any)=>p.name),['Pedro'],'disabled work types are not capable');
  assert.equal((look(s,{by:'pawn',pawn:'Beatrice'}) as any).pawn.health.hediffs[0].label,'Asthma');
  assert.throws(()=>look(s,{by:'area',radius:5}),/needs a known thing or a cell/);assert.throws(()=>look(s,{by:'weather'}));
});

test('the digest fits with the shared loop: plants and far clutter go first, omissions are counted',()=>{
  const s=fixture();
  for(let i=0;i<2000;i++)s.map.things.push({id:1000+i,kind:'plant',def:'Plant_Grass',label:'grass',x:i%250,z:Math.floor(i/250),rot:0,stack:1,forbidden:false,faction:null,growth:0.5,harvestable:false});
  const full=digest(s,10_000_000);assert.deepEqual(full.fitted,{omitted:{},fits:true});
  const d=digest(s,6000);
  assert.ok(d.fitted.fits&&Buffer.byteLength(JSON.stringify(d))<=6000);
  assert.deepEqual(Object.keys(d.fitted.omitted),['plants'],'only plants go while plants remain');assert.ok(d.fitted.omitted.plants!>1900);assert.match(d.fitted.note!,/Use look/);
  const kept=d.map.plants.map((p:any)=>p.id);assert.ok(!kept.includes(106),'the farthest plants go first');
  assert.deepEqual(d.map.things.map((t:any)=>t.id).sort(),[104,105],'buildings and blueprints stay');assert.deepEqual(d.map.items.map((t:any)=>t.id).sort(),[101,102,103]);assert.equal(d.pawns.length,2);
  const tight=digest(s,1500);assert.equal(tight.fitted.fits,false,'a limit below the floors is reported, never hidden');
  assert.equal(s.map.things.length,2006,'the snapshot itself is untouched');
});

test('since observes same-size zone edits, job retargeting, health details and frame progress',()=>{
 const a=fixture(),b=structuredClone(a);
 a.zones=[{id:1,label:'zone',kind:'growing',cells:[{x:1,z:1}],plant:'Plant_Rice',allowSow:true}];
 b.zones=[{...structuredClone(a.zones[0]!),cells:[{x:2,z:1}],allowSow:false}];
 a.pawns[0]!.job={def:'HaulToContainer',report:null,target:104};b.pawns[0]!.job={def:'HaulToContainer',report:null,target:105};
 b.pawns[1]!.health.hediffs[0]!.bleeding=0.1;
 a.map.things[0]!.workDone=1;b.map.things[0]!.workDone=2;
 const d=since(a,b);assert(!d.reset);assert.deepEqual(d.zones.changed,[1]);
 assert(d.pawns.find(p=>p.id===201)!.changes.includes('job target changed'));
 assert(d.pawns.find(p=>p.id===202)!.changes.includes('health changed'));
 assert.equal(d.things.changed[0]!.to.workDone,2);
 a.zones=[{id:2,label:'store',kind:'stockpile',cells:[],allowed:['WoodLog']}];b.zones=[{...a.zones[0]!,allowed:['Steel']}];
 const changed=since(a,b);assert(!changed.reset);assert.deepEqual(changed.zones.changed,[2]);
});
test('digest geometry is retained at full budget and omitted sections stay retrievable',()=>{
 const s=fixture();s.zones=[{id:8,label:'large zone',kind:'stockpile',cells:Array.from({length:2000},(_,i)=>({x:i%100,z:Math.floor(i/100)}))}];
 const full=digest(s,1000000);assert.deepEqual(full.zones[0]!.cells,s.zones[0]!.cells);
 const d=digest(s,9000);assert(d.fitted.omitted.zoneCells!>0);assert.match(d.fitted.note!,/section/);
 assert.deepEqual(look(s,{by:'section',section:'zones'}).value,s.zones);
 assert.deepEqual(look(s,{by:'section',section:'letters'}).value,s.letters);
});

test('retained game receipt preserves all real wire fields and fits without losing T1 thoughts',()=>{
 const raw=JSON.parse(readFileSync(join(root,'tests/fixtures/perception-staging.json'),'utf8'));
 const s=Snapshot.parse(raw);assert.deepEqual(s,raw,'actual mod fields must not be stripped');
 assert.equal(s.map.things.length,2072);assert.deepEqual(s.pawns.map(p=>p.mood.thoughts?.length),[5,4,3]);
 assert.equal(s.pawns.find(p=>p.name==='Beatrice')!.health.hediffs.filter(h=>h.label.startsWith('Asthma')).length,2);
 const d=digest(s);assert(d.fitted.fits);assert(Buffer.byteLength(JSON.stringify(d))<=24000);
 assert.deepEqual(d.pawns.map(p=>p.mood.thoughts?.length),[5,4,3]);
 assert.deepEqual(since(s,{...s,meta:{...s.meta,snapshotId:s.meta.snapshotId+1}}).reset,false);
});
