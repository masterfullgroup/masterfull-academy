const DRAFT_KEY = "aulaquiz_local_drafts_v1";
const ACTIVE_ATTEMPT_KEY = "aulaquiz_active_attempt_v2";
const PENDING_RESULTS_KEY = "aulaquiz_pending_results_v1";
const SOUND_KEY = "aulaquiz_sound_enabled_v1";
const COURSE_PROGRESS_KEY = "masterfull_course_progress_v1";
const ACTIVE_LESSON_KEY = "masterfull_active_lesson_v1";
const CATALOG_URL = "./data/catalog.json";
const LEGACY_MODULE_ROW_PREFIX = "__mfmod__:";

const emptyDrafts = { courses: [], exams: [] };
let drafts = load(DRAFT_KEY, emptyDrafts);
let pendingResults = load(PENDING_RESULTS_KEY, []);
let sb = null;
let currentUser = null;
let catalog = null;
let catalogCourses = [];
let catalogExams = [];
let dynamicCourses = [];
let dynamicExams = [];
let courseChanges = [];
let legacyCourseModules = new Map();
let courseEnrollments = [];
let studentProfiles = [];
let adminProfiles = [];
let activeAdminSection = "dashboard";
let adminTeacherPage = 1;

const ADMIN_TEACHERS_PER_PAGE = 10;

let courseAccessError = "";
let publishedCourses = [];
let publishedExams = [];
let results = [];
let activeExam = null;
let activeCourse = null;
let resultCourseId = "";
let activeQuestions = [];
let timerInterval = null;
let secondsLeft = 0;
let examStartedAt = null;
let activeSubmissionId = null;
let finishingExam = false;
let publishingCourseId = null;
let builderQuestions = [];
let builderOptionCount = 5;
let soundEnabled = localStorage.getItem(SOUND_KEY) !== "false";
let courseProgress = load(COURSE_PROGRESS_KEY, {});
let audioContext = null;
let authTransitionPending = false;
let minuteWarningPlayed = false;
let appReady = false;
let activeTeacherCourseId = null;
let activeTeacherCourseSection = "overview";
let activeTeacherWorkspaceOrigin = "exams";
let activeStudentCourseId = null;
let activeStudentCourseSection = "modules";
const savedLesson = load(ACTIVE_LESSON_KEY, { courseId:"", activityId:"" });
let activeLessonCourseId = savedLesson.courseId || null;
let activeLessonActivityId = savedLesson.activityId || null;
let activityEditorRange = null;
let activityEditorTableCell = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}
function saveDrafts() { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); }
function savePending() { localStorage.setItem(PENDING_RESULTS_KEY, JSON.stringify(pendingResults)); }
function saveCourseProgress() { localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(courseProgress)); }
function saveActiveLesson() {
  if (activeLessonCourseId && activeLessonActivityId) localStorage.setItem(ACTIVE_LESSON_KEY, JSON.stringify({ courseId:activeLessonCourseId, activityId:activeLessonActivityId }));
  else localStorage.removeItem(ACTIVE_LESSON_KEY);
}
function normalizeModules(value) {
  if (!Array.isArray(value)) return [];
  const supportedTypes = ["page","lesson","file","video","pdf","download","practice","task","quiz","discussion","live","heading","link"];
  return value.map((module, moduleIndex) => ({
    id: String(module.id || `module-${moduleIndex + 1}`),
    title: String(module.title || module.name || `Módulo ${moduleIndex + 1}`).trim(),
    unlockRule: ["immediate","previous","evaluation","date"].includes(module.unlockRule || module.unlock_rule) ? (module.unlockRule || module.unlock_rule) : "immediate",
    unlockDetail: String(module.unlockDetail || module.unlock_detail || "").trim(),
    published: module.published !== false,
    activities: (Array.isArray(module.activities) ? module.activities : []).map((activity, activityIndex) => ({
      id: String(activity.id || `activity-${moduleIndex + 1}-${activityIndex + 1}`),
      title: String(activity.title || activity.name || `Actividad ${activityIndex + 1}`).trim(),
      type: supportedTypes.includes(activity.type) ? activity.type : "lesson",
      url: String(activity.url || "").trim(),
      description: String(activity.description || "").trim(),
      published: activity.published !== false,
      examId: String(activity.examId || activity.exam_id || "").trim(),
      dueAt: String(activity.dueAt || activity.due_at || "").trim(),
      points: Math.max(0, Number(activity.points) || 0),
      duration: Math.max(0, Number(activity.duration) || 0),
      attempts: Math.max(0, Number(activity.attempts) || 0),
      completionRule: ["none","view","manual","submit","pass"].includes(activity.completionRule || activity.completion_rule) ? (activity.completionRule || activity.completion_rule) : (activity.type === "heading" ? "none" : "manual"),
      submissionTypes: Array.isArray(activity.submissionTypes || activity.submission_types) ? [...new Set(activity.submissionTypes || activity.submission_types)].filter(type => ["file","text","url","questions","none"].includes(type)) : []
    }))
  }));
}
function legacyModuleHash(value) {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8,"0")}${(second >>> 0).toString(16).padStart(8,"0")}`;
}
function legacyModulePrefix(courseId) { return `${LEGACY_MODULE_ROW_PREFIX}${legacyModuleHash(String(courseId))}:`; }
function isLegacyModuleRow(row) { return String(row?.course_id || "").startsWith(LEGACY_MODULE_ROW_PREFIX); }
function decodeLegacyModuleRows(rows, courses) {
  const decoded = new Map();
  const available = rows.filter(row => isLegacyModuleRow(row) && !row.deleted);
  courses.forEach(course => {
    const prefix = legacyModulePrefix(course.id);
    const chunks = available.filter(row => row.course_id.startsWith(prefix)).sort((left, right) => left.course_id.localeCompare(right.course_id));
    if (!chunks.length) return;
    try { decoded.set(course.id, normalizeModules(JSON.parse(chunks.map(row => row.description || "").join("")))); }
    catch (error) { console.error(`Módulos compatibles dañados para ${course.id}:`, error); }
  });
  return decoded;
}
function isMissingModulesColumn(error) {
  const detail = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return detail.includes("42703") || detail.includes("pgrst204") || (detail.includes("modules") && (detail.includes("column") || detail.includes("schema cache")));
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));
}
function empty(message, colspan = 1) { return `<tr><td colspan="${colspan}" class="empty">${esc(message)}</td></tr>`; }
function emptyCard(message) { return `<div class="empty">${esc(message)}</div>`; }
function quantity(value, singular, plural = `${singular}s`) { return `${value} ${value === 1 ? singular : plural}`; }
function shortDate(value) { return value ? new Date(value).toLocaleDateString("es-PE") : ""; }
function formatDateOnly(value) { return value ? new Date(value).toLocaleDateString("es-PE", { day:"2-digit", month:"2-digit", year:"numeric" }) : "-"; }
function formatTimeOnly(value) { return value ? new Date(value).toLocaleTimeString("es-PE", { hour:"2-digit", minute:"2-digit", second:"2-digit" }) : "-"; }
function modernIcon(name) {
  const paths = {
    courses: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>`,
    exams: `<path d="M9 5h10a2 2 0 0 1 2 2v12H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M7 7H5a2 2 0 0 0-2 2v10h14M12 9h5M12 13h5"/>`,
    results: `<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="9"/>`,
    course: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h8"/>`
    ,lesson: `<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h6"/>`
    ,page: `<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h7M9 16h7"/>`
    ,video: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>`
    ,pdf: `<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h4"/>`
    ,download: `<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 20h14"/>`
    ,task: `<path d="M7 4h10v17H7z"/><path d="M9 4V2h6v2M10 9h4M10 13h4M10 17h3"/>`
    ,practice: `<path d="M5 19h14M7 16l4-10h2l4 10M9 12h6"/>`
    ,quiz: `<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.2 2.1c-.8.4-1 1-1 1.9M12 17h.01"/>`
    ,link: `<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>`
    ,file: `<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 13h6M9 17h4"/>`
    ,discussion: `<path d="M4 5h16v12H8l-4 4z"/><path d="M8 9h8M8 13h5"/>`
    ,live: `<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>`
    ,heading: `<path d="M5 6v12M19 6v12M5 12h14"/>`
    ,progress: `<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>`
    ,certificate: `<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1 8 4.5-2 4.5 2-1-8M9.5 9l1.5 1.5L14.5 7"/>`
    ,students: `<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M17 14a5 5 0 0 1 4 5"/>`
    ,home: `<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>`
    ,modules: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`
    ,clipboard: `<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>`
    ,grade: `<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/>`
    ,users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>`
    ,folder: `<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`
    ,library: `<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5z"/><path d="M8 7h7M8 11h7"/>`
    ,trash: `<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>`
    ,eye: `<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/>`
    ,edit: `<path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>`
    ,settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>`
  };
  const aliases = { "▦": "courses", "▤": "exams", "✓": "results", "◇": "course" };
  const key = aliases[name] || name;
  return `<svg class="modern-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths[key] || paths.course}</svg>`;
}
function stat(label, value, icon, action = "") { return `<button class="stat-card" type="button" data-stat-action="${action}"><span>${modernIcon(icon)}</span><span><strong>${esc(value)}</strong><small>${esc(label)}</small></span></button>`; }
function formatDate(value) { return value ? new Date(value).toLocaleString("es-PE") : "-"; }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"','""')}"`; }
function normalizeRole(value) {
  const role = String(value || "").trim().toLocaleLowerCase("es");
  const aliases = {
    admin: "admin",
    administrador: "admin",
    "administraci\u00f3n": "admin",
    teacher: "teacher",
    maestro: "teacher",
    profesor: "teacher",
    student: "student",
    alumno: "student",
    estudiante: "student"
  };
  return aliases[role] || "";
}
function slug(value) {
  return String(value || "examen").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "examen";
}
function show(id) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === id));
  document.body.classList.toggle("app-shell-mode", ["teacher-view","student-view"].includes(id));
  if (id !== "teacher-view") document.body.classList.remove("teacher-course-open");
  if (id !== "student-view") document.body.classList.remove("student-course-open");
  document.body.classList.toggle("lesson-mode", id === "lesson-view");
  document.body.classList.toggle("exam-in-progress", id === "exam-view");
  document.body.classList.remove("student-game-mode");
  document.body.classList.toggle("result-game-mode", id === "result-view");
  document.body.classList.toggle("auth-game-mode", id === "auth-view");
}
function setSessionMessage(message, type = "muted") {
  $("#session-area").innerHTML = `<span class="${esc(type)} small">${esc(message)}</span>`;
}
function isSupabaseConfigured() {
  const cfg = getSupabaseConfig();
  return Boolean(cfg.url?.startsWith("https://") &&
    cfg.publishableKey?.startsWith("sb_publishable_") &&
    !cfg.url.includes("__") &&
    !cfg.publishableKey.includes("__"));
}
function getSupabaseConfig() {
  const cfg = window.APP_CONFIG || {};
  const legacyUrlKey = ["SUPABASE", "URL"].join("_");
  const legacyKeyName = ["SUPABASE", "PUBLISHABLE", "KEY"].join("_");
  return {
    url: cfg.url || cfg[legacyUrlKey] || "",
    publishableKey: cfg.publishableKey || cfg[legacyKeyName] || ""
  };
}
function initSupabase() {
  if (!isSupabaseConfigured() || !window.supabase?.createClient) return null;
  const cfg = getSupabaseConfig();
  return window.supabase.createClient(
    cfg.url,
    cfg.publishableKey,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
}
function translateError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (!msg) return "Ocurrió un problema. Inténtalo nuevamente.";
  if (msg.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (msg.includes("email not confirmed")) return "Debes confirmar tu correo antes de ingresar.";
  if (msg.includes("already registered") || msg.includes("user already")) return "Este correo ya está registrado.";
  if (msg.includes("password")) return "La contraseña no cumple los requisitos. Usa mínimo 8 caracteres.";
  if (msg.includes("duplicate key")) return "Ese registro ya existe. No se duplicó.";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "No tienes permisos para realizar esta acción.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "No hay conexión o Supabase no respondió.";
  return "No se pudo completar la operación. Revisa los datos e inténtalo otra vez.";
}

async function initApp() {
  bindStaticEvents();
  setSessionMessage("Cargando sesión...");
  $("#login-error").textContent = "";
  $("#register-error").textContent = "";
  if (!isSupabaseConfigured()) {
    const message = "No se configuró la conexión con Supabase. Revisa config.js.";
    $("#login-error").textContent = message;
    $("#register-error").textContent = message;
    setSessionMessage(message, "error");
    appReady = true;
    renderApp();
    return;
  }
  sb = initSupabase();
  if (!sb) {
    $("#login-error").textContent = "No se pudo cargar la biblioteca de Supabase.";
    setSessionMessage("Supabase no está disponible.", "error");
    appReady = true;
    renderApp();
    return;
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (!appReady) return;
    if (authTransitionPending && event === "SIGNED_IN") return;
    await setSessionFromSupabase(session, false);
    if (currentUser) {
      if (!catalog) await loadCatalogSafe();
      await loadCourseChanges();
    }
    renderApp();
  });
  const { data: sessionData } = await sb.auth.getSession();
  await setSessionFromSupabase(sessionData.session, false);
  if (currentUser) {
    await loadCatalogSafe();
    await loadCourseChanges();
  }
  appReady = true;
  await syncPendingResults();
  await refreshResults();
  recoverInterruptedAttempt();
  renderApp();
}

function renderStudentFailure(error) {
  console.error("No se pudo renderizar el panel del alumno:", error);
  show("student-view");
  document.body.classList.remove("student-course-open");
  $("#student-welcome").textContent = `Hola, ${currentUser?.name || "alumno"}`;
  $("#student-stats").innerHTML = "";
  $("#student-overview").classList.remove("hidden");
  $("#student-overview").innerHTML = `<div class="student-library-empty student-load-error"><span>${modernIcon("course")}</span><strong>No se pudo cargar tu plataforma</strong><p>Actualiza la página. Si el problema continúa, solicita al profesor que revise tu acceso al curso.</p></div>`;
  $("#student-course-list").classList.remove("hidden");
  $("#student-course-list").innerHTML = "";
  $("#student-course-workspace").classList.add("hidden");
  $("#student-course-workspace").innerHTML = "";
  $("#student-grades-body").innerHTML = empty("No se pudieron cargar tus calificaciones.", 7);
}

async function setSessionFromSupabase(session, shouldRender = true) {
  if (!session?.user) {
    currentUser = null;
    results = [];
    if (shouldRender) renderApp();
    return;
  }
  try {
    const profile = await fetchProfile(session.user.id);
    currentUser = {
      id: session.user.id,
      name: profile.full_name || session.user.user_metadata?.full_name || session.user.email,
      email: profile.email || session.user.email,
      role: normalizeRole(profile.role) || "student"
    };
  } catch (error) {
    console.error("No se pudo recuperar el perfil:", error);
    currentUser = null;
    $("#login-error").textContent = "No se pudo cargar tu perfil. Revisa la configuración de Supabase.";
  }
  if (shouldRender) renderApp();
}

async function fetchProfile(userId) {
  const { data, error } = await sb.from("profiles").select("id, full_name, email, role").eq("id", userId).single();
  if (error) throw error;
  return data;
}

async function loadCatalogSafe() {
  try {
    const response = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo cargar ${CATALOG_URL}`);
    const raw = await response.json();
    const loaded = await normalizeCatalog(raw);
    catalog = raw;
    catalogCourses = loaded.courses;
    catalogExams = loaded.exams;
    applyCourseChanges();
  } catch (error) {
    console.error("Error cargando catálogo:", error);
    catalog = null;
    catalogCourses = [];
    catalogExams = [];
    publishedCourses = [];
    publishedExams = [];
  }
}

function applyCourseChanges() {
  const changes = new Map(courseChanges.map(change => [change.course_id, change]));
  const coursesById = new Map(catalogCourses.map(course => [course.id, course]));
  dynamicCourses.forEach(course => coursesById.set(course.id, course));
  const mergedCourses = [...coursesById.values()].filter(course => !changes.get(course.id)?.deleted).map(course => {
    const change = changes.get(course.id);
    const compatibleModules = legacyCourseModules.get(course.id);
    const changedModules = change?.modules === null || change?.modules === undefined ? compatibleModules : normalizeModules(change.modules);
    return change || compatibleModules ? { ...course, name: change?.name || course.name, description: change?.description ?? course.description, modules: changedModules ?? course.modules } : course;
  });
  const enrolledCourseIds = new Set(courseEnrollments
    .filter(enrollment => enrollment.status === "active" && enrollment.student_id === currentUser?.id)
    .map(enrollment => enrollment.course_id));
  publishedCourses = currentUser?.role === "teacher" ? mergedCourses : currentUser?.role === "student" ? mergedCourses.filter(course => enrolledCourseIds.has(course.id)) : [];
  const visibleCourseIds = new Set(publishedCourses.map(course => course.id));
  const examsById = new Map(catalogExams.map(exam => [exam.id, exam]));
  dynamicExams.forEach(exam => examsById.set(exam.id, exam));
  publishedExams = [...examsById.values()].filter(exam => visibleCourseIds.has(exam.courseId));
}
function menuIcon(name) {
  const paths = {
    sound: `<path d="M11 5 6.5 8.5H3v7h3.5L11 19z"/><path d="M15 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10"/>`,
    muted: `<path d="M11 5 6.5 8.5H3v7h3.5L11 19z"/><path d="m16 10 5 5m0-5-5 5"/>`,
    courses: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h8"/>`,
    grades: `<path d="M5 4h14v16H5z"/><path d="m8 13 2 2 5-6M8 7h4"/>`,
    profile: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>`,
    logout: `<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>`
  };
  return `<svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

async function loadCourseChanges() {
  if (!sb || !currentUser) return;
  await loadCourseAccess();
  await loadDynamicCourses();
  let { data, error } = await sb.from("course_changes").select("course_id, name, description, modules, deleted, updated_at");
  if (error?.code === "42703") ({ data, error } = await sb.from("course_changes").select("course_id, name, description, deleted, updated_at"));
  if (error) {
    console.error("No se pudieron cargar los cambios de cursos:", error);
    courseChanges = [];
    legacyCourseModules = new Map();
  } else {
    const rows = data || [];
    legacyCourseModules = decodeLegacyModuleRows(rows, [...catalogCourses, ...dynamicCourses]);
    courseChanges = rows.filter(row => !isLegacyModuleRow(row));
  }
  applyCourseChanges();
}
async function loadCourseAccess() {
  courseAccessError = "";
  if (!sb || !currentUser) {
    courseEnrollments = [];
    studentProfiles = [];
    return;
  }
  const enrollmentQuery = sb.from("course_enrollments").select("course_id, student_id, status, granted_by, created_at, updated_at");
  const [enrollmentResponse, profileResponse] = await Promise.all([
    enrollmentQuery,
    currentUser.role === "teacher" ? sb.from("profiles").select("id, full_name, email, role").eq("role", "student").order("full_name", { ascending:true }) : Promise.resolve({ data:[], error:null })
  ]);
  if (enrollmentResponse.error) {
    courseEnrollments = [];
    studentProfiles = [];
    courseAccessError = enrollmentResponse.error.code === "42P01" ? "Aplica la migración de matrículas en Supabase para administrar accesos." : "No se pudieron cargar los alumnos autorizados.";
    console.error("Matrículas:", enrollmentResponse.error);
    return;
  }
  if (profileResponse.error) {
    studentProfiles = [];
    courseAccessError = "No se pudo cargar el directorio de alumnos.";
    console.error("Perfiles de alumnos:", profileResponse.error);
  } else {
    studentProfiles = profileResponse.data || [];
  }
  courseEnrollments = enrollmentResponse.data || [];
}
async function loadDynamicCourses() {
  let courseQuery = await sb.from("academy_courses").select("course_id, name, description, teacher_name, modules, updated_at").eq("published", true);
  if (courseQuery.error?.code === "42703") courseQuery = await sb.from("academy_courses").select("course_id, name, description, teacher_name, updated_at").eq("published", true);
  const [courseResponse, examResponse, questionResponse] = await Promise.all([
    Promise.resolve(courseQuery),
    sb.from("academy_exams").select("exam_id, course_id, title, minutes, questions_to_show, attempts_allowed, option_count").eq("published", true),
    sb.from("academy_questions").select("exam_id, question_id, position, text, image, options, correct").eq("published", true).order("position", { ascending: true })
  ]);
  const error = courseResponse.error || examResponse.error || questionResponse.error;
  if (error) {
    if (String(error.code) !== "42P01") console.error("No se pudieron cargar los cursos normalizados desde Supabase:", error);
    dynamicCourses = [];
    dynamicExams = [];
    return;
  }
  dynamicCourses = (courseResponse.data || []).map(row => ({ id: row.course_id, name: row.name, description: row.description || "", teacherName: row.teacher_name || "Profesor", modules: normalizeModules(row.modules), updatedAt: row.updated_at, dynamic: true }));
  const questionsByExam = new Map();
  (questionResponse.data || []).forEach(row => {
    if (!questionsByExam.has(row.exam_id)) questionsByExam.set(row.exam_id, []);
    questionsByExam.get(row.exam_id).push({ id: row.question_id, text: row.text, image: row.image || "", options: row.options, correct: row.correct });
  });
  dynamicExams = (examResponse.data || []).map(row => normalizeExam({
    id: row.exam_id, course_id: row.course_id, title: row.title, minutes: row.minutes,
    questions_to_show: row.questions_to_show, attempts_allowed: row.attempts_allowed,
    option_count: row.option_count, published: true, questions: questionsByExam.get(row.exam_id) || []
  }, `Supabase: ${row.title}`, row.course_id));
}

async function normalizeCatalog(raw) {
  if (!raw || !Array.isArray(raw.courses)) throw new Error("data/catalog.json no tiene courses.");
  const courseIds = new Set();
  const examIds = new Set();
  const courses = raw.courses.map((course, index) => {
    const id = String(course.id || "").trim();
    if (!id) throw new Error(`Curso ${index + 1} sin id en data/catalog.json.`);
    if (courseIds.has(id)) throw new Error(`ID de curso duplicado: ${id}.`);
    courseIds.add(id);
    return {
      id,
      name: String(course.name || id).trim(),
      description: String(course.description || "").trim(),
      teacherName: String(course.teacher_name || "Profesor").trim(),
      modules: normalizeModules(course.modules),
      examPaths: Array.isArray(course.exams) ? course.exams : []
    };
  });
  const exams = [];
  for (const course of courses) {
    for (const path of course.examPaths) {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawExam = await response.json();
        const exam = normalizeExam(rawExam, path, course.id);
        if (examIds.has(exam.id)) throw new Error(`ID de examen duplicado: ${exam.id}.`);
        examIds.add(exam.id);
        if (exam.published) exams.push(exam);
      } catch (error) {
        console.error(`Error en ${path}:`, error);
        throw new Error(`Archivo problemático: ${path}. ${error.message}`);
      }
    }
  }
  return { courses, exams };
}

function normalizeQuestionImage(value, questionNumber = "") {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  let image = String(value).trim().replace(/^["']|["']$/g, "");
  const dataImage = image.match(/^data:\s*(image\/[a-z0-9.+-]+)(?:\s*;\s*(?!base64\s*,)[^;,]+)*\s*;\s*base64\s*,([\s\S]+)$/i);
  if (!dataImage) throw new Error(`la imagen${questionNumber ? ` de la pregunta ${questionNumber}` : ""} debe comenzar con data:image/png;base64,`);
  let payload = dataImage[2].replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[a-z0-9+/]+={0,2}$/i.test(payload)) throw new Error(`los datos Base64 de la imagen${questionNumber ? ` de la pregunta ${questionNumber}` : ""} no son válidos.`);
  while (payload.length % 4) payload += "=";
  return `data:${dataImage[1].toLowerCase()};base64,${payload}`;
}
function questionImageMarkup(question, className = "question-image") {
  return question?.image ? `<img class="${className}" src="${esc(question.image)}" alt="Gráfico de la pregunta" loading="lazy">` : "";
}
function normalizeExam(raw, source = "JSON", fallbackCourseId = "") {
  const sourceLabel = source || "JSON";
  const list = Array.isArray(raw) ? raw : raw.questions || raw.preguntas;
  if (!Array.isArray(list)) throw new Error(`${sourceLabel}: no contiene un arreglo de preguntas.`);
  const id = String(raw.id || slug(raw.title || raw.nombre || raw.nombre_examen || "examen")).trim();
  const courseId = String(raw.course_id || raw.courseId || fallbackCourseId || "").trim();
  const title = String(raw.title || raw.nombre || raw.nombre_examen || "Examen sin título").trim();
  const minutes = Number(raw.minutes ?? raw.minutos ?? raw.tiempo ?? 20);
  const questionsToShow = Number(raw.questions_to_show ?? raw.questionsToShow ?? raw.preguntas_a_mostrar ?? Math.min(5, list.length));
  const attemptsAllowed = Number(raw.attempts_allowed ?? raw.attemptsAllowed ?? raw.intentos_permitidos ?? 1);
  const published = raw.published ?? raw.publicado ?? true;
  const optionCount = Number(raw.option_count ?? raw.optionCount ?? raw.opciones_por_pregunta ?? list[0]?.options?.length ?? list[0]?.opciones?.length ?? 5);
  if (!id) throw new Error(`${sourceLabel}: falta id.`);
  if (!courseId) throw new Error(`${sourceLabel}: falta course_id.`);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) throw new Error(`${sourceLabel}: minutes debe estar entre 1 y 300.`);
  if (!Number.isInteger(attemptsAllowed) || attemptsAllowed < 1 || attemptsAllowed > 20) throw new Error(`${sourceLabel}: attempts_allowed debe estar entre 1 y 20.`);
  if (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 8) throw new Error(`${sourceLabel}: option_count debe estar entre 2 y 8.`);
  if (!Number.isInteger(questionsToShow) || questionsToShow < 1 || questionsToShow > list.length) throw new Error(`${sourceLabel}: questions_to_show debe ser válido y no superar el banco.`);
  const questionIds = new Set();
  const questions = list.map((item, index) => {
    const q = normalizeImportedQuestion(item, index, optionCount);
    if (questionIds.has(q.id)) throw new Error(`${sourceLabel}: ID de pregunta duplicado (${q.id}).`);
    questionIds.add(q.id);
    return q;
  });
  return { id, courseId, title, minutes, questionsToShow, attemptsAllowed, published: published === true || published === "true", optionCount, questions, source };
}
function normalizeImportedQuestion(item, index, forcedOptionCount = null) {
  const text = item.text ?? item.pregunta ?? item.enunciado ?? item.question;
  const image = normalizeQuestionImage(item.image ?? item.imagen ?? "", index + 1);
  let options = item.options ?? item.opciones ?? item.alternativas;
  if (!Array.isArray(options)) {
    options = "ABCDEFGH".split("").map(letter => item[`opcion_${letter.toLowerCase()}`] ?? item[`opcion${letter}`]).filter(value => value !== undefined);
  }
  options = (options || []).map(option => String(option ?? "").trim());
  const optionCount = forcedOptionCount || options.length;
  if (!String(text || "").trim()) throw new Error(`la pregunta ${index + 1} no tiene enunciado.`);
  if (options.length !== optionCount) throw new Error(`la pregunta ${index + 1} debe tener ${optionCount} opciones.`);
  if (options.some(option => !option)) throw new Error(`la pregunta ${index + 1} tiene opciones vacías.`);
  const usesZeroBasedCorrect = Object.prototype.hasOwnProperty.call(item, "correct");
  const answer = item.correct ?? item.respuesta_correcta ?? item.correcta ?? item.answer;
  const correct = normalizeAnswer(answer, options, index, usesZeroBasedCorrect);
  const id = String(item.id || `${slug(String(text).slice(0, 35))}-${index + 1}`).trim();
  return { id, text: String(text).trim(), image, options, correct };
}
function normalizeAnswer(answer, options, index, zeroBasedNumber = false) {
  if (answer === undefined || answer === null || answer === "") throw new Error(`falta respuesta correcta en la pregunta ${index + 1}.`);
  if (typeof answer === "number") {
    if (zeroBasedNumber && answer >= 0 && answer < options.length) return answer;
    if (answer >= 1 && answer <= options.length) return answer - 1;
    if (answer === 0 && options.length) return 0;
  }
  const value = String(answer).trim();
  if (/^[A-H]$/i.test(value)) return value.toUpperCase().charCodeAt(0) - 65;
  if (/^[1-8]$/.test(value)) return Number(value) - 1;
  if (/^[0-7]$/.test(value) && Number(value) < options.length) return Number(value);
  const clean = text => String(text).trim().toLocaleLowerCase("es").replace(/^[a-h]\s*[\)\].:-]\s*/i, "");
  const found = options.findIndex(option => clean(option) === clean(value));
  if (found >= 0) return found;
  throw new Error(`no se reconoce la respuesta correcta de la pregunta ${index + 1}.`);
}

function renderApp() {
  document.body.classList.remove("session-loading");
  document.body.classList.remove("auth-galactic-burst");
  const isTeacher = currentUser?.role === "teacher";
  const isAdmin = currentUser?.role === "admin";
  const resultReviewOpen = !isTeacher && $("#result-view").classList.contains("active");
  document.body.classList.toggle("teacher-shell-mode", isTeacher);
  document.body.classList.toggle("admin-shell-mode", isAdmin);
  if (!currentUser) {
    $("#auth-view .auth-layout")?.classList.remove("auth-login-exit");
    $("#session-area").innerHTML = "";
    show("auth-view");
    return;
  }
  const activeStudentTab = $("#student-view .tab-content.active")?.id || "student-courses";
  const teacherNavigation = "";
  const accountLabel = isAdmin ? "Administrador" : isTeacher ? "Profesor" : "Alumno";
  const studentNavigation = !isTeacher ? `<nav class="shell-student-nav" aria-label="Secciones del alumno">
    <button class="shell-nav-item ${activeStudentTab === "student-courses" ? "active" : ""}" data-student-tab="student-courses" type="button">${menuIcon("courses")}<span>Mis cursos</span></button>
    <button class="shell-nav-item ${activeStudentTab === "student-grades" ? "active" : ""}" data-student-tab="student-grades" type="button">${menuIcon("grades")}<span>Calificaciones</span></button>
  </nav>` : "";
  $("#session-area").innerHTML = `${teacherNavigation}${studentNavigation}<div class="user-menu"><span class="user-avatar">${esc(currentUser.name.charAt(0).toUpperCase())}</span><span class="user-identity"><strong>${esc(currentUser.name)}</strong><small>${isTeacher ? "Profesor" : "Alumno"}</small><small class="user-email">${esc(currentUser.email || "")}</small></span><div class="user-actions"><button id="profile-btn" class="btn ghost">${menuIcon("profile")}<span>Mi perfil</span></button><button id="logout-btn" class="btn ghost logout-btn">${menuIcon("logout")}<span>Cerrar sesión</span></button></div></div>`;
  $("#session-area .user-identity small").textContent = accountLabel;
  $("#profile-btn").addEventListener("click", openProfile);
  $("#logout-btn").addEventListener("click", logout);
  $$("#session-area [data-teacher-tab]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.teacherTab === "teacher-exams" || button.dataset.teacherTab === "teacher-courses") {
      activeTeacherCourseId = null;
      activeTeacherCourseSection = "overview";
      renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    }
    switchTab("teacher", button.dataset.teacherTab, button);
  }));
  $$("#session-area [data-student-tab]").forEach(button => button.addEventListener("click", () => {
    if (activeStudentCourseId) {
      activeStudentCourseId = null;
      document.body.classList.remove("student-course-open");
      $("#student-course-list")?.classList.remove("hidden");
      $("#student-course-workspace")?.classList.add("hidden");
      $("#student-overview")?.classList.remove("hidden");
    }
    switchTab("student", button.dataset.studentTab, button);
  }));
  if (isAdmin) renderAdmin();
  else if (resultReviewOpen) show("result-view");
  else if (isTeacher) renderTeacher();
  else if (activeLessonCourseId && activeLessonActivityId) renderLesson();
  else {
    try { renderStudent(); }
    catch (error) { renderStudentFailure(error); }
  }
}

function bindStaticEvents() {
  $("#sidebar-toggle").addEventListener("click", toggleSidebar);
  $("#brand-link").addEventListener("click", event => {
    event.preventDefault();
    if (activeExam && timerInterval) { alert("No puedes salir mientras el examen está activo. Entrégalo para continuar."); return; }
    if (currentUser) renderApp();
  });
  $$(".auth-tab").forEach(button => button.addEventListener("click", () => {
    const authLayout = $("#auth-view .auth-layout");
    const isRegister = button.dataset.auth === "register";
    $$(".auth-tab").forEach(tab => tab.classList.toggle("active", tab === button));
    authLayout.dataset.authMode = isRegister ? "register" : "login";
    authLayout.classList.toggle("register-active", isRegister);
    $("#login-form").classList.toggle("hidden", isRegister);
    $("#register-form").classList.toggle("hidden", !isRegister);
  }));
  bindPasswordToggles();
  $("#forgot-password-link")?.addEventListener("click", recoverPassword);
  $("#register-form").addEventListener("submit", registerUser);
  $("#login-form").addEventListener("submit", loginUser);
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#new-course-btn").addEventListener("click", () => openCourseModal());
  $("#teacher-head-new-course").addEventListener("click", () => openCourseModal());
  $("#teacher-head-new-exam")?.addEventListener("click", () => openExamModal());
  $("#course-search").addEventListener("input", renderTeacherCourseList);
  $("#course-quick-toggle").addEventListener("click", () => {
    const directory = $("#teacher-course-directory");
    const open = !directory.classList.contains("quick-panel-open");
    directory.classList.toggle("quick-panel-open", open);
    $("#course-quick-toggle").setAttribute("aria-expanded", String(open));
  });
  $("#course-quick-close").addEventListener("click", () => {
    $("#teacher-course-directory").classList.remove("quick-panel-open");
    $("#course-quick-toggle").setAttribute("aria-expanded", "false");
  });
  $("#course-quick-all").addEventListener("click", () => {
    $("#course-search").value = "";
    renderTeacherCourseList();
    $("#teacher-course-directory").classList.remove("quick-panel-open");
    $("#course-quick-toggle").setAttribute("aria-expanded", "false");
  });
  $("#new-exam-btn").addEventListener("click", () => openExamModal());
  $("#course-form").addEventListener("submit", saveCourseDraft);
  $("#course-name").addEventListener("input", updateCourseSetupPreview);
  $("#course-description").addEventListener("input", updateCourseSetupPreview);
  $("#module-form").addEventListener("submit", saveModule);
  $("#activity-form").addEventListener("submit", saveActivity);
  $("#module-unlock-rule").addEventListener("change", toggleModuleUnlockDetail);
  $("#activity-type").addEventListener("change", toggleActivityFields);
  $$("[data-activity-format]").forEach(button => {
    button.addEventListener("mousedown", event => {
      rememberActivityEditorSelection();
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      formatActivityDescription(button.dataset.activityFormat);
      closeActivityMenus();
    });
  });
  $$(".activity-menu-trigger").forEach(button => {
    button.addEventListener("mousedown", rememberActivityEditorSelection);
    button.addEventListener("click", event => {
      event.stopPropagation();
      toggleActivityMenu(button);
    });
  });
  $$(".activity-menu-popover").forEach(menu => menu.addEventListener("click", event => event.stopPropagation()));
  $('[data-activity-action="focus-editor"]').addEventListener("click", () => {
    closeActivityMenus();
    $("#activity-description-editor").focus();
  });
  document.addEventListener("click", closeActivityMenus);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeActivityMenus();
  });
  $("#activity-text-size").addEventListener("change", event => {
    if (event.target.value) formatActivityDescription(`size-${event.target.value}`);
    event.target.value = "";
  });
  $("#activity-block-style").addEventListener("change", event => {
    if (event.target.value) formatActivityDescription(event.target.value);
    event.target.value = "";
  });
  $("#activity-description-editor").addEventListener("input", syncActivityEditor);
  $("#activity-description-editor").addEventListener("paste", pastePlainActivityText);
  $("#activity-description-editor").addEventListener("pointerdown", event => {
    activityEditorTableCell = event.target.closest("td, th");
  });
  document.addEventListener("selectionchange", rememberActivityEditorSelection);
  $("#lesson-return").addEventListener("click", () => { activeLessonCourseId = null; activeLessonActivityId = null; saveActiveLesson(); renderStudent(); });
  $("#lesson-menu-toggle").addEventListener("click", toggleLessonSidebar);
  $("#lesson-sidebar-close").addEventListener("click", closeLessonSidebar);
  $("#lesson-complete").addEventListener("click", completeActiveLesson);
  $("#lesson-previous").addEventListener("click", () => navigateLesson(-1));
  $("#lesson-next").addEventListener("click", () => navigateLesson(1));
  $("#publish-course-form").addEventListener("submit", publishSelectedCourseExams);
  $("#exam-editor-form").addEventListener("submit", saveExamDraft);
  $("#editor-option-count").addEventListener("change", changeOptionCount);
  $("#add-question-btn").addEventListener("click", addBuilderQuestion);
  $("#generate-questions-btn").addEventListener("click", generateQuestions);
  $("#import-questions").addEventListener("change", importQuestions);
  $("#take-exam-form").addEventListener("submit", event => {
    event.preventDefault();
    if (confirm("¿Deseas entregar el examen con tus respuestas actuales?")) finishExam(false);
  });
  $("#return-student").addEventListener("click", returnFromResult);
  $("#export-grades").addEventListener("click", exportGrades);
  $("#refresh-results").addEventListener("click", async () => { await refreshResults(true); renderTeacher(); });
  [{ id: "teacher-search", event: "input" }, { id: "teacher-course-filter", event: "change" }, { id: "teacher-exam-filter", event: "change" }].forEach(({ id, event }) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener(event, () => renderTeacherGrades(filteredTeacherResults()));
  });
  $$("[data-teacher-tab]").forEach(button => button.addEventListener("click", () => switchTab("teacher", button.dataset.teacherTab, button)));
  $$("[data-student-tab]").forEach(button => button.addEventListener("click", () => switchTab("student", button.dataset.studentTab, button)));
  $$(".question-mode").forEach(button => button.addEventListener("click", () => setQuestionMode(button.dataset.questionMode)));
  $$(".exam-editor-tab").forEach(button => button.addEventListener("click", () => selectExamEditorSection(button.dataset.editorSection)));
  $$('[data-close]').forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && activeExam && timerInterval) finishExam(false, "El examen se entregó al cambiar de pestaña o minimizar la ventana.", true);
  });
  window.addEventListener("pagehide", () => {
    if (activeExam && timerInterval) finishExam(false, "El examen se entregó al cerrar, recargar o abandonar la página.", true);
  });
  window.addEventListener("beforeunload", saveActiveAttempt);
  window.addEventListener("online", syncPendingResults);
  bindAdminNavigation();
}
/* =========================================================
   PANEL ADMINISTRADOR
   ========================================================= */

function bindAdminNavigation() {
  if (document.body.dataset.adminEventsBound === "true") return;

  document.body.dataset.adminEventsBound = "true";

  document.addEventListener("click", event => {
    const navButton = event.target.closest(".admin-nav-item");

    if (navButton) {
      openAdminSection(
        navButton.dataset.adminSection || "dashboard"
      );

      return;
    }

    if (event.target.closest("#admin-logout")) {
      logout();
      return;
    }

    if (event.target.closest("#admin-view-all-teachers")) {
      openAdminSection("teachers");
      return;
    }

    if (event.target.closest(".search-clear")) {
      const searchInput = $("#admin-teacher-search");

      if (searchInput) {
        searchInput.value = "";
        adminTeacherPage = 1;
        renderAdminTeachers();
        searchInput.focus();
      }

      return;
    }

    if (event.target.closest("#admin-export-teachers")) {
      exportAdminTeachers();
      return;
    }

    const pageButton = event.target.closest(
      "[data-admin-teacher-page]"
    );

    if (pageButton) {
      adminTeacherPage = Number(
        pageButton.dataset.adminTeacherPage
      );

      renderAdminTeachers();
      return;
    }

    const actionButton = event.target.closest(
      "[data-admin-teacher-action]"
    );

    if (actionButton) {
      handleAdminTeacherAction(actionButton);
      return;
    }

    if (
      event.target.closest("#admin-teacher-modal-close") ||
      event.target.closest("#admin-teacher-cancel")
    ) {
      closeAdminTeacherModal();
      return;
    }

    if (
      event.target.id === "admin-teacher-modal"
    ) {
      closeAdminTeacherModal();
    }
  });

  $("#admin-teacher-search")?.addEventListener(
    "input",
    () => {
      adminTeacherPage = 1;
      renderAdminTeachers();
    }
  );

  $("#admin-teacher-status-filter")?.addEventListener(
    "change",
    () => {
      adminTeacherPage = 1;
      renderAdminTeachers();
    }
  );

  $("#admin-teacher-form")?.addEventListener(
    "submit",
    saveAdminTeacherProfile
  );
}

function exportAdminTeachers() {
  const teachers = getFilteredAdminTeachers();

  if (!teachers.length) return;

  const rows = [
    ["Profesor", "Correo", "Institución", "Teléfono", "Estado", "Registro"],
    ...teachers.map(profile => [
      profile.full_name || profile.email || "Profesor sin nombre",
      profile.email || "",
      profile.institution || "",
      profile.phone || "",
      adminTeacherStatusLabel(profile.teacher_status || "pending"),
      formatDateOnly(profile.created_at)
    ])
  ];

  const csv = rows
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `profesores-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openAdminSection(section = "dashboard") {
  const validSections = [
    "dashboard",
    "teachers",
    "students",
    "courses",
    "payments",
    "settings"
  ];

  activeAdminSection = validSections.includes(section)
    ? section
    : "dashboard";

  $$(".admin-nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.adminSection === activeAdminSection
    );
  });

  $$(".admin-section").forEach(page => {
    page.classList.toggle(
      "active",
      page.dataset.adminPage === activeAdminSection
    );
  });

  if (activeAdminSection === "teachers") {
    renderAdminTeachers();
  }
}

async function loadAdminDashboardData() {
  if (!sb || currentUser?.role !== "admin") return;

  const [
    profilesResponse,
    coursesResponse,
    enrollmentsResponse
  ] = await Promise.all([
    sb
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        role,
        teacher_status,
        phone,
        institution,
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: false }),

    sb
      .from("academy_courses")
      .select("course_id"),

    sb
      .from("course_enrollments")
      .select("course_id, student_id")
  ]);

  if (profilesResponse.error) {
    console.error(
      "Perfiles del administrador:",
      profilesResponse.error
    );
  }

  if (coursesResponse.error) {
    console.error(
      "Cursos del administrador:",
      coursesResponse.error
    );
  }

  if (enrollmentsResponse.error) {
    console.error(
      "Matrículas del administrador:",
      enrollmentsResponse.error
    );
  }

  adminProfiles = (profilesResponse.data || []).map(profile => ({
    ...profile,
    role: normalizeRole(profile.role) || profile.role
  }));

  const teachers = adminProfiles.filter(
    profile => profile.role === "teacher"
  );

  const students = adminProfiles.filter(
    profile => profile.role === "student"
  );

  const activeTeachers = teachers.filter(
    profile =>
      (profile.teacher_status || "pending") === "active"
  );

  const pendingTeachers = teachers.filter(
    profile =>
      (profile.teacher_status || "pending") === "pending"
  );

  const counters = {
    "#admin-total-teachers": teachers.length,
    "#admin-active-teachers": activeTeachers.length,
    "#admin-pending-teachers": pendingTeachers.length,
    "#admin-total-students": students.length,
    "#admin-total-courses":
      coursesResponse.data?.length || 0,
    "#admin-total-enrollments":
      enrollmentsResponse.data?.length || 0
  };

  Object.entries(counters).forEach(
    ([selector, value]) => {
      const element = $(selector);

      if (element) {
        element.textContent = String(value);
      }
    }
  );

  renderAdminPendingTeachers(pendingTeachers);
  renderAdminTeachers();
}

function renderAdminPendingTeachers(pendingTeachers) {
  const container = $("#admin-pending-teachers-list");

  if (!container) return;

  if (!pendingTeachers.length) {
    container.innerHTML = `
      <div class="empty">
        No existen profesores pendientes de aprobación.
      </div>
    `;

    return;
  }

  container.innerHTML = pendingTeachers
    .slice(0, 5)
    .map(profile => {
      const name =
        profile.full_name ||
        profile.email ||
        "Profesor sin nombre";

      return `
        <article class="admin-pending-teacher">
          ${adminTeacherIdentityMarkup(profile)}

          <div class="admin-pending-meta">
            <span>
              ${esc(
                profile.institution ||
                "Sin institución"
              )}
            </span>

            <small>
              Registrado el
              ${esc(formatDateOnly(profile.created_at))}
            </small>
          </div>

          <div class="admin-teacher-actions">
            <button
              class="admin-action-button approve"
              type="button"
              data-admin-teacher-action="active"
              data-teacher-id="${esc(profile.id)}">
              Aprobar
            </button>

            <button
              class="admin-action-button view"
              type="button"
              data-admin-teacher-action="view"
              data-teacher-id="${esc(profile.id)}">
              Ver perfil
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getFilteredAdminTeachers() {
  const search = (
    $("#admin-teacher-search")?.value || ""
  )
    .trim()
    .toLocaleLowerCase("es");

  const status =
    $("#admin-teacher-status-filter")?.value || "";

  return adminProfiles
    .filter(profile => profile.role === "teacher")
    .filter(profile => {
      const currentStatus =
        profile.teacher_status || "pending";

      const searchableText = `
        ${profile.full_name || ""}
        ${profile.email || ""}
        ${profile.institution || ""}
        ${profile.phone || ""}
      `.toLocaleLowerCase("es");

      return (
        (!search || searchableText.includes(search)) &&
        (!status || currentStatus === status)
      );
    })
    .sort((left, right) => {
      const leftName =
        left.full_name || left.email || "";

      const rightName =
        right.full_name || right.email || "";

      return leftName.localeCompare(rightName, "es");
    });
}

function renderAdminTeachers() {
  const container = $("#admin-teachers-table");

  if (!container) return;

  const teachers = getFilteredAdminTeachers();

  const totalPages = Math.max(
    1,
    Math.ceil(
      teachers.length / ADMIN_TEACHERS_PER_PAGE
    )
  );

  if (adminTeacherPage > totalPages) {
    adminTeacherPage = totalPages;
  }

  const start =
    (adminTeacherPage - 1) *
    ADMIN_TEACHERS_PER_PAGE;

  const visibleTeachers = teachers.slice(
    start,
    start + ADMIN_TEACHERS_PER_PAGE
  );

  if (!teachers.length) {
    container.innerHTML = `
      <div class="empty">
        No se encontraron profesores.
      </div>
    `;

    renderAdminTeacherPagination(0, 1);
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-teachers-table">
        <thead>
          <tr>
            <th>Profesor</th>
            <th>Institución</th>
            <th>Teléfono</th>
            <th>Estado</th>
            <th>Registro</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          ${visibleTeachers
            .map(profile => {
              const status =
                profile.teacher_status || "pending";

              return `
                <tr>
                  <td>
                    ${adminTeacherIdentityMarkup(profile)}
                  </td>

                  <td>
                    ${esc(
                      profile.institution ||
                      "No registrada"
                    )}
                  </td>

                  <td>
                    ${esc(
                      profile.phone ||
                      "No registrado"
                    )}
                  </td>

                  <td>
                    <span
                      class="admin-status
                      admin-status-${esc(status)}">
                      ${esc(
                        adminTeacherStatusLabel(status)
                      )}
                    </span>
                  </td>

                  <td>
                    ${esc(
                      formatDateOnly(profile.created_at)
                    )}
                  </td>

                  <td>
                    <div class="admin-teacher-actions">
                      ${renderAdminTeacherActions(profile)}
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  renderAdminTeacherPagination(
    teachers.length,
    totalPages
  );
}

function adminTeacherIdentityMarkup(profile) {
  const name =
    profile.full_name ||
    profile.email ||
    "Profesor sin nombre";

  const initial = name
    .charAt(0)
    .toLocaleUpperCase("es");

  return `
    <div class="admin-teacher-identity">
      <span class="admin-teacher-avatar">
        ${esc(initial)}
      </span>

      <span>
        <strong>${esc(name)}</strong>
        <small>${esc(profile.email || "")}</small>
      </span>
    </div>
  `;
}

function renderAdminTeacherActions(profile) {
  const status =
    profile.teacher_status || "pending";

  const viewButton = `
    <button
      class="admin-action-button view"
      type="button"
      data-admin-teacher-action="view"
      data-teacher-id="${esc(profile.id)}">
      Ver
    </button>
  `;

  if (status === "pending") {
    return `
      ${viewButton}

      <button
        class="admin-action-button approve"
        type="button"
        data-admin-teacher-action="active"
        data-teacher-id="${esc(profile.id)}">
        Aprobar
      </button>

      <button
        class="admin-action-button suspend"
        type="button"
        data-admin-teacher-action="suspended"
        data-teacher-id="${esc(profile.id)}">
        Suspender
      </button>
    `;
  }

  if (status === "active") {
    return `
      ${viewButton}

      <button
        class="admin-action-button suspend"
        type="button"
        data-admin-teacher-action="suspended"
        data-teacher-id="${esc(profile.id)}">
        Suspender
      </button>
    `;
  }

  if (status === "suspended") {
    return `
      ${viewButton}

      <button
        class="admin-action-button approve"
        type="button"
        data-admin-teacher-action="active"
        data-teacher-id="${esc(profile.id)}">
        Reactivar
      </button>

      <button
        class="admin-action-button archive"
        type="button"
        data-admin-teacher-action="archived"
        data-teacher-id="${esc(profile.id)}">
        Archivar
      </button>
    `;
  }

  return `
    ${viewButton}

    <button
      class="admin-action-button approve"
      type="button"
      data-admin-teacher-action="active"
      data-teacher-id="${esc(profile.id)}">
      Reactivar
    </button>
  `;
}

function renderAdminTeacherPagination(
  totalTeachers,
  totalPages
) {
  const container =
    $("#admin-teacher-pagination");

  if (!container) return;

  if (totalTeachers <= ADMIN_TEACHERS_PER_PAGE) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <span>
      Página ${adminTeacherPage} de ${totalPages}
    </span>

    <div>
      <button
        class="btn ghost"
        type="button"
        data-admin-teacher-page="${
          adminTeacherPage - 1
        }"
        ${adminTeacherPage === 1 ? "disabled" : ""}>
        Anterior
      </button>

      <button
        class="btn ghost"
        type="button"
        data-admin-teacher-page="${
          adminTeacherPage + 1
        }"
        ${
          adminTeacherPage === totalPages
            ? "disabled"
            : ""
        }>
        Siguiente
      </button>
    </div>
  `;
}

async function handleAdminTeacherAction(button) {
  const teacherId = button.dataset.teacherId;
  const action = button.dataset.adminTeacherAction;

  if (!teacherId || !action) return;

  if (action === "view") {
    openAdminTeacherModal(teacherId);
    return;
  }

  await updateAdminTeacherStatus(
    teacherId,
    action,
    button
  );
}

async function updateAdminTeacherStatus(
  teacherId,
  newStatus,
  button
) {
  if (!sb || currentUser?.role !== "admin") return;

  const teacher = adminProfiles.find(
    profile => profile.id === teacherId
  );

  if (!teacher) {
    alert("No se encontró el profesor.");
    return;
  }

  const actionLabels = {
    active: "activar",
    suspended: "suspender",
    archived: "archivar"
  };

  const confirmed = confirm(
    `¿Deseas ${
      actionLabels[newStatus] || "actualizar"
    } a ${
      teacher.full_name ||
      teacher.email ||
      "este profesor"
    }?`
  );

  if (!confirmed) return;

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Guardando...";

  try {
    const { data, error } = await sb
      .from("profiles")
      .update({
        teacher_status: newStatus,
        updated_at: nowIso()
      })
      .eq("id", teacherId)
      .eq("role", "teacher")
      .select(`
        id,
        full_name,
        email,
        role,
        teacher_status,
        phone,
        institution,
        created_at,
        updated_at
      `)
      .single();

    if (error) throw error;

    adminProfiles = adminProfiles.map(profile =>
      profile.id === teacherId
        ? { ...profile, ...data }
        : profile
    );

    await loadAdminDashboardData();
  } catch (error) {
    console.error(
      "Estado del profesor:",
      error
    );

    alert(translateError(error));

    button.disabled = false;
    button.textContent = originalText;
  }
}

function openAdminTeacherModal(teacherId) {
  const teacher = adminProfiles.find(
    profile => profile.id === teacherId
  );

  if (!teacher) return;

  $("#admin-teacher-id").value = teacher.id;
  $("#admin-teacher-name").value =
    teacher.full_name || "";

  $("#admin-teacher-institution").value =
    teacher.institution || "";

  $("#admin-teacher-phone").value =
    teacher.phone || "";

  $("#admin-teacher-modal-status").value =
    teacher.teacher_status || "pending";

  $("#admin-teacher-modal-title").textContent =
    teacher.full_name ||
    teacher.email ||
    "Profesor";

  $("#admin-teacher-modal-email").textContent =
    teacher.email || "";

  $("#admin-teacher-form-message").textContent = "";

  const modal = $("#admin-teacher-modal");

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeAdminTeacherModal() {
  const modal = $("#admin-teacher-modal");

  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

async function saveAdminTeacherProfile(event) {
  event.preventDefault();

  if (!sb || currentUser?.role !== "admin") return;

  const teacherId =
    $("#admin-teacher-id").value;

  const submitButton = event.submitter;
  const message =
    $("#admin-teacher-form-message");

  message.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent = "Guardando...";

  try {
    const payload = {
      full_name:
        $("#admin-teacher-name").value.trim(),

      institution:
        $("#admin-teacher-institution").value.trim() ||
        null,

      phone:
        $("#admin-teacher-phone").value.trim() ||
        null,

      teacher_status:
        $("#admin-teacher-modal-status").value,

      updated_at: nowIso()
    };

    const { data, error } = await sb
      .from("profiles")
      .update(payload)
      .eq("id", teacherId)
      .eq("role", "teacher")
      .select(`
        id,
        full_name,
        email,
        role,
        teacher_status,
        phone,
        institution,
        created_at,
        updated_at
      `)
      .single();

    if (error) throw error;

    adminProfiles = adminProfiles.map(profile =>
      profile.id === teacherId
        ? { ...profile, ...data }
        : profile
    );

    closeAdminTeacherModal();
    await loadAdminDashboardData();
  } catch (error) {
    console.error(
      "Editar profesor:",
      error
    );

    message.textContent = translateError(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Guardar cambios";
  }
}

function adminTeacherStatusLabel(status) {
  return {
    pending: "Pendiente",
    active: "Activo",
    suspended: "Suspendido",
    archived: "Archivado"
  }[status] || "Pendiente";
}

function renderAdmin() {
  show("admin-view");

  const welcome = $("#admin-welcome");

  if (welcome) {
    welcome.textContent =
      `Bienvenido, ${
        currentUser?.name || "administrador"
      }`;
  }
  $("#admin-session-email").textContent = currentUser?.email || "";

  bindAdminNavigation();
  openAdminSection(activeAdminSection);
  loadAdminDashboardData();
}

function bindPasswordToggles(container = document) {
  container.querySelectorAll(".password-toggle").forEach(button => {
    button.innerHTML = `<svg class="password-eye eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/><path class="eye-slash" d="m4 4 16 16"/></svg><svg class="password-eye eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>`;
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.password);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.classList.toggle("is-visible", !showing);
      button.setAttribute("aria-label", showing ? "Mostrar contraseña" : "Ocultar contraseña");
      button.title = showing ? "Mostrar contraseña" : "Ocultar contraseña";
    });
  });
}
async function recoverPassword() {
  const emailInput = $("#login-email");
  const message = $("#login-error");
  const button = $("#forgot-password-link");
  const email = emailInput.value.trim().toLowerCase();
  if (!email) {
    message.className = "error";
    message.textContent = "Escribe tu correo para enviarte las instrucciones.";
    emailInput.focus();
    return;
  }
  if (!sb) {
    message.className = "error";
    message.textContent = "No se configuró la conexión con Supabase. Revisa config.js.";
    return;
  }
  button.disabled = true;
  message.className = "status";
  message.textContent = "Enviando instrucciones...";
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    if (error) throw error;
    message.className = "success";
    message.textContent = "Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.";
  } catch (error) {
    console.error("Recuperación de contraseña:", error);
    message.className = "error";
    message.textContent = translateError(error);
  } finally {
    button.disabled = false;
  }
}
async function registerUser(event) {
  event.preventDefault();
  if (!sb) { $("#register-error").textContent = "No se configuró la conexión con Supabase. Revisa config.js."; return; }
  const button = event.submitter;
  button.disabled = true;
  const name = $("#register-name").value.trim();
  const email = $("#register-email").value.trim().toLowerCase();
  const password = $("#register-password").value;
  const requestedRole =
  document.querySelector(
    'input[name="register-role"]:checked'
  )?.value === "teacher"
    ? "teacher"
    : "student";
  const confirmation = $("#register-password-confirm").value;
  $("#register-error").className = "error";
  $("#register-error").textContent = "";
  try {
    if (password.length < 8) throw new Error("password");
    if (password !== confirmation) { $("#register-error").textContent = "Las contraseñas no coinciden."; return; }
    const { data, error } = await sb.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name: name,
      requested_role: requestedRole
    }
  }
});
    if (error) throw error;
    if (!data.session) {
      $("#register-error").className = "success";
      $("#register-error").textContent = "Cuenta creada. Revisa tu correo para confirmar el registro.";
      return;
    }
    await setSessionFromSupabase(data.session, false);
    await loadCatalogSafe();
    await loadCourseChanges();
    renderApp();
  } catch (error) {
    console.error("Registro:", error);
    $("#register-error").textContent = translateError(error);
  } finally {
    button.disabled = false;
  }
}
async function loginUser(event) {
  event.preventDefault();
  if (!sb) { $("#login-error").className = "error"; $("#login-error").textContent = "No se configuró la conexión con Supabase. Revisa config.js."; return; }
  const button = event.submitter;
  button.disabled = true;
  $("#login-error").className = "status";
  $("#login-error").textContent = "Ingresando...";
  authTransitionPending = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email: $("#login-email").value.trim().toLowerCase(),
      password: $("#login-password").value
    });
    if (error) throw error;
    $("#login-error").className = "error";
    $("#login-error").textContent = "";
    await setSessionFromSupabase(data.session, false);
    if (!currentUser) throw new Error("No se pudo cargar el perfil de esta cuenta.");
    await loadCatalogSafe();
    await loadCourseChanges();
    const exitAnimation = playAuthLoginExit();
    await syncPendingResults(false);
    await refreshResults();
    recoverInterruptedAttempt();
    await exitAnimation;
    renderApp();
  } catch (error) {
    console.error("Login:", error);
    document.body.classList.remove("auth-galactic-burst");
    $("#auth-view .auth-layout")?.classList.remove("auth-login-exit");
    $("#login-error").className = "error";
    $("#login-error").textContent = translateError(error);
  } finally {
    authTransitionPending = false;
    button.disabled = false;
  }
}
async function logout() {
  if (timerInterval && !confirm("Hay un examen en curso. Si cierras sesión, se entregará con las respuestas actuales. ¿Deseas continuar?")) return;
  if (timerInterval) await finishExam(false, "Cerraste sesión durante el examen.", true);
  clearInterval(timerInterval);
  timerInterval = null;
  activeExam = null;
  activeQuestions = [];
  activeTeacherCourseId = null;
  activeStudentCourseId = null;
  activeLessonCourseId = null;
  activeLessonActivityId = null;
  courseEnrollments = [];
  studentProfiles = [];
  courseAccessError = "";
  saveActiveLesson();
  try {
    if (sb) await sb.auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("Cierre de sesión remoto:", error);
  }
  currentUser = null;
  results = [];
  localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
  renderApp();
}

async function refreshResults(showStatus = false) {
  if (!sb || !currentUser) return;
  const status = $("#teacher-results-status");
  if (showStatus && status) status.textContent = "Cargando resultados...";
  try {
    const { data, error } = await sb.from("results").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    results = (data || []).map(rowToGrade);
    if (showStatus && status) status.textContent = `${quantity(results.length, "resultado")} ${results.length === 1 ? "cargado" : "cargados"}. ${quantity(pendingResults.length, "pendiente local", "pendientes locales")}.`;
  } catch (error) {
    console.error("Resultados:", error);
    if (showStatus && status) status.textContent = translateError(error);
  }
}
function rowToGrade(row) {
  return {
    id: row.submission_id || row.id,
    databaseId: row.id,
    submissionId: row.submission_id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    courseId: row.course_id,
    courseName: row.course_name,
    examId: row.exam_id,
    examTitle: row.exam_title,
    attempt: row.attempt,
    score: Number(row.score),
    correct: row.correct,
    total: row.total,
    answers: row.answers || {},
    questionIds: row.question_ids || [],
    date: row.created_at,
    startedAt: row.started_at,
    secondsUsed: row.seconds_used,
    completionReason: row.completion_reason,
    review: row.answers?.review || []
  };
}
function bindAdminTeacherActions() {
  $$("[data-admin-teacher-action]").forEach(button => {
    if (button.dataset.teacherActionBound === "true") return;

    button.dataset.teacherActionBound = "true";

    button.addEventListener("click", async () => {
      const teacherId = button.dataset.teacherId;
      const action = button.dataset.adminTeacherAction;

      if (!teacherId || !action) return;

      if (action === "view") {
        openAdminTeacherModal(teacherId);
        return;
      }

      await updateAdminTeacherStatus(
        teacherId,
        action,
        button
      );
    });
  });
}

function renderTeacher() {
  show("teacher-view");
  $("#teacher-welcome").textContent = "Tablero";
  const courses = getTeacherCourses();
  const exams = getTeacherExams();
  if ($("#exams-tab-count")) $("#exams-tab-count").textContent = exams.length;
  if ($("#grades-tab-count")) $("#grades-tab-count").textContent = results.length;
  renderTeacherOverview();
  renderTeacherCourseList(false);
  renderTeacherExamWorkspace(courses, exams);
  fillTeacherFilters();
  renderTeacherGrades(filteredTeacherResults());
  bindTeacherActions();
  bindTeacherExamWorkspaceActions();
}
function getTeacherCourses() {
  // A published course is authoritative when an old local draft with the same
  // id remains in localStorage after the publication was completed.
  return [...new Map([...drafts.courses, ...publishedCourses].map(course => [course.id, course])).values()];
}
function isPublishedCourse(courseId) {
  return publishedCourses.some(course => course.id === courseId);
}
function getTeacherExams() {
  return [...new Map([...publishedExams, ...drafts.exams].map(exam => [exam.id, exam])).values()];
}
function renderTeacherOverview() {
  const allCourses = getTeacherCourses();
  const courseCards = allCourses.length ? allCourses.map(course => {
    const isDraft = !isPublishedCourse(course.id);
    const editClass = isDraft ? "edit-course" : "edit-published-course";
    const deleteClass = isDraft ? "delete-course" : "delete-published-course";
    return `<article class="canvas-dashboard-card">
      <div class="canvas-dashboard-cover"><span>${esc(course.name.charAt(0).toLocaleUpperCase("es"))}</span><small>${isDraft ? "NO PUBLICADO" : "PUBLICADO"}</small></div>
      <div class="canvas-dashboard-card-body">
        <strong class="canvas-course-title">${esc(course.name)}</strong>
        <div class="canvas-dashboard-overview-actions">
          <button class="manage-course-content" data-course-id="${esc(course.id)}" type="button">Abrir curso</button>
          <button class="${editClass}" data-id="${esc(course.id)}" type="button">Editar</button>
          <button class="${deleteClass}" data-id="${esc(course.id)}" type="button">Eliminar</button>
        </div>
      </div>
    </article>`;
  }).join("") : `<div class="canvas-dashboard-empty">${modernIcon("course")}<strong>Aún no hay cursos</strong><p>Crea tu primer curso para comenzar.</p><button class="btn primary overview-new-course-dynamic" type="button">Crear curso</button></div>`;
  $("#teacher-overview").innerHTML = `<section class="canvas-dashboard-courses" aria-label="Cursos creados"><div class="canvas-dashboard-grid">${courseCards}</div></section>`;
}
function renderTeacherCourseList(bind = true) {
  $("#teacher-course-list").innerHTML = renderTeacherCourses();
  renderTeacherQuickCourses();
  if (bind) bindTeacherActions();
}
function activateStat(action) {
  if (action === "grades") { const tab = $('[data-teacher-tab="teacher-grades"]'); switchTab("teacher", "teacher-grades", tab); return; }
  switchTab("teacher", "teacher-courses", $('[data-teacher-tab="teacher-courses"]'));
  renderTeacherCourseList();
}
function renderTeacherCourses() {
  const query = ($("#course-search")?.value || "").trim().toLocaleLowerCase("es");
  const matches = (course, state) => !query || `${course.name} ${state}`.toLocaleLowerCase("es").includes(query);
  const published = publishedCourses.filter(course => matches(course, "publicado"));
  const local = drafts.courses.filter(course => !isPublishedCourse(course.id)).filter(course => matches(course, "borrador"));
  if (!published.length && !local.length) return `<div class="course-directory-empty">${modernIcon("course")}<strong>No se encontraron cursos</strong><small>Prueba con otro nombre o crea un curso nuevo.</small></div>`;
  return `${renderCanvasCourseGroup("Cursos publicados", published, false)}${renderCanvasCourseGroup("Cursos no publicados", local, true)}`;
}

function renderCanvasCourseGroup(title, courses, isDraft) {
  const emptyMessage = isDraft ? "No tienes cursos pendientes de publicación." : "Todavía no hay cursos publicados.";
  return `<section class="canvas-course-group ${isDraft ? "drafts" : "published"}"><header><h4>${title} <span>${courses.length}</span></h4></header>${courses.length ? `<div class="canvas-course-grid">${courses.map((course, index) => renderCanvasCourseCard(course, isDraft, index)).join("")}</div>` : `<p class="canvas-course-group-empty">${emptyMessage}</p>`}</section>`;
}

function renderCanvasCourseCard(course, isDraft, index) {
  const modules = normalizeModules(course.modules);
  const activities = modules.reduce((total, module) => total + module.activities.length, 0);
  const exams = [...publishedExams, ...drafts.exams].filter(exam => exam.courseId === course.id).length;
  const editClass = isDraft ? "edit-course" : "edit-published-course";
  const deleteClass = isDraft ? "delete-course" : "delete-published-course";
  return `<article class="canvas-course-card tone-${index % 5} ${isDraft ? "draft" : ""}">
    <div class="canvas-course-cover"><span>${esc(course.name.charAt(0).toLocaleUpperCase("es"))}</span><details class="canvas-course-menu"><summary aria-label="Más acciones para ${esc(course.name)}">⋮</summary><div>${isDraft ? `<button class="publish-course" data-id="${esc(course.id)}" type="button">Publicar curso</button>` : ""}<button class="create-exam-course" data-id="${esc(course.id)}" type="button">Crear evaluación</button></div></details></div>
    <div class="canvas-course-body"><strong class="canvas-course-title">${esc(course.name)}</strong><small>${isDraft ? "No publicado" : "Publicado"}</small><footer><span title="Módulos">${modernIcon("page")} ${modules.length}</span><span title="Recursos">${modernIcon("folder")} ${activities}</span><span title="Evaluaciones">${modernIcon("quiz")} ${exams}</span></footer><div class="canvas-course-actions"><button class="manage-course-content" data-course-id="${esc(course.id)}" type="button">Abrir curso</button><button class="${editClass}" data-id="${esc(course.id)}" type="button">Editar</button><button class="${deleteClass} danger" data-id="${esc(course.id)}" type="button">Eliminar</button></div></div>
  </article>`;
}
function renderTeacherQuickCourses() {
  const target = $("#course-quick-list");
  if (!target) return;
  const groups = [
    ["Cursos publicados", publishedCourses],
    ["Cursos no publicados", drafts.courses.filter(course => !isPublishedCourse(course.id))]
  ];
  target.innerHTML = groups.map(([label, courses]) => `<section><strong>${label}</strong>${courses.length ? courses.map(course => `<button class="manage-course-content" data-course-id="${esc(course.id)}" type="button"><i aria-hidden="true"></i><span>${esc(course.name)}</span></button>`).join("") : `<small>Sin cursos</small>`}</section>`).join("");
}
function renderTeacherExamWorkspace(courses, exams) {
  const coursesById = new Map(courses.map(course => [course.id, course]));
  exams.forEach(exam => {
    if (!coursesById.has(exam.courseId)) coursesById.set(exam.courseId, { id: exam.courseId, name: "Curso no encontrado", description: "Revisa la asignación de estas evaluaciones." });
  });
  const directory = $("#teacher-exam-directory");
  const courseDirectory = $("#teacher-course-directory");
  const workspace = $("#teacher-course-workspace");
  const activeCourse = coursesById.get(activeTeacherCourseId);
  $("#teacher-view").classList.toggle("course-open", Boolean(activeCourse));
  document.body.classList.toggle("teacher-course-open", Boolean(activeCourse));
  if (!activeCourse) {
    activeTeacherCourseId = null;
    directory.classList.remove("hidden");
    courseDirectory.classList.remove("hidden");
    workspace.classList.add("hidden");
    $("#teacher-exam-course-list").innerHTML = coursesById.size
      ? [...coursesById.values()].map(course => renderTeacherExamCourseLink(course, exams)).join("")
      : emptyCard("Todavía no hay cursos. Crea uno para agregar evaluaciones.");
    return;
  }
  directory.classList.add("hidden");
  courseDirectory.classList.add("hidden");
  workspace.classList.remove("hidden");
  workspace.innerHTML = renderTeacherCourseWorkspace(activeCourse, exams.filter(exam => exam.courseId === activeCourse.id));
}
function renderTeacherExamCourseLink(course, exams) {
  const courseExams = exams.filter(exam => exam.courseId === course.id);
  const questionCount = courseExams.reduce((total, exam) => total + exam.questions.length, 0);
  const isDraftCourse = drafts.courses.some(item => item.id === course.id);
  return `<button class="exam-course-link open-course-workspace" data-course-id="${esc(course.id)}" type="button">
    <span class="exam-course-link-icon">${modernIcon("course")}</span>
    <span class="exam-course-link-copy"><small>CURSO</small><strong>${esc(course.name)}</strong><span>${esc(course.description || "Sin descripción registrada")}</span></span>
    <span class="exam-course-link-stats"><span><strong>${courseExams.length}</strong> ${courseExams.length === 1 ? "examen" : "exámenes"}</span><span><strong>${questionCount}</strong> preguntas en bancos</span></span>
    <span class="status ${isDraftCourse ? "draft" : "published"}">${isDraftCourse ? "Curso local" : "Publicado"}</span>
    <span class="exam-course-link-arrow" aria-hidden="true">→</span>
  </button>`;
}
function renderTeacherCourseWorkspace(course, exams) {
  const isDraftCourse = drafts.courses.some(item => item.id === course.id);
  const isStudentPreview = activeTeacherCourseSection === "student-preview";
  const publishedCount = exams.filter(exam => publishedExams.some(item => item.id === exam.id)).length;
  const questionCount = exams.reduce((total, exam) => total + exam.questions.length, 0);
  const sections = [
    ["overview", "Inicio", "home"],
    ["modules", "Módulos", "modules"],
    ["tasks", "Tareas", "clipboard"],
    ["exams", "Evaluaciones", "quiz"],
    ["grades", "Calificaciones", "grade"],
    ["people", "Personas", "users"],
    ["pages", "Páginas", "page"],
    ["files", "Archivos", "folder"],
    ["questions", "Banco de preguntas", "library"],
    ["settings", "Configuración", "settings"]
  ];
  let content = "";
  if (isStudentPreview) content = renderTeacherStudentPreview(course, exams);
  else if (activeTeacherCourseSection === "modules") content = renderTeacherCourseModulesCanvas(course, exams);
  else if (activeTeacherCourseSection === "tasks") content = renderTeacherCourseTasks(course);
  else if (activeTeacherCourseSection === "exams") content = renderTeacherCourseExams(course, exams);
  else if (activeTeacherCourseSection === "grades") content = renderTeacherCourseGrades(course);
  else if (activeTeacherCourseSection === "people") content = renderTeacherCoursePeople(course);
  else if (activeTeacherCourseSection === "pages") content = renderTeacherCourseResources(course, ["page","lesson"], "Páginas", "page");
  else if (activeTeacherCourseSection === "files") content = renderTeacherCourseResources(course, ["file","pdf","download","video","link"], "Archivos y recursos", "file");
  else if (activeTeacherCourseSection === "questions") content = renderTeacherCourseQuestions(course, exams);
  else if (activeTeacherCourseSection === "settings") content = renderTeacherCourseSettings(course);
  else content = renderTeacherCourseOverview(course, exams, publishedCount, questionCount);
  return `<div class="course-workspace-page">
    <header class="course-context-bar">
      <div class="course-context-title"><button class="course-workspace-back contextual-back" id="back-to-exam-courses" type="button"><span aria-hidden="true">←</span> Cursos</button><span class="course-context-divider" aria-hidden="true"></span><div class="course-context-copy"><span>CURSO ACTUAL</span><h1>${esc(course.name)}</h1></div></div>
      <div class="course-context-actions"><span class="status ${isDraftCourse ? "draft" : "published"}">${isDraftCourse ? "Borrador" : "Publicado"}</span><button class="btn secondary student-preview-toggle ${isStudentPreview ? "active" : ""}" id="toggle-student-preview" type="button">${modernIcon(isStudentPreview ? "edit" : "eye")} ${isStudentPreview ? "Volver a editar" : "Vista del alumno"}</button></div>
    </header>
    <div class="course-workspace-layout ${isStudentPreview ? "student-preview-active" : ""}">
      <aside class="course-workspace-sidebar">
        <div class="course-sidebar-heading"><strong>${esc(course.name)}</strong><small>Navegación del curso</small></div>
        <nav class="course-workspace-nav" aria-label="Secciones de ${esc(course.name)}">${sections.map(([id, label, icon]) => `<button class="course-subpage ${activeTeacherCourseSection === id ? "active" : ""}" data-course-section="${id}" type="button">${modernIcon(icon)}<span>${label}</span></button>`).join("")}</nav>
      </aside>
      <main class="course-workspace-content">${content}</main>
    </div>
  </div>`;
}

function renderTeacherCourseGrades(course) {
  const courseResults = results.filter(result => result.courseId === course.id);
  return `<div class="course-subpage-head"><div><span class="eyebrow">SEGUIMIENTO</span><h2>Calificaciones</h2><p>Resultados registrados para las evaluaciones de este curso.</p></div></div><div class="course-data-list">${courseResults.length ? courseResults.map(result => `<article><span class="activity-type-icon">${modernIcon("results")}</span><div><strong>${esc(result.studentName || "Alumno")}</strong><small>${esc(result.examTitle)} · Intento ${result.attempt || 1}</small></div><b>${Number(result.score || 0).toFixed(1)} / 20</b></article>`).join("") : `<div class="course-workspace-empty"><strong>Aún no hay calificaciones</strong><p>Los resultados aparecerán cuando los alumnos entreguen evaluaciones.</p></div>`}</div>`;
}
function renderTeacherCoursePeople(course) {
  const profilesById = new Map(studentProfiles.map(profile => [profile.id, profile]));
  const authorized = courseEnrollments.filter(enrollment => enrollment.course_id === course.id && enrollment.status === "active");
  return `<div class="course-subpage-head"><div><span class="eyebrow">CONTROL DE ACCESO</span><h2>Alumnos autorizados</h2><p>Solo estos alumnos pueden ver los módulos, evaluaciones y recursos del curso.</p></div></div>
    <form class="course-access-form" data-course-id="${esc(course.id)}"><label for="course-access-email">Correo del alumno</label><div><input id="course-access-email" name="student-email" type="email" autocomplete="email" placeholder="alumno@correo.com" required><button class="btn primary" type="submit">Autorizar alumno</button></div><p class="course-access-status ${courseAccessError ? "error" : ""}" aria-live="polite">${esc(courseAccessError)}</p></form>
    <div class="course-access-list">${authorized.length ? authorized.map(enrollment => {
      const profile = profilesById.get(enrollment.student_id);
      const name = profile?.full_name || "Alumno";
      return `<article><span class="course-person-avatar">${esc(name.charAt(0).toUpperCase())}</span><div><strong>${esc(name)}</strong><small>${esc(profile?.email || "Cuenta registrada")}</small></div><span class="status published">Autorizado</span><button class="btn secondary revoke-course-access" data-course-id="${esc(course.id)}" data-student-id="${esc(enrollment.student_id)}" type="button">Retirar acceso</button></article>`;
    }).join("") : `<div class="course-workspace-empty"><strong>Ningún alumno autorizado</strong><p>Agrega el correo de un alumno registrado para permitirle acceder al curso.</p></div>`}</div>`;
}
function renderTeacherCourseResources(course, types, title, icon) {
  const resources = normalizeModules(course.modules).flatMap(module => module.activities.filter(activity => types.includes(activity.type)).map(activity => ({ activity, module })));
  return `<div class="course-subpage-head"><div><span class="eyebrow">BIBLIOTECA DEL CURSO</span><h2>${title}</h2><p>Vista global de los recursos que ya pertenecen a módulos.</p></div></div><div class="course-data-list">${resources.length ? resources.map(({ activity, module }) => `<article><span class="activity-type-icon">${modernIcon(activity.type || icon)}</span><div><strong>${esc(activity.title)}</strong><small>${esc(module.title)} · ${activityTypeLabel(activity.type)}</small></div><button class="btn secondary edit-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" type="button">Editar</button></article>`).join("") : `<div class="course-workspace-empty"><strong>No hay ${title.toLocaleLowerCase("es")}</strong><p>Agrega contenido desde la sección Módulos.</p></div>`}</div>`;
}
function renderTeacherCourseSettings(course) {
  const modules = normalizeModules(course.modules);
  const activities = modules.reduce((total, module) => total + module.activities.length, 0);
  return `<div class="course-subpage-head"><div><span class="eyebrow">ADMINISTRACIÓN</span><h2>Configuración</h2><p>Edita la información general y revisa el estado estructural del curso.</p></div><button class="btn primary edit-published-course" data-id="${esc(course.id)}" type="button">Editar curso</button></div><div class="course-settings-grid"><article><span>Nombre</span><strong>${esc(course.name)}</strong></article><article><span>Módulos</span><strong>${modules.length}</strong></article><article><span>Elementos</span><strong>${activities}</strong></article><article><span>Estado</span><strong>${drafts.courses.some(item => item.id === course.id) ? "Borrador" : "Publicado"}</strong></article></div><section class="course-settings-description"><h3>Descripción</h3><p>${esc(course.description || "Sin descripción registrada.")}</p></section>`;
}
function renderTeacherCourseTasks(course) {
  const tasks = normalizeModules(course.modules).flatMap(module => module.activities.filter(activity => activity.type === "task").map(activity => ({ activity, module })));
  return `<div class="course-subpage-head"><div><span class="eyebrow">VISTA GLOBAL</span><h2>Tareas</h2><p>Filtro de las tareas ya ubicadas en los módulos; no se crean copias.</p></div></div><div class="course-exam-list">${tasks.length ? tasks.map(({ activity, module }) => `<article class="exam-module-item"><span class="exam-module-type-icon">${modernIcon("task")}</span><div class="exam-module-item-main"><div class="exam-module-title-line"><h4>${esc(activity.title)}</h4><span class="status ${activity.published ? "published" : "draft"}">${activity.published ? "Publicado" : "Borrador"}</span></div><div class="exam-module-meta"><span>Módulo: <strong>${esc(module.title)}</strong></span><span>${activity.points ? `${activity.points} puntos` : "Sin puntaje"}</span><span>${activity.dueAt ? `Vence ${formatDate(activity.dueAt)}` : "Sin fecha límite"}</span><span>${activity.submissionTypes.length ? activity.submissionTypes.join(" + ") : "Sin entrega configurada"}</span></div></div><div class="exam-module-actions"><button class="btn secondary edit-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" type="button">Editar</button></div></article>`).join("") : `<div class="course-workspace-empty"><strong>No hay tareas en los módulos</strong><p>Agrega una tarea desde “Módulos” para verla también en este filtro.</p></div>`}</div>`;
}
function renderTeacherStudentPreview(course, exams) {
  const modules = normalizeModules(course.modules);
  const activities = modules.reduce((total, module) => total + module.activities.length, 0);
  return `<section class="teacher-student-preview">
    <div class="student-preview-banner"><span>${modernIcon("profile")}</span><div><strong>Vista del alumno</strong><p>Previsualización de solo lectura. Los cambios de progreso están desactivados.</p></div></div>
    <div class="student-preview-head"><div><span class="eyebrow">CONTENIDO DEL CURSO</span><h2>${esc(course.name)}</h2><p>${esc(course.description || "Contenido académico organizado por módulos.")}</p></div><div class="student-preview-counts"><span><b>${modules.length}</b> módulos</span><span><b>${activities}</b> actividades</span><span><b>${exams.length}</b> evaluaciones</span></div></div>
    <div class="student-preview-readonly" inert>
      ${modules.length ? renderStudentCourseModules(course, []) : `<div class="course-workspace-empty"><strong>Aún no hay módulos</strong><p>El alumno verá aquí el contenido cuando se agreguen módulos.</p></div>`}
    </div>
  </section>`;
}
function activityTypeLabel(type) {
  return ({ page:"Página", lesson:"Lección", file:"Archivo", video:"Video", pdf:"Archivo PDF", download:"Descargable", practice:"Práctica", task:"Tarea", quiz:"Evaluación", discussion:"Foro", live:"Videoclase", heading:"Encabezado", link:"Enlace" })[type] || "Lección";
}
function unlockRuleLabel(module, index) {
  const detail = module.unlockDetail ? `: ${esc(module.unlockDetail)}` : "";
  return ({ immediate:"Disponible inmediatamente", previous:index ? "Tras completar el módulo anterior" : "Disponible inmediatamente", evaluation:`Después de aprobar una evaluación${detail}`, date:`Disponible desde${detail}` })[module.unlockRule] || "Disponible inmediatamente";
}
function activityMeta(activity, exams = []) {
  const exam = exams.find(item => item.id === activity.examId);
  return [
    activityTypeLabel(activity.type),
    exam?.title,
    activity.dueAt ? `Vence ${formatDate(activity.dueAt)}` : "",
    activity.points ? `${activity.points} puntos` : "",
    activity.duration ? `${activity.duration} min` : "",
    activity.attempts ? quantity(activity.attempts, "intento") : "",
    activity.submissionTypes?.length ? `Entrega: ${activity.submissionTypes.map(type => ({ file:"archivos", text:"texto", url:"enlace", questions:"preguntas", none:"sin entrega digital" })[type]).join(", ")}` : ""
  ].filter(Boolean).join(" · ");
}
function modulesWithDescriptionPreviews(value) {
  return normalizeModules(value).map(module => ({
    ...module,
    activities: module.activities.map(activity => ({
      ...activity,
      description: activityDescriptionPreview(activity.description)
    }))
  }));
}
function renderTeacherCourseModules(course, exams = []) {
  const modules = modulesWithDescriptionPreviews(course.modules);
  return `<div class="course-subpage-head"><div><span class="eyebrow">CONTENIDO DEL CURSO</span><h2>Módulos</h2><p>Todo el recorrido académico se organiza aquí. Las vistas de tareas y evaluaciones son filtros de estos elementos.</p></div><button class="btn primary add-course-module" data-course-id="${esc(course.id)}" type="button">+ Crear módulo</button></div><details class="course-builder-guide"><summary>Tipos de contenido disponibles</summary><div class="module-content-types" aria-label="Contenido disponible"><b>${modernIcon("page")} Página</b><b>${modernIcon("file")} Archivo</b><b>${modernIcon("video")} Video</b><b>${modernIcon("practice")} Práctica</b><b>${modernIcon("task")} Tarea</b><b>${modernIcon("quiz")} Evaluación</b><b>${modernIcon("discussion")} Foro</b><b>${modernIcon("live")} Videoclase</b><b>${modernIcon("heading")} Encabezado</b></div><p class="drag-help">Arrastra los controles ⋮⋮ o usa las flechas. También puedes mover elementos entre módulos.</p></details>
    <div class="teacher-module-list">${modules.length ? modules.map((module, index) => `<details class="teacher-module-card" data-course-id="${esc(course.id)}" data-module-drop="${esc(module.id)}" ${index === 0 ? "open" : ""}>
      <summary><span class="drag-handle module-drag-handle" draggable="true" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" role="button" tabindex="0" aria-label="Arrastrar módulo ${esc(module.title)}">⋮⋮</span><span class="module-order">${index + 1}</span><div><h3>${esc(module.title)}</h3><small>${unlockRuleLabel(module, index)} · ${quantity(module.activities.length, "elemento", "elementos")}</small></div><span class="status ${module.published ? "published" : "draft"}">${module.published ? "Publicado" : "Borrador"}</span><div class="module-actions"><button class="icon-btn move-module" data-direction="up" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" ${index === 0 ? "disabled" : ""} aria-label="Subir módulo">↑</button><button class="icon-btn move-module" data-direction="down" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" ${index === modules.length - 1 ? "disabled" : ""} aria-label="Bajar módulo">↓</button><button class="icon-btn edit-module" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}">Editar</button><button class="icon-btn delete delete-module" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}">Eliminar</button></div></summary>
      <div class="teacher-activity-list">${module.activities.length ? module.activities.map((activity, activityIndex) => activity.type === "heading" ? `<div class="teacher-activity-row module-heading-row" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-drop="${esc(activity.id)}"><span class="drag-handle activity-drag-handle" draggable="true" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" role="button" tabindex="0" aria-label="Arrastrar encabezado ${esc(activity.title)}">⋮</span><div><strong>${esc(activity.title)}</strong><small>Encabezado · no genera progreso ni calificación</small></div><div class="activity-actions"><button class="icon-btn move-activity" data-direction="up" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" ${activityIndex === 0 ? "disabled" : ""} aria-label="Subir encabezado">↑</button><button class="icon-btn move-activity" data-direction="down" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" ${activityIndex === module.activities.length - 1 ? "disabled" : ""} aria-label="Bajar encabezado">↓</button><button class="icon-btn edit-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}">Editar</button><button class="icon-btn delete delete-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}">Eliminar</button></div></div>` : `<div class="teacher-activity-row ${activity.published ? "" : "is-draft"}" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-drop="${esc(activity.id)}"><span class="drag-handle activity-drag-handle" draggable="true" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" role="button" tabindex="0" aria-label="Arrastrar elemento ${esc(activity.title)}">⋮</span><span class="activity-type-icon">${modernIcon(activity.type)}</span><div><strong>${esc(activity.title)}</strong><small>${esc(activityMeta(activity, exams))}${activity.description ? ` · ${esc(activity.description)}` : ""}</small></div><span class="status ${activity.published ? "published" : "draft"}">${activity.published ? "Publicado" : "Borrador"}</span><div class="activity-actions"><button class="icon-btn move-activity" data-direction="up" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" ${activityIndex === 0 ? "disabled" : ""} aria-label="Subir elemento">↑</button><button class="icon-btn move-activity" data-direction="down" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" ${activityIndex === module.activities.length - 1 ? "disabled" : ""} aria-label="Bajar elemento">↓</button><button class="icon-btn edit-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}">Editar</button><button class="icon-btn delete delete-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}">Eliminar</button></div></div>`).join("") : `<p class="module-empty">Este módulo aún no tiene contenido.</p>`}</div>
      <button class="btn secondary add-module-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" type="button">+ Agregar contenido</button>
    </details>`).join("") : `<div class="course-workspace-empty module-empty-state"><span>${modernIcon("courses")}</span><strong>Aún no hay módulos</strong><p>Crea el primero para comenzar a organizar el recorrido académico.</p><button class="btn primary add-course-module" data-course-id="${esc(course.id)}" type="button">+ Crear primer módulo</button></div>`}</div>`;
}
function renderModuleOptions(course, module, index, moduleCount) {
  return `<div class="row-action-menu"><button class="row-action-toggle" aria-label="Opciones de ${esc(module.title)}" aria-expanded="false" title="Opciones" type="button">⋮</button><div class="row-action-popover hidden"><button class="move-module" data-direction="up" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" ${index === 0 ? "disabled" : ""} type="button">Mover arriba</button><button class="move-module" data-direction="down" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" ${index === moduleCount - 1 ? "disabled" : ""} type="button">Mover abajo</button><button class="edit-module" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" type="button">Editar módulo</button><button class="delete-module danger" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" type="button">Eliminar módulo</button></div></div>`;
}
function renderActivityOptions(course, module, activity, index) {
  return `<div class="row-action-menu"><button class="row-action-toggle" aria-label="Opciones de ${esc(activity.title)}" aria-expanded="false" title="Opciones" type="button">⋮</button><div class="row-action-popover hidden"><button class="move-activity" data-direction="up" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" ${index === 0 ? "disabled" : ""} type="button">Mover arriba</button><button class="move-activity" data-direction="down" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" ${index === module.activities.length - 1 ? "disabled" : ""} type="button">Mover abajo</button><button class="edit-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" type="button">Editar</button><button class="delete-activity danger" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" type="button">Eliminar</button></div></div>`;
}
function renderTeacherCourseModulesCanvas(course, exams = []) {
  const modules = modulesWithDescriptionPreviews(course.modules);
  const totalItems = modules.reduce((total, module) => total + module.activities.length, 0);
  return `<div class="canvas-modules-page">
    <div class="course-subpage-head canvas-modules-head"><div><span class="eyebrow">CONTENIDO DEL CURSO</span><h2>Módulos</h2><p>${quantity(modules.length, "módulo")} · ${quantity(totalItems, "elemento")} organizados en el recorrido académico.</p></div></div>
    <div class="canvas-module-toolbar" aria-label="Acciones de módulos"><button class="btn secondary collapse-all-modules" type="button">Contraer todo</button><button class="btn secondary expand-all-modules" type="button">Expandir todo</button><button class="btn secondary view-course-progress" type="button">${modernIcon("progress")} Ver progreso</button><button class="btn primary add-course-module" data-course-id="${esc(course.id)}" type="button">+ Módulo</button></div>
    <div class="canvas-module-list">${modules.length ? modules.map((module, moduleIndex) => `<details class="canvas-module-card teacher-module-card" data-course-id="${esc(course.id)}" data-module-drop="${esc(module.id)}" ${moduleIndex < 2 ? "open" : ""}>
      <summary class="canvas-module-summary"><span class="drag-handle module-drag-handle" draggable="true" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" role="button" tabindex="0" aria-label="Arrastrar módulo ${esc(module.title)}">⋮⋮</span><span class="module-sequence" aria-label="Módulo ${moduleIndex + 1}">${moduleIndex + 1}</span><div><h3>${esc(module.title)}</h3><small>${unlockRuleLabel(module, moduleIndex)} · ${quantity(module.activities.length, "elemento", "elementos")} · ${module.published ? "Publicado" : "Borrador"}</small></div><span class="module-expand-control" aria-hidden="true"></span><button class="module-quick-add add-module-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" type="button" aria-label="Agregar contenido a ${esc(module.title)}" title="Agregar contenido">+</button>${renderModuleOptions(course, module, moduleIndex, modules.length)}</summary>
      <div class="canvas-module-items">${module.activities.length ? module.activities.map((activity, activityIndex) => activity.type === "heading" ? `<div class="canvas-module-heading" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-drop="${esc(activity.id)}"><span class="drag-handle activity-drag-handle" draggable="true" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}">⋮</span><span class="activity-sequence">${activityIndex + 1}</span><strong>${esc(activity.title)}</strong>${renderActivityOptions(course, module, activity, activityIndex)}</div>` : `<div class="canvas-module-item ${activity.published ? "" : "is-draft"}" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-drop="${esc(activity.id)}"><span class="drag-handle activity-drag-handle" draggable="true" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" data-activity-id="${esc(activity.id)}" role="button" tabindex="0" aria-label="Arrastrar ${esc(activity.title)}">⋮</span><span class="activity-sequence" title="${activity.published ? "Publicado" : "Borrador"}">${activityIndex + 1}</span><span class="canvas-item-icon">${modernIcon(activity.type)}</span><div class="canvas-item-copy"><strong>${esc(activity.title)}</strong><small>${esc(activityMeta(activity, exams))}${activity.description ? ` · ${esc(activity.description)}` : ""}</small></div>${renderActivityOptions(course, module, activity, activityIndex)}</div>`).join("") : `<p class="canvas-module-empty">Este módulo todavía no tiene contenido.</p>`}<button class="canvas-add-content add-module-activity" data-course-id="${esc(course.id)}" data-module-id="${esc(module.id)}" type="button"><span aria-hidden="true">＋</span><strong>Agregar contenido</strong><small>Página, archivo, video, tarea, práctica o evaluación</small></button></div>
    </details>`).join("") : `<div class="course-workspace-empty module-empty-state"><span>${modernIcon("courses")}</span><strong>Aún no hay módulos</strong><p>Crea el primero para organizar el contenido del curso.</p><button class="btn primary add-course-module" data-course-id="${esc(course.id)}" type="button">+ Crear primer módulo</button></div>`}</div>
  </div>`;
}

function renderTeacherCourseOverview(course, exams, publishedCount, questionCount) {
  const recent = exams.slice(0, 3);
  const modules = normalizeModules(course.modules);
  const activityCount = modules.reduce((total, module) => total + module.activities.length, 0);
  const metrics = [
    ["Módulos", modules.length, "courses", "Estructura del curso"],
    ["Elementos", activityCount, "page", "Contenido organizado"],
    ["Evaluaciones", exams.length, "quiz", `${publishedCount} publicadas`],
    ["Preguntas", questionCount, "practice", "En bancos del curso"]
  ];
  return `<div class="course-home">
    <div class="course-subpage-head course-home-heading"><div><span class="eyebrow">INICIO DEL CURSO</span><h2>${esc(course.name)}</h2><p>${esc(course.description || "Administra el contenido, las evaluaciones y el progreso de este curso.")}</p></div><button class="btn primary course-home-open-modules" type="button">${modernIcon("courses")} Gestionar módulos</button></div>
    <section class="course-home-metrics" aria-label="Resumen del curso">${metrics.map(([label, value, icon, detail]) => `<article><span class="course-home-metric-icon">${modernIcon(icon)}</span><div><small>${label}</small><strong>${value}</strong><p>${detail}</p></div></article>`).join("")}</section>
    <section class="course-home-panel">
      <header class="course-home-panel-head"><div><span class="eyebrow">ACTIVIDAD RECIENTE</span><h3>Evaluaciones del curso</h3><p>Accede rápidamente a las últimas evaluaciones configuradas.</p></div><button class="btn secondary create-exam-course" data-id="${esc(course.id)}" type="button">+ Nueva evaluación</button></header>
      ${recent.length ? `<div class="course-recent-list">${recent.map(exam => `<button class="course-recent-exam edit-exam" data-id="${esc(exam.id)}" type="button"><span class="course-recent-icon">${modernIcon("quiz")}</span><span class="course-recent-copy"><strong>${esc(exam.title)}</strong><small><b>${exam.minutes} min</b><b>${quantity(exam.questions.length, "pregunta")}</b><b>${exam.attemptsAllowed} ${exam.attemptsAllowed === 1 ? "intento" : "intentos"}</b></small></span><span class="course-recent-action">Editar <b aria-hidden="true">→</b></span></button>`).join("")}</div>` : `<div class="course-workspace-empty course-home-empty"><strong>Aún no hay evaluaciones</strong><p>Crea la primera para comenzar a construir el recorrido del curso.</p></div>`}
    </section>
  </div>`;
}
function renderTeacherCourseExams(course, exams) {
  const modules = normalizeModules(course.modules);
  return `<div class="course-subpage-head"><div><span class="eyebrow">VISTA GLOBAL</span><h2>Evaluaciones</h2><p>Este listado filtra las evaluaciones del curso. La ubicación pedagógica se administra en Módulos.</p></div><button class="btn primary create-exam-course" data-id="${esc(course.id)}" type="button">+ Crear evaluación</button></div>
    <div class="course-exam-list">${exams.length ? exams.map(exam => {
      const module = modules.find(item => item.activities.some(activity => activity.examId === exam.id && activity.type === "quiz"));
      return renderTeacherExamRow(exam, module?.title || "");
    }).join("") : `<div class="course-workspace-empty"><strong>Este curso todavía no tiene evaluaciones</strong><p>Crea la primera y después ubícala dentro de un módulo.</p></div>`}</div>`;
}
function renderTeacherCourseQuestions(course, exams) {
  const questionCount = exams.reduce((total, exam) => total + exam.questions.length, 0);
  const publishedCount = exams.filter(exam => publishedExams.some(item => item.id === exam.id)).length;
  const average = exams.length ? Math.round(questionCount / exams.length) : 0;
  return `<div class="question-bank-page">
    <div class="course-subpage-head question-bank-heading"><div><span class="eyebrow">CONTENIDO EVALUATIVO</span><h2>Banco de preguntas</h2><p>Organiza y administra las preguntas de cada evaluación desde una biblioteca centralizada.</p></div><button class="btn primary create-exam-course" data-id="${esc(course.id)}" type="button">+ Nueva evaluación</button></div>
    <section class="question-bank-summary" aria-label="Resumen del banco"><article><span>${modernIcon("practice")}</span><div><small>Preguntas totales</small><strong>${questionCount}</strong></div></article><article><span>${modernIcon("quiz")}</span><div><small>Bancos activos</small><strong>${exams.length}</strong></div></article><article><span>${modernIcon("results")}</span><div><small>Publicados</small><strong>${publishedCount}</strong></div></article><article><span>${modernIcon("progress")}</span><div><small>Promedio por banco</small><strong>${average}</strong></div></article></section>
    <div class="question-bank-toolbar"><label><span>${modernIcon("courses")}</span><input id="question-bank-search" type="search" placeholder="Buscar una evaluación o banco…" autocomplete="off"></label><span>${quantity(exams.length, "banco disponible", "bancos disponibles")}</span></div>
    <div class="course-question-banks question-bank-grid">${exams.length ? exams.map(exam => {
      const isPublished = publishedExams.some(item => item.id === exam.id);
      const searchText = `${exam.title} ${isPublished ? "publicado" : "borrador"}`.toLocaleLowerCase("es");
      return `<article class="course-question-bank" data-bank-search="${esc(searchText)}"><header><span class="question-bank-icon">${modernIcon("quiz")}</span><span class="status ${isPublished ? "published" : "draft"}">${isPublished ? "Publicado" : "Borrador"}</span></header><div class="question-bank-card-copy"><h3>${esc(exam.title)}</h3><p>Banco vinculado a esta evaluación.</p></div><div class="question-bank-card-metrics"><span><b>${exam.questions.length}</b><small>Preguntas</small></span><span><b>${exam.optionCount}</b><small>Opciones</small></span><span><b>${exam.minutes}</b><small>Minutos</small></span></div><footer><small>${exam.attemptsAllowed} ${exam.attemptsAllowed === 1 ? "intento permitido" : "intentos permitidos"}</small><button class="btn secondary edit-exam" data-id="${esc(exam.id)}" type="button">Administrar banco <span aria-hidden="true">→</span></button></footer></article>`;
    }).join("") : `<div class="course-workspace-empty question-bank-empty"><strong>No hay bancos de preguntas</strong><p>Crea una evaluación para comenzar a construir su banco.</p><button class="btn primary create-exam-course" data-id="${esc(course.id)}" type="button">+ Crear primera evaluación</button></div>`}</div>
    <div id="question-bank-filter-empty" class="course-workspace-empty question-bank-filter-empty hidden"><strong>No hay coincidencias</strong><p>Prueba con otro nombre de evaluación.</p></div>
  </div>`;
}
function renderTeacherExamRow(exam, moduleTitle = "") {
  const isDraft = !publishedExams.some(item => item.id === exam.id);
  const actions = isDraft
    ? `<button class="btn secondary edit-exam" data-id="${esc(exam.id)}" type="button">Editar</button><button class="btn secondary export-draft" data-id="${esc(exam.id)}" type="button">Exportar JSON</button><button class="icon-btn delete delete-exam" data-id="${esc(exam.id)}" type="button">Eliminar</button>`
    : `<button class="btn secondary edit-exam" data-id="${esc(exam.id)}" type="button">Modificar</button>`;
  return `<article class="exam-module-item ${isDraft ? "is-draft" : ""}">
    <span class="exam-module-type-icon">${modernIcon("exams")}</span>
    <div class="exam-module-item-main">
      <div class="exam-module-title-line"><h4>${esc(exam.title)}</h4><span class="status ${isDraft ? "draft" : "published"}">${isDraft ? "Borrador local" : "Publicado"}</span></div>
      <div class="exam-module-meta"><span><strong>${exam.questionsToShow}</strong> preguntas</span><span><strong>${exam.minutes}</strong> min</span><span><strong>${exam.attemptsAllowed}</strong> ${exam.attemptsAllowed === 1 ? "intento" : "intentos"}</span><span>Banco: <strong>${quantity(exam.questions.length, "pregunta")}</strong></span><span><strong>${exam.optionCount}</strong> opciones</span><span class="${moduleTitle ? "exam-assigned" : "exam-unassigned"}">${moduleTitle ? `Módulo: ${esc(moduleTitle)}` : "Sin asignar a un módulo"}</span></div>
    </div>
    <div class="exam-module-actions">${actions}</div>
  </article>`;
}
function bindTeacherActions() {
  $$("[data-overview-tab]").forEach(button => button.addEventListener("click", () => switchTab("teacher", button.dataset.overviewTab, $(`[data-teacher-tab="${button.dataset.overviewTab}"]`))));
  $$(".overview-new-course-dynamic").forEach(button => button.addEventListener("click", () => openCourseModal()));
  $$(".overview-new-exam-dynamic").forEach(button => button.addEventListener("click", () => openExamModal()));
  $$(".view-course").forEach(button => button.addEventListener("click", () => switchTab("teacher", "teacher-exams", $('[data-teacher-tab="teacher-exams"]'))));
  $$(".create-exam-course").filter(button => !button.closest("#teacher-course-workspace")).forEach(button => button.addEventListener("click", () => openExamModal(null, button.dataset.id)));
  $$(".edit-course").forEach(button => button.addEventListener("click", () => openCourseModal(button.dataset.id)));
  $$(".delete-course").forEach(button => button.addEventListener("click", () => deleteCourseDraft(button.dataset.id)));
  $$(".edit-published-course").forEach(button => button.addEventListener("click", () => openCourseModal(button.dataset.id)));
  $$(".delete-published-course").forEach(button => button.addEventListener("click", () => deletePublishedCourse(button.dataset.id)));
  $$(".edit-exam").filter(button => !button.closest("#teacher-course-workspace")).forEach(button => button.addEventListener("click", () => openExamModal(button.dataset.id)));
  $$(".delete-exam").filter(button => !button.closest("#teacher-course-workspace")).forEach(button => button.addEventListener("click", () => deleteExamDraft(button.dataset.id)));
  $$(".export-draft").filter(button => !button.closest("#teacher-course-workspace")).forEach(button => button.addEventListener("click", () => { openExamModal(button.dataset.id); setTimeout(exportCurrentExam, 50); }));
  $$(".export-course").forEach(button => button.addEventListener("click", () => exportCourseDraft(button.dataset.id)));
  $$(".publish-course").forEach(button => button.addEventListener("click", () => openPublishCourseModal(button.dataset.id)));
  $$(".manage-course-content").forEach(button => button.addEventListener("click", () => openTeacherCourseWorkspace(button.dataset.courseId, "modules", "courses")));
}
function openTeacherCourseWorkspace(courseId, section = "overview", origin = "exams") {
  activeTeacherCourseId = courseId;
  activeTeacherCourseSection = section;
  activeTeacherWorkspaceOrigin = origin;
  switchTab("teacher", "teacher-courses", $('[data-teacher-tab="teacher-courses"]'));
  renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
  bindTeacherExamWorkspaceActions();
}
function exportCourseDraft(id) {
  const course = drafts.courses.find(item => item.id === id);
  if (!course) return;
  download(JSON.stringify({ schema_version: 2, id: course.id, name: course.name, description: course.description || "", teacher_name: course.teacherName || currentUser.name, modules: normalizeModules(course.modules) }, null, 2), `${slug(course.id)}.json`, "application/json;charset=utf-8");
}
function openPublishCourseModal(id) {
  const course = drafts.courses.find(item => item.id === id);
  const exams = drafts.exams.filter(exam => exam.courseId === id);
  if (!course) return;
  if (!exams.length && !normalizeModules(course.modules).length) {
    const status = $("#course-publish-status");
    status.className = "course-publish-status error";
    status.textContent = "Agrega al menos un módulo o una evaluación antes de publicar el curso.";
    return;
  }
  publishingCourseId = id;
  $("#publish-course-title").textContent = `Publicar ${course.name}`;
  $("#publish-exam-options").innerHTML = exams.length ? exams.map(exam => `<label class="publish-exam-option"><input type="checkbox" name="publish-exam" value="${esc(exam.id)}" checked><span><strong>${esc(exam.title)}</strong><small>${quantity(exam.questions.length, "pregunta")} · ${exam.minutes} min</small></span></label>`).join("") : `<p class="muted">Se publicarán los módulos y actividades del curso. Aún no hay evaluaciones.</p>`;
  $("#publish-course-error").textContent = "";
  $("#publish-course-modal").classList.remove("hidden");
}
function closeRowActionMenus() {
  $$(".row-action-popover").forEach(popover => popover.classList.add("hidden"));
  $$(".row-action-toggle").forEach(toggle => toggle.setAttribute("aria-expanded", "false"));
  $$(".row-action-menu.is-open").forEach(menu => menu.classList.remove("is-open"));
  $$(".canvas-module-card.has-open-actions").forEach(card => card.classList.remove("has-open-actions"));
}
document.addEventListener("click", closeRowActionMenus);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeRowActionMenus();
});
function bindTeacherExamWorkspaceActions() {
  $$(".teacher-module-card > summary button").forEach(button => button.addEventListener("click", event => event.stopPropagation()));
  $$(".row-action-menu").forEach(menu => menu.addEventListener("click", event => event.stopPropagation()));
  $$(".row-action-toggle").forEach(toggle => toggle.addEventListener("click", event => {
    event.stopPropagation();
    const menu = toggle.closest(".row-action-menu");
    const popover = menu.querySelector(".row-action-popover");
    const willOpen = popover.classList.contains("hidden");
    closeRowActionMenus();
    if (willOpen) {
      popover.classList.remove("hidden");
      toggle.setAttribute("aria-expanded", "true");
      menu.classList.add("is-open");
      menu.closest(".canvas-module-card")?.classList.add("has-open-actions");
    }
  }));
  $$(".open-course-workspace").forEach(button => button.addEventListener("click", () => {
    openTeacherCourseWorkspace(button.dataset.courseId, "overview", "exams");
  }));
  $("#back-to-exam-courses")?.addEventListener("click", () => {
    activeTeacherCourseId = null;
    activeTeacherCourseSection = "overview";
    activeTeacherWorkspaceOrigin = "courses";
    switchTab("teacher", "teacher-home", $('[data-teacher-tab="teacher-home"]'));
    renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    renderTeacherOverview();
    bindTeacherActions();
  });
  $("#toggle-student-preview")?.addEventListener("click", () => {
    activeTeacherCourseSection = activeTeacherCourseSection === "student-preview" ? "modules" : "student-preview";
    renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    bindTeacherExamWorkspaceActions();
  });
  $$(".course-subpage").forEach(button => button.addEventListener("click", () => {
    activeTeacherCourseSection = button.dataset.courseSection;
    renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    bindTeacherExamWorkspaceActions();
  }));
  $$(".course-home-open-modules").forEach(button => button.addEventListener("click", () => {
    activeTeacherCourseSection = "modules";
    renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    bindTeacherExamWorkspaceActions();
  }));
  $("#question-bank-search")?.addEventListener("input", event => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase("es");
    const cards = $$(".course-question-bank[data-bank-search]");
    let visible = 0;
    cards.forEach(card => {
      const match = !query || card.dataset.bankSearch.includes(query);
      card.classList.toggle("hidden", !match);
      if (match) visible++;
    });
    $("#question-bank-filter-empty")?.classList.toggle("hidden", visible > 0 || !cards.length);
  });
  $$("#teacher-course-workspace .create-exam-course").forEach(button => button.addEventListener("click", () => openExamModal(null, button.dataset.id)));
  $$("#teacher-course-workspace .edit-exam").forEach(button => button.addEventListener("click", () => openExamModal(button.dataset.id)));
  $$("#teacher-course-workspace .delete-exam").forEach(button => button.addEventListener("click", () => deleteExamDraft(button.dataset.id)));
  $$("#teacher-course-workspace .export-draft").forEach(button => button.addEventListener("click", () => { openExamModal(button.dataset.id); setTimeout(exportCurrentExam, 50); }));
  $$("#teacher-course-workspace .add-course-module").forEach(button => button.addEventListener("click", () => openModuleModal(button.dataset.courseId)));
  $$("#teacher-course-workspace .collapse-all-modules").forEach(button => button.addEventListener("click", () => {
    $$("#teacher-course-workspace .canvas-module-card").forEach(module => { module.open = false; });
  }));
  $$("#teacher-course-workspace .expand-all-modules").forEach(button => button.addEventListener("click", () => {
    $$("#teacher-course-workspace .canvas-module-card").forEach(module => { module.open = true; });
  }));
  $$("#teacher-course-workspace .course-access-form").forEach(form => form.addEventListener("submit", authorizeCourseStudent));
  $$("#teacher-course-workspace .revoke-course-access").forEach(button => button.addEventListener("click", () => revokeCourseStudent(button.dataset.courseId, button.dataset.studentId)));
  $$("#teacher-course-workspace .edit-published-course").forEach(button => button.addEventListener("click", () => openCourseModal(button.dataset.id)));
  $$("#teacher-course-workspace .edit-module").forEach(button => button.addEventListener("click", () => openModuleModal(button.dataset.courseId, button.dataset.moduleId)));
  $$("#teacher-course-workspace .add-module-activity").forEach(button => button.addEventListener("click", () => openActivityModal(button.dataset.courseId, button.dataset.moduleId)));
  $$("#teacher-course-workspace .edit-activity").forEach(button => button.addEventListener("click", () => openActivityModal(button.dataset.courseId, button.dataset.moduleId, button.dataset.activityId)));
  $$("#teacher-course-workspace .delete-module").forEach(button => button.addEventListener("click", () => deleteModule(button.dataset.courseId, button.dataset.moduleId)));
  $$("#teacher-course-workspace .delete-activity").forEach(button => button.addEventListener("click", () => deleteActivity(button.dataset.courseId, button.dataset.moduleId, button.dataset.activityId)));
  $$("#teacher-course-workspace .move-module").forEach(button => button.addEventListener("click", () => moveModule(button.dataset.courseId, button.dataset.moduleId, button.dataset.direction)));
  $$("#teacher-course-workspace .move-activity").forEach(button => button.addEventListener("click", () => moveActivity(button.dataset.courseId, button.dataset.moduleId, button.dataset.activityId, button.dataset.direction)));
  bindModuleDragAndDrop();
}
async function authorizeCourseStudent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".course-access-status");
  const button = event.submitter;
  const email = new FormData(form).get("student-email")?.toString().trim().toLowerCase() || "";
  if (!sb || !email) return;
  button.disabled = true;
  status.className = "course-access-status";
  status.textContent = "Autorizando alumno...";
  try {
    const { error } = await sb.rpc("grant_course_access", { target_course_id:form.dataset.courseId, target_student_email:email });
    if (error) throw error;
    await loadCourseAccess();
    renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    bindTeacherExamWorkspaceActions();
  } catch (error) {
    console.error("Autorizar alumno:", error);
    status.className = "course-access-status error";
    status.textContent = String(error?.message || "").includes("No existe un alumno") ? "No existe un alumno registrado con ese correo." : translateError(error);
  } finally {
    button.disabled = false;
  }
}
async function revokeCourseStudent(courseId, studentId) {
  if (!sb || !confirm("¿Retirar el acceso de este alumno al curso?")) return;
  const button = $(`.revoke-course-access[data-course-id="${CSS.escape(courseId)}"][data-student-id="${CSS.escape(studentId)}"]`);
  if (button) button.disabled = true;
  try {
    const { error } = await sb.rpc("revoke_course_access", { target_course_id:courseId, target_student_id:studentId });
    if (error) throw error;
    await loadCourseAccess();
    renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
    bindTeacherExamWorkspaceActions();
  } catch (error) {
    console.error("Retirar acceso:", error);
    if (button) { button.disabled = false; button.textContent = "No se pudo retirar"; }
  }
}
async function publishSelectedCourseExams(event) {
  event.preventDefault();
  const courseId = publishingCourseId;
  const course = drafts.courses.find(item => item.id === courseId);
  const selectedIds = new Set($$('input[name="publish-exam"]:checked').map(input => input.value));
  const exams = drafts.exams.filter(exam => exam.courseId === courseId && selectedIds.has(exam.id));
  if (!course) return;
  if (!exams.length && !normalizeModules(course.modules).length) { $("#publish-course-error").textContent = "Agrega al menos un módulo o una evaluación antes de publicar el curso."; return; }
  const button = event.submitter;
  const status = $("#course-publish-status");
  button.disabled = true;
  $("#publish-course-error").textContent = "Publicando y verificando...";
  try {
    const payload = {
      course: { id: course.id, name: course.name, description: course.description || "", teacher_name: course.teacherName || currentUser.name, modules: normalizeModules(course.modules) },
      exams: exams.map(exam => ({ ...examToJsonSchema(exam), published: true }))
    };
    const { data, error } = await sb.rpc("publish_academy_course", { payload });
    if (error) throw error;
    if (!data || data.course_id !== course.id || Number(data.exam_count) !== exams.length) throw new Error("Supabase no confirmó todos los exámenes seleccionados.");

    await loadCourseChanges();
    const verifiedCourse = publishedCourses.find(item => item.id === course.id && item.dynamic);
    const verifiedExams = exams.filter(exam => publishedExams.some(item => item.id === exam.id && item.courseId === course.id));
    const expectedQuestions = exams.reduce((total, exam) => total + exam.questions.length, 0);
    const verifiedQuestions = verifiedExams.reduce((total, exam) => total + (publishedExams.find(item => item.id === exam.id)?.questions.length || 0), 0);
    if (!verifiedCourse || verifiedExams.length !== exams.length || verifiedQuestions !== expectedQuestions) throw new Error("La publicación no pudo recuperarse completa desde Supabase. El borrador se conservó.");

    drafts.courses = drafts.courses.filter(item => item.id !== courseId);
    drafts.exams = drafts.exams.filter(exam => !selectedIds.has(exam.id));
    saveDrafts();
    closeModal("publish-course-modal");
    publishingCourseId = null;
    renderTeacher();
    const refreshedStatus = $("#course-publish-status");
    refreshedStatus.className = "course-publish-status success";
    refreshedStatus.textContent = `${course.name} y ${quantity(exams.length, "examen")} se publicaron y verificaron correctamente.`;
  } catch (error) {
    console.error("Publicar curso:", error);
    $("#publish-course-error").textContent = error.message || translateError(error);
    status.className = "course-publish-status error";
    status.textContent = "La publicación no se completó. El borrador local permanece intacto.";
  } finally {
    button.disabled = false;
  }
}

function playAuthLoginExit() {
  const layout = $("#auth-view .auth-layout");
  layout?.classList.remove("auth-login-exit");
  document.body.classList.remove("auth-galactic-burst");
  return Promise.resolve();
}
function fillTeacherFilters() {
  $("#teacher-course-filter").innerHTML = `<option value="">Todos los cursos</option>${publishedCourses.map(course => `<option value="${esc(course.id)}">${esc(course.name)}</option>`).join("")}`;
  $("#teacher-exam-filter").innerHTML = `<option value="">Todos los exámenes</option>${publishedExams.map(exam => `<option value="${esc(exam.id)}">${esc(exam.title)}</option>`).join("")}`;
}
function filteredTeacherResults() {
  const query = ($("#teacher-search")?.value || "").trim().toLowerCase();
  const courseId = $("#teacher-course-filter")?.value || "";
  const examId = $("#teacher-exam-filter")?.value || "";
  return [...results].filter(grade => {
    const text = `${grade.studentName} ${grade.studentEmail}`.toLowerCase();
    return (!query || text.includes(query)) && (!courseId || grade.courseId === courseId) && (!examId || grade.examId === examId);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}
function renderTeacherGrades(grades) {
  const students = new Map();
  grades.forEach(grade => {
    const key = grade.studentId || grade.studentEmail || grade.studentName;
    if (!students.has(key)) students.set(key, { name: grade.studentName, grades: [] });
    students.get(key).grades.push(grade);
  });
  $("#teacher-grades-body").innerHTML = students.size ? [...students.values()].map((student, index) => {
    const bestScore = Math.max(...student.grades.map(grade => Number(grade.score) || 0));
    return `<details class="student-result-group"${index === 0 ? " open" : ""}>
      <summary><span class="student-result-avatar" aria-hidden="true">${esc((student.name || "A").charAt(0).toUpperCase())}</span><span class="student-result-name"><strong>${esc(student.name)}</strong><small>${student.grades.length} ${student.grades.length === 1 ? "resultado" : "resultados"}</small></span><span class="student-best-score"><small>Mejor nota</small><strong>${bestScore} / 20</strong></span><span class="student-result-toggle" aria-hidden="true"></span></summary>
      <div class="student-grade-list">${student.grades.map(grade => `<article class="student-grade-row">
        <div class="grade-exam"><small>Evaluación</small><strong>${esc(grade.examTitle)}</strong><span>${esc(grade.courseName)} · Intento ${grade.attempt || 1}</span></div>
        <div><small>Nota</small><strong class="grade">${grade.score} / 20</strong><span>${grade.correct} de ${grade.total} aciertos</span></div>
        <div><small>Tiempo</small><strong>${Math.round((grade.secondsUsed || 0) / 60)} min</strong></div>
        <div class="grade-date"><small>Fecha</small><strong>${formatDateOnly(grade.date)}</strong></div>
        <div class="grade-hour"><small>Hora</small><strong>${formatTimeOnly(grade.date)}</strong></div>
        <div class="grade-action"><button class="icon-btn delete delete-result" data-id="${esc(grade.databaseId)}" type="button" aria-label="Eliminar resultado de ${esc(student.name)}">Eliminar</button></div>
      </article>`).join("")}</div>
    </details>`;
  }).join("") : emptyCard("Aún no hay resultados.");
  $$(".delete-result").forEach(button => button.addEventListener("click", () => deleteResult(button.dataset.id)));
}
async function deleteResult(databaseId) {
  if (!sb || currentUser?.role !== "teacher") return;
  const grade = results.find(item => item.databaseId === databaseId);
  if (!grade) return;
  if (!confirm(`¿Eliminar definitivamente el intento ${grade.attempt || 1} de ${grade.studentName} en “${grade.examTitle}”?`)) return;
  const status = $("#teacher-results-status");
  if (status) status.textContent = "Eliminando resultado...";
  try {
    const { error } = await sb.from("results").delete().eq("id", databaseId);
    if (error) throw error;
    await refreshResults();
    renderTeacher();
    if (status) status.textContent = "Resultado eliminado correctamente.";
  } catch (error) {
    console.error("Eliminar resultado:", error);
    if (status) status.textContent = `No se pudo eliminar: ${translateError(error)}`;
  }
}
function exportGrades() {
  const rows = [["Alumno","Correo","Curso","Examen","Intento","Nota","Aciertos","Total","Tiempo usado","Motivo","Fecha"], ...filteredTeacherResults().map(g => [g.studentName,g.studentEmail,g.courseName,g.examTitle,g.attempt || 1,g.score,g.correct,g.total,g.secondsUsed || 0,g.completionReason || "",formatDate(g.date)])];
  download(rows.map(row => row.map(csvCell).join(",")).join("\n"), "notas-masterfull.csv", "text/csv;charset=utf-8");
}

function renderStudent() {
  show("student-view");
  $("#student-welcome").textContent = `Hola, ${currentUser.name}`;
  const courses = publishedCourses.filter(course => publishedExams.some(exam => exam.courseId === course.id) || normalizeModules(course.modules).length);
  const visibleCourseIds = new Set(courses.map(course => course.id));
  const myGrades = results.filter(grade => grade.studentId === currentUser.id && visibleCourseIds.has(grade.courseId));
  const summaries = courses.map(courseStudentSummary);
  $("#student-stats").innerHTML = "";
  renderStudentOverview(courses, summaries);
  const activeStudentCourse = courses.find(course => course.id === activeStudentCourseId);
  if (activeStudentCourseId && !activeStudentCourse) activeStudentCourseId = null;
  document.body.classList.toggle("student-course-open", Boolean(activeStudentCourse));
  $("#student-course-list").classList.toggle("hidden", Boolean(activeStudentCourse));
  $("#student-course-workspace").classList.toggle("hidden", !activeStudentCourse);
  $("#student-overview").classList.toggle("hidden", Boolean(activeStudentCourse));
  $("#student-course-list").innerHTML = renderStudentCourseDirectory(courses, summaries);
  $("#student-course-workspace").innerHTML = activeStudentCourse ? renderStudentCourseWorkspace(activeStudentCourse, myGrades) : "";
  $("#student-grades-body").innerHTML = myGrades.length ? myGrades.map(grade => {
    const exam = publishedExams.find(item => item.id === grade.examId);
    const attemptsUsed = myGrades.filter(item => item.examId === grade.examId).length;
    const canReview = grade.review?.length && attemptsUsed >= (exam?.attemptsAllowed || 1);
    return `<tr><td class="student-grade-course">${esc(grade.courseName)}</td><td class="student-grade-exam">${esc(grade.examTitle)}</td><td class="student-grade-count">${grade.attempt || 1}</td><td class="grade">${grade.score} / 20</td><td class="student-grade-count">${grade.correct} / ${grade.total}</td><td class="student-grade-date"><span>${formatDateOnly(grade.date)}</span><small>${formatTimeOnly(grade.date)}</small></td><td>${canReview ? `<button class="icon-btn review-attempt" data-id="${esc(grade.id)}">Ver respuestas</button>` : `<span class="muted small">Al agotar intentos</span>`}</td></tr>`;
  }).join("") : empty("Todavía no has rendido exámenes.", 7);
  $$(".start-exam").forEach(button => button.addEventListener("click", () => startExam(button.dataset.id)));
  $$(".review-exam").forEach(button => button.addEventListener("click", () => showExamReviews(button.dataset.id)));
  $$(".review-attempt").forEach(button => button.addEventListener("click", () => showAttemptReview(button.dataset.id)));
  $$(".open-lesson").forEach(button => button.addEventListener("click", () => openLesson(button.dataset.courseId, button.dataset.activityId)));
  $$(".open-student-course").forEach(button => button.addEventListener("click", () => { activeStudentCourseId = button.dataset.courseId; activeStudentCourseSection = "modules"; renderStudent(); }));
  $("#back-to-student-courses")?.addEventListener("click", () => { activeStudentCourseId = null; activeStudentCourseSection = "modules"; renderStudent(); });
  $$(".student-course-nav-button").forEach(button => button.addEventListener("click", () => { activeStudentCourseSection = button.dataset.section; renderStudent(); }));
}
function renderStudentCourseDirectory(courses, summaries) {
  if (!courses.length) return `<div class="student-library-empty">${modernIcon("course")}<strong>Aún no tienes cursos autorizados</strong><p>Cuando un profesor te conceda acceso, el curso aparecerá aquí.</p></div>`;
  return `<div class="canvas-dashboard-grid student-course-gallery">${courses.map(course => {
    return `<article class="canvas-dashboard-card student-dashboard-course-card"><div class="canvas-dashboard-cover"><span>${esc(course.name.charAt(0).toLocaleUpperCase("es"))}</span></div><div class="canvas-dashboard-card-body"><strong class="canvas-course-title">${esc(course.name)}</strong><div class="canvas-dashboard-actions student-dashboard-actions"><button class="manage-course-content open-student-course" data-course-id="${esc(course.id)}" type="button">Abrir curso</button></div></div></article>`;
  }).join("")}</div>`;
}
function renderStudentCourseWorkspace(course, myGrades) {
  const summary = courseStudentSummary(course);
  const gradesActive = activeStudentCourseSection === "grades";
  const mainContent = gradesActive ? renderStudentCourseGrades(course, myGrades) : renderStudentCourseModules(course, myGrades);
  return `<div class="student-course-page"><aside class="student-course-sidebar"><div class="student-course-sidebar-title"><span>Curso</span><h2>${esc(course.name)}</h2></div><nav aria-label="Navegación del curso"><button class="student-course-nav-button ${gradesActive ? "" : "active"}" data-section="modules" type="button">${modernIcon("modules")}<span>Módulos</span></button><button class="student-course-nav-button ${gradesActive ? "active" : ""}" data-section="grades" type="button">${modernIcon("grade")}<span>Calificaciones</span></button></nav><div class="student-course-sidebar-progress"><span><b>Progreso</b><strong>${summary.percent}%</strong></span><div class="course-progress-track" role="progressbar" aria-label="Progreso del curso: ${summary.percent}%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.percent}"><span style="width:${summary.percent}%"></span></div></div><button class="course-workspace-back contextual-back" id="back-to-student-courses" type="button"><span aria-hidden="true">←</span> Mis cursos</button></aside><main class="student-course-content"><header class="student-course-main-header"><h2>${gradesActive ? "Calificaciones" : "Módulos"}</h2></header>${mainContent}</main></div>`;
}
function renderStudentCourseGrades(course, myGrades) {
  const grades = myGrades.filter(grade => grade.courseId === course.id).sort((left, right) => new Date(right.date) - new Date(left.date));
  if (!grades.length) return `<div class="student-course-empty"><span>${modernIcon("grade")}</span><strong>Aún no tienes calificaciones</strong><p>Los resultados aparecerán aquí después de completar una evaluación del curso.</p></div>`;
  return `<div class="student-course-grade-list">${grades.map(grade => {
    const exam = publishedExams.find(item => item.id === grade.examId);
    const attemptsUsed = myGrades.filter(item => item.examId === grade.examId).length;
    const canReview = grade.review?.length && attemptsUsed >= (exam?.attemptsAllowed || 1);
    return `<article class="student-course-grade-row"><div><strong>${esc(grade.examTitle)}</strong><small>Intento ${grade.attempt || 1} · ${formatDateOnly(grade.date)}</small></div><span class="student-course-grade-score">${grade.score} / 20</span>${canReview ? `<button class="btn secondary review-attempt" data-id="${esc(grade.id)}" type="button">Ver respuestas</button>` : ""}</article>`;
  }).join("")}</div>`;
}
function courseStudentSummary(course) {
  const activities = normalizeModules(course.modules).filter(module => module.published).flatMap(module => module.activities.filter(activity => activity.published && activity.type !== "heading" && activity.completionRule !== "none"));
  const progress = courseProgress[course.id] || { completed:{}, lastActivityId:"" };
  const myGrades = results.filter(grade => grade.studentId === currentUser?.id);
  const completed = activities.filter(activity => activityCompleted(activity, progress, myGrades)).length;
  return { course, total:activities.length, completed, percent:activities.length ? Math.round(completed * 100 / activities.length) : 0, lastActivityId:progress.lastActivityId || "" };
}
function activityCompleted(activity, progress, myGrades = []) {
  if (activity.examId && ["practice","quiz"].includes(activity.type)) {
    const attempts = myGrades.filter(grade => grade.examId === activity.examId);
    if (activity.completionRule === "pass") return attempts.some(grade => Number(grade.score) >= 11);
    return attempts.length > 0;
  }
  return Boolean(progress.completed?.[activity.id]);
}
function renderStudentOverview(courses, summaries) {
  const container = $("#student-overview");
  if (courses.length && !courseAccessError) {
    container.innerHTML = "";
    return;
  }
  const message = courseAccessError || "Cuando un profesor te autorice un curso, aparecerá aquí.";
  container.innerHTML = `<div class="student-library-empty"><span>${modernIcon("course")}</span><strong>${courses.length ? "Tu plataforma está lista" : "Aún no tienes cursos autorizados"}</strong><p>${esc(message)}</p></div>`;
}
function renderStudentCourseModules(course, myGrades) {
  const modules = normalizeModules(course.modules).filter(module => module.published).map(module => ({ ...module, activities:module.activities.filter(activity => activity.published) }));
  if (!modules.length) return "";
  const progress = courseProgress[course.id] || { completed: {}, lastActivityId:"" };
  let previousComplete = true;
  return `<section class="student-module-space"><div class="student-module-list">${modules.map((module, index) => {
      const passedEvaluation = myGrades.some(grade => grade.courseId === course.id && Number(grade.score) >= 11);
      const dateAvailable = module.unlockRule !== "date" || (module.unlockDetail && new Date(module.unlockDetail) <= new Date());
      const locked = (module.unlockRule === "previous" && !previousComplete) || (module.unlockRule === "evaluation" && !passedEvaluation) || !dateAvailable;
      const progressItems = module.activities.filter(activity => activity.type !== "heading" && activity.completionRule !== "none");
      const moduleCompletedCount = progressItems.filter(activity => activityCompleted(activity, progress, myGrades)).length;
      const moduleComplete = progressItems.length > 0 && moduleCompletedCount === progressItems.length;
      const markup = `<details class="student-module ${locked ? "is-locked" : ""}" ${index === 0 && !locked ? "open" : ""}><summary><span class="module-disclosure" aria-hidden="true">›</span><span class="module-sequence">${index + 1}</span><span><strong>${esc(module.title)}</strong><small>${locked ? `Bloqueado · ${unlockRuleLabel(module, index)}` : `${moduleCompletedCount} de ${progressItems.length} completados · ${moduleComplete ? "Completado" : "En progreso"}`}</small></span></summary>${locked ? `<p class="module-lock-message">Este módulo está bloqueado. ${unlockRuleLabel(module, index)}.</p>` : `<div class="student-activity-list">${module.activities.length ? module.activities.map(activity => {
        if (activity.type === "heading") return `<h5 class="student-module-heading">${esc(activity.title)}</h5>`;
        const exam = activity.examId ? publishedExams.find(item => item.id === activity.examId) : null;
        const actionClass = exam && ["practice","quiz"].includes(activity.type) ? "start-exam" : "open-lesson";
        const actionData = exam ? `data-id="${esc(exam.id)}"` : `data-course-id="${esc(course.id)}" data-activity-id="${esc(activity.id)}"`;
        return `<div class="student-activity" id="activity-${esc(activity.id)}"><span class="student-activity-spacer" aria-hidden="true"></span><span class="activity-type-icon">${modernIcon(activity.type)}</span><button class="${actionClass}" ${actionData} type="button"><strong>${esc(activity.title)}</strong></button></div>`;
      }).join("") : `<p class="module-empty">No hay actividades publicadas.</p>`}</div>`}</details>`;
      previousComplete = moduleComplete;
      return markup;
    }).join("")}</div></section>`;
}
function accessibleCourseActivities(course) {
  const modules = normalizeModules(course.modules).filter(module => module.published).map(module => ({ ...module, activities:module.activities.filter(activity => activity.published && activity.type !== "heading") }));
  const progress = courseProgress[course.id] || { completed:{} };
  const myGrades = results.filter(grade => grade.studentId === currentUser.id);
  const accessible = [];
  let previousComplete = true;
  modules.forEach((module, moduleIndex) => {
    const passedEvaluation = myGrades.some(grade => grade.courseId === course.id && Number(grade.score) >= 11);
    const dateAvailable = module.unlockRule !== "date" || (module.unlockDetail && new Date(module.unlockDetail) <= new Date());
    const locked = (module.unlockRule === "previous" && moduleIndex > 0 && !previousComplete) || (module.unlockRule === "evaluation" && !passedEvaluation) || !dateAvailable;
    if (!locked) module.activities.forEach(activity => accessible.push({ ...activity, moduleId:module.id, moduleTitle:module.title, moduleIndex }));
    const progressItems = module.activities.filter(activity => activity.completionRule !== "none");
    previousComplete = progressItems.length > 0 && progressItems.every(activity => activityCompleted(activity, progress, myGrades));
  });
  return accessible;
}
function openLesson(courseId, activityId) {
  const course = publishedCourses.find(item => item.id === courseId);
  if (!course || !accessibleCourseActivities(course).some(activity => activity.id === activityId)) return;
  activeLessonCourseId = courseId;
  activeLessonActivityId = activityId;
  saveActiveLesson();
  const progress = courseProgress[courseId] || { completed:{}, lastActivityId:"" };
  progress.lastActivityId = activityId;
  const activity = accessibleCourseActivities(course).find(item => item.id === activityId);
  if (activity?.completionRule === "view") progress.completed = { ...(progress.completed || {}), [activityId]:true };
  courseProgress[courseId] = progress;
  saveCourseProgress();
  renderLesson();
}
function safeActivityUrl(value) {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\.\/|\/)/i.test(url) ? url : "";
}
function youtubeEmbedUrl(url) {
  const match = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : "";
}
function lessonMediaMarkup(activity) {
  const url = safeActivityUrl(activity.url);
  if (activity.type === "video") {
    const youtube = youtubeEmbedUrl(url);
    if (youtube) return `<div class="lesson-video-frame"><iframe src="${esc(youtube)}" title="Video: ${esc(activity.title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    if (url && /\.(mp4|webm|ogg)(?:\?|$)/i.test(url)) return `<video controls preload="metadata"><source src="${esc(url)}">Tu navegador no puede reproducir este video.</video>`;
    return `<div class="lesson-media-placeholder"><span>${modernIcon("video")}</span><strong>Clase en video</strong><p>${url ? "Usa el enlace del material para abrir el recurso audiovisual." : "El profesor todavía no ha agregado el video de esta clase."}</p></div>`;
  }
  if (activity.type === "pdf" && url) return `<div class="lesson-document-preview"><span>${modernIcon("pdf")}</span><div><strong>Documento de la clase</strong><p>Consulta el PDF en una pestaña nueva o descárgalo para estudiar sin conexión.</p></div><a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Abrir PDF</a></div>`;
  return "";
}
function renderLesson() {
  const course = publishedCourses.find(item => item.id === activeLessonCourseId);
  const activities = course ? accessibleCourseActivities(course) : [];
  const activityIndex = activities.findIndex(activity => activity.id === activeLessonActivityId);
  if (!course || activityIndex < 0) {
    activeLessonCourseId = null;
    activeLessonActivityId = null;
    saveActiveLesson();
    renderStudent();
    return;
  }
  const activity = activities[activityIndex];
  const progress = courseProgress[course.id] || { completed:{}, lastActivityId:"" };
  $("#lesson-sidebar-course").textContent = course.name;
  $("#lesson-title").textContent = activity.title;
  $("#lesson-type").textContent = `${activity.moduleTitle} · ${activityTypeLabel(activity.type)}`;
  $("#lesson-description").innerHTML = renderActivityContent(activity.description || "Esta página todavía no tiene contenido publicado.");
  const mediaMarkup = lessonMediaMarkup(activity);
  $("#lesson-media").innerHTML = mediaMarkup;
  $("#lesson-media").classList.toggle("hidden", !mediaMarkup);
  const completed = Boolean(progress.completed?.[activity.id]);
  $("#lesson-complete").textContent = completed ? "Actividad completada" : "Marcar como completado";
  $("#lesson-complete").classList.toggle("completed-button", completed);
  $("#lesson-complete").classList.toggle("hidden", activity.completionRule !== "manual");
  $("#lesson-previous").disabled = activityIndex === 0;
  $("#lesson-next").disabled = activityIndex === activities.length - 1;
  $("#lesson-position").textContent = `${activityIndex + 1} de ${activities.length}`;
  const url = safeActivityUrl(activity.url);
  $("#lesson-materials-card").innerHTML = url ? `<div><span class="activity-type-icon">${modernIcon(activity.type === "video" ? "download" : activity.type)}</span><span><strong>Recurso de la actividad</strong><small>${activityTypeLabel(activity.type)} disponible</small></span></div><a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener">Abrir recurso ↗</a>` : "";
  $("#lesson-materials-card").classList.toggle("hidden", !url);
  renderLessonTree(course, activity.id);
  show("lesson-view");
  closeLessonSidebar();
}
function renderLessonTree(course, activeActivityId) {
  const accessibleIds = new Set(accessibleCourseActivities(course).map(activity => activity.id));
  const progress = courseProgress[course.id] || { completed:{} };
  $("#lesson-module-tree").innerHTML = normalizeModules(course.modules).map(module => {
    const moduleAccessible = module.activities.some(activity => accessibleIds.has(activity.id)) || !module.activities.length;
    return `<details class="lesson-tree-module ${moduleAccessible ? "" : "is-locked"}" ${module.activities.some(activity => activity.id === activeActivityId) ? "open" : ""}><summary><strong>${esc(module.title)}</strong><b class="module-expand-control" aria-hidden="true">${moduleAccessible ? "" : "🔒"}</b></summary><div>${moduleAccessible ? module.activities.map(activity => `<button class="lesson-tree-activity ${activity.id === activeActivityId ? "active" : ""}" data-activity-id="${esc(activity.id)}" type="button" ${accessibleIds.has(activity.id) ? "" : "disabled"}><span class="lesson-tree-activity-copy"><strong>${esc(activity.title)}</strong><small>${progress.completed?.[activity.id] ? "Completado" : activity.id === activeActivityId ? "En progreso" : "No iniciado"}</small></span></button>`).join("") : `<p>Completa el requisito anterior para desbloquearlo.</p>`}</div></details>`;
  }).join("");
  $$(".lesson-tree-activity:not(:disabled)").forEach(button => button.addEventListener("click", () => openLesson(course.id, button.dataset.activityId)));
}
function completeActiveLesson() {
  const progress = courseProgress[activeLessonCourseId] || { completed:{}, lastActivityId:"" };
  progress.completed = { ...(progress.completed || {}), [activeLessonActivityId]: !progress.completed?.[activeLessonActivityId] };
  progress.lastActivityId = activeLessonActivityId;
  courseProgress[activeLessonCourseId] = progress;
  saveCourseProgress();
  renderLesson();
}
function navigateLesson(direction) {
  const course = publishedCourses.find(item => item.id === activeLessonCourseId);
  const activities = course ? accessibleCourseActivities(course) : [];
  const index = activities.findIndex(activity => activity.id === activeLessonActivityId);
  const target = activities[index + direction];
  if (target) openLesson(course.id, target.id);
}
function toggleLessonSidebar() {
  const open = document.body.classList.toggle("lesson-sidebar-open");
  $("#lesson-menu-toggle").setAttribute("aria-expanded", String(open));
}
function closeLessonSidebar() {
  document.body.classList.remove("lesson-sidebar-open");
  $("#lesson-menu-toggle").setAttribute("aria-expanded", "false");
}
function renderStudentExamRow(exam, myGrades) {
  const attempts = myGrades.filter(item => item.examId === exam.id);
  const best = attempts.length ? Math.max(...attempts.map(item => item.score)) : null;
  const reviewButton = attempts.length >= exam.attemptsAllowed && attempts.some(item => item.review?.length) ? `<button class="btn secondary review-exam" data-id="${esc(exam.id)}">Revisar intentos</button>` : "";
  return `<div class="exam-row"><div><strong>${esc(exam.title)}</strong><small>${quantity(exam.questionsToShow, "pregunta")} · ${exam.minutes} minutos · ${quantity(exam.attemptsAllowed, "intento permitido", "intentos permitidos")}</small></div><div class="attempt-actions">${best !== null ? `<span class="completed">Mejor nota: ${best}/20</span>` : ""}${attempts.length < exam.attemptsAllowed ? `<button class="btn primary start-exam" data-id="${esc(exam.id)}">${attempts.length ? "Intentar nuevamente" : "Rendir examen"}</button>` : `<span class="attempts-finished">Intentos completados</span>${reviewButton}`}</div></div>`;
}

async function startExam(id) {
  await refreshResults();
  activeExam = publishedExams.find(exam => exam.id === id);
  if (!activeExam) return;
  const attemptsUsed = results.filter(grade => grade.studentId === currentUser.id && grade.examId === id).length;
  if (attemptsUsed >= activeExam.attemptsAllowed) { alert("Ya utilizaste todos los intentos permitidos para este examen."); renderStudent(); return; }
  activeCourse = findCourse(activeExam.courseId);
  activeQuestions = shuffleQuestions(activeExam.questions).slice(0, activeExam.questionsToShow);
  activeSubmissionId = uid();
  examStartedAt = nowIso();
  secondsLeft = activeExam.minutes * 60;
  minuteWarningPlayed = false;
  finishingExam = false;
  $("#exam-course-name").textContent = activeCourse?.name || "CURSO";
  $("#exam-title").textContent = activeExam.title;
  $("#questions-container").innerHTML = activeQuestions.map((question, index) => `<article class="question-card" data-question-id="${esc(question.id)}"><div class="question-card-head"><span class="question-number">Pregunta ${index + 1} <small>de ${activeQuestions.length}</small></span><span class="question-status">Pendiente</span></div><h3>${esc(question.text)}</h3>${questionImageMarkup(question)}<div class="options-list">${question.options.map((option, i) => `<label class="option"><input type="radio" name="q-${esc(question.id)}" value="${i}"><span class="option-letter" aria-hidden="true">${"ABCDEFGH"[i] || i + 1}</span><span class="option-copy">${esc(option)}</span><span class="option-check" aria-hidden="true">✓</span></label>`).join("")}</div></article>`).join("");
  $("#take-exam-form").querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener("change", () => { updateQuestionCardState(input); updateExamProgress(); saveActiveAttempt(); }));
  updateTimer();
  updateExamProgress();
  saveActiveAttempt();
  show("exam-view");
  playRetroSound("start");
  timerInterval = setInterval(() => { secondsLeft--; updateTimer(); if (secondsLeft <= 0) finishExam(true); }, 1000);
}
function shuffleQuestions(questions) {
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}
function updateTimer() {
  $("#timer").textContent = `${String(Math.floor(secondsLeft / 60)).padStart(2,"0")}:${String(secondsLeft % 60).padStart(2,"0")}`;
  $(".timer").classList.toggle("danger", secondsLeft <= 60);
  if (secondsLeft === 60 && !minuteWarningPlayed) {
    minuteWarningPlayed = true;
    setTimeout(() => playRetroSound("warning"), 650);
  }
  if (secondsLeft % 5 === 0) saveActiveAttempt();
}
function getCurrentAnswers() {
  return Object.fromEntries(activeQuestions.map(question => {
    const selected = document.querySelector(`input[name="q-${CSS.escape(question.id)}"]:checked`);
    return [question.id, selected ? Number(selected.value) : null];
  }));
}
function updateExamProgress() {
  const answered = Object.values(getCurrentAnswers()).filter(value => value !== null).length;
  $("#exam-progress").textContent = `${answered} de ${activeQuestions.length} respondidas`;
  const percentage = activeQuestions.length ? (answered / activeQuestions.length) * 100 : 0;
  $("#exam-progress-bar").style.width = `${percentage}%`;
  $("#exam-progress-track").setAttribute("aria-valuemax", String(activeQuestions.length));
  $("#exam-progress-track").setAttribute("aria-valuenow", String(answered));
  $("#exam-progress-track").classList.toggle("complete", answered === activeQuestions.length && activeQuestions.length > 0);
}
function updateQuestionCardState(input) {
  const card = input.closest(".question-card");
  if (!card) return;
  card.classList.add("answered");
  const status = card.querySelector(".question-status");
  if (status) status.textContent = "Respondida ✓";
}
function saveActiveAttempt() {
  if (!activeExam || finishingExam || !currentUser) return;
  localStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify({
    submissionId: activeSubmissionId,
    userId: currentUser.id,
    examId: activeExam.id,
    startedAt: examStartedAt,
    secondsLeft,
    questions: activeQuestions,
    answers: getCurrentAnswers()
  }));
}
function gradeExam(questions, answers) {
  let correct = 0;
  const review = questions.map(question => {
    const selected = answers[question.id] ?? null;
    const isCorrect = selected === question.correct;
    if (isCorrect) correct++;
    return { id: question.id, text: question.text, image: question.image || "", options: [...question.options], correct: question.correct, selected };
  });
  const total = questions.length;
  return { correct, total, score: Math.round((correct / total) * 200) / 10, review };
}
async function finishExam(timeExpired, reason = "", silent = false) {
  if (!activeExam || finishingExam || !currentUser) return;
  finishingExam = true;
  clearInterval(timerInterval);
  timerInterval = null;
  const answers = getCurrentAnswers();
  const grade = gradeExam(activeQuestions, answers);
  const previous = results.filter(item => item.studentId === currentUser.id && item.examId === activeExam.id).length;
  const payload = {
    submission_id: activeSubmissionId || uid(),
    student_id: currentUser.id,
    student_name: currentUser.name,
    student_email: currentUser.email,
    course_id: activeExam.courseId,
    course_name: activeCourse?.name || "",
    exam_id: activeExam.id,
    exam_title: activeExam.title,
    attempt: previous + 1,
    score: grade.score,
    correct: grade.correct,
    total: grade.total,
    answers: { selected: answers, review: grade.review },
    question_ids: activeQuestions.map(question => question.id),
    started_at: examStartedAt,
    seconds_used: Math.max(0, activeExam.minutes * 60 - secondsLeft),
    completion_reason: reason || (timeExpired ? "El tiempo terminó." : "Entregado por el alumno."),
    created_at: nowIso()
  };
  enqueuePending(payload);
  if (silent) sendResultKeepalive(payload);
  const saved = silent ? false : await syncOneResult(payload);
  if (saved) removePending(payload.submission_id);
  localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
  await refreshResults();
  const rowGrade = rowToGrade(payload);
  if (!silent) playRetroSound("finish");
  if (!silent) {
    const attemptsFinished = payload.attempt >= activeExam.attemptsAllowed;
    renderExamResult(rowGrade, attemptsFinished, saved);
    if (attemptsFinished) {
      const completedGrades = [...results.filter(item => item.examId === activeExam.id && item.studentId === currentUser.id && item.review?.length), rowGrade].filter((item, idx, arr) => arr.findIndex(other => other.submissionId === item.submissionId) === idx);
      $("#result-review").innerHTML = reviewSectionMarkup(completedGrades);
    }
  }
}
function enqueuePending(payload) {
  if (!pendingResults.some(item => item.submission_id === payload.submission_id)) {
    pendingResults.push(payload);
    savePending();
  }
}
function removePending(submissionId) {
  pendingResults = pendingResults.filter(item => item.submission_id !== submissionId);
  savePending();
}
async function syncOneResult(payload) {
  if (!sb || !navigator.onLine) return false;
  try {
    const { error } = await sb.from("results").insert(payload);
    if (error) {
      if (String(error.code) === "23505" || String(error.message).toLowerCase().includes("duplicate")) return true;
      throw error;
    }
    return true;
  } catch (error) {
    console.error("No se pudo guardar resultado:", error);
    return false;
  }
}
async function syncPendingResults(shouldRender = true) {
  if (!sb || !currentUser || !pendingResults.length || !navigator.onLine) return;
  for (const payload of [...pendingResults]) {
    const ok = await syncOneResult(payload);
    if (ok) removePending(payload.submission_id);
  }
  await refreshResults();
  if (currentUser && shouldRender) renderApp();
}
async function sendResultKeepalive(payload) {
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const cfg = getSupabaseConfig();
    fetch(`${cfg.url}/rest/v1/results`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates"
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (error) {
    console.error("keepalive:", error);
  }
}
function renderExamResult(grade, includeReview = false) {
  resultCourseId = grade.courseId || activeExam?.courseId || activeCourse?.id || activeStudentCourseId || "";
  $("#result-title").textContent = grade.examTitle || "Evaluación completada";
  $("#result-score").textContent = grade.score;
  $("#result-message").textContent = `${grade.correct} de ${grade.total} respuestas correctas · Intento ${grade.attempt || 1}`;
  $("#result-review").innerHTML = includeReview ? reviewSectionMarkup([grade]) : "";
  show("result-view");
}
function returnFromResult() {
  const courseId = resultCourseId || activeExam?.courseId || activeCourse?.id || "";
  activeExam = null;
  activeQuestions = [];
  finishingExam = false;
  activeStudentCourseId = publishedCourses.some(course => course.id === courseId) ? courseId : null;
  activeStudentCourseSection = "grades";
  renderStudent();
}
function reviewMarkup(grades) {
  const multipleAttempts = grades.length > 1;
  return `<div class="attempt-review-list">${grades.map(grade => `<section class="attempt-review">${multipleAttempts ? `<div class="attempt-review-head"><span>Intento ${grade.attempt || 1}</span><strong>${grade.score}<small>/20</small></strong></div>` : ""}${(grade.review || []).map((question, index) => {
    const answeredCorrectly = question.selected === question.correct;
    const unanswered = question.selected === null || question.selected === undefined;
    return `<article class="review-question ${answeredCorrectly ? "review-correct" : "review-incorrect"}"><div class="review-question-title"><strong>Pregunta ${index + 1}</strong><span>${answeredCorrectly ? "✓ Correcta" : unanswered ? "Sin respuesta" : "✕ Incorrecta"}</span></div><h4>${esc(question.text)}</h4>${questionImageMarkup(question, "review-image")}<div class="review-options">${question.options.map((option, optionIndex) => {
      const classes = ["review-option"];
      if (optionIndex === question.correct) classes.push("correct-answer");
      if (optionIndex === question.selected && optionIndex !== question.correct) classes.push("wrong-answer");
      const label = optionIndex === question.correct ? (optionIndex === question.selected ? "Tu respuesta · Correcta" : "Respuesta correcta") : optionIndex === question.selected ? "Tu respuesta" : "";
      return `<div class="${classes.join(" ")}"><span class="review-option-marker">${String.fromCharCode(65 + optionIndex)}</span><span>${esc(option)}</span>${label ? `<small>${label}</small>` : ""}</div>`;
    }).join("")}</div>${unanswered ? `<p class="unanswered">Esta pregunta quedó sin respuesta.</p>` : ""}</article>`;
  }).join("")}</section>`).join("")}</div>`;
}
function reviewSectionMarkup(grades) {
  return reviewMarkup(grades);
}
function showAttemptReview(gradeId) {
  const grade = results.find(item => item.id === gradeId && item.studentId === currentUser.id);
  if (grade?.review?.length) renderExamResult(grade, true, true);
}
function showExamReviews(examId) {
  const grades = results.filter(item => item.examId === examId && item.studentId === currentUser.id && item.review?.length).sort((a, b) => (a.attempt || 1) - (b.attempt || 1));
  if (!grades.length) return;
  const best = grades.reduce((current, grade) => grade.score > current.score ? grade : current, grades[0]);
  renderExamResult(best, false, true);
  $("#result-review").innerHTML = reviewSectionMarkup(grades);
}
function recoverInterruptedAttempt() {
  if (!currentUser) return;
  let draft;
  try { draft = JSON.parse(localStorage.getItem(ACTIVE_ATTEMPT_KEY)); } catch { localStorage.removeItem(ACTIVE_ATTEMPT_KEY); return; }
  if (!draft || draft.userId !== currentUser.id || !Array.isArray(draft.questions) || !draft.questions.length) return;
  const exam = publishedExams.find(item => item.id === draft.examId);
  if (!exam) { localStorage.removeItem(ACTIVE_ATTEMPT_KEY); return; }
  activeExam = exam;
  activeCourse = findCourse(exam.courseId);
  activeQuestions = draft.questions;
  activeSubmissionId = draft.submissionId || uid();
  examStartedAt = draft.startedAt;
  secondsLeft = draft.secondsLeft || 0;
  const grade = gradeExam(activeQuestions, draft.answers || {});
  const previous = results.filter(item => item.studentId === currentUser.id && item.examId === exam.id).length;
  enqueuePending({
    submission_id: activeSubmissionId,
    student_id: currentUser.id,
    student_name: currentUser.name,
    student_email: currentUser.email,
    course_id: exam.courseId,
    course_name: activeCourse?.name || "",
    exam_id: exam.id,
    exam_title: exam.title,
    attempt: previous + 1,
    score: grade.score,
    correct: grade.correct,
    total: grade.total,
    answers: { selected: draft.answers || {}, review: grade.review },
    question_ids: activeQuestions.map(question => question.id),
    started_at: examStartedAt,
    seconds_used: Math.max(0, exam.minutes * 60 - (draft.secondsLeft || 0)),
    completion_reason: "El examen se registró al detectar que la página se cerró inesperadamente.",
    created_at: nowIso()
  });
  localStorage.removeItem(ACTIVE_ATTEMPT_KEY);
  activeExam = null;
  syncPendingResults();
}

function findCourse(id) {
  return publishedCourses.find(course => course.id === id) || drafts.courses.find(course => course.id === id);
}
function refreshActiveCourseWorkspace() {
  renderTeacherExamWorkspace(getTeacherCourses(), getTeacherExams());
  bindTeacherExamWorkspaceActions();
}
async function saveLegacyCourseModules(courseId, modules) {
  const prefix = legacyModulePrefix(courseId);
  const serialized = JSON.stringify(normalizeModules(modules));
  const chunks = serialized.match(/[\s\S]{1,220}/g) || ["[]"];
  const { data: existing, error: selectError } = await sb.from("course_changes").select("course_id").like("course_id", `${prefix}%`);
  if (selectError) return { error: selectError };
  const rows = chunks.map((chunk, index) => ({
    course_id: `${prefix}${String(index).padStart(4,"0")}`,
    name: `Contenido ${index + 1}/${chunks.length}`,
    description: chunk,
    deleted: false,
    updated_by: currentUser.id
  }));
  const { error } = await sb.from("course_changes").upsert(rows, { onConflict:"course_id" });
  if (error) return { error };
  const activeIds = new Set(rows.map(row => row.course_id));
  const staleIds = (existing || []).map(row => row.course_id).filter(id => !activeIds.has(id));
  if (staleIds.length) {
    const { error: cleanupError } = await sb.from("course_changes").delete().in("course_id", staleIds);
    if (cleanupError) console.warn("No se pudieron limpiar fragmentos antiguos de módulos:", cleanupError);
  }
  return { error:null };
}
async function removeLegacyCourseModules(courseId) {
  const prefix = legacyModulePrefix(courseId);
  const { error } = await sb.from("course_changes").delete().like("course_id", `${prefix}%`);
  if (error) console.warn("No se pudo retirar el respaldo compatible de módulos:", error);
}
function showCourseContentError(error) {
  console.error("Guardar contenido del curso:", error);
  const target = !$("#module-modal")?.classList.contains("hidden") ? $("#module-error") : $("#activity-error");
  if (target) target.textContent = error?.message || translateError(error);
}
async function updateCourseModules(courseId, transform) {
  const localIndex = drafts.courses.findIndex(course => course.id === courseId);
  const course = findCourse(courseId);
  if (!course) return false;
  const modules = normalizeModules(transform(normalizeModules(course.modules)));
  if (localIndex >= 0) {
    drafts.courses[localIndex] = { ...drafts.courses[localIndex], modules, updatedAt: nowIso() };
    saveDrafts();
  } else {
    const { error } = await sb.from("course_changes").upsert({ course_id: courseId, name: course.name, description: course.description || "", modules, deleted: false, updated_by: currentUser.id }, { onConflict: "course_id" });
    if (error && isMissingModulesColumn(error)) {
      const compatibleSave = await saveLegacyCourseModules(courseId, modules);
      if (compatibleSave.error) { showCourseContentError(compatibleSave.error); return false; }
    } else if (error) {
      showCourseContentError(error);
      return false;
    } else await removeLegacyCourseModules(courseId);
    await loadCourseChanges();
  }
  refreshActiveCourseWorkspace();
  return true;
}
function toggleModuleUnlockDetail() {
  const needsDetail = ["evaluation","date"].includes($("#module-unlock-rule").value);
  $("#module-unlock-detail-field").classList.toggle("hidden", !needsDetail);
  $("#module-unlock-detail").required = needsDetail;
}
function openModuleModal(courseId, moduleId = "") {
  closeRowActionMenus();
  closeActivityMenus();
  const module = normalizeModules(findCourse(courseId)?.modules).find(item => item.id === moduleId);
  $("#module-modal-title").textContent = module ? "Editar módulo" : "Crear módulo";
  $("#module-course-id").value = courseId;
  $("#module-id").value = module?.id || "";
  $("#module-title").value = module?.title || "";
  $("#module-published").value = String(module?.published !== false);
  $("#module-unlock-rule").value = module?.unlockRule || "immediate";
  $("#module-unlock-detail").value = module?.unlockDetail || "";
  $("#module-error").textContent = "";
  toggleModuleUnlockDetail();
  $("#module-modal").classList.remove("hidden");
  $("#module-title").focus();
}
async function saveModule(event) {
  event.preventDefault();
  const courseId = $("#module-course-id").value;
  const moduleId = $("#module-id").value;
  const title = $("#module-title").value.trim();
  const published = $("#module-published").value === "true";
  const unlockRule = $("#module-unlock-rule").value;
  const unlockDetail = $("#module-unlock-detail").value.trim();
  if (!title) { $("#module-error").textContent = "Escribe un nombre para el módulo."; return; }
  const saved = await updateCourseModules(courseId, modules => moduleId
    ? modules.map(module => module.id === moduleId ? { ...module, title, published, unlockRule, unlockDetail } : module)
    : [...modules, { id: uid(), title, published, unlockRule, unlockDetail, activities: [] }]);
  if (saved) closeModal("module-modal");
}
function openActivityModal(courseId, moduleId, activityId = "") {
  closeRowActionMenus();
  closeActivityMenus();
  const modules = normalizeModules(findCourse(courseId)?.modules);
  const module = modules.find(item => item.id === moduleId);
  const activity = module?.activities.find(item => item.id === activityId);
  const exams = getTeacherExams().filter(exam => exam.courseId === courseId);
  $("#activity-modal-title").textContent = activity ? "Editar contenido" : "Agregar contenido";
  $("#activity-editor-context").textContent = activity ? `Actualiza “${activity.title}” sin alterar su ubicación en el recorrido.` : `Agrega un nuevo elemento a ${module?.title || "este módulo"}.`;
  $("#activity-course-id").value = courseId;
  $("#activity-module-id").value = moduleId;
  $("#activity-id").value = activity?.id || "";
  $("#activity-target-module").innerHTML = modules.map(item => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join("");
  $("#activity-target-module").value = moduleId;
  $("#activity-title").value = activity?.title || "";
  $("#activity-type").value = activity?.type || "lesson";
  $("#activity-url").value = activity?.url || "";
  $("#activity-description-editor").innerHTML = renderActivityContent(activity?.description || "");
  syncActivityEditor();
  $(".activity-editor-shell").classList.remove("is-fullscreen");
  $$('[data-activity-format="fullscreen"]').forEach(button => button.setAttribute("aria-pressed", "false"));
  $("#activity-published").value = String(activity?.published !== false);
  $("#activity-completion-rule").value = activity?.completionRule || "manual";
  $("#activity-due-at").value = activity?.dueAt ? activity.dueAt.slice(0, 16) : "";
  $("#activity-points").value = activity?.points || 0;
  $("#activity-duration").value = activity?.duration || 0;
  $("#activity-attempts").value = activity?.attempts || 0;
  $("#activity-exam-id").innerHTML = `<option value="">${exams.length ? "Selecciona una evaluación" : "Primero crea una evaluación en este curso"}</option>${exams.map(exam => `<option value="${esc(exam.id)}">${esc(exam.title)}</option>`).join("")}`;
  $("#activity-exam-id").value = activity?.examId || "";
  $$('input[name="activity-submission"]').forEach(input => { input.checked = activity?.submissionTypes?.includes(input.value) || false; });
  toggleActivityFields();
  $("#activity-error").textContent = "";
  $(".module-content-editor-footer .btn.primary").textContent = activity ? "Guardar cambios" : "Agregar al módulo";
  $(".activity-advanced-settings").open = Boolean(activity);
  $("#activity-modal").classList.remove("hidden");
  $("#activity-title").focus();
}
function toggleActivityFields() {
  const type = $("#activity-type").value;
  const isHeading = type === "heading";
  const resourceTypes = ["file","video","link","live","pdf","download"];
  const typeCopy = {
    page: ["Página de contenido", "Redacta una página con información, recursos e indicaciones."],
    lesson: ["Lección", "Explica el tema y orienta el recorrido de aprendizaje."],
    file: ["Archivo", "Añade el título, la ruta del archivo y una descripción opcional."],
    video: ["Video", "Agrega el enlace del video y las indicaciones para visualizarlo."],
    link: ["Enlace externo", "Comparte un recurso externo con contexto para el alumno."],
    practice: ["Práctica", "Vincula un banco de preguntas y explica el objetivo de la práctica."],
    task: ["Tarea", "Describe la entrega esperada y configura sus condiciones."],
    quiz: ["Evaluación", "Vincula una evaluación existente y agrega instrucciones breves."],
    discussion: ["Foro o discusión", "Formula la pregunta y las pautas de participación."],
    live: ["Videoclase", "Incluye el enlace de acceso y la agenda de la sesión."],
    heading: ["Encabezado", "Crea un separador visual dentro del módulo."],
    pdf: ["Archivo PDF", "Añade la ruta del PDF y una descripción para el alumno."],
    download: ["Material descargable", "Añade el recurso y explica cómo debe utilizarse."]
  };
  const [label, help] = typeCopy[type] || ["Contenido", "Completa la información que verá el alumno."];
  $("#activity-content-help").textContent = help;
  $("#activity-title").placeholder = `Título de ${label.toLocaleLowerCase("es")}`;
  $("#activity-url-field").classList.toggle("hidden", !resourceTypes.includes(type));
  $("#activity-description-field").classList.toggle("hidden", isHeading);
  $("#activity-exam-field").classList.toggle("hidden", !["practice","quiz"].includes(type));
  $("#activity-submission-field").classList.toggle("hidden", type !== "task");
  $("#activity-completion-rule").disabled = isHeading;
  if (isHeading) $("#activity-completion-rule").value = "none";
}
function safeRichContentUrl(value) {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\.\/|\/)/i.test(url) ? url : "";
}
function sanitizeActivityHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","SUP","SUB","SMALL","SPAN","FONT","H2","H3","BLOCKQUOTE","UL","OL","LI","A","IMG","TABLE","THEAD","TBODY","TR","TH","TD","PRE","CODE"]);
  template.content.querySelectorAll("*").forEach(element => {
    if (["SCRIPT","STYLE","IFRAME","OBJECT","EMBED"].includes(element.tagName)) {
      element.remove();
      return;
    }
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const originalHref = element.getAttribute("href");
    const originalSrc = element.getAttribute("src");
    const originalColor = element.getAttribute("color");
    const originalSize = element.getAttribute("size");
    const originalStyle = element.getAttribute("style") || "";
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    if (element.tagName === "A") {
      const href = safeRichContentUrl(originalHref);
      if (href) {
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener");
      }
    }
    if (element.tagName === "IMG") {
      const src = safeRichContentUrl(originalSrc);
      if (!src) element.remove();
      else {
        element.setAttribute("src", src);
        element.setAttribute("alt", "Imagen del contenido");
      }
    }
    if (element.tagName === "FONT") {
      const styles = [];
      if (/^#[0-9a-f]{6}$/i.test(originalColor || "")) styles.push(`color:${originalColor}`);
      const sizes = { "2": ".85em", "4": "1.25em", "5": "1.5em" };
      if (sizes[originalSize]) styles.push(`font-size:${sizes[originalSize]}`);
      if (styles.length) element.setAttribute("style", styles.join(";"));
    }
    const alignment = originalStyle.match(/text-align\s*:\s*(left|center|right|justify)/i);
    if (["P","DIV"].includes(element.tagName) && alignment) element.setAttribute("style", `text-align:${alignment[1].toLowerCase()}`);
    if (element.tagName === "SPAN") {
      const color = originalStyle.match(/color\s*:\s*(#[0-9a-f]{6})/i);
      const size = originalStyle.match(/font-size\s*:\s*(\.85|1\.25|1\.5)em/i);
      const styles = [];
      if (color) styles.push(`color:${color[1]}`);
      if (size) styles.push(`font-size:${size[1]}em`);
      if (styles.length) element.setAttribute("style", styles.join(";"));
    }
  });
  return template.innerHTML;
}
function legacyDescriptionToHtml(value) {
  const original = String(value || "").trim();
  if (!original) return "";
  if (/<(?:p|div|h2|h3|blockquote|ul|ol|table|pre)\b/i.test(original)) return sanitizeActivityHtml(original);
  let markup = esc(original)
    .replace(/&lt;(\/?)(u|small|sup|strong|em|s|code)&gt;/gi, "<$1$2>")
    .replace(/&lt;span style=&quot;((?:color:#[0-9a-f]{6}|font-size:(?:\.85|1\.25|1\.5)em))&quot;&gt;/gi, '<span style="$1">')
    .replace(/&lt;\/span&gt;/gi, "</span>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const lines = markup.split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^\|.+\|$/.test(line) && /^\|\s*[-:]+/.test((lines[index + 1] || "").trim())) {
      const headers = line.slice(1, -1).split("|").map(cell => cell.trim());
      index += 2;
      const rows = [];
      while (index < lines.length && /^\|.+\|$/.test(lines[index].trim())) {
        rows.push(lines[index].trim().slice(1, -1).split("|").map(cell => cell.trim()));
        index += 1;
      }
      index -= 1;
      output.push(`<table><thead><tr>${headers.map(cell => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (/^###\s+/.test(line)) output.push(`<h3>${line.replace(/^###\s+/, "")}</h3>`);
    else if (/^##\s+/.test(line)) output.push(`<h2>${line.replace(/^##\s+/, "")}</h2>`);
    else if (/^>\s+/.test(line)) output.push(`<blockquote>${line.replace(/^>\s+/, "")}</blockquote>`);
    else if (/^-\s+/.test(line)) output.push(`<ul><li>${line.replace(/^-\s+/, "")}</li></ul>`);
    else if (/^\d+\.\s+/.test(line)) output.push(`<ol><li>${line.replace(/^\d+\.\s+/, "")}</li></ol>`);
    else if (line) output.push(`<p>${line}</p>`);
  }
  return sanitizeActivityHtml(output.join(""));
}
function renderActivityContent(value) {
  return legacyDescriptionToHtml(value);
}
function activityDescriptionPreview(value) {
  const container = document.createElement("div");
  container.innerHTML = renderActivityContent(value);
  return (container.textContent || "").replace(/\s+/g, " ").trim().slice(0, 110);
}
function syncActivityEditor() {
  const editor = $("#activity-description-editor");
  $("#activity-description").value = sanitizeActivityHtml(editor.innerHTML);
  updateActivityEditorStats();
}
function pastePlainActivityText(event) {
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || "");
  syncActivityEditor();
}
function insertActivityEditorHtml(markup) {
  document.execCommand("insertHTML", false, sanitizeActivityHtml(markup));
}
function requestActivityUrl(label) {
  const value = prompt(label, "https://");
  return safeRichContentUrl(value);
}
function rememberActivityEditorSelection() {
  const editor = $("#activity-description-editor");
  const selection = window.getSelection();
  if (editor && selection?.rangeCount && editor.contains(selection.anchorNode)) activityEditorRange = selection.getRangeAt(0).cloneRange();
}
function restoreActivityEditorSelection() {
  if (!activityEditorRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(activityEditorRange);
}
function activeActivityTableCell() {
  const node = activityEditorRange?.commonAncestorContainer;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.("#activity-description-editor td, #activity-description-editor th")
    || (activityEditorTableCell?.isConnected ? activityEditorTableCell : null);
}
function closeActivityMenus() {
  $$(".activity-menu-trigger").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  $$(".activity-menu-popover").forEach(menu => menu.classList.add("hidden"));
}
function toggleActivityMenu(trigger) {
  const menu = $(`[data-activity-menu-panel="${trigger.dataset.activityMenu}"]`);
  const opening = menu.classList.contains("hidden");
  closeActivityMenus();
  if (!opening) return;
  const rect = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 244))}px`;
  menu.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 300)}px`;
  if (trigger.dataset.activityMenu === "table") {
    const insideTable = Boolean(activeActivityTableCell());
    $$('[data-activity-menu-panel="table"] [data-activity-format="table-row"], [data-activity-menu-panel="table"] [data-activity-format="table-column"], [data-activity-menu-panel="table"] [data-activity-format="table-delete"]').forEach(button => { button.disabled = !insideTable; });
  }
  menu.classList.remove("hidden");
  trigger.setAttribute("aria-expanded", "true");
}
function editActiveActivityTable(command) {
  const cell = activeActivityTableCell();
  if (!cell) return;
  const row = cell.closest("tr");
  const table = cell.closest("table");
  if (command === "table-row") {
    const newRow = row.cloneNode(true);
    [...newRow.cells].forEach(item => { item.innerHTML = "<br>"; });
    row.after(newRow);
  } else if (command === "table-column") {
    const index = cell.cellIndex + 1;
    [...table.rows].forEach(item => {
      const newCell = document.createElement(item.parentElement?.tagName === "THEAD" ? "th" : "td");
      newCell.innerHTML = "<br>";
      item.insertBefore(newCell, item.cells[index] || null);
    });
  } else if (command === "table-delete") {
    table.remove();
    activityEditorTableCell = null;
  }
}
function formatActivityDescription(command) {
  const editor = $("#activity-description-editor");
  if (command === "fullscreen") {
    const shell = $(".activity-editor-shell");
    const active = shell.classList.toggle("is-fullscreen");
    $$('[data-activity-format="fullscreen"]').forEach(button => button.setAttribute("aria-pressed", String(active)));
    editor.focus();
    return;
  }
  editor.focus();
  restoreActivityEditorSelection();
  const nativeCommands = {
    bold: ["bold"], italic: ["italic"], underline: ["underline"], superscript: ["superscript"],
    clear: ["removeFormat"], undo: ["undo"], redo: ["redo"], align: ["justifyCenter"],
    list: ["insertUnorderedList"], numbered: ["insertOrderedList"], textcolor: ["foreColor", "#334ea2"],
    paragraph: ["formatBlock", "p"], heading: ["formatBlock", "h2"], subheading: ["formatBlock", "h3"], quote: ["formatBlock", "blockquote"],
    code: ["formatBlock", "pre"], "size-small": ["fontSize", "2"], "size-large": ["fontSize", "4"], "size-xlarge": ["fontSize", "5"]
  };
  if (nativeCommands[command]) document.execCommand(nativeCommands[command][0], false, nativeCommands[command][1] || null);
  else if (["table-row", "table-column", "table-delete"].includes(command)) editActiveActivityTable(command);
  else if (command === "link") {
    const url = requestActivityUrl("Pega la dirección del enlace");
    if (url) {
      const selection = window.getSelection();
      if (selection?.isCollapsed) insertActivityEditorHtml(`<a href="${esc(url)}">Abrir enlace</a>`);
      else document.execCommand("createLink", false, url);
    }
  } else if (command === "image") {
    const url = requestActivityUrl("Pega la dirección de la imagen");
    if (url) document.execCommand("insertImage", false, url);
  } else if (["video", "file"].includes(command)) {
    const url = requestActivityUrl(command === "video" ? "Pega la dirección del video" : "Pega la dirección del archivo");
    if (url) insertActivityEditorHtml(`<p><a href="${esc(url)}">${command === "video" ? "▶ Ver video" : "▤ Abrir archivo"}</a></p>`);
  } else if (command === "table") {
    insertActivityEditorHtml("<table><thead><tr><th>Encabezado 1</th><th>Encabezado 2</th></tr></thead><tbody><tr><td>Contenido</td><td>Contenido</td></tr></tbody></table><p><br></p>");
  }
  syncActivityEditor();
  rememberActivityEditorSelection();
}
function updateActivityEditorStats() {
  const value = ($("#activity-description-editor").innerText || "").trim();
  const words = value ? value.split(/\s+/).length : 0;
  $("#activity-word-count").textContent = `${words} ${words === 1 ? "palabra" : "palabras"}`;
}
async function saveActivity(event) {
  event.preventDefault();
  const courseId = $("#activity-course-id").value;
  const moduleId = $("#activity-module-id").value;
  const targetModuleId = $("#activity-target-module").value;
  const activityId = $("#activity-id").value;
  const type = $("#activity-type").value;
  const activity = {
    id: activityId || uid(),
    title: $("#activity-title").value.trim(),
    type,
    url: $("#activity-url").value.trim(),
    description: $("#activity-description").value.trim(),
    published: $("#activity-published").value === "true",
    examId: $("#activity-exam-id").value,
    dueAt: $("#activity-due-at").value,
    points: Number($("#activity-points").value) || 0,
    duration: Number($("#activity-duration").value) || 0,
    attempts: Number($("#activity-attempts").value) || 0,
    completionRule: type === "heading" ? "none" : $("#activity-completion-rule").value,
    submissionTypes: $$('input[name="activity-submission"]:checked').map(input => input.value)
  };
  if (!activity.title) { $("#activity-error").textContent = "Escribe un nombre para la actividad."; return; }
  if (activity.url && !safeActivityUrl(activity.url)) { $("#activity-error").textContent = "Usa una URL https:// o una ruta local que empiece con ./ o /."; return; }
  if (["practice","quiz"].includes(type) && !activity.examId) { $("#activity-error").textContent = "Selecciona la evaluación o banco que utilizará este elemento."; return; }
  if (type === "task" && !activity.submissionTypes.length) { $("#activity-error").textContent = "Selecciona al menos un tipo de entrega para la tarea."; return; }
  const saved = await updateCourseModules(courseId, modules => {
    if (!activityId || targetModuleId === moduleId) return modules.map(module => module.id === moduleId ? { ...module, activities:activityId ? module.activities.map(item => item.id === activityId ? activity : item) : [...module.activities, activity] } : module);
    return modules.map(module => {
      if (module.id === moduleId) return { ...module, activities:module.activities.filter(item => item.id !== activityId) };
      if (module.id === targetModuleId) return { ...module, activities:[...module.activities, activity] };
      return module;
    });
  });
  if (saved) closeModal("activity-modal");
}
async function deleteModule(courseId, moduleId) {
  if (!confirm("¿Eliminar este módulo y todas sus actividades?")) return;
  await updateCourseModules(courseId, modules => modules.filter(module => module.id !== moduleId));
}
async function deleteActivity(courseId, moduleId, activityId) {
  if (!confirm("¿Eliminar esta actividad?")) return;
  await updateCourseModules(courseId, modules => modules.map(module => module.id === moduleId ? { ...module, activities: module.activities.filter(activity => activity.id !== activityId) } : module));
}
async function moveModule(courseId, moduleId, direction) {
  await updateCourseModules(courseId, modules => { const index = modules.findIndex(module => module.id === moduleId); const target = index + (direction === "up" ? -1 : 1); if (index < 0 || target < 0 || target >= modules.length) return modules; [modules[index], modules[target]] = [modules[target], modules[index]]; return modules; });
}
async function moveActivity(courseId, moduleId, activityId, direction) {
  await updateCourseModules(courseId, modules => modules.map(module => { if (module.id !== moduleId) return module; const activities = [...module.activities]; const index = activities.findIndex(activity => activity.id === activityId); const target = index + (direction === "up" ? -1 : 1); if (index >= 0 && target >= 0 && target < activities.length) [activities[index], activities[target]] = [activities[target], activities[index]]; return { ...module, activities }; }));
}
function bindModuleDragAndDrop() {
  $$(".module-drag-handle").forEach(handle => {
    handle.addEventListener("dragstart", event => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify({ kind:"module", courseId:handle.dataset.courseId, moduleId:handle.dataset.moduleId }));
      handle.closest(".teacher-module-card")?.classList.add("is-dragging");
    });
    handle.addEventListener("dragend", clearDragStyles);
  });
  $$(".activity-drag-handle").forEach(handle => {
    handle.addEventListener("dragstart", event => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify({ kind:"activity", courseId:handle.dataset.courseId, moduleId:handle.dataset.moduleId, activityId:handle.dataset.activityId }));
      handle.closest(".teacher-activity-row")?.classList.add("is-dragging");
    });
    handle.addEventListener("dragend", clearDragStyles);
  });
  $$("[data-activity-drop]").forEach(row => {
    row.addEventListener("dragover", event => { event.preventDefault(); event.stopPropagation(); row.classList.add("is-drag-over"); });
    row.addEventListener("dragleave", () => row.classList.remove("is-drag-over"));
    row.addEventListener("drop", event => {
      event.preventDefault(); event.stopPropagation();
      const payload = readDragPayload(event);
      clearDragStyles();
      if (payload?.kind === "activity" && payload.courseId === row.dataset.courseId) reorderActivityDrop(payload.courseId, payload.moduleId, payload.activityId, row.dataset.moduleId, row.dataset.activityDrop);
    });
  });
  $$("[data-module-drop]").forEach(card => {
    card.addEventListener("dragover", event => { event.preventDefault(); card.classList.add("is-drag-over"); });
    card.addEventListener("dragleave", event => { if (!card.contains(event.relatedTarget)) card.classList.remove("is-drag-over"); });
    card.addEventListener("drop", event => {
      event.preventDefault();
      const payload = readDragPayload(event);
      clearDragStyles();
      if (!payload || payload.courseId !== card.dataset.courseId) return;
      if (payload.kind === "module") reorderModuleDrop(payload.courseId, payload.moduleId, card.dataset.moduleDrop);
      if (payload.kind === "activity") reorderActivityDrop(payload.courseId, payload.moduleId, payload.activityId, card.dataset.moduleDrop);
    });
  });
}
function readDragPayload(event) {
  try { return JSON.parse(event.dataTransfer.getData("text/plain")); }
  catch { return null; }
}
function clearDragStyles() {
  $$(".is-dragging,.is-drag-over").forEach(element => element.classList.remove("is-dragging","is-drag-over"));
}
async function reorderModuleDrop(courseId, sourceModuleId, targetModuleId) {
  if (sourceModuleId === targetModuleId) return;
  await updateCourseModules(courseId, modules => {
    const sourceIndex = modules.findIndex(module => module.id === sourceModuleId);
    const targetIndex = modules.findIndex(module => module.id === targetModuleId);
    if (sourceIndex < 0 || targetIndex < 0) return modules;
    const [moved] = modules.splice(sourceIndex, 1);
    modules.splice(modules.findIndex(module => module.id === targetModuleId), 0, moved);
    return modules;
  });
}
async function reorderActivityDrop(courseId, sourceModuleId, activityId, targetModuleId, targetActivityId = "") {
  if (sourceModuleId === targetModuleId && activityId === targetActivityId) return;
  await updateCourseModules(courseId, modules => {
    const sourceModule = modules.find(module => module.id === sourceModuleId);
    const targetModule = modules.find(module => module.id === targetModuleId);
    const sourceIndex = sourceModule?.activities.findIndex(activity => activity.id === activityId) ?? -1;
    if (!sourceModule || !targetModule || sourceIndex < 0) return modules;
    const [moved] = sourceModule.activities.splice(sourceIndex, 1);
    const targetIndex = targetActivityId ? targetModule.activities.findIndex(activity => activity.id === targetActivityId) : -1;
    targetModule.activities.splice(targetIndex < 0 ? targetModule.activities.length : targetIndex, 0, moved);
    return modules;
  });
}
function switchTab(prefix, id, button) {
  $$(`[data-${prefix}-tab]`).forEach(tab => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(`#${prefix}-view .tab-content`).forEach(content => content.classList.toggle("active", content.id === id));
}
function openCourseModal(id = "") {
  const localCourse = drafts.courses.find(item => item.id === id);
  const publishedCourse = publishedCourses.find(item => item.id === id);
  const course = publishedCourse || localCourse;
  $("#course-modal-title").textContent = publishedCourse ? "Editar curso publicado" : localCourse ? "Editar curso local" : "Crear curso local";
  $("#course-breadcrumb-current").textContent = course ? "Editar curso" : "Nuevo curso";
  $("#course-setup-status").textContent = publishedCourse ? "Curso publicado" : "Borrador local";
  $("#course-setup-status").classList.toggle("published", Boolean(publishedCourse));
  $("#course-publish-on-save").checked = false;
  $("#course-publish-on-save").disabled = Boolean(publishedCourse);
  $("#course-publish-on-save").closest(".course-publish-option").classList.toggle("hidden", Boolean(publishedCourse));
  $("#course-id").value = course?.id || "";
  $("#course-name").value = course?.name || "";
  $("#course-description").value = course?.description || "";
  $("#course-error").textContent = "";
  updateCourseSetupPreview();
  $("#course-modal").classList.remove("hidden");
  $("#course-name").focus();
}
function updateCourseSetupPreview() {
  $("#course-description-count").textContent = `${$("#course-description").value.length} / 250`;
}
function toggleSidebar() {
  const mobile = matchMedia("(max-width: 900px)").matches;
  const visible = mobile ? document.body.classList.toggle("sidebar-open") : !document.body.classList.toggle("sidebar-collapsed");
  $("#sidebar-toggle").setAttribute("aria-expanded", String(visible));
  $("#sidebar-toggle").setAttribute("aria-label", visible ? "Ocultar barra lateral" : "Mostrar barra lateral");
  $("#sidebar-toggle").setAttribute("title", visible ? "Ocultar barra lateral" : "Mostrar barra lateral");
}
async function saveCourseDraft(event) {
  event.preventDefault();
  const publishOnSave = $("#course-publish-on-save").checked;
  const id = $("#course-id").value;
  const existingCourse = findCourse(id);
  const course = { id: id || slug($("#course-name").value), name: $("#course-name").value.trim(), description: $("#course-description").value.trim(), teacherName: currentUser.name, modules: normalizeModules(existingCourse?.modules), local: true, updatedAt: nowIso() };
  if (id && publishedCourses.some(item => item.id === id)) {
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    $("#course-error").textContent = "";
    const { error } = await sb.from("course_changes").upsert({ course_id: id, name: course.name, description: course.description, modules: course.modules, deleted: false, updated_by: currentUser.id }, { onConflict: "course_id" });
    if (submit) submit.disabled = false;
    if (error) {
      console.error("Editar curso publicado:", error);
      $("#course-error").textContent = translateError(error);
      return;
    }
    await loadCourseChanges();
    closeModal("course-modal");
    renderTeacher();
    return;
  }
  if (id) drafts.courses = drafts.courses.map(item => item.id === id ? { ...item, ...course } : item); else drafts.courses.push(course);
  saveDrafts();
  closeModal("course-modal");
  renderTeacher();
  if (publishOnSave) openPublishCourseModal(course.id);
}

async function deletePublishedCourse(id) {
  if (!sb || currentUser?.role !== "teacher") return;
  const course = publishedCourses.find(item => item.id === id);
  if (!course) return;
  const examCount = publishedExams.filter(exam => exam.courseId === id).length;
  if (!confirm(`¿Deseas eliminar el curso ${course.name}?\nEl curso dejará de mostrarse a los alumnos${examCount ? ` junto con ${quantity(examCount, "examen", "exámenes")}` : ""}, pero las notas anteriores y los resultados existentes se conservarán.`)) return;
  const { error } = await sb.from("course_changes").upsert({ course_id: id, name: course.name, description: course.description || "", deleted: true, updated_by: currentUser.id }, { onConflict: "course_id" });
  if (error) {
    console.error("Eliminar curso publicado:", error);
    alert(translateError(error));
    return;
  }
  await loadCourseChanges();
  renderTeacher();
}
function deleteCourseDraft(id) {
  const examCount = drafts.exams.filter(exam => exam.courseId === id).length;
  if (!confirm(`¿Eliminar este curso local${examCount ? ` y ${quantity(examCount, "examen", "exámenes")}` : ""}?`)) return;
  drafts.courses = drafts.courses.filter(course => course.id !== id);
  drafts.exams = drafts.exams.filter(exam => exam.courseId !== id);
  saveDrafts();
  renderTeacher();
}
function openExamModal(id = null, courseId = null) {
  const courses = [...publishedCourses, ...drafts.courses];
  if (!courses.length) { alert("Primero crea un curso local o agrega cursos en data/catalog.json."); openCourseModal(); return; }
  const localExam = drafts.exams.find(item => item.id === id);
  const publishedExam = publishedExams.find(item => item.id === id);
  const exam = localExam || publishedExam;
  $("#exam-modal-title").textContent = publishedExam ? "Modificar examen publicado" : localExam ? "Editar borrador de examen" : "Crear borrador de examen";
  $("#editor-exam-id").value = exam?.id || "";
  $("#editor-course").innerHTML = courses.map(course => `<option value="${esc(course.id)}">${esc(course.name)}</option>`).join("");
  $("#editor-course").value = exam?.courseId || courseId || courses[0].id;
  $("#editor-title").value = exam?.title || "";
  $("#editor-minutes").value = exam?.minutes || 20;
  $("#editor-question-count").value = exam?.questionsToShow || 5;
  $("#editor-attempts").value = exam?.attemptsAllowed || 1;
  builderOptionCount = exam?.optionCount || exam?.questions?.[0]?.options?.length || 5;
  $("#editor-option-count").value = String(builderOptionCount);
  $("#editor-published").value = String(exam?.published ?? true);
  builderQuestions = structuredClone(exam?.questions || []);
  renderBuilder();
  setQuestionMode("manual-panel");
  $("#exam-editor-error").textContent = "";
  selectExamEditorSection("editor-settings-section");
  $("#exam-modal").classList.remove("hidden");
}
function changeOptionCount() {
  collectBuilder();
  builderOptionCount = Number($("#editor-option-count").value);
  let resetAnswers = 0;
  builderQuestions.forEach(question => {
    question.options = Array.from({ length: builderOptionCount }, (_, index) => question.options[index] ?? "");
    if (question.correct >= builderOptionCount) { question.correct = 0; resetAnswers++; }
  });
  renderBuilder();
  $("#option-count-message").textContent = `Todas las preguntas usarán ${builderOptionCount} opciones.${resetAnswers ? ` Se reinició la respuesta correcta de ${quantity(resetAnswers, "pregunta")}.` : ""}`;
}
function setQuestionMode(panelId) {
  $$(".question-mode").forEach(button => button.classList.toggle("active", button.dataset.questionMode === panelId));
  $$(".question-tool-panel").forEach(panel => panel.classList.toggle("active", panel.id === panelId));
}
function selectExamEditorSection(sectionClass) {
  $$(".exam-editor-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.editorSection === sectionClass));
  [".editor-settings-section",".editor-questions-section"].forEach(selector => {
    document.querySelector(selector)?.classList.toggle("editor-section-tab-hidden", selector !== `.${sectionClass}`);
  });
}
function addBuilderQuestion() {
  collectBuilder();
  const question = { id: uid(), text: "", image: "", options: Array(builderOptionCount).fill(""), correct: 0 };
  builderQuestions.push(question);
  renderBuilder();
}
function generateQuestions() {
  collectBuilder();
  const facts = $("#generator-content").value.split(/\r?\n/).map(line => {
    const separator = line.search(/[:=]/);
    if (separator < 1) return null;
    return { concept: line.slice(0, separator).trim(), definition: line.slice(separator + 1).trim() };
  }).filter(fact => fact?.concept && fact?.definition);
  if (facts.length < 2) {
    $("#generator-message").textContent = "Escribe al menos dos líneas con el formato concepto: definición.";
    return;
  }
  const amount = Math.min(Number($("#generator-count").value) || 1, facts.length);
  const fallbacks = ["Ninguna de las anteriores", "Todas las anteriores", "No se puede determinar", "Información insuficiente", "La afirmación es falsa", "La afirmación es verdadera", "No corresponde"];
  facts.slice(0, amount).forEach((fact, factIndex) => {
    const distractors = facts.filter((_, index) => index !== factIndex).map(item => item.definition);
    const alternatives = [...new Set([fact.definition, ...distractors, ...fallbacks])].slice(0, builderOptionCount);
    while (alternatives.length < builderOptionCount) alternatives.push(`Opción ${alternatives.length + 1}`);
    builderQuestions.push({ id: uid(), text: `¿Cuál es la definición correcta de ${fact.concept}?`, image: "", options: alternatives, correct: 0 });
  });
  $("#generator-message").textContent = "";
  renderBuilder();
}
async function importQuestions(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const json = JSON.parse(cleaned);
    const list = Array.isArray(json) ? json : json.questions || json.preguntas;
    if (!Array.isArray(list)) throw new Error("El archivo no contiene preguntas.");
    const detectedCount = list[0]?.options?.length || list[0]?.opciones?.length || builderOptionCount;
    if (!builderQuestions.length && detectedCount >= 2 && detectedCount <= 8) {
      builderOptionCount = detectedCount;
      $("#editor-option-count").value = String(builderOptionCount);
    }
    const imported = list.map((item, index) => normalizeImportedQuestion(item, index, builderOptionCount));
    builderQuestions = [...builderQuestions, ...imported];
    $("#import-message").className = "success";
    $("#import-message").textContent = `Se importaron ${quantity(imported.length, "pregunta")}.`;
    renderBuilder();
  } catch (error) {
    console.error("Importación:", error);
    $("#import-message").className = "error";
    $("#import-message").textContent = `Archivo no válido: ${error.message}`;
  } finally {
    event.target.value = "";
  }
}
function renderBuilder() {
  $("#builder-count").textContent = builderQuestions.length;
  $("#question-builder").innerHTML = builderQuestions.length ? builderQuestions.map((question, index) => `
    <article class="builder-question" data-qid="${esc(question.id)}">
      <div class="builder-title"><strong>Pregunta ${index + 1} <small>· editable</small></strong><button class="icon-btn delete remove-builder-question" type="button" data-id="${esc(question.id)}">Eliminar</button></div>
      <label>Enunciado<textarea class="b-text" rows="2" placeholder="Escribe la pregunta" required>${esc(question.text)}</textarea></label>
      ${questionImageMarkup(question, "builder-question-image")}
      <div class="options-grid">${question.options.map((option, i) => `<label>Opción ${"ABCDEFGH"[i]}<input class="b-option" data-index="${i}" value="${esc(option)}" required></label>`).join("")}</div>
      <label>Respuesta correcta<select class="b-correct">${question.options.map((_, i) => `<option value="${i}" ${question.correct === i ? "selected" : ""}>Opción ${"ABCDEFGH"[i]}</option>`).join("")}</select></label>
    </article>`).join("") : `<div class="empty">Agrega por lo menos una pregunta.</div>`;
  $$(".remove-builder-question").forEach(button => button.addEventListener("click", () => {
    collectBuilder();
    builderQuestions = builderQuestions.filter(question => question.id !== button.dataset.id);
    renderBuilder();
  }));
}
function collectBuilder() {
  $$(".builder-question").forEach(card => {
    const question = builderQuestions.find(item => item.id === card.dataset.qid);
    if (!question) return;
    question.text = card.querySelector(".b-text").value.trim();
    question.options = [...card.querySelectorAll(".b-option")].map(input => input.value.trim());
    question.correct = Number(card.querySelector(".b-correct").value);
  });
}
function buildExamFromEditor() {
  collectBuilder();
  const title = $("#editor-title").value.trim();
  const id = $("#editor-exam-id").value || slug(`${$("#editor-course").value}-${title || "examen"}`);
  return normalizeExam({
    schema_version: 1,
    id,
    course_id: $("#editor-course").value,
    title,
    minutes: Number($("#editor-minutes").value),
    questions_to_show: Number($("#editor-question-count").value),
    attempts_allowed: Number($("#editor-attempts").value),
    published: $("#editor-published").value === "true",
    option_count: builderOptionCount,
    questions: builderQuestions
  }, "borrador del editor", $("#editor-course").value);
}
function validateCurrentExam(showMessage = false) {
  try {
    const exam = buildExamFromEditor();
    if (showMessage) {
      $("#exam-editor-error").className = "success";
      $("#exam-editor-error").textContent = `JSON válido. Ruta sugerida: ./data/exams/${slug(exam.id)}.json`;
    }
    return exam;
  } catch (error) {
    $("#exam-editor-error").className = "error";
    $("#exam-editor-error").textContent = error.message;
    return null;
  }
}
async function saveExamDraft(event) {
  event.preventDefault();
  const exam = validateCurrentExam(false);
  if (!exam) return;
  const id = $("#editor-exam-id").value;
  const publishedExam = publishedExams.find(item => item.id === id);
  const publishedCourse = publishedCourses.find(item => item.id === exam.courseId);
  const shouldPublish = Boolean(publishedExam || (exam.published && publishedCourse));
  if (shouldPublish) {
    const submit = event.submitter || $(".editor-save");
    const course = publishedCourse || findCourse(exam.courseId);
    if (!sb || !course) {
      $("#exam-editor-error").textContent = "No se pudo conectar el examen con su curso publicado.";
      return;
    }
    if (submit) submit.disabled = true;
    $("#exam-editor-error").className = "muted";
    $("#exam-editor-error").textContent = "Guardando y verificando los cambios...";
    try {
      const payload = {
        course: { id: course.id, name: course.name, description: course.description || "", teacher_name: course.teacherName || currentUser.name, modules: normalizeModules(course.modules) },
        exams: [{ ...examToJsonSchema(exam), published: true }]
      };
      const { data, error } = await sb.rpc("publish_academy_course", { payload });
      if (error) throw error;
      if (!data || data.course_id !== course.id || Number(data.exam_count) !== 1) throw new Error("Supabase no confirmó la publicación del examen.");
      await loadCourseChanges();
      const verified = publishedExams.find(item => item.id === exam.id && item.courseId === exam.courseId);
      if (!verified || verified.title !== exam.title || verified.minutes !== exam.minutes || verified.questions.length !== exam.questions.length) {
        throw new Error("No se pudo verificar el examen publicado completo.");
      }
      drafts.exams = drafts.exams.filter(item => item.id !== exam.id);
      saveDrafts();
      closeModal("exam-modal");
      renderTeacher();
    } catch (error) {
      console.error("Publicar examen:", error);
      $("#exam-editor-error").className = "error";
      $("#exam-editor-error").textContent = error.message || translateError(error);
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const draftIndex = drafts.exams.findIndex(item => item.id === exam.id);
  if (draftIndex >= 0) drafts.exams[draftIndex] = exam; else drafts.exams.push(exam);
  saveDrafts();
  closeModal("exam-modal");
  renderTeacher();
}
function deleteExamDraft(id) {
  if (!confirm("¿Eliminar este borrador local?")) return;
  drafts.exams = drafts.exams.filter(exam => exam.id !== id);
  saveDrafts();
  renderTeacher();
}
function examToJsonSchema(exam) {
  return {
    schema_version: 1,
    id: exam.id,
    course_id: exam.courseId,
    title: exam.title,
    minutes: exam.minutes,
    questions_to_show: exam.questionsToShow,
    attempts_allowed: exam.attemptsAllowed,
    published: exam.published,
    option_count: exam.optionCount,
    questions: exam.questions.map(q => ({ id: q.id, text: q.text, image: q.image || "", options: q.options, correct: q.correct }))
  };
}
function exportCurrentExam() {
  const exam = validateCurrentExam(false);
  if (!exam) return;
  download(JSON.stringify(examToJsonSchema(exam), null, 2), `${slug(exam.id)}.json`, "application/json;charset=utf-8");
}
function downloadTemplateJson() {
  const courseId = $("#editor-course").value || "fisica";
  const template = examToJsonSchema(normalizeExam({
    id: `${courseId}-nuevo-examen`,
    course_id: courseId,
    title: "Nuevo examen",
    minutes: 20,
    questions_to_show: 1,
    attempts_allowed: 1,
    published: true,
    option_count: 5,
    questions: [{ id: "pregunta-001", text: "Escribe aquí la pregunta", image: "", options: ["Opción A","Opción B","Opción C","Opción D","Opción E"], correct: 0 }]
  }, "plantilla", courseId));
  download(JSON.stringify(template, null, 2), "plantilla-examen.json", "application/json;charset=utf-8");
}
async function copyCatalogPath() {
  const exam = validateCurrentExam(false);
  if (!exam) return;
  const path = `./data/exams/${slug(exam.id)}.json`;
  try {
    await navigator.clipboard.writeText(path);
    $("#exam-editor-error").className = "success";
    $("#exam-editor-error").textContent = `Ruta copiada: ${path}`;
  } catch {
    $("#exam-editor-error").className = "success";
    $("#exam-editor-error").textContent = `Ruta para catalog.json: ${path}`;
  }
}
function closeModal(id) { $(`#${id}`).classList.add("hidden"); }

async function openProfile() {
  if (!currentUser) return;
  $("#profile-name").value = currentUser.name;
  $("#profile-email").value = currentUser.email;
  $("#profile-role").value = currentUser.role === "teacher" ? "Profesor" : "Alumno";
  $("#profile-current-password").value = "";
  $("#profile-new-password").value = "";
  $("#profile-confirm-password").value = "";
  $("#profile-message").textContent = "";
  $("#profile-message").className = "";
  $("#profile-modal").classList.remove("hidden");
  bindPasswordToggles($("#profile-modal"));
  $("#profile-name").focus();
}
async function saveProfile(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const message = $("#profile-message");
  message.className = "error";
  message.textContent = "";
  try {
    const name = $("#profile-name").value.trim();
    const email = $("#profile-email").value.trim().toLowerCase();
    const currentPassword = $("#profile-current-password").value;
    const newPassword = $("#profile-new-password").value;
    const confirmation = $("#profile-confirm-password").value;
    if (newPassword || confirmation || currentPassword) {
      if (!currentPassword) throw new Error("Escribe tu contraseña actual para cambiarla.");
      if (newPassword.length < 8) throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
      if (newPassword !== confirmation) throw new Error("Las nuevas contraseñas no coinciden.");
      const { error: reauthError } = await sb.auth.signInWithPassword({ email: currentUser.email, password: currentPassword });
      if (reauthError) throw new Error("La contraseña actual es incorrecta.");
      const { error: passError } = await sb.auth.updateUser({ password: newPassword });
      if (passError) throw passError;
    }
    const updates = { data: { full_name: name } };
    if (email !== currentUser.email) updates.email = email;
    const { error: authError } = await sb.auth.updateUser(updates);
    if (authError) throw authError;
    const { error: profileError } = await sb.from("profiles").update({ full_name: name, email }).eq("id", currentUser.id);
    if (profileError) throw profileError;
    currentUser = { ...currentUser, name, email };
    message.className = "success";
    message.textContent = email !== currentUser.email ? "Perfil actualizado. Supabase puede pedir confirmación del nuevo correo." : "Perfil actualizado correctamente.";
    renderApp();
    $("#profile-modal").classList.remove("hidden");
    $("#profile-message").className = "success";
    $("#profile-message").textContent = "Perfil actualizado correctamente. Si cambiaste el correo, revisa la confirmación de Supabase.";
  } catch (error) {
    console.error("Perfil:", error);
    message.textContent = error.message || translateError(error);
  } finally {
    button.disabled = false;
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(SOUND_KEY, String(soundEnabled));
  if (soundEnabled) playRetroSound("toggle");
  renderApp();
}
function playRetroSound(kind) {
  if (!soundEnabled) return;
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return;
  audioContext ||= new AudioEngine();
  if (audioContext.state === "suspended") audioContext.resume();
  const melodies = {
    start: [[523,0,.09],[659,.1,.09],[784,.2,.11],[1047,.32,.17]],
    warning: [[988,0,.09],[784,.13,.09],[988,.26,.09],[784,.39,.09],[1175,.52,.2]],
    finish: [[659,0,.1],[784,.11,.1],[988,.22,.1],[1319,.34,.25]],
    toggle: [[784,0,.08],[1047,.09,.12]]
  };
  const now = audioContext.currentTime;
  (melodies[kind] || melodies.toggle).forEach(([frequency, delay, duration]) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration + 0.02);
  });
}
function download(content, filename, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF" + content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

if (!window.__MASTERFULL_TEST_MODE__) {
  initApp().catch(error => {
    console.error("No se pudo iniciar la plataforma:", error);
    document.body.classList.remove("session-loading");
    if (currentUser) renderApp();
    else {
      show("auth-view");
      setSessionMessage("No se pudo iniciar la plataforma.", "error");
    }
  });
}
