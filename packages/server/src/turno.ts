/**
 * A quién le toca cada ticket y en qué paso del ciclo de ocho está
 * (FEATURE-WEB-TRABAJO-TICKETS-20261014: R-TRA-001, R-TRA-002).
 *
 * El ciclo que ve la persona tiene ocho pasos —Pedido, Análisis, Plan, Aprobación, Desarrollo, Tus
 * pruebas, QA y Cierre— y no los once estados del motor. La tabla que los une, y quién tiene el
 * turno, se decide aquí y no en el navegador, para que la lista y el detalle digan lo mismo. Las
 * reglas que ya existen se reutilizan: el estado público (`estadoPublicoDelTicket`), las decisiones
 * del agente por ratificar (`decisionesPorRatificar`) y la compuerta en REVIEW que nadie decidió,
 * con el mismo criterio que Inicio.
 *
 * Es de solo lectura: no escribe en el registro.
 */
import { type PublicStateResult, type ParsedTicket, parseTicket } from "@valmen/core";
import {
  type RegistryPaths,
  currentReceipts,
  decisionesPorRatificar,
  estadoPublicoDelTicket,
  findTicket,
  readReceipts,
} from "@valmen/engine";

/** Quién tiene el ticket ahora. */
export type QuienTiene = "persona" | "agente" | "nadie";

/** Por qué el turno es de la persona. */
export type MotivoDeTurno =
  | "pruebas"
  | "bloqueado"
  | "cambios"
  | "aprobar-plan"
  | "compuerta"
  | "qa"
  | "ratificar";

export interface Turno {
  readonly quien: QuienTiene;
  /** El paso actual, de 1 a 8; 9 es el ciclo completo. */
  readonly paso: number;
  /** Lo que se lee bajo la barra de avance. */
  readonly rotulo: string;
  readonly motivo: MotivoDeTurno | null;
  /** La compuerta que espera a la persona, si es eso lo que la espera. */
  readonly compuerta: string | null;
}

export interface EntradaDeTurno {
  readonly estado: string;
  readonly estadoPublico: PublicStateResult | null;
  readonly porRatificar: number;
  /** La compuerta cuyo último recibo espera a una persona, y su resultado. */
  readonly compuertaPendiente: { readonly gate: string; readonly outcome: string } | null;
  /** En `blocked`, el estado del que salió. */
  readonly estadoAntesDeBloqueo: string | null;
}

/** El paso del ciclo de ocho en que está cada estado (el mismo mapa que usa Inicio). */
const PASO: Readonly<Record<string, number>> = {
  intake: 2,
  analyzed: 3,
  planned: 4,
  approved: 5,
  in_progress: 5,
  changes_requested: 5,
  awaiting_user_tests: 6,
  in_qa: 7,
  qa_approved: 8,
  closed: 9,
};

/** El turno según la tabla del plan del ticket. Función pura. */
export function calcularTurno(e: EntradaDeTurno): Turno {
  const turno = (
    quien: QuienTiene,
    motivo: MotivoDeTurno | null,
    rotulo: string = e.estado,
    paso: number = PASO[e.estado] ?? 2,
  ): Turno => ({
    quien,
    paso,
    rotulo,
    motivo,
    compuerta: motivo === "compuerta" ? (e.compuertaPendiente?.gate ?? null) : null,
  });

  if (e.estado === "closed") return turno("nadie", null);
  if (e.estado === "blocked") {
    return turno("persona", "bloqueado", "blocked", PASO[e.estadoAntesDeBloqueo ?? ""] ?? 2);
  }
  if (e.estado === "qa_approved") {
    return e.porRatificar > 0
      ? turno("persona", "ratificar", "ratificar antes de cerrar")
      : turno("agente", null);
  }
  if (e.compuertaPendiente !== null) {
    return turno(
      "persona",
      "compuerta",
      `${e.estado} · ${e.compuertaPendiente.outcome.toUpperCase()}`,
    );
  }
  if (e.estado === "awaiting_user_tests") return turno("persona", "pruebas");
  if (e.estado === "in_qa") return turno("persona", "qa");
  if (e.estado === "changes_requested") return turno("persona", "cambios");
  if (e.estadoPublico?.state === "needs-decision") {
    return turno(
      "persona",
      e.estadoPublico.reason === "plan-approval" ? "aprobar-plan" : "compuerta",
    );
  }
  return turno("agente", null);
}

/** `Workflow: planned -> blocked.` → `planned`, del último evento que entró a `blocked`. */
function estadoAntesDeBloqueo(documento: ParsedTicket): string | null {
  let antes: string | null = null;
  for (const evento of documento.blocks.Eventos ?? []) {
    const detalles = typeof evento["details"] === "string" ? evento["details"] : "";
    const m = /^Workflow: ([a-z_]+) -> blocked\.$/.exec(detalles);
    if (m !== null) antes = m[1] as string;
  }
  return antes;
}

/** La compuerta cuyo último recibo espera a una persona: REVIEW sin decidir o escalada sin decisión. */
function compuertaPendiente(
  paths: RegistryPaths,
  id: string,
): { gate: string; outcome: string } | null {
  const vistos = new Set<string>();
  for (const recibo of currentReceipts(readReceipts(paths, id))) {
    if (vistos.has(recibo.gate)) continue;
    vistos.add(recibo.gate);
    if (recibo.humanDecision != null) continue;
    const revisor = (recibo as { reviewerDecision?: unknown }).reviewerDecision;
    const enReview = recibo.outcome === "review" && revisor == null;
    const escalada = recibo.escalatedTo === "human";
    if (enReview || escalada) return { gate: recibo.gate, outcome: recibo.outcome };
  }
  return null;
}

/** El turno de un ticket del registro, o `null` si no se puede leer. */
export function turnoDelTicket(paths: RegistryPaths, id: string): Turno | null {
  try {
    const ubicado = findTicket(paths, id);
    if (ubicado === undefined) return null;
    const documento = parseTicket(ubicado.text);
    const estado = documento.fields.workflow_status;
    let estadoPublico: PublicStateResult | null = null;
    try {
      estadoPublico = estadoPublicoDelTicket(paths, id);
    } catch {
      estadoPublico = null;
    }
    const activo = estado !== "closed" && estado !== "qa_approved";
    return calcularTurno({
      estado,
      estadoPublico,
      porRatificar: decisionesPorRatificar(documento).length,
      compuertaPendiente: activo ? compuertaPendiente(paths, id) : null,
      estadoAntesDeBloqueo: estadoAntesDeBloqueo(documento),
    });
  } catch {
    return null;
  }
}

/** Las cuatro pestañas de la lista. */
export type PestanaDeTurno = "activos" | "persona" | "agente" | "cerrados";

/** `true` si la fila va en esa pestaña. */
export function enPestana(
  pestana: PestanaDeTurno,
  fila: { readonly workflowStatus: string; readonly turno: Turno | null },
): boolean {
  if (pestana === "cerrados") return fila.workflowStatus === "closed";
  if (pestana === "activos") return fila.workflowStatus !== "closed";
  return fila.turno?.quien === pestana;
}

/** Las cuentas de las cuatro pestañas. */
export function contarPorTurno(
  filas: readonly { readonly workflowStatus: string; readonly turno: Turno | null }[],
): Record<PestanaDeTurno, number> {
  const cuenta = (p: PestanaDeTurno) => filas.filter((f) => enPestana(p, f)).length;
  return {
    activos: cuenta("activos"),
    persona: cuenta("persona"),
    agente: cuenta("agente"),
    cerrados: cuenta("cerrados"),
  };
}

export interface ContratoDePruebas {
  readonly directorio: string | null;
  readonly ambiente: string | null;
  readonly comandos: readonly { readonly comando: string; readonly esperado: string | null }[];
  readonly manuales: readonly string[];
}

/** Quita las comillas invertidas de un texto de Markdown. */
const sinCodigo = (t: string): string => t.replace(/`/g, "").trim();

/**
 * El contrato de pruebas que lee «Te toca»: el de `## Pruebas` (directorio, ambiente, comandos
 * numerados y validaciones manuales), y sin comandos ahí, las anotaciones de los criterios.
 */
export function contratoDePruebas(secciones: Readonly<Record<string, string>>): ContratoDePruebas {
  let directorio: string | null = null;
  let ambiente: string | null = null;
  const comandos: { comando: string; esperado: string | null }[] = [];
  const manuales: string[] = [];
  let lista: "comandos" | "manuales" | null = null;

  for (const linea of (secciones["Pruebas"] ?? "").split("\n")) {
    const principal = /^[-*]\s+(.*)$/.exec(linea);
    if (principal !== null) {
      const texto = principal[1] as string;
      lista = null;
      const directo = /^Directorio[^:]*:\s*(.*)$/i.exec(texto);
      const entorno = /^Requisitos de ambiente[^:]*:\s*(.*)$/i.exec(texto);
      if (directo !== null) directorio = sinCodigo(directo[1] as string);
      else if (entorno !== null) ambiente = sinCodigo(entorno[1] as string);
      else if (/^Comandos/i.test(texto)) lista = "comandos";
      else if (/^Validaciones manuales/i.test(texto)) lista = "manuales";
      continue;
    }
    if (lista === "comandos") {
      const m = /^\s+\d+[.)]\s+`([^`]+)`\s*(?:→\s*(.*))?$/.exec(linea);
      if (m !== null) {
        comandos.push({ comando: (m[1] as string).trim(), esperado: m[2] ? (m[2] as string).trim() : null });
      }
    } else if (lista === "manuales") {
      const m = /^\s+[-*]\s+(.*)$/.exec(linea);
      if (m !== null) manuales.push(sinCodigo(m[1] as string));
    }
  }

  if (comandos.length === 0) {
    const criterios = (secciones["Criterios de aceptación"] ?? "").split("\n");
    const vistos = new Set<string>();
    for (const linea of criterios) {
      const prueba = /<!--\s*test:\s*(.+?)\s*-->/.exec(linea);
      if (prueba !== null && !vistos.has(prueba[1] as string)) {
        vistos.add(prueba[1] as string);
        comandos.push({ comando: prueba[1] as string, esperado: null });
      }
    }
    // Sin validaciones en `## Pruebas`, cada criterio manual es una.
    if (manuales.length === 0) {
      criterios.forEach((linea, i) => {
        if (!/<!--\s*verify:\s*manual\s*-->/.test(linea)) return;
        const criterio = /^\s*[-*]\s+\[[ xX]\]\s*(.*)$/.exec(criterios[i - 1] ?? "");
        if (criterio !== null) manuales.push((criterio[1] as string).trim());
      });
    }
  }

  return { directorio, ambiente, comandos, manuales };
}
