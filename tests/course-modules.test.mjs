import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
assert.doesNotMatch(appSource, /course-context-mark/, "La cabecera no debe repetir el curso con una inicial decorativa");
assert.doesNotMatch(appSource, /<span>CURSO<\/span><h1>/, "La cabecera no debe repetir la etiqueta Curso");
assert.match(appSource, /course-context-actions/, "La cabecera debe agrupar el estado y la vista del alumno");
assert.match(appSource, /renderTeacherCourseModulesCanvas/, "El curso docente debe usar la estructura compacta de módulos");
assert.match(appSource, /collapse-all-modules/, "Los módulos deben poder contraerse en conjunto");
assert.match(appSource, /row-action-menu/, "Las acciones de filas deben agruparse en menús verticales");
assert.match(appSource, /\["settings", "Configuraci/, "La navegación del curso debe incluir configuración");
assert.match(htmlSource, /class="exam-editor-nav"/, "El editor debe separar detalles y preguntas");
assert.match(htmlSource, /module-content-editor-card/, "El contenido del módulo debe usar un editor estructurado");
assert.match(htmlSource, /data-activity-format="bold"/, "El editor debe incluir herramientas de formato");
assert.match(htmlSource, /activity-rich-menubar/, "El editor debe incluir una barra de menús completa");
assert.match(htmlSource, /activity-menu-trigger/, "Los menús del editor deben ser controles desplegables");
assert.match(htmlSource, /data-activity-menu-panel="insert"/, "El menú Insertar debe ofrecer acciones reales");
assert.match(htmlSource, /data-activity-format="table-row"/, "El menú Tabla debe permitir añadir filas");
assert.match(appSource, /toggleActivityMenu/, "Los menús superiores deben abrirse y cerrarse de forma funcional");
assert.match(appSource, /editActiveActivityTable/, "Las acciones avanzadas de tabla deben modificar la tabla activa");
assert.match(htmlSource, /data-activity-format="image"/, "El editor debe permitir insertar imágenes");
assert.match(htmlSource, /data-activity-format="table"/, "El editor debe permitir insertar tablas");
assert.match(htmlSource, /data-activity-format="fullscreen"/, "El editor debe ofrecer escritura en pantalla completa");
assert.match(htmlSource, /contenteditable="true"/, "El área de contenido debe aplicar formato visual mientras se escribe");
assert.match(appSource, /updateActivityEditorStats/, "El editor debe actualizar el contador de palabras");
assert.match(appSource, /formatActivityDescription/, "Las herramientas de formato deben ser funcionales");
assert.match(appSource, /sanitizeActivityHtml/, "El contenido visual debe limpiarse antes de guardarse o mostrarse");
assert.match(appSource, /renderActivityContent/, "El alumno debe recibir el contenido con su formato visual");
assert.match(appSource, /rememberActivityEditorSelection/, "La barra debe conservar la selección al aplicar formato");
assert.doesNotMatch(appSource, /setRangeText/, "Las herramientas no deben escribir etiquetas de formato en un textarea");
assert.match(appSource, /teacher-course-open/, "Al abrir un curso debe activarse el modo de enfoque");
assert.match(appSource, /document\.body\.classList\.toggle\("teacher-course-open"/, "El modo de enfoque debe sincronizarse con el curso activo");
assert.match(appSource, /document\.body\.classList\.toggle\("student-course-open"/, "El alumno debe recibir el mismo modo de curso");
assert.doesNotMatch(appSource, /scrollIntoView|window\.scrollTo/, "Los botones no deben desplazar automáticamente la página");
assert.match(appSource, /course-home-metrics/, "El inicio del curso debe presentar métricas ordenadas");
assert.match(appSource, /course-home-open-modules/, "El inicio debe ofrecer acceso directo a los módulos");
assert.doesNotMatch(appSource, /\["modules", `Módulos \(\$\{/, "La navegación no debe mostrar el total de módulos");
assert.doesNotMatch(appSource, /\["exams", `Evaluaciones \(\$\{/, "La navegación no debe mostrar el total de evaluaciones");
assert.match(appSource, /question-bank-search/, "El banco de preguntas debe incluir búsqueda");
assert.match(appSource, /question-bank-card-metrics/, "Cada banco debe presentar sus métricas");
assert.match(cssSource, /\.canvas-item-copy small\s*\{\s*display:none/, "Los módulos docentes deben mostrar solo el nombre del contenido");
assert.match(cssSource, /\.student-activity small\s*\{\s*display:none/, "Los módulos del alumno deben mostrar solo el nombre del contenido");
assert.doesNotMatch(htmlSource, /class="brand-mark"/, "La cabecera no debe mostrar el antiguo icono de libro");
assert.doesNotMatch(cssSource, /\.dashboard-course-cover::after\s*,\s*\.student-course-cover::after/, "Las tarjetas no deben incluir círculos decorativos");
assert.match(cssSource, /\.canvas-add-content\s*\{\s*display:none/, "La acción inferior redundante para agregar contenido debe permanecer oculta");
assert.match(appSource, /\["overview", "Inicio", "home"\]/, "La navegación debe usar iconos específicos y profesionales");
assert.match(appSource, /stroke-width="1\.75"/, "Los iconos deben compartir un trazo visual consistente");
assert.match(appSource, /document\.addEventListener\("click", closeRowActionMenus\)/, "Los menús de tres puntos deben cerrarse al pulsar fuera");
assert.match(appSource, /menu\.classList\.add\("is-open"\)/, "El menú abierto debe elevarse sobre las demás filas");
assert.match(cssSource, /\.row-action-menu\.is-open\s*\{\s*z-index:60/, "El menú abierto debe tener prioridad visual");
assert.match(cssSource, /\.row-action-popover[\s\S]*?background:#fff;[\s\S]*?isolation:isolate;[\s\S]*?opacity:1;/, "El menú debe usar una superficie completamente opaca");
assert.match(cssSource, /\.canvas-module-card\.has-open-actions \.canvas-module-items\s*\{\s*overflow:visible;/, "La lista no debe recortar el menú de acciones abierto");
assert.doesNotMatch(appSource, /shell-nav-label/, "La barra lateral no debe repetir el contexto educativo");
assert.doesNotMatch(appSource, /courses-tab-count/, "La navegación no debe repetir el total de cursos");
assert.match(cssSource, /\.app-shell-mode \.brand\s*\{[\s\S]*?align-items:center;[\s\S]*?text-align:center;/, "La marca y su subtítulo deben quedar centrados");
assert.match(cssSource, /\.app-shell-mode #session-area\s*\{[\s\S]*?flex:0 0 auto;/, "La cuenta debe quedar junto a la navegación sin un vacío artificial");
assert.doesNotMatch(appSource, /<nav class="shell-teacher-nav"/, "La barra docente no debe repetir la única sección Cursos");
assert.doesNotMatch(appSource, /canvas-course-meta/, "Las tarjetas del tablero no deben repetir métricas visibles dentro del curso");
assert.match(appSource, /canvas-dashboard-actions/, "Cada curso debe mostrar acciones directas");
assert.doesNotMatch(appSource, /canvas-dashboard-actions[\s\S]*?class="\$\{deleteClass\}"/, "Las tarjetas del tablero deben mostrar solo la accion de abrir curso");
assert.match(appSource, /class="\$\{deleteClass\} danger"/, "La eliminacion debe permanecer en el menu de acciones del curso");
assert.doesNotMatch(cssSource, /\.canvas-dashboard-cover::after/, "Las tarjetas del tablero no deben incluir adornos circulares");
assert.doesNotMatch(cssSource, /\.canvas-course-cover > button::after/, "Las demás tarjetas de curso tampoco deben incluir adornos circulares");
assert.match(cssSource, /\.app-shell-mode \.user-menu\s*\{[\s\S]*?border-radius:0;[\s\S]*?background:transparent;[\s\S]*?box-shadow:none;/, "La información de cuenta debe integrarse sin otra tarjeta");
assert.match(appSource, /modernIcon\(isStudentPreview \? "edit" : "eye"\)/, "La vista del alumno debe usar un icono de previsualización profesional");
assert.match(appSource, /function openActivityModal[\s\S]*?closeRowActionMenus\(\);[\s\S]*?closeActivityMenus\(\);/, "El editor debe cerrar los menús anteriores antes de abrirse");
assert.match(cssSource, /#activity-modal\s*\{\s*z-index:120;/, "El editor debe quedar por encima de las tarjetas del módulo");
assert.match(htmlSource, /module-content-editor-head[\s\S]*?class="modal-close"[\s\S]*?<\/header>/, "El cierre debe permanecer dentro de la cabecera fija");
assert.match(htmlSource, /module-content-editor-actions/, "Las acciones del editor deben estar agrupadas");
assert.match(cssSource, /\.module-content-editor-footer\s*\{[\s\S]*?position:sticky;[\s\S]*?background:#fff;/, "La barra de acciones debe permanecer visible y usar una superficie limpia");
assert.doesNotMatch(cssSource, /\.app-shell-mode footer\s*\{/, "El pie principal no debe desplazar las barras internas del editor");
assert.match(cssSource, /\.app-shell-mode > footer\s*\{\s*margin-left:/, "El desplazamiento lateral debe limitarse al pie principal");
assert.doesNotMatch(appSource, /Continúa aprendiendo/, "El panel del alumno no debe repetir el llamado a continuar");
assert.doesNotMatch(appSource, /student-resume-panel/, "El alumno no debe recibir una tarjeta adicional de aprendizaje");
assert.doesNotMatch(appSource, /student-card-footer/, "Las tarjetas no deben repetir recuentos de actividades y evaluaciones");
assert.doesNotMatch(appSource, /contentMeta/, "El directorio del alumno no debe calcular metadatos redundantes");
assert.match(appSource, /student-dashboard-course-card/, "Las tarjetas del alumno deben compartir la estructura visual del tablero docente");
assert.doesNotMatch(appSource, /student-dashboard-progress/, "Las tarjetas del alumno no deben mostrar progreso ni informacion adicional");
assert.doesNotMatch(appSource, /student-course-exams/, "Las evaluaciones no deben repetirse fuera de sus módulos");
assert.doesNotMatch(appSource, /ESPACIO DEL CURSO/, "La cabecera del alumno no debe repetir el contexto del curso");
assert.doesNotMatch(appSource, /Avanza por las páginas/, "La vista interna no debe añadir instrucciones redundantes");
assert.match(appSource, /student-course-sidebar-progress/, "El progreso debe aprovechar el lateral del curso");
assert.match(appSource, /activeStudentCourseSection/, "El curso debe conservar su sección contextual activa");
assert.match(appSource, /renderStudentCourseGrades/, "El alumno debe consultar las calificaciones del curso específico");
assert.match(appSource, /myGrades\.filter\(grade => grade\.courseId === course\.id\)/, "Las calificaciones internas deben filtrarse por curso");
assert.match(cssSource, /\.student-course-sidebar\s*\{[\s\S]*?flex-direction:column;/, "La navegación del curso debe ocupar el lateral izquierdo");
assert.doesNotMatch(appSource, /student-course-grades/, "El acceso contextual no debe enviar al alumno a la tabla global");
assert.match(cssSource, /body\.student-course-open\.app-shell-mode > main\s*\{[\s\S]*?padding:0;/, "El curso interno debe ocupar la pantalla sin marco exterior");
assert.match(cssSource, /body\.student-course-open \.student-course-page\s*\{[\s\S]*?max-width:none;[\s\S]*?min-height:100vh;/, "La estructura del curso debe usar todo el ancho y alto");
assert.match(cssSource, /body\.student-course-open \.student-course-content\s*\{[\s\S]*?width:100%;[\s\S]*?max-width:none;[\s\S]*?margin:0;/, "El contenido no debe heredar el centrado del main general");
assert.doesNotMatch(appSource, /student-activity-action|student-activity-state/, "Los contenidos no deben repetir controles circulares de finalización");
assert.doesNotMatch(appSource, /continue-course/, "La cabecera de módulos no debe repetir el acceso al contenido");
assert.match(appSource, /class="module-expand-control"/, "Cada módulo debe ofrecer un control de expansión");
assert.match(cssSource, /\.module-expand-control:empty::before\s*\{\s*content:"\+";/, "El módulo contraído debe mostrar el control +");
assert.match(cssSource, /details\[open\] > summary \.module-expand-control:empty::before\s*\{\s*content:"−";/, "El módulo expandido debe mostrar el control −");
assert.match(appSource, /class="module-sequence"[^>]*>\$\{moduleIndex \+ 1\}/, "Los módulos docentes deben usar numeración");
assert.match(appSource, /class="activity-sequence"[^>]*>\$\{activityIndex \+ 1\}/, "Las actividades deben usar numeración");
assert.doesNotMatch(appSource, /class="publish-check/, "Los checks de publicación deben sustituirse por numeración y texto");
assert.doesNotMatch(htmlSource, /class="lesson-tabs"/, "La página de contenido no debe mostrar pestañas vacías o redundantes");
assert.doesNotMatch(appSource, /renderLessonTabs/, "El contenido no debe duplicarse en paneles secundarios");
assert.match(appSource, /ACTIVE_LESSON_KEY/, "La lección activa debe conservarse durante recargas y sincronizaciones");
assert.match(appSource, /else if \(activeLessonCourseId && activeLessonActivityId\) renderLesson\(\)/, "Los refrescos de sesión deben mantener abierta la lección");
assert.match(appSource, /saveActiveLesson\(\);[\s\S]*?renderLesson\(\);/, "Abrir una actividad debe guardar su estado antes de renderizarla");
assert.match(cssSource, /\.lesson-mode > \.topbar,[\s\S]*?display:none !important;/, "La lectura debe ocultar la cabecera global que distrae");
assert.match(cssSource, /\.lesson-reading-panel\s*\{[\s\S]*?background:#fff;/, "El contenido debe presentarse en una superficie limpia");
assert.doesNotMatch(htmlSource, /lesson-progress-compact|lesson-progress-label|lesson-progress-bar/, "La cabecera de la lección no debe repetir el progreso");
assert.doesNotMatch(appSource, /#lesson-progress-label|#lesson-progress-bar/, "La lección no debe mantener lógica para un progreso eliminado");
assert.match(cssSource, /\.lesson-reading-panel\s*\{[\s\S]*?min-height:0;/, "La lectura debe ajustarse a la altura real del contenido");
assert.match(cssSource, /\.lesson-reading-panel > \.lesson-rich-content\s*\{[\s\S]*?text-align:justify;/, "El texto de la lección debe mostrarse justificado");
assert.match(htmlSource, /id="lesson-menu-toggle"[\s\S]*?lesson-menu-icon[\s\S]*?Ver módulos/, "El control móvil debe identificarse claramente como acceso a los módulos");
assert.match(cssSource, /\.lesson-menu-toggle\s*\{[\s\S]*?background:#4c568f;/, "El botón de módulos debe tener una apariencia moderna y reconocible");
assert.match(cssSource, /body\.student-course-open #student-view > \.dashboard-head,[\s\S]*?display:none !important;/, "El saludo general debe ocultarse al entrar en un curso");
assert.match(appSource, /module\.activities\.map\(\(?activity/, "El alumno debe recibir las evaluaciones dentro de la secuencia de cada módulo");

assert.match(htmlSource, /styles\.css\?v=20260808-01/, "La hoja de estilos debe invalidar la cachÃ© al publicar cambios del panel del alumno");
assert.match(htmlSource, /app\.js\?v=20260808-01/, "El script debe invalidar la cachÃ© al publicar cambios del panel del alumno");
assert.match(cssSource, /body\.student-course-open \.student-course-page\s*\{[\s\S]*?min-height:100vh;[\s\S]*?margin:0;/, "El espacio del curso del alumno debe conservar una altura visible");
assert.doesNotMatch(cssSource, /body\.student-course-open \.student-course-page\s*\{[^}]*height:\s*18px/, "El espacio del curso del alumno no debe colapsarse a una altura fija");

assert.match(appSource, /function normalizeRole\(value\)/, "La aplicaciÃ³n debe normalizar roles histÃ³ricos de Supabase");
assert.match(appSource, /"administraci\\u00f3n":\s*"admin"/, "El rol administraciÃ³n debe abrir el panel administrador");
assert.match(appSource, /maestro:\s*"teacher"/, "El rol maestro debe abrir el panel docente");
assert.match(htmlSource, /id="admin-view" class="view admin-panel"/, "El panel administrador debe tener una vista renderizable");
assert.match(htmlSource, /id="admin-teachers-table"/, "El panel administrador debe incluir la tabla de profesores");
assert.match(htmlSource, /id="admin-teacher-modal"/, "El panel administrador debe incluir el modal de edición de profesores");

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
