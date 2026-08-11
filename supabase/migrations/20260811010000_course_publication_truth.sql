-- Corrección segura de compatibilidad.
-- academy_courses.published es la autoridad; course_changes no participa en la lectura.
-- No se eliminan cursos, evaluaciones, bancos, preguntas ni resultados.

update public.course_changes cc
set deleted = false,
    updated_at = now()
from public.academy_courses c
where c.course_id = cc.course_id
  and c.published = true
  and cc.deleted = true;

create index if not exists academy_courses_published_course_id_idx
  on public.academy_courses (course_id)
  where published = true;

create index if not exists academy_exams_course_id_idx
  on public.academy_exams (course_id);

create index if not exists academy_question_banks_course_id_idx
  on public.academy_question_banks (course_id);

create index if not exists academy_bank_questions_bank_id_idx
  on public.academy_bank_questions (bank_id);
