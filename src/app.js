import { exportProgress, validateProgress } from './progress.js';
import { renderVocabularyLab, configureVocabulary, updateVocabularySnapshot } from './vocabulary-lab.js';
import { aiControlsHTML, installAIFeedback, syncAIFeedback, configureAIFeedback, feedbackItems } from './ai-feedback.js';
import { requireAccount,rpc,query,escapeHTML as accountEsc } from './accounts.js';
import { LearningStore } from './learning-store.js';
import { legacyPackage,importPackage,alreadyImported,migrationHTML,conflictHTML,downloadJSON } from './legacy-migration.js';
import { localRecordings,cacheRecording,uploadRecording,signedAudio } from './speaking-storage.js';
import { teacherDashboard,installTeacherEvents,reviewsHTML } from './teacher-dashboard.js';
import { splitWriting } from './writing-plan.js';

const app = document.querySelector('#app');
const mainNav = document.querySelector('#main-nav');
const weekNav = document.querySelector('#week-nav');
const breadcrumb = document.querySelector('#breadcrumb');
const topProgress = document.querySelector('#top-progress');
const menu = document.querySelector('.sidebar');
document.body.insertAdjacentHTML('beforeend', '<div class="mobile-backdrop" id="mobile-backdrop"></div>');

const STORE = 'aptis-b2-performance-v1';
const defaultState = () => ({ responses: {}, completed: {}, errors: [], plays: {}, checked: {} });
let state = loadState();
let account=null,learningStore=null,legacy=null,vocabularyData=null,teacherReviews=[],serverRecordings=[];
let feedbackRows=[];
let course;
let writingPlan;
let activeTimer = null;
let timerEnds = 0;
let timerLabel = '';
let currentAudio = null;
const speakingRecordings = new Map();
let activeRecorder = null;
let audioManifest = {};

function loadState() {
  try { return { ...defaultState(), ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
  catch { return defaultState(); }
}
function save() {
  if(account){if(account.role==='student')learningStore.applyState(state);return;}
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* Private mode may limit storage. */ }
}

function syncUI(store){
  if(!store)return;
  const focused=document.activeElement;
  if(focused?.dataset.response){
    const id=focused.dataset.response,key=`answer:${id}`;
    if(!store.cache.pending[key] && focused.value!==(store.get('answer',id)?.text||'')){
      store.cache.pending[key]={kind:'answer',id,data:{text:focused.value},expected:store.cache.rows.answer?.[id]?.revision||0,version:1,conflict:true};
      store.status='Nueva versión en otro dispositivo';
      try{localStorage.setItem(store.key,JSON.stringify(store.cache));}catch{}
    }
  }
  state=store.state();updateVocabularySnapshot(store.vocabulary());
  const status=document.querySelector('#account-sync');
  if(status){status.textContent=store.status;status.classList.toggle('pending',store.status!=='Guardado en servidor');}
  document.querySelector('#sync-details').innerHTML=conflictHTML(store);
}
async function bootAccounts(){
  account=await requireAccount();if(!account)return;
  state=defaultState();configureAIFeedback({},account.id,true);configureVocabulary({schemaVersion:1,units:{}},()=>{});
  document.querySelector('#account-panel').innerHTML=`<span class="account-name">${esc(account.name)}</span>${account.role==='teacher'?'<a href="#teacher">Panel del profesor</a>':''}<button class="small-button" data-logout>Cerrar sesión</button>${account.role==='student'?'<span id="account-sync" class="sync-status" role="status">Consultando servidor…</span>':''}`;
  document.querySelector('.sidebar-bottom').textContent=account.role==='teacher'?'Supervisión y comentarios':'Progreso en tu cuenta';
  if(account.role==='teacher'){installTeacherEvents(app,vocabularyData);return;}
  const transport={snapshot:()=>rpc('learning_snapshot'),save:p=>rpc('save_entity',{p_kind:p.kind,p_id:p.id,p_data:p.data,p_expected:p.expected})};
  learningStore=new LearningStore(account.id,transport,localStorage,syncUI);
  syncUI(learningStore);await learningStore.refresh();
  configureVocabulary(learningStore.vocabulary(),lab=>{for(const [id,data]of Object.entries(lab.units))learningStore.set('vocabulary',id,data);});
  try{legacy=legacyPackage();if(legacy&&await alreadyImported(legacy,account,course,vocabularyData))legacy=null;}catch{document.querySelector('#sync-details').textContent='El respaldo antiguo contiene datos dañados. Sus claves originales siguen intactas.';}
  await refreshAccountExtras();
  try{for(const clip of await localRecordings(account)){
    const row=serverRecordings.find(r=>r.id===clip.id);
    const existing=speakingRecordings.get(clip.exerciseId);
    if(existing?.server&&row&&existing.server.created_at>row.created_at)continue;
    const saved={...clip,url:URL.createObjectURL(clip.blob),...(row?.status==='ready'?{server:row}:{})};speakingRecordings.set(clip.exerciseId,saved);
    if(!saved.server)uploadClip(clip.exerciseId,saved);
  }}catch{ /* The server remains available when the local audio cache is unavailable. */ }
  learningStore.flush();
  window.addEventListener('online',()=>{learningStore.flush().then(()=>refreshAccount());for(const [id,clip]of speakingRecordings)if(!clip.server)uploadClip(id,clip);});
  window.addEventListener('focus',()=>refreshAccount());
  setInterval(()=>{if(document.visibilityState==='visible')refreshAccount();},30000);
}
async function refreshAccount(){
  if(account?.role!=='student')return;
  await learningStore.flush();await learningStore.refresh();await refreshAccountExtras();
  if(!document.activeElement?.dataset.response&&!activeRecorder&&![...document.querySelectorAll('audio')].some(audio=>!audio.paused))render();
}
async function refreshAccountExtras(){
  if(account?.role!=='student')return;
  try{
    [feedbackRows,teacherReviews,serverRecordings]=await Promise.all([query('ai_feedback','user_id',account.id,null),query('teacher_reviews','student_id',account.id,null),query('speaking_recordings','user_id',account.id,null)]);
    const items={};for(const row of feedbackRows){if(items[row.exercise_id])continue;items[row.exercise_id]={schemaVersion:1,kind:row.kind,exerciseId:row.exercise_id,timestamp:row.created_at,model:row.model,feedback:row.feedback,sourceHash:row.source_hash,id:row.id,provenance:row.provenance,recordingId:row.recording_id,target:row.target,duration:Number(row.duration||0)};}
    configureAIFeedback(items,account.id);
  }catch{ /* Keep visible cached feedback when temporarily offline. */ }
}
async function uploadClip(id,clip,throwErrors=false){
  if(!account||!clip)return;
  try{return await uploadRecording(account,id,clip,message=>{
    clip.uploadStatus=message;recorderStatus(id,message);
    const panel=recorderPanel(id);if(panel&&!panel.querySelector('[data-record-retry]'))panel.insertAdjacentHTML('beforeend',`<button class="small-button" data-record-retry="${esc(id)}">Reintentar subida</button>`);
    if(clip.server)panel?.querySelector('[data-record-retry]')?.remove();
  });}catch(error){if(throwErrors)throw error;}
}
async function restoreRemoteClip(id){
  if(!account||speakingRecordings.has(id))return;
  const row=serverRecordings.find(r=>r.exercise_id===id&&r.status==='ready');if(!row)return;
  try{const clip={id:row.id,server:row,duration:Number(row.duration),url:await signedAudio(row.original_path)};if(speakingRecordings.has(id))return;speakingRecordings.set(id,clip);syncRecorder(id);recorderStatus(id,'Audio privado guardado en servidor.');}catch{recorderStatus(id,'No se pudo cargar el audio privado. Reabre el ejercicio para reintentar.');}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-logout')){
    if(learningStore && !(await learningStore.flush()) && !confirm('Hay cambios pendientes conservados en este dispositivo. ¿Cerrar sesión y sincronizarlos cuando vuelvas a entrar con esta cuenta?'))return;
    stopActiveRecording();stopListening();for(const clip of speakingRecordings.values())if(clip.url?.startsWith('blob:'))URL.revokeObjectURL(clip.url);
    speakingRecordings.clear();state=defaultState();teacherReviews=[];configureAIFeedback({});configureVocabulary({schemaVersion:1,units:{}},()=>{});app.replaceChildren();mainNav.replaceChildren();weekNav.replaceChildren();document.querySelector('#sync-details').replaceChildren();
    const {error}=await account.client.auth.signOut({scope:'local'});if(error){localStorage.removeItem('aptis-v2-auth');location.replace('./auth.html');return;}
  }
  if(button.dataset.conflict){learningStore.resolve(button.dataset.conflict,button.dataset.choice==='local');render();}
  if(button.hasAttribute('data-import-legacy')){
    button.disabled=true;const message=document.querySelector('#migration-message');
    try{const report=await importPackage(legacy,account,course,vocabularyData,learningStore);legacy=null;await refreshAccountExtras();render();app.insertAdjacentHTML('afterbegin',`<p class="v2-banner">Importación verificada: ${report.verifiedEntities} registros · ${report.conflictsPreserved} variantes conservadas · ${report.feedbackAdded} feedback. Las claves originales siguen intactas.</p>`);}catch(error){if(message)message.textContent=error.message;button.disabled=false;}
  }
  if(button.hasAttribute('data-full-export')&&account?.role==='student'){
    button.disabled=true;try{[feedbackRows,teacherReviews,serverRecordings]=await Promise.all([query('ai_feedback','user_id',account.id,null),query('teacher_reviews','student_id',account.id,null),query('speaking_recordings','user_id',account.id,null)]);}catch{button.disabled=false;alert('No se pudo obtener el respaldo completo del servidor. Reintenta cuando vuelva la conexión.');return;}button.disabled=false;
    downloadJSON({app:'aptis-b2-v2-backup',schemaVersion:2,exportedAt:new Date().toISOString(),state:learningStore.state(),vocabulary:learningStore.vocabulary(),ai:{schemaVersion:1,items:feedbackItems()},serverFeedback:feedbackRows,recordings:serverRecordings,reviews:teacherReviews,pending:learningStore.cache.pending,conflictBackups:learningStore.cache.backups},`aptis-b2-respaldo-completo-${new Date().toISOString().slice(0,10)}.json`);
  }
});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wordCount = value => (String(value || '').trim().match(/\S+/g) || []).length;
const answerLetter = id => (course.answers[id] || '').match(/^([A-Z])\s*[-–]/)?.[1] || null;
const isObjective = q => !!answerLetter(q.id);
const pdfUrl = name => `./pdfs/${encodeURIComponent(name)}`;
const sessionId = (w, d) => `W${w}D${d}`;
const sessionExercises = id => course.exercises.filter(e => e.id.startsWith(id + '-E'));
const skillOrder = ['Vocabulary', 'Grammar', 'Reading', 'Writing', 'Listening', 'Speaking'];
function exerciseSkill(ex) {
  const title = ex.title.toUpperCase();
  if (/VOCABULARY/.test(title)) return 'Vocabulary';
  if (/GRAMMAR|RECURRENT B2 ERRORS/.test(title)) return 'Grammar';
  if (/LISTENING/.test(title) || /-LIST-/.test(ex.id)) return 'Listening';
  if (/SPEAKING/.test(title) || /-SPEAK/.test(ex.id)) return 'Speaking';
  if (/WRITING PART [1-4]|PARAPHRASE|REGISTER|COHESION|FORMULATION|EDIT FOR FULFILMENT|EDIT A WORD-COUNT/i.test(title)) return 'Writing';
  return 'Reading';
}
const sessionSkills = id => [...new Set(sessionExercises(id).map(exerciseSkill))].sort((a, b) => skillOrder.indexOf(a) - skillOrder.indexOf(b));
function isOpenWriting(q, ex) {
  const writingTitle = /WRITING PART [1-4]|PARAPHRASE|REGISTER|COHESION|FORMULATION|EDIT FOR FULFILMENT|EDIT A WORD-COUNT/i.test(ex.title) || ex.source === '10_WRITING_MASTERBOOK.pdf';
  return writingTitle && !answerLetter(q.id) && !!(q.wordRange || ex.source === '10_WRITING_MASTERBOOK.pdf' || /WRITING PART|PARAPHRASE|REGISTER|COHESION|FORMUL|EDIT|REWRITE/i.test(ex.title));
}
const mockExercises = (n, block) => {
  const prefix = `MOCK${String(n).padStart(2, '0')}-`;
  const types = block === 'A' ? ['CORE', 'READ'] : block === 'B' ? ['WRITE'] : ['LIST', 'SPEAK'];
  return course.exercises.filter(e => e.id.startsWith(prefix) && types.some(t => e.id.startsWith(prefix + t)));
};
const completedSessions = () => Array.from({ length: 8 }, (_, w) => Array.from({ length: 4 }, (_, d) => !!state.completed[sessionId(w + 1, d + 1)])).flat().filter(Boolean).length;
const completedMocks = () => [1, 2, 3, 4].flatMap(n => ['A', 'B', 'C'].map(b => !!state.completed[`MOCK${n}-${b}`])).filter(Boolean).length;
const responseCount = () => Object.values(state.responses).filter(v => String(v).trim()).length;
const totalQuestions = () => course.exercises.reduce((n, e) => n + e.questions.length, 0);
const navLink = (hash, icon, label) => `<a class="nav-link ${location.hash === hash ? 'active' : ''}" href="${hash}"><span class="nav-icon">${icon}</span>${label}</a>`;

function renderNav() {
  mainNav.innerHTML = [
    navLink('#dashboard', '▦', 'Panel de progreso'),
    navLink('#diagnostic', '◉', 'Diagnóstico'),
    navLink('#mocks', '▣', 'Simulacros'),
    navLink('#books', '▤', 'Masterbooks'),
    navLink('#vocabulary-lab', '✎', 'Vocabulary Lab'),
    navLink('#tracker', '◇', 'Error Tracker'),
    navLink('#pdfs', '↓', 'Descargar PDFs'),
  ].join('');
  weekNav.innerHTML = Array.from({ length: 8 }, (_, wi) => {
    const w = wi + 1;
    const done = [1, 2, 3, 4].filter(d => state.completed[sessionId(w, d)]).length;
    return `<div class="week-group"><button class="week-title" type="button" data-week-toggle="${w}" aria-expanded="true"><span>Semana ${String(w).padStart(2, '0')}</span><small>${done}/4</small></button><div class="days" id="days-${w}">${[1, 2, 3, 4].map(d => { const id = sessionId(w, d), skills = sessionSkills(id); return `<a class="day-link ${state.completed[id] ? 'done' : ''} ${location.hash === `#session=${id}` ? 'active' : ''}" href="#session=${id}" title="Semana ${w}, día ${d}: ${skills.join(', ')}"><span class="day-label">D${d}${state.completed[id] ? ' ✓' : ''}</span><span class="day-skills" aria-label="Skills: ${esc(skills.join(', '))}">${skills.map(skill => `<span class="skill-chip">${esc(skill)}</span>`).join('')}</span></a>`; }).join('')}</div></div>`;
  }).join('');
  topProgress.textContent = `${completedSessions()} / 32 sesiones`;
}

function pageHeader(eyebrow, title, subtitle, aside = '') {
  return `<div class="hero"><div><p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${aside ? `<div class="hero-side">${aside}</div>` : ''}</div>`;
}

function progressControls() {
  return `<section class="card section-space" aria-labelledby="progress-backup-title"><h2 class="card-title" id="progress-backup-title">Copia de seguridad del progreso</h2><p class="card-subtitle">Guarda tus respuestas, sesiones, errores y reproducciones en un archivo JSON. Las grabaciones de voz de esta sesión no se incluyen.</p><div class="backup-actions"><button class="secondary-button" type="button" data-export-progress>Exportar progreso</button><button class="secondary-button" type="button" data-import-progress>Importar progreso</button><input id="progress-file" class="sr-only" type="file" accept=".json,application/json" aria-label="Elegir archivo JSON de progreso"><span id="progress-message" role="status" aria-live="polite"></span></div></section>`;
}

function dashboard() {
  breadcrumb.textContent = 'PANEL';
  const done = completedSessions();
  const next = Array.from({ length: 8 }, (_, w) => Array.from({ length: 4 }, (_, d) => sessionId(w + 1, d + 1))).flat().find(id => !state.completed[id]) || 'W8D4';
  app.innerHTML = pageHeader('Tu espacio de estudio', 'Avanza a tu ritmo.', account ? 'Ocho semanas, cuatro sesiones por semana. Tus respuestas y tu progreso se guardan en tu cuenta para continuar desde cualquier dispositivo.' : 'Ocho semanas, cuatro sesiones por semana. Tus respuestas y tu progreso se guardan en este navegador.', '32 SESIONES · 8 SEMANAS') +
    `<div class="stats">
      <div class="stat-card"><div class="stat-label">Sesiones completadas</div><div class="stat-value">${done}<span style="font-size:16px;color:#91a0af"> / 32</span></div><div class="stat-note">${Math.round(done / 32 * 100)}% del curso</div></div>
      <div class="stat-card"><div class="stat-label">Preguntas respondidas</div><div class="stat-value">${responseCount()}</div><div class="stat-note">de ${totalQuestions()} en todo el material</div></div>
      <div class="stat-card"><div class="stat-label">Simulacros</div><div class="stat-value">${completedMocks()}<span style="font-size:16px;color:#91a0af"> / 12</span></div><div class="stat-note">bloques de 60 minutos</div></div>
      <div class="stat-card"><div class="stat-label">Errores en seguimiento</div><div class="stat-value">${state.errors.filter(e => !e.resolved).length}</div><div class="stat-note">pendientes de repasar</div></div>
    </div>
    <div class="dashboard-grid"><section class="card"><h2 class="card-title">Tu recorrido</h2><p class="card-subtitle">Marca cada sesión cuando hayas corregido las respuestas y anotado los errores importantes.</p>${Array.from({ length: 8 }, (_, wi) => {
      const n = wi + 1, count = [1, 2, 3, 4].filter(d => state.completed[sessionId(n, d)]).length;
      return `<div class="week-row"><span class="week-name">Semana ${String(n).padStart(2, '0')}</span><div class="week-bar" aria-label="${count} de 4 sesiones"><span style="width:${count * 25}%"></span></div><span class="week-count">${count} / 4 sesiones</span></div>`;
    }).join('')}</section><div><section class="continue-card"><p class="eyebrow">SIGUIENTE PASO</p><h2>${next.replace('W', 'Semana ').replace('D', ' · Día ')}</h2><p>Una sesión de aproximadamente 60 minutos. Trabaja con el tiempo indicado antes de consultar la corrección.</p><a class="primary-button" href="#session=${next}">Abrir sesión <span>→</span></a></section><section class="card section-space"><h2 class="card-title">Cómo usar el curso</h2><p class="card-subtitle" style="margin-bottom:12px">Haz los ejercicios en orden. Consulta la solución al terminar y registra los errores que se repiten.</p><a class="text-link" href="#book=start">Leer la guía inicial →</a></section></div></div>
    <section class="section-space"><h2 class="section-heading">Accesos rápidos</h2><div class="quick-grid"><a class="quick-link" href="#vocabulary-lab">Vocabulary Lab <span>↗</span></a><a class="quick-link" href="#mocks">Simulacros <span>↗</span></a><a class="quick-link" href="#books">Masterbooks <span>↗</span></a><a class="quick-link" href="#tracker">Error Tracker <span>↗</span></a></div></section>`;
  app.innerHTML += progressControls();
}

function exerciseHTML(ex, index) {
  const audio = ex.title.toLowerCase().includes('listening') ? audioHTML(ex) : '';
  const speaking = ex.title.toLowerCase().includes('speaking');
  const privacyNote = '';
  return `<article class="exercise-card" id="${esc(ex.id)}"><div class="exercise-head"><div><div class="exercise-num">EJERCICIO ${String(index + 1).padStart(2, '0')} · ${esc(ex.id)}</div><h2 class="exercise-title">${esc(ex.title)}</h2></div>${ex.minutes ? `<span class="tag">${ex.minutes} MIN</span>` : ''}</div><div class="exercise-body">${ex.context ? `<div class="source-text">${esc(ex.context)}</div>` : ''}${audio}${privacyNote}${ex.questions.map(q => questionHTML(q, speaking)).join('')}</div><div class="exercise-foot"><span class="score" id="score-${esc(ex.id)}"></span><button type="button" class="secondary-button" data-check="${esc(ex.id)}">${state.checked[ex.id] ? 'Ocultar corrección' : 'Corregir y ver respuestas'}</button></div>${state.checked[ex.id] ? keyHTML(ex) : ''}</article>`;
}

function writingAssistHTML(q) { return aiControlsHTML('writing', q); }

function bankLetters(ex) {
  const fromContext = [...ex.context.matchAll(/(?:^|\n)([A-Z])\.\s/g)].map(m => m[1]);
  const unique = [...new Set(fromContext)];
  return unique.length >= 2 ? unique : 'ABCDEFGHIJ'.split('');
}

function speakingVisualHTML(q, ex) {
  if (q.part === 'Part 2') {
    const match = q.prompt.match(/^Photo brief:\s*([\s\S]*?)(?=\n1\.)/i);
    if (!match) return { visual: '', prompt: q.prompt };
    return { visual: `<figure class="speaking-photo"><div class="photo-crop photo-one" role="img" aria-label="${esc(match[1].trim())}" style="background-image:url('./assets/speaking/${encodeURIComponent(ex.id)}.png')"></div></figure>`, prompt: q.prompt.slice(match[0].length).trim() };
  }
  if (q.part === 'Part 3') {
    const match = q.prompt.match(/^Photo A:\s*([\s\S]*?)\nPhoto B:\s*([\s\S]*?)(?=\n1\.)/i);
    if (!match) return { visual: '', prompt: q.prompt };
    const photo = (kind, className, brief) => `<figure class="speaking-photo"><div class="photo-crop ${className}" role="img" aria-label="${esc(brief.trim())}" style="background-image:url('./assets/speaking/${encodeURIComponent(ex.id)}.png')"></div><figcaption>Foto ${kind}</figcaption></figure>`;
    return { visual: `<div class="speaking-photo-pair">${photo('A', 'photo-two', match[1])}${photo('B', 'photo-three', match[2])}</div>`, prompt: q.prompt.slice(match[0].length).trim() };
  }
  return { visual: '', prompt: q.prompt };
}

function recorderHTML(q) {
  const available = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  return `<div class="recorder-panel" data-recorder-panel="${esc(q.id)}"><h4>Graba tu respuesta</h4>${available ? `<div class="recorder-actions"><button class="small-button" type="button" data-record-start="${esc(q.id)}">Grabar</button><button class="small-button" type="button" data-record-stop="${esc(q.id)}" disabled>Detener</button><button class="small-button" type="button" data-record-play="${esc(q.id)}" disabled>Reproducir</button><button class="small-button" type="button" data-record-again="${esc(q.id)}" disabled>Volver a grabar</button><span class="record-clock" data-record-clock="${esc(q.id)}" role="timer">00:00</span></div><audio data-record-audio="${esc(q.id)}" controls hidden aria-label="Tu grabación de ${esc(q.id)}"></audio><p class="record-status" data-record-status="${esc(q.id)}" role="status" aria-live="polite">${account ? 'El audio se guarda de forma privada para ti y tu profesor. OpenAI lo recibe al solicitar corrección.' : 'La grabación queda en este navegador solo durante esta sesión.'}</p>` : '<p class="record-status">La grabación no está disponible en este navegador. Puedes usar los temporizadores para practicar.</p>'}</div>`;
}

function questionHTML(q, speaking) {
  const value = state.responses[q.id] || '';
  const answer = answerLetter(q.id);
  const ex = course.exercises.find(e => e.questions.some(item => item.id === q.id));
  const labels = q.options.length ? q.options : bankLetters(ex).map(k => ({ key: k, text: '' }));
  const stimulus = speaking ? speakingVisualHTML(q, ex) : { visual: '', prompt: q.prompt };
  const field = speaking
    ? `<div class="timer-panel"><h4>Tiempo de respuesta</h4><div class="prompt-timers">${q.part === 'Part 4' ? `<button type="button" data-timer="60" data-timer-label="Preparación · ${esc(q.id)}">Preparación · 1 min</button><button type="button" data-timer="120" data-timer-label="Respuesta · ${esc(q.id)}">Respuesta · 2 min</button>` : (q.prompt.match(/^\d+\./gm) || [1, 2, 3]).map((_, i) => `<button type="button" data-timer="${q.part === 'Part 1' ? 30 : 45}" data-timer-label="${esc(q.part || 'Speaking')} · pregunta ${i + 1}">Pregunta ${i + 1} · ${q.part === 'Part 1' ? 30 : 45} s</button>`).join('')}</div></div>${recorderHTML(q)}${aiControlsHTML('speaking', q)}<textarea class="word-input" data-response="${esc(q.id)}" aria-label="Notas para ${esc(q.id)}" placeholder="Notas de tu respuesta (opcional)">${esc(value)}</textarea>`
    : q.wordRange || /WRIT|PARAPHRASE|REGISTER|EDIT|COHESION|FORMUL|REWRITE|REPAIR/i.test(ex.title)
      ? `<textarea class="word-input" data-response="${esc(q.id)}" aria-label="Respuesta de ${esc(q.id)}" placeholder="Escribe tu respuesta aquí…">${esc(value)}</textarea><div class="word-meta"><span>Contador de palabras</span><span data-word-count="${esc(q.id)}" class="${rangeClass(q.wordRange, value)}">${wordCount(value)}${q.wordRange ? ` / ${esc(q.wordRange)} palabras` : ' palabras'}</span></div>${isOpenWriting(q, ex) ? writingAssistHTML(q) : ''}`
      : q.options.length
        ? `<div class="option-list">${q.options.map(o => `<label class="option"><input type="radio" name="${esc(q.id)}" value="${esc(o.key)}" data-response="${esc(q.id)}" ${value === o.key ? 'checked' : ''}><span class="option-key">${esc(o.key)}</span><span>${esc(o.text)}</span></label>`).join('')}</div>`
        : answer
          ? `<select class="answer-select" data-response="${esc(q.id)}" aria-label="Respuesta de ${esc(q.id)}"><option value="">Elige una opción</option>${labels.map(o => `<option value="${esc(o.key)}" ${value === o.key ? 'selected' : ''}>${esc(o.key)}${o.text ? ` · ${esc(o.text)}` : ''}</option>`).join('')}</select>`
          : `<input class="answer-input" data-response="${esc(q.id)}" value="${esc(value)}" aria-label="Respuesta de ${esc(q.id)}" placeholder="Tu respuesta" />`;
  return `<div class="question" id="q-${esc(q.id)}">${q.intro ? `<div class="source-text">${esc(q.intro)}</div>` : ''}<div class="question-id">${esc(q.id)}${q.wordRange ? ` · ${esc(q.wordRange)} PALABRAS` : ''}</div>${stimulus.visual}<div class="question-prompt">${esc(stimulus.prompt)}</div>${field}${reviewsHTML(teacherReviews.filter(r=>r.exercise_id===q.id))}<div class="question-feedback" id="feedback-${esc(q.id)}"></div></div>`;
}

function rangeClass(range, value) {
  if (!range) return '';
  const [min, max] = range.split('-').map(Number);
  const n = wordCount(value);
  return n >= min && n <= max ? 'within' : 'outside';
}

function keyHTML(ex) {
  return `<div class="key-panel"><h4>Solucionario · ${esc(ex.id)}</h4>${ex.questions.map(q => `<div class="key-item"><strong>${esc(q.id)}</strong>${esc(course.answers[q.id] || 'Consulta el PDF del solucionario.')}</div>`).join('')}</div>`;
}

function audioHTML(ex) {
  let ids = Object.keys(course.recordings).filter(id => id.startsWith(ex.id + '-R'));
  if (ex.id.startsWith('MOCK')) {
    const all = Object.keys(course.recordings).filter(id => id.startsWith(ex.id.slice(0, 6) + '-LIST-R'));
    const range = ex.id.endsWith('-P1') ? [1, 13] : ex.id.endsWith('-P2') ? [14, 17] : ex.id.endsWith('-P3') ? [18, 18] : ex.id.endsWith('-P41') ? [19, 19] : [20, 20];
    ids = all.filter(id => { const n = Number(id.match(/-R(\d{2})$/)?.[1]); return n >= range[0] && n <= range[1]; });
  }
  if (!ids.length) return '';
  return `<div class="audio-panel"><h4>Audio con voz del navegador · texto oculto durante el intento</h4><p style="font-size:11px;color:#6f8494;margin:0 0 10px">Escucha cada grabación un máximo de dos veces. La voz depende del navegador y de las voces instaladas.</p>${ids.map(id => `<div class="audio-row"><span>${esc(id)}</span><button class="small-button" type="button" data-play="${esc(id)}" ${state.plays[id] >= 2 ? 'disabled' : ''}>▶ Escuchar</button><small>${state.plays[id] || 0} / 2 escuchas</small></div>`).join('')}<button class="small-button" type="button" data-stop-audio>Detener audio</button></div>`;
}

function renderExercisePage(kind, id, exercises, meta) {
  breadcrumb.textContent = meta.crumb;
  const done = !!state.completed[id];
  const blocks = kind === 'session' ? splitWriting(exercises, id, writingPlan) : { primary: exercises, extra: [] };
  const weeklyWriting = kind === 'session' ? writingPlan?.weeks?.[id.slice(0, 2)] : null;
  const skills = kind === 'session' ? sessionSkills(id) : [];
  const timed = kind === 'mock' ? (id.endsWith('-A') ? [['Core', 25], ['Reading', 35]] : id.endsWith('-B') ? [['Writing', 50], ['Revisión', 10]] : [['Listening', 40], ['Speaking', 12], ['Revisión', 8]]) : [['Sesión completa', 60]];
  app.innerHTML = pageHeader(meta.eyebrow, meta.title, meta.subtitle, meta.aside || '') +
    `<div class="session-meta"><span class="tag green">${exercises.length} ejercicios</span><span class="tag">${exercises.reduce((n, e) => n + e.questions.length, 0)} preguntas</span>${skills.map(skill => `<span class="tag skill-summary">${esc(skill)}</span>`).join('')}${done ? '<span class="tag gold">Completado ✓</span>' : ''}</div>
    <div class="session-actions"><button class="primary-button" type="button" data-complete="${esc(id)}">${done ? 'Marcar como pendiente' : 'Marcar como completado'}</button>${meta.pdf ? `<a class="secondary-button" href="${pdfUrl(meta.pdf)}" target="_blank" rel="noopener">Abrir PDF original ↗</a>` : ''}<a class="secondary-button" href="#tracker">Registrar un error</a></div>
    <div class="timer-panel"><h4>Temporizadores</h4><div class="timer-row">${timed.map(([label, min]) => `<button type="button" class="small-button" data-timer="${min * 60}" data-timer-label="${esc(label)} · ${min} min">${esc(label)} · ${min} min</button>`).join('')}</div></div>
    ${kind === 'mock' ? '<div class="notice" style="margin-bottom:20px">Los bloques distribuyen cada simulacro en tres sesiones de 60 minutos: A (Core + Reading), B (Writing + revisión), C (Listening + Speaking + revisión). Conserva el mismo número de simulacro en los tres bloques.</div>' : ''}
    ${weeklyWriting ? `<div class="notice writing-plan-note"><strong>Writing principal: 3 bloques esta semana.</strong> ${esc(weeklyWriting.reason)} El resto está en «Práctica extra de Writing». El plan del PDF se conserva como referencia.</div>` : ''}
    ${kind === 'session' && course.sessions[id]?.plan ? `<section class="card" style="margin-bottom:20px"><h2 class="card-title">Plan original de la sesión · referencia del PDF</h2><div class="source-text" style="margin:13px 0 0">${esc(course.sessions[id].plan)}</div></section>` : ''}
    <div class="exercise-list">${blocks.primary.map(exerciseHTML).join('')}</div>${blocks.extra.length ? `<details class="writing-extra section-space"><summary>Práctica extra de Writing · ${blocks.extra.length} bloques opcionales</summary><p>Esta práctica no bloquea la finalización de la sesión. Tus respuestas y correcciones anteriores se conservan.</p><div class="exercise-list">${blocks.extra.map((ex, i) => exerciseHTML(ex, blocks.primary.length + i)).join('')}</div></details>` : ''}${kind === 'session' && course.sessions[id]?.correction ? `<section class="card section-space"><h2 class="card-title">Corrección y transferencia</h2><p class="book-text">${esc(course.sessions[id].correction)}</p></section>` : ''}<div class="session-actions"><button class="primary-button" type="button" data-complete="${esc(id)}">${done ? 'Marcar como pendiente' : 'Marcar como completado'}</button><a class="secondary-button" href="#tracker">Ir al Error Tracker</a></div>`;
  for (const ex of exercises) if (state.checked[ex.id]) updateFeedback(ex);
}

function sessionView(id) {
  const m = id.match(/^W([1-8])D([1-4])$/);
  if (!m) return dashboard();
  const week = Number(m[1]), day = Number(m[2]);
  renderExercisePage('session', id, sessionExercises(id), { crumb: `SEMANA ${week} / DÍA ${day}`, eyebrow: `SEMANA ${String(week).padStart(2, '0')} · DÍA ${day}`, title: `Sesión ${id}`, subtitle: 'Trabaja por orden y con los tiempos indicados en cada ejercicio. Abre la corrección después de completar el intento.', aside: 'DURACIÓN APROX. 60 MIN', pdf: `${String(week + 1).padStart(2, '0')}_WEEK_${week}.pdf` });
}

function diagnosticView() {
  renderExercisePage('diagnostic', 'DIAG', course.exercises.filter(e => e.id.includes('-DIAG-')), { crumb: 'DIAGNÓSTICO', eyebrow: 'ANTES DE LA SEMANA 1 · OPCIONAL', title: 'Diagnóstico inicial', subtitle: 'Una referencia de partida separada de las 32 sesiones. Corrige al final y registra los patrones que aparezcan.', pdf: '01_DIAGNOSTIC_TEST.pdf' });
}

function mocksView() {
  breadcrumb.textContent = 'SIMULACROS';
  app.innerHTML = pageHeader('Evaluación adicional', 'Cuatro simulacros independientes.', 'Cada simulacro conserva los tiempos oficiales por componente. Puedes repartirlo en tres bloques de 60 minutos.') +
    `<div class="mock-grid">${[1, 2, 3, 4].map(n => `<a class="mock-card" href="#mock=${n}"><span class="eyebrow">SIMULACRO ${String(n).padStart(2, '0')}</span><strong>Mock ${n}</strong><small>${['A', 'B', 'C'].filter(b => state.completed[`MOCK${n}-${b}`]).length} / 3 bloques completados</small></a>`).join('')}</div><div class="session-actions"><a class="secondary-button" href="${pdfUrl('13_MOCK_EXAMS.pdf')}" target="_blank" rel="noopener">Abrir PDF de simulacros ↗</a></div>`;
}

function mockHome(n) {
  if (![1, 2, 3, 4].includes(n)) return mocksView();
  breadcrumb.textContent = `MOCK ${n}`;
  app.innerHTML = pageHeader(`SIMULACRO ${String(n).padStart(2, '0')}`, `Mock ${n}`, 'Completa A, B y C con el mismo número de simulacro. El contenido y las respuestas proceden de los PDFs finales.') +
    `<div class="mock-blocks">${[['A', 'Core + Reading', '25 + 35 minutos'], ['B', 'Writing', '50 minutos + 10 de revisión'], ['C', 'Listening + Speaking', '40 + 12 minutos + 8 de revisión']].map(([b, title, time]) => `<div class="mock-block"><div class="block-letter">${b}</div><strong>${title}</strong><p>${time}${state.completed[`MOCK${n}-${b}`] ? ' · Completado ✓' : ''}</p><a href="#mock=${n}&block=${b}">Abrir bloque →</a></div>`).join('')}</div><div class="session-actions"><a class="secondary-button" href="#mocks">← Todos los simulacros</a></div>`;
}

function mockBlock(n, b) {
  if (![1, 2, 3, 4].includes(n) || !['A', 'B', 'C'].includes(b)) return mocksView();
  renderExercisePage('mock', `MOCK${n}-${b}`, mockExercises(n, b), { crumb: `MOCK ${n} / BLOQUE ${b}`, eyebrow: `SIMULACRO ${String(n).padStart(2, '0')} · BLOQUE ${b}`, title: `Bloque ${b}`, subtitle: b === 'A' ? 'Core y Reading, 60 minutos en total.' : b === 'B' ? 'Writing, 50 minutos, más 10 minutos de revisión.' : 'Listening y Speaking, 52 minutos, más 8 minutos de revisión.', aside: 'BLOQUE DE 60 MIN', pdf: '13_MOCK_EXAMS.pdf' });
}

const bookMap = { start: '00_START_HERE.pdf', writing: '10_WRITING_MASTERBOOK.pdf', vocabulary: '11_VOCABULARY_MASTERBOOK.pdf', speaking: '12_SPEAKING_MASTERBOOK.pdf', tracker: '15_PROGRESS_ERROR_TRACKER.pdf' };
const bookTitles = { start: 'Start Here', writing: 'Writing Masterbook', vocabulary: 'Vocabulary Masterbook', speaking: 'Speaking Masterbook', tracker: 'Progress & Error Tracker' };
function booksView() {
  breadcrumb.textContent = 'MASTERBOOKS';
  app.innerHTML = pageHeader('Biblioteca de apoyo', 'Masterbooks del curso.', 'Consulta la explicación después de intentar las actividades. Los ejercicios originales de cada libro también se pueden responder aquí.') +
    `<div class="book-grid">${['writing', 'vocabulary', 'speaking', 'start'].map(k => `<a class="book-card" href="#book=${k}"><span class="eyebrow">${k === 'start' ? 'GUÍA' : 'MASTERBOOK'}</span><strong>${bookTitles[k]}</strong><small>Abrir lectura y actividades →</small></a>`).join('')}</div>`;
}
function bookView(k) {
  if (!bookMap[k]) return booksView();
  breadcrumb.textContent = bookTitles[k].toUpperCase();
  const pdf = bookMap[k];
  const exercises = course.exercises.filter(e => e.source === pdf);
  app.innerHTML = pageHeader('Biblioteca del curso', bookTitles[k], 'Texto extraído del PDF final. El PDF original conserva el diseño y la paginación.') +
    `<div class="session-actions"><a class="secondary-button" href="${pdfUrl(pdf)}" target="_blank" rel="noopener">Abrir PDF original ↗</a><a class="secondary-button" href="#books">← Biblioteca</a></div>
    <section class="card"><div class="book-text">${esc(course.books[pdf] || '')}</div></section>${exercises.length ? `<section class="section-space"><h2 class="section-heading">Actividades del Masterbook</h2><div class="exercise-list">${exercises.map(exerciseHTML).join('')}</div></section>` : ''}`;
  for (const ex of exercises) if (state.checked[ex.id]) updateFeedback(ex);
}

function pdfsView() {
  breadcrumb.textContent = 'DESCARGAS';
  app.innerHTML = pageHeader('Material original', 'Los 16 PDFs finales.', 'Abre o descarga los documentos que sirven como fuente del curso digital. Los nombres y el contenido se conservan.') +
    `<div class="pdf-list">${course.pdfs.map(name => `<a class="pdf-item" href="${pdfUrl(name)}" target="_blank" rel="noopener" download="${esc(name)}"><strong>${esc(name.replace(/\.pdf$/i, '').replaceAll('_', ' '))}</strong><small>PDF original · descargar ↗</small></a>`).join('')}</div>`;
}

function trackerView() {
  breadcrumb.textContent = 'ERROR TRACKER';
  app.innerHTML = pageHeader('Seguimiento personal', 'Error Tracker.', account ? 'Registra errores concretos con su ID, una corrección y una acción de repaso. Esta lista se guarda en tu cuenta.' : 'Registra errores concretos con su ID, una corrección y una acción de repaso. Esta lista queda guardada en este navegador.') +
    `<section class="card"><h2 class="card-title">Añadir un error</h2><form class="tracker-form" id="tracker-form"><label>ID del ejercicio<input name="id" placeholder="W1D1-E01-Q01" required></label><label>Categoría<select name="category"><option>Vocabulary</option><option>Grammar</option><option>Reading</option><option>Listening</option><option>Writing</option><option>Speaking</option></select></label><label class="wide">¿Qué falló?<textarea name="error" required placeholder="Describe el error de forma concreta"></textarea></label><label class="wide">Corrección o regla<textarea name="correction" required placeholder="Escribe la respuesta correcta o la regla"></textarea></label><div><button class="primary-button" type="submit">Guardar error</button></div></form></section>
    <section class="section-space"><h2 class="section-heading">${state.errors.length} errores registrados</h2><div class="tracker-list">${state.errors.length ? state.errors.map(e => `<div class="tracker-item"><div class="tracker-item-head"><div><strong>${esc(e.id)}</strong> <span class="tag ${e.resolved ? 'green' : 'gold'}">${esc(e.category)}</span></div><button class="small-button" type="button" data-resolve="${esc(e.key)}">${e.resolved ? 'Reabrir' : 'Repasado ✓'}</button></div><p>${esc(e.error)}<br><strong>Corrección:</strong> ${esc(e.correction)}</p><small>${e.resolved ? 'Repasado' : 'Pendiente'} · ${esc(e.date)}</small></div>`).join('') : '<div class="empty-state">Aún no has registrado errores. Añade los que se repiten después de corregir una sesión.</div>'}</div></section><div class="session-actions"><a class="secondary-button" href="${pdfUrl('15_PROGRESS_ERROR_TRACKER.pdf')}" target="_blank" rel="noopener">Abrir tracker original en PDF ↗</a></div>`;
}

function updateFeedback(ex) {
  let attempted = 0, correct = 0;
  for (const q of ex.questions) {
    const key = answerLetter(q.id);
    const value = String(state.responses[q.id] || '').trim().toUpperCase();
    const el = document.getElementById(`feedback-${q.id}`);
    if (!el) continue;
    if (key && value) {
      attempted++;
      if (value === key) correct++;
      el.innerHTML = `<span class="${value === key ? 'feedback-good' : 'feedback-bad'}">${value === key ? '✓ Correcto' : `✕ Revisa: ${esc(key)}`}</span>`;
    } else el.textContent = '';
  }
  const score = document.getElementById(`score-${ex.id}`);
  if (score) score.textContent = attempted ? `${correct} / ${attempted} respuestas objetivas correctas` : 'Compara las respuestas abiertas con las orientaciones';
}

function startTimer(seconds, label) {
  if (activeTimer) clearInterval(activeTimer);
  timerEnds = Date.now() + seconds * 1000;
  timerLabel = label;
  let display = document.getElementById('floating-timer');
  if (!display) { document.body.insertAdjacentHTML('beforeend', '<div id="floating-timer" style="position:fixed;right:20px;bottom:20px;z-index:30;background:#10213a;color:white;border-radius:12px;padding:15px 19px;box-shadow:0 8px 26px #10213a55;font-size:12px"><strong id="timer-label"></strong><div id="timer-clock" style="font:800 26px Manrope,sans-serif;margin-top:4px"></div><button type="button" data-stop-timer style="background:transparent;color:#8fd7cc;border:0;padding:4px 0 0;font-size:11px;font-weight:800">Detener</button></div>'); display = document.getElementById('floating-timer'); }
  document.getElementById('timer-label').textContent = timerLabel;
  const tick = () => {
    const left = Math.max(0, Math.ceil((timerEnds - Date.now()) / 1000));
    document.getElementById('timer-clock').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    if (!left) { clearInterval(activeTimer); activeTimer = null; document.getElementById('timer-label').textContent = `Tiempo terminado · ${timerLabel}`; }
  };
  tick(); activeTimer = setInterval(tick, 250);
}
function stopListening() {
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function vocabularyLabView() {
  breadcrumb.textContent = 'VOCABULARY LAB';
  renderVocabularyLab(app, state.errors);
}

function playSpeech(text) {
  if (!('speechSynthesis' in window)) return false;
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
  const british = voices.filter(v => v.lang.toLowerCase() === 'en-gb');
  const available = british.length ? british : voices;
  const dialogue = [...text.matchAll(/(?:^|\s)(Man|Woman):\s*([\s\S]*?)(?=\s+(?:Man|Woman):|$)/g)];
  const chunks = dialogue.length ? dialogue.map(m => ({ speaker: m[1], text: m[2].trim() })) : [{ speaker: '', text }];
  for (const chunk of chunks) {
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.lang = 'en-GB'; utterance.rate = 0.94;
    if (available.length) utterance.voice = available[chunk.speaker === 'Woman' && available.length > 1 ? 1 : 0];
    if (chunk.speaker && available.length < 2) utterance.pitch = chunk.speaker === 'Woman' ? 1.13 : 0.9;
    speechSynthesis.speak(utterance);
  }
  return true;
}

function markPlay(id) {
  state.plays[id] = (state.plays[id] || 0) + 1;
  save();
  const row = document.querySelector(`[data-play="${id}"]`)?.parentElement;
  if (row) {
    row.querySelector('small').textContent = `${state.plays[id]} / 2 escuchas`;
    if (state.plays[id] >= 2) row.querySelector('button').disabled = true;
  }
}

async function playRecording(id) {
  if (!course.recordings[id] || (state.plays[id] || 0) >= 2) return;
  stopListening();
  const file = audioManifest[id];
  if (typeof file === 'string' && /^[\w.-]+\.(mp3|ogg|wav)$/i.test(file)) {
    const candidate = new Audio(`./audio/${file}`);
    try {
      await candidate.play();
      currentAudio = candidate;
      markPlay(id);
      return;
    } catch { candidate.pause(); }
  }
  if (playSpeech(course.recordings[id])) markPlay(id);
}

function recorderPanel(id) { return [...document.querySelectorAll('[data-recorder-panel]')].find(el => el.dataset.recorderPanel === id); }
function recorderStatus(id, message) {
  const el = recorderPanel(id)?.querySelector('[data-record-status]');
  if (el) el.textContent = message;
}
function syncRecorder(id) {
  const panel = recorderPanel(id);
  if (!panel) return;
  const recording = activeRecorder?.id === id && activeRecorder.recorder.state === 'recording';
  const saved = speakingRecordings.get(id);
  if(saved?.uploadStatus&&!recording)recorderStatus(id,saved.uploadStatus);
  panel.querySelector('[data-record-start]').disabled = recording;
  panel.querySelector('[data-record-stop]').disabled = !recording;
  panel.querySelector('[data-record-play]').disabled = recording || !saved;
  panel.querySelector('[data-record-again]').disabled = recording || !saved;
  const audio = panel.querySelector('[data-record-audio]');
  if (saved) { audio.src = saved.url; audio.hidden = false; }
  else { audio.pause(); audio.removeAttribute('src'); audio.hidden = true; }
  syncAIFeedback(id);
}
function stopActiveRecording() {
  if (activeRecorder?.recorder.state === 'recording') activeRecorder.recorder.stop();
}
async function startRecording(id, again = false) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return;
  stopActiveRecording();
  if (again && speakingRecordings.has(id)) {
    recorderPanel(id)?.querySelector('[data-record-audio]')?.pause();
    URL.revokeObjectURL(speakingRecordings.get(id).url);
    speakingRecordings.delete(id);
    syncRecorder(id);
  }
  recorderStatus(id, 'Solicitando acceso al micrófono…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!recorderPanel(id)) { stream.getTracks().forEach(track => track.stop()); return; }
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    let ownTick = null;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      if (ownTick) clearInterval(ownTick);
      if (chunks.length) {
        const previous = speakingRecordings.get(id);
        if (previous) URL.revokeObjectURL(previous.url);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const clip={id:crypto.randomUUID(),url:URL.createObjectURL(blob),blob,duration:(Date.now()-started)/1000};
        speakingRecordings.set(id,clip);
        if(account?.role==='student') {
          uploadClip(id,clip);
        }
        recorderStatus(id, 'Grabación lista. Puedes reproducirla o volver a grabar.');
      } else recorderStatus(id, 'No se recibió audio. Inténtalo de nuevo.');
      if (activeRecorder?.recorder === recorder) activeRecorder = null;
      syncRecorder(id);
    };
    recorder.start();
    const started = Date.now();
    activeRecorder = { id, recorder };
    const tick = () => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const clock = recorderPanel(id)?.querySelector('[data-record-clock]');
      if (clock) clock.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
    };
    tick(); ownTick = setInterval(tick, 250);
    recorderStatus(id, account ? 'Grabando… Al terminar se guardará de forma privada en tu cuenta.' : 'Grabando… La voz no se envía a ningún servidor.');
    syncRecorder(id);
  } catch {
    recorderStatus(id, 'No se pudo acceder al micrófono. Revisa el permiso del navegador o usa los temporizadores.');
    syncRecorder(id);
  }
}

function downloadProgress() {
  const blob = new Blob([JSON.stringify(exportProgress(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `aptis-b2-progreso-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const message = document.getElementById('progress-message');
  if (message) message.textContent = 'Copia descargada.';
}

async function importProgress(file) {
  const message = document.getElementById('progress-message');
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera el tamaño admitido.');
    const parsed=JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if(account){if(account.role!=='student')throw Error('Solo la alumna puede importar.');const report=await importPackage(parsed,account,course,vocabularyData,learningStore);await refreshAccountExtras();render();document.getElementById('progress-message').textContent=`Importación comprobada: ${report.verifiedEntities} registros. ${report.conflictsPreserved} variantes conservadas.`;return;}
    const incoming = validateProgress(parsed, course);
    if (!window.confirm('¿Reemplazar todo el progreso guardado en este navegador por el del archivo? Esta acción no se puede deshacer.')) {
      if (message) message.textContent = 'Importación cancelada. El progreso actual sigue intacto.';
      return;
    }
    state = incoming; save(); render();
    const result = document.getElementById('progress-message');
    if (result) result.textContent = 'Progreso importado correctamente.';
  } catch (error) {
    if (message) message.textContent = error.message || 'No se pudo leer el archivo JSON.';
  }
}

function render() {
  if (!course) return;
  if(account?.role==='teacher'){mainNav.innerHTML='<a class="nav-link" href="#teacher">Panel del profesor</a>';weekNav.innerHTML='';topProgress.textContent='Supervisión';breadcrumb.textContent='PROFESOR';teacherDashboard(app,account,course,writingPlan,vocabularyData);return;}
  stopActiveRecording();
  renderNav();
  const hash = location.hash.slice(1) || 'dashboard';
  if(hash==='teacher'){app.innerHTML='<section class="card">Esta sección es exclusiva del profesor.</section>';return;}
  if (hash.startsWith('session=')) sessionView(hash.slice(8));
  else if (hash === 'diagnostic') diagnosticView();
  else if (hash === 'mocks') mocksView();
  else if (hash.startsWith('mock=')) { const p = new URLSearchParams(hash); const n = Number(p.get('mock')); const b = p.get('block'); b ? mockBlock(n, b) : mockHome(n); }
  else if (hash === 'books') booksView();
  else if (hash === 'vocabulary-lab') vocabularyLabView();
  else if (hash.startsWith('book=')) bookView(hash.slice(5));
  else if (hash === 'tracker') trackerView();
  else if (hash === 'pdfs') pdfsView();
  else dashboard();
  menu.classList.remove('open'); document.getElementById('mobile-backdrop').classList.remove('show');
  document.querySelectorAll('[data-recorder-panel]').forEach(panel => { if (panel.querySelector('[data-record-start]')) syncRecorder(panel.dataset.recorderPanel); });
  document.querySelectorAll('[data-ai-panel]').forEach(panel => syncAIFeedback(panel.dataset.aiPanel));
  if(account?.role==='student'){app.insertAdjacentHTML('afterbegin',migrationHTML(legacy));app.insertAdjacentHTML('beforeend','<section class="card server-backup"><button class="small-button" data-full-export>Descargar respaldo completo</button></section>');}
  document.querySelectorAll('[data-recorder-panel]').forEach(panel=>restoreRemoteClip(panel.dataset.recorderPanel));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

installAIFeedback({
  getAnswer: id => state.responses[id] || '',
  getRecording: id => activeRecorder?.id === id ? null : speakingRecordings.get(id),
  ensureRecording: async id=>{const clip=speakingRecordings.get(id);if(!clip)throw Error('Audio no disponible');if(!clip.blob){const response=await fetch(await signedAudio(clip.server.original_path));if(!response.ok)throw Error('Audio no disponible');clip.blob=await response.blob();}if(!clip.server)await uploadClip(id,clip,true);return clip;},
  flush:()=>learningStore?.flush()||Promise.resolve(false),
  feedbackSaved:()=>refreshAccountExtras(),
  addErrors: (id, errors) => {
    let count = 0;
    for (const error of errors) {
      if (state.errors.some(old => old.id === id && old.category === error.category && old.error === error.error && old.correction === error.correction)) continue;
      state.errors.unshift({ key: crypto.randomUUID?.() || String(Date.now()) + '-' + Math.random(), id, category: error.category, error: error.error, correction: error.correction, resolved: false, date: new Date().toLocaleDateString('es-ES') });
      count++;
    }
    save(); return count;
  },
});

document.addEventListener('input', e => {
  const id = e.target.dataset.response;
  if (!id) return;
  state.responses[id] = e.target.value; save(); syncAIFeedback(id);
  const count = document.querySelector(`[data-word-count="${id}"]`);
  if (count) { const q = course.exercises.flatMap(ex => ex.questions).find(q => q.id === id); count.textContent = `${wordCount(e.target.value)}${q.wordRange ? ` / ${q.wordRange} palabras` : ' palabras'}`; count.className = rangeClass(q.wordRange, e.target.value); }
});
document.addEventListener('change', e => { if (e.target.dataset.response) { state.responses[e.target.dataset.response] = e.target.value; save(); } });
document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.dataset.check) {
    const id = button.dataset.check, ex = course.exercises.find(e => e.id === id); state.checked[id] = !state.checked[id]; save();
    const card = document.getElementById(id); const panel = card.querySelector('.key-panel'); if (panel) panel.remove(); else card.insertAdjacentHTML('beforeend', keyHTML(ex));
    button.textContent = state.checked[id] ? 'Ocultar corrección' : 'Corregir y ver respuestas';
    if (state.checked[id]) updateFeedback(ex); else { card.querySelectorAll('.question-feedback').forEach(el => el.textContent = ''); card.querySelector('.score').textContent = ''; }
  }
  if (button.dataset.complete) { const id = button.dataset.complete; state.completed[id] = !state.completed[id]; save(); render(); }
  if (button.dataset.timer) startTimer(Number(button.dataset.timer), button.dataset.timerLabel || 'Tiempo');
  if (button.hasAttribute('data-stop-timer')) { if (activeTimer) clearInterval(activeTimer); activeTimer = null; document.getElementById('floating-timer')?.remove(); }
  if (button.dataset.play) playRecording(button.dataset.play);
  if (button.hasAttribute('data-stop-audio')) stopListening();
  if (button.dataset.recordStart) startRecording(button.dataset.recordStart);
  if (button.dataset.recordStop) stopActiveRecording();
  if (button.dataset.recordAgain) startRecording(button.dataset.recordAgain, true);
  if(button.dataset.recordPlay){const clip=speakingRecordings.get(button.dataset.recordPlay);if(clip?.server&&!clip.blob)signedAudio(clip.server.original_path).then(url=>{const player=recorderPanel(button.dataset.recordPlay)?.querySelector('[data-record-audio]');if(player){player.src=url;player.play().catch(()=>{});}}).catch(()=>recorderStatus(button.dataset.recordPlay,'No se pudo cargar el audio.'));else recorderPanel(button.dataset.recordPlay)?.querySelector('[data-record-audio]')?.play();}
  if(button.dataset.recordRetry)uploadClip(button.dataset.recordRetry,speakingRecordings.get(button.dataset.recordRetry));


  if (button.hasAttribute('data-export-progress')) downloadProgress();
  if (button.hasAttribute('data-import-progress')) document.getElementById('progress-file')?.click();
  if (button.dataset.resolve) { const item = state.errors.find(x => x.key === button.dataset.resolve); if (item) item.resolved = !item.resolved; save(); trackerView(); }
  if (button.dataset.weekToggle) { const days = document.getElementById(`days-${button.dataset.weekToggle}`); const hidden = days.hidden = !days.hidden; button.setAttribute('aria-expanded', String(!hidden)); }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'progress-file') return;
  importProgress(e.target.files?.[0]);
  e.target.value = '';
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'tracker-form') return;
  e.preventDefault(); const data = new FormData(e.target);
  state.errors.unshift({ key: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, id: String(data.get('id')).trim(), category: String(data.get('category')), error: String(data.get('error')).trim(), correction: String(data.get('correction')).trim(), resolved: false, date: new Date().toLocaleDateString('es-ES') });
  save(); trackerView();
});
document.querySelector('#menu-toggle').addEventListener('click', () => { menu.classList.add('open'); document.getElementById('mobile-backdrop').classList.add('show'); });
document.getElementById('mobile-backdrop').addEventListener('click', () => { menu.classList.remove('open'); document.getElementById('mobile-backdrop').classList.remove('show'); });
window.addEventListener('hashchange', render);

app.innerHTML = '<div class="card">Cargando el curso…</div>';
Promise.all([
  fetch('./data/course.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  fetch('./audio/manifest.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
  fetch('./data/vocabulary.json').then(r=>r.json()),
  fetch('./data/writing-plan.json').then(r => { if (!r.ok) throw new Error('Writing plan unavailable'); return r.json(); }),
]).then(async ([data,manifest,vocab,plan])=>{course=data;audioManifest=manifest.files||{};writingPlan=plan;vocabularyData=vocab;await bootAccounts();render();}).catch(error=>{app.innerHTML=`<div class="card"><h1>No se pudo abrir la academia</h1><p>${esc(error.message||'Comprueba la conexión.')}</p><a href="./auth.html">Ir al acceso</a></div>`;});
