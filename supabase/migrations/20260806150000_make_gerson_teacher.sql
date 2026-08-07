-- Convierte la cuenta solicitada en profesor activo.
update public.profiles
set role = 'teacher',
    teacher_status = 'active',
    updated_at = now()
where lower(email) = lower('gerson.mcho@gmail.com');
