/**
 * El valor de cada ticket cerrado: lo que costó y lo que dejó.
 *
 * El consumo agregado dice cuánto se gastó; no dice **en qué**. Y la pregunta que
 * decide si el harness sirve no es cuánto costó el mes: es si el ticket que costó
 * cinco dólares dejó algo, y por qué el que costó cincuenta los costó. Este
 * informe pone las dos columnas juntas, ticket por ticket, porque separadas no
 * responden nada.
 *
 * Junta dos fuentes que ya existían y nunca se habían mirado juntas:
 *
 * - **Los recibos de compuerta**, que dicen cuánto costó evaluar y cuánto de eso
 *   lo decidió el código.
 * - **El consumo de IA del ticket**, que la línea de tiempo guardó al cerrarlo y
 *   que dice cuánto costó el trabajo de los agentes —cuando el proveedor cobra
 *   por token— y cuántas sesiones hubo.
 *
 * Un coste desconocido **no se suma como cero**: un proveedor por suscripción no
 * tiene coste por token, y contarlo como gratis haría que el ticket más trabajado
 * pareciera el más barato. Se cuenta aparte y se dice.
 *
 * Lo que no es dinero también importa: cuántas veces el trabajo **volvió atrás**
 * —una QA con hallazgos, una reapertura— es la señal más barata de que el
 * análisis se hizo a las prisas, y es la que este informe destaca.
 */
import { type RegistryPaths } from "./discovery.js";
import { type ReportEntry, closedTickets } from "./report.js";
import { readTicket } from "./tickets.js";
import { readAllReceipts } from "./usage.js";

/** Lo que costó y lo que dejó un ticket cerrado. */
export interface TicketValue {
  readonly ticketId: string;
  readonly title: string;
  readonly type: string;
  readonly closedOn: string;
  readonly releaseStatus: string;
  /** Coste de las evaluaciones de compuerta, de los recibos. */
  readonly harnessUsd: number;
  /** Coste de las sesiones de agente que el ticket registró. */
  readonly sessionsUsd: number;
  /** Sesiones sin coste por token: el proveedor cobra por suscripción. */
  readonly sessionsUnknown: number;
  /** Lo que se puede sumar. Los desconocidos no entran. */
  readonly knownUsd: number;
  /** `true` si alguna sesión no tiene coste: el total de este ticket es parcial. */
  readonly partial: boolean;
  readonly evaluations: number;
  readonly approved: number;
  readonly escalated: number;
  /** Ciclos de QA abiertos. */
  readonly qaCycles: number;
  /** Veces que el trabajo volvió atrás: QA con hallazgos o reapertura. */
  readonly returns: number;
  /** Puntos que quedaron abiertos al cerrar. Debería ser cero. */
  readonly openPoints: number;
}

/** El informe completo. */
export interface ValueReport {
  readonly desde: string | null;
  readonly hasta: string | null;
  /** De mayor a menor coste: por dónde empezar a mirar. */
  readonly tickets: readonly TicketValue[];
  readonly totalUsd: number;
  readonly meanUsd: number | null;
  /** Tickets con más de una vuelta atrás. */
  readonly withReturns: readonly string[];
  /** Tickets cuyo coste es parcial por una suscripción. */
  readonly partial: readonly string[];
  /** Aprobaciones que decidió el código, sin preguntarle a un modelo. */
  readonly byCode: number;
  /** De esas, las que una persona revirtió. */
  readonly reversedByHuman: number;
}

/** Los recibos de un ticket, ya colapsados a su versión vigente. */
interface RecibosDeTicket {
  readonly evaluaciones: number;
  readonly aprobadas: number;
  readonly escaladas: number;
  readonly costUsd: number;
  readonly byCode: number;
  readonly revertidas: number;
}

/** Un número de un bloque, o cero si no está. */
function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/**
 * Cuenta las vueltas atrás de un ticket.
 *
 * Se cuentan las transiciones **hacia** `changes_requested`: una QA que devolvió
 * el trabajo y una reapertura de un ticket cerrado son la misma cosa vista desde
 * el registro —alguien dijo que no estaba bien—, y separarlas daría dos columnas
 * que nadie suma. Se lee de los eventos y no del estado: el estado dice dónde
 * está, no cuántas veces volvió.
 */
function vueltasAtras(eventos: readonly Record<string, unknown>[]): number {
  return eventos.filter((evento) => {
    const detalles = String(evento["details"] ?? "");
    return /->\s*changes_requested\b/.test(detalles);
  }).length;
}

/** Los ciclos de QA abiertos: cada apertura es un ciclo, se haya cerrado o no. */
function ciclosDeQa(qa: readonly Record<string, unknown>[]): number {
  return qa.filter((entrada) => String(entrada["build_reference"] ?? "") !== "").length;
}

/** Junta los recibos por ticket, colapsando la versión vigente de cada uno. */
function recibosPorTicket(
  recibos: ReturnType<typeof readAllReceipts>,
): Map<string, RecibosDeTicket> {
  const vigentes = new Map<string, (typeof recibos)[number]>();
  for (const recibo of recibos) {
    if (recibo.gate === "(ilegible)") continue;
    vigentes.set(recibo.id, recibo);
  }

  const porTicket = new Map<string, RecibosDeTicket>();
  for (const recibo of vigentes.values()) {
    const actual = porTicket.get(recibo.subject.id) ?? {
      evaluaciones: 0,
      aprobadas: 0,
      escaladas: 0,
      costUsd: 0,
      byCode: 0,
      revertidas: 0,
    };
    const byCode = recibo.model === null;
    porTicket.set(recibo.subject.id, {
      evaluaciones: actual.evaluaciones + 1,
      aprobadas: actual.aprobadas + (recibo.outcome === "approve" ? 1 : 0),
      escaladas: actual.escaladas + (recibo.escalatedTo !== null ? 1 : 0),
      costUsd: actual.costUsd + (recibo.usage?.costUsd ?? 0),
      byCode: actual.byCode + (byCode ? 1 : 0),
      // Una aprobación que una persona revirtió: el gate dijo que sí y quien
      // revisó dijo que no. Es el único número que mide si el gate automático se
      // está equivocando a favor.
      revertidas:
        actual.revertidas +
        (recibo.outcome === "approve" && recibo.humanDecision?.decision === "reject"
          ? 1
          : 0),
    });
  }
  return porTicket;
}

/**
 * El valor de los tickets cerrados en un rango, por fecha de cierre.
 *
 * Se filtra por cierre y no por última edición: un ticket cerrado el lunes al que
 * alguien le corrigió una tilde el jueves pertenece al lunes, y contarlo en la
 * semana del jueves dejaría la semana del lunes con un ticket menos.
 */
export function ticketValueReport(
  paths: RegistryPaths,
  range: { readonly desde?: string; readonly hasta?: string } = {},
): ValueReport {
  const cerrados: ReportEntry[] = closedTickets(paths).filter((entrada) => {
    if (range.desde !== undefined && entrada.closedOn < range.desde) return false;
    if (range.hasta !== undefined && entrada.closedOn > range.hasta) return false;
    return true;
  });

  const recibos = recibosPorTicket(readAllReceipts(paths));
  const tickets: TicketValue[] = [];

  for (const entrada of cerrados) {
    const detalle = readTicket(paths, entrada.ticketId);
    const suyos = recibos.get(entrada.ticketId);

    const sesionesUsd = (detalle?.usage ?? []).reduce(
      (suma, uso) => suma + numero(uso["estimated_cost_usd"]),
      0,
    );
    const sessionsUnknown = (detalle?.usage ?? []).filter(
      (uso) =>
        uso["estimated_cost_usd"] === null || uso["estimated_cost_usd"] === undefined,
    ).length;
    const harnessUsd = suyos?.costUsd ?? 0;

    tickets.push({
      ticketId: entrada.ticketId,
      title: entrada.title,
      type: entrada.type,
      closedOn: entrada.closedOn,
      releaseStatus: entrada.releaseStatus,
      harnessUsd,
      sessionsUsd: sesionesUsd,
      sessionsUnknown,
      knownUsd: harnessUsd + sesionesUsd,
      partial: sessionsUnknown > 0,
      evaluations: suyos?.evaluaciones ?? 0,
      approved: suyos?.aprobadas ?? 0,
      escalated: suyos?.escaladas ?? 0,
      qaCycles: ciclosDeQa(detalle?.qa ?? []),
      returns: vueltasAtras(detalle?.events ?? []),
      openPoints: detalle?.openPoints ?? 0,
    });
  }

  tickets.sort((a, b) => {
    if (a.knownUsd !== b.knownUsd) return b.knownUsd - a.knownUsd;
    return a.ticketId < b.ticketId ? -1 : 1;
  });

  const totalUsd = tickets.reduce((suma, ticket) => suma + ticket.knownUsd, 0);
  const todos = [...recibos.values()];

  return {
    desde: range.desde ?? null,
    hasta: range.hasta ?? null,
    tickets,
    totalUsd,
    meanUsd: tickets.length === 0 ? null : totalUsd / tickets.length,
    withReturns: tickets
      .filter((ticket) => ticket.returns > 1)
      .map((ticket) => ticket.ticketId),
    partial: tickets.filter((ticket) => ticket.partial).map((ticket) => ticket.ticketId),
    byCode: todos.reduce((suma, suyo) => suma + suyo.byCode, 0),
    reversedByHuman: todos.reduce((suma, suyo) => suma + suyo.revertidas, 0),
  };
}

/** Un monto en dólares, con los decimales que hacen falta para leerlo. */
function monto(valor: number): string {
  return `$${valor.toFixed(valor < 1 ? 4 : 2)}`;
}

/**
 * El informe, en texto.
 *
 * La tabla se ordena por coste y se corta en `limite`: un informe de doscientas
 * filas no se lee, y lo que se busca está arriba. El corte se dice, para que
 * nadie crea que el registro tiene veinte tickets.
 */
export function renderValue(
  report: ValueReport,
  opciones: { readonly limite?: number } = {},
): string {
  const limite = opciones.limite ?? 20;
  const rango =
    report.desde === null && report.hasta === null
      ? "todo el registro"
      : `${report.desde ?? "el principio"} al ${report.hasta ?? "hoy"}`;

  if (report.tickets.length === 0) {
    return (
      `Valor por ticket — ${rango}\n\n` +
      "_No hay tickets cerrados en este rango. El informe cuenta cierres, no ediciones._\n"
    );
  }

  // El ancho sale de los identificadores que se van a imprimir, no de un número
  // elegido a ojo: el identificador es lo que se copia para abrir el ticket, y uno
  // cortado no sirve para nada. Los del registro real llegan a 51 caracteres.
  const filas = report.tickets.slice(0, limite);
  const ancho = Math.max(24, ...filas.map((ticket) => ticket.ticketId.length));

  const encabezado =
    "Ticket".padEnd(ancho) +
    "  Cerrado".padEnd(12) +
    "Coste".padStart(10) +
    "Compuertas".padStart(12) +
    "QA".padStart(4) +
    "Vueltas".padStart(9) +
    "  Valor";
  const lineas: string[] = [`Valor por ticket — ${rango}`, "", "  " + encabezado];

  for (const ticket of filas) {
    const valor = ticket.releaseStatus === "released" ? "publicado" : "sin publicar";
    const aviso = ticket.returns > 1 ? " ⚠" : "";
    const coste = ticket.partial ? `${monto(ticket.knownUsd)}?` : monto(ticket.knownUsd);
    lineas.push(
      "  " +
        ticket.ticketId.padEnd(ancho) +
        "  " +
        ticket.closedOn.padEnd(12) +
        coste.padStart(10) +
        `${ticket.approved}/${ticket.evaluations}`.padStart(12) +
        String(ticket.qaCycles).padStart(4) +
        String(ticket.returns).padStart(9) +
        `  ${valor}${aviso}`,
    );
  }

  if (report.tickets.length > limite) {
    lineas.push(
      "  " + `… y ${report.tickets.length - limite} ticket(s) más con menos coste.`,
    );
  }

  lineas.push(
    "",
    `  Coste total       ${monto(report.totalUsd)}` +
      (report.partial.length === 0
        ? ""
        : `  ·  ${report.partial.length} ticket(s) con coste parcial (?)`),
    `  Coste medio       ${report.meanUsd === null ? "—" : monto(report.meanUsd)}`,
    `  Compuertas        ${report.byCode} aprobación(es) decididas por código · ` +
      `${report.reversedByHuman} revertida(s) por una persona` +
      (report.reversedByHuman === 0 ? " ✓" : " ⚠"),
  );

  if (report.withReturns.length > 0) {
    const porcentaje = ((report.withReturns.length / report.tickets.length) * 100).toFixed(
      0,
    );
    lineas.push(
      `  Vueltas atrás     ${report.withReturns.length} ticket(s) con más de una ` +
        `(${porcentaje}%)  →  revisar la calidad del análisis`,
    );
  }

  if (report.partial.length > 0) {
    lineas.push(
      "",
      "  El «?» marca un ticket con coste parcial: una de sus sesiones no tiene",
      "  coste por token —un proveedor por suscripción— o está declarada sin números",
      "  porque sirvió a varios tickets y su gasto no se reparte. No se cuenta como",
      "  cero —eso lo haría parecer gratis— ni se estima: se deja dicho.",
    );
  }

  return `${lineas.join("\n")}\n`;
}
