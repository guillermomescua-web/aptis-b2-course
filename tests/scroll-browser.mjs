// Exercise the real background refresh without waiting 30 seconds per poll.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testBackend,A} from './browser-backend.mjs';
const root=path.resolve(import.meta.dirname,'..'),backend=await testBackend();
const server=http.createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,name==='/'?'index.html':name.slice(1));
  if(!file.startsWith(root+path.sep))throw Error();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];
await backend.attach(context,base);page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{const original=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>original(fn,ms===30000?600:ms,...args);});
let polls=0;page.on('request',r=>{if(r.url().endsWith('/rpc/learning_snapshot'))polls++;});
async function cycles(){const start=polls;await page.waitForFunction(()=>document.querySelector('#account-sync')?.textContent==='Guardado en servidor');while(polls<start+2)await page.waitForTimeout(100);await page.waitForTimeout(150);}
async function remember(){return page.evaluate(()=>{window.__screen=document.querySelector('#app').firstElementChild;window.scrollTo({top:700,behavior:'instant'});return scrollY;});}
async function unchanged(y){assert.equal(await page.evaluate(()=>document.querySelector('#app').firstElementChild===window.__screen),true);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<2);}
try{
  await page.goto(base+'auth.html');await page.locator('#login-form button:enabled').waitFor();
  await page.locator('[name=email]').first().fill('student@example.invalid');await page.locator('[name=password]').first().fill('Only-a-test-password-123');await page.locator('#login-form button').click();await page.locator('#account-panel .account-name').waitFor();
  for(const hash of ['#dashboard','#session=W1D4','#book=writing','#tracker','#reading-lab','#vocabulary-lab']){
    await page.goto(base+hash);await page.locator('#app h1').waitFor();await page.waitForTimeout(200);
    const y=await remember();await cycles();await unchanged(y);
    console.log('PASS Background polls preserve DOM and scroll on '+hash);
  }
  await page.goto(base+'#session=W1D1');await page.locator('[data-response="W1D1-E02-Q01"]').waitFor();
  const answer=page.locator('[data-response="W1D1-E02-Q01"]');await answer.fill('Writing stays focused during synchronization.');
  await answer.evaluate(el=>el.setSelectionRange(8,14));await cycles();
  assert.equal(await answer.inputValue(),'Writing stays focused during synchronization.');assert.deepEqual(await answer.evaluate(el=>[document.activeElement===el,el.selectionStart,el.selectionEnd]),[true,8,14]);
  console.log('PASS Writing draft, focus and selection survive background synchronization');
  await page.locator('#app h1').click();const y=await remember();
  await backend.as(A,()=>backend.db.query("select public.save_entity('answer','W1D1-E02-Q01',$1::jsonb,1)",[JSON.stringify({text:'An answer saved from the other device.'})]));
  await page.waitForFunction(()=>document.querySelector('[data-response="W1D1-E02-Q01"]')?.value==='An answer saved from the other device.');
  assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<2);console.log('PASS Actual remote changes appear without jumping to the top');
  await page.locator('a[href="#books"]').first().click();await page.locator('#app h1').waitFor();assert.equal(await page.evaluate(()=>scrollY),0);
  assert.deepEqual(errors,[]);assert.equal(backend.providerCalls,0);console.log('PASS Explicit navigation still starts at top; no exceptions or AI calls');
}finally{await browser.close();await backend.close();await new Promise(resolve=>server.close(resolve));}
