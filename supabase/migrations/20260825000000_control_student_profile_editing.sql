alter table public.course_enrollments
  add column if not exists can_edit_profile boolean not null default true;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  and not exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.student_id = auth.uid()
      and enrollment.status = 'active'
      and enrollment.can_edit_profile = false
  )
)
with check (
  id = auth.uid()
  and not exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.student_id = auth.uid()
      and enrollment.status = 'active'
      and enrollment.can_edit_profile = false
  )
);

grant update (full_name, email) on public.profiles to authenticated;
