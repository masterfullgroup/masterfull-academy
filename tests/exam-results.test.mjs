import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(htmlSource, /id="result-title"/, "La pantalla de resultados debe tener un título actualizable");
assert.match(htmlSource, /class="result-navigation"[\s\S]*id="return-student"/, "La pantalla de resultados debe ofrecer un retorno visible");
for (const id of ["result-correct", "result-incorrect", "result-time", "result-attempt"]) {
  assert.match(htmlSource, new RegExp(`id="${id}"`), `Falta el detalle ${id}`);
}
assert.match(appSource, /function formatExamDuration\(seconds\)/, "El tiempo empleado debe formatearse");
assert.match(appSource, /\$\("#result-incorrect"\)\.textContent/, "El resultado debe calcular los errores");
assert.match(appSource, /\$\("#result-time"\)\.textContent = formatExamDuration/, "El resultado debe mostrar el tiempo empleado");

console.log("OK: entrega y detalle de resultados del examen");
