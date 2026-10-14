/** Proyección de solo lectura del catálogo local para Mission Control. */
import { basename, resolve } from "node:path";
import { readSeleccionDePerfil, readString } from "@valmen/adapter";
import {
  currentReceipts,
  readAllReceipts,
  usageReport,
  waitingRuns,
  type AuthorizedProject,
  type AuthorizedProjectCatalog,
  type UsageReport,
} from "@valmen/engine";
import { leerAgentesDeCorrida, type AgenteDeCorrida } from "./agentes.js";
import { readConfig } from "./config.js";
import { pendingCorrections } from "./gates.js";
import { leerInicio } from "./inicio.js";

export interface PortfolioRow {
  readonly projectId: string;
  readonly name: string;
  readonly root: string;
  readonly current: boolean;
  readonly available: boolean;
  readonly reason: string | null;
  /** Señales independientes: no se deducen de uso ni de coste. */
  readonly sources: {
    readonly machine: {
      readonly label: string;
      readonly available: boolean;
      readonly reason: string | null;
    };
    readonly registry: {
      readonly label: "Registro local";
      readonly available: boolean;
      readonly reason: string | null;
    };
  };
  readonly gatesPending: number | null;
  readonly correctionsPending: number | null;
  readonly waiting: number | null;
  readonly usage: UsageReport | null;
  /** Lo que espera una decisión de la persona: la misma cuenta que Inicio. */
  readonly decisionsPending: number | null;
  /** Subagentes vivos (trabajando o esperando) de la sesión de Claude Code de la raíz. */
  readonly agentsWorking: number | null;
  /** El perfil de modelos elegido para el proyecto; `null` sin elección o ilegible. */
  readonly profile: string | null;
  readonly profileError: string | null;
}

/** De dónde se leen las sesiones de Claude Code y con qué reloj. */
export interface PortfolioOptions {
  readonly home?: string;
  readonly ahora?: number;
}

/** El mismo filtro que `agentesVivos` de la interfaz: no la principal, y vivo. */
export function portfolioLiveAgents(agentes: readonly AgenteDeCorrida[]): number {
  return agentes.filter(
    (agente) =>
      agente.principal !== true &&
      (agente.estado === "trabajando" || agente.estado === "esperando"),
  ).length;
}

/** Mes calendario local; el consumo compara fechas inclusivas, igual que el CLI. */
export function portfolioRange(
  range: { readonly desde?: string; readonly hasta?: string } = {},
  now = new Date(),
): { desde: string; hasta: string } {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    desde: range.desde ?? `${month}-01`,
    hasta:
      range.hasta ??
      `${month}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`,
  };
}

/** Cada raíz conserva sus propios recibos, corridas y layout del registro. */
export function listPortfolioRows(
  catalog: AuthorizedProjectCatalog,
  currentRoot: string,
  range: { readonly desde?: string; readonly hasta?: string } = {},
  options: PortfolioOptions = {},
): PortfolioRow[] {
  const dates = portfolioRange(range);
  return catalog.projects.map((project): PortfolioRow => {
    const unavailable: PortfolioRow = {
      projectId: project.projectId,
      name: basename(project.root),
      root: project.root,
      current: resolve(project.root) === resolve(currentRoot),
      available: false,
      reason: project.reason,
      sources: {
        machine: { label: project.machineId, available: false, reason: project.reason },
        registry: {
          label: "Registro local",
          available: false,
          reason: "No disponible porque la máquina no pudo validar el binding.",
        },
      },
      gatesPending: null,
      correctionsPending: null,
      waiting: null,
      usage: null,
      decisionsPending: null,
      agentsWorking: null,
      profile: null,
      profileError: null,
    };
    if (!project.available) return unavailable;
    try {
      const receipts = readAllReceipts(project.paths);
      const tickets = new Set(
        receipts
          .filter((receipt) => receipt.gate !== "(ilegible)")
          .map((receipt) => receipt.subject.id),
      );
      return {
        ...unavailable,
        name: readString(readConfig(project.root), "name", basename(project.root)),
        available: true,
        reason: null,
        sources: {
          machine: { label: project.machineId, available: true, reason: null },
          registry: { label: "Registro local", available: true, reason: null },
        },
        // `currentReceipts` colapsa por corrida —id y sujeto—, así que los
        // recibos viejos que comparten identificador entre tickets no se mezclan
        // ni se pierden.
        gatesPending: currentReceipts(receipts).filter(
          (receipt) => receipt.escalatedTo === "human" && receipt.humanDecision === null,
        ).length,
        correctionsPending: [...tickets].reduce(
          (total, ticket) => total + pendingCorrections(project.paths, ticket).length,
          0,
        ),
        waiting: waitingRuns(project.root).length,
        usage: usageReport(project.paths, dates),
        decisionsPending: leerInicio(project.paths).pendientes.length,
        ...portfolioExtras(project, options),
      };
    } catch {
      return {
        ...unavailable,
        reason: `No se pudieron leer los datos del proyecto "${project.projectId}".`,
        sources: {
          machine: { label: project.machineId, available: true, reason: null },
          registry: {
            label: "Registro local",
            available: false,
            reason: `No se pudieron leer los datos del proyecto "${project.projectId}".`,
          },
        },
      };
    }
  });
}

/**
 * Agentes y perfil: cada uno en su propio `try`, porque una sesión o un `profiles.yaml`
 * ilegibles no hacen caer el registro del proyecto.
 */
function portfolioExtras(
  project: AuthorizedProject,
  options: PortfolioOptions,
): Pick<PortfolioRow, "agentsWorking" | "profile" | "profileError"> {
  let agentsWorking: number | null = null;
  try {
    agentsWorking = portfolioLiveAgents(
      leerAgentesDeCorrida(project.root, {
        ...(options.home === undefined ? {} : { home: options.home }),
        ...(options.ahora === undefined ? {} : { ahora: options.ahora }),
        paths: project.paths,
        project,
      }),
    );
  } catch {
    agentsWorking = null;
  }
  try {
    return {
      agentsWorking,
      profile: readSeleccionDePerfil(project.root).proyecto,
      profileError: null,
    };
  } catch (caught) {
    return {
      agentsWorking,
      profile: null,
      profileError: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

/** Los totales cubren solo proyectos disponibles; los ausentes se declaran aparte. */
export function summarizePortfolio(rows: readonly PortfolioRow[]) {
  return {
    projects: rows.length,
    available: rows.filter((row) => row.available).length,
    unavailable: rows.filter((row) => !row.available).length,
    gatesPending: rows.reduce((total, row) => total + (row.gatesPending ?? 0), 0),
    correctionsPending: rows.reduce(
      (total, row) => total + (row.correctionsPending ?? 0),
      0,
    ),
    waiting: rows.reduce((total, row) => total + (row.waiting ?? 0), 0),
    evaluations: rows.reduce((total, row) => total + (row.usage?.evaluations ?? 0), 0),
    costUsd: rows.reduce((total, row) => total + (row.usage?.costUsd ?? 0), 0),
  };
}
