-- Permite que los administradores consulten los datos generales
-- necesarios para el panel administrativo.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- El administrador puede consultar todos los perfiles.
drop policy if exists "Admins can read all profiles"
on public.profiles;

create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

-- El administrador puede consultar todos los cursos.
drop policy if exists "Admins can read all academy courses"
on public.academy_courses;

create policy "Admins can read all academy courses"
on public.academy_courses
for select
to authenticated
using (public.is_admin());

-- El administrador puede consultar todas las matrículas.
drop policy if exists "Admins can read all course enrollments"
on public.course_enrollments;

create policy "Admins can read all course enrollments"
on public.course_enrollments
for select
to authenticated
using (public.is_admin());