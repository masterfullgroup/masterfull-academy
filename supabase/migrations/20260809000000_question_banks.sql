create table if not exists public.academy_question_banks (
  bank_id text primary key,
  course_id text not null references public.academy_courses(course_id) on delete cascade,
  title text not null,
  option_count integer not null check (option_count between 2 and 8),
  published boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_bank_questions (
  bank_id text not null references public.academy_question_banks(bank_id) on delete cascade,
  question_id text not null,
  position integer not null check (position >= 0),
  text text not null,
  image text not null default '',
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct integer not null check (correct >= 0),
  published boolean not null default true,
  primary key (bank_id, question_id)
);

alter table public.academy_exams add column if not exists bank_id text;
do $$ begin
  alter table public.academy_exams add constraint academy_exams_bank_id_fkey
    foreign key (bank_id) references public.academy_question_banks(bank_id) on delete restrict;
exception when duplicate_object then null;
end $$;

insert into public.academy_question_banks(bank_id, course_id, title, option_count, published)
select e.exam_id || '-bank', e.course_id, e.title || ' · Banco', e.option_count, e.published
from public.academy_exams e
on conflict (bank_id) do nothing;

insert into public.academy_bank_questions(bank_id, question_id, position, text, image, options, correct, published)
select e.exam_id || '-bank', q.question_id, q.position, q.text, q.image, q.options, q.correct, q.published
from public.academy_exams e
join public.academy_questions q on q.exam_id = e.exam_id
on conflict (bank_id, question_id) do nothing;

update public.academy_exams set bank_id = exam_id || '-bank' where bank_id is null;

alter table public.academy_question_banks enable row level security;
alter table public.academy_bank_questions enable row level security;
drop policy if exists "academy_question_banks_read" on public.academy_question_banks;
create policy "academy_question_banks_read" on public.academy_question_banks
for select to authenticated using ((published = true and exists (select 1 from public.academy_courses c where c.course_id = academy_question_banks.course_id and c.published = true)) or public.is_teacher());
drop policy if exists "academy_question_banks_teacher_write" on public.academy_question_banks;
create policy "academy_question_banks_teacher_write" on public.academy_question_banks
for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists "academy_bank_questions_read" on public.academy_bank_questions;
create policy "academy_bank_questions_read" on public.academy_bank_questions
for select to authenticated using ((published = true and exists (select 1 from public.academy_question_banks b join public.academy_courses c on c.course_id = b.course_id where b.bank_id = academy_bank_questions.bank_id and b.published = true and c.published = true)) or public.is_teacher());
drop policy if exists "academy_bank_questions_teacher_write" on public.academy_bank_questions;
create policy "academy_bank_questions_teacher_write" on public.academy_bank_questions
for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

grant select, insert, update, delete on public.academy_question_banks, public.academy_bank_questions to authenticated;

create or replace function public.publish_academy_course(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  course_data jsonb := payload -> 'course';
  bank_data jsonb;
  exam_data jsonb;
  question_data jsonb;
  stable_course_id text := trim(course_data ->> 'id');
  stable_bank_id text;
  stable_exam_id text;
  published_bank_count integer := 0;
  published_exam_count integer := 0;
  published_question_count integer := 0;
  question_position integer;
  bank_question_count integer;
begin
  if auth.uid() is null or not public.is_teacher() then raise exception 'Solo un profesor puede publicar cursos.' using errcode = '42501'; end if;
  if stable_course_id is null or stable_course_id = '' then raise exception 'El curso no tiene un ID estable.'; end if;
  if jsonb_typeof(payload -> 'banks') <> 'array' or jsonb_typeof(payload -> 'exams') <> 'array' then raise exception 'La estructura de bancos y evaluaciones no es válida.'; end if;
  if jsonb_array_length(payload -> 'banks') = 0 and jsonb_array_length(payload -> 'exams') = 0 and jsonb_array_length(coalesce(course_data -> 'modules', '[]'::jsonb)) = 0 then raise exception 'El curso debe contener módulos, bancos o evaluaciones.'; end if;

  insert into public.academy_courses(course_id, name, description, teacher_name, modules, published, updated_by)
  values (stable_course_id, trim(course_data ->> 'name'), coalesce(course_data ->> 'description', ''), coalesce(nullif(trim(course_data ->> 'teacher_name'), ''), 'Profesor'), coalesce(course_data -> 'modules', '[]'::jsonb), false, auth.uid())
  on conflict (course_id) do update set name = excluded.name, description = excluded.description, teacher_name = excluded.teacher_name, modules = excluded.modules, published = false, updated_by = auth.uid(), updated_at = now();

  for bank_data in select value from jsonb_array_elements(payload -> 'banks') loop
    stable_bank_id := trim(bank_data ->> 'id');
    if stable_bank_id is null or stable_bank_id = '' then raise exception 'Un banco no tiene ID estable.'; end if;
    if jsonb_typeof(bank_data -> 'questions') <> 'array' or jsonb_array_length(bank_data -> 'questions') = 0 then raise exception 'El banco % no contiene preguntas.', stable_bank_id; end if;
    insert into public.academy_question_banks(bank_id, course_id, title, option_count, published, updated_by)
    values (stable_bank_id, stable_course_id, trim(bank_data ->> 'title'), (bank_data ->> 'option_count')::integer, false, auth.uid())
    on conflict (bank_id) do update set course_id = excluded.course_id, title = excluded.title, option_count = excluded.option_count, published = false, updated_by = auth.uid(), updated_at = now();
    update public.academy_bank_questions set published = false where bank_id = stable_bank_id;
    question_position := 0;
    for question_data in select value from jsonb_array_elements(bank_data -> 'questions') loop
      insert into public.academy_bank_questions(bank_id, question_id, position, text, image, options, correct, published)
      values (stable_bank_id, trim(question_data ->> 'id'), question_position, question_data ->> 'text', coalesce(question_data ->> 'image', ''), question_data -> 'options', (question_data ->> 'correct')::integer, true)
      on conflict (bank_id, question_id) do update set position = excluded.position, text = excluded.text, image = excluded.image, options = excluded.options, correct = excluded.correct, published = true;
      question_position := question_position + 1;
      published_question_count := published_question_count + 1;
    end loop;
    update public.academy_question_banks set published = true, updated_at = now() where bank_id = stable_bank_id;
    published_bank_count := published_bank_count + 1;
  end loop;

  for exam_data in select value from jsonb_array_elements(payload -> 'exams') loop
    stable_exam_id := trim(exam_data ->> 'id');
    stable_bank_id := trim(coalesce(exam_data ->> 'question_bank_id', exam_data ->> 'bank_id', ''));
    if stable_exam_id is null or stable_exam_id = '' then raise exception 'Una evaluación no tiene ID estable.'; end if;
    if stable_bank_id is null or stable_bank_id = '' then raise exception 'La evaluación % debe seleccionar un banco.', stable_exam_id; end if;
    select count(*) into bank_question_count from public.academy_bank_questions where bank_id = stable_bank_id and published = true;
    if bank_question_count = 0 then raise exception 'El banco % no tiene preguntas publicadas.', stable_bank_id; end if;
    if (exam_data ->> 'questions_to_show')::integer > bank_question_count then raise exception 'La evaluación % solicita más preguntas de las disponibles.', stable_exam_id; end if;
    insert into public.academy_exams(exam_id, course_id, bank_id, title, minutes, questions_to_show, attempts_allowed, option_count, published)
    values (stable_exam_id, stable_course_id, stable_bank_id, trim(exam_data ->> 'title'), (exam_data ->> 'minutes')::integer, (exam_data ->> 'questions_to_show')::integer, (exam_data ->> 'attempts_allowed')::integer, (exam_data ->> 'option_count')::integer, false)
    on conflict (exam_id) do update set course_id = excluded.course_id, bank_id = excluded.bank_id, title = excluded.title, minutes = excluded.minutes, questions_to_show = excluded.questions_to_show, attempts_allowed = excluded.attempts_allowed, option_count = excluded.option_count, published = false, updated_at = now();
    update public.academy_exams set published = true, updated_at = now() where exam_id = stable_exam_id;
    published_exam_count := published_exam_count + 1;
  end loop;
  update public.academy_courses set published = true, updated_at = now() where course_id = stable_course_id;
  insert into public.course_changes(course_id, name, description, modules, deleted, updated_by)
  values (stable_course_id, course_data ->> 'name', coalesce(course_data ->> 'description', ''), coalesce(course_data -> 'modules', '[]'::jsonb), false, auth.uid())
  on conflict (course_id) do update set deleted = false, name = excluded.name, description = excluded.description, modules = excluded.modules, updated_by = auth.uid();
  return jsonb_build_object('course_id', stable_course_id, 'bank_count', published_bank_count, 'exam_count', published_exam_count, 'question_count', published_question_count);
end;
$$;

revoke all on function public.publish_academy_course(jsonb) from public, anon;
grant execute on function public.publish_academy_course(jsonb) to authenticated;
