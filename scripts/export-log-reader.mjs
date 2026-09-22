import {readFileSync} from 'node:fs';
const packet=JSON.parse(readFileSync(new URL('../trials/fixtures/social-public-log.json',import.meta.url),'utf8'));
// Authored request, but the log itself is retained native trial output, not a fictional fixture.
const instructions='Read only the supplied log. You have no tools or outside context. Return the requested JSON.';
const prompt=JSON.stringify({log:packet.log,questions:['Summarize what happened, citing entry sequence numbers.','What, if anything, was agreed and completed?','What remains unknown or cannot be concluded?','What, if anything, is difficult to follow in this log?']});
const schema={type:'object',additionalProperties:false,required:['summary','findings','ambiguities'],properties:{summary:{type:'string'},findings:{type:'array',items:{type:'object',additionalProperties:false,required:['text','entries'],properties:{text:{type:'string'},entries:{type:'array',items:{type:'integer'}}}}},ambiguities:{type:'array',items:{type:'string'}}}};
process.stdout.write(JSON.stringify({version:'concord-log-read-v1',authored:true,source:packet.source,cases:[{id:'public-log',instructions,prompt,schema}]}));
