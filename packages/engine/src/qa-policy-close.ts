/**
 * El cierre del ciclo de QA por política (R-QAAG-006).
 *
 * Es la única ruta que aprueba un ciclo sin una persona delante, y por eso cada condición se
 * comprueba en código antes de escribir nada: el ticket sigue siendo elegible, existe un recibo de
 * `qa-agent` aprobado que corresponde al commit y al árbol actuales, y la autorización que lo respaldó
 * sigue vigente. El ciclo queda atribuido a la autorización (id y hash) y al recibo, no al agente.
 * Pasar el ticket a `closed` no es parte de esto: es el paso de siempre.
 */
import { EXIT_INVARIANT, fail, parseTicket } from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { anotarResultadoPorPolitica, qaApproveByPolicy } from "./append.js";
import { ejecutarGitDeQaAgent, type EjecutorGitQa } from "./qa-agent-git.js";
import { ultimoReciboConLinea } from "./qa-agent-receipt.js";
import { autorizacionQueCubre, cupoRestante, registrarUsoDeCupo } from "./qa-authorization.js";
import { elegibilidadQa } from "./qa-eligibility.js";
import { modoEfectivoDeQaAgent } from "./qa-shadow.js";
import { transition } from "./transition.js";

export interface CierrePorPolitica {
  readonly ticketId: string;
  readonly authorization: { readonly id: string; readonly hash: string };
  readonly receipt: string;
  readonly delivered: string;
}

/** Cierra el ciclo de QA por política, o lanza con el motivo exacto sin dejar nada a medias. */
export function cerrarQaPorPolitica(request: {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly ahora?: Date;
  readonly ejecutarGit?: EjecutorGitQa;
}): CierrePorPolitica {
  const { paths, ticketId } = request;
  const ahora = request.ahora ?? new Date();
  const git = (args: readonly string[]): string => {
    const r = ejecutarGitDeQaAgent(args, paths.root, request.ejecutarGit);
    if (r.status !== 0) fail(`git ${args[0]} falló: ${r.stderr.trim()}`, EXIT_INVARIANT);
    return r.stdout.trim();
  };

  // En sombra la QA por agente corre y registra, pero no cierra (R-QAAG-008).
  const modo = modoEfectivoDeQaAgent(paths);
  if (modo.modo !== "close") {
    fail(`La QA por agente está en sombra: ${modo.motivo}. El responsable sigue aprobando; \`valmen qa-promote\` la promueve tras 20 tickets concordantes.`, EXIT_INVARIANT);
  }

  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) fail(`No existe el ticket ${ticketId}.`, EXIT_INVARIANT);
  const ticket = parseTicket(ubicado.text);
  if (ticket.fields.workflow_status !== "awaiting_user_tests") {
    fail(`El cierre por política parte de awaiting_user_tests; ${ticketId} está en ${ticket.fields.workflow_status}.`, EXIT_INVARIANT);
  }

  // 1. El recibo de qa-agent: aprobado y del commit y árbol actuales.
  const hallado = ultimoReciboConLinea(paths.root, ticketId);
  if (hallado === null) fail(`No hay recibo de qa-agent para ${ticketId}: corre \`valmen qa-agent\` primero.`, EXIT_INVARIANT);
  const { recibo, linea } = hallado;
  if (recibo.verdict !== "approve") fail("El último recibo de qa-agent no aprobó: no se puede cerrar por política.", EXIT_INVARIANT);
  const head = git(["rev-parse", "HEAD"]);
  if (recibo.delivered !== head) {
    fail(`El recibo probó ${recibo.delivered.slice(0, 12)} y el HEAD es ${head.slice(0, 12)}: el código cambió después de la verificación.`, EXIT_INVARIANT);
  }
  if (recibo.treeHash !== git(["rev-parse", "HEAD^{tree}"])) {
    fail("El árbol del HEAD no es el que el recibo de qa-agent probó.", EXIT_INVARIANT);
  }

  // 2. Sigue siendo elegible, con el diff desde el base del recibo.
  const diff = git(["diff", "--name-only", `${recibo.base}..${head}`]).split("\n").filter((l) => l !== "");
  const elegibilidad = elegibilidadQa({ paths, ticketId, ahora, archivosDelDiff: diff });
  if (!elegibilidad.elegible) {
    fail(`El ticket ya no es elegible: ${elegibilidad.reglas.filter((r) => !r.cumple).map((r) => `${r.regla} (${r.detalle})`).join("; ")}.`, EXIT_INVARIANT);
  }

  // 3. La autorización del recibo sigue vigente, cubre al ticket y le queda cupo.
  const autorizacion = autorizacionQueCubre(paths.root, { type: ticket.fields.type, module: ticket.fields.module, riskLevel: "low" }, ahora);
  if (autorizacion === null || recibo.authorization === null || autorizacion.id !== recibo.authorization.id || autorizacion.hash !== recibo.authorization.hash) {
    fail("La autorización citada por el recibo ya no está vigente o ya no cubre este ticket.", EXIT_INVARIANT);
  }
  if (cupoRestante(paths.root, autorizacion, ahora) <= 0) fail("La autorización agotó su cupo diario.", EXIT_INVARIANT);

  // 4. Se escribe: a in_qa, el ciclo completo en una sola escritura y a qa_approved.
  const recibo_ref = `.valmen/qa/agent-receipts.jsonl:${linea}`;
  const confirmacion = `policy:${autorizacion.id}:${autorizacion.hash}|recibo:${recibo_ref}`;
  anotarResultadoPorPolitica({ paths, ticketId, confirmation: confirmacion, now: () => ahora });
  transition({ paths, ticketId, entity: "ticket", to: "in_qa", now: () => ahora });
  qaApproveByPolicy({
    paths,
    ticketId,
    buildReference: `commit:${head}`,
    environment: "qa-agent: worktree limpio con la configuración del commit base",
    confirmation: confirmacion,
    now: () => ahora,
  });
  transition({ paths, ticketId, entity: "ticket", to: "qa_approved", now: () => ahora });
  registrarUsoDeCupo({ root: paths.root, authorizationId: autorizacion.id, ticketId, ahora });

  return { ticketId, authorization: { id: autorizacion.id, hash: autorizacion.hash }, receipt: recibo_ref, delivered: head };
}
