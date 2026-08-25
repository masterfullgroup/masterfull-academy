create or replace function public.set_course_profile_edit_permission(
  target_course_id text,
  target_student_id uuid,
  allow_edit boolean
)
returns public.course_enrollments
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment public.course_enrollments%rowtype;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Solo un profesor puede modificar este permiso.' using errcode = '42501';
  end if;

  update public.course_enrollments
  set can_edit_profile = coalesce(allow_edit, true), updated_at = now()
  where course_id = trim(target_course_id)
    and student_id = target_student_id
  returning * into enrollment;

  if enrollment.course_id is null then
    raise exception 'No se encontró la matrícula del alumno.' using errcode = 'P0002';
  end if;

  return enrollment;
end;
$$;

revoke all on function public.set_course_profile_edit_permission(text, uuid, boolean) from public, anon;
grant execute on function public.set_course_profile_edit_permission(text, uuid, boolean) to authenticated;
