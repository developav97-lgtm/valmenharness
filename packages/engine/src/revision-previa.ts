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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseTicket, stripHtmlComments } from "@valmen/core";
import {
  type CriterionSpec,
  afirmacionesDe,
  criterioDeclarado,
  esCriterioDePrueba,
  extractCriteriaSpecs,
} from "@valmen/gate";

import { topeDeEntrega } from "./tamano-entrega.js";

/** Un hallazgo de la revisión: qué es y qué falta. */
export interface PreReviewFinding {
  readonly id:
    | "marcador_vacio"
    | "rollback_vacio"
    | "archivo_inexistente"
    | "criterio_sin_anotacion"
    | "mas_criterios_que_el_tope"
    | "paso_sin_ruta_ni_comando"
    | "tamano_sin_lineas"
    | "excede_el_tope_sin_decision";
  readonly message: string;
}

/**
 * Cuántas **afirmaciones** admiten los criterios antes de pedir que el ticket se parta.
 *
 * Es un tope de **revisión**, distinto de las tandas con las que se evalúan los criterios:
 * evaluar todos en varias llamadas no es recortar, y un ticket con más de este número es
 * dos tickets. Se cuentan afirmaciones y no líneas: partir un criterio compuesto en atómicos
 * —lo que pide el aviso de forma— no cambia la suma, y así partir no puede pasar el tope.
 *
 * Es 20 para los tickets con `created` igual o posterior a `VIGENCIA_DEL_TOPE`; los creados
 * antes conservan `TOPE_DE_CRITERIOS_HEREDADO`. Ver `topeDeCriterios`.
 */
export const TOPE_DE_CRITERIOS = 20;

/** El tope que conservan los tickets creados antes de la vigencia. */
export const TOPE_DE_CRITERIOS_HEREDADO = 40;

/** Desde esta fecha de creación (inclusive) rige `TOPE_DE_CRITERIOS`. */
export const VIGENCIA_DEL_TOPE = "2026-10-12";

/**
 * El tope de afirmaciones que aplica a un ticket según su fecha de creación.
 *
 * Un `created` ausente o que no es `AAAA-MM-DD` cuenta como ticket nuevo: es el lado que no deja
 * pasar un plan grande por un frontmatter roto.
 */
export function topeDeCriterios(created: string | undefined): number {
  if (created === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(created)) {
    return TOPE_DE_CRITERIOS;
  }
  return created >= VIGENCIA_DEL_TOPE ? TOPE_DE_CRITERIOS : TOPE_DE_CRITERIOS_HEREDADO;
}

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

/** El texto de una línea `- <etiqueta>:` del plan y su continuación; `null` si no está. */
function textoDeLaLinea(plan: string, etiqueta: RegExp): string | null {
  const lineas = lineasDe(plan);
  const i = lineas.findIndex((linea) => etiqueta.test(linea));
  if (i === -1) return null;
  const enLinea = (lineas[i] as string).replace(/^-\s+[^:]*:/, "").trim();
  const siguientes: string[] = [];
  for (let j = i + 1; j < lineas.length; j++) {
    const linea = lineas[j] as string;
    if (linea.trim() === "") continue;
    if (!/^\s{2,}\S/.test(linea)) break;
    siguientes.push(linea.trim());
  }
  return [enLinea, ...siguientes].join(" ").trim();
}

/**
 * Las líneas que el plan declara en `- Tamaño previsto:` (la mayor de las «N líneas»).
 * `null` sin la línea; `NaN` con la línea pero sin un número de líneas.
 */
function lineasPrevistas(plan: string): number | null {
  const texto = textoDeLaLinea(plan, /^-\s+tama[ñn]o previsto\b/i);
  if (texto === null) return null;
  const cantidades = [
    ...texto.matchAll(/(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)\s+l[ií]neas/gi),
  ].map((m) => Number.parseInt((m[1] as string).replace(/[ .\u00a0]/g, ""), 10));
  return cantidades.length === 0 ? Number.NaN : Math.max(...cantidades);
}

/** `true` si «Si excede el tope:» dice que se parte o que sigue, con algo más que la palabra. */
function hayDecisionDeParticion(plan: string): boolean {
  const texto = textoDeLaLinea(plan, /^-\s+si excede el tope\b/i) ?? "";
  return texto.length >= 15 && /\b(se parte|partir|partirse|sigue|seguir)\b/i.test(texto);
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
  return (
    /^[\w@.\-/]+\/[\w@.\-]+\.[A-Za-z0-9]{1,6}(?::\d+(?:-\d+)?)?$/.test(token) &&
    !token.includes("://")
  );
}

/** `true` si lo citado parece un archivo, con o sin directorio. */
function pareceArchivo(token: string): boolean {
  return (
    /^[\w@.\-/]+\.[A-Za-z0-9]{1,6}(?::\d+(?:-\d+)?)?$/.test(token) && !token.includes("://")
  );
}

/**
 * ¿La raíz es un repositorio donde se pueden comprobar archivos?
 *
 * En un checkout `.git` es un directorio; en un worktree es un archivo cuya primera línea
 * empieza por «gitdir:». Las dos formas son un repositorio.
 */
function esRepositorio(root: string): boolean {
  try {
    const git = join(root, ".git");
    const estado = statSync(git);
    if (estado.isDirectory()) return true;
    if (!estado.isFile()) return false;
    const primera = readFileSync(git, "utf8").split("\n", 1)[0] ?? "";
    return primera.trimStart().startsWith("gitdir:");
  } catch {
    return false;
  }
}

/** Cómo quedó una ruta que cita el diagnóstico. */
export type ResultadoDeCita = "existe" | "no_existe" | "linea_fuera" | "omitida";

/** Una ruta citada en el diagnóstico, comprobada en código. */
export interface CitaComprobada {
  /** La cita tal como está escrita, con su línea si la trae. */
  readonly cita: string;
  /** La ruta sin el sufijo de línea. */
  readonly ruta: string;
  /** La línea citada (el extremo mayor de un rango), si la trae. */
  readonly linea?: number;
  readonly resultado: ResultadoDeCita;
  /** El motivo, para `linea_fuera` (largo del archivo) y `omitida`. */
  readonly detalle?: string;
}

/** El número de líneas de un archivo de texto (sin contar el salto final). */
function largoEnLineas(ruta: string): number {
  const texto = readFileSync(ruta, "utf8");
  if (texto === "") return 0;
  const partes = texto.split("\n");
  return texto.endsWith("\n") ? partes.length - 1 : partes.length;
}

/** Una frase que dice que el archivo es nuevo o que el ticket lo crea. */
const DECLARA_NUEVO_RE = /\bnuev[oa]s?\b|\bse crea(?:n|rá|rán)?\b|\bcrear\b/i;

/**
 * La ruta absoluta de lo citado: en la raíz o, si no está, bajo **una sola** carpeta de
 * primer nivel (`BackEnd/…` en un monorepo que cita rutas relativas a su paquete). `null`
 * si no existe en ninguna o si es ambigua.
 */
function rutaEnElProyecto(root: string, ruta: string): string | null {
  const directa = join(root, ruta);
  if (existsSync(directa)) return directa;
  let carpetas: string[];
  try {
    carpetas = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => e.name);
  } catch {
    return null;
  }
  const halladas = carpetas.map((c) => join(root, c, ruta)).filter((p) => existsSync(p));
  return halladas.length === 1 ? (halladas[0] as string) : null;
}

/**
 * Las rutas que cita el diagnóstico, comprobadas en código contra la raíz.
 *
 * Una ruta que empieza por «/» o «../» no es relativa a la raíz —es una ruta de URL o de
 * otra carpeta— y queda `omitida` con su motivo. Una línea mayor que el largo del archivo
 * es `linea_fuera`. Fuera de un repositorio no hay dónde comprobar y devuelve una lista
 * vacía.
 */
export function citedFiles(root: string, ticketText: string): CitaComprobada[] {
  if (!esRepositorio(root)) return [];
  const lineas = lineasDe(secciones(ticketText)["Diagnóstico"] ?? "");
  const diagnostico = lineas.join("\n");
  const declaradas = new Set(
    lineas.filter((l) => DECLARA_NUEVO_RE.test(l)).flatMap((l) => citados(l)),
  );
  const vistas = new Set<string>();
  const resultado: CitaComprobada[] = [];
  for (const token of citados(diagnostico).filter(pareceRuta)) {
    if (vistas.has(token)) continue;
    vistas.add(token);
    const sufijo = /:(\d+)(?:-(\d+))?$/.exec(token);
    const ruta = token.replace(/:\d+(?:-\d+)?$/, "");
    const linea = sufijo === null ? undefined : Number(sufijo[2] ?? sufijo[1]);
    const base = { cita: token, ruta, ...(linea === undefined ? {} : { linea }) };
    if (ruta.startsWith("/") || ruta.startsWith("../")) {
      resultado.push({
        ...base,
        resultado: "omitida",
        detalle: "no es relativa a la raíz",
      });
      continue;
    }
    const absoluta = rutaEnElProyecto(root, ruta);
    if (absoluta === null) {
      if (linea === undefined && declaradas.has(token)) {
        resultado.push({
          ...base,
          resultado: "omitida",
          detalle: "es un archivo nuevo que el ticket crea",
        });
        continue;
      }
      resultado.push({ ...base, resultado: "no_existe" });
      continue;
    }
    if (linea !== undefined) {
      try {
        if (statSync(absoluta).isFile()) {
          const largo = largoEnLineas(absoluta);
          if (linea > largo) {
            resultado.push({
              ...base,
              resultado: "linea_fuera",
              detalle: `el archivo tiene ${largo} línea(s)`,
            });
            continue;
          }
        }
      } catch {
        // Si no se puede leer, la existencia ya está comprobada: no se inventa un hallazgo.
      }
    }
    resultado.push({ ...base, resultado: "existe" });
  }
  return resultado;
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

  findings.push(
    ...marcadoresVacios("Descripción funcional", s["Descripción funcional"] ?? ""),
  );
  findings.push(...marcadoresVacios("Diagnóstico", s["Diagnóstico"] ?? ""));

  if (esRepositorio(input.root)) {
    const sinExistir = new Set<string>();
    for (const cita of citedFiles(input.root, input.ticketText)) {
      if (cita.resultado === "omitida") {
        skipped.push(
          `archivos citados: \`${cita.ruta}\` ${cita.detalle ?? "no se comprueba"}, no se comprueba`,
        );
      } else if (cita.resultado === "no_existe") {
        if (sinExistir.has(cita.ruta)) continue;
        sinExistir.add(cita.ruta);
        findings.push({
          id: "archivo_inexistente",
          message: `«Diagnóstico»: cita \`${cita.ruta}\`, que no existe en el repositorio.`,
        });
      } else if (cita.resultado === "linea_fuera") {
        findings.push({
          id: "archivo_inexistente",
          message: `«Diagnóstico»: cita \`${cita.cita}\`, pero ${cita.detalle ?? "la línea no existe"}.`,
        });
      }
    }
  } else {
    skipped.push(
      "archivos citados: la raíz del proyecto no es un repositorio git, no hay dónde comprobarlos",
    );
  }

  if (esPlan) {
    const plan = s["Plan"] ?? "";
    findings.push(...marcadoresVacios("Plan", plan));

    const rollback = textoDelRollback(plan);
    if (rollback === null || rollback === "") {
      findings.push({
        id: "rollback_vacio",
        message:
          "«Plan»: la línea «Rollback:» está vacía; dice cómo se revierte el cambio.",
      });
    }

    const previstas = lineasPrevistas(plan);
    if (previstas !== null) {
      if (Number.isNaN(previstas)) {
        findings.push({
          id: "tamano_sin_lineas",
          message:
            "«Plan»: «- Tamaño previsto:» no dice «N líneas»; escribí cuántas líneas de producción y pruebas prevé.",
        });
      } else {
        const tope = topeDeEntrega(input.root);
        if (previstas > tope && !hayDecisionDeParticion(plan)) {
          findings.push({
            id: "excede_el_tope_sin_decision",
            message:
              `«Plan»: declara ${previstas} líneas, más que el tope de ${tope} (\`delivery-budget\`), ` +
              "y «- Si excede el tope:» no dice si se parte en tickets dependientes («se parte en …») o sigue con motivo («sigue: …»).",
          });
        }
      }
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
    const afirmaciones = criterios.reduce((total, c) => total + afirmacionesDe(c.text), 0);
    const tope = topeDeCriterios(parseTicket(input.ticketText).fields["created"]);
    if (afirmaciones > tope) {
      findings.push({
        id: "mas_criterios_que_el_tope",
        message:
          `«Criterios»: son ${afirmaciones} afirmaciones en ${criterios.length} criterio(s), ` +
          `más que el tope de ${tope}; partí el ticket.`,
      });
    }
  }

  return { findings, skipped };
}

/** El informe de la revisión, para quien la corre a mano y para la compuerta. */
export function renderPreReview(
  gateId: string,
  ticketId: string,
  result: {
    readonly findings: readonly PreReviewFinding[];
    readonly skipped: readonly string[];
  },
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
      return pasos.length > 0 &&
        pasos.every((paso) => paso !== "" && citados(paso).length > 0)
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

/**
 * Los criterios que los pasos del plan citan como «Cn», sin modelo.
 *
 * El identificador se lee con límite de palabra —«C10» no cita C1— y un rango se escribe
 * «Cn–Cm», «Cn-Cm» o «Cn a Cm» (el segundo extremo admite la «C» o no). Solo se leen los
 * pasos numerados: una mención suelta en el resto del plan no verifica nada.
 */
export function criteriosCitados(plan: string): Set<number> {
  const citados = new Set<number>();
  for (const paso of pasosDelPlan(plan)) {
    for (const rango of paso.matchAll(/\bC(\d+)\s*(?:[–—-]|\ba\b)\s*C?(\d+)\b/g)) {
      const desde = Number(rango[1]);
      const hasta = Number(rango[2]);
      for (let n = Math.min(desde, hasta); n <= Math.max(desde, hasta); n++) citados.add(n);
    }
    for (const cita of paso.matchAll(/\bC(\d+)\b/g)) citados.add(Number(cita[1]));
  }
  return citados;
}

/**
 * Decide en código el voto de un criterio manual o «la prueba pasa» (`criterio_NN`).
 *
 * Un manual compuesto vota 0 y pide partirlo; uno que ningún paso cita como «Cn» vota 0, que
 * es lo que antes detectaba el modelo; un criterio de prueba sin cita vota 0, y también si su
 * comando nombra un archivo que el plan no nombra. Si no, cumple. `indice` es el `NN`, 1-based.
 */
export function decidirCriterioEnCodigo(
  indice: number,
  criterio: CriterionSpec,
  ticketText: string,
): { readonly valor: number; readonly motivo: string } {
  const plan = secciones(ticketText)["Plan"] ?? "";
  const afirmaciones = afirmacionesDe(criterio.text);
  if (criterio.manual && afirmaciones >= 2) {
    return { valor: 0, motivo: `agrupa ${afirmaciones} afirmaciones; partilo` };
  }
  if (!criteriosCitados(plan).has(indice)) {
    return { valor: 0, motivo: `ningún paso cita C${indice}` };
  }
  if (!criterio.manual && esCriterioDePrueba(criterio)) {
    const textoDelPlan = lineasDe(plan).join("\n");
    const archivo = (criterio.command ?? "")
      .split(/\s+/)
      .map((token) => token.replace(/^["'`]|["'`]$/g, ""))
      .find((token) => pareceRuta(token));
    if (archivo !== undefined && !textoDelPlan.includes(archivo)) {
      return { valor: 0, motivo: `el plan no nombra \`${archivo}\`` };
    }
  }
  return { valor: CUMPLE, motivo: `C${indice} citado por un paso del plan` };
}
