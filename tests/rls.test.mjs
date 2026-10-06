import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
let db;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',T='33333333-3333-4333-8333-333333333333';
const q=(sql,args=[])=>db.query(sql,args);
async function as(user,fn){await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await fn();}finally{await db.exec('reset role');}}
const save=(kind,id,data,revision=0)=>q('select public.save_entity($1,$2,$3::jsonb,$4) as result',[kind,id,JSON.stringify(data),revision]).then(r=>r.rows[0].result);
before(async()=>{
  db=await PGlite.create();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
  `);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/001_mvp.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/002_content_refs.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/003_reading_lab.sql',import.meta.url),'utf8'));
  for(const [id,role]of [[A,'student'],[B,'student'],[T,'teacher']]){
    await q('insert into auth.users values($1,$2)',[id,role+'@example.invalid']);await q('insert into public.user_roles(user_id,role) values($1,$2)',[id,role]);await q('insert into public.profiles values($1,$2)',[id,role]);
  }
  await q('insert into public.teacher_students(teacher_id,student_id) values($1,$2)',[T,A]);
});
after(async()=>{await db?.close();});
test('Reading progress is private, revision checked and visible only to assigned teacher',async()=>{
 const value={part:2,attempts:1,correct:3,incorrect:2,errors:{reference:2},lastAt:Date.now()};
 await as(A,async()=>{assert.equal((await save('reading','RL-P2-01',value)).ok,true);await assert.rejects(()=>save('reading','RL-P2-02',{...value,correct:5}),/Invalid/);await assert.rejects(()=>save('reading','RL-P3-01',value),/Invalid/);const conflict=await save('reading','RL-P2-01',{...value,correct:4,incorrect:1,errors:{reference:1}},0);assert.equal(conflict.ok,false);});
 await as(B,async()=>{assert.equal((await q('select * from public.reading_progress where user_id=$1',[A])).rows.length,0);});
 await as(T,async()=>{assert.equal((await q('select public.learning_snapshot($1) as s',[A])).rows[0].s.reading[0].data.correct,3);await assert.rejects(()=>save('reading','RL-P2-01',value),/Forbidden/);await assert.rejects(()=>q('update public.reading_progress set data=$1::jsonb where user_id=$2',[JSON.stringify(value),A]),/permission denied/);});
 await db.exec('set role anon');try{await assert.rejects(()=>q('select * from public.reading_progress'),/permission denied/);}finally{await db.exec('reset role');}
});
test('Deployment SQL permission probe passes and rolls back all fixtures',async()=>{
  await db.exec(fs.readFileSync(new URL('../supabase/live_rls_check.sql',import.meta.url),'utf8'));
  assert.equal((await q("select count(*) as n from auth.users where id::text like '90%'")).rows[0].n,0);
});
test('Student A cannot read B through tables or snapshot RPC',async()=>{
  await as(B,()=>save('answer','W1D1-E02-Q01',{text:'Private B answer'}));
  await as(A,async()=>{assert.equal((await q('select * from public.answer_drafts where user_id=$1',[B])).rows.length,0);await assert.rejects(()=>q('select public.learning_snapshot($1)',[B]),/Forbidden/);});
});
test('Owner impersonation and role escalation are denied by database grants',async()=>{
  await as(A,async()=>{await assert.rejects(()=>q("insert into public.answer_drafts(user_id,id,data) values($1,'W1D1-E02-Q01','{}')",[B]),/permission denied/);await assert.rejects(()=>q("update public.user_roles set role='teacher' where user_id=$1",[A]),/permission denied/);await assert.rejects(()=>q('insert into public.teacher_students(teacher_id,student_id) values($1,$2)',[A,B]),/permission denied/);});
});
test('Teacher can read assigned student only and cannot write student progress',async()=>{
  await as(A,()=>save('answer','W1D1-E02-Q01',{text:'Student A draft'}));
  await as(T,async()=>{assert.equal((await q('select public.learning_snapshot($1) as s',[A])).rows[0].s.answer.length,1);assert.equal((await q('select * from public.answer_drafts where user_id=$1',[B])).rows.length,0);await assert.rejects(()=>q('select public.learning_snapshot($1)',[B]),/Forbidden/);await assert.rejects(()=>save('session','W1D1',{completed:true}),/Forbidden/);await assert.rejects(()=>q("update public.answer_drafts set data='{}' where user_id=$1",[A]),/permission denied/);});
});
test('Anonymous academic access and RPCs denied',async()=>{
  await db.exec('set role anon');try{await assert.rejects(()=>q('select * from public.answer_drafts'),/permission denied/);await assert.rejects(()=>q('select public.learning_snapshot()'),/permission denied/);}finally{await db.exec('reset role');}
});
test('Fake AI feedback from student browser denied',async()=>{await as(A,()=>assert.rejects(()=>q('insert into public.ai_feedback(id,user_id,exercise_id,kind,input,source_hash,model,feedback,provenance) values(gen_random_uuid(),$1,\'W1D1-E02-Q01\',\'writing\',\'{}\',$2,\'fake\',\'{}\',\'worker\')',[A,'a'.repeat(64)]),/permission denied/));});
test('Private audio readable by owner and assigned teacher; other student denied; replacement denied',async()=>{
  const id='44444444-4444-4444-8444-444444444444';let row;
  await as(A,async()=>{row=(await q('select * from public.reserve_recording($1,$2,$3,$4,$5,$6)',[id,'W1D3-E03-Q01','audio/webm','a'.repeat(64),30,1000])).rows[0];for(const path of [row.original_path,row.analysis_path])await q("insert into storage.objects(bucket_id,name) values('speaking',$1)",[path]);await q('select public.finish_recording($1)',[id]);assert.equal((await q('select * from storage.objects')).rows.length,2);assert.equal((await q("update storage.objects set name='changed' returning *")).rows.length,0);});
  await as(B,async()=>{assert.equal((await q('select * from storage.objects')).rows.length,0);await assert.rejects(()=>q("insert into storage.objects(bucket_id,name) values('speaking',$1)",[row.original_path+'other']),/row-level security/);});
  await as(T,async()=>{assert.equal((await q('select * from storage.objects')).rows.length,2);});
});
test('Teacher comment is visible to student and does not gate progress',async()=>{
  await as(T,()=>q('select public.add_teacher_review($1,$2,$3)',[A,'W1D1-E02-Q01','Optional comment <script>no HTML</script>']));
  await as(A,async()=>{assert.equal((await q('select * from public.teacher_reviews')).rows.length,1);assert.equal((await save('session','W1D1',{completed:true})).ok,true);});
  await as(T,()=>assert.rejects(()=>q('select public.add_teacher_review($1,$2,$3)',[B,'W1D1-E02-Q01','Forbidden']),/Forbidden/));
});
test('Revision conflict preserves both versions instead of silent overwrite',async()=>{
  await as(A,async()=>{const result=await save('answer','W1D1-E02-Q01',{text:'Device B new version'},1);assert.equal(result.ok,true);const conflict=await save('answer','W1D1-E02-Q01',{text:'Device A offline version'},1);assert.equal(conflict.ok,false);assert.equal(conflict.row.data.text,'Device B new version');assert.ok((await q('select * from public.entity_conflicts')).rows.some(r=>r.local_data.text==='Device A offline version'));});
});
test('Legacy import is idempotent, retains existing answers, keeps legacy dates out of activity',async()=>{
  await as(A,async()=>{const entities=[{kind:'answer',id:'W1D1-E02-Q01',data:{text:'Legacy conflicting draft'}},{kind:'session',id:'W2D1',data:{completed:true}}];const hash='b'.repeat(64);const params=[JSON.stringify(entities),'[]',hash];const first=(await q('select public.import_legacy($1::jsonb,$2::jsonb,$3) as r',params)).rows[0].r;assert.equal(first.added,1);assert.equal(first.conflictsPreserved,1);const second=(await q('select public.import_legacy($1::jsonb,$2::jsonb,$3) as r',params)).rows[0].r;assert.equal(second.alreadyImported,true);assert.equal((await q("select * from public.activity_events where entity_id='W2D1'")).rows.length,0);});
});
test('Unknown IDs, malformed state and teacher legacy imports rejected',async()=>{
  await as(A,async()=>{await assert.rejects(()=>save('answer','UNKNOWN',{text:'bad'}),/Unknown academic ID/);await assert.rejects(()=>save('listening','UNKNOWN',{plays:99}),/Unknown academic ID/);await assert.rejects(()=>save('session','W1D2',{completed:'true'}),/Invalid session/);});
  await as(T,()=>assert.rejects(()=>q("select public.import_legacy('[]','[]',$1)",['c'.repeat(64)]),/Forbidden/));
});
