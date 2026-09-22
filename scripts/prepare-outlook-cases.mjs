import {readFile,writeFile} from 'node:fs/promises';
import {bankVersion,preparedOutlookCases} from '../dist/trials/outlook-cases.js';
if(process.argv.length!==5)throw Error('Usage: prepare-outlook-cases CASES SOURCE-CATALOG LOCAL-CATALOG');
const source=JSON.parse(await readFile(process.argv[3],'utf8'));
const models=source.models.filter(m=>m.slug==='gpt-5.6-luna');if(models.length!==1)throw Error('Exactly one Luna model required');
await writeFile(process.argv[4],JSON.stringify({models:[{...models[0],tool_mode:'direct',multi_agent_version:'disabled',supports_search_tool:false}]},null,2),{flag:'wx',mode:0o600});
await writeFile(process.argv[2],JSON.stringify({version:bankVersion,authored:true,cases:preparedOutlookCases()}),{flag:'wx',mode:0o600});
