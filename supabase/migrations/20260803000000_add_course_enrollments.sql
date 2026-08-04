create table if not exists public.course_enrollments (
  course_id text not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  granted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, student_id),
  constraint course_enrollments_course_id_check check (length(trim(course_id)) between 1 and 100),
  constraint course_enrollments_status_check check (status in ('active', 'revoked'))
);

create index if not exists course_enrollments_student_idx
  on public.course_enrollments (student_id, status);
create index if not exists course_enrollments_course_idx
  on public.course_enrollments (course_id, status);

drop trigger if exists course_enrollments_set_updated_at on public.course_enrollments;
create trigger course_enrollments_set_updated_at
before update on public.course_enrollments
for each row execute function public.set_updated_at();

create or replace function public.is_enrolled(target_course_id text, user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.course_id = target_course_id
      and enrollment.student_id = user_id
      and enrollment.status = 'active'
      and (user_id = auth.uid() or public.is_teacher())
  );
$$;

alter table public.course_enrollments enable row level security;

drop policy if exists "course_enrollments_select" on public.course_enrollments;
drop policy if exists "course_enrollments_teacher_insert" on public.course_enrollments;
drop policy if exists "course_enrollments_teacher_update" on public.course_enrollments;
drop policy if exists "course_enrollments_teacher_delete" on public.course_enrollments;

create policy "course_enrollments_select"
on public.course_enrollments for select to authenticated
using (student_id = auth.uid() or public.is_teacher());

create policy "course_enrollments_teacher_insert"
on public.course_enrollments for insert to authenticated
with check (public.is_teacher() and granted_by = auth.uid());

create policy "course_enrollments_teacher_update"
on public.course_enrollments for update to authenticated
using (public.is_teacher())
with check (public.is_teacher() and granted_by = auth.uid());

create policy "course_enrollments_teacher_delete"
on public.course_enrollments for delete to authenticated
using (public.is_teacher());

create or replace function public.grant_course_access(target_course_id text, target_student_email text)
returns public.course_enrollments
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student public.profiles%rowtype;
  enrollment public.course_enrollments%rowtype;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Solo un profesor puede autorizar alumnos.' using errcode = '42501';
  end if;
  if trim(coalesce(target_course_id, '')) = '' then
    raise exception 'El curso no es válido.';
  end if;
  select * into target_student
  from public.profiles
  where lower(email) = lower(trim(target_student_email))
    and role = 'student'
  limit 1;
  if target_student.id is null then
    raise exception 'No existe un alumno registrado con ese correo.' using errcode = 'P0002';
  end if;
  insert into public.course_enrollments(course_id, student_id, status, granted_by)
  values (trim(target_course_id), target_student.id, 'active', auth.uid())
  on conflict (course_id, student_id) do update
  set status = 'active', granted_by = auth.uid(), updated_at = now()
  returning * into enrollment;
  return enrollment;
end;
$$;

create or replace function public.revoke_course_access(target_course_id text, target_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Solo un profesor puede retirar accesos.' using errcode = '42501';
  end if;
  delete from public.course_enrollments
  where course_id = target_course_id and student_id = target_student_id;
end;
$$;

drop policy if exists "academy_courses_read_published" on public.academy_courses;
create policy "academy_courses_read_published" on public.academy_courses
for select to authenticated using (
  public.is_teacher() or (published = true and public.is_enrolled(course_id))
);

drop policy if exists "academy_exams_read_published" on public.academy_exams;
create policy "academy_exams_read_published" on public.academy_exams
for select to authenticated using (
  public.is_teacher() or (
    published = true
    and public.is_enrolled(course_id)
    and exists (
      select 1 from public.academy_courses course
      where course.course_id = academy_exams.course_id and course.published = true
    )
  )
);

drop policy if exists "academy_questions_read_published" on public.academy_questions;
create policy "academy_questions_read_published" on public.academy_questions
for select to authenticated using (
  public.is_teacher() or (
    published = true and exists (
      select 1
      from public.academy_exams exam
      join public.academy_courses course on course.course_id = exam.course_id
      where exam.exam_id = academy_questions.exam_id
        and exam.published = true
        and course.published = true
        and public.is_enrolled(course.course_id)
    )
  )
);

drop policy if exists "course_changes_select_authenticated" on public.course_changes;
create policy "course_changes_select_authenticated"
on public.course_changes for select to authenticated
using (public.is_teacher() or public.is_enrolled(course_id));

drop policy if exists "results_insert_own" on public.results;
create policy "results_insert_own"
on public.results for insert to authenticated
with check (student_id = auth.uid() and public.is_enrolled(course_id));

do $$
begin
  if to_regclass('public.published_courses') is not null then
    execute 'drop policy if exists "published_courses_select" on public.published_courses';
    execute 'create policy "published_courses_select" on public.published_courses for select to authenticated using (public.is_teacher() or (published = true and public.is_enrolled(course_id)))';
  end if;
end $$;

revoke all on public.course_enrollments from anon, authenticated;
grant select, insert, update, delete on public.course_enrollments to authenticated;
revoke all on function public.is_enrolled(text, uuid) from public, anon;
grant execute on function public.is_enrolled(text, uuid) to authenticated;
revoke all on function public.grant_course_access(text, text) from public, anon;
grant execute on function public.grant_course_access(text, text) to authenticated;
revoke all on function public.revoke_course_access(text, uuid) from public, anon;
grant execute on function public.revoke_course_access(text, uuid) to authenticated;
