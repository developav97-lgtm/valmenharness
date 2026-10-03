/** Proyección de lectura para el panel de ejecuciones de Mission Control. */
import {
  createExecutionContract,
  readExecutionSessionLinks,
  readExecutionStatus,
  type AuthorizedProject,
} from "@valmen/engine";
import {
  codexAdapterCapabilities,
  createHermesReadSource,
  hermesAdapterCapabilities,
  openCodeAdapterCapabilities,
  readHermesVisibleMessages,
  type AdapterCapabilities,
} from "@valmen/adapter";

function capabilities(adapter: string): AdapterCapabilities | null {
  if (adapter === "hermes") return hermesAdapterCapabilities();
  if (adapter === "opencode") return openCodeAdapterCapabilities();
  if (adapter === "codex") return codexAdapterCapabilities();
  return null;
}

function messageAvailability(project: AuthorizedProject, adapter: string, scope: string) {
  if (adapter !== "hermes") return { available: false, reason: "Este adaptador no publica mensajes visibles seguros." };
  if (project.hermesProfile === undefined || project.hermesProfile !== scope) {
    return { available: false, reason: "La sesión Hermes no pertenece al perfil autorizado del proyecto." };
  }
  return { available: true, reason: null };
}

/** Reúne sólo metadatos persistidos; nunca abre una conversación. */
export function readExecutionPanel(project: AuthorizedProject, ticketId: string) {
  const contract = createExecutionContract(project);
  return Object.freeze(contract.replay().filter((replay) => replay.identity.ticketId === ticketId).map((replay) => {
    const attempts = [...new Set(replay.events.map((event) => event.attemptId))];
    return Object.freeze({
      identity: replay.identity,
      status: readExecutionStatus(project, replay.identity),
      attempts: Object.freeze(attempts.map((attemptId) => Object.freeze({
        attemptId,
        activity: contract.readActivity(replay.identity, attemptId),
        configuredModels: contract.readConfiguredModels(replay.identity, attemptId),
        effectiveModels: contract.readEffectiveModels(replay.identity, attemptId),
        sessions: Object.freeze(readExecutionSessionLinks(project, replay.identity, attemptId).map((link) => Object.freeze({
          attemptId: link.attemptId, executor: link.executor,
          ...(link.origin === undefined ? {} : { origin: link.origin }),
          source: link.source, occurredAt: link.occurredAt,
          capabilities: capabilities(link.executor.adapter),
          messages: messageAvailability(project, link.executor.adapter, link.executor.scope),
        }))),
      }))),
    });
  }));
}

/** Lee una página únicamente si la referencia ya fue enlazada al intento exacto. */
export function readExecutionVisibleMessages(input: {
  readonly project: AuthorizedProject; readonly ticketId: string; readonly executionId: string;
  readonly attemptId: string; readonly sessionId: string; readonly afterId?: number; readonly limit?: number;
}) {
  const execution = readExecutionPanel(input.project, input.ticketId).find((entry) => entry.identity.executionId === input.executionId);
  const attempt = execution?.attempts.find((entry) => entry.attemptId === input.attemptId);
  const session = attempt?.sessions.find((entry) => entry.executor.sessionId === input.sessionId);
  if (session === undefined) throw new Error("La sesión no está enlazada a este intento de ejecución.");
  if (!session.messages.available || input.project.hermesProfile === undefined) {
    throw new Error(session.messages.reason ?? "La sesión no expone mensajes visibles.");
  }
  return readHermesVisibleMessages(createHermesReadSource({ profile: input.project.hermesProfile }), session.executor, {
    ...(input.afterId === undefined ? {} : { afterId: input.afterId }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
}
