import catalog from './catalog.js';
import { writingSchema, speakingSchema, validateFeedback, parseModelJSON, countWords, AI_SCHEMA_VERSION } from '../../src/ai-schema.js';
import { writingInstructions, speakingInstructions } from './prompts.js';
import { inspectWav, audioBase64, MAX_AUDIO_BYTES } from './audio.js';
export { Quotas } from './quotas.js';

class APIError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new APIError(status, code, message); };
const limitedText = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const timeout = env => Math.min(45000, Math.max(1000, Number(env.PROVIDER_TIMEOUT_MS) || 45000));

async function boundedBody(request, max) {
  const announced = request.headers.get('Content-Length');
  if (announced && Number(announced) > max) fail(413, 'TOO_LARGE', 'La petición supera el tamaño admitido.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'INVALID_PAYLOAD', 'Faltan datos.');
  const chunks = []; let total = 0;
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new APIError(408, 'BODY_TIMEOUT', 'La subida tardó demasiado. Inténtalo de nuevo.')), 20000); });
  try {
    while (true) { const { value, done } = await Promise.race([reader.read(), deadline]); if (done) break; total += value.byteLength; if (total > max) { await reader.cancel(); fail(413, 'TOO_LARGE', 'La petición supera el tamaño admitido.'); } chunks.push(value); }
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const data = new Uint8Array(total); let offset = 0;
  chunks.forEach(chunk => { data.set(chunk, offset); offset += chunk.length; });
  return data;
}
async function ipDigest(ip, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${Math.floor(Date.now() / 86400000)}:${ip}`));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function quota(env, ipHash, phase, cost = 1) {
  const stub = env.QUOTAS.get(env.QUOTAS.idFromName('course-global-budget'));
  const result = await stub.fetch('https://internal/quota', { method: 'POST', body: JSON.stringify({ ipHash, phase, cost }) });
  if (!result.ok) fail(429, 'RATE_LIMIT', 'Has alcanzado el límite de correcciones. Espera antes de volver a intentarlo.');
}
async function verifyTurnstile(token, ip, env, action, fetcher) {
  if (!limitedText(token, 2048) || token.length < 10) fail(403, 'CHALLENGE', 'Completa la verificación antes de corregir.');
  let result;
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Challenge unavailable');
    result = await response.json();
  } catch { fail(503, 'CHALLENGE_UNAVAILABLE', 'No se pudo verificar la petición. Inténtalo de nuevo.'); }
  if (!result.success || result.hostname !== env.TURNSTILE_HOSTNAME || result.action !== action) fail(403, 'CHALLENGE', 'La verificación ha caducado o no es válida. Inténtalo de nuevo.');
}
function allowedExercise(id, kind) {
  if (!limitedText(id, 100) || !/^[A-Z0-9-]+$/.test(id) || !Object.hasOwn(catalog, id) || catalog[id].kind !== kind) fail(400, 'EXERCISE_ID', 'Ejercicio no admitido.');
  return catalog[id];
}
export function speakingTask(ex, target) {
  const matches = [...ex.prompt.matchAll(/^([1-3])\.\s*(.*?)(?=\n[1-3]\.\s|\nPreparation notes:|$)/gms)];
  if (!['all', '1', '2', '3'].includes(target) || (ex.part === 'Part 4' && target !== 'all') || (target !== 'all' && !matches.some(m => m[1] === target))) fail(400, 'AUDIO_SCOPE', 'Selecciona una pregunta válida.');
  const secondsPerQuestion = ex.part === 'Part 1' ? 30 : 45;
  const expectedDuration = ex.part === 'Part 4' ? 120 : ex.part ? secondsPerQuestion * (target === 'all' ? Math.max(1, matches.length) : 1) : 30;
  return { ...ex, selectedQuestion: target, selectedPrompt: target === 'all' ? ex.prompt : matches.find(m => m[1] === target)[2].trim(), expectedDuration };
}
async function provider(path, payload, env, fetcher) {
  let response;
  try {
    response = await fetcher(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout(env)) });
  } catch (error) { fail(error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 502, 'PROVIDER_UNAVAILABLE', 'No se pudo completar la corrección.'); }
  if (!response.ok) fail(response.status === 429 ? 429 : 502, response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_ERROR', 'No se pudo completar la corrección.');
  try { return await response.json(); } catch { fail(502, 'PROVIDER_FORMAT', 'La IA devolvió una respuesta incompleta.'); }
}
async function writingFeedback(ex, answer, env, fetcher) {
  const data = await provider('responses', {
    model: env.WRITING_MODEL || 'gpt-6-luna', reasoning: { effort: env.WRITING_REASONING || 'medium' }, store: false, max_output_tokens: 6000,
    instructions: writingInstructions,
    input: JSON.stringify({ task: ex, answer, countedWords: countWords(answer) }),
    text: { format: { type: 'json_schema', name: 'aptis_writing_feedback', strict: true, schema: writingSchema } },
  }, env, fetcher);
  if (data.status === 'incomplete' || data.status === 'failed') fail(502, 'PROVIDER_FORMAT', 'La IA devolvió una respuesta incompleta.');
  const content = data.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  try {
    const feedback = validateFeedback('writing', parseModelJSON(content));
    feedback.wordCount = { current: countWords(answer), target: ex.wordRange || 'No especificado' };
    return { feedback, model: data.model, usage: usageRecord(data) };
  } catch { fail(502, 'PROVIDER_FORMAT', 'La IA devolvió una respuesta incompleta.'); }
}
async function speakingFeedback(ex, bytes, duration, env, fetcher) {
  const base64 = audioBase64(bytes);
  const usage = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await provider('chat/completions', {
      model: env.SPEAKING_MODEL || 'gpt-audio-1.5', modalities: ['text'], store: false, max_completion_tokens: 3000,
      messages: [
        { role: 'system', content: `${speakingInstructions}\nRevisión final obligatoria: no conviertas falta de variedad o respuestas breves en errores de Vocabulary. Una expresión correcta como "the supermarket" no es un error por ser básica. En trackerErrors, correction debe ser el reemplazo literal correcto de un error real, nunca una sugerencia de actividades, ejemplos, instrucciones ni consejos. Si no hay errores lingüísticos inequívocos, trackerErrors debe ser []. Usa priorities para consejos de ampliación o variedad.\nEsquema JSON obligatorio: ${JSON.stringify(speakingSchema)}${attempt ? '\nEl formato anterior falló. Respeta todos los campos, tipos y límites; no añadas campos.' : ''}` },
        { role: 'user', content: [{ type: 'text', text: JSON.stringify({ task: ex, durationSeconds: duration }) }, { type: 'input_audio', input_audio: { data: base64, format: 'wav' } }] },
      ],
    }, env, fetcher);
    usage.push(...usageRecord(data));
    try {
      if (data.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete');
      return { feedback: validateFeedback('speaking', parseModelJSON(data.choices[0].message.content)), model: data.model, usage };
    } catch { if (attempt === 1) fail(502, 'PROVIDER_FORMAT', 'La IA devolvió una respuesta incompleta.'); }
  }
}

// Numeric provider usage only: no request content, audio, identifiers or secrets.
function usageRecord(data) {
  const u = data.usage;
  if (!u) return [];
  const n = x => Number.isSafeInteger(x) && x >= 0 && x <= 100000000 ? x : 0;
  return [{ inputTokens: n(u.input_tokens ?? u.prompt_tokens), outputTokens: n(u.output_tokens ?? u.completion_tokens), audioInputTokens: n(u.prompt_tokens_details?.audio_tokens), cachedInputTokens: n(u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens), reasoningTokens: n(u.output_tokens_details?.reasoning_tokens ?? u.completion_tokens_details?.reasoning_tokens), cacheWriteTokens: n(u.input_tokens_details?.cache_write_tokens) }];
}

export async function handleRequest(request, env, fetcher = fetch) {
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
  if (origin === env.ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (value, status = 200) => Response.json(value, { status, headers });
  try {
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) fail(403, 'ORIGIN', 'Origen no admitido.');
    const kind = new URL(request.url).pathname === '/api/writing-feedback' ? 'writing' : new URL(request.url).pathname === '/api/speaking-feedback' ? 'speaking' : null;
    if (!kind) fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'POST' || (request.headers.get('Access-Control-Request-Headers') || '').split(',').some(h => h.trim() && h.trim().toLowerCase() !== 'content-type')) fail(405, 'METHOD', 'Petición no admitida.');
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
    }
    if (request.method !== 'POST') fail(405, 'METHOD', 'Utiliza POST.');
    if (!env.OPENAI_API_KEY || !env.TURNSTILE_SECRET_KEY || !env.RATE_LIMIT_SALT || !env.QUOTAS || !env.TURNSTILE_HOSTNAME) fail(503, 'NOT_CONFIGURED', 'La corrección IA todavía no está disponible.');
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || ip.length > 64) fail(403, 'CLIENT_IP', 'No se pudo verificar la conexión.');
    const ipHash = await ipDigest(ip, env.RATE_LIMIT_SALT);
    await quota(env, ipHash, 'gate');
    const type = request.headers.get('Content-Type') || '';
    let id, token, answer, bytes, duration, target;
    if (kind === 'writing') {
      if (!/^application\/json\b/i.test(type)) fail(415, 'CONTENT_TYPE', 'Envía JSON.');
      let body;
      try { body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 30000))); } catch (error) { if (error instanceof APIError) throw error; fail(400, 'INVALID_PAYLOAD', 'JSON inválido.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['exerciseId', 'answer', 'turnstileToken'].includes(k))) fail(400, 'INVALID_PAYLOAD', 'Datos no admitidos.');
      ({ exerciseId: id, answer, turnstileToken: token } = body);
      if (!limitedText(answer, 8000) || !answer.trim() || countWords(answer) > 1500) fail(400, 'ANSWER_LENGTH', 'Escribe una respuesta de hasta 1500 palabras y 8000 caracteres.');
    } else {
      if (!/^multipart\/form-data\b/i.test(type)) fail(415, 'CONTENT_TYPE', 'Envía el audio mediante multipart/form-data.');
      const body = await boundedBody(request, MAX_AUDIO_BYTES + 10000);
      let form;
      try { form = await new Response(body, { headers: { 'Content-Type': type } }).formData(); } catch { fail(400, 'INVALID_PAYLOAD', 'Audio inválido.'); }
      if ([...form.keys()].some(k => !['exerciseId', 'audio', 'duration', 'target', 'turnstileToken'].includes(k)) || [...new Set(form.keys())].some(k => form.getAll(k).length !== 1)) fail(400, 'INVALID_PAYLOAD', 'Datos no admitidos.');
      id = form.get('exerciseId'); token = form.get('turnstileToken'); target = form.get('target') || 'all';
      const audio = form.get('audio');
      if (!audio || typeof audio === 'string' || !['audio/wav', 'audio/x-wav', 'audio/wave'].includes(audio.type) || audio.size > MAX_AUDIO_BYTES) fail(400, 'AUDIO_FORMAT', 'Se requiere audio WAV dentro del tamaño admitido.');
      bytes = new Uint8Array(await audio.arrayBuffer());
      try { duration = inspectWav(bytes).duration; } catch (error) { fail(400, 'AUDIO_INVALID', error.message); }
      const reported = Number(form.get('duration'));
      if (!Number.isFinite(reported) || reported <= 0 || Math.abs(reported - duration) > 2) fail(400, 'AUDIO_DURATION', 'Duración de audio inválida.');
    }
    let ex = allowedExercise(id, kind);
    if (kind === 'speaking') ex = speakingTask(ex, target);
    await verifyTurnstile(token, ip, env, `aptis_${kind}`, fetcher);
    await quota(env, ipHash, 'reserve', kind === 'speaking' ? 2 : 1);
    const result = kind === 'writing' ? await writingFeedback(ex, answer, env, fetcher) : await speakingFeedback(ex, bytes, duration, env, fetcher);
    return reply({ schemaVersion: AI_SCHEMA_VERSION, kind, exerciseId: id, timestamp: new Date().toISOString(), model: typeof result.model === 'string' ? result.model.slice(0, 120) : kind === 'writing' ? env.WRITING_MODEL || 'gpt-6-luna' : env.SPEAKING_MODEL || 'gpt-audio-1.5', feedback: result.feedback, usage: result.usage });
  } catch (error) {
    if (error instanceof APIError) { if (error.status === 429) headers['Retry-After'] = '60'; return reply({ error: { code: error.code, message: error.message } }, error.status); }
    return reply({ error: { code: 'INTERNAL', message: 'No se pudo completar la corrección.' } }, 500);
  }
}
export default { fetch: (request, env) => handleRequest(request, env) };
