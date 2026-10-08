/**
 * CodeGraph: el servidor MCP que declara el harness y la lectura de su estado.
 *
 * CodeGraph es opcional y ajeno: el harness no lo instala ni lo indexa. Aquí solo
 * vive lo que se **calcula** sin tocar nada: la entrada que lo declara como
 * servidor MCP y la traducción de la salida de `codegraph status --json` a un
 * estado que el diagnóstico pueda mostrar. La función es pura —recibe el
 * resultado de lanzar el binario— para que se pruebe sin depender de que la
 * máquina lo tenga instalado.
 */
import { type McpEntry, mcpEntry } from "./mcp.js";

/** El identificador con el que se declara CodeGraph en los clientes MCP. */
export const CODEGRAPH_SERVER_ID = "codegraph";

/** La entrada que arranca el servidor MCP de CodeGraph, por nombre y sin rutas. */
export function codegraphEntry(): McpEntry {
  return mcpEntry("codegraph", ["serve", "--mcp"]);
}

/** Lo que devolvió lanzar `codegraph status --json`. */
export interface CodegraphProbeResult {
  /** El código del error al lanzar el proceso (`ENOENT`, `ETIMEDOUT`…), si lo hubo. */
  readonly errorCode?: string | undefined;
  /** El código de salida; `null` si el proceso no terminó por sí solo. */
  readonly status: number | null;
  readonly stdout: string;
}

/** Los cambios que el índice todavía no refleja. */
export interface CodegraphPending {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
}

/**
 * El estado de CodeGraph en un proyecto.
 *
 * `ilegible` es un estado y no un error a propósito: una salida que no se
 * entiende nunca se informa como «al día».
 */
export type CodegraphState =
  | { readonly estado: "no-instalado" }
  | { readonly estado: "sin-indice" }
  | { readonly estado: "al-dia" }
  | ({ readonly estado: "desactualizado" } & CodegraphPending)
  | { readonly estado: "ilegible"; readonly motivo: string };

function contador(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : null;
}

/** Traduce el resultado de `codegraph status --json` a un estado. */
export function readCodegraphStatus(resultado: CodegraphProbeResult): CodegraphState {
  if (resultado.errorCode === "ENOENT") return { estado: "no-instalado" };
  if (resultado.errorCode !== undefined) {
    return {
      estado: "ilegible",
      motivo:
        resultado.errorCode === "ETIMEDOUT"
          ? "codegraph status no respondió a tiempo"
          : `no se pudo lanzar codegraph (${resultado.errorCode})`,
    };
  }
  if (resultado.status !== 0) {
    return {
      estado: "ilegible",
      motivo:
        resultado.status === null
          ? "codegraph status no terminó"
          : `codegraph status salió con código ${resultado.status}`,
    };
  }

  let analizado: unknown;
  try {
    analizado = JSON.parse(resultado.stdout);
  } catch {
    return { estado: "ilegible", motivo: "la salida de codegraph status no es JSON" };
  }
  if (typeof analizado !== "object" || analizado === null || Array.isArray(analizado)) {
    return { estado: "ilegible", motivo: "la salida de codegraph status no es un objeto" };
  }

  const datos = analizado as Record<string, unknown>;
  if (datos["initialized"] === false) return { estado: "sin-indice" };
  if (datos["initialized"] !== true) {
    return { estado: "ilegible", motivo: "la salida no dice si el índice está inicializado" };
  }

  const pendientes = datos["pendingChanges"];
  if (typeof pendientes !== "object" || pendientes === null) {
    return { estado: "ilegible", motivo: "la salida no trae pendingChanges" };
  }
  const bruto = pendientes as Record<string, unknown>;
  const added = contador(bruto["added"]);
  const modified = contador(bruto["modified"]);
  const removed = contador(bruto["removed"]);
  if (added === null || modified === null || removed === null) {
    return { estado: "ilegible", motivo: "pendingChanges no trae conteos válidos" };
  }

  if (added === 0 && modified === 0 && removed === 0) return { estado: "al-dia" };
  return { estado: "desactualizado", added, modified, removed };
}
