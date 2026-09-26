import {test} from 'node:test';
import assert from 'node:assert/strict';
import {armFindings,compareArms,DECLARED,type ArmEvidence} from '../src/harness/controller-proof.js';

const ev=(arm:'harness'|'ui',over:Partial<ArmEvidence>={}):ArmEvidence=>({arm,controllerVersion:'codex-cli 0.153.4',exit:0,responsesRequests:1,toolsCarrier:'additional_tools input item',
  tools:[{type:'namespace',name:'functions',sha256:'shared',tools:['list_mcp_resources','list_mcp_resource_templates','read_mcp_resource']},{type:'namespace',name:'mcp__arm',sha256:arm,tools:[...DECLARED[arm]]}],
  instructionsSha256:null,instructionsBytes:0,input:[{type:'message',role:'developer',sha256:'base',bytes:21521},{type:'message',role:'user',sha256:'task',bytes:834}],
  model:'gpt-6-astra',reasoning:{effort:'medium'},toolChoice:'auto',parallelToolCalls:true,stderrTail:'',...over});

test('the controller proof accepts arms that differ only in the declared arm tools',()=>{
  assert.deepEqual(compareArms(ev('harness'),ev('ui')),[]);
});

test('the controller proof rejects an extra built-in, a missing arm server, a changed context or setting',()=>{
  const shell=ev('harness',{tools:[...ev('harness').tools,{type:'function',name:'shell',sha256:'x'}]});
  assert.match(armFindings(shell).join(),/unexpected controller tool shell/);
  const hidden=ev('ui',{tools:[{type:'namespace',name:'functions',sha256:'shared',tools:['list_mcp_resources','apply_patch']},{type:'namespace',name:'mcp__arm',sha256:'ui',tools:[...DECLARED.ui]}]});
  assert.match(armFindings(hidden).join(),/unexpected controller tool apply_patch/,'members of a built-in namespace count');
  assert.match(armFindings(ev('harness',{tools:[ev('harness').tools[0]!]})).join(),/expected one mcp__arm namespace, got 0 \(did the arm server start\?\)/);
  assert.match(armFindings(ev('harness',{tools:[ev('harness').tools[0]!,{type:'namespace',name:'mcp__arm',sha256:'h',tools:['observe','act']}]})).join(),/not the declared set/);
  assert.match(armFindings(ev('ui',{responsesRequests:0,stderrTail:'auth'})).join(),/sent no model request/);
  assert.match(compareArms(ev('harness'),ev('ui',{input:[{type:'message',role:'developer',sha256:'other',bytes:1},ev('ui').input[1]!]})).join(),/context/);
  assert.match(compareArms(ev('harness'),ev('ui',{reasoning:{effort:'high'}})).join(),/reasoning differs/);
  assert.match(compareArms(ev('harness'),ev('ui',{tools:[{...ev('ui').tools[0]!,sha256:'changed'},ev('ui').tools[1]!]})).join(),/non-arm tools differ/);
});
