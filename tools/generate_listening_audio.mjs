import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),course=JSON.parse(fs.readFileSync(path.join(root,'data/course.json')));
const ffmpeg=path.join(root,'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
const key=process.env.OPENAI_API_KEY;if(!key)throw Error('Private OPENAI_API_KEY is required');if(!fs.existsSync(ffmpeg))throw Error('Install the FFmpeg build dependency first');
const cache=path.join(root,'audio/.generation-cache');fs.mkdirSync(cache,{recursive:true});
const reportPath=path.join(root,'audio/generation-report.json');let report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath)):{model:'gpt-4o-mini-tts',createdAt:new Date().toISOString(),method:'One-time static generation. Dialogues assembled from distinct voices; scripts unchanged.',costBasis:{textInputPerMillion:0.6,audioOutputPerMillion:12,estimatedPerMinute:0.015},recordings:{}};
const files={};const voices=['marin','cedar','coral','ash','sage','fable'];const entries=Object.entries(course.recordings).sort(([a],[b])=>a.localeCompare(b));
const wordTotal=entries.reduce((n,[,text])=>n+text.split(/\s+/).length,0),conservativeCost=wordTotal/115*0.015+0.04;
if(conservativeCost>1)throw Error('Estimated cost exceeds the authorized $1 ceiling');
console.log(JSON.stringify({recordings:entries.length,words:wordTotal,conservativeEstimateUSD:Number(conservativeCost.toFixed(3))}));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');let seconds=0;
for(let number=0;number<entries.length;number++){
 const [id,text]=entries[number],filename=id+'.mp3',out=path.join(root,'audio',filename),scriptHash=hash(text);
 if(report.recordings[id]?.scriptHash===scriptHash&&report.recordings[id]?.encodingVersion===2&&fs.existsSync(out)){files[id]=filename;seconds+=report.recordings[id].sourceDuration;continue;}
 const matches=[...text.matchAll(/(?:^|\s)(Man|Woman):\s*([\s\S]*?)(?=\s+(?:Man|Woman):|$)/g)];
 const chunks=matches.length?matches.map(m=>({voice:m[1]==='Man'?'cedar':'marin',text:m[2].trim()})):[{voice:voices[number%voices.length],text}];
 const buffers=[];const requestIds=[];
 for(let i=0;i<chunks.length;i++){
  const chunk=chunks[i],cached=path.join(cache,id+'-'+i+'-'+hash(chunk.text+'|'+chunk.voice).slice(0,12)+'.pcm');
  if(!fs.existsSync(cached)){
   const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:report.model,voice:chunk.voice,input:chunk.text,response_format:'pcm',instructions:'Read the supplied words verbatim in natural British English. Use a clear, conversational adult voice, normal B2 exam pace around 145-155 words per minute, varied but restrained intonation, short natural sentence pauses. Do not add, omit or paraphrase words. No introductory speech, speaker labels, music, sound effects or background noise.'}),signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error('Speech generation failed: HTTP '+response.status+'; completed files retained.');
   const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<4800||bytes.length%2)throw Error('Invalid PCM response');fs.writeFileSync(cached,bytes);requestIds.push(response.headers.get('x-request-id'));
  }
  if(i)buffers.push(Buffer.alloc(8640));buffers.push(fs.readFileSync(cached));
 }
 const pcm=Buffer.concat(buffers),duration=pcm.length/48000;seconds+=duration;
 if(seconds/60*0.015+0.04>1)throw Error('Audio duration exceeded the authorized cost envelope; stop before more generation');
 const inputFile=path.join(cache,id+'.pcm');fs.writeFileSync(inputFile,pcm);
 const wordCount=chunks.reduce((n,c)=>n+c.text.split(/\s+/).length,0),tempo=Math.max(0.82,Math.min(1.05,(173+(number%3)*6)/(wordCount/duration*60)));
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','s16le','-ar','24000','-ac','1','-i',inputFile,'-af','atempo='+tempo.toFixed(4),'-codec:a','libmp3lame','-b:a','96k',out]);
 report.recordings[id]={encodingVersion:2,scriptHash,sourceDuration:Number(duration.toFixed(3)),duration:Number((duration/tempo).toFixed(3)),tempo,voices:chunks.map(c=>c.voice),sha256:hash(fs.readFileSync(out)),requestIds};files[id]=filename;
 report.totalSeconds=Number(seconds.toFixed(3));report.estimatedGenerationUSD=Number((seconds/60*0.015).toFixed(4));report.costStatus='Estimate from actual duration; final billed cost must be checked in OpenAI Usage.';
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(root,'audio/manifest.json'),JSON.stringify({schemaVersion:1,source:'AI-generated static speech',files},null,2)+'\n');
 console.log(id+' · '+duration.toFixed(1)+' s · '+chunks.length+' voice segments');
 if(process.argv.includes('--sample'))break;
}
console.log('Generation saved; no playback endpoint or API credential is added to the frontend.');
