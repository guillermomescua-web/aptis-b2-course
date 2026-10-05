-- Disposable fixtures inside one transaction. No passwords, email or persistent test users.
begin;
insert into auth.users(id) values
('90111111-1111-4111-8111-111111111111'),('90222222-2222-4222-8222-222222222222'),('90333333-3333-4333-8333-333333333333');
insert into public.user_roles(user_id,role) values
('90111111-1111-4111-8111-111111111111','student'),('90222222-2222-4222-8222-222222222222','student'),('90333333-3333-4333-8333-333333333333','teacher');
insert into public.teacher_students(teacher_id,student_id) values('90333333-3333-4333-8333-333333333333','90111111-1111-4111-8111-111111111111');
insert into public.answer_drafts(user_id,id,data) values
('90111111-1111-4111-8111-111111111111','W1D1-E02-Q01','{"text":"Test A"}'),('90222222-2222-4222-8222-222222222222','W1D1-E02-Q01','{"text":"Test B"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','90111111-1111-4111-8111-111111111111',true);
do $$ begin
  assert (select count(*) from public.answer_drafts)=1,'Student reads another account';
  begin perform public.learning_snapshot('90222222-2222-4222-8222-222222222222'); raise exception 'Foreign snapshot allowed'; exception when insufficient_privilege then null; end;
  begin update public.user_roles set role='teacher'; raise exception 'Role escalation allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.teacher_students(teacher_id,student_id) values(auth.uid(),'90222222-2222-4222-8222-222222222222'); raise exception 'Assignment escalation allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.answer_drafts(user_id,id,data) values('90222222-2222-4222-8222-222222222222','W1D2-E03-Q01','{}'); raise exception 'Foreign owner write allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.ai_feedback(id,user_id,exercise_id,kind,input,source_hash,model,feedback,provenance) values(gen_random_uuid(),auth.uid(),'W1D1-E02-Q01','writing','{}',repeat('a',64),'fake','{}','worker'); raise exception 'Fake model feedback allowed'; exception when insufficient_privilege then null; end;
  perform public.reserve_recording('90444444-4444-4444-8444-444444444444','W1D3-E03-Q01','audio/webm',repeat('a',64),30,1000);
  insert into storage.objects(bucket_id,name) select 'speaking',original_path from public.speaking_recordings where id='90444444-4444-4444-8444-444444444444';
  assert (select count(*) from storage.objects where bucket_id='speaking')=1,'Owner cannot read private object';
  update storage.objects set name='illegal-replacement' where bucket_id='speaking';
  assert not exists(select 1 from storage.objects where name='illegal-replacement'),'Linked audio replaced';
end $$;
select set_config('request.jwt.claim.sub','90222222-2222-4222-8222-222222222222',true);
do $$ begin assert (select count(*) from storage.objects where bucket_id='speaking')=0,'Foreign audio readable'; end $$;
select set_config('request.jwt.claim.sub','90333333-3333-4333-8333-333333333333',true);
do $$ begin
  assert (select count(*) from public.answer_drafts)=1,'Teacher reads unassigned student';
  assert (select count(*) from storage.objects where bucket_id='speaking')=1,'Assigned teacher cannot read audio';
  assert jsonb_array_length(public.learning_snapshot('90111111-1111-4111-8111-111111111111')->'answer')=1,'Assigned snapshot unavailable';
  begin perform public.learning_snapshot('90222222-2222-4222-8222-222222222222'); raise exception 'Unassigned snapshot allowed'; exception when insufficient_privilege then null; end;
  begin perform public.save_entity('session','W1D1','{"completed":true}',0); raise exception 'Teacher can change progress'; exception when insufficient_privilege then null; end;
  begin update public.answer_drafts set data='{}'; raise exception 'Teacher can change answers'; exception when insufficient_privilege then null; end;
  perform public.add_teacher_review('90111111-1111-4111-8111-111111111111','W1D1-E02-Q01','Optional test review');
end $$;
select set_config('request.jwt.claim.sub','90111111-1111-4111-8111-111111111111',true);
do $$ begin
 assert (select count(*) from public.teacher_reviews)=1,'Student cannot see review';
 assert (public.save_entity('session','W8D4','{"completed":true}',0)->>'ok')::boolean,'Teacher gates progress';
end $$;
set local role anon;
do $$ begin
 begin perform * from public.answer_drafts; raise exception 'Anonymous data readable'; exception when insufficient_privilege then null; end;
 begin perform public.learning_snapshot(); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: cross-account, roles, assignments, teacher read/comment only, private audio, anonymous denied, W8 autonomy; all fixtures rolled back' as result;
