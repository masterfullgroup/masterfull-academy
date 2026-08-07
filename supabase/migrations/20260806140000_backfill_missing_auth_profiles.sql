-- Recupera únicamente el perfil registrado que falta en profiles.
do $$
declare
  target_user auth.users%rowtype;
begin
  select * into target_user
  from auth.users
  where lower(email) = lower('gerson.mcho@gmail.com');

  if target_user.id is null then
    raise exception 'No se encontró el usuario autenticado de gerson.mcho@gmail.com';
  end if;

insert into public.profiles (id, full_name, email, role)
values (
  target_user.id,
  coalesce(target_user.raw_user_meta_data ->> 'full_name', ''),
  target_user.email,
  'student'
)
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();
end;
$$;
