import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scoreReading,readingStats,categories} from '../src/reading-lab.js';
import {validatePackage} from '../src/legacy-migration.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/reading-lab.json',import.meta.url),'utf8'));
test('Complete backup includes validated Reading rows; old packages remain compatible',()=>{
 const course=JSON.parse(fs.readFileSync(new URL('../data/course.json',import.meta.url),'utf8')),vocabulary=JSON.parse(fs.readFileSync(new URL('../data/vocabulary.json',import.meta.url),'utf8'));
 const file={schemaVersion:2,state:{responses:{},completed:{},checked:{},plays:{},errors:[]},reading:{'RL-P2-01':{part:2,attempts:1,correct:4,incorrect:1,errors:{reference:1},lastAt:Date.now()}}};
 assert.equal(validatePackage(file,course,vocabulary).entities[0].kind,'reading');assert.equal(validatePackage({...file,reading:undefined},course,vocabulary).entities.length,0);assert.throws(()=>validatePackage({...file,reading:{UNKNOWN:file.reading['RL-P2-01']}},course,vocabulary),/inválido/);
});
test('Reading practice has 16 six-sentence P2 tasks and 10 four-person, seven-statement P3 sets',()=>{
 assert.equal(data.part2.length,16);assert.equal(data.part3.length,10);
 const ids=new Set();
 for(const task of [...data.part2,...data.part3]){assert.ok(!ids.has(task.id));ids.add(task.id);assert.ok(task.topic);}
 for(const task of data.part2){assert.ok(task.first);assert.equal(task.sentences.length,5);assert.equal(new Set(task.order).size,5);assert.deepEqual(new Set(task.order),new Set(task.sentences.map(s=>s.id)));for(const s of task.sentences){assert.ok(categories[s.category]);assert.ok(s.explanation.length>20);}assert.equal(scoreReading(task,task.order).correct,5);}
 for(const task of data.part3){assert.equal(task.people.length,4);assert.equal(task.statements.length,7);const answers={};for(const s of task.statements){assert.ok(task.people.some(p=>p.id===s.answer));assert.ok(s.evidence.length>10);assert.ok(categories[s.category]);assert.ok(s.explanation.length>20);answers[s.id]=s.answer;}assert.equal(scoreReading(task,answers).correct,7);}
});
test('Reading correction counts wrong positions and statements consistently',()=>{
 const p2=data.part2[0],wrong=[...p2.order];[wrong[0],wrong[1]]=[wrong[1],wrong[0]];const result=scoreReading(p2,wrong);assert.equal(result.correct,3);assert.equal(result.incorrect,2);assert.equal(result.items.filter(x=>!x.correct).length,2);
 const p3=data.part3[0],answers=Object.fromEntries(p3.statements.map(s=>[s.id,s.answer]));answers[p3.statements[0].id]='INVALID';assert.equal(scoreReading(p3,answers).incorrect,1);
 const stats=readingStats({a:{part:2,attempts:2,correct:7,incorrect:3,errors:{reference:2,chronology:1}},b:{part:3,attempts:1,correct:6,incorrect:1,errors:{opinion:1}}});assert.equal(stats.part2.accuracy,70);assert.equal(stats.part3.accuracy,86);assert.equal(stats.errors.reference,2);assert.equal(readingStats({}).part2.accuracy,null);
});
