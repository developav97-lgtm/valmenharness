/**
 * Registro temporal para las pruebas de la ola y el brief de la corrida orquestada: bindings,
 * `config.yaml`, tickets, jornada y utilidades para comparar el árbol del registro.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderFixtureTicket, writeFixtureTicket } from "./fixtures.js";
import {
  createJourney,
  resolveAuthorizedProject,
  type JourneyTicketInput,
  type JourneyWindowInput,
} from "../../packages/engine/src/index.js";

export const PROYECTO_OLA = "ola-lab";

export interface EntornoOla {
  readonly home: string;
  readonly root: string;
  project(): ReturnType<typeof resolveAuthorizedProject>;
  limpiar(): void;
}

/** Crea home, binding y configuración de un proyecto temporal. */
export function crearEntornoOla(): EntornoOla {
  const home = join(tmpdir(), `valmen-ola-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: qa\nprojects:\n  ${PROYECTO_OLA}:\n    root: ${root}\n`,
  );
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${PROYECTO_OLA}\n`);
  return {
    home,
    root,
    project: () => resolveAuthorizedProject({ projectId: PROYECTO_OLA, home }),
    limpiar: () => rmSync(home, { recursive: true, force: true }),
  };
}

/** Un ticket del registro en el estado pedido. */
export function ticketEn(
  root: string,
  id: string,
  workflowStatus: string,
  extra: { readonly type?: string } = {},
): void {
  // El validador exige el resultado del PO en los estados de QA y que `qa_status` siga al último ciclo.
  const conResultado = ["awaiting_user_tests", "changes_requested", "in_qa", "qa_approved", "closed"].includes(workflowStatus);
  const qaStatus = workflowStatus === "in_qa" ? "in_qa" : workflowStatus === "qa_approved" || workflowStatus === "closed" ? "approved" : undefined;
  const opciones = {
    id,
    workflowStatus,
    type: extra.type ?? "FEATURE",
    module: "JOURNEY",
    ...(qaStatus === undefined ? {} : { qaStatus }),
    ...(conResultado ? { pruebas: "Resultado del PO: aprobado." } : {}),
  };
  const pendiente = { id: "QA-001", date: "2026-10-08", build_reference: "worktree:sha256:" + "0".repeat(64), environment: "test", result: "pending", findings: [], correction: null, po_confirmation: null };
  const aprobado = { id: "QA-002", date: "2026-10-08", build_reference: null, environment: null, result: "approved", findings: [], correction: null, po_confirmation: "aprobado por pruebas" };
  const cierre = [
    { kind: "ticket-close", id: "CLOSE-001", date: "2026-10-08", technical_summary: "Prueba cerrada.", functional_summary: "Prueba cerrada.", qa_status: "approved", qa_waiver_reason: null, po_confirmation: null, release_impact: "Sin publicación." },
  ];
  const qa = workflowStatus === "in_qa" ? [pendiente] : workflowStatus === "qa_approved" || workflowStatus === "closed" ? [pendiente, aprobado] : [];
  if (qa.length === 0) {
    writeFixtureTicket(root, opciones);
    return;
  }
  let contenido = renderFixtureTicket(opciones).replace(
    "## QA\n\n```json\n[]\n```",
    `## QA\n\n\`\`\`json\n${JSON.stringify(qa, null, 2)}\n\`\`\``,
  );
  if (workflowStatus === "closed") {
    contenido = contenido.replace(
      "## Cierre\n\n```json\n[]\n```",
      `## Cierre\n\n\`\`\`json\n${JSON.stringify(cierre, null, 2)}\n\`\`\``,
    );
  }
  const carpeta = join(root, "tickets", id.slice(-8, -4), id);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "ticket.md"), contenido, "utf8");
}

/** La entrada de un ticket en la jornada. */
export function enJornada(
  ticketId: string,
  order: number,
  extra: { readonly priority?: number; readonly dependsOn?: readonly string[]; readonly windowId?: string } = {},
): JourneyTicketInput {
  return {
    ticketId,
    order,
    priority: extra.priority ?? order,
    dependsOn: extra.dependsOn ?? [],
    start: extra.windowId === undefined ? { condition: "manual" } : { condition: "window" },
    ...(extra.windowId === undefined ? {} : { windowId: extra.windowId }),
    authorizationIds: [],
  };
}

export function crearJornada(
  entorno: EntornoOla,
  tickets: readonly JourneyTicketInput[],
  opciones: { readonly journeyId?: string; readonly windows?: readonly JourneyWindowInput[] } = {},
): void {
  createJourney(entorno.project(), {
    revisionId: `rev-${opciones.journeyId ?? "dia"}`,
    journeyId: opciones.journeyId ?? "dia",
    occurredAt: "2026-10-08T12:00:00.000Z",
    tickets,
    ...(opciones.windows === undefined ? {} : { windows: opciones.windows }),
  });
}

/** Todo archivo bajo `dir` con su contenido: sirve para afirmar que nada cambió. */
export function fotoDelArbol(dir: string): Record<string, string> {
  const foto: Record<string, string> = {};
  const recorrer = (actual: string): void => {
    for (const nombre of readdirSync(actual).sort()) {
      if (nombre === ".git") continue;
      const ruta = join(actual, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else foto[ruta.slice(dir.length)] = readFileSync(ruta, "utf8");
    }
  };
  recorrer(dir);
  return foto;
}
