-- APTIS v2 MVP. Apply once, before 002_content_refs.sql. No academic content is edited.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id), display_name text not null check(length(display_name) between 1 and 100)
);
create table public.user_roles (
  user_id uuid primary key references auth.users(id), role text not null check(role in ('student','teacher')), active boolean not null default true
);
create table public.teacher_students (
  teacher_id uuid references auth.users(id), student_id uuid references auth.users(id), active boolean not null default true,
  created_at timestamptz not null default now(), primary key(teacher_id,student_id), check(teacher_id <> student_id)
);
create table public.content_refs (kind text not null, id text not null, primary key(kind,id));
create function private.has_role(p_role text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role=p_role and active);
$$;
create function private.can_read(p_student uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (p_student=auth.uid() and private.has_role('student')) or
    (private.has_role('teacher') and exists(select 1 from public.teacher_students t join public.user_roles r on r.user_id=t.student_id
      where t.teacher_id=auth.uid() and t.student_id=p_student and t.active and r.active and r.role='student'));
$$;
revoke all on function private.has_role(text), private.can_read(uuid) from public;
grant execute on function private.has_role(text), private.can_read(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.teacher_students enable row level security;
alter table public.content_refs enable row level security;
create policy profile_read on public.profiles for select to authenticated using (user_id=auth.uid() or private.can_read(user_id));
create policy role_read on public.user_roles for select to authenticated using(user_id=auth.uid());
create policy assignment_read on public.teacher_students for select to authenticated using(teacher_id=auth.uid() and private.has_role('teacher'));
create policy catalog_read on public.content_refs for select to authenticated using(private.has_role('student') or private.has_role('teacher'));
grant select on public.profiles,public.user_roles,public.teacher_students,public.content_refs to authenticated;
revoke insert,update,delete on public.profiles,public.user_roles,public.teacher_students,public.content_refs from anon,authenticated;

-- The six state tables share one small, versioned write protocol.
do $$ declare n text; begin
  foreach n in array array['answer_drafts','session_progress','exercise_progress','listening_progress','error_entries','vocabulary_progress'] loop
    execute format('create table public.%I(user_id uuid not null references auth.users(id), id text not null check(length(id) between 1 and 600), data jsonb, revision bigint not null default 1, deleted boolean not null default false, imported boolean not null default false, updated_at timestamptz not null default now(), primary key(user_id,id))',n);
    execute format('alter table public.%I enable row level security',n);
    execute format('create policy read_assigned on public.%I for select to authenticated using(private.can_read(user_id))',n);
    execute format('grant select on public.%I to authenticated',n);
    execute format('revoke insert,update,delete on public.%I from anon,authenticated',n);
  end loop;
end $$;
create table public.entity_conflicts (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),kind text not null,entity_id text not null,
  local_data jsonb,server_data jsonb,created_at timestamptz not null default now()
);
create table public.activity_events (
  id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),kind text not null,entity_id text not null,
  created_at timestamptz not null default now()
);
create index activity_owner_date on public.activity_events(user_id,created_at desc);
create table public.speaking_recordings (
  id uuid primary key,user_id uuid not null references auth.users(id),exercise_id text not null,
  original_path text not null unique,analysis_path text not null unique,mime text not null,
  original_hash text not null check(original_hash ~ '^[a-f0-9]{64}$'),duration numeric not null check(duration > 0 and duration <= 186),
  bytes bigint not null check(bytes between 1 and 17825792),status text not null default 'pending' check(status in ('pending','ready')),
  created_at timestamptz not null default now()
);
create table public.ai_feedback (
  id uuid primary key,user_id uuid not null references auth.users(id),exercise_id text not null,kind text not null check(kind in ('writing','speaking')),
  input jsonb not null,source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),model text not null,
  feedback jsonb not null,usage jsonb,recording_id uuid references public.speaking_recordings(id),
  target text not null default 'all' check(target in ('all','1','2','3')),duration numeric,
  provenance text not null check(provenance in ('worker','legacy_import')),created_at timestamptz not null default now()
);
create index feedback_owner_date on public.ai_feedback(user_id,created_at desc);
create function private.feedback_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.provenance='worker' then insert into public.activity_events(user_id,kind,entity_id) values(new.user_id,new.kind||'_feedback',new.exercise_id); end if;
  return new;
end $$;
create trigger feedback_activity after insert on public.ai_feedback for each row execute function private.feedback_activity();
create table public.teacher_reviews (
  id uuid primary key default gen_random_uuid(),teacher_id uuid not null default auth.uid() references auth.users(id),
  student_id uuid not null references auth.users(id),exercise_id text not null,feedback_id uuid references public.ai_feedback(id),
  comment text not null check(length(comment) between 1 and 5000),created_at timestamptz not null default now()
);
create table public.migration_imports (
  user_id uuid not null references auth.users(id),package_hash text not null,report jsonb not null,
  created_at timestamptz not null default now(),primary key(user_id,package_hash)
);
do $$ declare n text; begin
  foreach n in array array['entity_conflicts','activity_events','speaking_recordings','ai_feedback','teacher_reviews','migration_imports'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('grant select on public.%I to authenticated',n);
    execute format('revoke insert,update,delete on public.%I from anon,authenticated',n);
  end loop;
end $$;
create policy conflicts_read on public.entity_conflicts for select to authenticated using(user_id=auth.uid() and private.has_role('student'));
create policy activity_read on public.activity_events for select to authenticated using(private.can_read(user_id));
create policy recordings_read on public.speaking_recordings for select to authenticated using(private.can_read(user_id));
create policy feedback_read on public.ai_feedback for select to authenticated using(private.can_read(user_id));
create policy reviews_read on public.teacher_reviews for select to authenticated using(private.can_read(student_id));
create policy imports_read on public.migration_imports for select to authenticated using(user_id=auth.uid() and private.has_role('student'));

create function private.entity_table(p_kind text) returns text language sql immutable set search_path='' as $$
  select case p_kind when 'answer' then 'answer_drafts' when 'session' then 'session_progress' when 'exercise' then 'exercise_progress'
    when 'listening' then 'listening_progress' when 'error' then 'error_entries' when 'vocabulary' then 'vocabulary_progress' end;
$$;
create function private.validate_entity(p_kind text,p_id text,p_data jsonb) returns void language plpgsql set search_path='' as $$
begin
  if private.entity_table(p_kind) is null or length(p_id) not between 1 and 600 then raise exception 'Invalid entity'; end if;
  if p_kind not in ('error','vocabulary') and not exists(select 1 from public.content_refs where kind=p_kind and id=p_id) then raise exception 'Unknown academic ID'; end if;
  if p_kind='vocabulary' and not exists(select 1 from public.content_refs where kind='vocabulary' and id=p_id) and p_id !~ '^VOC-PER-[A-Za-z0-9_.~-]+$' then raise exception 'Unknown vocabulary ID'; end if;
  if p_data is null or p_data='null'::jsonb then return; end if;
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>60000 then raise exception 'Invalid data'; end if;
  if p_kind='answer' and (jsonb_typeof(p_data->'text') is distinct from 'string' or length(p_data->>'text')>20000 or p_data - 'text'<>'{}'::jsonb) then raise exception 'Invalid answer'; end if;
  if p_kind='session' and (jsonb_typeof(p_data->'completed') is distinct from 'boolean' or p_data - 'completed'<>'{}'::jsonb) then raise exception 'Invalid session'; end if;
  if p_kind='exercise' and (jsonb_typeof(p_data->'checked') is distinct from 'boolean' or p_data - 'checked'<>'{}'::jsonb) then raise exception 'Invalid exercise'; end if;
  if p_kind='listening' and (coalesce(p_data->>'plays','') !~ '^[0-2]$' or p_data - 'plays'<>'{}'::jsonb) then raise exception 'Invalid play count'; end if;
  if p_kind='error' and (jsonb_typeof(p_data->'error') is distinct from 'string' or jsonb_typeof(p_data->'correction') is distinct from 'string'
     or jsonb_typeof(p_data->'resolved') is distinct from 'boolean' or length(p_data->>'error')>20000 or length(p_data->>'correction')>20000
     or length(coalesce(p_data->>'category','')) not between 1 and 100 or length(coalesce(p_data->>'id','')) not between 1 and 100
     or length(coalesce(p_data->>'date',''))>100 or p_data->>'key' is distinct from p_id) then raise exception 'Invalid tracker entry'; end if;
  if p_kind='vocabulary' and (coalesce(p_data->>'status','') not in ('New','Learning','Review','Mastered')
     or coalesce(p_data->>'repetitions','') !~ '^[0-9]{1,7}$' or coalesce(p_data->>'lapses','') !~ '^[0-9]{1,7}$'
     or coalesce(p_data->>'dueAt','') !~ '^[0-9]{1,16}$'
     or (p_data ? 'mistakes' and p_data->>'mistakes' !~ '^[0-9]{1,7}$')
     or (p_data->'lastCorrect'<>'null'::jsonb and jsonb_typeof(p_data->'lastCorrect') is distinct from 'boolean')) then raise exception 'Invalid vocabulary'; end if;
end $$;

create function public.save_entity(p_kind text,p_id text,p_data jsonb,p_expected bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text:=private.entity_table(p_kind); r jsonb; old_data jsonb; rev bigint; clean jsonb:=nullif(p_data,'null'::jsonb);
begin
  if auth.uid() is null or not private.has_role('student') then raise exception 'Forbidden' using errcode='42501'; end if;
  perform private.validate_entity(p_kind,p_id,clean);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_kind||p_id,0));
  execute format('select to_jsonb(x),revision,data from public.%I x where user_id=$1 and id=$2',t) into r,rev,old_data using auth.uid(),p_id;
  if coalesce(rev,0)<>p_expected then
    if old_data is not distinct from clean then return jsonb_build_object('ok',true,'row',r); end if;
    insert into public.entity_conflicts(user_id,kind,entity_id,local_data,server_data) values(auth.uid(),p_kind,p_id,clean,old_data);
    return jsonb_build_object('ok',false,'row',r);
  end if;
  execute format('insert into public.%I as x(user_id,id,data,deleted) values($1,$2,$3,$3 is null) on conflict(user_id,id) do update set data=excluded.data,deleted=excluded.deleted,revision=x.revision+1,updated_at=now(),imported=false returning to_jsonb(x)',t)
    into r using auth.uid(),p_id,clean;
  if p_kind<>'answer' or coalesce(rev,0)=0 then insert into public.activity_events(user_id,kind,entity_id) values(auth.uid(),p_kind,p_id); end if;
  return jsonb_build_object('ok',true,'row',r);
end $$;

create function public.learning_snapshot(p_student uuid default auth.uid()) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t text; k text; result jsonb:='{}'; items jsonb;
begin
  if not private.can_read(p_student) then raise exception 'Forbidden' using errcode='42501'; end if;
  foreach k in array array['answer','session','exercise','listening','error','vocabulary'] loop
    t:=private.entity_table(k);
    execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where user_id=$1',t) into items using p_student;
    result:=result||jsonb_build_object(k,items);
  end loop;
  return result;
end $$;
grant execute on function private.entity_table(text) to authenticated;

create function public.reserve_recording(p_id uuid,p_exercise text,p_mime text,p_hash text,p_duration numeric,p_bytes bigint) returns public.speaking_recordings
language plpgsql security definer set search_path='' as $$
declare r public.speaking_recordings; ext text;
begin
  if not private.has_role('student') then raise exception 'Forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.content_refs where kind='speaking' and id=p_exercise) then raise exception 'Unknown Speaking ID'; end if;
  ext:=case split_part(p_mime,';',1) when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/mp4' then 'mp4' when 'audio/wav' then 'wav' end;
  if ext is null or length(p_mime)>100 then raise exception 'Invalid audio type'; end if;
  insert into public.speaking_recordings(id,user_id,exercise_id,original_path,analysis_path,mime,original_hash,duration,bytes)
    values(p_id,auth.uid(),p_exercise,auth.uid()::text||'/'||p_id::text||'/source.'||ext,auth.uid()::text||'/'||p_id::text||'/analysis.wav',p_mime,p_hash,p_duration,p_bytes)
    on conflict(id) do nothing;
  select * into r from public.speaking_recordings where id=p_id and user_id=auth.uid();
  if r.id is null or r.exercise_id<>p_exercise or r.original_hash<>p_hash then raise exception 'Recording conflict'; end if;
  return r;
end $$;
create function public.finish_recording(p_id uuid) returns public.speaking_recordings language plpgsql security definer set search_path='' as $$
declare r public.speaking_recordings;
begin
  if not private.has_role('student') then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into r from public.speaking_recordings where id=p_id and user_id=auth.uid() for update;
  if r.id is null or not exists(select 1 from storage.objects where bucket_id='speaking' and name=r.original_path)
    or not exists(select 1 from storage.objects where bucket_id='speaking' and name=r.analysis_path) then raise exception 'Upload not confirmed'; end if;
  if r.status<>'ready' then
    update public.speaking_recordings set status='ready' where id=p_id returning * into r;
    insert into public.activity_events(user_id,kind,entity_id) values(auth.uid(),'speaking',r.exercise_id);
  end if;
  return r;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('speaking','speaking',false,17825792,array['audio/webm','audio/ogg','audio/mp4','audio/wav']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy speaking_upload on storage.objects for insert to authenticated with check (
  bucket_id='speaking' and private.has_role('student') and exists(select 1 from public.speaking_recordings r where r.user_id=auth.uid() and r.status='pending' and (name=r.original_path or name=r.analysis_path))
);
create policy speaking_private_read on storage.objects for select to authenticated using(
  bucket_id='speaking' and exists(select 1 from public.speaking_recordings r where private.can_read(r.user_id) and (name=r.original_path or name=r.analysis_path))
);
-- No UPDATE or DELETE policy: an audio already linked to feedback cannot be replaced.

create function public.add_teacher_review(p_student uuid,p_exercise text,p_comment text,p_feedback uuid default null) returns public.teacher_reviews
language plpgsql security definer set search_path='' as $$
declare r public.teacher_reviews;
begin
  if not private.has_role('teacher') or not private.can_read(p_student) then raise exception 'Forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.content_refs where id=p_exercise and kind in ('writing','speaking')) then raise exception 'Invalid exercise'; end if;
  if p_feedback is not null and not exists(select 1 from public.ai_feedback where id=p_feedback and user_id=p_student and exercise_id=p_exercise) then raise exception 'Invalid feedback'; end if;
  insert into public.teacher_reviews(teacher_id,student_id,exercise_id,comment,feedback_id) values(auth.uid(),p_student,p_exercise,p_comment,p_feedback) returning * into r;
  return r;
end $$;

create function public.import_legacy(p_entities jsonb,p_feedback jsonb,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; t text; r jsonb; existing_data jsonb; report jsonb; count_in integer:=0; count_added integer:=0; count_retained integer:=0; count_feedback integer:=0;
begin
  if not private.has_role('student') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_entities)<>'array' or jsonb_typeof(p_feedback)<>'array'
    or jsonb_array_length(p_entities)>10000 or jsonb_array_length(p_feedback)>200 or octet_length(p_entities::text)+octet_length(p_feedback::text)>10485760 then raise exception 'Invalid import'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'import',0));
  -- Canonical server fingerprint: callers cannot defeat idempotency by changing the supplied hash.
  p_hash:=encode(sha256(convert_to(p_entities::text||p_feedback::text,'UTF8')),'hex');
  select x.report into report from public.migration_imports x where user_id=auth.uid() and package_hash=p_hash;
  if report is not null then return report||jsonb_build_object('alreadyImported',true); end if;
  for item in select value from jsonb_array_elements(p_entities) loop
    perform private.validate_entity(item->>'kind',item->>'id',item->'data');
    t:=private.entity_table(item->>'kind'); count_in:=count_in+1;
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||(item->>'kind')||(item->>'id'),0));
    execute format('select to_jsonb(x),data from public.%I x where user_id=$1 and id=$2',t) into r,existing_data using auth.uid(),item->>'id';
    if r is null then
      execute format('insert into public.%I(user_id,id,data,imported) values($1,$2,$3,true)',t) using auth.uid(),item->>'id',item->'data'; count_added:=count_added+1;
    elsif existing_data is distinct from item->'data' then
      insert into public.entity_conflicts(user_id,kind,entity_id,local_data,server_data) values(auth.uid(),item->>'kind',item->>'id',item->'data',existing_data); count_retained:=count_retained+1;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_feedback) loop
    if not exists(select 1 from public.content_refs where kind=item->>'kind' and id=item->>'exerciseId') or item->>'sourceHash' !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(item->'feedback')<>'object' or octet_length(item::text)>60000 then raise exception 'Invalid legacy feedback'; end if;
    if not exists(select 1 from public.ai_feedback where user_id=auth.uid() and exercise_id=item->>'exerciseId' and source_hash=item->>'sourceHash' and provenance='legacy_import') then
      insert into public.ai_feedback(id,user_id,exercise_id,kind,input,source_hash,model,feedback,target,duration,provenance,created_at)
      values(gen_random_uuid(),auth.uid(),item->>'exerciseId',item->>'kind',jsonb_build_object('legacy',true),item->>'sourceHash',left(coalesce(item->>'model','legacy'),120),item->'feedback',coalesce(item->>'target','all'),(item->>'duration')::numeric,'legacy_import',(item->>'timestamp')::timestamptz);
      count_feedback:=count_feedback+1;
    end if;
  end loop;
  report:=jsonb_build_object('incoming',count_in,'added',count_added,'conflictsPreserved',count_retained,'feedbackAdded',count_feedback,'alreadyImported',false);
  insert into public.migration_imports(user_id,package_hash,report) values(auth.uid(),p_hash,report);
  return report;
end $$;

-- Every exposed RPC defaults to denied for anonymous callers.
revoke all on function public.save_entity(text,text,jsonb,bigint),public.learning_snapshot(uuid),public.reserve_recording(uuid,text,text,text,numeric,bigint),public.finish_recording(uuid),public.add_teacher_review(uuid,text,text,uuid),public.import_legacy(jsonb,jsonb,text) from public,anon;
grant execute on function public.save_entity(text,text,jsonb,bigint),public.learning_snapshot(uuid),public.reserve_recording(uuid,text,text,text,numeric,bigint),public.finish_recording(uuid),public.add_teacher_review(uuid,text,text,uuid),public.import_legacy(jsonb,jsonb,text) to authenticated;
revoke all on function private.entity_table(text),private.validate_entity(text,text,jsonb) from public;
grant execute on function private.entity_table(text) to authenticated;
-- Override Supabase default grants; direct client writes always go through guarded RPCs.
do $$ declare n text; begin
  foreach n in array array['profiles','user_roles','teacher_students','content_refs','answer_drafts','session_progress','exercise_progress','listening_progress','error_entries','vocabulary_progress','entity_conflicts','activity_events','speaking_recordings','ai_feedback','teacher_reviews','migration_imports'] loop
    execute format('revoke all on public.%I from anon,authenticated',n);
    execute format('grant select on public.%I to authenticated',n);
  end loop;
end $$;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
commit;
