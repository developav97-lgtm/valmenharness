/** Política de jornadas: consultar nunca concede permiso. */
import { readFileSync } from "node:fs";
import { parseConfig, readExecutionCapabilities } from "@valmen/adapter";
import { type AuthorizedProject } from "./project-resolution.js";

export interface JourneyAuthorization {
  readonly projectId: string;
  readonly observationSources: readonly string[];
  readonly dispatchExecutors: readonly string[];
  canObserve(source: string): boolean;
  canDispatch(executor: string): boolean;
}

/** Lee solo la política compartible del proyecto ya autorizado; no escribe ni inicia nada. */
export function readJourneyAuthorization(project: AuthorizedProject): JourneyAuthorization {
  const capabilities = readExecutionCapabilities(
    parseConfig(readFileSync(`${project.root}/.valmen/config.yaml`, "utf8")),
  );
  return Object.freeze({
    projectId: project.projectId,
    observationSources: capabilities.observationSources,
    dispatchExecutors: capabilities.dispatchExecutors,
    canObserve: (source: string) => capabilities.observationSources.includes(source),
    canDispatch: (executor: string) => capabilities.dispatchExecutors.includes(executor),
  });
}
