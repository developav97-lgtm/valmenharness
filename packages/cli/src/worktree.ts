/**
 * `valmen journey worktree <subcomando> --id <ID>`: el worktree por ticket de la corrida orquestada.
 *
 * Una tabla de subcomandos (`SUBCOMANDOS_DE_WORKTREE`) que otros tickets extienden con su propia
 * entrada. Valida el subcomando y `--id` (salida 2), delega en el motor y da salida 3 a un rechazo.
 */
import {
  type EjecutorDeGit,
  type EjecutorDeProceso,
  type RegistryPaths,
  crearWorktree,
  quitarWorktree,
} from "@valmen/engine";
import { EXIT_OK, EXIT_SCHEMA, toFailure } from "@valmen/core";

import { type CommandResult } from "./commands.js";

export interface OpcionesDeWorktree {
  readonly home?: string;
  readonly git?: EjecutorDeGit;
  readonly proceso?: EjecutorDeProceso;
}

type Subcomando = (paths: RegistryPaths, ticketId: string, opciones: OpcionesDeWorktree) => string;

const motor = (paths: RegistryPaths, ticketId: string, opciones: OpcionesDeWorktree) => ({
  paths,
  ticketId,
  ...(opciones.home === undefined ? {} : { home: opciones.home }),
  ...(opciones.git === undefined ? {} : { git: opciones.git }),
  ...(opciones.proceso === undefined ? {} : { proceso: opciones.proceso }),
});

export const SUBCOMANDOS_DE_WORKTREE: Readonly<Record<string, Subcomando>> = Object.freeze({
  create: (paths, ticketId, opciones) => {
    const r = crearWorktree(motor(paths, ticketId, opciones));
    return [
      `Worktree creado: ${r.carpeta} (rama ${r.rama}, desde main en ${r.commit.slice(0, 12)}).`,
      `Cupo de la máquina: ${r.reserva === "reservada" ? "reservado" : "sin reservar"}.`,
      ...r.avisos.map((a) => `Aviso: ${a}`),
    ].join("\n");
  },
  remove: (paths, ticketId, opciones) => {
    const r = quitarWorktree(motor(paths, ticketId, opciones));
    return [
      `Worktree quitado: ${r.carpeta} y rama ${r.rama} borrada (ya estaba integrada en main).`,
      `Cupo de la máquina: ${r.reserva === "liberada" ? "liberado" : "nada que liberar"}.`,
      ...r.avisos.map((a) => `Aviso: ${a}`),
    ].join("\n");
  },
});

/** `rest` es lo que sigue a `worktree`: el subcomando. */
export function journeyWorktreeCommand(
  paths: RegistryPaths,
  rest: readonly string[],
  flags: Readonly<Record<string, string | true>>,
  opciones: OpcionesDeWorktree = {},
): CommandResult {
  const admitidos = Object.keys(SUBCOMANDOS_DE_WORKTREE).join(", ");
  const nombre = rest[0];
  const subcomando = nombre === undefined ? undefined : SUBCOMANDOS_DE_WORKTREE[nombre];
  if (subcomando === undefined) {
    return { stdout: "", stderr: `journey worktree admite: ${admitidos}.\n`, exitCode: EXIT_SCHEMA };
  }
  const id = flags["id"];
  if (typeof id !== "string" || id.trim() === "") {
    return { stdout: "", stderr: `journey worktree ${nombre} requiere --id <ticket>.\n`, exitCode: EXIT_SCHEMA };
  }
  try {
    return { stdout: `${subcomando(paths, id, opciones)}\n`, stderr: "", exitCode: EXIT_OK };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: `${failure.message}\n`, exitCode: failure.exitCode };
  }
}
