/**
 * El estado de una corrida de proceso.
 *
 * Existe por una razón concreta: **un proceso puede detenerse a mitad y
 * retomarse**. Cuando un paso es un gate humano —«aprobación final del PO»—, el
 * proceso no puede seguir solo: espera. Y al retomarlo no puede volver a ejecutar
 * lo que ya hizo, porque `git tag` dos veces no es idempotente y publicar dos
 * veces es peor.
 *
 * De ahí las tres decisiones de este archivo:
 *
 * 1. **El estado vive en disco**, en `.valmen/processes/runs/<id>.json`. Un
 *    proceso detenido esperando a una persona sobrevive a que se cierre la
 *    terminal, se reinicie la máquina o pasen dos días.
 * 2. **Se guarda el índice del paso pendiente**, no solo «en qué paso iba». Al
 *    retomar se sigue **desde ahí**: los anteriores no se repiten y consta cuáles
 *    fueron.
 * 3. **Cada corrida tiene identificador propio.** Dos procesos distintos pueden
 *    estar detenidos a la vez, y dos corridas del mismo proceso no se pisan.
 *
 * Lo que **no** guarda: la salida de los pasos. Un archivo de estado con toda la
 * salida de un despliegue crecería sin límite y acabaría siendo un registro
 * paralelo del que ya existe. Se guarda el veredicto —paso, estado, cuándo— y la
 * salida se ve mientras corre.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { EXIT_HISTORY, EXIT_SCHEMA, atomicWrite, fail } from "@valmen/core";

/** En qué punto está una corrida. */
export const RUN_STATUSES = [
  /** Terminó todos sus pasos. */
  "completed",
  /** Se detuvo en un gate y espera a una persona. */
  "waiting",
  /** Un paso falló y el proceso se detuvo. */
  "failed",
  /** Alguien lo abandonó: no se retoma. */
  "abandoned",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

/** El estado de un paso, ya resuelto. */
export interface RunStepState {
  readonly id: string;
  readonly status: "ok" | "failed" | "skipped";
  /** Cuándo terminó, en ISO. */
  readonly at: string;
  /** El comando ya sustituido, para poder auditar qué corrió. */
  readonly detail: string;
}

/** Una corrida de un proceso. */
export interface ProcessRunState {
  /** Identificador de la corrida: `<proceso>-<marca de tiempo>`. */
  readonly runId: string;
  readonly processId: string;
  /** Los parámetros ya resueltos, para poder retomar con los mismos. */
  readonly params: Readonly<Record<string, string>>;
  readonly status: RunStatus;
  /** El identificador del paso donde se detuvo, si se detuvo. */
  readonly pendingStep: string | null;
  readonly steps: readonly RunStepState[];
  readonly startedAt: string;
  readonly updatedAt: string;
  /** Por qué se detuvo, para quien lo mire después. */
  readonly reason: string | null;
}

/** Dónde viven las corridas de un proyecto. */
export function runsDir(root: string): string {
  return join(root, ".valmen", "processes", "runs");
}

/** La ruta del estado de una corrida. */
export function runPath(root: string, runId: string): string {
  return join(runsDir(root), `${runId}.json`);
}

/**
 * Guarda el estado de una corrida.
 *
 * La raíz se pasa explícita, y no viaja dentro del estado: un estado copiado a
 * otra máquina con una ruta absoluta dentro apuntaría a un directorio que no
 * existe. Quien ejecuta sabe dónde está el proyecto; el archivo no tiene por qué.
 */
export function writeRun(root: string, state: ProcessRunState): string {
  const ruta = runPath(root, state.runId);
  mkdirSync(runsDir(root), { recursive: true });
  atomicWrite(ruta, `${JSON.stringify(state, null, 2)}\n`);
  return ruta;
}

/** Lee una corrida. Devuelve `null` si no existe el archivo. */
export function readRun(root: string, runId: string): ProcessRunState | null {
  try {
    const texto = readFileSync(runPath(root, runId), "utf8");
    return JSON.parse(texto) as ProcessRunState;
  } catch {
    return null;
  }
}

/** Todas las corridas del proyecto, de la más reciente a la más antigua. */
export function listRuns(root: string): ProcessRunState[] {
  let nombres: string[];
  try {
    nombres = readdirSync(runsDir(root));
  } catch {
    return [];
  }
  return nombres
    .filter((nombre) => nombre.endsWith(".json"))
    .map((nombre) => readRun(root, nombre.replace(/\.json$/, "")))
    .filter((corrida): corrida is ProcessRunState => corrida !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** Las corridas detenidas esperando a una persona. */
export function waitingRuns(root: string): ProcessRunState[] {
  return listRuns(root).filter((corrida) => corrida.status === "waiting");
}

/** La corrida detenida de un proceso, si la hay. */
export function waitingRunOf(root: string, processId: string): ProcessRunState | null {
  return waitingRuns(root).find((corrida) => corrida.processId === processId) ?? null;
}

/** Marca una corrida como abandonada. Deja de poder retomarse. */
export function abandonRun(root: string, runId: string): ProcessRunState {
  const corrida = readRun(root, runId);
  if (corrida === null) {
    fail(`No existe la corrida "${runId}".`, EXIT_HISTORY);
  }
  const abandonada: ProcessRunState = {
    ...corrida,
    status: "abandoned",
    updatedAt: new Date().toISOString(),
    reason: "Abandonada a mano.",
  };
  writeRun(root, abandonada);
  return abandonada;
}

/** Borra el estado de una corrida, cuando ya no interesa. */
export function forgetRun(root: string, runId: string): void {
  try {
    rmSync(runPath(root, runId));
  } catch {
    // Un estado que no está no es un error: el objetivo era que no estuviera.
  }
}

/** Un identificador de corrida: el proceso y el instante, sin dos puntos. */
export function newRunId(processId: string, ahora: Date = new Date()): string {
  return `${processId}-${ahora.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "")}`;
}

/** El resumen de una corrida, para imprimirlo. */
export function renderRun(state: ProcessRunState): string {
  const lineas = [
    `Corrida ${state.runId}`,
    `  proceso:  ${state.processId}`,
    `  estado:   ${state.status}`,
    `  empezada: ${state.startedAt} · actualizada: ${state.updatedAt}`,
  ];
  if (state.pendingStep !== null) {
    lineas.push(`  esperando en: ${state.pendingStep}`);
  }
  if (state.reason !== null) {
    lineas.push(`  motivo: ${state.reason}`);
  }
  if (Object.keys(state.params).length > 0) {
    lineas.push(
      `  parámetros: ${Object.entries(state.params)
        .map(([clave, valor]) => `${clave}=${valor}`)
        .join(" ")}`,
    );
  }
  if (state.steps.length > 0) {
    lineas.push("  pasos:");
    for (const paso of state.steps) {
      const marca = paso.status === "ok" ? "✓" : paso.status === "failed" ? "✗" : "·";
      lineas.push(`    ${marca} ${paso.id}`);
    }
  }
  return lineas.join("\n") + "\n";
}

// ── Las aprobaciones de un gate ─────────────────────────────────────────────

/**
 * Una aprobación humana de un gate de proceso.
 *
 * Un gate de un proceso no es el gate de un ticket: aquel evalúa proposiciones
 * sobre un artefacto y se decide con umbrales; este solo pregunta «¿puede seguir
 * el proceso?», y la respuesta es de una persona. Por eso vive aparte del registro
 * de recibos, que guarda veredictos con su evidencia.
 *
 * Lo que sí comparte con aquel: **queda escrito quién y cuándo**. Un gate que se
 * aprueba sin dejar rastro no es un gate, es un `continue`.
 */
export interface GateApproval {
  readonly gate: string;
  readonly actor: string;
  readonly reason: string;
  readonly at: string;
}

/** Dónde viven las aprobaciones. */
function approvalsPath(root: string): string {
  return join(root, ".valmen", "gates", "approvals.json");
}

/** Las aprobaciones registradas. */
export function readApprovals(root: string): GateApproval[] {
  const texto = readIfExists(approvalsPath(root));
  if (texto === null) return [];
  try {
    const datos = JSON.parse(texto) as unknown;
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (entrada): entrada is GateApproval =>
        typeof entrada === "object" &&
        entrada !== null &&
        typeof (entrada as GateApproval).gate === "string",
    );
  } catch {
    // Un registro de aprobaciones ilegible se trata como vacío: es lo seguro —un
    // gate sin aprobación legible no está aprobado— y el archivo se reescribe al
    // siguiente aprobado.
    return [];
  }
}

/**
 * Si un gate está aprobado, y por quién.
 *
 * Devuelve `null` si no lo está, que es lo que el motor necesita para detenerse.
 * La última aprobación manda: si alguien aprobó, el proceso corrió, y el gate se
 * aprobó otra vez para la siguiente corrida, la que vale es la nueva.
 */
export function gateApproved(root: string, gate: string): GateApproval | null {
  const aprobaciones = readApprovals(root).filter((entrada) => entrada.gate === gate);
  return aprobaciones.length === 0
    ? null
    : (aprobaciones[aprobaciones.length - 1] as GateApproval);
}

/**
 * Registra la aprobación de un gate.
 *
 * El responsable es obligatorio: aprobar sin nombre no es auditable, y es la misma
 * regla que el harness aplica a las decisiones de un gate de ticket.
 */
export function approveGate(
  root: string,
  gate: string,
  actor: string,
  reason: string,
  ahora: Date = new Date(),
): GateApproval {
  if (actor.trim() === "") {
    fail("Aprobar un gate necesita un responsable: falta --actor.", EXIT_SCHEMA);
  }
  const aprobacion: GateApproval = {
    gate,
    actor: actor.trim(),
    reason: reason.trim(),
    at: ahora.toISOString(),
  };
  const todas = [...readApprovals(root), aprobacion];
  mkdirSync(join(root, ".valmen", "gates"), { recursive: true });
  atomicWrite(approvalsPath(root), `${JSON.stringify(todas, null, 2)}\n`);
  return aprobacion;
}

/** Lee un archivo, o `null` si no está. */
function readIfExists(ruta: string): string | null {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return null;
  }
}
