/**
 * Proyección de procesos para la interfaz.
 *
 * `valmen process runs` ya dice qué hay detenido esperando aprobación, y la
 * pantalla no lo mostraba: aprobar un gate de un proceso obligaba a escribir
 * `valmen process approve` en la terminal, que es justo lo que Mission Control
 * existe para evitar.
 *
 * Igual que el resto de la app, esto no tiene lógica de negocio: lee con el mismo
 * motor que el CLI y proyecta. Los destinos legales y las aprobaciones los calcula
 * el motor, no esta capa.
 */
import {
  approveGate,
  gateApproved,
  listRuns,
  loadProcesses,
  readRequiredPhrase,
  readRun,
  waitingRuns,
} from "@valmen/engine";

/** Un paso de un proceso, para pintarlo (R-VIVO-003). */
export interface ProcessStepRow {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  /** El gate que espera, solo en un paso `kind: gate`; si no, `null`. */
  readonly gate: string | null;
}

/** Un parámetro de un proceso, con la descripción que la pantalla muestra en «Pide: …». */
export interface ProcessParamRow {
  readonly name: string;
  readonly required: boolean;
  readonly description: string | null;
  readonly default: string | null;
}

/** Un proceso, para la lista. */
export interface ProcessRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly steps: number;
  readonly params: readonly string[];
  /** Los gates que declara, en orden de aparición. */
  readonly gates: readonly string[];
  /** Cuántas corridas suyas están detenidas. */
  readonly waiting: number;
  /** `null` si el proceso es válido; el error si no lo es. */
  readonly invalid: string | null;
  /** Ruta relativa del archivo, para el enlace. */
  readonly path: string;
  /** Los pasos en orden, con su tipo. Aditivo: `steps` sigue siendo la cuenta. */
  readonly stepList: readonly ProcessStepRow[];
  /** Los parámetros con su descripción. Aditivo: `params` sigue con los nombres. */
  readonly paramList: readonly ProcessParamRow[];
}

/** Una corrida, para la lista. */
export interface RunRow {
  readonly runId: string;
  readonly processId: string;
  readonly status: string;
  readonly pendingStep: string | null;
  readonly reason: string | null;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly steps: readonly {
    readonly id: string;
    readonly status: string;
    readonly at: string;
    /** El comando ya sustituido que corrió el paso. */
    readonly detail: string;
  }[];
  readonly params: Readonly<Record<string, string>>;
  /** El gate del paso donde se detuvo, si ese paso es `kind: gate`. */
  readonly pendingGate: string | null;
  /** La frase exacta que ese gate exige para esta corrida, o `null` si no exige frase. */
  readonly requiredPhrase: string | null;
  /** Quién aprobó ese gate **para esta corrida**, o `null` si nadie todavía. */
  readonly gateApprovedBy: string | null;
}

/** Un gate de proceso, con si está aprobado y por quién. */
export interface GateRow {
  readonly gate: string;
  readonly processId: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly reason: string | null;
  /** `true` si el gate exige frase: entonces solo se aprueba para una corrida detenida. */
  readonly requiresPhrase: boolean;
}

/**
 * La frase de un gate con los parámetros de la corrida, **solo para mostrarla**.
 *
 * Quien valida es `approveGate`, que falla si falta un parámetro; aquí uno que falta deja
 * `{nombre}` a la vista en vez de romper la lista entera.
 */
export function processPhraseFor(
  plantilla: string,
  params: Readonly<Record<string, string>>,
): string {
  return plantilla.replace(/\{(\w+)\}/g, (entera, nombre: string) =>
    Object.hasOwn(params, nombre) ? (params[nombre] as string) : entera,
  );
}

/** Lista los procesos del proyecto, con lo que hace falta para operarlos. */
export function listProcessRows(root: string): ProcessRow[] {
  const corridas = listRuns(root);

  return loadProcesses(root)
    .map((cargado): ProcessRow => {
      const { definition } = cargado;
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        steps: definition.steps.length,
        params: definition.params.map((param) =>
          param.required ? `${param.name}*` : param.name,
        ),
        // Los gates que el proceso usa, sin repetir: uno puede aprobarse una vez y
        // usarse en dos pasos. Solo los de tipo `gate`: `target` lo llevan también
        // los pasos que invocan otro proceso, y contarlos como gates inventaría
        // aprobaciones que nadie tiene que dar.
        gates: [
          ...new Set(
            definition.steps.flatMap((paso) =>
              paso.kind === "gate" && paso.target !== null ? [paso.target] : [],
            ),
          ),
        ],
        waiting: corridas.filter(
          (corrida) => corrida.processId === definition.id && corrida.status === "waiting",
        ).length,
        invalid: cargado.invalid,
        path: cargado.path,
        stepList:
          cargado.invalid !== null
            ? []
            : definition.steps.map((paso) => ({
                id: paso.id,
                title: paso.title,
                kind: paso.kind,
                gate: paso.kind === "gate" ? paso.target : null,
              })),
        paramList:
          cargado.invalid !== null
            ? []
            : definition.params.map((param) => ({
                name: param.name,
                required: param.required,
                description: param.description,
                default: param.default,
              })),
      };
    })
    .sort((a, b) => {
      // Lo que tiene algo que hacer va primero: una corrida detenida es trabajo
      // esperando a una persona.
      if (a.waiting > 0 !== b.waiting > 0) return a.waiting > 0 ? -1 : 1;
      if ((a.invalid === null) !== (b.invalid === null)) return a.invalid === null ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
}

/** Las corridas, con las detenidas primero. */
export function listRunRows(root: string): RunRow[] {
  // El gate de cada paso, por proceso: la corrida guarda el id del paso, no el gate.
  const gatesPorPaso = new Map<string, string>();
  for (const cargado of loadProcesses(root)) {
    if (cargado.invalid !== null) continue;
    for (const paso of cargado.definition.steps) {
      if (paso.kind === "gate" && paso.target !== null) {
        gatesPorPaso.set(`${cargado.definition.id}/${paso.id}`, paso.target);
      }
    }
  }
  return [...listRuns(root)]
    .sort((a, b) => {
      if ((a.status === "waiting") !== (b.status === "waiting")) {
        return a.status === "waiting" ? -1 : 1;
      }
      return a.updatedAt < b.updatedAt ? 1 : -1;
    })
    .map((corrida) => {
      const pendingGate =
        corrida.pendingStep === null
          ? null
          : (gatesPorPaso.get(`${corrida.processId}/${corrida.pendingStep}`) ?? null);
      const frase = pendingGate === null ? null : readRequiredPhrase(root, pendingGate);
      return {
        runId: corrida.runId,
        processId: corrida.processId,
        status: corrida.status,
        pendingStep: corrida.pendingStep,
        reason: corrida.reason,
        startedAt: corrida.startedAt,
        updatedAt: corrida.updatedAt,
        steps: corrida.steps.map((paso) => ({
          id: paso.id,
          status: paso.status,
          at: paso.at,
          detail: paso.detail,
        })),
        params: corrida.params,
        pendingGate,
        requiredPhrase: frase === null ? null : processPhraseFor(frase, corrida.params),
        gateApprovedBy:
          pendingGate === null || corrida.status !== "waiting"
            ? null
            : (gateApproved(root, pendingGate, {
                runId: corrida.runId,
                params: corrida.params,
              })?.actor ?? null),
      };
    });
}

/**
 * Los gates que los procesos declaran, con su aprobación.
 *
 * Se listan **todos** los que aparecen en algún proceso, no solo los aprobados: un
 * gate sin aprobar es lo que hay que ver, y una lista que solo mostrara lo hecho
 * escondería justo lo pendiente.
 */
export function listGateRows(root: string): GateRow[] {
  const filas: GateRow[] = [];
  for (const cargado of loadProcesses(root)) {
    if (cargado.invalid !== null) continue;
    for (const paso of cargado.definition.steps) {
      if (paso.kind !== "gate" || paso.target === null) continue;
      if (filas.some((fila) => fila.gate === paso.target)) continue;
      const aprobacion = gateApproved(root, paso.target);
      filas.push({
        gate: paso.target,
        processId: cargado.definition.id,
        approvedBy: aprobacion?.actor ?? null,
        approvedAt: aprobacion?.at ?? null,
        reason: aprobacion?.reason ?? null,
        requiresPhrase: readRequiredPhrase(root, paso.target) !== null,
      });
    }
  }
  return filas.sort((a, b) => a.gate.localeCompare(b.gate));
}

/** El resumen, para la cabecera de la vista. */
export interface ProcessSummary {
  readonly processes: number;
  readonly invalid: number;
  readonly waiting: number;
  readonly gatesPending: number;
  readonly runs: number;
}

/** Calcula el resumen a partir de las filas. */
export function summarizeProcesses(
  procesos: readonly ProcessRow[],
  corridas: readonly RunRow[],
  gates: readonly GateRow[],
): ProcessSummary {
  return {
    processes: procesos.length,
    invalid: procesos.filter((proceso) => proceso.invalid !== null).length,
    waiting: corridas.filter((corrida) => corrida.status === "waiting").length,
    gatesPending: gates.filter((gate) => gate.approvedBy === null).length,
    runs: corridas.length,
  };
}

/**
 * Aprueba un gate desde la pantalla.
 *
 * Se reexporta el del motor y no se reimplementa: aprobar sin responsable no es
 * auditable, y esa regla vive en un solo sitio o se pierde.
 */
export { approveGate, readRun, waitingRuns };
