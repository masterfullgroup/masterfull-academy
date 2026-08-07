-- Asigna el rol solicitado desde la cuenta de autenticación y crea el perfil si falta.
do $$
declare
  target_user auth.users%rowtype;
begin
  select * into target_user
  from auth.users
  where lower(email) = lower('asesoriamasterfull@gmail.com');

  if target_user.id is null then
    raise exception 'No se encontró el usuario autenticado de asesoriamasterfull@gmail.com';
  end if;

  insert into public.profiles (id, full_name, email, role, teacher_status)
  values (
    target_user.id,
    coalesce(target_user.raw_user_meta_data ->> 'full_name', ''),
    target_user.email,
    'admin',
    null
  )
  on conflict (id) do update
  set email = excluded.email,
      role = 'admin',
      teacher_status = null,
      updated_at = now();
end;
$$;
