/**
 * Proyección de features para la interfaz.
 *
 * Igual que la de tickets, esto no tiene lógica de negocio: lee el registro con
 * el mismo motor que el CLI —`listFeatures` y `readSpecs`— y proyecta. No calcula
 * estados, no valida reglas y no muta nada.
 *
 * Lo que sí hace, y es lo que distingue esta pantalla de una lista de carpetas,
 * es **poner el hueco a la vista**. Una descomposición que no cubre un requisito
 * no se esconde detrás de un «inválido»: se muestran los requisitos sin cubrir
 * con su enunciado, y si un ticket del grafo todavía no existe en el registro se
 * dice cuál. El valor de la vista está en ver eso antes de empezar a trabajar.
 *
 * Ver docs/06-CONTROL-APP.md §4.2bis.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type FeatureDecomposition,
  type FeatureRequirement,
  decompositionTickets,
  dependencyCycles,
  nextFeatureStates,
  parseTicketsYaml,
  previewTicketsYaml,
} from "@valmen/core";
import {
  type FeatureRow,
  type LocatedRequirement,
  featuresDir,
  listFeatures,
  readFeature,
  choosePaths,
  listTickets,
  readSpecs,
  ticketsPath,
} from "@valmen/engine";

/** Una fila de la lista de features. */
export interface FeatureListRow {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly created: string;
  readonly updated: string;
  readonly hasSpec: boolean;
  readonly hasDesign: boolean;
  readonly hasDecomposition: boolean;
  readonly hasVerify: boolean;
  /** Cuántos requisitos declara la spec, si se pudo leer. */
  readonly requirements: number;
  /** Cuántos tickets declara el grafo, si hay descomposición. */
  readonly tickets: number;
  /** Requisitos sin cubrir, más los huecos declarados. */
  readonly gaps: number;
  /**
   * Cuántos de sus tickets están cerrados, de los que declara el grafo.
   *
   * Es lo que convierte la lista de features en una vista de conjunto: sin esto se
   * ve que una feature está «descompuesta» y nada más, y la pregunta que se hace
   * de verdad —«¿por dónde va?»— obliga a abrir los tickets uno a uno. Los
   * identificadores del grafo se cruzan con el registro, que es la fuente de
   * verdad del estado.
   */
  readonly closedTickets: number;
  /** `null` si la feature es válida; el mensaje si no lo es. */
  readonly invalid: string | null;
  /** Ruta relativa del brief, para el enlace al archivo. */
  readonly path: string;
}

/** Resumen del registro de features, para la cabecera. */
export interface FeatureSummary {
  readonly total: number;
  readonly byState: Readonly<Record<string, number>>;
  readonly invalid: number;
  readonly withGaps: number;
  readonly decomposed: number;
}

/** Un requisito, con quién lo cubre. */
export interface RequirementDto {
  readonly id: string;
  readonly statement: string;
  readonly domain: string;
  /** Los tickets que el grafo dice que lo cubren. Vacío si no lo cubre ninguno. */
  readonly coveredBy: readonly string[];
}

/** Un sprint, con sus tickets y cuáles existen ya en el registro. */
export interface SprintDto {
  readonly id: string;
  readonly goal: string;
  readonly tickets: readonly {
    readonly id: string;
    readonly title: string;
    readonly dependsOn: readonly string[];
    /** `true` si el ticket ya está escrito en el registro. */
    readonly exists: boolean;
    /** Su estado, si existe. */
    readonly state: string | null;
  }[];
}

/** El detalle de una feature. */
export interface FeatureDetail extends FeatureListRow {
  /** El brief completo, en Markdown. */
  readonly brief: string;
  readonly specs: readonly {
    readonly domain: string;
    readonly source: string;
    readonly text: string;
    readonly requirements: readonly RequirementDto[];
  }[];
  readonly design: string | null;
  readonly ticketsYaml: string | null;
  /** El grafo, o `null` si no hay o no se puede leer. */
  readonly decomposition: {
    readonly origin: { readonly provider: string; readonly model: string } | null;
    readonly sprints: readonly SprintDto[];
    readonly requirements: readonly RequirementDto[];
    readonly gaps: readonly {
      readonly requirement: string;
      readonly statement: string;
    }[];
  } | null;
  /** El error del `tickets.yaml`, si lo tiene. */
  readonly decompositionError: string | null;
  /** Ciclos del grafo de dependencias. Vacío si no hay. */
  readonly cycles: readonly (readonly string[])[];
  /**
   * Los estados a los que la feature puede ir **hoy**, según la tabla.
   *
   * Los calcula el servidor porque la máquina de estados es del contrato: si la
   * interfaz los dedujera por su cuenta, un cambio en la tabla dejaría a la
   * pantalla ofreciendo movimientos ilegales.
   */
  readonly transitions: readonly string[];
}

/** Lee un archivo de texto, o `null` si no está. */
function leerSiExiste(...partes: string[]): string | null {
  try {
    return readFileSync(join(...partes), "utf8");
  } catch {
    return null;
  }
}

/** `readdirSync` que devuelve una lista vacía en vez de lanzar. */
function leerDirectorio(ruta: string): string[] {
  try {
    return readdirSync(ruta);
  } catch {
    return [];
  }
}

/** Los requisitos de una feature, con las specs de las que salieron. */
function requisitosDe(
  root: string,
  slug: string,
): {
  specs: ReturnType<typeof readSpecs>;
  requirements: LocatedRequirement[];
} {
  const specs = readSpecs(
    join(featuresDir(root), slug, "spec"),
    `.valmen/features/${slug}`,
  );
  return { specs, requirements: specs.flatMap((spec) => spec.requirements) };
}

/** Quién generó el grafo, si el YAML lo declara. */
function origenDe(texto: string): { provider: string; model: string } | null {
  const bloque = /^generated_by:\n((?:[ \t]+.*\n?)*)/m.exec(texto)?.[1];
  if (bloque === undefined) return null;
  const provider = /^[ \t]+provider:[ \t]*(.+)$/m.exec(bloque)?.[1]?.trim();
  const model = /^[ \t]+model:[ \t]*(.+)$/m.exec(bloque)?.[1]?.trim();
  if (provider === undefined || model === undefined) return null;
  return { provider, model };
}

/**
 * Los tickets que ya existen en el registro, con su estado.
 *
 * Es lo que convierte el grafo en seguimiento: un ticket del sprint que todavía
 * no está escrito se ve distinto de uno que ya está en curso. Se lee del registro
 * real y no de `tickets.yaml`, porque el archivo dice lo que se planeó y el
 * registro lo que hay.
 */
function ticketsExistentes(root: string): Map<string, string> {
  const encontrados = new Map<string, string>();
  // La disposición la decide el motor: un proyecto adoptado tiene el registro en
  // `docs/tickets`, y con `tickets/` fijo el grafo saldría entero como «no
  // escrito», que es la peor forma de mentir en una pantalla de seguimiento.
  const base = ticketsPath(choosePaths(root));
  for (const anio of leerDirectorio(base)) {
    for (const id of leerDirectorio(join(base, anio))) {
      const texto = leerSiExiste(base, anio, id, "ticket.md");
      if (texto === null) continue;
      const estado = /^workflow_status:[ \t]*(.+)$/m.exec(texto)?.[1]?.trim();
      encontrados.set(id, estado ?? "?");
    }
  }
  return encontrados;
}

/** Una fila a partir de la del motor, completando lo que la lista necesita. */
function toRow(
  root: string,
  fila: FeatureRow,
  estadoDeTickets: ReadonlyMap<string, string>,
): FeatureListRow {
  let requirements = 0;
  let tickets = 0;
  let gaps = 0;
  let cerrados = 0;

  if (fila.invalid === null) {
    try {
      const { requirements: reqs } = requisitosDe(root, fila.id);
      requirements = reqs.length;
      const yaml = leerSiExiste(featuresDir(root), fila.id, "tickets.yaml");
      if (yaml !== null) {
        const vista = previewTicketsYaml(yaml, reqs);
        if (vista !== null) {
          const delGrafo = decompositionTickets(vista.document.decomposition);
          tickets = delGrafo.length;
          gaps = vista.gaps.length + vista.document.decomposition.gaps.length;
          // Se cruza con el registro: el grafo declara qué tickets deberían
          // existir, y el registro dice en qué estado está cada uno. Un
          // identificador del grafo sin ticket en el registro no cuenta como
          // cerrado —no existe— y por eso no se cuenta tampoco como abierto.
          cerrados = delGrafo.filter(
            (ticket) => estadoDeTickets.get(ticket.id) === "closed",
          ).length;
        }
      }
    } catch {
      // Una spec que no parsea no impide listar: el conteo queda en cero y el
      // error se ve al abrir la feature, que es donde se puede leer entero.
    }
  }

  return {
    id: fila.id,
    title: fila.title,
    state: fila.state,
    created: fila.created,
    updated: fila.updated,
    hasSpec: fila.artifacts.hasSpec,
    hasDesign: fila.artifacts.hasDesign,
    hasDecomposition: fila.artifacts.hasDecomposition,
    hasVerify: fila.artifacts.hasVerify,
    requirements,
    tickets,
    gaps,
    closedTickets: cerrados,
    invalid: fila.invalid,
    path: `.valmen/features/${fila.id}/feature.md`,
  };
}

/** Lista las features del proyecto, con lo que hace falta para priorizar. */
/**
 * El estado de cada ticket del registro, por identificador.
 *
 * `listTickets` recorre y parsea todos los tickets del proyecto. Se pide una vez y
 * se reparte: llamarlo dentro del bucle de features lo repetiría por cada una.
 */
function estadoDeTickets(root: string): ReadonlyMap<string, string> {
  return new Map(
    listTickets({ root, ticketsDir: choosePaths(root).ticketsDir }).map((t) => [
      t.id,
      t.workflowStatus,
    ]),
  );
}

export function listFeatureRows(root: string): FeatureListRow[] {
  const estado = estadoDeTickets(root);
  return listFeatures(root).map((fila) => toRow(root, fila, estado));
}

/** Resumen del registro de features. */
export function summarizeFeatures(rows: readonly FeatureListRow[]): FeatureSummary {
  const byState: Record<string, number> = {};
  for (const row of rows) byState[row.state] = (byState[row.state] ?? 0) + 1;
  return {
    total: rows.length,
    byState,
    invalid: rows.filter((row) => row.invalid !== null).length,
    withGaps: rows.filter((row) => row.gaps > 0).length,
    decomposed: rows.filter((row) => row.hasDecomposition).length,
  };
}

/**
 * Lee el detalle de una feature. Devuelve `null` si no existe.
 *
 * Una feature inválida se devuelve igual, con su error: es lo que hay que ver
 * para arreglarla.
 */
export function readFeatureDetail(root: string, slug: string): FeatureDetail | null {
  const leida = readFeature(root, slug);
  if (leida === null) return null;

  const carpeta = join(featuresDir(root), slug);
  const base = toRow(root, leida.row, estadoDeTickets(root));

  const { specs, requirements } = requisitosDe(root, slug);
  const design = leerSiExiste(carpeta, "design.md");
  const ticketsYaml = leerSiExiste(carpeta, "tickets.yaml");

  let decomposition: FeatureDetail["decomposition"] = null;
  let decompositionError: string | null = null;
  let cycles: readonly (readonly string[])[] = [];

  if (ticketsYaml !== null) {
    const vista = previewTicketsYaml(ticketsYaml, requirements);
    if (vista === null) {
      // Se usa el parser estricto solo para quedarse con su mensaje: la pantalla
      // tiene que decir qué línea y qué campo, no un «no se pudo interpretar».
      try {
        parseTicketsYaml(ticketsYaml, requirements);
        decompositionError = "El tickets.yaml no se pudo interpretar.";
      } catch (caught) {
        decompositionError = caught instanceof Error ? caught.message : String(caught);
      }
    } else {
      const existentes = ticketsExistentes(root);
      const porRequisito = new Map(
        vista.document.decomposition.coverage.map((entrada) => [
          entrada.requirement,
          entrada.coveredBy,
        ]),
      );

      decomposition = {
        origin: origenDe(ticketsYaml),
        sprints: vista.document.decomposition.sprints.map((sprint) => ({
          id: sprint.id,
          goal: sprint.goal,
          tickets: sprint.tickets.map((ticket) => {
            const id = typeof ticket === "string" ? ticket : ticket.id;
            return {
              id,
              title: typeof ticket === "string" ? "" : (ticket.title ?? ""),
              dependsOn: typeof ticket === "string" ? [] : [...(ticket.dependsOn ?? [])],
              exists: existentes.has(id),
              state: existentes.get(id) ?? null,
            };
          }),
        })),
        requirements: requirements.map((requisito) => ({
          id: requisito.id,
          statement: requisito.statement,
          domain: requisito.domain,
          coveredBy: porRequisito.get(requisito.id) ?? [],
        })),
        gaps: [
          ...vista.gaps.map((hueco) => ({
            requirement: hueco.requirement,
            statement: hueco.statement,
          })),
          ...vista.document.decomposition.gaps.map((hueco) => ({
            requirement: "",
            statement: hueco,
          })),
        ],
      };

      cycles = dependencyCycles(vista.document.decomposition);
    }
  }

  const cubre = new Map(decomposition?.requirements.map((r) => [r.id, r.coveredBy]) ?? []);

  return {
    ...base,
    brief: leida.text,
    specs: specs.map((spec) => ({
      domain: spec.domain,
      source: spec.source,
      text: spec.text,
      requirements: spec.requirements.map((requisito) => ({
        id: requisito.id,
        statement: requisito.statement,
        domain: requisito.domain,
        coveredBy: cubre.get(requisito.id) ?? [],
      })),
    })),
    design,
    ticketsYaml,
    decomposition,
    decompositionError,
    cycles,
    // De `blocked` se sale a cualquier estado no terminal, y eso incluye volver al
    // que tenía: la tabla no guarda de dónde se entró, así que se ofrecen todos.
    transitions: nextFeatureStates(leida.row.state),
  };
}

/**
 * Los requisitos de una feature, para la compuerta.
 *
 * Se expone porque el servidor necesita exactamente los mismos que usó la
 * descomposición: si la pantalla calculara los suyos, un cambio en cómo se leen
 * las specs haría que el botón y el comando discreparan.
 */
export function requirementsOf(root: string, slug: string): readonly FeatureRequirement[] {
  return requisitosDe(root, slug).requirements;
}

/** La descomposición de una feature, para quien ya la tenga leída. */
export type { FeatureDecomposition };
