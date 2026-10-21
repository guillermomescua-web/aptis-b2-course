-- Read-only validation against the actual database. No student rows are written.
begin;
do $$
declare n numeric; rejected boolean;
begin
  foreach n in array array[0,2,3,99999,9007199254740991]::numeric[] loop
    perform private.validate_entity('listening','MOCK01-LIST-R01',jsonb_build_object('plays',n));
  end loop;
  foreach n in array array[-1,1.5,9007199254740992]::numeric[] loop
    rejected:=false;
    begin perform private.validate_entity('listening','MOCK01-LIST-R01',jsonb_build_object('plays',n));
    exception when others then rejected:=true; end;
    if not rejected then raise exception 'Invalid count accepted: %',n; end if;
  end loop;
  rejected:=false;
  begin perform private.validate_entity('listening','MOCK01-LIST-R01','{"plays":"3"}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'String accepted'; end if;
  if has_table_privilege('anon','public.listening_progress','SELECT') or has_table_privilege('authenticated','public.listening_progress','UPDATE') then raise exception 'Listening grants changed'; end if;
  if not (select relrowsecurity from pg_class where oid='public.listening_progress'::regclass) then raise exception 'RLS disabled'; end if;
end $$;
select 'PASS: unlimited counts accepted, malformed counts rejected, RLS and grants preserved; no student data written' as result;
rollback;
