/**
 * Verificación del contrato de TypeSafe Jev contra el endpoint real.
 *
 * Existe porque el diseño de gates automáticos se apoyaba en documentación, no
 * en una llamada ejecutada. Tres cosas quedaron marcadas como SIN VERIFICAR en
 * docs/99-REFERENCIAS.md y este script las cierra:
 *
 *   1. Que el endpoint responda con nuestra cuenta.
 *   2. Que devuelva `noul` como un número entre 0 y 1.
 *   3. Que acepte instrucciones en español (la documentación solo dice
 *      "texto de entrada", sin especificar idioma).
 *
 * Uso:
 *   OPENROUTER_API_KEY=sk-or-v1-... node scripts/verify-jev.mjs
 *
 * Coste: ~$0.00003 por pregunta. El script hace 4 preguntas en una sola
 * llamada, así que el total es del orden de $0.0001.
 *
 * No forma parte de la suite de tests: los tests no deben depender de la red ni
 * de una clave. Esto es una comprobación manual y explícita.
 */

const API_KEY = process.env.OPENROUTER_API_KEY;
const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";

if (!API_KEY) {
  console.error("Falta OPENROUTER_API_KEY.");
  console.error("Uso: OPENROUTER_API_KEY=sk-or-v1-... node scripts/verify-jev.mjs");
  process.exit(2);
}

// Un estado realista: el gate de plan del recorrido completo, en español.
const state = {
  solicitud:
    "El filtro de órdenes del POS no encuentra la orden cuando busco por número. " +
    "Si escribo el número exacto aparece, pero si escribo parte del número no encuentra nada.",
  investigacion:
    "Comportamiento actual: el filtro OrderFilter.number usa lookup_expr='exact' en el " +
    "FilterSet, en BackEnd/pos/filters.py:88. El ViewSet pasa filterset_class=OrderFilter. " +
    "Causa raíz: el lookup es exacto cuando la pantalla documenta búsqueda parcial. " +
    "Riesgo: cambiar a icontains altera el contrato del endpoint, pero un cliente LocalAgent " +
    "que consulta con el número exacto sigue recibiendo su resultado.",
  plan:
    "1. Cambiar BackEnd/pos/filters.py de lookup_expr='exact' a 'icontains'. " +
    "2. Agregar pruebas de búsqueda parcial y de que el número exacto sigue funcionando en " +
    "BackEnd/pos/tests/test_filters.py. " +
    "3. Verificar que el frontend no requiere cambios. " +
    "Rollback: revertir un cambio de una línea.",
  criterios:
    "Buscar '104' devuelve la orden '1042'. Buscar '1042' sigue devolviendo la orden '1042'. " +
    "Buscar '999' no devuelve resultados. El LocalAgent sigue funcionando.",
};

const questions = {
  // Proposición principal del gate de plan, en español.
  cubre_todos_los_criterios: {
    type: "noul",
    instructions:
      "`plan` describe pasos que, si se ejecutan, satisfacen todos los criterios " +
      "listados en `criterios`.",
  },
  // La misma proposición, en inglés, para comparar si el idioma afecta.
  covers_all_criteria_en: {
    type: "noul",
    instructions:
      "`plan` describes steps that, if executed, satisfy every criterion listed in " +
      "`criterios`.",
  },
  // Una proposición que debe ser claramente FALSA, para comprobar que el
  // modelo discrimina y no responde siempre lo mismo.
  plan_menciona_kubernetes: {
    type: "noul",
    instructions: "`plan` menciona Kubernetes o despliegue en contenedores.",
  },
  // Clasificación: comprueba el tercer tipo de pregunta.
  clasificacion: {
    type: "choice",
    instructions: "¿Cuál es el estado de la investigación?",
    criteria: {
      completa: "Identifica causa, archivos, flujo y riesgos.",
      falta_causa: "Describe el síntoma sin identificar la causa.",
      falta_archivos: "No nombra los archivos concretos afectados.",
    },
  },
};

const inicio = Date.now();
let respuesta;
try {
  respuesta = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      session_id: "valmen-verify-jev",
      state,
      questions,
    }),
  });
} catch (error) {
  console.error(`FALLO de transporte: ${error.message}`);
  process.exit(1);
}

const latencia = Date.now() - inicio;
const texto = await respuesta.text();

if (!respuesta.ok) {
  console.error(`FALLO: HTTP ${respuesta.status}`);
  console.error(texto.slice(0, 600));
  process.exit(1);
}

let datos;
try {
  datos = JSON.parse(texto);
} catch {
  console.error("FALLO: la respuesta no es JSON.");
  console.error(texto.slice(0, 400));
  process.exit(1);
}

// ── Comprobaciones ──────────────────────────────────────────────────────────

const problemas = [];

const modelo = datos.model;
if (typeof modelo !== "string" || !modelo.startsWith("typesafe/jev")) {
  problemas.push(`model inesperado: ${JSON.stringify(modelo)}`);
}

const answers = datos.answers ?? {};
for (const id of Object.keys(questions)) {
  if (answers[id] === undefined) problemas.push(`falta la respuesta de ${id}`);
}

for (const id of [
  "cubre_todos_los_criterios",
  "covers_all_criteria_en",
  "plan_menciona_kubernetes",
]) {
  const valor = answers[id]?.noul;
  if (typeof valor !== "number") {
    problemas.push(`${id}: noul no es un número (${JSON.stringify(answers[id])})`);
  } else if (valor < 0 || valor > 1) {
    problemas.push(`${id}: noul fuera de [0,1] (${valor})`);
  }
}

const eleccion = answers.clasificacion;
if (typeof eleccion?.choice !== "string") {
  problemas.push("clasificacion: no devolvió choice");
}

// ── Informe ─────────────────────────────────────────────────────────────────

const n = (id) => {
  const v = answers[id]?.noul;
  return typeof v === "number" ? v.toFixed(3) : "—";
};

console.log("Verificación de TypeSafe Jev 1.13");
console.log("─────────────────────────────────────────────────────────────");
console.log(`  endpoint   ${ENDPOINT}`);
console.log(`  modelo     ${modelo ?? "—"}`);
console.log(`  proveedor  ${datos.provider ?? "—"}`);
console.log(`  latencia   ${latencia} ms`);
console.log(
  `  uso        ${datos.usage?.input_tokens ?? "—"} in / ${datos.usage?.output_tokens ?? "—"} out` +
    `   coste $${datos.usage?.cost ?? "—"}`,
);
console.log("");
console.log("  Proposiciones");
console.log(`    cubre_todos_los_criterios   (es)  ${n("cubre_todos_los_criterios")}`);
console.log(`    covers_all_criteria_en      (en)  ${n("covers_all_criteria_en")}`);
console.log(
  `    plan_menciona_kubernetes    (falso esperado)  ${n("plan_menciona_kubernetes")}`,
);
console.log(
  `    clasificacion               ${eleccion?.choice ?? "—"}` +
    `  (confianza ${eleccion?.confidence?.toFixed?.(3) ?? "—"})`,
);
console.log("");

const es = answers.cubre_todos_los_criterios?.noul;
const en = answers.covers_all_criteria_en?.noul;
const falso = answers.plan_menciona_kubernetes?.noul;

console.log("  Las tres comprobaciones pendientes del diseño");
console.log(
  `    1. El endpoint responde          ${respuesta.ok ? "SÍ" : "NO"}` +
    `  (HTTP ${respuesta.status})`,
);
console.log(
  `    2. noul es un número en [0,1]    ${
    typeof es === "number" && es >= 0 && es <= 1 ? "SÍ" : "NO"
  }`,
);
const idioma =
  typeof es === "number" && typeof en === "number"
    ? Math.abs(es - en) < 0.2
      ? `SÍ — español ${es.toFixed(2)} vs inglés ${en.toFixed(2)}, diferencia ${Math.abs(es - en).toFixed(3)}`
      : `DUDOSO — español ${es.toFixed(2)} vs inglés ${en.toFixed(2)}, diferencia ${Math.abs(es - en).toFixed(3)}`
    : "NO se pudo comparar";
console.log(`    3. Entiende instrucciones en español   ${idioma}`);
console.log("");

if (typeof falso === "number" && falso > 0.5) {
  problemas.push(
    `plan_menciona_kubernetes devolvió ${falso.toFixed(2)}: el plan NO menciona Kubernetes, ` +
      "así que el modelo no está discriminando",
  );
}

if (problemas.length > 0) {
  console.log("  PROBLEMAS");
  for (const problema of problemas) console.log(`    · ${problema}`);
  process.exit(1);
}

console.log(
  "  Sin problemas. El contrato de Jev queda verificado contra el endpoint real.",
);
