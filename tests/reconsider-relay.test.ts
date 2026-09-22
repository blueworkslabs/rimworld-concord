import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('relay preserves a returned answer rejected by the game and accepts its larger final receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-relay-'));
 try{
  const h=createHash('sha256');for(const n of (await readdir('dist/src')).filter(n=>n.endsWith('.js')).sort()){h.update(n);h.update(await readFile('dist/src/'+n));}
  const fake=`#!/usr/bin/env node
if(process.argv.at(-1).includes('node -e')){console.log(${JSON.stringify(h.digest('hex'))});process.exit(0);}
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',send=m=>console.log(JSON.stringify(m));
const input=require('readline').createInterface({input:process.stdin});
input.on('line',line=>{const m=JSON.parse(line);if(m.type==='decision-result')send({type:'drain',id});else if(m.type==='drained'){process.stdout.write(JSON.stringify({type:'receipt',receipt:{passed:true,decisionApplied:false,reason:'Answer stale after a new event',evidence:'x'.repeat(100000)}})+'\\n',()=>process.exit(0));}});
send({type:'decision-request',id,mode:'decision',view:{pawn:{id:'A'}}});
`;
  await writeFile(join(dir,'ssh'),fake,{mode:0o700});
  const config={sshTarget:'fixture',labRoot:'/lab',remoteRepo:'/repo',ledger:join(dir,'claude.db'),jevLedger:join(dir,'jev.db'),scratchRoot:dir,receipt:join(dir,'receipt.json')};
  await writeFile(join(dir,'config.json'),JSON.stringify(config));
  await promisify(execFile)(process.execPath,['scripts/run-reconsider-game.mjs',join(dir,'config.json'),'--scripted'],{cwd:resolve('.'),env:{...process.env,PATH:dir+':'+process.env.PATH},timeout:10000,maxBuffer:1024*1024});
  const result=JSON.parse(await readFile(config.receipt,'utf8')),saved=JSON.parse(await readFile(config.receipt+'.responses.json','utf8'));
  assert.equal(result.passed,true);assert.equal(result.game.decisionApplied,false);assert.equal(result.game.evidence.length,100000);
  assert.equal(saved.responses[0].output.kind,'accept');assert.deepEqual(result.responses,saved.responses);
 }finally{await rm(dir,{recursive:true,force:true});}
});
