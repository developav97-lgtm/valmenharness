/**
 * Lo que la vista Inicio necesita del registro (FEATURE-WEB-INICIO-DECISIONES-20261014, R-MARCO-005).
 *
 * Inicio responde «¿qué está parado por mí?». Lo que espera a la persona son tres cosas, y cada una
 * la decide el motor, no la pantalla: las decisiones del agente que faltan por ratificar
 * (`decisionesPorRatificar`), los tickets que esperan sus pruebas (`awaiting_user_tests`) y las
 * compuertas en REVIEW que nadie decidió todavía —ni una persona ni el revisor, que con la política
 * por defecto decide los REVIEW derivables (D-003)—. Se calcula aquí para que el navegador no
 * duplique esas reglas ni haga dos llamadas por ticket (D-001).
 *
 * Es de solo lectura: no escribe en el registro ni cambia ningún contrato existente.
 */
import { parseTicket } from "@valmen/core";
import {
  type RegistryPaths,
  currentReceipts,
  decisionesPorRatificar,
  findTicket,
  listTickets,
  readReceipts,
} from "@valmen/engine";

/** Algo que espera una decisión de la persona. */
export interface PendienteDeInicio {
  readonly tipo: "ratificar" | "pruebas" | "review";
  readonly ticket: string;
  readonly titulo: string;
  readonly estado: string;
  /** `ratificar`: cuántas decisiones o aprobaciones del agente esperan. */
  readonly cuantas?: number;
  readonly resumenes?: readonly string[];
  /** `review`: la compuerta, su recibo y las proposiciones que quedaron en la banda media. */
  readonly gate?: string;
  readonly receiptId?: string;
  readonly dudas?: readonly string[];
}

/** Algo hecho hoy: un ticket cerrado o uno registrado. */
export interface HechoDeHoy {
  readonly tipo: "cerrado" | "registrado";
  readonly ticket: string;
  readonly titulo: string;
}

export interface Inicio {
  /** El día del servidor, `AAAA-MM-DD`. */
  readonly fecha: string;
  readonly pendientes: readonly PendienteDeInicio[];
  readonly cifras: {
    readonly esperan: number;
    readonly intake: number;
    readonly cerradosAnio: number;
    readonly anio: number;
  };
  readonly hechoHoy: readonly HechoDeHoy[];
}

const ORDEN: Record<PendienteDeInicio["tipo"], number> = { ratificar: 0, pruebas: 1, review: 2 };

/** La fecha local `AAAA-MM-DD`: el «hoy» de quien mira, no el de UTC. */
function dia(fecha: Date): string {
  const dos = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** Lo que espera a la persona, las cifras del registro y lo hecho hoy. */
export function leerInicio(paths: RegistryPaths, ahora: Date = new Date()): Inicio {
  const hoy = dia(ahora);
  const anio = ahora.getFullYear();
  const filas = listTickets(paths);
  const pendientes: PendienteDeInicio[] = [];

  for (const fila of filas) {
    if (fila.workflowStatus === "closed") continue;
    const base = { ticket: fila.id, titulo: fila.title, estado: fila.workflowStatus };

    const ubicado = findTicket(paths, fila.id);
    if (ubicado !== undefined) {
      try {
        const porRatificar = decisionesPorRatificar(parseTicket(ubicado.text));
        if (porRatificar.length > 0) {
          pendientes.push({
            ...base,
            tipo: "ratificar",
            cuantas: porRatificar.length,
            resumenes: porRatificar.map((p) => p.resumen),
          });
        }
      } catch {
        // Un ticket que no se puede leer no tiene decisiones que contar; la lista de tickets ya
        // lo muestra como inválido.
      }
    }

    if (fila.workflowStatus === "awaiting_user_tests") pendientes.push({ ...base, tipo: "pruebas" });

    // El recibo vigente más nuevo de cada compuerta: uno viejo ya no describe el ticket.
    const vistos = new Set<string>();
    for (const recibo of currentReceipts(readReceipts(paths, fila.id))) {
      if (vistos.has(recibo.gate)) continue;
      vistos.add(recibo.gate);
      const revisor = (recibo as { reviewerDecision?: unknown }).reviewerDecision;
      if (recibo.outcome !== "review" || recibo.humanDecision != null || revisor != null) continue;
      pendientes.push({
        ...base,
        tipo: "review",
        gate: recibo.gate,
        receiptId: recibo.id,
        dudas: recibo.propositions.filter((p) => p.verdict && p.inBand).map((p) => p.id),
      });
    }
  }

  pendientes.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);

  const hechoHoy: HechoDeHoy[] = [
    ...filas
      .filter((f) => f.closedOn === hoy)
      .map((f) => ({ tipo: "cerrado" as const, ticket: f.id, titulo: f.title })),
    ...filas
      .filter((f) => f.created === hoy)
      .map((f) => ({ tipo: "registrado" as const, ticket: f.id, titulo: f.title })),
  ];

  return {
    fecha: hoy,
    pendientes,
    cifras: {
      esperan: pendientes.length,
      intake: filas.filter((f) => f.workflowStatus === "intake").length,
      cerradosAnio: filas.filter((f) => (f.closedOn ?? "").startsWith(`${anio}-`)).length,
      anio,
    },
    hechoHoy,
  };
}
