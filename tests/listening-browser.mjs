// Actual MP3 playback, unlimited repeats, pause/resume and persistence; no paid API.
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {testBackend} from './browser-backend.mjs';
const root=path.resolve(import.meta.dirname,'..'),backend=await testBackend(),server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,name==='/'?'index.html':name.slice(1));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await backend.attach(context,base);
await page.addInitScript(()=>{const Original=window.Audio;window.__audios=[];window.Audio=function(...args){const audio=new Original(...args);window.__audios.push(audio);return audio;};});
const saved=()=>page.waitForFunction(()=>document.querySelector('#account-sync').textContent==='Guardado en servidor');
async function repeat(id,n=3){const row=page.locator('.audio-row').filter({has:page.locator(`[data-play="${id}"]`)});for(let play=1;play<=n;play++){await row.locator('[data-play]').click();await row.getByText(play+' reproducciones',{exact:true}).waitFor();await row.locator('[data-play]:enabled').waitFor();await row.locator('[data-play]').evaluate(el=>el.closest('.audio-panel').querySelector('[data-stop-audio]').click());assert.equal(await row.locator('[data-play]').isEnabled(),true);}}
try{
 await page.goto(base+'auth.html');await page.locator('#login-form button:enabled').waitFor();await page.locator('[name=email]').first().fill('student@example.invalid');await page.locator('[name=password]').first().fill('Only-a-test-password-123');await page.locator('#login-form button').click();await page.locator('#account-panel .account-name').waitFor();await page.goto(base+'#session=W1D4');await page.locator('[data-play]').first().waitFor();
 const audio='**/audio/W1D4-E03-R01.mp3';let release,intercepted;const ready=new Promise(resolve=>intercepted=resolve);await context.route(audio,async route=>{await new Promise(resolve=>{release=resolve;intercepted();});await route.continue().catch(()=>{});});
 await page.locator('[data-play]').first().click();await ready;await page.locator('[data-stop-audio]').first().click();release();await page.waitForFunction(()=>!document.querySelector('[data-play]').disabled);assert.match(await page.locator('.audio-row').first().innerText(),/0 reproducciones/);assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false);await context.unroute(audio);console.log('PASS Stop during MP3 load cancels playback without spending a listen or starting TTS');
 for(let week=1;week<=8;week++){await page.goto(base+`#session=W${week}D4`);await page.locator('[data-play]').first().waitFor();await repeat(`W${week}D4-E03-R01`);await saved(page);}
 console.log('PASS Third actual MP3 play succeeds in all eight weekly Listening activities');
 for(let mock=1;mock<=4;mock++){
   await page.goto(base+`#mock=${mock}&block=C`);await page.getByRole('button',{name:'Comenzar',exact:true}).click();await page.locator('[data-play]').first().waitFor();
   const ids=await page.locator('[data-play]').evaluateAll(nodes=>nodes.map(n=>n.dataset.play));assert.equal(ids.length,20);
   for(const id of ids)await repeat(id);
   assert.equal(await page.locator('[data-check]:visible').count(),0);assert.equal(await page.locator('.key-panel:visible').count(),0);
   assert.doesNotMatch(await page.locator('#app').innerText(),/maximum two|máximo de dos|\/ 2 escuchas/i);await saved(page);
   await page.getByRole('button',{name:'Terminar intento y consultar correcciones',exact:true}).click();
   console.log('PASS All 20 MP3s repeat beyond two plays in mock '+mock+'; corrections stay hidden during attempt');
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'#session=W1D4');await page.locator('[data-play]').first().waitFor();
 const button=page.locator('[data-play]').first(),pause=page.locator('[data-pause-listening]').first();
 await button.click();await page.getByText('4 reproducciones',{exact:true}).waitFor();await pause.click();await page.waitForFunction(()=>window.__audios.at(-1).paused);
 const pausedAt=await page.evaluate(()=>window.__audios.at(-1).currentTime);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__audios.at(-1).currentTime),pausedAt);
 assert.equal(await pause.innerText(),'Reanudar');await pause.click();await page.waitForFunction(()=>!window.__audios.at(-1).paused);await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>window.__audios.at(-1).currentTime)>pausedAt);
 assert.equal(await page.getByText('4 reproducciones',{exact:true}).count(),1);await page.locator('[data-stop-audio]').first().click();await saved(page);await page.reload();await button.waitFor();assert.equal(await button.isEnabled(),true);assert.match(await page.locator('.audio-row').first().innerText(),/4 reproducciones/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.locator('.audio-panel').first().screenshot({path:path.join(root,'test-results/unlimited-listening-mobile.png')});
 assert.deepEqual(errors,[]);assert.equal(backend.providerCalls,0);console.log('PASS Mobile pause freezes time, resume continues without another count, reload preserves 4 plays and enabled button; zero AI calls');
}finally{await browser.close();await backend.close();await new Promise(resolve=>server.close(resolve));}
