import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TrialBudget } from '../src/appraisal.js';

test('mismatched deployed runner fails before game command or inference',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-runner-'));
 try{
   const count=join(dir,'ssh-count');
   await writeFile(join(dir,'ssh'),`#!/usr/bin/env node\nrequire('fs').appendFileSync(${JSON.stringify(count)},'read\\n');console.log('wronghash  runner.js');\n`,{mode:0o700});
   const config={sshTarget:'fixture',labRoot:'/lab',remoteRepo:'/repo',ledger:join(dir,'budget.db'),scratchRoot:dir,receipt:join(dir,'receipt.json'),auditDB:'/repo/.runtime/claude-game-fixture.db'};
   await writeFile(join(dir,'config.json'),JSON.stringify(config));
   await assert.rejects(promisify(execFile)(process.execPath,['scripts/run-claude-game.mjs',join(dir,'config.json'),'--audit'],{env:{...process.env,PATH:dir+':'+process.env.PATH}}),/Remote decision runner differs/);
   assert.equal(await readFile(count,'utf8'),'read\n');
   const budget=new TrialBudget(config.ledger);assert.equal(budget.summary()!.calls,0);budget.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
