-- Otorga acceso administrativo a la cuenta solicitada.
update public.profiles
set role = 'admin',
    teacher_status = null,
    updated_at = now()
where lower(email) = lower('asesoriamasterfull@gmail.com');
