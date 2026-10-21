import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';import test from 'node:test';
import {validateProgress,exportProgress} from '../src/progress.js';
const root=new URL('../',import.meta.url),read=n=>fs.readFileSync(new URL(n,root)),json=n=>JSON.parse(read(n).toString().replace(/^\uFEFF/,''));
test('Unlimited Listening keeps academic files, all original IDs and all 88 MP3s byte identical',()=>{
 for(const [name,hash]of Object.entries(json('docs/unlimited-listening-baseline.json').hashes))assert.equal(crypto.createHash('sha256').update(read(name)).digest('hex'),hash,name);
 const c=json('data/course.json'),ids=c.exercises.flatMap(e=>e.questions.map(q=>q.id));assert.equal(ids.length,972);assert.equal(new Set(ids).size,972);assert.equal(c.exercises.length,201);assert.equal(Object.keys(c.sessions).length,32);
});
test('Progress exports and imports counts above two without losing old counts or accepting invalid data',()=>{
 const c=json('data/course.json'),state={responses:{},completed:{},errors:[],checked:{},plays:{'W1D4-E03-R01':2,'MOCK01-LIST-R01':1234}};
 assert.deepEqual(validateProgress(exportProgress(state),c),state);
 for(const count of [-1,1.5,'3',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateProgress(exportProgress({...state,plays:{'W1D4-E03-R01':count}}),c),/inválidos/);
});
