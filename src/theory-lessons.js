import {escapeHTML as esc} from './accounts.js';
let rows={},save=null,flush=()=>Promise.resolve(),load,lesson,player=null;
const chapters=['THEORY-W2-C1','THEORY-W2-C2','THEORY-W2-C3'];
export const theoryIds=chapters;
export function validateTheoryRow(id,value){
 return chapters.includes(id)&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['started','completed','position','furthest','updatedAt'].includes(k))&&typeof value.started==='boolean'&&typeof value.completed==='boolean'&&['position','furthest','updatedAt'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)&&value.position<=3600&&value.furthest<=3600&&value.furthest>=value.position&&(!value.completed||value.started);
}
export function configureTheory(snapshot={},onSave=null,onFlush=()=>Promise.resolve()){disposeTheory();rows=snapshot;save=onSave;flush=onFlush;}
export function updateTheorySnapshot(snapshot){rows=snapshot;}
export function theoryProgress(data,snapshot){
 const total=data.chapters.reduce((n,c)=>n+c.duration,0),watched=data.chapters.reduce((n,c)=>n+(snapshot[c.id]?.completed?c.duration:Math.min(c.duration,snapshot[c.id]?.furthest||0)),0);
 return {percent:total?Math.round(watched/total*100):0,completed:data.chapters.filter(c=>snapshot[c.id]?.completed).length};
}
const time=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
const initial=()=>({started:false,completed:false,position:0,furthest:0,updatedAt:0});
export function disposeTheory(){if(!player)return;player.persist();player.audio.pause();player.abort.abort();player=null;}
function persist(){
 if(!player||!save||!player.ready)return;
 const {chapter,audio}=player,old=rows[chapter.id]||initial();
 if(!old.started&&!player.started)return;
 const position=Math.min(Math.ceil(chapter.duration),Math.max(0,Math.round(audio.currentTime||0)));
 const value={...old,started:true,position,furthest:Math.max(position,old.furthest||0),completed:!!old.completed||audio.ended,updatedAt:Date.now()};
 rows={...rows,[chapter.id]:value};save(chapter.id,value);player.lastSaved=Date.now();updateProgress();
}
function updateProgress(){
 if(!player)return;const root=player.root,p=theoryProgress(lesson,rows);
 root.querySelector('[data-theory-progress]').textContent=`${p.percent}% · ${p.completed} de 3 capítulos completados`;
 root.querySelector('[data-theory-meter]').value=p.percent;
 for(const button of root.querySelectorAll('[data-theory-chapter]')){const c=lesson.chapters[Number(button.dataset.theoryChapter)],r=rows[c.id];button.querySelector('small').textContent=`${time(c.duration)} · ${r?.completed?'Completado':r?.started?'En curso':'Sin empezar'}`;}
}
function drawSlide(){
 if(!player)return;const {chapter,audio,root}=player,found=chapter.slides.findIndex(s=>audio.currentTime>=s.start&&audio.currentTime<s.end),index=found>=0?found:audio.currentTime>=chapter.slides.at(-1).start?chapter.slides.length-1:0;
 root.querySelector('[data-theory-clock]').textContent=`${time(audio.currentTime)} / ${time(chapter.duration)}`;
 const seek=root.querySelector('[data-theory-seek]');if(document.activeElement!==seek)seek.value=Math.floor(audio.currentTime);
 if(index===player.slide)return;player.slide=index;const s=chapter.slides[index];
 root.querySelector('[data-theory-slide]').innerHTML=`<div class="theory-slide-number">CAPÍTULO ${player.index+1} · ${String(index+1).padStart(2,'0')} / ${chapter.slides.length}</div><h2>${esc(s.title)}</h2><ul>${s.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><blockquote>${esc(s.example)}</blockquote>${s.practice?`<details class="theory-practice"><summary>Guided practice · pause and try</summary><p>${esc(s.practice.prompt)}</p><details><summary>Check this new example</summary><p>${esc(s.practice.answer)}</p></details></details>`:''}`;
 root.querySelector('[data-theory-transcript]').textContent=s.narration;
 root.querySelector('[data-theory-slide-select]').value=String(index);
}
function seekTo(seconds){if(!player)return;player.audio.currentTime=Math.max(0,Math.min(player.chapter.duration,seconds));drawSlide();persist();}
function openChapter(index,autoplay=false){
 if(!player)return;persist();player.ready=false;player.audio.pause();player.audio.removeAttribute('src');player.audio.load();
 player.index=index;player.chapter=lesson.chapters[index];player.slide=-1;player.started=false;
 const old=rows[player.chapter.id]||initial();player.resume=old.completed&&old.position>=player.chapter.duration-2?0:old.position;
 player.audio.src=player.chapter.audio;player.audio.load();
 player.root.querySelector('[data-theory-heading]').textContent=player.chapter.title;
 player.root.querySelector('[data-theory-seek]').max=String(Math.ceil(player.chapter.duration));
 for(const button of player.root.querySelectorAll('[data-theory-chapter]'))button.setAttribute('aria-current',Number(button.dataset.theoryChapter)===index?'true':'false');
 player.root.querySelector('[data-theory-prev]').disabled=index===0;player.root.querySelector('[data-theory-next]').disabled=index===lesson.chapters.length-1;
 player.root.querySelector('[data-theory-status]').textContent=player.resume?`Continuarás desde ${time(player.resume)}. Pulsa Reproducir.`:'Pulsa Reproducir para comenzar este capítulo.';
 drawSlide();updateProgress();
 if(autoplay)play();
}
async function play(){
 if(!player)return;const p=player;p.started=true;
 try{if(p.audio.error)p.audio.load();await p.audio.play();if(player!==p)return;persist();p.root.querySelector('[data-theory-status]').textContent='Reproduciendo narración en inglés británico.';}
 catch{if(player===p)p.root.querySelector('[data-theory-status]').textContent='Pulsa Reproducir para permitir el audio en este navegador.';}
}
export async function renderTheory(root){
 disposeTheory();root.innerHTML='<section class="card">Preparando la clase…</section>';
 try{lesson=await(load||=(fetch('./data/theory-week2.json').then(r=>{if(!r.ok)throw Error();return r.json();})));}
 catch{root.innerHTML='<section class="card">No se pudo cargar la clase. Vuelve a abrir esta sección para reintentar.</section>';return;}
 if(location.hash!=='#theory')return;
 const p=theoryProgress(lesson,rows);
 root.innerHTML=`<section class="theory-page"><header class="hero"><div><p class="eyebrow">CLASES TEÓRICAS · RECOMENDADO</p><h1 class="page-title">${esc(lesson.title)}</h1><p class="page-subtitle">Una clase, tres capítulos. Diapositivas sincronizadas y narración en inglés británico.</p></div><span class="tag green">${time(lesson.duration)} · ENGLISH</span></header><div class="theory-progress"><label for="theory-meter">Tu progreso <strong data-theory-progress>${p.percent}% · ${p.completed} de 3 capítulos completados</strong></label><progress id="theory-meter" data-theory-meter max="100" value="${p.percent}"></progress></div><div class="theory-layout"><section class="theory-player" aria-label="Reproductor de la clase"><div class="theory-player-top"><span>SEMANA 02</span><h2 data-theory-heading></h2></div><div class="theory-slide" data-theory-slide lang="en"></div><div class="theory-controls"><div class="theory-buttons"><button class="primary-button" data-theory-play>Reproducir</button><button class="small-button" data-theory-back aria-label="Retroceder 15 segundos">−15 s</button><button class="small-button" data-theory-forward aria-label="Avanzar 15 segundos">+15 s</button><span data-theory-clock role="timer"></span></div><label class="sr-only" for="theory-seek">Posición de reproducción</label><input id="theory-seek" data-theory-seek type="range" min="0" value="0" step="1"><p data-theory-status role="status"></p></div><div class="theory-chapter-controls"><button class="small-button" data-theory-prev>← Capítulo anterior</button><button class="secondary-button" data-theory-next>Capítulo siguiente →</button></div><audio preload="metadata" data-theory-audio aria-label="Narración en inglés británico"></audio></section><aside class="theory-index card"><h2>Índice de capítulos</h2>${lesson.chapters.map((c,i)=>`<button type="button" data-theory-chapter="${i}"><span class="theory-index-number">${String(i+1).padStart(2,'0')}</span><span><strong>${esc(c.title)}</strong><small>${time(c.duration)} · Sin empezar</small></span></button>`).join('')}<label for="theory-slide-select">Ir a una explicación</label><select id="theory-slide-select" data-theory-slide-select></select><a class="primary-button theory-pdf" href="${esc(lesson.pdf)}" download>↓ PDF de repaso · Week 2</a><p>Ejemplos nuevos, reglas y checklist. En inglés.</p></aside></div><details class="card theory-transcript" lang="en"><summary>Transcript of the current explanation</summary><p data-theory-transcript></p></details><p class="theory-note">${esc(lesson.notice)} No necesitas aprobación del profesor. Narración generada con IA; ejemplos nuevos revisados para no adelantar las respuestas del curso.</p></section>`;
 const audio=root.querySelector('[data-theory-audio]'),abort=new AbortController();
 player={root,audio,abort,index:0,chapter:lesson.chapters[0],slide:-1,started:false,ready:false,lastSaved:0,persist};
 const on=(target,event,fn)=>target.addEventListener(event,fn,{signal:abort.signal});
 function selectSlides(){root.querySelector('[data-theory-slide-select]').innerHTML=player.chapter.slides.map((s,i)=>`<option value="${i}">${i+1}. ${esc(s.title)}</option>`).join('');}
 on(audio,'loadedmetadata',()=>{if(!player||player.audio!==audio)return;audio.currentTime=Math.min(player.resume||0,audio.duration||player.chapter.duration);player.resume=0;player.ready=true;drawSlide();});
 on(audio,'timeupdate',()=>{drawSlide();if(Date.now()-player.lastSaved>=5000)persist();});
 on(audio,'play',()=>{root.querySelector('[data-theory-play]').textContent='Pausar';});
 on(audio,'pause',()=>{root.querySelector('[data-theory-play]').textContent='Reproducir';if(player?.started&&player.ready&&!audio.ended)root.querySelector('[data-theory-status]').textContent='En pausa. Tu posici?n se conserva en tu cuenta.';persist();flush();});
 on(audio,'ended',()=>{persist();flush();root.querySelector('[data-theory-status]').textContent='Capítulo completado. Puedes avanzar al siguiente o volver a escucharlo.';});
 on(audio,'error',()=>{root.querySelector('[data-theory-status]').textContent='No se pudo cargar el audio. Comprueba la conexión y pulsa Reproducir para reintentar.';});
 on(root.querySelector('[data-theory-play]'),'click',()=>{if(audio.paused)play();else audio.pause();});
 on(root.querySelector('[data-theory-back]'),'click',()=>seekTo(audio.currentTime-15));on(root.querySelector('[data-theory-forward]'),'click',()=>seekTo(audio.currentTime+15));
 on(root.querySelector('[data-theory-seek]'),'change',e=>seekTo(Number(e.target.value)));
 on(root.querySelector('[data-theory-slide-select]'),'change',e=>seekTo(player.chapter.slides[Number(e.target.value)].start));
 const change=i=>{openChapter(i);selectSlides();};
 on(root.querySelector('[data-theory-prev]'),'click',()=>change(player.index-1));on(root.querySelector('[data-theory-next]'),'click',()=>change(player.index+1));
 for(const button of root.querySelectorAll('[data-theory-chapter]'))on(button,'click',()=>change(Number(button.dataset.theoryChapter)));
 on(window,'pagehide',()=>{persist();flush();});on(document,'visibilitychange',()=>{if(document.visibilityState==='hidden'){persist();flush();}});
 const begun=lesson.chapters.map((c,i)=>({i,r:rows[c.id]})).filter(x=>x.r?.started&&!x.r.completed).sort((a,b)=>(b.r.updatedAt||0)-(a.r.updatedAt||0));
 openChapter(begun[0]?.i??0);selectSlides();
}
