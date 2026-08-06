drop policy if exists "Admins can update teacher profiles"
on public.profiles;

create policy "Admins can update teacher profiles"
on public.profiles
for update
to authenticated
using (
  public.is_admin()
  and role = 'teacher'
)
with check (
  public.is_admin()
  and role = 'teacher'
);

alter table public.profiles
drop constraint if exists profiles_teacher_status_check;

alter table public.profiles
add constraint profiles_teacher_status_check
check (
  teacher_status is null
  or teacher_status in (
    'pending',
    'active',
    'suspended',
    'archived'
  )
);