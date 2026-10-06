-- Isolated disposable fixtures. Transaction always rolled back.
begin;
insert into auth.users(id) values('91111111-1111-4111-8111-111111111111'),('91222222-2222-4222-8222-222222222222'),('91333333-3333-4333-8333-333333333333');
insert into public.user_roles(user_id,role) values('91111111-1111-4111-8111-111111111111','student'),('91222222-2222-4222-8222-222222222222','student'),('91333333-3333-4333-8333-333333333333','teacher');
insert into public.teacher_students(teacher_id,student_id) values('91333333-3333-4333-8333-333333333333','91111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','91111111-1111-4111-8111-111111111111',true);
do $$ begin
 assert (public.save_entity('reading','RL-P2-01','{"part":2,"attempts":1,"correct":4,"incorrect":1,"errors":{"reference":1},"lastAt":1791280000000}',0)->>'ok')::boolean,'Student cannot save Reading';
 assert (public.learning_snapshot()->'reading'->0->'data'->>'correct')::integer=4,'Snapshot missing Reading';
end $$;
select set_config('request.jwt.claim.sub','91222222-2222-4222-8222-222222222222',true);
do $$ begin
 assert (select count(*) from public.reading_progress)=0,'Other student reads Reading';
 begin perform public.learning_snapshot('91111111-1111-4111-8111-111111111111');raise exception 'Foreign snapshot allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','91333333-3333-4333-8333-333333333333',true);
do $$ begin
 assert (public.learning_snapshot('91111111-1111-4111-8111-111111111111')->'reading'->0->'data'->>'correct')::integer=4,'Teacher cannot read assigned Reading';
 begin perform public.learning_snapshot('91222222-2222-4222-8222-222222222222');raise exception 'Unassigned snapshot allowed';exception when insufficient_privilege then null;end;
 begin perform public.save_entity('reading','RL-P2-01','{"part":2,"attempts":1,"correct":5,"incorrect":0,"errors":{},"lastAt":1791280000000}',0);raise exception 'Teacher write allowed';exception when insufficient_privilege then null;end;
 begin update public.reading_progress set data='{}';raise exception 'Teacher update allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform count(*) from public.reading_progress;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASSED: Reading RLS, assigned teacher read only, student autonomy, anonymous denied' as result;
rollback;
