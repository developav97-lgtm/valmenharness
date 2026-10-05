/** Capacidad local compartida entre los proyectos autorizados de una máquina. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MutationLock,
  atomicWrite,
  createExecutionIdentity,
  ensureSecurePath,
  type ExecutionIdentity,
} from "@valmen/core";
import { machineBindingsPath, parseMachineBindings } from "@valmen/adapter";

import { readExecutionActivity } from "./execution-activity.js";
import { resolveAuthorizedProject, type AuthorizedProject } from "./project-resolution.js";

const SCHEMA_VERSION = "1";
const FILE_NAME = "machine-capacity.json";

export interface MachineCapacityReservation {
  readonly machineId: string;
  readonly projectId: string;
  readonly ticketId: string;
  readonly executionId: string;
  readonly attemptId: string;
}

export interface MachineCapacitySnapshot {
  readonly machineId: string;
  readonly capacity: number;
  readonly availableSlots: number;
  readonly reservations: readonly MachineCapacityReservation[];
}

export interface ClaimMachineCapacityResult extends MachineCapacitySnapshot {
  readonly granted: boolean;
  /** `false` si la misma identidad ya tenía su reserva. */
  readonly created: boolean;
}

export interface ReleaseMachineCapacityResult extends MachineCapacitySnapshot {
  readonly released: boolean;
}

export interface ReconcileMachineCapacityResult extends MachineCapacitySnapshot {
  readonly recovered: readonly MachineCapacityReservation[];
}

interface StoredCapacity {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly machineId: string;
  readonly reservations: readonly MachineCapacityReservation[];
}

interface MachineContext {
  readonly machineId: string;
  readonly capacity: number;
}

/** Ruta local, no versionada, del estado compartido de la máquina. */
export function machineCapacityPath(home: string): string {
  return join(home, ".valmen", FILE_NAME);
}

/** Lee la capacidad efectiva sin crear ni liberar reservas. */
export function readMachineCapacity(request: {
  readonly home: string;
  readonly project: AuthorizedProject;
}): MachineCapacitySnapshot {
  const context = contextFor(request.home, request.project);
  return snapshot(context, readStored(request.home, context.machineId));
}

/** Reclama un cupo una vez para una identidad de ejecución e intento. */
export function claimMachineCapacity(request: {
  readonly home: string;
  readonly project: AuthorizedProject;
  readonly identity: ExecutionIdentity;
  readonly attemptId: string;
}): ClaimMachineCapacityResult {
  assertIdentity(request.project, request.identity);
  const reservation = reservationFor(request.project, request.identity, request.attemptId);
  return MutationLock.run(capacityDirectory(request.home), () => {
    const context = contextFor(request.home, request.project);
    let stored = readStored(request.home, context.machineId);
    const existing = stored.reservations.find((item) => sameReservation(item, reservation));
    if (existing !== undefined) {
      return Object.freeze({ ...snapshot(context, stored), granted: true, created: false });
    }
    if (stored.reservations.length >= context.capacity) {
      return Object.freeze({ ...snapshot(context, stored), granted: false, created: false });
    }
    stored = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      machineId: context.machineId,
      reservations: Object.freeze([...stored.reservations, reservation]),
    });
    writeStored(request.home, stored);
    return Object.freeze({ ...snapshot(context, stored), granted: true, created: true });
  });
}

/** Libera exclusivamente la reserva de una identidad e intento concretos. */
export function releaseMachineCapacity(request: {
  readonly home: string;
  readonly project: AuthorizedProject;
  readonly identity: ExecutionIdentity;
  readonly attemptId: string;
}): ReleaseMachineCapacityResult {
  assertIdentity(request.project, request.identity);
  const reservation = reservationFor(request.project, request.identity, request.attemptId);
  return MutationLock.run(capacityDirectory(request.home), () => {
    const context = contextFor(request.home, request.project);
    const stored = readStored(request.home, context.machineId);
    const reservations = stored.reservations.filter((item) => !sameReservation(item, reservation));
    const released = reservations.length !== stored.reservations.length;
    const next = released
      ? Object.freeze({ schemaVersion: SCHEMA_VERSION, machineId: context.machineId, reservations: Object.freeze(reservations) })
      : stored;
    if (released) writeStored(request.home, next);
    return Object.freeze({ ...snapshot(context, next), released });
  });
}

/**
 * Recupera solo reservas cuyo proyecto autorizado informó término persistido.
 * La ausencia de actividad no prueba que un worker dejó de ejecutarse.
 */
export function reconcileMachineCapacity(request: { readonly home: string }): ReconcileMachineCapacityResult {
  return MutationLock.run(capacityDirectory(request.home), () => {
    const context = contextFor(request.home);
    const stored = readStored(request.home, context.machineId);
    const recovered: MachineCapacityReservation[] = [];
    const retained = stored.reservations.filter((reservation) => {
      let project: AuthorizedProject;
      try {
        project = resolveAuthorizedProject({ projectId: reservation.projectId, home: request.home });
      } catch {
        return true;
      }
      if (project.machineId !== context.machineId) return true;
      const activity = readExecutionActivity(
        project,
        createExecutionIdentity(reservation),
        reservation.attemptId,
      ).at(-1);
      if (activity?.state !== "finished" && activity?.state !== "failed") return true;
      recovered.push(reservation);
      return false;
    });
    const next = recovered.length === 0
      ? stored
      : Object.freeze({ schemaVersion: SCHEMA_VERSION, machineId: context.machineId, reservations: Object.freeze(retained) });
    if (recovered.length > 0) writeStored(request.home, next);
    return Object.freeze({ ...snapshot(context, next), recovered: Object.freeze(recovered) });
  });
}

function capacityDirectory(home: string): string {
  return join(home, ".valmen");
}

function contextFor(home: string, project?: AuthorizedProject): MachineContext {
  const bindingsPath = machineBindingsPath(home);
  const bindings = parseMachineBindings(readFileSync(bindingsPath, "utf8"));
  if (project !== undefined) {
    const binding = bindings.projects[project.projectId];
    if (project.machineId !== bindings.machineId || binding?.root !== project.root) {
      throw new Error("El proyecto autorizado no coincide con su binding local de máquina.");
    }
  }
  return Object.freeze({
    machineId: bindings.machineId,
    capacity: bindings.managedExecutionCapacity,
  });
}

function readStored(home: string, machineId: string): StoredCapacity {
  const path = machineCapacityPath(home);
  ensureSecurePath(home, path, { allowMissing: true });
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ schemaVersion: SCHEMA_VERSION, machineId, reservations: Object.freeze([]) });
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("El estado local de capacidad contiene JSON inválido.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El estado local de capacidad no tiene el esquema esperado.");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== SCHEMA_VERSION || record.machineId !== machineId || !Array.isArray(record.reservations)) {
    throw new Error("El estado local de capacidad no coincide con esta máquina o esquema.");
  }
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    machineId,
    reservations: Object.freeze(record.reservations.map((item) => parseReservation(item, machineId))),
  });
}

function writeStored(home: string, stored: StoredCapacity): void {
  const path = machineCapacityPath(home);
  ensureSecurePath(home, path, { allowMissing: true });
  atomicWrite(path, `${JSON.stringify(stored, null, 2)}\n`);
}

function snapshot(context: MachineContext, stored: StoredCapacity): MachineCapacitySnapshot {
  return Object.freeze({
    machineId: context.machineId,
    capacity: context.capacity,
    availableSlots: Math.max(0, context.capacity - stored.reservations.length),
    reservations: Object.freeze([...stored.reservations]),
  });
}

function reservationFor(
  project: AuthorizedProject,
  identity: ExecutionIdentity,
  attemptId: string,
): MachineCapacityReservation {
  if (attemptId.trim() === "") throw new Error("attemptId no puede ser vacío.");
  return Object.freeze({
    machineId: project.machineId,
    projectId: identity.projectId,
    ticketId: identity.ticketId,
    executionId: identity.executionId,
    attemptId,
  });
}

function parseReservation(value: unknown, machineId: string): MachineCapacityReservation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Una reserva de capacidad no tiene el esquema esperado.");
  }
  const item = value as Record<string, unknown>;
  if (
    item.machineId !== machineId ||
    typeof item.projectId !== "string" ||
    typeof item.ticketId !== "string" ||
    typeof item.executionId !== "string" ||
    typeof item.attemptId !== "string" ||
    item.attemptId === ""
  ) {
    throw new Error("Una reserva de capacidad no pertenece a esta máquina o es inválida.");
  }
  createExecutionIdentity({
    projectId: item.projectId,
    ticketId: item.ticketId,
    executionId: item.executionId,
  });
  return Object.freeze({
    machineId,
    projectId: item.projectId,
    ticketId: item.ticketId,
    executionId: item.executionId,
    attemptId: item.attemptId,
  });
}

function assertIdentity(project: AuthorizedProject, identity: ExecutionIdentity): void {
  if (identity.projectId !== project.projectId) {
    throw new Error("La identidad de reserva no pertenece al proyecto autorizado.");
  }
}

function sameReservation(left: MachineCapacityReservation, right: MachineCapacityReservation): boolean {
  return left.machineId === right.machineId && left.projectId === right.projectId &&
    left.ticketId === right.ticketId && left.executionId === right.executionId &&
    left.attemptId === right.attemptId;
}
