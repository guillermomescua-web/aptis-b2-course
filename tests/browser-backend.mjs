// Local PostgreSQL + HTTP test adapter. Not a production backend or a substitute for live Supabase validation.
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {handleRequest} from '../worker/src/index.js';
import {Quotas} from '../worker/src/quotas.js';
import {writing,speaking,memoryStorage} from './fixtures.mjs';
export const A='11111111-1111-4111-8111-111111111111',T='33333333-3333-4333-8333-333333333333';
const project='https://browser-test.supabase.co';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=id=>encode({alg:'ES256',typ:'JWT'})+'.'+encode({sub:id,iss:project+'/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test-signature';
const identity=(id,email)=>({id,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:new Date().toISOString(),email_confirmed_at:new Date().toISOString()});
export async function testBackend(){
  const db=await PGlite.create();const objects=new Map();let queue=Promise.resolve(),providerCalls=0,kind;
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;`);
  for(const name of ['001_mvp.sql','002_content_refs.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  for(const [id,role]of [[A,'student'],[T,'teacher']]){await db.query('insert into auth.users values($1,$2)',[id,role+'@example.invalid']);await db.query('insert into public.user_roles(user_id,role) values($1,$2)',[id,role]);await db.query('insert into public.profiles values($1,$2)',[id,role==='student'?'Alumna de prueba':'Profesor de prueba']);}
  await db.query('insert into public.teacher_students(teacher_id,student_id) values($1,$2)',[T,A]);
  const as=(id,fn)=>{const result=queue.then(async()=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await db.exec('reset role');}});queue=result.catch(()=>{});return result;};
  const idFor=request=>{try{return JSON.parse(Buffer.from((new Headers(request.headers).get('Authorization')||'').split(' ')[1].split('.')[1],'base64url')).sub;}catch{return null;}};
  async function api(url,args={}){
    const u=new URL(url),headers=new Headers(args.headers),id=idFor(args);let body=args.body;
    if(body instanceof Uint8Array&&headers.get('Content-Type')?.includes('json'))body=new TextDecoder().decode(body);
    if(typeof body==='string'&&headers.get('Content-Type')?.includes('json'))body=JSON.parse(body);
    if(u.pathname.startsWith('/auth/v1/')){
      if(u.pathname.endsWith('/token')){const who=body.email==='teacher@example.invalid'?T:A;return Response.json({access_token:jwt(who),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'test-refresh-'+who,user:identity(who,body.email)});}
      if(u.pathname.endsWith('/user'))return Response.json(identity(id,id===T?'teacher@example.invalid':'student@example.invalid'),{status:id?200:401});
      return Response.json({});
    }
    if(headers.get('apikey')==='sb_secret_test'&&u.pathname.endsWith('/ai_feedback')){
      const row=body;await queue;await db.query(`insert into public.ai_feedback(id,user_id,exercise_id,kind,input,source_hash,model,feedback,usage,recording_id,target,duration,provenance,created_at) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14) on conflict(id) do nothing`,[row.id,row.user_id,row.exercise_id,row.kind,JSON.stringify(row.input),row.source_hash,row.model,JSON.stringify(row.feedback),JSON.stringify(row.usage),row.recording_id,row.target,row.duration,row.provenance,row.created_at]);return new Response(null,{status:201});
    }
    if(!id&&u.pathname.includes('/object/sign/')&&(!args.method||args.method==='GET')){const path=u.pathname.split('/object/sign/speaking/')[1];const item=objects.get(path);return item?new Response(item.bytes,{headers:{'Content-Type':item.mime}}):new Response(null,{status:404});}
    if(!id)return Response.json({message:'Authentication required'},{status:401});
    try{return await as(id,async()=>{
      if(u.pathname.startsWith('/rest/v1/rpc/')){
        const name=u.pathname.split('/').at(-1);const signatures={learning_snapshot:['p_student:uuid'],save_entity:['p_kind:text','p_id:text','p_data:jsonb','p_expected:bigint'],reserve_recording:['p_id:uuid','p_exercise:text','p_mime:text','p_hash:text','p_duration:numeric','p_bytes:bigint'],finish_recording:['p_id:uuid'],add_teacher_review:['p_student:uuid','p_exercise:text','p_comment:text','p_feedback:uuid'],import_legacy:['p_entities:jsonb','p_feedback:jsonb','p_hash:text']};
        const fields=signatures[name];if(!fields)throw Error('Unknown RPC');const values=fields.map(f=>{const [key,type]=f.split(':');return type==='jsonb'?JSON.stringify(body[key]):body[key]??(name==='learning_snapshot'?id:null);});
        if(['reserve_recording','finish_recording','add_teacher_review'].includes(name)){const r=await db.query(`select * from public.${name}(${fields.map((f,i)=>`$${i+1}::${f.split(':')[1]}`).join(',')})`,values);return Response.json(r.rows);}
        const r=await db.query(`select public.${name}(${fields.map((f,i)=>`$${i+1}::${f.split(':')[1]}`).join(',')}) as value`,values);return Response.json(r.rows[0].value);
      }
      if(u.pathname.startsWith('/rest/v1/')){
        const table=u.pathname.split('/').at(-1);if(!['profiles','user_roles','teacher_students','ai_feedback','teacher_reviews','speaking_recordings','activity_events'].includes(table))throw Error('Invalid table');let where=[],params=[];
        for(const [key,val]of u.searchParams){if(val.startsWith('eq.')&&/^[a-z_]+$/.test(key)){params.push(val.slice(3)==='true'?true:val.slice(3)==='false'?false:val.slice(3));where.push(`${key}=$${params.length}`);}}
        const order=u.searchParams.get('order');let sql=`select * from public.${table}${where.length?' where '+where.join(' and '):''}`;
        if(order&&/^[a-z_]+\.(asc|desc)$/.test(order)){const [key,direction]=order.split('.');sql+=` order by ${key} ${direction}`;}
        const offset=Number(u.searchParams.get('offset')||0);sql+=' limit '+Math.min(Number(u.searchParams.get('limit')||1000),1000)+' offset '+Math.max(0,offset);const r=await db.query(sql,params);
        return Response.json(headers.get('Accept')?.includes('object+json')?r.rows[0]:r.rows);
      }
      if(u.pathname.startsWith('/storage/v1/object/sign/speaking/')){const path=decodeURIComponent(u.pathname.split('/speaking/')[1]);const r=await db.query("select name from storage.objects where bucket_id='speaking' and name=$1",[path]);if(!r.rows.length)return new Response(null,{status:403});return Response.json({signedURL:'/object/sign/speaking/'+path+'?token=local-test'});}
      if(u.pathname.startsWith('/storage/v1/object/authenticated/speaking/')){const path=decodeURIComponent(u.pathname.split('/speaking/')[1]);const r=await db.query("select name from storage.objects where bucket_id='speaking' and name=$1",[path]);const item=objects.get(path);return r.rows.length&&item?new Response(item.bytes,{headers:{'Content-Type':item.mime}}):new Response(null,{status:403});}
      if(u.pathname.startsWith('/storage/v1/object/speaking/')){
        const path=decodeURIComponent(u.pathname.split('/speaking/')[1]);if(objects.has(path))return Response.json({statusCode:'409',message:'already exists'},{status:409});
        const req=new Request(url,{method:'POST',headers,body:args.body});const form=await req.formData();const file=[...form.values()].find(v=>v instanceof Blob);await db.query("insert into storage.objects(bucket_id,name) values('speaking',$1)",[path]);objects.set(path,{bytes:await file.arrayBuffer(),mime:file.type});return Response.json({Key:'speaking/'+path,Id:crypto.randomUUID()});
      }
      throw Error('Unhandled API '+u.pathname);
    });}catch(error){console.log('LOCAL BACKEND ERROR',u.pathname,error.message);return Response.json({message:error.message,code:error.code||'ERROR'},{status:400});}
  }
  const env={ALLOWED_ORIGIN:'http://127.0.0.1',TURNSTILE_HOSTNAME:'127.0.0.1',OPENAI_API_KEY:'test-only',TURNSTILE_SECRET_KEY:'test-only',RATE_LIMIT_SALT:'test-only',SUPABASE_URL:project,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'};
  const quotas=new Quotas({storage:memoryStorage()},env);env.QUOTAS={idFromName:x=>x,get:()=>({fetch:(url,args)=>quotas.fetch(new Request(url,args))})};
  async function workerFetch(url,args){if(url.startsWith(project))return api(url,args);if(url.includes('siteverify'))return Response.json({success:true,hostname:'127.0.0.1',action:'aptis_'+kind});if(url.includes('openai')){providerCalls++;return url.endsWith('responses')?Response.json({status:'completed',model:'gpt-6-luna',output:[{content:[{type:'output_text',text:JSON.stringify(writing)}]}]}):Response.json({model:'gpt-audio-1.5',choices:[{finish_reason:'stop',message:{content:JSON.stringify(speaking)}}]});}throw Error('Unexpected fetch');}
  return {db,project,objects,get providerCalls(){return providerCalls;},as,
    async attach(context,base){
      env.ALLOWED_ORIGIN=new URL(base).origin;
      await context.route('**/data/account-config.json',r=>r.fulfill({json:{enabled:true,supabaseUrl:project,supabasePublishableKey:'sb_publishable_test',authRedirectUrl:base+'auth.html',workerUrl:'https://worker.test'}}));
      await context.route('**/data/ai-config.json',r=>r.fulfill({json:{schemaVersion:1,enabled:true,workerUrl:'https://worker.test',turnstileSiteKey:'test-key',requestTimeoutMs:10000}}));
      await context.route('https://challenges.cloudflare.com/**',r=>r.fulfill({contentType:'application/javascript',body:"window.turnstile={render:(el,opts)=>{setTimeout(()=>opts.callback('test-token-long-enough'),10);return 1},remove:()=>{}};"}));
      await context.route(project+'/**',async route=>{const r=route.request();const result=await api(r.url(),{method:r.method(),headers:r.headers(),body:r.postDataBuffer()});await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});});
      await context.route('https://worker.test/**',async route=>{const r=route.request();kind=r.url().includes('speaking')?'speaking':'writing';const headers=new Headers(r.headers());headers.set('Origin',env.ALLOWED_ORIGIN);headers.set('CF-Connecting-IP','192.0.2.1');const result=await handleRequest(new Request(r.url(),{method:r.method(),headers,body:r.postDataBuffer()}),env,workerFetch);await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});});
    },close:()=>db.close()};
}
