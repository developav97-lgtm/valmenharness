/** Frescura por fuente de observación, sin abrir conversaciones ni escribir estado. */
import { createHermesReadSource, readHermesChanges, type HermesChanges } from "@valmen/adapter";
import { readExecutionEvents, readJourneyAuthorization, type AuthorizedProject } from "@valmen/engine";

export type FreshnessState = "fresh" | "stale" | "unavailable";
export interface SourceFreshness {
  readonly source: string;
  readonly state: FreshnessState;
  readonly checkedAt: string | null;
  readonly lastReceivedAt: string | null;
  readonly reason: string | null;
}

type HermesReader = (source: ReturnType<typeof createHermesReadSource>) => HermesChanges;

/**
 * Declara la señal observada, no una actividad inferida: un reloj o la ausencia
 * de eventos no prueban que un worker haya fallado. El último dato viene del
 * log append-only, por lo que sobrevive a una lectura actual fallida.
 */
export function readSourceFreshness(
  project: AuthorizedProject,
  options: { readonly now?: Date; readonly readHermes?: HermesReader } = {},
): readonly SourceFreshness[] {
  const now = (options.now ?? new Date()).toISOString();
  const events = readExecutionEvents(project);
  return Object.freeze(readJourneyAuthorization(project).observationSources.map((source) => {
    const lastReceivedAt = events.filter((event) => event.source === source).at(-1)?.receivedAt ?? null;
    if (source !== "hermes") {
      return Object.freeze({
        source, state: "unavailable" as const, checkedAt: null, lastReceivedAt,
        reason: "No hay lector integrado para esta fuente en Mission Control.",
      });
    }
    if (project.hermesProfile === undefined) {
      return Object.freeze({
        source, state: "unavailable" as const, checkedAt: null, lastReceivedAt,
        reason: "Hermes no está enlazado al proyecto autorizado en esta máquina.",
      });
    }
    const changes = (options.readHermes ?? ((reader) => readHermesChanges(reader, { limit: 1 }))) (
      createHermesReadSource({ profile: project.hermesProfile }),
    );
    const status = changes.board.status === "available" && changes.sessions.status === "available"
      ? "available"
      : changes.board.status === "incompatible" || changes.sessions.status === "incompatible"
        ? "incompatible"
        : "unavailable";
    return Object.freeze(status === "available"
      ? { source, state: "fresh" as const, checkedAt: now, lastReceivedAt, reason: null }
      : {
          source, state: "stale" as const, checkedAt: now, lastReceivedAt,
          reason: status === "incompatible"
            ? "La instalación Hermes no es compatible con el lector local."
            : "Hermes no está disponible para esta lectura.",
        });
  }));
}
