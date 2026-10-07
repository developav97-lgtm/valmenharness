/**
 * El recibo de `qa-agent` (R-QAAG-005): lo que hace falta para repetir la verificación.
 *
 * Es un archivo append-only propio, `.valmen/qa/agent-receipts.jsonl`, con un solo escritor
 * (`registrarReciboQaAgent`); no altera los recibos de compuertas del ticket.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ComandoDeRecibo {
  readonly fase: "entregado" | "base" | "regresion";
  /** La invocación exacta, ejecutada desde la raíz del worktree. */
  readonly invocacion: string;
  readonly exitCode: number;
  readonly durationMs: number;
  /** La cola de la salida; la salida completa se identifica con `outputSha256`. */
  readonly tail: string;
  readonly outputSha256: string;
}

export type ResultadoContraBase = "no-aplica" | "fallo-como-se-esperaba" | "no-reproduce-el-defecto";

export interface ReciboQaAgent {
  readonly kind: "qa-agent-receipt";
  readonly ticketId: string;
  readonly base: string;
  readonly delivered: string;
  /** El hash del árbol probado (`<delivered>^{tree}`). */
  readonly treeHash: string;
  readonly verdict: "approve" | "block";
  readonly reasons: readonly string[];
  readonly commands: readonly ComandoDeRecibo[];
  readonly resultadoContraBase: ResultadoContraBase;
  readonly authorization: { readonly id: string; readonly hash: string } | null;
  readonly at: string;
}

export function qaAgentReceiptsPath(root: string): string {
  return join(root, ".valmen", "qa", "agent-receipts.jsonl");
}

/** Anexa un recibo. Nunca reescribe los anteriores. */
export function registrarReciboQaAgent(root: string, recibo: ReciboQaAgent): string {
  const ruta = qaAgentReceiptsPath(root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(recibo)}\n`, "utf8");
  return ruta;
}

/** Los recibos de `qa-agent` de un ticket, del más antiguo al más reciente. */
export function leerRecibosQaAgent(root: string, ticketId?: string): ReciboQaAgent[] {
  const ruta = qaAgentReceiptsPath(root);
  if (!existsSync(ruta)) return [];
  const recibos: ReciboQaAgent[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const r = JSON.parse(linea) as ReciboQaAgent;
      if (r.kind === "qa-agent-receipt" && (ticketId === undefined || r.ticketId === ticketId)) recibos.push(r);
    } catch {
      // Un renglón truncado no borra los anteriores.
    }
  }
  return recibos;
}

/** Los pasos exactos para repetir la verificación sobre el mismo árbol. */
export function reproducirReciboQaAgent(recibo: ReciboQaAgent): string[] {
  const pasos = [`git worktree add --detach <carpeta> ${recibo.delivered}   # árbol ${recibo.treeHash}`];
  pasos.push(`restaurar .valmen/config.yaml y los scripts de pruebas desde el commit base ${recibo.base}`);
  for (const c of recibo.commands) {
    const donde = c.fase === "base" ? `worktree del commit base ${recibo.base}` : "worktree entregado";
    pasos.push(`(${donde}) ${c.invocacion}   # salida esperada: código ${c.exitCode}`);
  }
  return pasos;
}

/** El último recibo de un ticket con la línea que ocupa en el archivo (1-based). */
export function ultimoReciboConLinea(root: string, ticketId: string): { readonly recibo: ReciboQaAgent; readonly linea: number } | null {
  const ruta = qaAgentReceiptsPath(root);
  if (!existsSync(ruta)) return null;
  let ultimo: { recibo: ReciboQaAgent; linea: number } | null = null;
  readFileSync(ruta, "utf8").split("\n").forEach((texto, indice) => {
    if (texto.trim() === "") return;
    try {
      const r = JSON.parse(texto) as ReciboQaAgent;
      if (r.kind === "qa-agent-receipt" && r.ticketId === ticketId) ultimo = { recibo: r, linea: indice + 1 };
    } catch {
      // Un renglón truncado no cuenta.
    }
  });
  return ultimo;
}

/** El recibo que ocupa una línea del archivo, o `null`. */
export function reciboEnLinea(root: string, linea: number): ReciboQaAgent | null {
  const ruta = qaAgentReceiptsPath(root);
  if (!existsSync(ruta)) return null;
  const texto = readFileSync(ruta, "utf8").split("\n")[linea - 1];
  if (texto === undefined || texto.trim() === "") return null;
  try {
    const r = JSON.parse(texto) as ReciboQaAgent;
    return r.kind === "qa-agent-receipt" ? r : null;
  } catch {
    return null;
  }
}
