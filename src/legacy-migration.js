import {validateProgress,exportProgress} from './progress.js';
import {validateFeedback} from './ai-schema.js';
import {digest,rpc,escapeHTML as esc} from './accounts.js';
const KEYS=['aptis-b2-performance-v1','aptis-b2-vocabulary-v1','aptis-b2-ai-feedback-v1'];
export function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function legacyPackage(storage=localStorage){const raw=Object.fromEntries(KEYS.map(k=>[k,storage.getItem(k)]));if(!Object.values(raw).some(Boolean))return null;
  return {app:'aptis-b2-v2-backup',schemaVersion:2,legacyRaw:raw,state:raw[KEYS[0]]?JSON.parse(raw[KEYS[0]]):{responses:{},completed:{},checked:{},plays:{},errors:[]},vocabulary:raw[KEYS[1]]?JSON.parse(raw[KEYS[1]]):{schemaVersion:1,units:{}},ai:raw[KEYS[2]]?JSON.parse(raw[KEYS[2]]):{schemaVersion:1,items:{}}};}
export function validatePackage(file,course,vocabulary){
  const state=validateProgress(file.schemaVersion===1?file:exportProgress(file.state),course);const entities=[];
  for(const [kind,field,key]of [['answer','responses','text'],['session','completed','completed'],['exercise','checked','checked'],['listening','plays','plays']])for(const [id,value]of Object.entries(state[field]))entities.push({kind,id,data:{[key]:value}});
  for(const error of state.errors)entities.push({kind:'error',id:error.key,data:error});
  const lab=file.vocabulary||{schemaVersion:1,units:{}};if(lab.schemaVersion!==1||!lab.units||Array.isArray(lab.units))throw Error('Vocabulary Lab incompatible.');
  const ids=new Set(vocabulary.units.map(u=>u.id));
  for(const [id,data]of Object.entries(lab.units)){
    if(!ids.has(id)&&!/^VOC-PER-[A-Za-z0-9_.~-]+$/.test(id))throw Error(`Unidad de vocabulario desconocida: ${id}`);
    if(!['New','Learning','Review','Mastered'].includes(data.status)||!['repetitions','lapses','dueAt'].every(k=>Number.isSafeInteger(data[k])&&data[k]>=0)||data.mistakes!=null&&(!Number.isInteger(data.mistakes)||data.mistakes<0)||data.lastCorrect!=null&&typeof data.lastCorrect!=='boolean')throw Error('Progreso de vocabulario inválido.');
    entities.push({kind:'vocabulary',id,data});
  }
  const feedback=Array.isArray(file.feedback)?file.feedback:Object.values(file.ai?.items||{});
  for(const item of feedback){validateFeedback(item.kind,item.feedback);if(!course.exercises.some(ex=>ex.questions.some(q=>q.id===item.exerciseId))||!Number.isFinite(Date.parse(item.timestamp))||!/^[a-f0-9]{64}$/.test(item.sourceHash))throw Error('Feedback heredado inválido.');}
  if(feedback.length>200)throw Error('La importación admite hasta 200 correcciones.');
  return {entities,feedback,state};
}
export async function importPackage(file,account,course,vocabulary,store){
  if(account.role!=='student')throw Error('Solo la alumna puede importar progreso.');
  if(Object.keys(store.cache.pending).length)throw Error('Sincroniza o resuelve los cambios pendientes antes de importar.');
  const parsed=validatePackage(file,course,vocabulary);const hash=await digest({entities:parsed.entities,feedback:parsed.feedback});
  downloadJSON(file,`aptis-respaldo-antes-de-importar-${hash.slice(0,8)}.json`);
  const report=await rpc('import_legacy',{p_entities:parsed.entities,p_feedback:parsed.feedback,p_hash:hash});
  await store.refresh();
  let found=0;for(const e of parsed.entities)if(store.cache.rows[e.kind]?.[e.id])found++;
  if(found!==parsed.entities.length)throw Error('La comprobación de conteos no coincide. Conserva el respaldo y vuelve a consultar el servidor.');
  localStorage.setItem(`aptis-v2-import:${account.id}:${hash}`,JSON.stringify({report,verifiedEntities:found,date:new Date().toISOString()}));
  return {...report,verifiedEntities:found};
}
export async function alreadyImported(file,account,course,vocabulary){const parsed=validatePackage(file,course,vocabulary);const hash=await digest({entities:parsed.entities,feedback:parsed.feedback});return !!localStorage.getItem(`aptis-v2-import:${account.id}:${hash}`);}
export function migrationHTML(file){if(!file)return '';return `<section class="card migration-card"><h2>Encontramos progreso anterior en este dispositivo</h2><p>${Object.values(file.state.responses||{}).filter(v=>String(v).trim()).length} respuestas · ${Object.values(file.state.completed||{}).filter(Boolean).length} sesiones · ${(file.state.errors||[]).length} errores · ${Object.keys(file.vocabulary?.units||{}).length} unidades de vocabulario · ${Object.keys(file.ai?.items||{}).length} feedback IA.</p><p>Se importará únicamente a tu cuenta de alumna. El respaldo original se conserva. Los datos distintos del servidor se guardarán para revisión.</p><button class="primary-button" data-import-legacy>Importar a mi cuenta</button><p id="migration-message" role="status"></p></section>`;}
export function conflictHTML(store){const conflicts=store.conflicts();if(!conflicts.length)return '';return `<section class="card conflict-card"><h2>Hay otra versión guardada desde otro dispositivo</h2><p>Elige la versión que quieres usar. Las dos se conservarán como respaldo.</p>${conflicts.map(p=>`<article><h3>${esc(p.id)}</h3><div class="conflict-columns"><div><strong>Este dispositivo</strong><pre>${esc(p.data?.text??JSON.stringify(p.data))}</pre></div><div><strong>Servidor</strong><pre>${esc(p.server?.data?.text??JSON.stringify(p.server?.data))}</pre></div></div><button class="small-button" data-conflict="${esc(p.key)}" data-choice="local">Usar esta versión</button> <button class="small-button" data-conflict="${esc(p.key)}" data-choice="server">Conservar versión del servidor</button></article>`).join('')}</section>`;}
