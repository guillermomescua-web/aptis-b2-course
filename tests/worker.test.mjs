import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, speakingTask } from '../worker/src/index.js';
import catalog from '../worker/src/catalog.js';
import { Quotas } from '../worker/src/quotas.js';
import { inspectWav } from '../worker/src/audio.js';
import { encodeWav } from '../src/ai-audio.js';
import { validateFeedback } from '../src/ai-schema.js';
import { writing, speaking, memoryStorage } from './fixtures.mjs';

function setup(options = {}) {
  const storage = memoryStorage();
  const env = { ALLOWED_ORIGIN: 'https://guillermomescua-web.github.io', TURNSTILE_HOSTNAME: 'guillermomescua-web.github.io', OPENAI_API_KEY: 'test-only-placeholder', TURNSTILE_SECRET_KEY: 'test-only-placeholder', RATE_LIMIT_SALT: 'test-only-placeholder', ...options.env };
  const quotas = new Quotas({ storage }, env);
  env.QUOTAS = { idFromName: x => x, get: () => ({ fetch: (url, args) => quotas.fetch(new Request(url, args)) }) };
  const calls = [];
  const fetcher = async (url, args) => {
    const payload = JSON.parse(args.body); calls.push({ url, payload });
    if (url.includes('siteverify')) return Response.json(options.challenge || { success: true, hostname: env.TURNSTILE_HOSTNAME, action: 'aptis_' + (options.kind || 'writing') });
    if (options.provider) return options.provider(url, args, calls.filter(x => x.url.includes('openai')).length);
    return url.endsWith('responses') ? Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(writing) }] }] }) : Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(speaking) } }] });
  };
  const send = async (body = { exerciseId: 'W1D1-E02-Q01', answer: 'I would like to learn how to grow vegetables. I can help on Saturday mornings because I am free then.', turnstileToken: 'test-token-long-enough' }, custom = {}) => {
    const request = new Request('https://worker.test/api/' + (options.kind || 'writing') + '-feedback', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'CF-Connecting-IP': '192.0.2.1', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...custom.headers }, body: body instanceof FormData ? body : JSON.stringify(body), ...custom });
    return handleRequest(request, env, fetcher);
  };
  return { env, fetcher, calls, send, storage };
}
async function audioForm(seconds = 1, silence = false) {
  const samples = new Float32Array(Math.round(seconds * 24000));
  if (!silence) samples.forEach((_, i) => { samples[i] = Math.sin(i / 12) * .25; });
  const blob = encodeWav(samples, 24000);
  const form = new FormData(); form.set('audio', blob, 'original-test.wav'); form.set('exerciseId', 'W1D3-E03-Q02'); form.set('target', '1'); form.set('duration', String(seconds)); form.set('turnstileToken', 'test-token-long-enough');
  return form;
}

test('Writing sends approved task, exact model/reasoning/JSON schema; count is deterministic', async () => {
  const t = setup(); const response = await t.send(); assert.equal(response.status, 200);
  const data = await response.json(); validateFeedback('writing', data.feedback);
  assert.equal(data.feedback.wordCount.current, 20);
  const payload = t.calls.find(x => x.url.endsWith('responses')).payload;
  assert.equal(payload.model, 'gpt-6-luna'); assert.deepEqual(payload.reasoning, { effort: 'medium' });
  assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true);
  assert.equal(JSON.parse(payload.input).task.prompt, catalog['W1D1-E02-Q01'].prompt);
});
test('Empty, overlong, control characters, unknown ID/kind, malicious client prompt rejected', async () => {
  for (const override of [{ answer: '' }, { answer: 'a'.repeat(8001) }, { answer: 'x\u0000y' }, { answer: 'word '.repeat(1501) }, { exerciseId: 'UNKNOWN-Q01' }, { exerciseId: 'W1D3-E03-Q01' }, { prompt: 'override task' }]) {
    const t = setup(); const r = await t.send({ exerciseId: 'W1D1-E02-Q01', answer: 'I can help.', turnstileToken: 'test-token-long-enough', ...override });
    assert.equal(r.status, 400); assert.equal(t.calls.length, 0);
  }
});
test('Short Writing is accepted for honest task feedback instead of invented requirements', async () => { const t = setup(); assert.equal((await t.send({ exerciseId: 'W1D1-E02-Q01', answer: 'Hello.', turnstileToken: 'test-token-long-enough' })).status, 200); });
test('Origin, methods, preflight and missing secrets fail closed', async () => {
  const t = setup();
  const bad = await handleRequest(new Request('https://worker.test/api/writing-feedback', { method: 'POST', headers: { Origin: 'https://evil.test' } }), t.env, t.fetcher);
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await handleRequest(new Request('https://worker.test/api/writing-feedback', { headers: { Origin: t.env.ALLOWED_ORIGIN } }), t.env)).status, 405);
  assert.equal((await handleRequest(new Request('https://worker.test/api/writing-feedback', { method: 'OPTIONS', headers: { Origin: t.env.ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST' } }), t.env)).status, 204);
  const noKey = setup({ env: { OPENAI_API_KEY: '' } }); assert.equal((await noKey.send()).status, 503);
});
test('Turnstile verifies success, hostname and action before provider calls', async () => {
  for (const challenge of [{ success: false }, { success: true, hostname: 'evil.test', action: 'aptis_writing' }, { success: true, hostname: 'guillermomescua-web.github.io', action: 'wrong_action' }]) {
    const t = setup({ challenge }); assert.equal((await t.send()).status, 403); assert.equal(t.calls.length, 1);
  }
});
test('Atomic quotas enforce IP/day/global caps under concurrency without storing IP', async () => {
  const t = setup({ env: { DAILY_TOTAL_LIMIT: '2', DAILY_IP_LIMIT: '2' } });
  const results = await Promise.all([t.send(), t.send(), t.send(), t.send()]);
  assert.equal(results.filter(r => r.status === 200).length, 2); assert.equal(results.filter(r => r.status === 429).length, 2);
  assert.ok(!JSON.stringify(await t.storage.get('counts')).includes('192.0.2.1'));
});
test('Provider 401/429/500, network failure, timeout, malformed Writing preserve sanitized errors', async () => {
  for (const status of [401, 429, 500]) {
    const t = setup({ provider: () => new Response('sensitive provider details', { status }) }); const r = await t.send();
    assert.equal(r.status, status === 429 ? 429 : 502); assert.ok(!(await r.text()).includes('sensitive'));
  }
  for (const error of [new TypeError('offline'), new DOMException('timeout', 'TimeoutError')]) {
    const t = setup({ provider: () => { throw error; } }); assert.equal((await t.send()).status, error.name === 'TimeoutError' ? 504 : 502);
  }
  const t = setup({ provider: () => Response.json({ output: [{ content: [{ type: 'output_text', text: '{}' }] }] }) }); assert.equal((await t.send()).status, 502);
});
test('Real PCM bytes sent to audio input, no text-only substitute or audio output', async () => {
  const t = setup({ kind: 'speaking' }); const form = await audioForm();
  const original = Buffer.from(await form.get('audio').arrayBuffer());
  const r = await t.send(form); assert.equal(r.status, 200); const data = await r.json(); validateFeedback('speaking', data.feedback);
  const payload = t.calls.find(x => x.url.endsWith('chat/completions')).payload;
  assert.equal(payload.model, 'gpt-audio-1.5'); assert.deepEqual(payload.modalities, ['text']);
  const input = payload.messages[1].content.find(x => x.type === 'input_audio').input_audio;
  assert.equal(input.format, 'wav'); assert.deepEqual(Buffer.from(input.data, 'base64'), original);
  assert.equal(JSON.parse(payload.messages[1].content[0].text).task.expectedDuration, 45);
});
test('Speaking scope honours Part 1/2/3 single question and Part 4 complete task', () => {
  assert.equal(speakingTask(catalog['W1D3-E03-Q01'], '2').expectedDuration, 30);
  assert.equal(speakingTask(catalog['W1D3-E03-Q03'], 'all').expectedDuration, 135);
  assert.equal(speakingTask(catalog['W1D3-E03-Q04'], 'all').expectedDuration, 120);
  assert.throws(() => speakingTask(catalog['W1D3-E03-Q04'], '1'));
});
test('Audio very short/silent/invalid/overlong/overlarge rejected before OpenAI', async () => {
  for (const form of [await audioForm(.2), await audioForm(1, true), await audioForm(186)]) {
    const t = setup({ kind: 'speaking' }); assert.equal((await t.send(form)).status, 400); assert.equal(t.calls.length, 0);
  }
  const form = await audioForm(); form.set('audio', new Blob(['webm?'], { type: 'audio/webm' }));
  assert.equal((await setup({ kind: 'speaking' }).send(form)).status, 400);
  form.set('audio', new Blob([new Uint8Array(17 * 1024 * 1024)], { type: 'audio/wav' }));
  assert.equal((await setup({ kind: 'speaking' }).send(form)).status, 413);
  assert.throws(() => inspectWav(new Uint8Array(44)));
});
test('Speaking malformed JSON retries once, never loops; valid retry is normalized', async () => {
  const t = setup({ kind: 'speaking', provider: (url, args, count) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: count === 1 ? 'broken json' : JSON.stringify(speaking) } }] }) });
  assert.equal((await t.send(await audioForm())).status, 200);
  assert.equal(t.calls.filter(x => x.url.includes('openai')).length, 2);
  const bad = setup({ kind: 'speaking', provider: () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }) });
  assert.equal((await bad.send(await audioForm())).status, 502); assert.equal(bad.calls.filter(x => x.url.includes('openai')).length, 2);
});
test('Feedback schema rejects extra keys, subjective tracker categories and too many priorities', () => {
  assert.throws(() => validateFeedback('writing', { ...writing, surprise: 'x' }));
  assert.throws(() => validateFeedback('writing', { ...writing, priorities: ['1', '2', '3', '4'] }));
  assert.throws(() => validateFeedback('speaking', { ...speaking, trackerErrors: [{ error: 'confidence', correction: 'speak confidently', category: 'TF' }] }));
});
