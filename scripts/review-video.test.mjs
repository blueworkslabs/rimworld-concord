import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { requestBody, publicResponse, protectedEnvironment, review } from './review-video.mjs';
const env = { OPENROUTER_API_KEY: 'oc-sent-v2-test-only', HTTPS_PROXY: 'test', NODE_EXTRA_CA_CERTS: 'test', NODE_USE_ENV_PROXY: '1' };
const video = Buffer.alloc(200, 7);
const config = { model: 'google/gemini-3.8-flash', phase: 'video-only', prompt: 'Describe only what is visible in this video.', videoSha256: createHash('sha256').update(video).digest('hex') };
const raw = { model: config.model, provider: 'Google', choices: [{finish_reason:'stop',message:{content:'Uncertain readable observation',reasoning:'PRIVATE'}}], usage:{prompt_tokens:5,cost:0.001,secret:'PRIVATE'}, secret:'PRIVATE' };
test('true video request pins model, no tools/fallback and checks asset hash', () => {
 const body=requestBody(config,video); assert.equal(body.messages[0].content[1].type,'video_url');
 assert.equal(body.messages[0].content[1].video_url.url,'data:video/mp4;base64,'+video.toString('base64'));
 assert.equal(body.tools,undefined); assert.equal(body.provider.allow_fallbacks,false);
 assert.throws(()=>requestBody({...config,videoSha256:'bad'},video));
 assert.equal(protectedEnvironment({...env,OPENROUTER_API_KEY:'unprotected'}),false);
});
test('allowlist omits injected private fields, reasoning and extra usage fields; retains incomplete answers for inspection', () => {
 const result=publicResponse(raw); assert.deepEqual(Object.keys(result).sort(),['finishReason','hasToolCalls','model','provider','text','usage']);
 assert.deepEqual(result.usage,{prompt_tokens:5,cost:0.001}); assert.equal(result.reasoning,undefined); assert.equal(result.secret,undefined);
 assert.equal(publicResponse({...raw,model:'other'}).model,'other');
 assert.equal(publicResponse({...raw,choices:[{...raw.choices[0],finish_reason:'length'}]}).finishReason,'length');
});
test('one attempt retained, replay refuses before transport, no raw error disclosure', async () => {
 const root=await mkdtemp(tmpdir()+'/video-review-');
 try {
  await writeFile(root+'/video.mp4',video); const cfg={...config,videoPath:root+'/video.mp4'}; let calls=0; let request;
  const transport=async(url,options)=>{calls++;request={url,options};return new Response(JSON.stringify(raw),{status:200});};
  const result=await review(cfg,root+'/ok',{env,transport}); assert.equal(result.status,'completed'); assert.equal(calls,1);
  assert.equal(request.url,'https://openrouter.ai/api/v1/chat/completions'); assert.equal(request.options.redirect,'error');
  await assert.rejects(review(cfg,root+'/ok',{env,transport}));assert.equal(calls,1);
  const fail=await review(cfg,root+'/failure',{env,transport:async()=>{throw new Error('PRIVATE_SECRET');}});
  assert.equal(fail.status,'failed'); assert.equal((await readFile(root+'/failure/attempt.json','utf8')).includes('PRIVATE_SECRET'),false);
  const incomplete=await review(cfg,root+'/incomplete',{env,transport:async()=>new Response(JSON.stringify({...raw,choices:[{...raw.choices[0],finish_reason:'length'}]}))});
  assert.equal(incomplete.status,'failed'); assert.equal(JSON.parse(await readFile(root+'/incomplete/response.json','utf8')).text,raw.choices[0].message.content);
  const oversized=await review(cfg,root+'/oversized',{env,transport:async()=>new Response('x'.repeat(262145))}); assert.equal(oversized.status,'failed');
  const rejected=await review(cfg,root+'/http',{env,transport:async()=>new Response('PRIVATE_SECRET',{status:429})}); assert.equal(rejected.httpStatus,429); assert.equal(rejected.status,'failed');
  await assert.rejects(review(cfg,root+'/unsafe',{env:{},transport}));assert.equal(calls,1);
 } finally { await rm(root,{recursive:true,force:true}); }
});
