/**
 * Recibos append-only de paradas de ejecuciones autónomas.
 *
 * Un fallo de la corrida no puede vivir solo en la salida del proceso: al cerrar
 * la terminal se perdería la razón y el vigilante no tendría qué avisar. Este
 * log conserva únicamente el hecho seguro de la parada; los secretos y la salida
 * completa del ejecutor no pertenecen al registro.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type RegistryPaths } from "./discovery.js";

export const AUTONOMOUS_STOP_REASONS = [
  "gate-blocked-twice",
  "test-failure",
  "secret-detected",
  "budget-exceeded",
] as const;

export type AutonomousStopReason = (typeof AUTONOMOUS_STOP_REASONS)[number];

export interface AutonomousStopReceipt {
  readonly kind: "autonomous-stop";
  readonly version: 1;
  readonly id: string;
  readonly ticketId: string;
  readonly reason: AutonomousStopReason;
  /** Resumen seguro para la persona; nunca contiene el valor de un secreto. */
  readonly detail: string;
  /** La corrida queda en un estado contractual y no vuelve a seleccionarse. */
  readonly workflowStatus: "in_progress";
  readonly stoppedAt: string;
}

export function autonomousStopsPath(paths: RegistryPaths): string {
  return join(paths.root, ".valmen", "autonomous-stops.jsonl");
}

/** Lee el diario completo; un renglón truncado no borra los hechos anteriores. */
export function readAutonomousStops(paths: RegistryPaths): AutonomousStopReceipt[] {
  const path = autonomousStopsPath(paths);
  if (!existsSync(path)) return [];

  const receipts: AutonomousStopReceipt[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value = JSON.parse(line) as Partial<AutonomousStopReceipt>;
      if (
        value.kind === "autonomous-stop" &&
        value.version === 1 &&
        typeof value.id === "string" &&
        typeof value.ticketId === "string" &&
        typeof value.detail === "string" &&
        typeof value.stoppedAt === "string" &&
        value.workflowStatus === "in_progress" &&
        (AUTONOMOUS_STOP_REASONS as readonly string[]).includes(String(value.reason))
      ) {
        receipts.push(value as AutonomousStopReceipt);
      }
    } catch {
      // El diario es append-only: una línea interrumpida no invalida las demás.
    }
  }
  return receipts;
}

export function recordAutonomousStop(
  paths: RegistryPaths,
  input: Omit<AutonomousStopReceipt, "kind" | "version" | "id" | "stoppedAt"> & {
    readonly now?: Date | undefined;
  },
): AutonomousStopReceipt {
  const now = input.now ?? new Date();
  const sameInstant = readAutonomousStops(paths).filter(
    (receipt) => receipt.ticketId === input.ticketId && receipt.stoppedAt === now.toISOString(),
  ).length;
  const id = `AS-${input.ticketId}-${now.toISOString().replace(/[-:.TZ]/g, "")}-${sameInstant + 1}`;
  const receipt: AutonomousStopReceipt = {
    kind: "autonomous-stop",
    version: 1,
    id,
    ticketId: input.ticketId,
    reason: input.reason,
    detail: input.detail,
    workflowStatus: "in_progress",
    stoppedAt: now.toISOString(),
  };
  const path = autonomousStopsPath(paths);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(receipt)}\n`, "utf8");
  return receipt;
}
