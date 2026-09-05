-- Cada entrada al curso inicia una nueva sesión para conservar el historial.
create or replace function public.start_course_activity_session(target_course_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
begin
  if auth.uid() is null or not public.is_enrolled(trim(target_course_id)) then
    raise exception 'El alumno no tiene acceso a este curso.' using errcode = '42501';
  end if;

  update public.course_activity_sessions
  set status = 'closed', ended_at = coalesce(ended_at, last_seen_at, now())
  where course_id = trim(target_course_id)
    and student_id = auth.uid()
    and status = 'active';

  insert into public.course_activity_sessions(course_id, student_id)
  values (trim(target_course_id), auth.uid())
  returning id into session_id;

  return session_id;
end;
$$;

revoke all on function public.start_course_activity_session(text) from public, anon;
grant execute on function public.start_course_activity_session(text) to authenticated;
