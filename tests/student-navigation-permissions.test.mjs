import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const migrationSource = fs.readFileSync(new URL("../supabase/migrations/20260825030000_add_student_navigation_preferences.sql", import.meta.url), "utf8");

assert.match(appSource, /data-teacher-tab="teacher-students"/, "La barra del profesor debe incluir Alumnos");
assert.match(htmlSource, /id="teacher-students"/, "Debe existir el panel de alumnos del profesor");
assert.match(appSource, /function getTeacherManagedStudents\(\)/, "La lista debe limitarse a los alumnos del profesor");
assert.match(appSource, /function renderTeacherStudents\(\)/, "El profesor debe poder ver a sus alumnos");
assert.match(appSource, /data-student-navigation="\$\{key\}"/, "Cada alumno debe tener controles de navegación individuales");
assert.match(appSource, /set_student_navigation_preferences/, "Los permisos deben guardarse en Supabase");
assert.match(appSource, /student_navigation_preferences.*upsert|upsert\(\{[\s\S]*show_profile/, "El guardado debe tener compatibilidad con proyectos sin RPC expuesto");
assert.match(appSource, /currentStudentNavigation\.profile/, "El perfil del alumno debe depender de su permiso");
assert.match(migrationSource, /create table if not exists public\.student_navigation_preferences/, "La preferencia debe persistirse por alumno");
assert.match(migrationSource, /enrollment\.granted_by = auth\.uid\(\)/, "Solo el profesor del alumno debe cambiar sus preferencias");
assert.match(migrationSource, /set can_edit_profile = coalesce\(show_profile, false\)/, "El permiso de perfil debe coincidir con el botón visible");

console.log("OK: navegación configurable por alumno");
