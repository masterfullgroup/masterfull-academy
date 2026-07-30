import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(appSource, /renderTeacherCourseModulesCanvas/, "El curso docente debe usar la estructura compacta de módulos");
assert.match(appSource, /collapse-all-modules/, "Los módulos deben poder contraerse en conjunto");
assert.match(appSource, /row-action-menu/, "Las acciones de filas deben agruparse en menús verticales");
assert.match(appSource, /\["settings", "Configuraci/, "La navegación del curso debe incluir configuración");
assert.match(htmlSource, /class="exam-editor-nav"/, "El editor debe separar detalles y preguntas");

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`La función ${name} está incompleta`);
}

const context = {
  courseProgress: {},
  results: [],
  currentUser: { id: "student-1" },
  Date,
  Set,
  Map,
  Math,
  Number,
  String,
  Array
};
vm.createContext(context);
vm.runInContext([
  extractFunction("normalizeModules"),
  extractFunction("activityCompleted"),
  extractFunction("accessibleCourseActivities")
].join("\n"), context);

const normalized = context.normalizeModules([{
  id: "module-1",
  title: "Vectores",
  activities: [
    { id: "heading-1", title: "Material", type: "heading" },
    { id: "task-1", title: "Tarea mixta", type: "task", published: false, submission_types: ["file", "text", "url", "file"] },
    { id: "quiz-1", title: "Evaluación", type: "quiz", exam_id: "exam-1", completion_rule: "pass" }
  ]
}]);

assert.equal(normalized[0].published, true, "Los módulos históricos deben conservarse publicados");
assert.equal(normalized[0].activities[0].completionRule, "none", "Un encabezado no genera progreso");
assert.equal(normalized[0].activities[1].published, false, "Los borradores deben conservar su estado");
assert.deepEqual([...normalized[0].activities[1].submissionTypes], ["file", "text", "url"], "Los tipos de entrega deben normalizarse sin duplicados");
assert.equal(normalized[0].activities[2].examId, "exam-1", "La evaluación debe conservar su referencia");

const course = {
  id: "course-1",
  modules: [
    { id: "published", title: "Publicado", published: true, activities: [
      { id: "visible", title: "Visible", type: "page", published: true },
      { id: "draft", title: "Borrador", type: "page", published: false },
      { id: "separator", title: "Separador", type: "heading", published: true }
    ] },
    { id: "draft-module", title: "Módulo borrador", published: false, activities: [
      { id: "hidden", title: "Oculto", type: "page", published: true }
    ] }
  ]
};
const accessible = context.accessibleCourseActivities(course);
assert.deepEqual([...accessible.map(item => item.id)], ["visible"], "El alumno solo debe recorrer contenido publicado y calificable");

context.results = [{ studentId: "student-1", examId: "exam-1", score: 14 }];
assert.equal(context.activityCompleted(normalized[0].activities[2], { completed:{} }, context.results), true, "Aprobar una evaluación debe completar el requisito");

for (const type of ["page","file","video","link","practice","task","quiz","discussion","live","heading"]) {
  assert.match(htmlSource, new RegExp(`value="${type}"`), `Falta el tipo ${type} en el selector`);
}
for (const field of ["activity-published","activity-completion-rule","activity-exam-id","activity-submission-field"]) {
  assert.match(htmlSource, new RegExp(`id="${field}"`), `Falta el campo ${field}`);
}
assert.match(appSource, /Sin asignar a un módulo/, "Las evaluaciones históricas sin módulo deben identificarse");
assert.match(appSource, /Filtro de las tareas ya ubicadas en los módulos/, "La vista global de tareas debe ser un filtro");
assert.doesNotMatch(appSource, /student-todo-panel/, "El panel del alumno no debe mostrar el bloque de evaluaciones pendientes");
assert.doesNotMatch(htmlSource, /<div class="tabs">\s*<button class="tab active" data-student-tab/, "El panel del alumno no debe duplicar la navegación en una barra horizontal");
assert.match(appSource, /shell-student-nav/, "Cursos y calificaciones deben estar disponibles desde la navegación lateral");

console.log("OK: arquitectura de módulos, publicación, progreso, tareas y evaluaciones");
