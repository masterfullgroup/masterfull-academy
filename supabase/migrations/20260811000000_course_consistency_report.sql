-- Diagnóstico de consistencia. Solo lectura: no modifica ni elimina datos.
create or replace view public.course_consistency_report as
select
  'published_deleted_change'::text as issue,
  c.course_id,
  c.name,
  'academy_courses.published=true y course_changes.deleted=true'::text as detail
from public.academy_courses c
join public.course_changes cc on cc.course_id = c.course_id
where c.published = true and cc.deleted = true
union all
select
  'contradictory_course_name'::text,
  c.course_id,
  c.name,
  'academy_courses y course_changes tienen nombres distintos'::text
from public.academy_courses c
join public.course_changes cc on cc.course_id = c.course_id
where c.name is distinct from cc.name
union all
select
  'orphan_exam'::text,
  e.course_id,
  e.exam_id,
  'academy_exams.course_id no existe en academy_courses'::text
from public.academy_exams e
left join public.academy_courses c on c.course_id = e.course_id
where c.course_id is null
union all
select
  'orphan_bank'::text,
  b.course_id,
  b.bank_id,
  'academy_question_banks.course_id no existe en academy_courses'::text
from public.academy_question_banks b
left join public.academy_courses c on c.course_id = b.course_id
where c.course_id is null
union all
select
  'orphan_bank_question'::text,
  nullif(bq.bank_id, ''),
  bq.question_id,
  'academy_bank_questions.bank_id no existe en academy_question_banks'::text
from public.academy_bank_questions bq
left join public.academy_question_banks b on b.bank_id = bq.bank_id
where b.bank_id is null;

comment on view public.course_consistency_report is
  'Reporte de auditoría de cursos, evaluaciones y bancos. No borra ni corrige registros.';

grant select on public.course_consistency_report to authenticated;
