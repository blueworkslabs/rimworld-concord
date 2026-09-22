// No inference. Export fixed synthetic cases plus a local, tool-disabled catalog.
import {writeFile,readFile} from 'node:fs/promises';
import {preparedCases} from '../dist/src/contract-cases.js';
if(process.argv.length!==5)throw Error('Usage: prepare-contract-cases.mjs CASES.json SOURCE-CATALOG.json LOCAL-CATALOG.json');
const source=JSON.parse(await readFile(process.argv[3],'utf8'));
const models=source.models.filter(m=>m.slug==='gpt-5.6-luna');if(models.length!==1)throw Error('Exactly one Luna model required');
const model={...models[0],tool_mode:'direct',multi_agent_version:'disabled',supports_search_tool:false};
await writeFile(process.argv[4],JSON.stringify({models:[model]},null,2),{flag:'wx',mode:0o600});
await writeFile(process.argv[2],JSON.stringify({version:'concord-contract-v1',authored:true,cases:preparedCases()},null,2),{flag:'wx',mode:0o600});
