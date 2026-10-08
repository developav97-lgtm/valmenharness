/**
 * El brief de un ticket para un subagente de la corrida orquestada.
 *
 * Es el único contexto que recibe el subagente, así que es autocontenido: dónde trabaja, qué toca
 * hacer ahora (lo mismo que `valmen resume`), con qué modelo, qué compuertas corre, qué entrega y
 * qué no puede hacer. Es una consulta de solo lectura: no crea el worktree ni lanza al subagente.
 */
import { type ClienteDeSesion, type FaseDeSesion } from "@valmen/adapter";
import { parseTicket } from "@valmen/core";

import { findTicket } from "./discovery.js";
import { renderNextStep } from "./next-step.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { buildResumeContext, renderFases, type ResumeContext } from "./resume.js";
import { worktreeDelTicket, type WorktreeSugerido } from "./journey-wave.js";

/** Estados desde los que un subagente puede arrancar. */
export const ESTADOS_LANZABLES = ["intake", "analyzed", "approved", "in_progress", "changes_requested"] as const;

export interface CompuertaDelBrief {
  readonly fase: string;
  /** Los estados del ticket a los que aplica. */
  readonly estados: readonly string[];
  readonly comandos: readonly { readonly comando: string; readonly evaluador: string | null }[];
  /** Por qué esta fase no lleva compuertas para el subagente, si no las lleva. */
  readonly nota: string | null;
}

export interface BriefDeSubagente {
  readonly ticketId: string;
  readonly titulo: string;
  readonly tipo: string;
  readonly modulo: string;
  readonly estado: string;
  readonly lanzable: boolean;
  readonly motivoNoLanzable: string | null;
  readonly worktree: WorktreeSugerido;
  /** El comando que el orquestador corre para crear el worktree; el subagente no lo corre. */
  readonly comandoWorktree: string;
  readonly raiz: string;
  readonly resume: ResumeContext;
  /** La fase del estado, con su modelo, esfuerzo y alias de subagente. */
  readonly fase: FaseDeSesion | null;
  readonly skills: readonly string[];
  readonly compuertas: readonly CompuertaDelBrief[];
  readonly contratoDeEntrega: readonly string[];
  readonly prohibiciones: readonly string[];
  /** Solo en un ticket SECURITY: lo que queda para una persona. */
  readonly bloqueSecurity: readonly string[];
}

export interface ArmarBriefRequest {
  readonly project: AuthorizedProject;
  readonly ticketId: string;
  readonly cliente?: ClienteDeSesion | undefined;
}

/** Arma el brief; un ticket que no existe lanza un error que nombra el id. */
export function armarBriefDeSubagente(request: ArmarBriefRequest): BriefDeSubagente {
  const { project, ticketId } = request;
  const ubicado = findTicket(project.paths, ticketId);
  if (ubicado === undefined) {
    throw new Error(`El ticket ${ticketId} no existe en el proyecto ${project.projectId}.`);
  }
  const ticket = parseTicket(ubicado.text);
  const estado = ticket.fields.workflow_status as string;
  const resume = buildResumeContext(project.paths, ticket, "compacto", request.cliente ?? "claude");
  const worktree = worktreeDelTicket(project.root, ticketId);
  const motivoNoLanzable = motivoDeNoLanzable(estado);
  const esSecurity = ticket.fields.type === "SECURITY";

  return Object.freeze({
    ticketId,
    titulo: ticket.fields.title,
    tipo: ticket.fields.type,
    modulo: ticket.fields.module,
    estado,
    lanzable: motivoNoLanzable === null,
    motivoNoLanzable,
    worktree,
    comandoWorktree: `git -C ${project.root} worktree add -b ${worktree.rama} ${worktree.ruta}`,
    raiz: project.root,
    resume,
    fase: resume.fases.fases.find((fase) => fase.fase === resume.fases.faseActual) ?? null,
    skills: resume.nextStep.skills,
    compuertas: compuertasPorFase(ticketId),
    contratoDeEntrega: contratoDeEntrega(ticketId),
    prohibiciones: prohibiciones(project.root, worktree),
    bloqueSecurity: esSecurity ? bloqueSecurity() : [],
  });
}

/** El brief en texto, listo para pegarlo como prompt del subagente. */
export function renderBriefDeSubagente(brief: BriefDeSubagente): string {
  const lineas = [
    `Brief de subagente — ${brief.ticketId}: ${brief.titulo}`,
    `Tipo/Módulo: ${brief.tipo} / ${brief.modulo} · Estado: ${brief.estado}`,
  ];
  if (brief.lanzable) {
    lineas.push("Lanzable: sí.");
  } else {
    lineas.push(`NO LANZABLE: ${brief.motivoNoLanzable ?? "el estado no admite un subagente"}`);
  }

  lineas.push(
    "",
    "Dónde trabajas:",
    `- Worktree: ${brief.worktree.ruta}`,
    `- Rama: ${brief.worktree.rama}`,
    `- El orquestador lo crea con: ${brief.comandoWorktree}`,
    "  (si la rama ya existe: `git worktree add <ruta> <rama>` sin `-b`). Todo comando corre con ese directorio como cwd.",
    "",
    ...renderNextStep(brief.resume.nextStep),
    "",
    ...renderFases(brief.resume.fases),
  );
  if (brief.fase !== null) {
    lineas.push(`Modelo de tu fase (${brief.fase.fase}): ${brief.fase.model}, esfuerzo ${brief.fase.effort}.`);
    if (brief.fase.subagente !== null) lineas.push(`Alias de subagente: ${brief.fase.subagente}.`);
    else if (brief.fase.aviso !== null) lineas.push(`Aviso de la fase: ${brief.fase.aviso}.`);
  } else {
    lineas.push("El estado del ticket no corresponde a una fase con modelo propio.");
  }

  lineas.push(
    "",
    brief.skills.length > 0
      ? `Skills a cargar: ${brief.skills.join(", ")}.`
      : "Skills a cargar: ninguna de proceso en esta fase.",
    "",
    "Compuertas por fase:",
  );
  for (const compuerta of brief.compuertas) {
    const marca = compuerta.estados.includes(brief.estado) ? "→" : "-";
    lineas.push(`${marca} ${compuerta.fase} (${compuerta.estados.join(", ")}):`);
    if (compuerta.comandos.length === 0) lineas.push(`    ${compuerta.nota ?? "sin compuertas para el subagente"}`);
    for (const comando of compuerta.comandos) {
      lineas.push(`    ${comando.comando}${comando.evaluador === null ? "" : ` (evaluador ${comando.evaluador})`}`);
    }
  }

  lineas.push("", "Contrato de entrega:");
  for (const linea of brief.contratoDeEntrega) lineas.push(`- ${linea}`);

  lineas.push("", "Lo que NO haces:");
  for (const linea of brief.prohibiciones) lineas.push(`- ${linea}`);

  if (brief.bloqueSecurity.length > 0) {
    lineas.push("", "Ticket SECURITY — solo persona:");
    for (const linea of brief.bloqueSecurity) lineas.push(`- ${linea}`);
  }

  return `${lineas.join("\n")}\n`;
}

function motivoDeNoLanzable(estado: string): string | null {
  if ((ESTADOS_LANZABLES as readonly string[]).includes(estado)) return null;
  switch (estado) {
    case "planned":
      return "El plan espera la aprobación de una persona; un subagente no la da.";
    case "awaiting_user_tests":
    case "in_qa":
      return "Está en verificación: las pruebas son del responsable, no de un subagente.";
    case "qa_approved":
    case "closed":
      return "Ya está entregado: no queda trabajo para un subagente.";
    case "blocked":
      return "El ticket está bloqueado: una persona decide cómo se desbloquea.";
    default:
      return `El estado ${estado} no admite un subagente.`;
  }
}

function compuertasPorFase(ticketId: string): CompuertaDelBrief[] {
  return [
    {
      fase: "análisis",
      estados: ["intake"],
      comandos: [
        { comando: `valmen precheck analysis --id ${ticketId}`, evaluador: null },
        { comando: `valmen gate analysis --id ${ticketId} --evaluator cascade`, evaluador: "cascade" },
      ],
      nota: null,
    },
    {
      fase: "plan",
      estados: ["analyzed"],
      comandos: [
        { comando: `valmen precheck plan --id ${ticketId}`, evaluador: null },
        { comando: `valmen gate plan --id ${ticketId} --evaluator cascade`, evaluador: "cascade" },
      ],
      nota: null,
    },
    {
      fase: "implementación",
      estados: ["approved", "in_progress", "changes_requested"],
      comandos: [
        { comando: `valmen gate qa-mechanical --id ${ticketId} --evaluator command`, evaluador: "command" },
      ],
      nota: null,
    },
    {
      fase: "verificación",
      estados: ["awaiting_user_tests", "in_qa"],
      comandos: [],
      nota: "sin compuertas para el subagente: la verificación es del responsable.",
    },
  ];
}

function contratoDeEntrega(ticketId: string): string[] {
  return [
    "Antes de implementar, el diagnóstico y el plan se escriben en el ticket (no en la conversación) y te detienes en el alto que declare el siguiente paso.",
    "Al implementar, la sección `## Pruebas` del ticket lleva el contrato: comandos exactos, directorio de ejecución, resultado esperado, validaciones manuales y requisitos de ambiente.",
    "Los criterios de aceptación que verificaste quedan marcados con `- [x]`; el que no pudiste verificar queda sin marcar y lo dices.",
    `Registra el consumo de IA del ticket antes de pasar a awaiting_user_tests (\`registrar_consumo_ia\` o \`valmen add-ai-usage --id ${ticketId}\`), con los números de la sesión o \`manual:\` sin números si no los expone.`,
    "Corre `valmen secrets` antes de commitear.",
    "Commit solo en la rama del worktree, con `git add` explícito de los archivos del ticket; nunca `git add -A`. Sin push ni merge: integrar es del orquestador.",
    "Responde en pocas líneas: estado final, hash del commit, archivos tocados, pruebas corridas con su resultado y qué decide una persona.",
  ];
}

function prohibiciones(raiz: string, worktree: WorktreeSugerido): string[] {
  return [
    "No apruebes nada que decida una persona: la aprobación del plan sin autorización vigente, la QA, el cierre, un release ni un despliegue. Si una compuerta da REVIEW o BLOCK, detente y reporta; no la fuerces.",
    `No toques el checkout principal (${raiz}) ni otros worktrees: trabajas solo en ${worktree.ruta}.`,
    "No corras `npx vitest run` sin archivos: corre solo los archivos de prueba del ticket y los que tu cambio pueda romper. La suite completa la corre el orquestador al integrar.",
    "No hagas push, merge, tag ni despliegue.",
    "No edites eventos, puntos, ciclos de QA, evidencia ni cierres ya registrados: son append-only.",
  ];
}

function bloqueSecurity(): string[] {
  return [
    "El plan, la QA y toda aprobación de este ticket son solo de una persona, aun con una autorización vigente.",
    "Prepara el trabajo y la evidencia; no apruebes, no cierres y no marques QA como aprobada.",
  ];
}
