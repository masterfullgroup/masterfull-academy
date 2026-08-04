-- Prepara los perfiles para administración y aprobación de profesores.

alter table public.profiles
  add column if not exists teacher_status text,
  add column if not exists phone text,
  add column if not exists institution text,
  add column if not exists avatar_url text,
  add column if not exists last_login timestamptz;
  -- Elimina primero la restricción antigua, que solo admite student y teacher.
alter table public.profiles
  drop constraint if exists profiles_role_check;

-- Los profesores existentes se consideran activos.
update public.profiles
set teacher_status = 'active'
where role = 'teacher'
  and teacher_status is null;

-- Los alumnos y administradores no necesitan estado de profesor.
update public.profiles
set teacher_status = null
where role in ('student', 'admin');

-- Convierte la cuenta principal en administradora.
update public.profiles
set role = 'admin',
    teacher_status = null,
    updated_at = now()
where lower(email) = lower('gerson.mcho@gmail.com');

-- Elimina restricciones CHECK antiguas sobre role o teacher_status,
-- si existen, para recrearlas con los valores correctos.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%role%'
        or pg_get_constraintdef(oid) ilike '%teacher_status%'
      )
  loop
    execute format(
      'alter table public.profiles drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'teacher', 'student'));

alter table public.profiles
  add constraint profiles_teacher_status_check
  check (
    teacher_status is null
    or teacher_status in ('pending', 'active', 'suspended', 'archived')
  );

-- Garantiza coherencia:
-- solo los profesores pueden tener estado de profesor.
alter table public.profiles
  add constraint profiles_teacher_status_role_check
  check (
    (role = 'teacher' and teacher_status is not null)
    or (role in ('admin', 'student') and teacher_status is null)
  );

comment on column public.profiles.teacher_status is
  'Estado del profesor: pending, active, suspended o archived.';

comment on column public.profiles.phone is
  'Teléfono o WhatsApp del usuario.';

comment on column public.profiles.institution is
  'Institución educativa o empresa asociada al profesor.';

comment on column public.profiles.avatar_url is
  'URL de la imagen de perfil.';

comment on column public.profiles.last_login is
  'Fecha y hora del último acceso registrado.';