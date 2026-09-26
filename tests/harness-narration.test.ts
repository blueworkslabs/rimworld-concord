import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Receipt} from '../src/harness/actions.js';
import {Snapshot,digest} from '../src/harness/perception.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const receipt={seq:3,tick:120,requestId:'r-3',action:'bill',ok:true,id:'Bill_12',reason:null,source:null,detail:null,
  narration:'The core added a bill at the campfire: cook simple meal, 3 times.',narrated:'shown'};

test('receipts keep the game\'s narration and whether it was shown; older receipts without it still parse',()=>{
  assert.deepEqual(Receipt.parse(receipt),receipt);
  const {narration,narrated,...old}=receipt;assert.deepEqual(Receipt.parse(old),old);
});

test('the snapshot keeps narration, the controller\'s digest leaves it out',()=>{
  const raw=JSON.parse(readFileSync(join(root,'tests/fixtures/perception-snapshot.json'),'utf8'));
  raw.receipts=[receipt,{...receipt,seq:4,requestId:'r-4',ok:false,id:null,reason:'Space already occupied',source:'game',
    narration:'The game refused the core\'s request to place a campfire blueprint: Space already occupied.',narrated:'display failed: NullReferenceException'}];
  const s=Snapshot.parse(raw);
  assert.equal(s.receipts[1]!.narrated,'display failed: NullReferenceException');
  const d=digest(s);
  assert.deepEqual(d.receipts.map((r:any)=>[r.requestId,r.ok,r.reason,'narration' in r,'narrated' in r]),[['r-3',true,null,false,false],['r-4',false,'Space already occupied',false,false]]);
  assert.equal(s.receipts[0]!.narration,receipt.narration,'the digest works on a copy');
});
