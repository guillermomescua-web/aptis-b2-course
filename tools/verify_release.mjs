import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(read('docs/v2.1-content-baseline.json'));
for(const [name,expected]of Object.entries(baseline.hashes))assert.equal(hash(read(name)),expected,name);
const course=JSON.parse(read('data/course.json')),manifest=JSON.parse(read('audio/manifest.json')),report=JSON.parse(read('audio/generation-report.json'));
assert.equal(Object.keys(course.sessions).length,32);assert.equal(Object.keys(manifest.files).length,88);
for(const [id,script]of Object.entries(course.recordings)){const r=report.recordings[id];assert.equal(hash(script),r.scriptHash,id+' script');assert.equal(hash(read('audio/'+manifest.files[id])),r.sha256,id+' audio');assert.ok(r.duration>5&&r.duration<180,id+' duration');}
for(let mock=1;mock<=4;mock++){const ids=Object.keys(manifest.files).filter(id=>id.startsWith('MOCK0'+mock));assert.equal(ids.length,20);assert.equal(new Set(ids.filter(id=>/R1[4-7]$/.test(id)).map(id=>report.recordings[id].voices[0])).size,4);assert.ok(report.recordings['MOCK0'+mock+'-LIST-R18'].voices.includes('marin'));assert.ok(report.recordings['MOCK0'+mock+'-LIST-R18'].voices.includes('cedar'));}
console.log('V2.1 integrity: academic baseline identical; 32 sessions; all 88 audio files match original scripts; four distinct matching voices per mock; two dialogue voices.');
