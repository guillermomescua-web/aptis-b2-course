import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../worker/src/index.js';
import {Quotas} from '../worker/src/quotas.js';
import {encodeWav} from '../src/ai-audio.js';
import {sha} from '../worker/src/v2-handler.js';
import {writing,speaking,memoryStorage} from './fixtures.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const b64=data=>Buffer.from(data).toString('base64url');
async function token(claims={},forged=false){const header=b64(JSON.stringify({alg:'ES256',typ:'JWT'}));const payload=b64(JSON.stringify({sub:A,iss:'https://testproject.supabase.co/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+300,...claims}));const bytes=new TextEncoder().encode(header+'.'+payload);let signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,bytes);if(forged)signature=new Uint8Array(64);return header+'.'+payload+'.'+b64(signature);}
function setup(options={}){
  const storage=memoryStorage();const env={ALLOWED_ORIGIN:'https://guillermomescua-web.github.io',TURNSTILE_HOSTNAME:'guillermomescua-web.github.io',OPENAI_API_KEY:'test-only',TURNSTILE_SECRET_KEY:'test-only',RATE_LIMIT_SALT:'test-only',SUPABASE_URL:'https://testproject.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test',...options.env};
  const quotas=new Quotas({storage},env);env.QUOTAS={idFromName:x=>x,get:()=>({fetch:(url,args)=>quotas.fetch(new Request(url,args))})};const calls=[],saved=[];
  const fetcher=async(url,args={})=>{
    calls.push(url);
    if(url.endsWith('/auth/v1/user')){const t=args.headers.Authorization.slice(7).split('.');const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,Buffer.from(t[2],'base64url'),new TextEncoder().encode(t[0]+'.'+t[1]));return Response.json(valid?{id:A}:{},{status:valid?200:401});}
    if(url.includes('/user_roles?'))return Response.json([{role:options.role||'student',active:options.active!==false}]);
    if(url.includes('/speaking_recordings?'))return Response.json(options.recording?[options.recording]:[]);
    if(url.includes('/storage/v1/object/'))return new Response(options.wav,{headers:{'Content-Type':'audio/wav'}});
    if(url.includes('/ai_feedback?')){if(options.failSave?.())return new Response('database offline',{status:503});saved.push(JSON.parse(args.body));return new Response(null,{status:201});}
    if(url.includes('siteverify'))return Response.json({success:true,hostname:env.TURNSTILE_HOSTNAME,action:options.kind==='speaking'?'aptis_speaking':'aptis_writing'});
    if(url.includes('openai'))return url.endsWith('responses')?Response.json({status:'completed',model:'gpt-6-luna',output:[{content:[{type:'output_text',text:JSON.stringify(writing)}]}]}):Response.json({model:'gpt-audio-1.5',choices:[{finish_reason:'stop',message:{content:JSON.stringify(speaking)}}]});
    throw Error('Unexpected URL '+url);
  };
  const send=async({jwt,body,path}={})=>handleRequest(new Request('https://worker.test'+(path||`/api/v2/${options.kind||'writing'}-feedback`),{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{})},body:JSON.stringify(body||{exerciseId:'W1D1-E02-Q01',answer:'I can help on Saturday mornings because I am free then.',turnstileToken:'test-token-long-enough',requestId:crypto.randomUUID()})}),env,fetcher);
  return {env,calls,saved,send};
}
test('Anonymous calls rejected on old and v2 endpoints without OpenAI',async()=>{for(const path of ['/api/writing-feedback','/api/speaking-feedback','/api/v2/writing-feedback','/api/v2/speaking-feedback']){const t=setup();assert.equal((await t.send({path})).status,401);assert.equal(t.calls.length,0);}});
test('Forged signature, expiry, issuer and audience rejected',async()=>{for(const jwt of [await token({},true),await token({exp:1}),await token({iss:'https://evil.test'}),await token({aud:'other'})]){const t=setup();assert.equal((await t.send({jwt})).status,401);assert.ok(!t.calls.some(x=>x.includes('openai')));}});
test('Teacher, inactive and unassigned roles cannot spend credits',async()=>{for(const options of [{role:'teacher'},{role:'other'},{active:false}]){const t=setup(options);assert.equal((await t.send({jwt:await token()})).status,403);assert.ok(!t.calls.some(x=>x.includes('openai')));}});
test('Verified student persists exact input; client userId ignored; repeated request returns same correction',async()=>{
  const t=setup();const jwt=await token(),body={exerciseId:'W1D1-E02-Q01',answer:'I can help on Saturday mornings.',turnstileToken:'test-token-long-enough',requestId:crypto.randomUUID(),userId:B};
  const first=await t.send({jwt,body});assert.equal(first.status,200);const data=await first.json();assert.equal(t.saved[0].user_id,A);assert.equal(t.saved[0].input.answer,body.answer);assert.equal(t.saved[0].model,'gpt-6-luna');assert.equal(t.saved[0].source_hash,await sha(body.answer));
  const repeat=await t.send({jwt,body});assert.equal((await repeat.json()).id,data.id);assert.equal(t.calls.filter(x=>x.includes('openai')).length,1);
  assert.equal((await t.send({jwt,body:{...body,answer:'Changed input'}})).status,409);
});
test('Feedback database failure retains result; retry makes zero additional provider calls',async()=>{
  let fail=true;const t=setup({failSave:()=>fail}),jwt=await token(),body={exerciseId:'W1D1-E02-Q01',answer:'I am free on Saturday.',turnstileToken:'test-token-long-enough',requestId:crypto.randomUUID()};
  assert.equal((await t.send({jwt,body})).status,503);fail=false;assert.equal((await t.send({jwt,body})).status,200);assert.equal(t.calls.filter(x=>x.includes('openai')).length,1);
});
test('Private Speaking analyzes stored PCM and binds feedback to exact recording and WAV hash',async()=>{
  const samples=new Float32Array(24000);for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i/12)*.25;
  const wav=new Uint8Array(await encodeWav(samples,24000).arrayBuffer()),id=crypto.randomUUID();const recording={id,user_id:A,exercise_id:'W1D3-E03-Q01',status:'ready',duration:1,original_hash:'a'.repeat(64),original_path:`${A}/${id}/source.webm`,analysis_path:`${A}/${id}/analysis.wav`};
  const t=setup({kind:'speaking',recording,wav});const result=await t.send({jwt:await token(),body:{exerciseId:recording.exercise_id,recordingId:id,target:'1',requestId:crypto.randomUUID(),turnstileToken:'test-token-long-enough'}});assert.equal(result.status,200);assert.equal(t.saved[0].recording_id,id);assert.equal(t.saved[0].input.analysisHash,await sha(wav));assert.equal(t.saved[0].model,'gpt-audio-1.5');
});
test('Speaking of another owner is denied before model call',async()=>{const id=crypto.randomUUID();const t=setup({kind:'speaking',recording:{id,user_id:B}});assert.equal((await t.send({jwt:await token(),body:{exerciseId:'W1D3-E03-Q01',recordingId:id,requestId:crypto.randomUUID()}})).status,403);assert.ok(!t.calls.some(x=>x.includes('openai')));});
test('Per-user writing cap and auth CORS enforced',async()=>{
  const t=setup({env:{DAILY_USER_WRITING_LIMIT:'1'}}),jwt=await token();assert.equal((await t.send({jwt})).status,200);assert.equal((await t.send({jwt})).status,429);
  const preflight=await handleRequest(new Request('https://worker.test/api/v2/writing-feedback',{method:'OPTIONS',headers:{Origin:t.env.ALLOWED_ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}),t.env);assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);
});
