import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);const read=n=>fs.readFileSync(new URL(n,root),'utf8').replace(/\r\n/g,'\n');const write=(n,s)=>fs.writeFileSync(new URL(n,root),s);
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('Missing edit anchor: '+a.slice(0,70));return s.replace(a,()=>b);};
const original=read('supabase/migrations/001_mvp.sql');
const take=name=>{const start=original.indexOf('create function '+name+'(');const end=original.indexOf('end $$;',start);if(name==='private.entity_table'){const stop=original.indexOf('$$;',start);return original.slice(start,stop+3);}return original.slice(start,end+7);};
const tableFn=take('private.entity_table').replace('create function','create or replace function').replace("when 'vocabulary' then 'vocabulary_progress' end","when 'vocabulary' then 'vocabulary_progress' when 'reading' then 'reading_progress' end");
let validate=take('private.validate_entity').replace('create function','create or replace function');
validate=replace(validate,'end $$;',`  if p_kind='reading' then
    if p_data - array['part','attempts','correct','incorrect','errors','lastAt'] <> '{}'::jsonb or jsonb_typeof(p_data->'errors') is distinct from 'object' then raise exception 'Invalid reading data'; end if;
    if coalesce(p_data->>'part','') not in ('2','3') or p_id not like 'RL-P'||(p_data->>'part')||'-%' then raise exception 'Invalid reading part'; end if;
    if coalesce(p_data->>'attempts','') !~ '^[0-9]{1,7}$' or coalesce(p_data->>'correct','') !~ '^[0-9]{1,8}$' or coalesce(p_data->>'incorrect','') !~ '^[0-9]{1,8}$' or coalesce(p_data->>'lastAt','') !~ '^[0-9]{1,16}$' then raise exception 'Invalid reading counts'; end if;
    if (p_data->>'correct')::bigint+(p_data->>'incorrect')::bigint <> (p_data->>'attempts')::bigint * (case when p_data->>'part'='2' then 5 else 7 end) then raise exception 'Invalid reading total'; end if;
    if exists(select 1 from jsonb_each(p_data->'errors') e where e.key not in ('cohesion','reference','chronology','opinion','inference','qualification') or jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]{1,8}$') then raise exception 'Invalid reading errors'; end if;
    if (select coalesce(sum(value::text::bigint),0) from jsonb_each(p_data->'errors')) <> (p_data->>'incorrect')::bigint then raise exception 'Invalid reading error total'; end if;
  end if;
end $$;`);
const snapshot=take('public.learning_snapshot').replace('create function','create or replace function').replace("'error','vocabulary']","'error','vocabulary','reading']");
const lab=JSON.parse(read('data/reading-lab.json'));
write('supabase/migrations/003_reading_lab.sql',`-- Additive v2.1 migration. Keeps all historical course rows and access rules.\nbegin;\ncreate table public.reading_progress(user_id uuid not null references auth.users(id),id text not null check(length(id) between 1 and 600),data jsonb,revision bigint not null default 1,deleted boolean not null default false,imported boolean not null default false,updated_at timestamptz not null default now(),primary key(user_id,id));\nalter table public.reading_progress enable row level security;\ncreate policy read_assigned on public.reading_progress for select to authenticated using(private.can_read(user_id));\nrevoke all on public.reading_progress from public,anon,authenticated;\ngrant select on public.reading_progress to authenticated;\ninsert into public.content_refs(kind,id) values\n${[...lab.part2,...lab.part3].map(x=>`('reading','${x.id}')`).join(',\n')}\non conflict do nothing;\n${tableFn}\n${validate}\n${snapshot}\nrevoke all on function public.learning_snapshot(uuid) from public,anon;\ngrant execute on function public.learning_snapshot(uuid) to authenticated;\ncommit;\n`);
