-- Additive v2.1 migration. Keeps all historical course rows and access rules.
begin;
create table public.reading_progress(user_id uuid not null references auth.users(id),id text not null check(length(id) between 1 and 600),data jsonb,revision bigint not null default 1,deleted boolean not null default false,imported boolean not null default false,updated_at timestamptz not null default now(),primary key(user_id,id));
alter table public.reading_progress enable row level security;
create policy read_assigned on public.reading_progress for select to authenticated using(private.can_read(user_id));
revoke all on public.reading_progress from public,anon,authenticated;
grant select on public.reading_progress to authenticated;
insert into public.content_refs(kind,id) values
('reading','RL-P2-01'),
('reading','RL-P2-02'),
('reading','RL-P2-03'),
('reading','RL-P2-04'),
('reading','RL-P2-05'),
('reading','RL-P2-06'),
('reading','RL-P2-07'),
('reading','RL-P2-08'),
('reading','RL-P2-09'),
('reading','RL-P2-10'),
('reading','RL-P2-11'),
('reading','RL-P2-12'),
('reading','RL-P2-13'),
('reading','RL-P2-14'),
('reading','RL-P2-15'),
('reading','RL-P2-16'),
('reading','RL-P3-01'),
('reading','RL-P3-02'),
('reading','RL-P3-03'),
('reading','RL-P3-04'),
('reading','RL-P3-05'),
('reading','RL-P3-06'),
('reading','RL-P3-07'),
('reading','RL-P3-08'),
('reading','RL-P3-09'),
('reading','RL-P3-10')
on conflict do nothing;
create or replace function private.entity_table(p_kind text) returns text language sql immutable set search_path='' as $$
  select case p_kind when 'answer' then 'answer_drafts' when 'session' then 'session_progress' when 'exercise' then 'exercise_progress'
    when 'listening' then 'listening_progress' when 'error' then 'error_entries' when 'vocabulary' then 'vocabulary_progress' when 'reading' then 'reading_progress' end;
$$;
create or replace function private.validate_entity(p_kind text,p_id text,p_data jsonb) returns void language plpgsql set search_path='' as $$
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
  if p_kind='reading' then
    if p_data - array['part','attempts','correct','incorrect','errors','lastAt'] <> '{}'::jsonb or jsonb_typeof(p_data->'errors') is distinct from 'object' then raise exception 'Invalid reading data'; end if;
    if coalesce(p_data->>'part','') not in ('2','3') or p_id not like 'RL-P'||(p_data->>'part')||'-%' then raise exception 'Invalid reading part'; end if;
    if coalesce(p_data->>'attempts','') !~ '^[0-9]{1,7}$' or coalesce(p_data->>'correct','') !~ '^[0-9]{1,8}$' or coalesce(p_data->>'incorrect','') !~ '^[0-9]{1,8}$' or coalesce(p_data->>'lastAt','') !~ '^[0-9]{1,16}$' then raise exception 'Invalid reading counts'; end if;
    if (p_data->>'correct')::bigint+(p_data->>'incorrect')::bigint <> (p_data->>'attempts')::bigint * (case when p_data->>'part'='2' then 5 else 7 end) then raise exception 'Invalid reading total'; end if;
    if exists(select 1 from jsonb_each(p_data->'errors') e where e.key not in ('cohesion','reference','chronology','opinion','inference','qualification') or jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]{1,8}$') then raise exception 'Invalid reading errors'; end if;
    if (select coalesce(sum(value::text::bigint),0) from jsonb_each(p_data->'errors')) <> (p_data->>'incorrect')::bigint then raise exception 'Invalid reading error total'; end if;
  end if;
end $$;
create or replace function public.learning_snapshot(p_student uuid default auth.uid()) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t text; k text; result jsonb:='{}'; items jsonb;
begin
  if not private.can_read(p_student) then raise exception 'Forbidden' using errcode='42501'; end if;
  foreach k in array array['answer','session','exercise','listening','error','vocabulary','reading'] loop
    t:=private.entity_table(k);
    execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where user_id=$1',t) into items using p_student;
    result:=result||jsonb_build_object(k,items);
  end loop;
  return result;
end $$;
revoke all on function public.learning_snapshot(uuid) from public,anon;
grant execute on function public.learning_snapshot(uuid) to authenticated;
commit;
