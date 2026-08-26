-- Permite guardar las preferencias directamente mientras PostgREST actualiza
-- su catálogo de funciones después de desplegar el RPC.
drop policy if exists "student_navigation_preferences_insert" on public.student_navigation_preferences;
create policy "student_navigation_preferences_insert"
on public.student_navigation_preferences
for insert
to authenticated
with check (
  public.is_teacher()
  and exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.student_id = student_navigation_preferences.student_id
      and enrollment.status = 'active'
      and enrollment.granted_by = auth.uid()
  )
);

drop policy if exists "student_navigation_preferences_update" on public.student_navigation_preferences;
create policy "student_navigation_preferences_update"
on public.student_navigation_preferences
for update
to authenticated
using (
  public.is_teacher()
  and exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.student_id = student_navigation_preferences.student_id
      and enrollment.status = 'active'
      and enrollment.granted_by = auth.uid()
  )
)
with check (
  public.is_teacher()
  and exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.student_id = student_navigation_preferences.student_id
      and enrollment.status = 'active'
      and enrollment.granted_by = auth.uid()
  )
);

grant insert, update on public.student_navigation_preferences to authenticated;
