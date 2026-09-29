/**
 * Auditoría de manuales contra el código, con citas.
 *
 * La detección de `manuales.ts` cruza **qué archivos** declara un manual; este
 * módulo cruza **qué dice** de ellos. Cada afirmación visible de un manual
 * declara la línea del código que la respalda y el motor la resuelve contra el
 * disco, sin modelo: es la mitad decidible en código de R-S3-003 —el diseño dejó
 * la semántica —«lo citado dice lo que la afirmación sostiene»— como proposición
 * de Jev, y acá no se toca—.
 *
 * ## El contrato de citas
 *
 * La evidencia de una afirmación es la anotación
 *
 *     <!-- cita: <ruta>:<línea> -->
 *
 * en la **misma línea** de la afirmación o en la **línea de abajo**. `<ruta>` es
 * relativa a la raíz del repositorio y `<línea>` es 1-based. La cita resuelve
 * cuando el archivo existe y la línea cae dentro del archivo y no está vacía.
 *
 * ## Qué cuenta como afirmación
 *
 * Una línea visible de una sección del manual: fuera de los comentarios HTML
 * —el bloque de metadata y las propias citas—, fuera de los encabezados, fuera
 * de los separadores de tabla y fuera de la sección de pendientes —cuya cabecera
 * contiene «pendiente», sin distinguir mayúsculas—. Los encabezados y las tablas
 * no afirman comportamiento, y exigirles cita produciría rojos falsos.
 *
 * ## Los tres veredictos
 *
 * - `approve`: cada afirmación declara cita y cada cita resuelve.
 * - `block`: falta una cita, una cita no resuelve (ruta inexistente, línea fuera
 *   del archivo o línea vacía), una cita está mal formada (sin línea o con línea
 *   no numérica), o una ruta técnica con extensión de fuente se filtró al texto
 *   visible.
 * - `review`: nada bloquea y solo falta lo que no se decide en código —un literal
 *   entre comillas de la sección de errores que no aparece en las fuentes
 *   citadas— o no hay ningún manual que auditar.
 *
 * El veredicto de la corrida es el peor de los tres.
 *
 * ## Por qué cada decisión
 *
 * 1. **La cita lleva ruta y línea.** Un bloque de citas al frente ata la cita a
 *    un índice y se desincroniza al reordenar el texto; reutilizar
 *    `<!-- rutas-fuente: … -->` no sirve porque declara de qué archivos **habla**
 *    el manual y su parser devuelve tokens sin línea, sin poder contrastar una
 *    afirmación concreta.
 * 2. **Una afirmación es una línea de cuerpo visible.** Exigir la cita a cada
 *    línea del archivo, encabezados y tablas incluidos, marca en rojo texto que
 *    no afirma comportamiento.
 * 3. **Los tres estados existen.** Sin banda de revisión, el paso de proceso se
 *    volvería rojo por lo que el diagnóstico declara como no decidible en código.
 * 4. **El mensaje de error ausente queda en `review`, no bloquea.** Un literal
 *    puede venir de un servicio que la pantalla consume y no de sus fuentes, así
 *    que bloquear por mensaje ausente produciría el rojo falso anticipado.
 * 5. **El recibo usa el formato vigente.** `gate: "manuals"`, la política por
 *    defecto y sujeto de proceso —este gate no protege ninguna transición de
 *    ticket—, con un `mechanicalCheck` por check y el veredicto de cada manual en
 *    las proposiciones evaluadas. El comando lo anexa a
 *    `.valmen/receipts/actualizar-manuales.jsonl`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

import {
  type EvaluatedProposition,
  type GateDecision,
  type GateReceipt,
  type MechanicalCheck,
  DEFAULT_POLICY,
  buildReceipt,
  hashState,
} from "@valmen/gate";

import { type RegistryPaths } from "./discovery.js";
import { MANUALES_POR_DEFECTO } from "./manuales.js";

/** El sujeto del recibo de esta auditoría: la corrida del proceso. */
export const SUJETO_MANUALES = "actualizar-manuales";

/** El gate que la auditoría representa. */
export const GATE_MANUALES = "manuals";

/** Las extensiones que delatan una ruta técnica filtrada al texto visible. */
const EXTENSIONES_FUENTE = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "vue",
  "svelte",
  "py",
  "rb",
  "php",
  "java",
  "kt",
  "kts",
  "go",
  "rs",
  "cs",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "swift",
  "dart",
  "sh",
  "bash",
];

/**
 * Una ruta con extensión de fuente.
 *
 * Se exige al menos un separador: `Node.js` no es una ruta técnica y un `.ts`
 * suelto tampoco; una ruta como `src/app/ordenes.component.ts` sí.
 */
const RE_RUTA_TECNICA = new RegExp(
  `(?:[\\w.@~+-]+/)+[\\w.@~+-]+\\.(?:${EXTENSIONES_FUENTE.join("|")})\\b`,
  "i",
);

/** Veredicto de un manual o de la corrida. */
export type VeredictoManual = "approve" | "block" | "review";

/** Una cita declarada, ya separada en ruta y línea. */
export interface Cita {
  /** Ruta relativa a la raíz del repositorio. */
  readonly ruta: string;
  /** Línea 1-based, o `null` si la anotación está mal formada. */
  readonly linea: number | null;
  /** El texto crudo de la anotación, para los mensajes. */
  readonly cruda: string;
}

/** El motivo por el que una línea no es una afirmación auditable. */
export type TipoHallazgo =
  | "sin-cita"
  | "cita-mal-formada"
  | "cita-no-resuelve"
  | "ruta-tecnica"
  | "mensaje-no-literal";

/** Un hallazgo de la auditoría, atado al manual y a su línea. */
export interface HallazgoAuditoria {
  readonly manual: string;
  readonly linea: number;
  readonly tipo: TipoHallazgo;
  readonly detalle: string;
}

/** El resultado de auditar un manual. */
export interface AuditoriaManual {
  /** Ruta del manual relativa a la raíz. */
  readonly manual: string;
  /** El `# Título` del manual, si lo tiene. */
  readonly titulo: string | null;
  readonly veredicto: VeredictoManual;
  readonly motivo: string;
  /** Cuántas afirmaciones visibles se auditaron. */
  readonly afirmaciones: number;
  /** Cuántas citas declaró el manual. */
  readonly citas: number;
  /** Cuántos literales de la sección de errores se revisaron. */
  readonly literales: number;
  readonly hallazgos: readonly HallazgoAuditoria[];
}

/** El resultado completo de la auditoría. */
export interface AuditoriaManuales {
  /** ISO-8601 de la corrida. */
  readonly fecha: string;
  readonly manualesDir: string;
  readonly manuales: readonly AuditoriaManual[];
  /** El peor veredicto de los manuales, o `review` si no hay ninguno. */
  readonly veredicto: VeredictoManual;
  readonly motivo: string;
  /** El resultado de cada check mecánico, para el recibo. */
  readonly checks: readonly MechanicalCheck[];
  /** SHA-256 del corpus auditado, como revisión del sujeto. */
  readonly revision: string;
}

/** Opciones de la auditoría. */
export interface OpcionesAuditoria {
  readonly manualesDir?: string;
  /** Inyectable para las pruebas. */
  readonly ahora?: Date;
}

/** Opciones del recibo. */
export interface OpcionesReciboAuditoria {
  /** Id del recibo; por defecto, uno derivado de la fecha y el sujeto. */
  readonly id?: string;
}

/** Un manual leído de disco, con su texto crudo para el hash. */
interface ManualLeido {
  readonly relativa: string;
  readonly titulo: string | null;
  readonly texto: string;
}

/** Una línea del manual ya despojada de comentarios y clasificada. */
interface LineaVisible {
  readonly numero: number;
  /** El texto sin comentarios HTML; los `\n` de los comentarios se conservan. */
  readonly visible: string;
  readonly encabezado: boolean;
  readonly nivel: number | null;
  readonly separadorTabla: boolean;
  readonly enPendientes: boolean;
  readonly enErrores: boolean;
}

/** El resultado de resolver una cita, o el motivo por el que no resolvió. */
type ResultadoCita =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly tipo: "cita-mal-formada" | "cita-no-resuelve";
      readonly detalle: string;
    };

/** Convierte una ruta absoluta en relativa a la raíz y con separadores POSIX. */
function aRelativa(root: string, absoluta: string): string {
  return relative(root, absoluta).split(sep).join("/");
}

/** El `# Título` del manual: la primera línea que es un encabezado de nivel 1. */
function tituloDe(texto: string): string | null {
  const coincidencia = /^#\s+(.+?)\s*$/m.exec(texto);
  return coincidencia === null ? null : (coincidencia[1] as string).trim();
}

/** Recorta un texto largo para un mensaje. */
function recorte(texto: string, max = 80): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`;
}

/** Recorre un directorio y devuelve los `.md`, en orden estable por ruta. */
function recorrerManuales(entradas: string[], base: string): void {
  let hijos;
  try {
    hijos = readdirSync(base, { withFileTypes: true });
  } catch {
    return;
  }
  hijos.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const hijo of hijos) {
    const ruta = join(base, hijo.name);
    if (hijo.isDirectory()) recorrerManuales(entradas, ruta);
    else if (hijo.isFile() && hijo.name.endsWith(".md")) entradas.push(ruta);
  }
}

/** Los manuales de un proyecto, ya leídos, en orden estable por ruta. */
function leerManuales(root: string, manualesDir: string): ManualLeido[] {
  const base = join(root, ...manualesDir.split("/"));
  const rutas: string[] = [];
  recorrerManuales(rutas, base);
  rutas.sort((a, b) => {
    const ra = aRelativa(root, a);
    const rb = aRelativa(root, b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
  return rutas.map((ruta) => {
    const texto = readFileSync(ruta, "utf8");
    return { relativa: aRelativa(root, ruta), titulo: tituloDe(texto), texto };
  });
}

/** Quita los comentarios HTML conservando los `\n`, para no correr las líneas. */
function sinComentarios(texto: string): string {
  let salida = "";
  let i = 0;
  while (i < texto.length) {
    const inicio = texto.indexOf("<!--", i);
    if (inicio === -1) {
      salida += texto.slice(i);
      break;
    }
    salida += texto.slice(i, inicio);
    const fin = texto.indexOf("-->", inicio + 4);
    if (fin === -1) {
      salida += texto.slice(inicio).replace(/[^\n]/g, " ");
      break;
    }
    salida += texto.slice(inicio, fin + 3).replace(/[^\n]/g, " ");
    i = fin + 3;
  }
  return salida;
}

/** El encabezado de una línea visible, con su nivel, o `null`. */
function leerEncabezado(visible: string): { nivel: number; texto: string } | null {
  const m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(visible);
  if (m === null) return null;
  return { nivel: (m[1] as string).length, texto: (m[2] as string).trim() };
}

/** `true` si la línea es un separador de tabla y no una afirmación. */
function esSeparadorTabla(visible: string): boolean {
  const t = visible.trim();
  if (t === "" || !t.includes("-")) return false;
  return /^[|:\-\s]+$/.test(t);
}

/**
 * Clasifica las líneas del manual.
 *
 * Las secciones de pendientes y de errores se detectan por su encabezado y
 * terminan en el próximo encabezado de nivel igual o superior, así que una
 * subsección no se escapa.
 */
function analizarLineas(texto: string): LineaVisible[] {
  const visibles = sinComentarios(texto).split(/\r?\n/);
  const lineas: LineaVisible[] = [];
  let pendNivel: number | null = null;
  let errNivel: number | null = null;

  for (let i = 0; i < visibles.length; i++) {
    const visible = visibles[i] ?? "";
    const encabezado = leerEncabezado(visible);
    if (encabezado !== null) {
      if (pendNivel !== null && encabezado.nivel <= pendNivel) pendNivel = null;
      if (errNivel !== null && encabezado.nivel <= errNivel) errNivel = null;
      const bajo = encabezado.texto.toLowerCase();
      if (bajo.includes("pendiente")) pendNivel = encabezado.nivel;
      if (bajo.includes("error") || bajo.includes("sale mal")) errNivel = encabezado.nivel;
    }
    lineas.push({
      numero: i + 1,
      visible,
      encabezado: encabezado !== null,
      nivel: encabezado === null ? null : encabezado.nivel,
      separadorTabla: esSeparadorTabla(visible),
      enPendientes: pendNivel !== null,
      enErrores: errNivel !== null,
    });
  }
  return lineas;
}

/** `true` si la línea es una afirmación sobre el comportamiento. */
function esAfirmacion(linea: LineaVisible): boolean {
  if (linea.visible.trim() === "") return false;
  if (linea.encabezado) return false;
  if (linea.separadorTabla) return false;
  if (linea.enPendientes) return false;
  return true;
}

/** La línea 1-based en la que cae un índice de carácter. */
function lineaDe(texto: string, indice: number): number {
  let n = 1;
  for (let i = 0; i < indice; i++) if (texto[i] === "\n") n++;
  return n;
}

/** Separa el contenido de una anotación `cita:` en ruta y línea. */
function parsearCita(cruda: string): Cita {
  const contenido = cruda.trim();
  const corte = contenido.lastIndexOf(":");
  if (corte === -1) return { ruta: contenido, linea: null, cruda: contenido };
  const ruta = contenido.slice(0, corte).trim();
  const numero = contenido.slice(corte + 1).trim();
  if (!/^\d+$/.test(numero)) return { ruta, linea: null, cruda: contenido };
  return { ruta, linea: Number(numero), cruda: contenido };
}

/** Las citas declaradas, agrupadas por la línea en la que aparecen. */
function citasPorLinea(texto: string): Map<number, Cita[]> {
  const mapa = new Map<number, Cita[]>();
  const re = /<!--[ \t]*cita:[ \t]*([^\n]*?)[ \t]*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const linea = lineaDe(texto, m.index);
    const lista = mapa.get(linea) ?? [];
    lista.push(parsearCita(m[1] ?? ""));
    mapa.set(linea, lista);
  }
  return mapa;
}

/** Resuelve una cita contra el repositorio. */
function resolverCita(root: string, cita: Cita): ResultadoCita {
  if (cita.ruta === "" || cita.linea === null) {
    return {
      ok: false,
      tipo: "cita-mal-formada",
      detalle: `la cita «${cita.cruda}» no declara una ruta y una línea numérica`,
    };
  }
  const absoluta = isAbsolute(cita.ruta) ? cita.ruta : join(root, ...cita.ruta.split("/"));
  let contenido: string;
  try {
    contenido = readFileSync(absoluta, "utf8");
  } catch {
    return {
      ok: false,
      tipo: "cita-no-resuelve",
      detalle: `la cita «${cita.cruda}» apunta a una ruta que no existe (${cita.ruta})`,
    };
  }
  const lineas = contenido.split(/\r?\n/);
  if (cita.linea < 1 || cita.linea > lineas.length) {
    return {
      ok: false,
      tipo: "cita-no-resuelve",
      detalle: `la cita «${cita.cruda}» cae fuera de ${cita.ruta} (${lineas.length} línea(s))`,
    };
  }
  const texto = lineas[cita.linea - 1] ?? "";
  if (texto.trim() === "") {
    return {
      ok: false,
      tipo: "cita-no-resuelve",
      detalle: `la cita «${cita.cruda}» apunta a una línea vacía de ${cita.ruta}`,
    };
  }
  return { ok: true };
}

/** Los literales entre comillas o backticks de un texto visible. */
function extraerLiterales(texto: string): string[] {
  const salida: string[] = [];
  const re = /`([^`\n]+)`|"([^"\n]+)"|“([^”\n]+)”/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const valor = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (valor !== "") salida.push(valor);
  }
  return salida;
}

/** Todo el texto de las fuentes que el manual cita, para el check de literales. */
function textoDeFuentesCitadas(root: string, citas: readonly Cita[]): string {
  const partes: string[] = [];
  for (const cita of citas) {
    const absoluta = isAbsolute(cita.ruta) ? cita.ruta : join(root, ...cita.ruta.split("/"));
    try {
      partes.push(readFileSync(absoluta, "utf8"));
    } catch {
      // Una fuente que no existe ya se reporta como cita que no resuelve; acá no
      // suma texto, que es lo que corresponde.
    }
  }
  return partes.join("\n");
}

/** Audita un manual y devuelve su veredicto y sus hallazgos. */
function auditarManual(root: string, relativa: string, texto: string): AuditoriaManual {
  const lineas = analizarLineas(texto);
  const citas = citasPorLinea(texto);
  const hallazgos: HallazgoAuditoria[] = [];
  let afirmaciones = 0;

  for (const linea of lineas) {
    if (!esAfirmacion(linea)) continue;
    afirmaciones++;

    const propias = citas.get(linea.numero) ?? [];
    let usadas: readonly Cita[] = propias;
    if (usadas.length === 0) {
      const abajo = lineas[linea.numero];
      if (abajo !== undefined && abajo.visible.trim() === "") {
        usadas = citas.get(abajo.numero) ?? [];
      }
    }

    if (usadas.length === 0) {
      hallazgos.push({
        manual: relativa,
        linea: linea.numero,
        tipo: "sin-cita",
        detalle: `la afirmación «${recorte(linea.visible.trim())}» no declara cita`,
      });
      continue;
    }

    for (const cita of usadas) {
      const resultado = resolverCita(root, cita);
      if (!resultado.ok) {
        hallazgos.push({
          manual: relativa,
          linea: linea.numero,
          tipo: resultado.tipo,
          detalle: resultado.detalle,
        });
      }
    }
  }

  // Una ruta técnica con extensión de fuente en el texto visible es un hallazgo
  // que bloquea, aunque la línea no sea una afirmación de comportamiento.
  for (const linea of lineas) {
    if (linea.visible.trim() === "") continue;
    const coincidencia = RE_RUTA_TECNICA.exec(linea.visible);
    if (coincidencia !== null) {
      hallazgos.push({
        manual: relativa,
        linea: linea.numero,
        tipo: "ruta-tecnica",
        detalle: `el texto visible filtra la ruta técnica ${coincidencia[0].trim()}`,
      });
    }
  }

  // El check de la decisión 4: un literal de la sección de errores que no
  // aparece en las fuentes citadas deja el manual en revisión, no lo bloquea.
  const todasLasCitas = [...citas.values()].flat();
  const corpusFuentes = textoDeFuentesCitadas(root, todasLasCitas);
  let literales = 0;
  for (const linea of lineas) {
    if (!linea.enErrores || linea.visible.trim() === "") continue;
    for (const literal of extraerLiterales(linea.visible)) {
      literales++;
      if (!corpusFuentes.includes(literal)) {
        hallazgos.push({
          manual: relativa,
          linea: linea.numero,
          tipo: "mensaje-no-literal",
          detalle: `el literal «${literal}» no aparece en las fuentes citadas`,
        });
      }
    }
  }

  const bloquean = hallazgos.filter((h) => h.tipo !== "mensaje-no-literal");
  const veredicto: VeredictoManual =
    bloquean.length > 0 ? "block" : hallazgos.length > 0 ? "review" : "approve";
  const motivo =
    veredicto === "approve"
      ? `${afirmaciones} afirmación(es) con cita que resuelve`
      : veredicto === "review"
        ? `${hallazgos.length} literal(es) de error sin respaldo en las fuentes citadas`
        : `${bloquean.length} hallazgo(s) que bloquean`;

  return {
    manual: relativa,
    titulo: tituloDe(texto),
    veredicto,
    motivo,
    afirmaciones,
    citas: todasLasCitas.length,
    literales,
    hallazgos,
  };
}

/** Resume hasta tres hallazgos para el detalle de un check. */
function resumenHallazgos(hallazgos: readonly HallazgoAuditoria[]): string {
  const muestra = hallazgos.slice(0, 3).map((h) => `${h.manual}:${h.linea}`).join(", ");
  return hallazgos.length > 3 ? `${muestra}, …` : muestra;
}

/** Arma los cuatro checks mecánicos a partir de los hallazgos. */
function construirChecks(manuales: readonly AuditoriaManual[]): MechanicalCheck[] {
  if (manuales.length === 0) {
    const nada: MechanicalCheck[] = (
      [
        ["citas_presentes", "Cada afirmación visible declara la cita que la respalda."],
        ["citas_resuelven", "Cada cita resuelve a un archivo real y a una línea existente y no vacía."],
        ["sin_rutas_tecnicas", "El texto visible no filtra rutas técnicas con extensión de fuente."],
        ["mensajes_de_error", "Los literales de la sección de errores aparecen en las fuentes citadas."],
      ] as const
    ).map(([id, description]) => ({
      id,
      description,
      result: "skip" as const,
      detail: "no hay manuales que auditar",
    }));
    return nada;
  }

  const hallazgos = manuales.flatMap((m) => m.hallazgos);
  const sinCita = hallazgos.filter((h) => h.tipo === "sin-cita");
  const malas = hallazgos.filter((h) => h.tipo === "cita-mal-formada");
  const noResuelven = hallazgos.filter((h) => h.tipo === "cita-no-resuelve");
  const rutas = hallazgos.filter((h) => h.tipo === "ruta-tecnica");
  const literales = hallazgos.filter((h) => h.tipo === "mensaje-no-literal");
  const literalesRevisados = manuales.reduce((suma, m) => suma + m.literales, 0);

  const citasPresentes: MechanicalCheck = {
    id: "citas_presentes",
    description: "Cada afirmación visible declara la cita que la respalda.",
    result: sinCita.length === 0 ? "pass" : "fail",
    detail:
      sinCita.length === 0
        ? "todas las afirmaciones declaran cita"
        : `${sinCita.length} afirmación(es) sin cita: ${resumenHallazgos(sinCita)}`,
  };

  const citasResuelven: MechanicalCheck = {
    id: "citas_resuelven",
    description: "Cada cita resuelve a un archivo real y a una línea existente y no vacía.",
    result: malas.length + noResuelven.length === 0 ? "pass" : "fail",
    detail:
      malas.length + noResuelven.length === 0
        ? "todas las citas resuelven"
        : `${malas.length} cita(s) mal formada(s) y ${noResuelven.length} sin resolver: ` +
          resumenHallazgos([...malas, ...noResuelven]),
  };

  const sinRutas: MechanicalCheck = {
    id: "sin_rutas_tecnicas",
    description: "El texto visible no filtra rutas técnicas con extensión de fuente.",
    result: rutas.length === 0 ? "pass" : "fail",
    detail:
      rutas.length === 0
        ? "ninguna ruta técnica en el texto visible"
        : `${rutas.length} ruta(s) técnica(s) filtrada(s): ${resumenHallazgos(rutas)}`,
  };

  const mensajesDeError: MechanicalCheck = {
    id: "mensajes_de_error",
    description: "Los literales de la sección de errores aparecen en las fuentes citadas.",
    result: literales.length > 0 ? "warn" : literalesRevisados > 0 ? "pass" : "skip",
    detail:
      literales.length > 0
        ? `${literales.length} literal(es) sin respaldo: ${resumenHallazgos(literales)}`
        : literalesRevisados > 0
          ? `${literalesRevisados} literal(es) respaldados por las fuentes citadas`
          : "no hay literales de error que revisar",
  };

  return [citasPresentes, citasResuelven, sinRutas, mensajesDeError];
}

/** El peor de los veredictos, o `review` si no hay manuales. */
function veredictoDeCorrida(manuales: readonly AuditoriaManual[]): VeredictoManual {
  if (manuales.length === 0) return "review";
  if (manuales.some((m) => m.veredicto === "block")) return "block";
  if (manuales.some((m) => m.veredicto === "review")) return "review";
  return "approve";
}

/** El motivo de la corrida, en una frase. */
function motivoDeCorrida(
  manuales: readonly AuditoriaManual[],
  veredicto: VeredictoManual,
  manualesDir: string,
): string {
  if (manuales.length === 0) return `no hay manuales que auditar en ${manualesDir}`;
  if (veredicto === "approve") {
    return "todos los manuales aprueban: cada afirmación tiene cita y cada cita resuelve";
  }
  if (veredicto === "review") {
    const enRevision = manuales.filter((m) => m.veredicto === "review").length;
    return `${enRevision} manual(es) en revisión por literales de error sin respaldo`;
  }
  const bloqueados = manuales.filter((m) => m.veredicto === "block").length;
  return `${bloqueados} manual(es) con hallazgos que bloquean`;
}

/**
 * Audita los manuales de un directorio contra el código del repositorio.
 *
 * Nunca lanza por un manual ausente o un directorio que no existe: la ausencia
 * de manuales es un veredicto `review`, no un error, porque el listado existe
 * para que alguien lo lea.
 */
export function auditarManuales(
  paths: RegistryPaths,
  opciones: OpcionesAuditoria = {},
): AuditoriaManuales {
  const manualesDir = opciones.manualesDir ?? MANUALES_POR_DEFECTO;
  const ahora = opciones.ahora ?? new Date();

  const leidos = leerManuales(paths.root, manualesDir);
  const manuales = leidos.map((m) => auditarManual(paths.root, m.relativa, m.texto));
  const veredicto = veredictoDeCorrida(manuales);

  return {
    fecha: ahora.toISOString(),
    manualesDir,
    manuales,
    veredicto,
    motivo: motivoDeCorrida(manuales, veredicto, manualesDir),
    checks: construirChecks(manuales),
    revision: hashState(leidos.map((m) => ({ manual: m.relativa, texto: m.texto }))),
  };
}

/** Marca de cada resultado de check, igual que en el resto del proyecto. */
const MARCAS: Readonly<Record<MechanicalCheck["result"], string>> = {
  pass: "✓",
  fail: "✗",
  warn: "!",
  skip: "·",
};

/**
 * El listado, en texto.
 *
 * Cada manual imprime su veredicto en su propia línea: un listado que solo
 * dijera el veredicto de la corrida dejaría sin saber cuál de todos cayó.
 */
export function renderAuditoria(resultado: AuditoriaManuales): string {
  const lineas: string[] = [
    `Auditoría de manuales — corrida del ${resultado.fecha}`,
    `Directorio: ${resultado.manualesDir}`,
    "",
    "Manuales auditados:",
  ];

  if (resultado.manuales.length === 0) {
    lineas.push("  (ninguno)");
  } else {
    for (const manual of resultado.manuales) {
      const titulo = manual.titulo === null ? "" : ` (${manual.titulo})`;
      lineas.push(`  - ${manual.manual}${titulo} — ${manual.veredicto}`);
      lineas.push(
        `      ${manual.afirmaciones} afirmación(es), ${manual.citas} cita(s), ` +
          `${manual.literales} literal(es) de error`,
      );
      for (const hallazgo of manual.hallazgos) {
        lineas.push(
          `      ${hallazgo.tipo} (línea ${hallazgo.linea}): ${hallazgo.detalle}`,
        );
      }
    }
  }

  lineas.push("", "Checks mecánicos:");
  for (const check of resultado.checks) {
    lineas.push(`  ${MARCAS[check.result]} ${check.id} — ${check.detail ?? check.description}`);
  }

  lineas.push("", `Veredicto de la corrida: ${resultado.veredicto}`);
  return lineas.join("\n") + "\n";
}

/**
 * Construye el recibo de la corrida con el formato vigente.
 *
 * El sujeto es el proceso, no un ticket: este gate no protege ninguna transición
 * de ticket, y `runGate` exige uno como sujeto. La revisión es el hash del corpus
 * auditado, así que un recibo de ayer no se confunde con el de hoy.
 */
export function reciboDeAuditoria(
  resultado: AuditoriaManuales,
  opciones: OpcionesReciboAuditoria = {},
): GateReceipt {
  const proposiciones: EvaluatedProposition[] = resultado.manuales.map((manual) => ({
    id: manual.manual,
    kind: "choice",
    weight: 1,
    value: 1,
    label: `${manual.manual}=${manual.veredicto}`,
    ...(manual.titulo === null ? {} : { description: manual.titulo }),
    inBand: manual.veredicto === "review",
    effect: { outcome: manual.veredicto, reason: manual.motivo },
    reason: manual.motivo,
    verdict: true,
  }));

  const decision: GateDecision = {
    outcome: resultado.veredicto,
    reason: resultado.motivo,
    actor: "engine",
    propositions: proposiciones,
    blocking: resultado.manuales
      .filter((m) => m.veredicto === "block")
      .map((m) => m.manual),
    inBand: resultado.manuales
      .filter((m) => m.veredicto === "review")
      .map((m) => m.manual),
  };

  return buildReceipt({
    id: opciones.id ?? `GR-${resultado.fecha.slice(0, 10).replace(/-/g, "")}-${GATE_MANUALES}`,
    gate: GATE_MANUALES,
    propositions: [],
    policy: DEFAULT_POLICY,
    subject: { type: "process", id: SUJETO_MANUALES, revision: resultado.revision },
    decision,
    state: {
      manualesDir: resultado.manualesDir,
      veredicto: resultado.veredicto,
      manuales: resultado.manuales,
    },
    answers: [],
    mechanicalChecks: resultado.checks,
    decidedAt: resultado.fecha,
  });
}
