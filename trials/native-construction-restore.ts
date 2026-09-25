/** New-process restore for construction case 9 (signature C3): a fresh process loads the named
 * save through its own bridge and prints the intent exactly as the mod reports it. The parent
 * compares it with the view it recorded before saving. */
import {LabBridge} from '../src/lab-bridge.js';
import {BuildView} from '../src/native-build.js';
if(process.env.CONCORD_NATIVE_CONSTRUCTION_LOCKED!=='1')throw Error('Exclusive lab lock required');
const [name,intentId]=process.argv.slice(2);
if(!name||!intentId)throw Error('Usage: native-construction-restore <save> <intentId>');
const b=new LabBridge(undefined,()=>Date.now()+110000);
await b.load(name);await b.admin('pause');
const state=await b.state();
const raw=(state.buildIntents??[]).find(i=>i.intentId===intentId);
console.log(JSON.stringify({pid:process.pid,name,view:raw?BuildView.parse(raw):null}));
