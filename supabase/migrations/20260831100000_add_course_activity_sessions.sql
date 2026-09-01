create table if not exists public.course_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'closed'))
);

create index if not exists course_activity_sessions_course_idx
  on public.course_activity_sessions (course_id, last_seen_at desc);
create index if not exists course_activity_sessions_student_idx
  on public.course_activity_sessions (student_id, last_seen_at desc);

alter table public.course_activity_sessions enable row level security;

drop policy if exists "course_activity_sessions_select" on public.course_activity_sessions;
create policy "course_activity_sessions_select"
on public.course_activity_sessions for select to authenticated
using (
  student_id = auth.uid()
  or (
    public.is_teacher()
    and exists (
      select 1 from public.course_enrollments enrollment
      where enrollment.course_id = course_activity_sessions.course_id
        and enrollment.student_id = course_activity_sessions.student_id
        and enrollment.status = 'active'
        and enrollment.granted_by = auth.uid()
    )
  )
);

drop policy if exists "course_activity_sessions_insert" on public.course_activity_sessions;
create policy "course_activity_sessions_insert"
on public.course_activity_sessions for insert to authenticated
with check (
  student_id = auth.uid()
  and public.is_enrolled(course_id)
);

drop policy if exists "course_activity_sessions_update" on public.course_activity_sessions;
create policy "course_activity_sessions_update"
on public.course_activity_sessions for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

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
  set status = 'closed', ended_at = coalesce(ended_at, last_seen_at)
  where course_id = trim(target_course_id)
    and student_id = auth.uid()
    and status = 'active'
    and last_seen_at < now() - interval '2 minutes';

  select id into session_id
  from public.course_activity_sessions
  where course_id = trim(target_course_id)
    and student_id = auth.uid()
    and status = 'active'
  order by last_seen_at desc
  limit 1;

  if session_id is null then
    insert into public.course_activity_sessions(course_id, student_id)
    values (trim(target_course_id), auth.uid())
    returning id into session_id;
  else
    update public.course_activity_sessions
    set last_seen_at = now(), ended_at = null
    where id = session_id;
  end if;
  return session_id;
end;
$$;

create or replace function public.touch_course_activity_session(target_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.course_activity_sessions
  set last_seen_at = now(), status = 'active', ended_at = null
  where id = target_session_id and student_id = auth.uid()
  returning true;
$$;

create or replace function public.close_course_activity_session(target_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.course_activity_sessions
  set last_seen_at = now(), ended_at = now(), status = 'closed'
  where id = target_session_id and student_id = auth.uid()
  returning true;
$$;

revoke all on public.course_activity_sessions from anon, authenticated;
grant select, insert, update on public.course_activity_sessions to authenticated;
revoke all on function public.start_course_activity_session(text) from public, anon;
revoke all on function public.touch_course_activity_session(uuid) from public, anon;
revoke all on function public.close_course_activity_session(uuid) from public, anon;
grant execute on function public.start_course_activity_session(text) to authenticated;
grant execute on function public.touch_course_activity_session(uuid) to authenticated;
grant execute on function public.close_course_activity_session(uuid) to authenticated;
