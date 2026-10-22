import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {validateTheoryRow,theoryProgress} from '../src/theory-lessons.js';
import {validatePackage} from '../src/legacy-migration.js';
const root=new URL('../',import.meta.url),read=n=>fs.readFileSync(new URL(n,root)),json=n=>JSON.parse(read(n).toString().replace(/^\uFEFF/,'')),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const data=json('data/theory-week2.json'),course=json('data/course.json');
test('Three original English chapters contain synchronised 25-minute static narration and 30 vocabulary entries',()=>{
 const report=json('audio/theory/generation-report.json');assert.equal(data.chapters.length,3);assert.equal(data.glossary.length,30);assert.ok(Math.abs(data.duration-1500)<1);
 for(const c of data.chapters){assert.equal(c.slides.length,8);assert.equal(hash(read(c.audio)),report[c.id].sha256);let end=0;for(const s of c.slides){assert.equal(hash(s.narration),report.segments[s.id].scriptHash);assert.ok(s.narration.split(/\s+/).length>=130);assert.ok(s.points.length<=3);assert.equal(s.start,+end.toFixed(3));assert.ok(s.end>s.start);end=s.end;}assert.ok(Math.abs(end-c.duration)<.01);}
 assert.ok(report.estimatedGenerationUSD<1);assert.equal(report.language,'en-GB');
});
test('Theory preserves all protected content and never copies a complete original Week 2 question or recording',()=>{
 for(const [name,h]of Object.entries(json('docs/theory-week2-baseline.json').hashes))assert.equal(hash(read(name)),h,name);
 const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const text=norm(data.chapters.flatMap(c=>c.slides).map(s=>[s.title,...s.points,s.example,s.narration,s.practice?.prompt||'',s.practice?.answer||''].join(' ')).join(' '));
 for(const e of course.exercises.filter(e=>e.id.startsWith('W2')))for(const q of e.questions){const p=norm(q.prompt);if(p.split(' ').length>=8)assert.equal(text.includes(p),false,q.id);}
 assert.equal(text.includes(norm(course.recordings['W2D4-E03-R01'])),false);
 assert.doesNotMatch(JSON.stringify(data),/claim[_-]?token|ownership[_-]?token|correct answer in w2|w2d4-e02-q0/i);
 const sample='I would bring a board game because it is easy to share and gives neighbours who have not met before a natural way to start talking.';assert.equal(sample.split(/\s+/).length,26);
});
test('Theory row validation and optional class progress remain separate from the 32 sessions and old backups',()=>{
 const row={started:true,completed:false,position:120,furthest:150,updatedAt:Date.now()};
 assert.equal(validateTheoryRow('THEORY-W2-C1',row),true);assert.equal(validateTheoryRow('THEORY-W3-C1',row),false);assert.equal(validateTheoryRow('THEORY-W2-C1',{...row,position:151}),false);
 const file={schemaVersion:2,state:{responses:{},completed:{},checked:{},plays:{},errors:[]},theory:{'THEORY-W2-C1':row}};
 assert.ok(validatePackage(file,course,json('data/vocabulary.json')).entities.some(e=>e.kind==='theory'&&e.data.position===120));
 const p=theoryProgress(data,{'THEORY-W2-C1':{...row,completed:true}});assert.equal(p.completed,1);assert.ok(p.percent>=30&&p.percent<=35);
 assert.deepEqual(validatePackage({...file,theory:undefined},course,json('data/vocabulary.json')).entities,[]);
});
