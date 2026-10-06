/**
 * Bindings locales de una máquina.
 *
 * La política del proyecto se versiona en `.valmen/config.yaml`; sus rutas,
 * perfiles y demás referencias de instalación viven aquí, fuera del repositorio.
 * Este módulo solo analiza y valida texto: no lee disco ni toca credenciales.
 */
import { isAbsolute, join } from "node:path";

import { PROJECT_ID_RE, type YamlValue, fail, parseYamlSubset } from "@valmen/core";

/** Nombre estable del archivo local que no se versiona. */
export const MACHINE_BINDINGS_FILE = "bindings.local.yaml";

/** Única versión del esquema de bindings disponible en esta entrega. */
export const MACHINE_BINDINGS_SCHEMA_VERSION = "1";

const MACHINE_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Referencias locales autorizadas de un proyecto en una máquina. */
export interface MachineProjectBinding {
  readonly root: string;
  readonly hermesProfile?: string | undefined;
}

/** Archivo local completo, sin secretos ni política compartible. */
export interface MachineBindings {
  readonly schemaVersion: typeof MACHINE_BINDINGS_SCHEMA_VERSION;
  readonly machineId: string;
  /** Límite local y compartido de ejecuciones administradas. */
  readonly managedExecutionCapacity: number;
  readonly projects: Readonly<Record<string, MachineProjectBinding>>;
}

/** Resultado de preparar una alta local sin tocar el disco. */
export type MachineBindingPreparation =
  | { readonly status: "created"; readonly text: string }
  | { readonly status: "already-declared" }
  | { readonly status: "missing-machine-id" }
  | { readonly status: "conflict"; readonly message: string };

/** Datos necesarios para declarar un proyecto en la máquina actual. */
export interface MachineProjectBindingRequest {
  readonly projectId: string;
  readonly root: string;
  readonly machineId?: string | undefined;
  readonly hermesProfile?: string | undefined;
}

/** Ruta por defecto del archivo de bindings de un usuario. */
export function machineBindingsPath(home: string): string {
  return join(home, ".valmen", MACHINE_BINDINGS_FILE);
}

/**
 * Prepara el alta de un binding sin escribirlo.
 *
 * Repetir una entrada idéntica no devuelve texto para que el llamador no
 * reescriba la configuración local. Una identidad distinta para el mismo
 * proyecto tampoco se fusiona: corresponde a otra decisión de la persona.
 */
export function prepareMachineProjectBinding(
  existingText: string | null,
  request: MachineProjectBindingRequest,
): MachineBindingPreparation {
  if (existingText === null) {
    if (request.machineId === undefined || request.machineId === "") {
      return { status: "missing-machine-id" };
    }
    const text = renderMachineBindings({
      schemaVersion: MACHINE_BINDINGS_SCHEMA_VERSION,
      machineId: request.machineId,
      managedExecutionCapacity: 1,
      projects: {
        [request.projectId]: {
          root: request.root,
          ...(request.hermesProfile === undefined ? {} : { hermesProfile: request.hermesProfile }),
        },
      },
    });
    parseMachineBindings(text);
    return { status: "created", text };
  }

  const bindings = parseMachineBindings(existingText);
  const previous = bindings.projects[request.projectId];
  const requested: MachineProjectBinding = {
    root: request.root,
    ...(request.hermesProfile === undefined ? {} : { hermesProfile: request.hermesProfile }),
  };

  if (previous !== undefined) {
    if (
      previous.root === requested.root &&
      previous.hermesProfile === requested.hermesProfile
    ) {
      return { status: "already-declared" };
    }
    return {
      status: "conflict",
      message:
        `El binding local de "${request.projectId}" ya declara una raíz o perfil distinto; ` +
        "no se sobrescribió.",
    };
  }

  const text = renderMachineBindings({
    ...bindings,
    projects: { ...bindings.projects, [request.projectId]: requested },
  });
  parseMachineBindings(text);
  return { status: "created", text };
}

/** Render estable para el archivo local que la operación pura acaba de preparar. */
export function renderMachineBindings(bindings: MachineBindings): string {
  const lines = [
    `schema-version: ${bindings.schemaVersion}`,
    `machine-id: ${bindings.machineId}`,
    `managed-execution-capacity: ${bindings.managedExecutionCapacity}`,
    "projects:",
  ];
  for (const [projectId, binding] of Object.entries(bindings.projects)) {
    lines.push(`  ${projectId}:`, `    root: ${binding.root}`);
    if (binding.hermesProfile !== undefined) {
      lines.push(`    hermes-profile: ${binding.hermesProfile}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Analiza el esquema cerrado de `~/.valmen/bindings.local.yaml`. */
export function parseMachineBindings(text: string): MachineBindings {
  const value = parseYamlSubset(text, {
    fileName: MACHINE_BINDINGS_FILE,
    key: /^[a-z][a-z0-9-]*$/,
    keyMessage: "no es válida (minúsculas, dígitos y guiones).",
  });
  const root = asMap(value, `${MACHINE_BINDINGS_FILE} debe tener un mapa en la raíz.`);
  assertOnlyKeys(
    root,
    ["schema-version", "machine-id", "managed-execution-capacity", "projects"],
    MACHINE_BINDINGS_FILE,
  );

  const schemaVersion = requiredString(root, "schema-version", MACHINE_BINDINGS_FILE);
  if (schemaVersion !== MACHINE_BINDINGS_SCHEMA_VERSION) {
    fail(
      `${MACHINE_BINDINGS_FILE}: "schema-version" debe ser ${MACHINE_BINDINGS_SCHEMA_VERSION}.`,
    );
  }

  const machineId = requiredString(root, "machine-id", MACHINE_BINDINGS_FILE);
  if (!MACHINE_ID_RE.test(machineId)) {
    fail(
      `${MACHINE_BINDINGS_FILE}: "machine-id" debe ser un identificador lógico en minúsculas (letras, números y guiones).`,
    );
  }
  const managedExecutionCapacity = positiveInteger(
    root["managed-execution-capacity"],
    "managed-execution-capacity",
    1,
  );

  const projects = asMap(
    root.projects,
    `${MACHINE_BINDINGS_FILE}: "projects" debe ser un mapa de project-id a binding.`,
  );
  const parsed: Record<string, MachineProjectBinding> = {};
  for (const [projectId, rawBinding] of Object.entries(projects)) {
    if (!PROJECT_ID_RE.test(projectId)) {
      fail(`${MACHINE_BINDINGS_FILE}: "projects.${projectId}" no es un project-id válido.`);
    }
    const binding = asMap(
      rawBinding,
      `${MACHINE_BINDINGS_FILE}: "projects.${projectId}" debe ser un mapa.`,
    );
    assertOnlyKeys(binding, ["root", "hermes-profile"], `projects.${projectId}`);

    const bindingRoot = requiredString(binding, "root", `projects.${projectId}`);
    if (!isAbsolute(bindingRoot)) {
      fail(`${MACHINE_BINDINGS_FILE}: "projects.${projectId}.root" debe ser una ruta absoluta.`);
    }

    const hermesProfile = optionalString(binding, "hermes-profile", `projects.${projectId}`);
    if (hermesProfile !== undefined && !PROFILE_RE.test(hermesProfile)) {
      fail(
        `${MACHINE_BINDINGS_FILE}: "projects.${projectId}.hermes-profile" debe ser una referencia local válida, sin rutas ni espacios.`,
      );
    }
    parsed[projectId] = Object.freeze({
      root: bindingRoot,
      ...(hermesProfile === undefined ? {} : { hermesProfile }),
    });
  }

  return Object.freeze({
    schemaVersion: MACHINE_BINDINGS_SCHEMA_VERSION,
    machineId,
    managedExecutionCapacity,
    projects: Object.freeze(parsed),
  });
}

function positiveInteger(value: YamlValue | undefined, key: string, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fail(`${MACHINE_BINDINGS_FILE}: "${key}" debe ser un entero positivo.`);
  }
  return parsed;
}

function asMap(value: YamlValue | undefined, message: string): Record<string, YamlValue> {
  if (value === undefined || typeof value === "string" || Array.isArray(value)) fail(message);
  return value;
}

function requiredString(map: Record<string, YamlValue>, key: string, context: string): string {
  const value = map[key];
  if (typeof value !== "string" || value === "") {
    fail(`${MACHINE_BINDINGS_FILE}: "${context}.${key}" debe ser un texto no vacío.`);
  }
  return value;
}

function optionalString(
  map: Record<string, YamlValue>,
  key: string,
  context: string,
): string | undefined {
  const value = map[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") {
    fail(`${MACHINE_BINDINGS_FILE}: "${context}.${key}" debe ser un texto no vacío.`);
  }
  return value;
}

function assertOnlyKeys(
  map: Record<string, YamlValue>,
  allowed: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(map)) {
    if (!allowed.includes(key)) {
      fail(`${MACHINE_BINDINGS_FILE}: "${context}" no admite la clave "${key}".`);
    }
  }
}
