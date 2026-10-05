import test from 'node:test';
import assert from 'node:assert/strict';
import {LearningStore,KINDS} from '../src/learning-store.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
function server(){const rows=Object.fromEntries(KINDS.map(k=>[k,{}]));let offline=false;
  return {rows,setOffline:value=>offline=value,snapshot:async()=>{if(offline)throw Error('offline');return Object.fromEntries(KINDS.map(k=>[k,Object.values(rows[k])]));},save:async p=>{if(offline)throw Error('offline');const existing=rows[p.kind][p.id];if((existing?.revision||0)!==p.expected)return {ok:false,row:structuredClone(existing)};const row={id:p.id,data:structuredClone(p.data),revision:(existing?.revision||0)+1,deleted:p.data==null};rows[p.kind][p.id]=row;return {ok:true,row};}};
}
test('Device B reads A server Writing; A conflict preserves both; user caches separated',async()=>{
  const api=server(),storage=memory();const a=new LearningStore('student',api,storage),b=new LearningStore('student',api,memory());
  a.set('answer','Q',{text:'A first version'});await a.flush();await b.refresh();assert.equal(b.get('answer','Q').text,'A first version');
  a.set('answer','Q',{text:'A offline draft'});b.set('answer','Q',{text:'B second version'});await b.flush();await a.flush();assert.equal(a.conflicts().length,1);assert.equal(a.get('answer','Q').text,'A offline draft');assert.equal(a.conflicts()[0].server.data.text,'B second version');
  a.resolve('answer:Q',true);await a.flush();assert.equal(api.rows.answer.Q.data.text,'A offline draft');assert.equal(a.cache.backups.length,1);
  const teacher=new LearningStore('teacher',api,storage);assert.equal(teacher.get('answer','Q'),undefined);
});
test('Offline edits survive reload and sync when network returns',async()=>{
  const api=server(),storage=memory();api.setOffline(true);const a=new LearningStore('student',api,storage);a.set('answer','Q',{text:'Offline exact text'});await a.flush();assert.equal(a.status,'Pendiente de sincronizar');const reopened=new LearningStore('student',api,storage);assert.equal(reopened.get('answer','Q').text,'Offline exact text');api.setOffline(false);await reopened.flush();assert.equal(reopened.status,'Guardado en servidor');assert.equal(api.rows.answer.Q.data.text,'Offline exact text');
});
test('Typing during a slow request preserves the later edit',async()=>{
  const api=server();let release;const original=api.save;api.save=async p=>{await new Promise(r=>release=r);return original(p);};const a=new LearningStore('student',api,memory());a.set('answer','Q',{text:'first'});const saving=a.flush();a.set('answer','Q',{text:'second'});release();await saving;assert.equal(a.get('answer','Q').text,'second');assert.equal(a.cache.pending['answer:Q'].expected,1);api.save=original;await a.flush();assert.equal(api.rows.answer.Q.data.text,'second');
});
