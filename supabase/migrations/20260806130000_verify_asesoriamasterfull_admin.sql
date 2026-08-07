-- Asigna el rol solicitado y detiene la publicación si el perfil no existe.
do $$
declare
  updated_profile_id uuid;
begin
  update public.profiles
  set role = 'admin',
      teacher_status = null,
      updated_at = now()
  where lower(email) = lower('asesoriamasterfull@gmail.com')
  returning id into updated_profile_id;

  if updated_profile_id is null then
    raise exception 'No se encontró el perfil de asesoriamasterfull@gmail.com';
  end if;
end;
$$;
