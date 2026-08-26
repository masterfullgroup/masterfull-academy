create table if not exists public.student_navigation_preferences (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  show_courses boolean not null default true,
  show_calendar boolean not null default true,
  show_grades boolean not null default true,
  show_profile boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.student_navigation_preferences enable row level security;

drop policy if exists "student_navigation_preferences_select" on public.student_navigation_preferences;
create policy "student_navigation_preferences_select"
on public.student_navigation_preferences
for select
to authenticated
using (
  student_id = auth.uid()
  or (
    public.is_teacher()
    and exists (
      select 1
      from public.course_enrollments enrollment
      where enrollment.student_id = student_navigation_preferences.student_id
        and enrollment.status = 'active'
        and enrollment.granted_by = auth.uid()
    )
  )
);

create or replace function public.set_student_navigation_preferences(
  target_student_id uuid,
  show_courses boolean,
  show_calendar boolean,
  show_grades boolean,
  show_profile boolean
)
returns public.student_navigation_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  preference public.student_navigation_preferences%rowtype;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Solo un profesor puede configurar la navegación del alumno.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.student_id = target_student_id
      and enrollment.status = 'active'
      and enrollment.granted_by = auth.uid()
  ) then
    raise exception 'El alumno no pertenece a tus cursos autorizados.' using errcode = '42501';
  end if;

  update public.course_enrollments
  set can_edit_profile = coalesce(show_profile, false),
      updated_at = now()
  where student_id = target_student_id
    and status = 'active'
    and granted_by = auth.uid();

  insert into public.student_navigation_preferences (
    student_id, show_courses, show_calendar, show_grades, show_profile, updated_by, updated_at
  )
  values (
    target_student_id,
    coalesce(show_courses, true),
    coalesce(show_calendar, true),
    coalesce(show_grades, true),
    coalesce(show_profile, false),
    auth.uid(),
    now()
  )
  on conflict (student_id) do update
  set show_courses = excluded.show_courses,
      show_calendar = excluded.show_calendar,
      show_grades = excluded.show_grades,
      show_profile = excluded.show_profile,
      updated_by = auth.uid(),
      updated_at = now()
  returning * into preference;

  return preference;
end;
$$;

revoke all on public.student_navigation_preferences from anon, authenticated;
grant select on public.student_navigation_preferences to authenticated;
revoke all on function public.set_student_navigation_preferences(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_student_navigation_preferences(uuid, boolean, boolean, boolean, boolean) to authenticated;
