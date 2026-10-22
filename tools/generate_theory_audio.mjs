// One-time generation of original teaching narration. Uses an ignored local key.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/^\uFEFF/,''),data=JSON.parse(read('data/theory-week2.json'));
const words=data.chapters.flatMap(c=>c.slides).reduce((n,s)=>n+s.narration.split(/\s+/).length,0),estimate=words/110*0.015+0.02;
if(estimate>1)throw Error('Estimated cost exceeds the approved USD 1 cap.');
console.log(JSON.stringify({words,conservativeEstimateUSD:+estimate.toFixed(3),targetMinutes:25,model:'gpt-4o-mini-tts',voice:'cedar'}));
if(process.argv.includes('--estimate'))process.exit(0);
const env=fs.existsSync(path.join(root,'.env'))?read('.env'):'';
const key=process.env.OPENAI_API_KEY||env.match(/^\s*OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
if(!key)throw Error('Private local API key unavailable.');
const ffmpeg=path.join(root,'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),out=path.join(root,'audio/theory'),cache=path.join(root,'audio/.generation-cache/theory-week2');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(cache,{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),reportPath=path.join(out,'generation-report.json');
let report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):{model:'gpt-4o-mini-tts',voice:'cedar',language:'en-GB',createdAt:new Date().toISOString(),conservativeEstimateUSD:estimate,segments:{},costStatus:'Estimate from actual generated duration; not an observed invoice.'};
let generatedSeconds=0;
for(const chapter of data.chapters)for(const s of chapter.slides){
 const h=hash(s.narration+'|cedar|british-teacher-v1'),file=path.join(cache,s.id+'-'+h.slice(0,16)+'.pcm');
 if(!fs.existsSync(file)){
  if(generatedSeconds/60*0.015+0.02>0.9)throw Error('Stop before exceeding authorized cost envelope.');
  const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:report.model,voice:report.voice,input:s.narration,response_format:'pcm',instructions:'Narrate the supplied text verbatim as a patient, engaging British English teacher. Use a consistent natural UK English accent, clear consonants and conversational teaching intonation, around 150 words per minute. Explain with warmth; pause naturally between sentences and examples. Read grammatical examples naturally, not as a list of punctuation. No music, no sound effects, no extra introductions, no skipped or invented words.'}),signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw Error('Narration request failed, HTTP '+r.status+'. Completed segments retained; no automatic paid retry.');
  const pcm=Buffer.from(await r.arrayBuffer());if(pcm.length<4800||pcm.length%2)throw Error('Invalid speech response.');fs.writeFileSync(file,pcm);
  report.segments[s.id]={scriptHash:hash(s.narration),cacheFile:path.basename(file),sourceSeconds:pcm.length/48000,requestId:r.headers.get('x-request-id')};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 }
 const pcm=fs.readFileSync(file);generatedSeconds+=pcm.length/48000;
 if(!report.segments[s.id])report.segments[s.id]={scriptHash:hash(s.narration),cacheFile:path.basename(file),sourceSeconds:pcm.length/48000};
 console.log(chapter.id+' / '+s.id+' · '+(pcm.length/48000).toFixed(1)+' s');
}
// Moderate pacing only; never manufacture duration with silent padding or repetition.
const tempo=Math.min(1.15,Math.max(0.85,generatedSeconds/1500));
for(const chapter of data.chapters){
 let time=0;const parts=[];
 for(const s of chapter.slides){const r=report.segments[s.id];parts.push(fs.readFileSync(path.join(cache,r.cacheFile)));s.start=+time.toFixed(3);time+=r.sourceSeconds/tempo;s.end=+time.toFixed(3);}
 const pcmFile=path.join(cache,chapter.id+'.pcm');fs.writeFileSync(pcmFile,Buffer.concat(parts));
 const name=chapter.id+'.mp3';execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','s16le','-ar','24000','-ac','1','-i',pcmFile,'-af',`atempo=${tempo.toFixed(8)},loudnorm=I=-18:TP=-2:LRA=9`,'-codec:a','libmp3lame','-b:a','96k',path.join(out,name)]);
 chapter.audio='audio/theory/'+name;chapter.duration=+time.toFixed(3);
 report[chapter.id]={sha256:hash(fs.readFileSync(path.join(out,name))),duration:chapter.duration,slides:chapter.slides.length};
}
data.duration=+data.chapters.reduce((n,c)=>n+c.duration,0).toFixed(3);report.actualSourceSeconds=+generatedSeconds.toFixed(3);report.playbackSeconds=data.duration;report.tempo=tempo;report.estimatedGenerationUSD=+(generatedSeconds/60*0.015+words/0.75*0.6/1e6).toFixed(4);
fs.writeFileSync(path.join(root,'data/theory-week2.json'),JSON.stringify(data,null,2)+'\n');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({duration:data.duration,estimatedCostUSD:report.estimatedGenerationUSD,tempo}));
