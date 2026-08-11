do $$
declare
  target_exam_ids text[];
  target_bank_ids text[];
begin
  if to_regclass('public.academy_exams') is null then
    return;
  end if;

  select coalesce(array_agg(exam_id), '{}')
    into target_exam_ids
    from public.academy_exams
   where exam_id = 'fisica-mru-01'
      or lower(trim(title)) = lower('Movimiento Rectilíneo Uniforme');

  if cardinality(target_exam_ids) = 0 then
    return;
  end if;

  update public.academy_exams set bank_id = null where exam_id = any(target_exam_ids);

  if to_regclass('public.academy_question_banks') is not null then
    select coalesce(array_agg(bank_id), '{}')
      into target_bank_ids
      from public.academy_question_banks
     where bank_id in (select bank_id from public.academy_exams where exam_id = any(target_exam_ids));
    if cardinality(target_bank_ids) > 0 then
      delete from public.academy_bank_questions
       where bank_id = any(target_bank_ids)
         and not exists (select 1 from public.academy_exams where bank_id = academy_bank_questions.bank_id);
      delete from public.academy_question_banks
       where bank_id = any(target_bank_ids)
         and not exists (select 1 from public.academy_exams where bank_id = academy_question_banks.bank_id);
    end if;
  end if;

  if to_regclass('public.academy_exams') is not null then
    delete from public.academy_exams where exam_id = any(target_exam_ids);
  end if;
end;
$$;
