/**
 * La revisión que el código hace antes de llamar a un modelo (R-CPRE-008, R-CPRE-009).
 *
 * Un análisis o un plan con el Rollback vacío no necesita un modelo para saber que le
 * falta algo: el código lo ve. Pagar una llamada para que el evaluador lo descubra, o
 * peor, para que lo pase por alto, es el desperdicio que esta revisión corta. Lo que hace:
 *
 * 1. **Revisa** —sin modelo— marcadores de plantilla vacíos, Rollback vacío, archivos
 *    citados que no existen, criterios sin anotación, más criterios que el tope y pasos del
 *    plan sin ruta, símbolo ni comando. Si algo falla, no se llama al evaluador y el informe
 *    dice qué falta.
 * 2. **Decide en código** cuatro comprobaciones del plan que antes se le preguntaban al
 *    modelo y pasaban a descriptivas cuando el ticket tenía criterios.
 *
 * La misma función corre a mano (`valmen precheck`): lo que dice a mano es lo que la
 * compuerta dirá, porque es la misma.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseTicket, stripHtmlComments } from "@valmen/core";
import { criterioDeclarado, extractCriteriaSpecs } from "@valmen/gate";

/** Un hallazgo de la revisión: qué es y qué falta. */
export interface PreReviewFinding {
  readonly id:
    | "marcador_vacio"
    | "rollback_vacio"
    | "archivo_inexistente"
    | "criterio_sin_anotacion"
    | "mas_criterios_que_el_tope"
    | "paso_sin_ruta_ni_comando";
  readonly message: string;
}

/**
 * Cuántos criterios admite la revisión antes de pedir que el ticket se parta.
 *
 * Es un tope de **revisión**, distinto de las tandas con las que se evalúan los criterios:
 * evaluar todos en varias llamadas no es recortar, y un ticket con más de este número es
 * dos tickets.
 */
export const TOPE_DE_CRITERIOS = 40;

/** Etiquetas que pueden quedar vacías: se llenan después o no aplican a todo ticket. */
const ETIQUETAS_QUE_PUEDEN_QUEDAR_VACIAS = [
  /^gate de plan y aprobaci[oó]n/i,
  /^impactos declarados/i,
  /^hip[oó]tesis pendientes/i,
  /^pasos ordenados/i,
];

function secciones(text: string): Record<string, string> {
  const { sections } = parseTicket(text);
  return sections as unknown as Record<string, string>;
}

/** Las líneas de una sección, sin comentarios HTML. */
function lineasDe(seccion: string): string[] {
  return stripHtmlComments(seccion).split("\n");
}

/** `true` si la línea siguiente continúa el elemento (sangrada y con texto). */
function continua(lineas: readonly string[], desde: number): boolean {
  for (let i = desde; i < lineas.length; i++) {
    const linea = lineas[i] as string;
    if (linea.trim() === "") continue;
    return /^\s{2,}\S/.test(linea) && !/^\s+\d+\.\s*$/.test(linea);
  }
  return false;
}

/** Los marcadores de plantilla que siguen vacíos: `- Etiqueta:` sin texto ni continuación. */
function marcadoresVacios(nombre: string, seccion: string): PreReviewFinding[] {
  const lineas = lineasDe(seccion);
  const hallazgos: PreReviewFinding[] = [];
  lineas.forEach((linea, i) => {
    const etiqueta = /^-\s+(.+?):\s*$/.exec(linea)?.[1];
    if (etiqueta === undefined) return;
    if (/^rollback/i.test(etiqueta)) return; // lo dice su propio hallazgo
    if (ETIQUETAS_QUE_PUEDEN_QUEDAR_VACIAS.some((patron) => patron.test(etiqueta))) return;
    if (continua(lineas, i + 1)) return;
    hallazgos.push({
      id: "marcador_vacio",
      message: `«${nombre}»: la línea «- ${etiqueta}:» sigue vacía; escribí su contenido o «ninguno».`,
    });
  });
  return hallazgos;
}

/** El texto del Rollback del plan: lo que sigue a la etiqueta y su continuación. */
function textoDelRollback(plan: string): string | null {
  const lineas = lineasDe(plan);
  const i = lineas.findIndex((linea) => /^-\s+rollback\b/i.test(linea));
  if (i === -1) return null;
  const enLinea = (lineas[i] as string).replace(/^-\s+rollback[^:]*:/i, "").trim();
  const siguientes: string[] = [];
  for (let j = i + 1; j < lineas.length; j++) {
    const linea = lineas[j] as string;
    if (linea.trim() === "") continue;
    if (!/^\s{2,}\S/.test(linea)) break;
    siguientes.push(linea.trim());
  }
  return [enLinea, ...siguientes].join(" ").trim();
}

/** Los pasos numerados del plan, con su texto (los vacíos incluidos, como cadena vacía). */
function pasosDelPlan(plan: string): string[] {
  return lineasDe(plan)
    .map((linea) => /^\s+(\d+)\.\s*(.*)$/.exec(linea))
    .filter((coincidencia): coincidencia is RegExpExecArray => coincidencia !== null)
    .map((coincidencia) => (coincidencia[2] as string).trim());
}

/** Lo que el texto cita entre comillas invertidas. */
function citados(texto: string): string[] {
  return [...texto.matchAll(/`([^`\n]+)`/g)].map((m) => (m[1] as string).trim());
}

/** `true` si lo citado parece una ruta de archivo (con directorio y extensión). */
function pareceRuta(token: string): boolean {
  return /^[\w@.\-/]+\/[\w@.\-]+\.[A-Za-z0-9]{1,6}(?::\d+(?:-\d+)?)?$/.test(token) && !token.includes("://");
}

/** `true` si lo citado parece un archivo, con o sin directorio. */
function pareceArchivo(token: string): boolean {
  return /^[\w@.\-/]+\.[A-Za-z0-9]{1,6}(?::\d+(?:-\d+)?)?$/.test(token) && !token.includes("://");
}

/** ¿La raíz es un repositorio donde se pueden comprobar archivos? */
function esRepositorio(root: string): boolean {
  try {
    return statSync(join(root, ".git")).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Revisa un ticket antes de llamar al evaluador de una compuerta.
 *
 * Devuelve los hallazgos; una lista vacía significa que se puede evaluar. La comprobación
 * de archivos solo se hace dentro de un repositorio git y solo sobre lo que cita el
 * diagnóstico: el plan cita archivos que va a crear, y fuera de un repositorio no hay
 * dónde comprobarlos.
 */
export function reviewBeforeGate(input: {
  readonly root: string;
  readonly ticketText: string;
  readonly gateId: string;
}): { readonly findings: PreReviewFinding[]; readonly skipped: string[] } {
  const s = secciones(input.ticketText);
  const findings: PreReviewFinding[] = [];
  const skipped: string[] = [];
  const esPlan = input.gateId === "plan";

  findings.push(...marcadoresVacios("Descripción funcional", s["Descripción funcional"] ?? ""));
  findings.push(...marcadoresVacios("Diagnóstico", s["Diagnóstico"] ?? ""));

  const diagnostico = lineasDe(s["Diagnóstico"] ?? "").join("\n");
  if (esRepositorio(input.root)) {
    const vistos = new Set<string>();
    for (const token of citados(diagnostico).filter(pareceRuta)) {
      const ruta = token.replace(/:\d+(?:-\d+)?$/, "");
      if (vistos.has(ruta)) continue;
      vistos.add(ruta);
      if (!existsSync(join(input.root, ruta))) {
        findings.push({
          id: "archivo_inexistente",
          message: `«Diagnóstico»: cita \`${ruta}\`, que no existe en el repositorio.`,
        });
      }
    }
  } else {
    skipped.push("archivos citados: la raíz del proyecto no es un repositorio git, no hay dónde comprobarlos");
  }

  if (esPlan) {
    const plan = s["Plan"] ?? "";
    findings.push(...marcadoresVacios("Plan", plan));

    const rollback = textoDelRollback(plan);
    if (rollback === null || rollback === "") {
      findings.push({
        id: "rollback_vacio",
        message: "«Plan»: la línea «Rollback:» está vacía; dice cómo se revierte el cambio.",
      });
    }

    pasosDelPlan(plan).forEach((paso, i) => {
      if (paso === "") {
        findings.push({
          id: "marcador_vacio",
          message: `«Plan»: el paso ${i + 1} sigue vacío.`,
        });
      } else if (citados(paso).length === 0) {
        findings.push({
          id: "paso_sin_ruta_ni_comando",
          message: `«Plan»: el paso ${i + 1} no nombra un archivo, un símbolo ni un comando entre comillas invertidas: «${paso.slice(0, 80)}».`,
        });
      }
    });

    const criterios = extractCriteriaSpecs(s["Criterios de aceptación"] ?? "");
    for (const criterio of criterios.filter((c) => !criterioDeclarado(c))) {
      findings.push({
        id: "criterio_sin_anotacion",
        message: `«Criterios»: «${criterio.text.slice(0, 80)}» no declara cómo se verifica (<!-- test: … --> o <!-- verify: manual -->).`,
      });
    }
    if (criterios.length > TOPE_DE_CRITERIOS) {
      findings.push({
        id: "mas_criterios_que_el_tope",
        message: `«Criterios»: son ${criterios.length}, más que el tope de ${TOPE_DE_CRITERIOS}; partí el ticket.`,
      });
    }
  }

  return { findings, skipped };
}

/** El informe de la revisión, para quien la corre a mano y para la compuerta. */
export function renderPreReview(
  gateId: string,
  ticketId: string,
  result: { readonly findings: readonly PreReviewFinding[]; readonly skipped: readonly string[] },
): string {
  const lineas = [`Revisión previa — compuerta ${gateId} — ${ticketId}`];
  if (result.findings.length === 0) {
    lineas.push("  Sin hallazgos: el ticket se puede evaluar.");
  } else {
    lineas.push(
      `  Falta algo, y no se llama al evaluador (${result.findings.length} hallazgo(s)):`,
      ...result.findings.map((hallazgo) => `    ✗ ${hallazgo.message}`),
    );
  }
  for (const omitido of result.skipped) lineas.push(`  · Omitido: ${omitido}`);
  return `${lineas.join("\n")}\n`;
}

/** La respuesta que da el código cuando se cumple lo que la proposición pide. */
const CUMPLE = 0.99;

/**
 * Decide en código una proposición del plan (R-CPRE-009).
 *
 * `rollback_suficiente`, `hay_archivos_afectados`, `pasos_ejecutables` y
 * `criterios_verificables` no necesitan un modelo: lo que piden se lee en el texto. Votan en
 * la decisión —el valor 0 bloquea— y no pasan a descriptivas porque el ticket tenga
 * criterios. Devuelve `null` para una proposición que no se decide en código.
 */
export function decideInCode(propositionId: string, ticketText: string): number | null {
  const s = secciones(ticketText);
  const plan = s["Plan"] ?? "";
  switch (propositionId) {
    case "rollback_suficiente": {
      const rollback = textoDelRollback(plan);
      return rollback !== null && rollback.length >= 15 ? CUMPLE : 0;
    }
    case "hay_archivos_afectados":
      return citados(lineasDe(plan).join("\n")).some(pareceArchivo) ? CUMPLE : 0;
    case "pasos_ejecutables": {
      const pasos = pasosDelPlan(plan);
      return pasos.length > 0 && pasos.every((paso) => paso !== "" && citados(paso).length > 0)
        ? CUMPLE
        : 0;
    }
    case "criterios_verificables": {
      const criterios = extractCriteriaSpecs(s["Criterios de aceptación"] ?? "");
      return criterios.length > 0 && criterios.every((c) => criterioDeclarado(c))
        ? CUMPLE
        : 0;
    }
    default:
      return null;
  }
}
