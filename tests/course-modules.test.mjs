import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const enrollmentMigrationSource = fs.readFileSync(new URL("../supabase/migrations/20260803000000_add_course_enrollments.sql", import.meta.url), "utf8");
const teacherCanvasSource = appSource.slice(appSource.indexOf("function renderTeacherCourseModulesCanvas"), appSource.indexOf("function renderTeacherCourseOverview"));
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
assert.match(appSource, /class="modern-icon icon-\$\{esc\(key\)\}" data-icon="\$\{esc\(key\)\}"/, "Cada icono debe exponer su tipo para recibir un acabado visual propio");
assert.match(appSource, /practice: `<path[\s\S]*?quiz: `<rect[\s\S]*?discussion: `<path[\s\S]*?live: `<rect/, "Las actividades deben conservar iconos modernos y reconocibles por tipo");
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
assert.match(htmlSource, /class="module-content-head-actions"[\s\S]*?module-content-step[\s\S]*?class="modal-close"/, "El indicador y el cierre deben compartir una zona de acciones alineada");
assert.match(cssSource, /\.module-content-head-actions\s*\{[\s\S]*?align-items:center;/, "Las acciones de la cabecera deben compartir el mismo eje vertical");
assert.match(cssSource, /\.module-content-head-actions > \.modal-close\s*\{[\s\S]*?position:static;/, "Cerrar debe mantenerse alineado dentro de la cabecera durante el scroll");
assert.match(htmlSource, /module-content-editor-actions/, "Las acciones del editor deben estar agrupadas");
assert.match(cssSource, /\.module-content-editor-footer\s*\{[\s\S]*?position:sticky;[\s\S]*?background:#fff;/, "La barra de acciones debe permanecer visible y usar una superficie limpia");
assert.doesNotMatch(cssSource, /\.app-shell-mode footer\s*\{/, "El pie principal no debe desplazar las barras internas del editor");
assert.match(cssSource, /\.app-shell-mode > footer\s*\{\s*margin-left:/, "El desplazamiento lateral debe limitarse al pie principal");
assert.doesNotMatch(appSource, /Continúa aprendiendo/, "El panel del alumno no debe repetir el llamado a continuar");
assert.doesNotMatch(appSource, /student-resume-panel/, "El alumno no debe recibir una tarjeta adicional de aprendizaje");
assert.doesNotMatch(appSource, /student-card-footer/, "Las tarjetas no deben repetir recuentos de actividades y evaluaciones");
assert.doesNotMatch(appSource, /contentMeta/, "El directorio del alumno no debe calcular metadatos redundantes");
assert.match(appSource, /student-dashboard-course-card/, "Las tarjetas del alumno deben compartir la estructura visual del tablero docente");
assert.match(appSource, /manage-course-content open-student-course/, "El botón del alumno debe compartir tamaño, posición y acabado con el botón docente");
assert.match(cssSource, /\.student-dashboard-course-card \.canvas-dashboard-card-body\s*\{[\s\S]*?min-height:0;/, "La tarjeta del alumno no debe conservar una altura vacía artificial");
assert.match(cssSource, /\.student-dashboard-actions\s*\{[\s\S]*?justify-content:flex-start;/, "El acceso al curso del alumno debe quedar alineado a la izquierda");
assert.doesNotMatch(appSource, /student-dashboard-progress/, "Las tarjetas del alumno no deben mostrar progreso ni informacion adicional");
assert.doesNotMatch(appSource, /student-course-exams/, "Las evaluaciones no deben repetirse fuera de sus módulos");
assert.doesNotMatch(appSource, /ESPACIO DEL CURSO/, "La cabecera del alumno no debe repetir el contexto del curso");
assert.doesNotMatch(appSource, /Avanza por las páginas/, "La vista interna no debe añadir instrucciones redundantes");
assert.match(appSource, /student-course-sidebar-progress/, "El progreso debe aprovechar el lateral del curso");
assert.match(appSource, /activeStudentCourseSection/, "El curso debe conservar su sección contextual activa");
assert.match(appSource, /renderStudentCourseGrades/, "El alumno debe consultar las calificaciones del curso específico");
assert.match(appSource, /myGrades\.filter\(grade => grade\.courseId === course\.id\)/, "Las calificaciones internas deben filtrarse por curso");
assert.match(cssSource, /\.student-course-sidebar\s*\{[\s\S]*?flex-direction:column;/, "La navegación del curso debe ocupar el lateral izquierdo");
assert.match(cssSource, /\.student-course-sidebar\s*\{[\s\S]*?position:sticky;[\s\S]*?height:100vh;/, "La barra lateral del curso debe permanecer fija durante el desplazamiento");
assert.match(cssSource, /\.student-course-sidebar-progress\s*\{[\s\S]*?margin-top:22px;/, "El progreso debe aparecer inmediatamente después de la navegación");
assert.doesNotMatch(appSource, /student-course-grades/, "El acceso contextual no debe enviar al alumno a la tabla global");
assert.match(cssSource, /body\.student-course-open\.app-shell-mode > main\s*\{[\s\S]*?padding:0;/, "El curso interno debe ocupar la pantalla sin marco exterior");
assert.match(cssSource, /body\.student-course-open \.student-course-page\s*\{[\s\S]*?max-width:none;[\s\S]*?min-height:100vh;/, "La estructura del curso debe usar todo el ancho y alto");
assert.match(cssSource, /body\.student-course-open \.student-course-content\s*\{[\s\S]*?width:100%;[\s\S]*?max-width:none;[\s\S]*?margin:0;/, "El contenido no debe heredar el centrado del main general");
assert.doesNotMatch(appSource, /student-activity-action|student-activity-state/, "Los contenidos no deben repetir controles circulares de finalización");
assert.doesNotMatch(appSource, /continue-course/, "La cabecera de módulos no debe repetir el acceso al contenido");
assert.match(teacherCanvasSource, /class="module-disclosure"/, "Cada módulo docente debe mostrar una flecha de expansión");
assert.doesNotMatch(teacherCanvasSource, /module-expand-control/, "El módulo docente no debe repetir la expansión con un botón separado");
assert.match(cssSource, /\.canvas-module-card\[open\] > summary \.module-disclosure\s*\{[\s\S]*?transform:rotate\(90deg\);/, "La flecha debe cambiar de orientación al desplegar el módulo");
assert.match(appSource, /class="module-sequence"[^>]*>\$\{moduleIndex \+ 1\}/, "Los módulos docentes deben usar numeración");
assert.doesNotMatch(teacherCanvasSource, /class="activity-sequence"/, "Las actividades docentes no deben mostrar numeración redundante");
const studentModulesSource = appSource.slice(appSource.indexOf("function renderStudentCourseModules"), appSource.indexOf("function accessibleCourseActivities"));
assert.match(studentModulesSource, /class="module-disclosure"[^>]*>›<\/span><span class="module-sequence"/, "El alumno debe usar la misma flecha y numeración de módulo que el profesor");
assert.doesNotMatch(studentModulesSource, /class="activity-sequence"/, "Las actividades del alumno no deben mostrar numeración redundante");
assert.doesNotMatch(studentModulesSource, /class="module-expand-control"/, "El alumno no debe mostrar el antiguo botón de expansión");
assert.match(cssSource, /\.student-activity > \.start-exam\s*\{[\s\S]*?border:0;[\s\S]*?background:transparent;/, "Las evaluaciones del módulo y su previsualización no deben convertirse en franjas de color");
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
assert.match(htmlSource, /class="lesson-sidebar-head"[\s\S]*?id="lesson-return"[\s\S]*?id="lesson-module-tree"/, "El regreso debe permanecer dentro de la barra lateral de todas las actividades");
assert.match(htmlSource, /class="lesson-title-row"[\s\S]*?id="lesson-media"/, "El título de la actividad debe aparecer antes del video o recurso integrado");
assert.doesNotMatch(appSource, /Abrir recurso/, "El video integrado no debe repetirse como un enlace externo");
assert.match(appSource, /const externalResource = url && !\["video", "pdf"\]\.includes\(activity\.type\);/, "Los videos y PDF deben permanecer integrados en la página");
assert.match(cssSource, /\.lesson-tree-module > div\s*\{[\s\S]*?gap:6px;/, "Las opciones laterales deben tener separación visual suficiente");
assert.match(cssSource, /body\.student-course-open #student-view > \.dashboard-head,[\s\S]*?display:none !important;/, "El saludo general debe ocultarse al entrar en un curso");
assert.match(appSource, /module\.activities\.map\(\(?activity/, "El alumno debe recibir las evaluaciones dentro de la secuencia de cada módulo");
assert.match(appSource, /await loadCourseAccess\(\);[\s\S]*?await loadDynamicCourses\(\);/, "Las matrículas deben cargarse antes que el contenido publicado");
assert.match(appSource, /enrollment\.status === "active" && enrollment\.student_id === currentUser\?\.id/, "Las matrículas visibles deben pertenecer al alumno autenticado");
assert.match(appSource, /currentUser\?\.role === "student" \? mergedCourses\.filter\(course => enrolledCourseIds\.has\(course\.id\)\)/, "El alumno solo debe conservar cursos con matrícula activa");
assert.match(appSource, /Aún no tienes cursos autorizados/, "El estado vacío debe explicar que el profesor concede el acceso");
assert.match(appSource, /function renderTeacherCoursePeople[\s\S]*?course-access-form[\s\S]*?Autorizar alumno/, "Personas debe administrar alumnos autorizados por correo");
assert.match(appSource, /sb\.rpc\("grant_course_access"/, "La autorización debe usar la función segura de Supabase");
assert.match(appSource, /sb\.rpc\("revoke_course_access"/, "El profesor debe poder retirar el acceso");
assert.match(enrollmentMigrationSource, /create table if not exists public\.course_enrollments/, "La migración debe crear la tabla de matrículas");
assert.match(enrollmentMigrationSource, /alter table public\.course_enrollments enable row level security;/, "Las matrículas deben tener RLS habilitado");
assert.match(enrollmentMigrationSource, /published = true and public\.is_enrolled\(course_id\)/, "Los cursos publicados deben exigir matrícula al alumno");
assert.match(enrollmentMigrationSource, /student_id = auth\.uid\(\) and public\.is_enrolled\(course_id\)/, "Un alumno no debe registrar resultados en cursos no autorizados");
assert.match(enrollmentMigrationSource, /grant_course_access[\s\S]*?role = 'student'/, "La autorización debe aceptar únicamente cuentas de alumno registradas");

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const declarationStart = appSource.slice(Math.max(0, start - 6), start) === "async " ? start - 6 : start;
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(declarationStart, index + 1);
  }
  throw new Error(`La función ${name} está incompleta`);
}

const saveExamSource = extractFunction("saveExamDraft");
assert.match(htmlSource, /class="editor-sticky-bar"[\s\S]*?class="exam-editor-header-actions"[\s\S]*?class="modal-close"/, "Cerrar debe permanecer dentro de la cabecera fija del editor");
assert.match(saveExamSource, /persistPublishedCourseModules[\s\S]*?cachePublishedExamAssignment[\s\S]*?closeModal\("exam-modal"\);[\s\S]*?renderTeacher\(\);/, "La asignación debe persistirse antes de cerrar el editor y actualizar la vista");
assert.match(htmlSource, /id="return-student"[^>]*>[\s\S]*?Volver a calificaciones/, "La revisión debe regresar a las calificaciones del curso");
assert.match(htmlSource, /id="lesson-return" class="lesson-sidebar-return contextual-back"[\s\S]*?Volver a módulos/, "La lección debe regresar a módulos desde la barra lateral");
assert.match(appSource, /course-workspace-back contextual-back[\s\S]*?back-to-student-courses/, "Las páginas internas deben compartir el patrón de navegación contextual");
assert.doesNotMatch(htmlSource, /Volver a mis cursos/, "La revisión no debe conservar el antiguo regreso al directorio general");
assert.match(appSource, /function returnFromResult[\s\S]*?activeStudentCourseId = publishedCourses\.some[\s\S]*?activeStudentCourseSection = "grades";/, "El regreso desde resultados debe abrir las calificaciones del curso evaluado");
assert.match(cssSource, /body\.result-game-mode > \.topbar,[\s\S]*?display:none !important;/, "La revisión no debe mostrar nombre, correo ni acciones globales del alumno");
assert.match(cssSource, /body\.result-game-mode #return-student\s*\{[\s\S]*?position:static;[\s\S]*?background:#fff;[\s\S]*?box-shadow:none;/, "El regreso de resultados no debe conservar el antiguo botón rojo flotante");
assert.match(htmlSource, /class="result-page-header"[\s\S]*?class="result-summary-card"/, "El resultado debe usar una cabecera y un resumen profesional separados");
assert.match(appSource, /function reviewSectionMarkup\(grades\)\s*\{\s*return reviewMarkup\(grades\);/, "La revisión no debe repetir encabezados descriptivos");
assert.doesNotMatch(htmlSource, /result-encouragement|result-sync-status|>RESULTADO</, "El resumen debe conservar únicamente los datos esenciales");
assert.doesNotMatch(appSource, /No te rindas\. Revisar tus respuestas/, "La frase motivacional solicitada debe eliminarse");
assert.doesNotMatch(appSource, /id="sound-btn"|soundControl/, "El menú del alumno no debe mostrar el control de sonido");
assert.match(appSource, /const resultReviewOpen[\s\S]*?if \(resultReviewOpen\) show\("result-view"\);/, "La renovación de sesión debe conservar abierta la revisión de resultados");
const lessonTreeSource = appSource.slice(appSource.indexOf("function renderLessonTree"), appSource.indexOf("function completeActiveLesson"));
assert.doesNotMatch(lessonTreeSource, /activity-sequence|activityIndex|index \+ 1/, "El árbol lateral de lecciones no debe mostrar numeración");

const context = {
  courseProgress: {},
  courseEnrollments: [{ course_id:"course-1", student_id:"student-1", status:"active" }],
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
  extractFunction("applyExamModuleAssignment"),
  extractFunction("cachePublishedExamAssignment"),
  extractFunction("persistPublishedCourseModules"),
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

context.uid = () => "quiz-link-new";
const assignedModules = context.applyExamModuleAssignment([
  { id:"module-a", title:"A", activities:[{ id:"quiz-link", title:"Nombre anterior", type:"quiz", examId:"exam-2" }] },
  { id:"module-b", title:"B", activities:[] }
], { id:"exam-2", title:"Examen actualizado", published:true, minutes:30, attemptsAllowed:2 }, "module-b");
assert.equal(assignedModules[0].activities.length, 0, "Mover una evaluación debe retirarla del módulo anterior");
assert.equal(assignedModules[1].activities.length, 1, "La evaluación debe aparecer una sola vez en el módulo elegido");
assert.equal(assignedModules[1].activities[0].id, "quiz-link", "Mover una evaluación debe conservar la identidad de su actividad");
assert.equal(assignedModules[1].activities[0].title, "Examen actualizado", "La actividad vinculada debe reflejar el nombre actual del examen");
assert.equal(assignedModules[1].activities[0].completionRule, "pass", "La evaluación asignada debe completarse al aprobarse");
const unassignedModules = context.applyExamModuleAssignment(assignedModules, { id:"exam-2", title:"Examen actualizado", published:true, minutes:30, attemptsAllowed:2 }, "");
assert.equal(unassignedModules.flatMap(module => module.activities).length, 0, "Sin asignar debe retirar el vínculo del recorrido del curso");
context.publishedCourses = [{ id:"course-1", name:"Curso", modules:[] }];
context.publishedExams = [{ id:"exam-2", courseId:"course-1", title:"Nombre anterior", questions:[] }];
context.cachePublishedExamAssignment(context.publishedCourses[0], { id:"exam-2", courseId:"course-1", title:"Examen actualizado", questions:[], published:true }, assignedModules);
assert.equal(context.publishedCourses[0].modules[1].activities[0].examId, "exam-2", "La vista local debe reflejar inmediatamente la evaluación dentro del módulo");
assert.equal(context.publishedExams[0].title, "Examen actualizado", "La vista local debe reflejar inmediatamente los cambios del examen");
context.currentUser = { id:"teacher-1", role:"teacher" };
context.isMissingModulesColumn = () => false;
context.removeLegacyCourseModules = async () => {};
context.saveLegacyCourseModules = async () => ({ error:null });
context.sb = { from:() => ({ upsert:row => ({ select:() => ({ single:async () => ({ data:{ course_id:row.course_id, modules:row.modules }, error:null }) }) }) }) };
const persistedModules = await context.persistPublishedCourseModules({ id:"course-1", name:"Curso", description:"" }, assignedModules);
assert.equal(persistedModules.error, null, "La persistencia explícita de módulos debe completarse sin errores");
assert.equal(persistedModules.modules[1].activities[0].examId, "exam-2", "La confirmación persistida debe conservar el vínculo de la evaluación");
context.catalogCourses = [];
context.dynamicCourses = [{ id:"course-1", name:"Curso", description:"", modules:[] }];
context.courseChanges = [{ course_id:"course-1", name:"Curso", description:"", modules:persistedModules.modules, deleted:false }];
context.legacyCourseModules = new Map();
context.catalogExams = [];
context.dynamicExams = [{ id:"exam-2", courseId:"course-1", title:"Examen actualizado", published:true, questions:[] }];
vm.runInContext(extractFunction("applyCourseChanges"), context);
context.applyCourseChanges();
assert.equal(context.publishedCourses[0].modules[1].activities[0].examId, "exam-2", "Una sincronización posterior no debe eliminar la asignación persistida");
context.currentUser = { id:"student-1", role:"student" };
context.courseProgress = {};
context.results = [];
const studentAssignedActivities = context.accessibleCourseActivities(context.publishedCourses[0]);
assert.equal(studentAssignedActivities.some(activity => activity.examId === "exam-2" && activity.type === "quiz"), true, "La evaluación persistida debe formar parte del recorrido accesible del alumno");
context.publishedExams = [{ id:"exam-2", courseId:"course-1", title:"Examen actualizado" }];
context.esc = value => String(value);
context.modernIcon = () => "";
context.unlockRuleLabel = () => "Disponible inmediatamente";
vm.runInContext(extractFunction("renderStudentCourseModules"), context);
const studentModuleMarkup = context.renderStudentCourseModules(context.publishedCourses[0], []);
assert.match(studentModuleMarkup, /class="start-exam" data-id="exam-2"/, "La plataforma del alumno debe mostrar la evaluación asignada como botón para iniciar");

for (const type of ["page","file","video","link","practice","task","quiz","discussion","live","heading"]) {
  assert.match(htmlSource, new RegExp(`value="${type}"`), `Falta el tipo ${type} en el selector`);
}
for (const field of ["activity-published","activity-completion-rule","activity-exam-id","activity-submission-field"]) {
  assert.match(htmlSource, new RegExp(`id="${field}"`), `Falta el campo ${field}`);
}
assert.match(appSource, /Sin asignar a un módulo/, "Las evaluaciones históricas sin módulo deben identificarse");
assert.match(htmlSource, /id="editor-module"/, "El editor de evaluaciones debe permitir elegir un módulo");
assert.doesNotMatch(appSource, /exam-assignment-action|data-focus-module/, "La asignación debe administrarse dentro de Modificar, sin un botón independiente");
assert.match(appSource, /persistPublishedCourseModules[\s\S]*?\.select\("course_id, modules"\)\.single\(\)/, "La asignación publicada debe confirmarse directamente desde course_changes");
assert.match(appSource, /const exam = activity\.examId \? publishedExams\.find[\s\S]*?"start-exam"/, "La evaluación asignada debe mostrarse como acción disponible para el alumno");
assert.match(appSource, /Filtro de las tareas ya ubicadas en los módulos/, "La vista global de tareas debe ser un filtro");
assert.doesNotMatch(appSource, /student-todo-panel/, "El panel del alumno no debe mostrar el bloque de evaluaciones pendientes");
assert.doesNotMatch(htmlSource, /<div class="tabs">\s*<button class="tab active" data-student-tab/, "El panel del alumno no debe duplicar la navegación en una barra horizontal");
assert.match(appSource, /shell-student-nav/, "Cursos y calificaciones deben estar disponibles desde la navegación lateral");

console.log("OK: arquitectura de módulos, publicación, progreso, tareas y evaluaciones");
