/** Proyección de solo lectura del catálogo local para Mission Control. */
import { basename, resolve } from "node:path";
import { readString } from "@valmen/adapter";
import {
  currentReceipts,
  readAllReceipts,
  usageReport,
  waitingRuns,
  type AuthorizedProjectCatalog,
  type UsageReport,
} from "@valmen/engine";
import { readConfig } from "./config.js";
import { pendingCorrections } from "./gates.js";

export interface PortfolioRow {
  readonly projectId: string;
  readonly name: string;
  readonly root: string;
  readonly current: boolean;
  readonly available: boolean;
  readonly reason: string | null;
  readonly gatesPending: number | null;
  readonly correctionsPending: number | null;
  readonly waiting: number | null;
  readonly usage: UsageReport | null;
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
      gatesPending: null,
      correctionsPending: null,
      waiting: null,
      usage: null,
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
        gatesPending: currentReceipts(receipts).filter(
          (receipt) => receipt.escalatedTo === "human" && receipt.humanDecision === null,
        ).length,
        correctionsPending: [...tickets].reduce(
          (total, ticket) => total + pendingCorrections(project.paths, ticket).length,
          0,
        ),
        waiting: waitingRuns(project.root).length,
        usage: usageReport(project.paths, dates),
      };
    } catch {
      return {
        ...unavailable,
        reason: `No se pudieron leer los datos del proyecto "${project.projectId}".`,
      };
    }
  });
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
