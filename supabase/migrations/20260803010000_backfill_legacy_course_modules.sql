-- Recupera los módulos que se guardaron en filas fragmentadas mientras la
-- columna modules todavía no estaba disponible en producción.
alter table public.academy_courses
  add column if not exists modules jsonb not null default '[]'::jsonb
  check (jsonb_typeof(modules) = 'array');

alter table public.course_changes
  add column if not exists modules jsonb
  check (modules is null or jsonb_typeof(modules) = 'array');

do $$
declare
  recovered_modules jsonb;
begin
  select string_agg(description, '' order by course_id)::jsonb
  into recovered_modules
  from public.course_changes
  where course_id like '__mfmod__:d83dc278ef605b64:%'
    and deleted = false;

  if recovered_modules is not null and jsonb_typeof(recovered_modules) = 'array' then
    update public.academy_courses
    set modules = recovered_modules,
        updated_at = now()
    where course_id = 'fisica';

    update public.course_changes
    set modules = recovered_modules,
        updated_at = now()
    where course_id = 'fisica';
  end if;
end;
$$;
