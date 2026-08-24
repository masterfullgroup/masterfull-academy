import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(appSource, /function moveExamSubmitToHeader\(\)/, "La entrega debe moverse al encabezado del examen");
assert.match(appSource, /actions\.append\(timer, submitButton\)/, "El cronómetro y la entrega deben compartir el encabezado");
assert.match(appSource, /submitButton\.setAttribute\("form", "take-exam-form"\)/, "El botón movido debe conservar el envío del formulario");
assert.match(appSource, /moveExamSubmitToHeader\(\);/, "La posición debe configurarse al iniciar el examen");
assert.match(cssSource, /\.exam-head-actions\s*\{/, "El encabezado debe tener un contenedor para sus acciones");
assert.match(cssSource, /body\.exam-in-progress \.question-number \{[\s\S]*color:#fff;/, "El indicador de pregunta debe tener contraste alto");
assert.match(cssSource, /\.exam-submit-bar\.header-submit-moved\s*\{\s*display:\s*none;/, "La barra inferior no debe seguir tapando las preguntas");

console.log("OK: botón de entrega junto al cronómetro");
