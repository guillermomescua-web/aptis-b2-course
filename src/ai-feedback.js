import { validateFeedback, AI_SCHEMA_VERSION, countWords } from './ai-schema.js';
import { recordingToWav } from './ai-audio.js';
import { accessToken, accountConfig } from './accounts.js';

export const AI_STORE = 'aptis-b2-ai-feedback-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const categoryNames = { G: 'Grammar', V: 'Vocabulary', C: 'Collocation', R: 'Register', COH: 'Cohesion', TF: 'Task Fulfilment' };
let saved = { schemaVersion: 1, noticeSeen: false, items: {} };
// Keep the student's selection when the account refresh renders the controls again.
const speakingTargets = new Map();
try {
  const data = JSON.parse(localStorage.getItem(AI_STORE) || 'null');
  if (data?.schemaVersion === 1 && data.items && typeof data.items === 'object' && !Array.isArray(data.items)) {
    saved.noticeSeen = data.noticeSeen === true;
    for (const [id, item] of Object.entries(data.items)) {
      try {
        if (/^[A-Z0-9-]{1,100}$/.test(id) && item.exerciseId === id && typeof item.timestamp === 'string' && /^[a-f0-9]{64}$/.test(item.sourceHash)) {
          validateFeedback(item.kind, item.feedback); saved.items[id] = item;
        }
      } catch { /* A corrupt optional feedback entry cannot affect main progress. */ }
    }
  }
} catch { /* localStorage is optional; the existing course store is independent. */ }
let accountMode=false,accountStoreKey=null,requestStoreKey=null;
export function configureAIFeedback(items,userId,loadCache=false){accountMode=true;const nextKey=userId?'aptis-v2-feedback:'+userId:null;if(nextKey!==accountStoreKey){speakingTargets.clear();requestIds.clear();requestStoreKey=userId?'aptis-v2-ai-requests:'+userId:null;if(requestStoreKey){try{for(const [k,v]of JSON.parse(localStorage.getItem(requestStoreKey)||'[]'))if(typeof k==='string'&&/^[a-f0-9-]{36}$/i.test(v))requestIds.set(k,v);}catch{}}}accountStoreKey=nextKey;if(loadCache&&accountStoreKey){try{items=JSON.parse(localStorage.getItem(accountStoreKey)||'{}');}catch{}}const valid={};
  for(const [id,item] of Object.entries(items && typeof items==='object' && !Array.isArray(items)?items:{})){
    try{if(/^[A-Z0-9-]{1,100}$/.test(id)&&item?.exerciseId===id&&typeof item.timestamp==='string'&&/^[a-f0-9]{64}$/.test(item.sourceHash)){validateFeedback(item.kind,item.feedback);valid[id]=item;}}catch{/* Invalid optional feedback never blocks the course. */}
  }
  saved={schemaVersion:1,noticeSeen:false,items:valid};persist();}
export function feedbackItems(){return structuredClone(saved.items);}
const requestIds=new Map();
const inFlight = new Map();
const failures = new Map();
const changed = new Map();
const syncVersions = new Map();
let configPromise, turnstileLoading;
let adapter;
const privacy = 'Al solicitar una corrección, tu texto o grabación se enviará al proveedor de IA para ser analizado.';
const failedMessage = 'No se pudo completar la corrección. Tu respuesta sigue guardada. Inténtalo de nuevo.';

async function hash(value) {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function persist() {
  if(accountMode){try{if(accountStoreKey)localStorage.setItem(accountStoreKey,JSON.stringify(saved.items));if(requestStoreKey)localStorage.setItem(requestStoreKey,JSON.stringify([...requestIds]));return true;}catch{return false;}}
  try {
    // Bounded cache of latest feedback only; no student text duplicate or audio blobs.
    const ids = Object.keys(saved.items).sort((a, b) => saved.items[b].timestamp.localeCompare(saved.items[a].timestamp));
    for (const id of ids.slice(200)) delete saved.items[id];
    localStorage.setItem(AI_STORE, JSON.stringify(saved));
    return true;
  } catch { return false; }
}
const list = items => `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
function feedbackHTML(item) {
  if (!item) return '';
  const f = item.feedback, writing = item.kind === 'writing';
  const evaluations = writing ? [['Task fulfilment', f.taskFulfilment], ['Grammar', f.grammar], ['Vocabulary / collocations', f.vocabulary], ['Cohesion', f.cohesion], ['Register', f.register], ['Word count', `${f.wordCount.current} / ${f.wordCount.target}`]] : [['Task fulfilment', f.taskFulfilment], ['Fluency / pace / pauses', f.fluency], ['Pronunciation / intelligibility', f.pronunciation], ['Rhythm / stress / intonation', f.rhythmIntonation], ['Grammar', f.grammar], ['Vocabulary', f.vocabulary]];
  return `<section class="ai-result" aria-label="${writing ? 'Corrección IA' : 'Speaking Feedback'}"><h3>${writing ? 'Corrección IA' : 'Speaking Feedback'}</h3><p class="ai-meta">${esc(new Date(item.timestamp).toLocaleString('es-ES'))}${writing ? '' : ` · ${Math.round(item.duration || 0)} s · ${item.target === 'all' ? 'Parte completa' : 'Pregunta ' + esc(item.target)}`}</p><h4>Valoración general</h4><p>${esc(writing ? f.overall.summary : f.summary)}</p>${writing ? `<p>${esc(f.overall.levelComment)}</p>` : ''}<dl class="ai-evaluations">${evaluations.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><h4>Lo que has hecho bien</h4>${list(f.strengths)}<h4>Errores principales</h4>${writing ? (f.errors.length ? `<ul>${f.errors.map(e => `<li><strong>${esc(e.original)}</strong> → <strong>${esc(e.correction)}</strong> <span class="ai-meta">${esc(categoryNames[e.category])}</span><p>${esc(e.explanation)}</p></li>`).join('')}</ul>` : '<p>No se han señalado errores importantes.</p>') : (f.issues.length ? `<ul>${f.issues.map(e => `<li><strong>${esc(e.type)}</strong>${e.example ? ` · ${esc(e.example)}` : ''}<p>${esc(e.feedback)}</p></li>`).join('')}</ul>` : '<p>No se han señalado problemas claros.</p>')}<h4>Prioridades</h4>${list(f.priorities)}${writing ? '' : `<details><summary>Transcript</summary><p class="ai-answer">${esc(f.transcript || 'No se pudo reconocer voz suficiente.')}</p></details>`}<details open><summary>${writing ? 'Versión mejorada' : 'Better answer'}</summary><p class="ai-answer">${esc(writing ? f.improvedVersion : f.betterAnswer)}</p></details>${f.trackerErrors.length ? `<fieldset class="ai-tracker"><legend>Errores concretos para repasar</legend>${f.trackerErrors.map((e, i) => `<label><input type="checkbox" data-ai-error="${i}" data-ai-error-id="${esc(item.exerciseId)}"><span>${esc(e.error)} → ${esc(e.correction)} <small>(${esc(categoryNames[e.category])})</small></span></label>`).join('')}<button class="secondary-button" type="button" data-ai-save="${esc(item.exerciseId)}">Guardar errores seleccionados en Error Tracker</button><p class="ai-save-status" role="status" aria-live="polite"></p></fieldset>` : ''}</section>`;
}

export function aiControlsHTML(kind, q) {
  const item = saved.items[q.id];
  const selectedTarget = speakingTargets.get(q.id) ?? item?.target ?? 'all';
  const questions = [...q.prompt.matchAll(/^([1-3])\.\s*(.*?)(?=\n[1-3]\.\s|\nPreparation notes:|$)/gms)];
  const scope = kind === 'speaking' && q.part !== 'Part 4' && questions.length ? `<label class="ai-scope">Esta grabación responde a<select data-ai-target="${esc(q.id)}"><option value="all">Todas las preguntas de esta parte</option>${questions.map(m => `<option value="${m[1]}" ${selectedTarget === m[1] ? 'selected' : ''}>Pregunta ${m[1]}: ${esc(m[2].trim().slice(0, 90))}</option>`).join('')}</select></label>` : '';
  return `<div class="ai-assist" data-ai-panel="${esc(q.id)}" data-ai-kind="${kind}">${scope}${!saved.noticeSeen ? `<p class="ai-privacy" role="note">${privacy}</p>` : ''}<div class="ai-actions"><button class="primary-button" type="button" data-ai-correct="${esc(q.id)}">${kind === 'writing' ? (item ? 'Volver a corregir' : '✨ Corregir con IA') : '🎙️ Corregir Speaking con IA'}</button></div><p class="ai-status" role="status" aria-live="polite"></p><p class="ai-changed" role="status" hidden></p><div class="ai-challenge"></div><div class="ai-feedback">${feedbackHTML(item)}</div></div>`;
}

function panel(id) { return document.querySelector(`[data-ai-panel="${id}"]`); }
function refresh(id) {
  const p = panel(id); if (!p) return;
  const kind = p.dataset.aiKind, button = p.querySelector('[data-ai-correct]');
  const busy = inFlight.has(id);
  button.disabled = busy || (kind === 'speaking' && !adapter?.getRecording(id));
  button.textContent = failures.has(id) ? 'Reintentar' : kind === 'writing' ? (saved.items[id] ? 'Volver a corregir' : '✨ Corregir con IA') : '🎙️ Corregir Speaking con IA';
  p.querySelector('[data-ai-target]')?.toggleAttribute('disabled', busy);
  p.querySelector('.ai-status').textContent = busy ? (kind === 'writing' ? 'Analizando tu Writing…' : 'Escuchando y analizando tu respuesta…') : failures.get(id) || '';
  const note = p.querySelector('.ai-changed');
  note.hidden = !changed.get(id);
  note.textContent = kind === 'writing' ? 'Tu respuesta ha cambiado desde la última corrección.' : 'Este feedback corresponde a una grabación o pregunta anterior.';
}
export async function syncAIFeedback(id) {
  const p = panel(id); if (!p || !adapter) return;
  const version = (syncVersions.get(id) || 0) + 1; syncVersions.set(id, version);
  if (saved.items[id]) {
    const item = saved.items[id], value = item.kind === 'writing' ? adapter.getAnswer(id) : adapter.getRecording(id)?.blob;
    const scope = p.querySelector('[data-ai-target]')?.value || 'all';
    const valueChanged = value ? await hash(value) !== item.sourceHash || item.kind === 'speaking' && item.target !== scope : false;
    if (syncVersions.get(id) !== version) return;
    changed.set(id, valueChanged);
  }
  refresh(id);
}
async function getConfig() {
  if (!configPromise) configPromise = fetch(new URL('../data/ai-config.json', import.meta.url), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('Configuración no disponible.'); return r.json(); }).catch(error => { configPromise = null; throw error; });
  const c = await configPromise;
  if (c.schemaVersion !== 1 || !c.workerUrl || !c.turnstileSiteKey) throw new Error('La corrección IA está pendiente de activar. Tu respuesta y grabación siguen guardadas para practicar.');
  const url = new URL(c.workerUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configuración IA inválida.');
  return c;
}
async function loadTurnstile() {
  if (window.turnstile) return;
  if (!turnstileLoading) turnstileLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    const timer = setTimeout(() => { script.remove(); reject(new Error('No se pudo cargar la verificación.')); }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (typeof window.turnstile?.render !== 'function') { script.remove(); reject(new Error('No se pudo cargar la verificación.')); return; }
      resolve();
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('No se pudo cargar la verificación.')); };
    document.head.append(script);
  }).catch(error => { turnstileLoading = null; throw error; });
  await turnstileLoading;
}
async function challenge(id, kind, key) {
  await loadTurnstile();
  const container = panel(id)?.querySelector('.ai-challenge');
  if (!container) throw new Error('Vuelve al ejercicio para solicitar la corrección.');
  let widget;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('La verificación ha tardado demasiado. Inténtalo de nuevo.')), 60000);
      const finish = fn => value => { clearTimeout(timer); fn(value); };
      widget = window.turnstile.render(container, { sitekey: key, action: `aptis_${kind}`, size: 'flexible', callback: finish(resolve), 'error-callback': finish(() => reject(new Error('No se pudo verificar la petición.'))), 'expired-callback': finish(() => reject(new Error('La verificación ha caducado.'))) });
    });
  } finally { if (widget !== undefined) window.turnstile.remove(widget); container.replaceChildren(); }
}

async function correct(id) {
  const p = panel(id); if (!p || inFlight.has(id)) return;
  const kind = p.dataset.aiKind, answer = adapter.getAnswer(id);
  const target = p.querySelector('[data-ai-target]')?.value || 'all';
  if (kind === 'speaking') speakingTargets.set(id, target);
  let recording = adapter.getRecording(id);
  if(kind==='speaking'&&accountMode){try{recording=await adapter.ensureRecording(id);}catch{failures.set(id,'No se pudo cargar o guardar el audio privado. Reintenta la subida.');refresh(id);return;}}
  failures.delete(id);
  if (kind === 'writing' && (!answer.trim() || answer.length > 8000 || countWords(answer) > 1500)) { failures.set(id, !answer.trim() ? 'Escribe tu respuesta antes de solicitar una corrección.' : 'La respuesta supera 1500 palabras u 8000 caracteres.'); refresh(id); return; }
  if (kind === 'speaking' && !recording?.blob) { failures.set(id, 'Graba una respuesta antes de solicitar la corrección.'); refresh(id); return; }
  const controller = new AbortController();
  inFlight.set(id, controller); refresh(id);
  let timer;
  try {
    const config = await getConfig();
    const account = await accountConfig();
    if(!account.enabled)throw new Error('Las cuentas están pendientes de activar.');
    const jwt=await accessToken();
    if(accountMode && !(await adapter.flush()))throw new Error('Resuelve los cambios pendientes antes de corregir.');
    const converted = kind === 'speaking' ? (accountMode?{duration:recording.server.duration}:await recordingToWav(recording.blob)) : null;
    const sourceHash = await hash(kind === 'writing' ? answer : recording.blob);
    const token = await challenge(id, kind, config.turnstileSiteKey);
    saved.noticeSeen = true; persist();
    let body, headers;
    const requestKey=`${id}:${sourceHash}:${target}`;
    const requestId=requestIds.get(requestKey)||crypto.randomUUID();requestIds.set(requestKey,requestId);persist();
    body=JSON.stringify({exerciseId:id,turnstileToken:token,requestId,...(kind==='writing'?{answer}:{recordingId:recording.id,target})});
    headers={'Content-Type':'application/json',Authorization:`Bearer ${jwt}`};
    timer = setTimeout(() => controller.abort(), Math.min(150000, Math.max(10000, config.requestTimeoutMs || 150000)));
    const response = await fetch(`${account.workerUrl.replace(/\/$/, '')}/api/v2/${kind}-feedback`, { method: 'POST', headers, body, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const details = { 429: 'Has alcanzado un límite de correcciones. Espera antes de reintentar.', 413: 'El audio o texto supera el tamaño permitido.', 401: 'La sesión ha caducado. Vuelve a iniciar sesión.', 409: 'La corrección está en curso. Reintenta para recuperar el resultado.', 403: 'Esta cuenta no tiene permiso o la verificación ha caducado.', 503: 'El servicio de corrección no está disponible ahora.' };
      const message = data?.error?.code === 'PROVIDER_RATE_LIMIT' ? 'OpenAI ha alcanzado su cuota o límite de uso. Revisa el saldo y los límites de tu proyecto de OpenAI.' : data?.error?.code === 'AUDIO_INVALID' ? String(data.error.message).slice(0, 200) : details[response.status] || '';
      throw new Error(`${failedMessage}${message ? ' ' + message : ''}`);
    }
    if (data?.schemaVersion !== AI_SCHEMA_VERSION || data.kind !== kind || data.exerciseId !== id || typeof data.timestamp !== 'string' || !Number.isFinite(Date.parse(data.timestamp))) throw new Error(failedMessage);
    validateFeedback(kind, data.feedback);
    const item = { schemaVersion: 1, kind, exerciseId: id, timestamp: data.timestamp, model: String(data.model || ''), feedback: data.feedback, sourceHash, id:data.id, recordingId:recording?.id, ...(kind === 'speaking' ? { duration: converted.duration, target } : {}) };
    saved.items[id] = item;
    requestIds.delete(requestKey);
    adapter.feedbackSaved?.(item);
    if (!persist()) failures.set(id, 'Corrección lista. Este navegador no pudo guardarla para la próxima recarga.');
    const current = panel(id);
    if (current) current.querySelector('.ai-feedback').innerHTML = feedbackHTML(item);
  } catch (error) {
    failures.set(id, error.name === 'AbortError' ? `${failedMessage} La solicitud tardó demasiado.` : error.message === failedMessage || error.message?.startsWith(failedMessage) || /pendiente|activar|verificación|preparar el audio|navegador|12 MB|segundo|Vuelve al ejercicio|cuenta|sesión|Resuelve/.test(error.message) ? error.message : failedMessage);
  } finally { clearTimeout(timer); inFlight.delete(id); await syncAIFeedback(id); }
}

export function installAIFeedback(options) {
  adapter = options;
  document.addEventListener('click', event => {
    const correctButton = event.target.closest('[data-ai-correct]');
    if (correctButton) { correct(correctButton.dataset.aiCorrect); return; }
    const saveButton = event.target.closest('[data-ai-save]');
    if (!saveButton) return;
    const id = saveButton.dataset.aiSave, item = saved.items[id], p = panel(id);
    if (!item || !p) return;
    const errors = [...p.querySelectorAll('[data-ai-error]:checked')].map(input => item.feedback.trackerErrors[Number(input.dataset.aiError)]).filter(Boolean);
    if (!errors.length) { p.querySelector('.ai-save-status').textContent = 'Selecciona al menos un error.'; return; }
    const count = adapter.addErrors(id, errors.map(error => ({ ...error, category: categoryNames[error.category] })));
    p.querySelector('.ai-save-status').textContent = `${count} errores guardados. Los que ya estaban registrados no se duplican.`;
    p.querySelectorAll('[data-ai-error]').forEach(input => { input.checked = false; });
  });
  document.addEventListener('change', event => { if (event.target.dataset.aiTarget) { speakingTargets.set(event.target.dataset.aiTarget,event.target.value); syncAIFeedback(event.target.dataset.aiTarget); } });
}
