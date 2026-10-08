/**
 * El registro de las pasadas del disparador de la jornada.
 *
 * Cada `valmen journey advance` deja un renglón con su hora, su resultado y su detalle, para que
 * Mission Control muestre la última pasada y estime la próxima sin leer el log de launchd. Es un
 * archivo append-only; un renglón truncado no borra los demás.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type AvanceDeFase, type EstadoDeAvance } from "./journey-advance.js";

export type EstadoDePasada = EstadoDeAvance | "error";

const ESTADOS_DE_PASADA: readonly string[] = ["sin-jornada", "despachado", "ya-despachado", "sin-candidato", "error"];

export interface RegistroDePasada {
  readonly kind: "journey-pass";
  readonly version: 1;
  readonly journeyId: string;
  readonly at: string;
  readonly estado: EstadoDePasada;
  readonly ticketId: string | null;
  readonly detalle: string;
  readonly fases?: readonly AvanceDeFase[];
}

export interface ResumenDePasadas {
  readonly ultima: RegistroDePasada | null;
  readonly cadenciaMs: number | null;
  readonly proxima: string | null;
}

/** Cuántas pasadas recientes entran en la mediana de la cadencia. */
const PASADAS_PARA_CADENCIA = 8;

export function pasadasPath(root: string): string {
  return join(root, ".valmen", "journeys", "pasadas.jsonl");
}

/** Anexa una pasada; nunca reescribe las anteriores. */
export function registrarPasada(
  root: string,
  pasada: Omit<RegistroDePasada, "kind" | "version" | "at"> & { readonly at?: string },
): RegistroDePasada {
  if (!ESTADOS_DE_PASADA.includes(pasada.estado)) throw new Error(`Estado de pasada desconocido: ${pasada.estado}.`);
  const { at, ...resto } = pasada;
  const completa: RegistroDePasada = { kind: "journey-pass", version: 1, ...resto, at: at ?? new Date().toISOString() };
  const ruta = pasadasPath(root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(completa)}\n`, "utf8");
  return completa;
}

/** Lee todas las pasadas; un renglón ilegible se ignora. */
export function leerPasadas(root: string): RegistroDePasada[] {
  const ruta = pasadasPath(root);
  if (!existsSync(ruta)) return [];
  const pasadas: RegistroDePasada[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor = JSON.parse(linea) as Partial<RegistroDePasada>;
      if (
        valor.kind === "journey-pass" &&
        valor.version === 1 &&
        typeof valor.journeyId === "string" &&
        typeof valor.at === "string" &&
        Number.isFinite(Date.parse(valor.at)) &&
        ESTADOS_DE_PASADA.includes(String(valor.estado))
      ) {
        pasadas.push(valor as RegistroDePasada);
      }
    } catch {
      // Un renglón truncado no borra los hechos anteriores.
    }
  }
  return pasadas;
}

/**
 * La última pasada de una jornada y la estimación de la siguiente: la última más la mediana de
 * los intervalos entre sus últimas pasadas. Con menos de dos no hay cadencia que estimar.
 */
export function resumenDePasadas(pasadas: readonly RegistroDePasada[], journeyId: string): ResumenDePasadas {
  const horas = pasadas
    .filter((pasada) => pasada.journeyId === journeyId)
    .map((pasada) => ({ pasada, ms: Date.parse(pasada.at) }))
    .sort((a, b) => a.ms - b.ms);
  const ultima = horas.at(-1)?.pasada ?? null;
  const recientes = horas.slice(-PASADAS_PARA_CADENCIA);
  if (ultima === null || recientes.length < 2) return { ultima, cadenciaMs: null, proxima: null };
  const intervalos = recientes.slice(1).map((actual, i) => actual.ms - (recientes[i] as { ms: number }).ms).sort((a, b) => a - b);
  const medio = Math.floor(intervalos.length / 2);
  const cadenciaMs =
    intervalos.length % 2 === 1
      ? (intervalos[medio] as number)
      : ((intervalos[medio - 1] as number) + (intervalos[medio] as number)) / 2;
  if (cadenciaMs <= 0) return { ultima, cadenciaMs: null, proxima: null };
  return { ultima, cadenciaMs, proxima: new Date(Date.parse(ultima.at) + cadenciaMs).toISOString() };
}
