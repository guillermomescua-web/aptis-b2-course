import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base='https://guillermomescua-web.github.io/aptis-b2-course/';
const baseline=JSON.parse(fs.readFileSync(new URL('../docs/v2-content-baseline.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const hashes=Object.fromEntries(Object.entries(baseline.hashes).filter(([name])=>name!=='audio/manifest.json'));
const root=new URL('../',import.meta.url),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const gitBytes=(ref,name)=>execFileSync('git',['-c','safe.directory='+fileURLToPath(root).replace(/[\\/]$/,''),'show',ref+':'+name],{cwd:root,maxBuffer:32*1024*1024});
for(const name of Object.keys(baseline.hashes).filter(name=>name!=='audio/manifest.json')){
  assert.equal(hash(fs.readFileSync(new URL('../'+name,import.meta.url))),baseline.hashes[name],name+' original Windows baseline');
  const original=gitBytes(baseline.sourceCommit,name);
  assert.deepEqual(gitBytes('HEAD',name),original,name+' original Git publication bytes');
  hashes[name]=hash(original); // GitHub Pages uses Git LF text; Windows checkout uses CRLF.
}
for(const name of ['index.html','auth.html','src/app.js','src/auth-page.js','src/ai-feedback.js','src/learning-store.js','src/legacy-migration.js','src/vocabulary-lab.js','src/teacher-dashboard.js','data/account-config.json','release.css','data/reading-lab.json','src/reading-lab.js','audio/manifest.json']) hashes[name]=hash(gitBytes('HEAD',name));
for(const file of Object.values(JSON.parse(gitBytes('HEAD','audio/manifest.json')).files))hashes['audio/'+file]=hash(gitBytes('HEAD','audio/'+file));
const cacheBust=execFileSync('git',['-c','safe.directory='+fileURLToPath(root).replace(/[\\/]$/,''),'rev-parse','--short=12','HEAD'],{cwd:root}).toString().trim();
const entries=Object.entries(hashes),checks=[];
for(let i=0;i<entries.length;i+=4){
  const group=await Promise.all(entries.slice(i,i+4).map(async([name,hash])=>{
    const response=await fetch(base+name+'?v='+cacheBust); assert.equal(response.status,200,name);
    const data=Buffer.from(await response.arrayBuffer());
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),hash,name+' published bytes');
    if(name==='data/course.json'){const course=JSON.parse(data);const ids=course.exercises.flatMap(e=>e.questions.map(q=>q.id));assert.equal(ids.length,972);assert.equal(new Set(ids).size,972);}
    return name;
  }));checks.push(...group);
}
console.log(JSON.stringify({url:base,protectedFiles:Object.keys(baseline.hashes).length-1,frontendFiles:14,audioFiles:88,cacheBust,questionIDs:972,courseSHA256:baseline.hashes['data/course.json'],checks},null,2));
