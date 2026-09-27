/**
 * Contexto compacto y determinista para retomar un ticket.
 *
 * El resumen se proyecta desde el ticket y el registro append-only de recibos;
 * no interviene un modelo. Así el agente recibe lo necesario para continuar y
 * puede pedir el documento íntegro solo cuando lo necesita.
 */
import type { ParsedTicket } from "@valmen/core";

import { procedenciaDeTicket, type Procedencia } from "./provenance.js";
import { duracionEnTexto, duracionesPorEtapa, type EtapaDeTicket } from "./etapas.js";
import { readReceipts } from "./receipts.js";
import type { RegistryPaths } from "./discovery.js";

export type ResumeMode = "compacto" | "completo";

export interface ResumeStatus {
  readonly workflow: string;
  readonly qa: string;
  readonly release: string;
}

export interface ResumeReceipt {
  readonly id: string;
  readonly gate: string;
  readonly outcome: string;
  readonly reason: string;
  readonly decidedAt: string;
}

export interface ResumePoint {
  readonly id: string;
  readonly status: string;
  readonly title: string;
  readonly severity: string;
}

export interface ResumeContext {
  readonly modo: ResumeMode;
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly module: string;
  readonly status: ResumeStatus;
  readonly plan: string;
  readonly openPoints: readonly ResumePoint[];
  readonly lastReceipt: ResumeReceipt | null;
  readonly readInstruction: string;
  /**
   * Lo que tardó cada etapa, desde los eventos del ticket.
   *
   * Es determinista —dos marcas de la misma lista— y `ms: null` significa «no
   * reconstruible», no «instantáneo»: los eventos escritos antes de que existiera
   * la hora no se pueden medir, y el contexto lo dice en vez de estimarlo.
   */
  readonly etapas: readonly EtapaDeTicket[];
  readonly provenance: Procedencia | null;
  /** Solo se incluye en modo completo; conserva los bytes leídos del ticket. */
  readonly documentoCompleto?: string;
}

const ESTADOS_PUNTO_ABIERTO = new Set([
  "open",
  "analyzed",
  "in_progress",
  "awaiting_retest",
]);

/** Proyecta el ticket a una forma compacta o completa, sin inferencias de modelo. */
export function buildResumeContext(
  paths: RegistryPaths,
  ticket: ParsedTicket,
  modo: ResumeMode = "compacto",
): ResumeContext {
  const { fields } = ticket;
  const recibos = readReceipts(paths, fields.id);
  const ultimo = recibos.at(-1);
  const lastReceipt: ResumeReceipt | null =
    ultimo === undefined
      ? null
      : {
          id: ultimo.id,
          gate: ultimo.gate,
          outcome: ultimo.outcome,
          reason: ultimo.reason,
          decidedAt: ultimo.decidedAt,
        };

  return {
    modo,
    id: fields.id,
    title: fields.title,
    type: fields.type,
    module: fields.module,
    status: {
      workflow: fields.workflow_status,
      qa: fields.qa_status,
      release: fields.release_status,
    },
    plan: ticket.sections["Plan"].trim(),
    openPoints: ticket.blocks.Puntos.filter((point) =>
      ESTADOS_PUNTO_ABIERTO.has(String(point["status"])),
    ).map((point) => ({
      id: String(point["id"]),
      status: String(point["status"]),
      title: String(point["title"]),
      severity: String(point["severity"]),
    })),
    lastReceipt,
    etapas: duracionesPorEtapa(ticket.blocks.Eventos ?? []),
    readInstruction:
      "Lee las secciones completas bajo demanda con ver_ticket usando el mismo identificador.",
    provenance: procedenciaDeTicket(paths.root, fields.id),
    ...(modo === "completo" ? { documentoCompleto: ticket.text } : {}),
  };
}

/** Representación legible del contexto compacto, en orden estable. */
export function renderResumeContext(context: ResumeContext): string {
  if (context.modo === "completo") return context.documentoCompleto ?? "";

  const lines = [
    `Ticket: ${context.id} — ${context.title}`,
    `Tipo/Módulo: ${context.type} / ${context.module}`,
    `Estado: ${context.status.workflow} · QA: ${context.status.qa} · Release: ${context.status.release}`,
  ];

  if (context.provenance !== null) {
    lines.push(
      `Feature: ${context.provenance.slug} — ${context.provenance.title}`,
      `Sprint: ${context.provenance.sprint}` +
        (context.provenance.sprintGoal === "" ? "" : ` — ${context.provenance.sprintGoal}`),
    );
    if (context.provenance.dependsOn.length > 0) {
      lines.push(`Depende de: ${context.provenance.dependsOn.join(", ")}`);
    }
    if (context.provenance.domains.length > 0) {
      lines.push(
        `Spec: ${context.provenance.specDir} — ${context.provenance.domains.join(", ")}`,
      );
    }
  }

  lines.push("Plan vigente:", context.plan || "(sin plan registrado)", "Puntos abiertos:");
  if (context.openPoints.length === 0) {
    lines.push("- Ninguno");
  } else {
    for (const point of context.openPoints) {
      lines.push(
        `- ${String(point["id"])} [${String(point["status"])}] ${String(point["title"] ?? "")}`.trimEnd(),
      );
    }
  }

  if (context.lastReceipt === null) {
    lines.push("Último recibo de compuerta: ninguno.");
  } else {
    lines.push(
      `Último recibo de compuerta: ${context.lastReceipt.id} · ${context.lastReceipt.gate} · ` +
        `${context.lastReceipt.outcome} · ${context.lastReceipt.reason}`,
    );
  }

  lines.push("Duración por etapa:");
  if (context.etapas.length === 0) {
    lines.push("- Sin marcas de workflow en los eventos.");
  } else {
    for (const etapa of context.etapas) {
      const marca = etapa.at === null ? "" : ` (${etapa.at})`;
      lines.push(
        `- ${etapa.estado}${marca}: ${etapa.ms === null ? "no reconstruible" : duracionEnTexto(etapa.ms)}`,
      );
    }
  }

  lines.push(context.readInstruction);
  return `${lines.join("\n")}\n`;
}
