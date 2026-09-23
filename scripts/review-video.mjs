// Offline evaluator only. Run through the protected gateway, never the game runner.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const hash = value => createHash('sha256').update(value).digest('hex');
export function protectedEnvironment(env) {
  return env.OPENROUTER_API_KEY?.startsWith('oc-sent-v2') && Boolean(env.HTTPS_PROXY) &&
    Boolean(env.NODE_EXTRA_CA_CERTS) && env.NODE_USE_ENV_PROXY === '1';
}
export function requestBody(config, video) {
  if (config.model !== 'google/gemini-3.8-flash' || !['video-only', 'receipt-check'].includes(config.phase) ||
      typeof config.prompt !== 'string' || config.prompt.length < 20 || config.prompt.length > 60000 ||
      video.length > 10_000_000 || video.length < 100 || hash(video) !== config.videoSha256) {
    throw new Error('Invalid frozen video review configuration');
  }
  return {
    model: config.model, stream: false, max_tokens: 6000,
    provider: { allow_fallbacks: false }, reasoning: { effort: 'low', exclude: true },
    messages: [{ role: 'user', content: [
      { type: 'text', text: config.prompt },
      { type: 'video_url', video_url: { url: `data:video/mp4;base64,${video.toString('base64')}` } },
    ] }],
  };
}
// Explicit allowlist: never retain headers, raw transport errors, reasoning or provider extras.
export function publicResponse(raw) {
  const c = raw?.choices?.[0];
  if (!c || typeof raw?.model !== 'string' || typeof c.message?.content !== 'string')
    throw new Error('Missing textual review response');
  const usage = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens', 'cost']) {
    if (typeof raw.usage?.[key] === 'number' && Number.isFinite(raw.usage[key]) && raw.usage[key] >= 0)
      usage[key] = raw.usage[key];
  }
  return { model: raw.model, provider: typeof raw.provider === 'string' ? raw.provider : null,
    finishReason: typeof c.finish_reason === 'string' ? c.finish_reason : null,
    hasToolCalls: Boolean(c.message.tool_calls?.length), text: c.message.content, usage };
}
export async function review(config, output, { env = process.env, transport = fetch } = {}) {
  if (!protectedEnvironment(env)) throw new Error('Protected video transport unavailable');
  const video = await readFile(config.videoPath);
  const body = requestBody(config, video);
  // mkdir is exclusive: an attempted call is never rerun into the same receipt directory.
  await mkdir(output);
  const receipt = { phase: config.phase, model: config.model, videoSha256: hash(video),
    prompt: config.prompt, requestSha256: hash(JSON.stringify(body)), startedAt: new Date().toISOString(),
    status: 'reserved' };
  await writeFile(`${output}/attempt.json`, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  const started = performance.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 180000);
  let status = null;
  try {
    const response = await transport('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', redirect: 'error', signal: abort.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      body: JSON.stringify(body),
    });
    status = response.status;
    if (!response.ok) { await response.body?.cancel(); throw new Error('HTTP failure'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 262144) { await reader.cancel(); throw new Error('Response limit'); }
      chunks.push(value);
    }
    const result = publicResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    await writeFile(`${output}/response.json`, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
    receipt.status = result.model === config.model && result.finishReason === 'stop' &&
      result.text.trim() && !result.hasToolCalls ? 'completed' : 'failed';
  } catch {
    receipt.status = 'failed'; // Do not leak provider errors, headers, credentials or arbitrary response fields.
  } finally {
    clearTimeout(timer);
    receipt.httpStatus = status;
    receipt.elapsedMs = Math.round(performance.now() - started);
    await writeFile(`${output}/attempt.json`, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  }
  return { status: receipt.status, elapsedMs: receipt.elapsedMs, httpStatus: status };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = await review(config, process.argv[3]);
    console.log(JSON.stringify(result));
    if (result.status !== 'completed') process.exitCode = 1;
  } catch { console.error('Video review stopped before request; inspect configuration and protected gateway setup.'); process.exitCode = 1; }
}
