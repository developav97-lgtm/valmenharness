/**
 * Contexto compacto y determinista para retomar un ticket.
 *
 * El resumen se proyecta desde el ticket y el registro append-only de recibos;
 * no interviene un modelo. Así el agente recibe lo necesario para continuar y
 * puede pedir el documento íntegro solo cuando lo necesita.
 */
import {
  fasesDeSesion,
  type ClienteDeSesion,
  type FaseDelAgente,
  type FasesDeSesion,
} from "@valmen/adapter";
import type { ParsedTicket } from "@valmen/core";

import { procedenciaDeTicket, type Procedencia } from "./provenance.js";
import { duracionEnTexto, duracionesPorEtapa, type EtapaDeTicket } from "./etapas.js";
import { computeNextStep, renderNextStep, type NextStep } from "./next-step.js";
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
  /**
   * Lo que toca hacer ahora, calculado por el motor a partir del estado, lo escrito en
   * el ticket y los recibos. Es lo primero que un agente que retoma debe leer: sin
   * esto, «continúa con el ticket» obliga a adivinar el orden y dónde detenerse.
   */
  readonly nextStep: NextStep;
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
  /** El modelo de cada fase para esta sesión y con qué lanzar su subagente (R-PERF-007). */
  readonly fases: FasesDeSesion;
  /** Si la fase actual se delega a un subagente con el modelo del perfil, y cómo (R-PERF-007). */
  readonly delegacion: DelegacionDeFase;
  /** Solo se incluye en modo completo; conserva los bytes leídos del ticket. */
  readonly documentoCompleto?: string;
}

/** Qué hace la sesión anfitriona con la fase actual: delegarla o hacerla ella misma. */
export type DelegacionDeFase =
  | {
      readonly modo: "subagente";
      readonly fase: FaseDelAgente;
      readonly alias: string;
      readonly model: string;
      readonly instrucciones: readonly string[];
    }
  | {
      readonly modo: "sesion";
      readonly fase: FaseDelAgente | null;
      readonly motivo: string;
    };

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
  cliente?: ClienteDeSesion,
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

  const fases = fasesDeSesion(paths.root, {
    ...(cliente === undefined ? {} : { cliente }),
    estado: fields.workflow_status,
  });

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
    nextStep: computeNextStep(paths, ticket, recibos),
    etapas: duracionesPorEtapa(ticket.blocks.Eventos ?? []),
    readInstruction:
      "Lee las secciones completas bajo demanda con ver_ticket usando el mismo identificador.",
    provenance: procedenciaDeTicket(paths.root, fields.id),
    fases,
    delegacion: delegacionDeFase(fases, fields.id),
    ...(modo === "completo" ? { documentoCompleto: ticket.text } : {}),
  };
}

/**
 * Lo que la sesión interactiva hace con la fase actual (R-PERF-007).
 *
 * Es una instrucción y no un cambio: `resume` sigue de solo lectura y la sesión nunca cambia
 * su modelo. Solo se delega si el cliente admite subagentes y la fase es de su proveedor; un
 * estado sin fase del agente es un alto humano y no se delega.
 */
export function delegacionDeFase(fases: FasesDeSesion, id: string): DelegacionDeFase {
  const actual = fases.faseActual;
  if (actual === null) {
    return {
      modo: "sesion",
      fase: null,
      motivo: "el estado no es de una fase del agente: no se delega lo que decide una persona",
    };
  }
  const fase = fases.fases.find((f) => f.fase === actual);
  if (fase === undefined) {
    return {
      modo: "sesion",
      fase: actual,
      motivo: `${fases.aviso ?? "no hay modelo resuelto para la fase"}; haz la fase en esta sesión con el modelo de la sesión`,
    };
  }
  if (fase.subagente === null) {
    return {
      modo: "sesion",
      fase: actual,
      motivo: `${fase.aviso ?? fases.aviso ?? "la fase no se delega"}; haz la fase en esta sesión con el modelo de la sesión`,
    };
  }
  const cliente = fases.cliente ?? "";
  return {
    modo: "subagente",
    fase: actual,
    alias: fase.subagente,
    model: fase.model,
    instrucciones: [
      `1. Crea el worktree del ticket: valmen journey worktree create --id ${id}`,
      `2. Lanza un subagente con el modelo ${fase.subagente} (perfil: ${fase.provider}/${fase.model}) cuyo único contexto es el texto de: valmen journey brief --id ${id} --cliente ${cliente}`,
      "3. No cambies el modelo de esta sesión: solo el subagente corre con el modelo de la fase.",
      `4. Al recibir su informe, integra con: valmen journey worktree integrate --id ${id} y vuelve a llamar resume.`,
      "5. Si eres el subagente y te llegó un brief, haz la fase tú y no delegues.",
    ],
  };
}

export function renderDelegacion(delegacion: DelegacionDeFase): string[] {
  if (delegacion.modo === "sesion") {
    return [`Delegación de la fase${delegacion.fase === null ? "" : ` ${delegacion.fase}`}: ${delegacion.motivo}.`];
  }
  return [`Delegación de la fase ${delegacion.fase}:`, ...delegacion.instrucciones];
}

export function renderFases(fases: FasesDeSesion): string[] {
  const lines = [`Modelos por fase (cliente: ${fases.cliente ?? "no declarado"}):`];
  for (const f of fases.fases) {
    const marca = f.fase === fases.faseActual ? "→" : "-";
    const origen = f.origen.perfil === undefined ? f.origen.source : `perfil ${f.origen.perfil.id}`;
    const destino = f.subagente === null ? (f.aviso ?? "sin subagente") : `subagente ${f.subagente}`;
    lines.push(`${marca} ${f.fase}: ${f.provider}/${f.model} (${f.effort}, ${origen}) — ${destino}`);
  }
  if (fases.nota !== null) lines.push(`Nota: ${fases.nota}`);
  if (fases.aviso !== null) lines.push(`Aviso: ${fases.aviso}`);
  return lines;
}

/**
 * Forma corta para quien solo necesita el estado (`resume --quiet`): tres líneas, sin plan,
 * puntos, fases, recibo ni duraciones.
 */
export function renderResumeQuiet(context: ResumeContext): string {
  const una = (texto: string): string => texto.replace(/\s+/g, " ").trim();
  const paso = context.nextStep.pasos[0];
  const titulo = context.nextStep.fase !== "" ? context.nextStep.fase : (paso ?? "sin paso pendiente");
  const alto = context.nextStep.alto;
  return (
    [
      `${context.id} — ${context.status.workflow} · QA: ${context.status.qa} · Release: ${context.status.release}`,
      `Siguiente paso: ${una(titulo)}`,
      alto === null ? "Alto: ninguno." : `Alto: ${una(alto)}`,
    ].join("\n") + "\n"
  );
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

  // Justo debajo del estado y antes del plan, que puede ser largo: es lo primero que
  // hay que leer, y enterrado al final se pasaba de largo.
  lines.push(...renderNextStep(context.nextStep));
  lines.push(...renderDelegacion(context.delegacion));

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

  lines.push(...renderFases(context.fases));

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
