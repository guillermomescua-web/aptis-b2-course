-- Run in Supabase SQL Editor AFTER inviting both users and accepting the invitations.
-- Replace only the two email literals and display names. Never enter passwords here.
do $$
declare s uuid; t uuid;
begin
  select id into s from auth.users where lower(email)=lower('REPLACE_STUDENT_EMAIL');
  select id into t from auth.users where lower(email)=lower('REPLACE_TEACHER_EMAIL');
  if s is null or t is null or s=t then raise exception 'Both distinct invited accounts must exist first'; end if;
  insert into public.profiles(user_id,display_name) values(s,'Alumna'),(t,'Guillermo') on conflict(user_id) do update set display_name=excluded.display_name;
  insert into public.user_roles(user_id,role) values(s,'student'),(t,'teacher') on conflict(user_id) do update set role=excluded.role,active=true;
  insert into public.teacher_students(teacher_id,student_id) values(t,s) on conflict(teacher_id,student_id) do update set active=true;
end $$;
