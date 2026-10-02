/** Resolución segura de identidades lógicas de proyecto en esta máquina. */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

import {
  machineBindingsPath,
  parseConfig,
  parseMachineBindings,
  readSharedProjectPolicy,
  type MachineBindings,
  type MachineProjectBinding,
} from "@valmen/adapter";
import { fail } from "@valmen/core";

import { choosePaths, type RegistryPaths } from "./discovery.js";

export interface AuthorizedProject {
  readonly projectId: string;
  readonly machineId: string;
  readonly root: string;
  readonly hermesProfile?: string | undefined;
  readonly paths: RegistryPaths;
}
export interface ResolveAuthorizedProjectRequest {
  readonly projectId: string;
  readonly home?: string | undefined;
}
export interface ResolveProjectForHermesProfileRequest {
  readonly profile: string;
  readonly home?: string | undefined;
}

/** Resuelve exclusivamente una entrada declarada en el binding local. */
export function resolveAuthorizedProject(
  request: ResolveAuthorizedProjectRequest,
): AuthorizedProject {
  const home = request.home ?? homedir();
  const bindings = readBindings(home);
  const binding = bindings.projects[request.projectId];
  if (binding === undefined) {
    fail(
      `El proyecto "${request.projectId}" no está declarado en ${machineBindingsPath(home)}.`,
    );
  }
  return validateProject(request.projectId, bindings.machineId, binding);
}

/** Validación compartida por la resolución individual y el catálogo. */
function validateProject(
  projectId: string,
  machineId: string,
  binding: MachineProjectBinding,
): AuthorizedProject {
  const configPath = `${binding.root}/.valmen/config.yaml`;
  if (!existsSync(configPath)) {
    fail(`El binding de "${projectId}" no contiene una configuración de proyecto legible.`);
  }
  const policy = readSharedProjectPolicy(parseConfig(readFileSync(configPath, "utf8")));
  if (policy.projectId !== projectId) {
    fail(`El project-id de "${binding.root}" no coincide con el binding "${projectId}".`);
  }
  return Object.freeze({
    projectId,
    machineId,
    root: binding.root,
    ...(binding.hermesProfile === undefined
      ? {}
      : { hermesProfile: binding.hermesProfile }),
    paths: Object.freeze(choosePaths(binding.root)),
  });
}

export type AuthorizedProjectEntry =
  | (AuthorizedProject & { readonly available: true; readonly reason: null })
  | {
      readonly projectId: string;
      readonly machineId: string;
      readonly root: string;
      readonly available: false;
      readonly reason: string;
    };

export interface AuthorizedProjectCatalog {
  readonly available: boolean;
  readonly reason: string | null;
  readonly projects: readonly AuthorizedProjectEntry[];
}

/** Lee el catálogo sin ocultar proyectos que no están disponibles en esta máquina. */
export function listAuthorizedProjects(
  request: { readonly home?: string; readonly bindingsFile?: string } = {},
): AuthorizedProjectCatalog {
  const path = request.bindingsFile ?? machineBindingsPath(request.home ?? homedir());
  let bindings: MachineBindings;
  try {
    bindings = parseMachineBindings(readFileSync(path, "utf8"));
  } catch {
    return {
      available: false,
      reason: `No se pudo leer o validar el catálogo de proyectos: ${path}.`,
      projects: [],
    };
  }
  return {
    available: true,
    reason: null,
    projects: Object.entries(bindings.projects).map(([projectId, binding]) => {
      try {
        return {
          ...validateProject(projectId, bindings.machineId, binding),
          available: true as const,
          reason: null,
        };
      } catch {
        return {
          projectId,
          machineId: bindings.machineId,
          root: binding.root,
          available: false as const,
          reason: `No se pudo validar el proyecto "${projectId}": su configuración no es legible o su project-id no coincide con el binding.`,
        };
      }
    }),
  };
}

/** Asocia un perfil Hermes solo si el binding local lo declara exactamente. */
export function resolveProjectForHermesProfile(
  request: ResolveProjectForHermesProfileRequest,
): AuthorizedProject | null {
  const home = request.home ?? homedir();
  const bindings = readBindings(home);
  const projectId = Object.entries(bindings.projects).find(
    ([, binding]) => binding.hermesProfile === request.profile,
  )?.[0];
  return projectId === undefined ? null : resolveAuthorizedProject({ projectId, home });
}

function readBindings(home: string) {
  const path = machineBindingsPath(home);
  try {
    return parseMachineBindings(readFileSync(path, "utf8"));
  } catch (error) {
    if (!existsSync(path)) fail(`No existe el archivo de bindings locales: ${path}.`);
    throw error;
  }
}
