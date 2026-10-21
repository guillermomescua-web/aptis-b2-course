-- Unlimited playback: preserve every historical row and all existing access rules.
begin;
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
  if p_kind='listening' then
    if jsonb_typeof(p_data->'plays') is distinct from 'number' or coalesce(p_data->>'plays','') !~ '^(0|[1-9][0-9]{0,15})$' or p_data - 'plays'<>'{}'::jsonb then raise exception 'Invalid play count'; end if;
    if (p_data->>'plays')::numeric>9007199254740991 then raise exception 'Invalid play count'; end if;
  end if;
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
commit;
