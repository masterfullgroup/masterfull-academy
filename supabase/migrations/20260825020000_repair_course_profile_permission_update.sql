-- Permite actualizar únicamente el permiso de edición desde el cliente como
-- compatibilidad temporal si la función RPC aún no está disponible.
drop policy if exists "course_enrollments_teacher_update" on public.course_enrollments;
create policy "course_enrollments_teacher_update"
on public.course_enrollments
for update
to authenticated
using (public.is_teacher())
with check (public.is_teacher());

grant update (can_edit_profile) on public.course_enrollments to authenticated;
