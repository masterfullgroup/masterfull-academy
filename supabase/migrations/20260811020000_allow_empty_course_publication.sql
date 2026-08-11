-- Permite publicar un curso base aunque todavía no tenga módulos ni evaluaciones.
-- El curso queda en academy_courses y puede completarse después desde Configuración.
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
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Solo un profesor puede publicar cursos.' using errcode = '42501';
  end if;
  if stable_course_id is null or stable_course_id = '' then
    raise exception 'El curso no tiene un ID estable.';
  end if;
  if jsonb_typeof(payload -> 'banks') <> 'array' or jsonb_typeof(payload -> 'exams') <> 'array' then
    raise exception 'La estructura de bancos y evaluaciones no es valida.';
  end if;

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
    if stable_exam_id is null or stable_exam_id = '' then raise exception 'Una evaluacion no tiene ID estable.'; end if;
    if stable_bank_id is null or stable_bank_id = '' then raise exception 'La evaluacion % debe seleccionar un banco.', stable_exam_id; end if;
    select count(*) into bank_question_count from public.academy_bank_questions where bank_id = stable_bank_id and published = true;
    if bank_question_count = 0 then raise exception 'El banco % no tiene preguntas publicadas.', stable_bank_id; end if;
    if (exam_data ->> 'questions_to_show')::integer > bank_question_count then raise exception 'La evaluacion % solicita mas preguntas de las disponibles.', stable_exam_id; end if;
    insert into public.academy_exams(exam_id, course_id, bank_id, title, minutes, questions_to_show, attempts_allowed, option_count, published)
    values (stable_exam_id, stable_course_id, stable_bank_id, trim(exam_data ->> 'title'), (exam_data ->> 'minutes')::integer, (exam_data ->> 'questions_to_show')::integer, (exam_data ->> 'attempts_allowed')::integer, (exam_data ->> 'option_count')::integer, false)
    on conflict (exam_id) do update set course_id = excluded.course_id, bank_id = excluded.bank_id, title = excluded.title, minutes = excluded.minutes, questions_to_show = excluded.questions_to_show, attempts_allowed = excluded.attempts_allowed, option_count = excluded.option_count, published = false, updated_at = now();
    update public.academy_exams set published = true, updated_at = now() where exam_id = stable_exam_id;
    published_exam_count := published_exam_count + 1;
  end loop;

  update public.academy_courses set published = true, updated_at = now() where course_id = stable_course_id;
  -- course_changes es legacy y no decide el estado de publicaciÃ³n.
  return jsonb_build_object('course_id', stable_course_id, 'bank_count', published_bank_count, 'exam_count', published_exam_count, 'question_count', published_question_count);
end;
$$;

revoke all on function public.publish_academy_course(jsonb) from public, anon;
grant execute on function public.publish_academy_course(jsonb) to authenticated;
