/**
 * El parte final de la corrida: qué probar y cómo en cada ticket de la jornada.
 *
 * Junta hechos que ya existen por separado —la jornada, el estado de cada ticket, su contrato de
 * `## Pruebas` y el ciclo de QA cerrado por política— en un solo documento. Armarlo es de solo
 * lectura: no mueve ni cierra ningún ticket. Guardarlo anexa una línea a
 * `.valmen/journeys/handoffs.jsonl` (append-only) y nada más.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { EXIT_INVARIANT, MutationLock, TicketError, parseTicket, parsePolicyConfirmation } from "@valmen/core";

import { contratoDePruebasEscrito } from "./autonomous-run.js";
import { findTicket } from "./discovery.js";
import { readJourneys } from "./journeys.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { scanSecrets } from "./secrets.js";

/** Un ticket que espera las pruebas de una persona, con su contrato leído de `## Pruebas`. */
export interface EntradaDePruebas {
  readonly ticketId: string;
  readonly title: string;
  readonly ruta: string;
  /** Dónde se corre, tal como lo declara el contrato; `null` si no lo dice. */
  readonly directorio: string | null;
  /** Las viñetas con un comando entre comillas invertidas, con su resultado esperado. */
  readonly probar: readonly string[];
  /** Las validaciones manuales del contrato. */
  readonly manuales: readonly string[];
  /** El contrato sigue pendiente o no trae comandos. */
  readonly sinContrato: boolean;
  /** Tipos de hallazgo de secretos que obligaron a omitir el contrato; nunca el valor. */
  readonly omitidoPorSecreto: readonly string[];
}

/** Un ticket de la jornada cuyo último ciclo de QA cerró por política. */
export interface CierreDeJornadaPorPolitica {
  readonly ticketId: string;
  readonly title: string;
  readonly ruta: string;
  readonly autorizacion: string;
  readonly recibo: string;
}

/** Un ticket de la jornada que todavía no se entregó, con su estado (`?` si no se pudo leer). */
export interface TicketSinEntregar {
  readonly ticketId: string;
  readonly estado: string;
}

export interface ParteDeJornada {
  readonly journeyId: string;
  readonly generadoEn: string;
  readonly esperanPruebas: readonly EntradaDePruebas[];
  readonly cerradosPorPolitica: readonly CierreDeJornadaPorPolitica[];
  readonly sinEntregar: readonly TicketSinEntregar[];
}

/** El contenido del parte sin la hora, que es lo que decide si cambió. */
export function huellaDelParte(parte: ParteDeJornada): string {
  const { journeyId, esperanPruebas, cerradosPorPolitica, sinEntregar } = parte;
  const contenido = JSON.stringify({ journeyId, esperanPruebas, cerradosPorPolitica, sinEntregar });
  return `sha256:${createHash("sha256").update(contenido).digest("hex")}`;
}

interface ViñetaDelContrato {
  readonly texto: string;
}

/** Las viñetas de `## Pruebas`: cada una con las líneas sangradas que la continúan unidas. */
function viñetas(seccion: string): ViñetaDelContrato[] {
  const salida: string[] = [];
  for (const linea of seccion.replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const inicio = /^[-*]\s+(.*)$/.exec(linea);
    if (inicio !== null) {
      salida.push((inicio[1] as string).trim());
    } else if (/^\s+\S/.test(linea) && salida.length > 0) {
      salida[salida.length - 1] += ` ${linea.trim()}`;
    }
  }
  return salida.map((texto) => ({ texto }));
}

const ES_DIRECTORIO = /^directorio\s*:\s*(.*)$/i;
const ES_MANUAL = /^(?:validaci[oó]n manual|manual)\b/i;
// «No se corrió la suite completa (`npx vitest run`)» nombra un comando que NO hay que correr.
const ES_NEGACION = /^no\s/i;

function leerContrato(seccion: string): Pick<EntradaDePruebas, "directorio" | "probar" | "manuales"> {
  let directorio: string | null = null;
  const probar: string[] = [];
  const manuales: string[] = [];
  for (const { texto } of viñetas(seccion)) {
    const dir = ES_DIRECTORIO.exec(texto);
    if (dir !== null) {
      directorio ??= (dir[1] as string).trim();
    } else if (ES_MANUAL.test(texto)) {
      manuales.push(texto);
    } else if (!ES_NEGACION.test(texto) && /`[^`\n]+`/.test(texto)) {
      probar.push(texto);
    }
  }
  return { directorio, probar, manuales };
}

function entradaDePruebas(ticketId: string, title: string, ruta: string, texto: string): EntradaDePruebas {
  const seccion = parseTicket(texto).sections["Pruebas"] ?? "";
  const hallazgos = scanSecrets(seccion);
  if (hallazgos.length > 0) {
    return {
      ticketId,
      title,
      ruta,
      directorio: null,
      probar: [],
      manuales: [],
      sinContrato: false,
      omitidoPorSecreto: [...new Set(hallazgos.map((h) => h.kind))],
    };
  }
  const contrato = leerContrato(seccion);
  return {
    ticketId,
    title,
    ruta,
    ...contrato,
    sinContrato: !contratoDePruebasEscrito(texto) || contrato.probar.length === 0,
    omitidoPorSecreto: [],
  };
}

/** Arma el parte de una jornada desde el registro. No escribe nada. */
export function armarParteDeJornada(request: {
  readonly project: AuthorizedProject;
  readonly journeyId: string;
  readonly ahora?: (() => Date) | undefined;
}): ParteDeJornada {
  const jornada = readJourneys(request.project).find((j) => j.journeyId === request.journeyId);
  if (jornada === undefined) {
    throw new TicketError(`La jornada ${request.journeyId} no existe en el registro de jornadas.`, EXIT_INVARIANT);
  }
  const esperanPruebas: EntradaDePruebas[] = [];
  const cerradosPorPolitica: CierreDeJornadaPorPolitica[] = [];
  const sinEntregar: TicketSinEntregar[] = [];

  for (const { ticketId } of [...jornada.tickets].sort((a, b) => a.order - b.order)) {
    const ubicado = findTicket(request.project.paths, ticketId);
    let leido: ReturnType<typeof parseTicket> | undefined;
    try {
      leido = ubicado === undefined ? undefined : parseTicket(ubicado.text);
    } catch {
      leido = undefined;
    }
    if (ubicado === undefined || leido === undefined) {
      sinEntregar.push({ ticketId, estado: "?" });
      continue;
    }
    const estado = String(leido.fields.workflow_status ?? "?");
    const title = String(leido.fields.title ?? ticketId);
    if (estado === "awaiting_user_tests") {
      esperanPruebas.push(entradaDePruebas(ticketId, title, ubicado.relativePath, ubicado.text));
      continue;
    }
    if (estado === "qa_approved" || estado === "closed") {
      const qa = leido.blocks.QA ?? [];
      const ultimo = qa[qa.length - 1];
      const politica = ultimo === undefined ? null : parsePolicyConfirmation(ultimo["po_confirmation"] as string | null);
      if (politica !== null) {
        cerradosPorPolitica.push({
          ticketId,
          title,
          ruta: ubicado.relativePath,
          autorizacion: politica.authorizationId,
          recibo: politica.receipt,
        });
        continue;
      }
    }
    sinEntregar.push({ ticketId, estado });
  }

  return {
    journeyId: request.journeyId,
    generadoEn: (request.ahora?.() ?? new Date()).toISOString(),
    esperanPruebas,
    cerradosPorPolitica,
    sinEntregar,
  };
}

/** Una línea de `.valmen/journeys/handoffs.jsonl`. */
export interface RegistroDeParte {
  readonly kind: "journey-handoff";
  readonly version: 1;
  readonly journeyId: string;
  readonly generadoEn: string;
  readonly huella: string;
  readonly parte: ParteDeJornada;
}

export function handoffsPath(root: string): string {
  return join(root, ".valmen", "journeys", "handoffs.jsonl");
}

/** Lee los partes guardados; una línea ilegible se ignora y no tumba las demás. */
export function leerPartesDeJornada(root: string, journeyId?: string): RegistroDeParte[] {
  const ruta = handoffsPath(root);
  if (!existsSync(ruta)) return [];
  const registros: RegistroDeParte[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor = JSON.parse(linea) as Partial<RegistroDeParte>;
      if (
        valor.kind === "journey-handoff" &&
        valor.version === 1 &&
        typeof valor.journeyId === "string" &&
        typeof valor.huella === "string" &&
        typeof valor.generadoEn === "string" &&
        typeof valor.parte === "object" &&
        valor.parte !== null &&
        (journeyId === undefined || valor.journeyId === journeyId)
      ) {
        registros.push(valor as RegistroDeParte);
      }
    } catch {
      // Una línea truncada no borra las anteriores.
    }
  }
  return registros;
}

/**
 * Guarda el parte si su contenido cambió respecto del último de la jornada. La comparación y el
 * anexo van bajo el lock del registro para que dos ejecuciones no dupliquen la línea.
 */
export function guardarParteDeJornada(request: {
  readonly project: AuthorizedProject;
  readonly parte: ParteDeJornada;
}): { readonly guardado: boolean; readonly huella: string; readonly ruta: string } {
  const { project, parte } = request;
  const huella = huellaDelParte(parte);
  const ruta = handoffsPath(project.root);
  return MutationLock.run(project.root, () => {
    const ultimo = leerPartesDeJornada(project.root, parte.journeyId).at(-1);
    if (ultimo?.huella === huella) return { guardado: false, huella, ruta };
    const registro: RegistroDeParte = {
      kind: "journey-handoff",
      version: 1,
      journeyId: parte.journeyId,
      generadoEn: parte.generadoEn,
      huella,
      parte,
    };
    mkdirSync(dirname(ruta), { recursive: true });
    appendFileSync(ruta, `${JSON.stringify(registro)}\n`, "utf8");
    return { guardado: true, huella, ruta };
  });
}
