import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(htmlSource, /<section class="activity-advanced-settings hidden"/, "La configuración debe ser una sección visible, no un acordeón");
assert.doesNotMatch(htmlSource, /<details class="activity-advanced-settings hidden"/, "El editor no debe ocultar las opciones detrás de un desplegable");
assert.match(appSource, /option\?\.classList\.toggle\("hidden", type === "quiz"\)/, "Las opciones genéricas duplicadas deben ocultarse en evaluaciones");
assert.match(cssSource, /activity-advanced-settings::before[\s\S]*Opciones de la actividad/, "La sección debe mostrar un título directo");

console.log("OK: editor de actividades sin configuración redundante");
