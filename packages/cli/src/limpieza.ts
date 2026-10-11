/**
 * `valmen cleanup [--confirm] [--json]`: quita los worktrees ya integrados y los respaldos de `sync`
 * vencidos. Sin `--confirm` solo muestra lo que quitaría; la lógica vive en el motor (`limpieza.ts`).
 */
import {
  type ElementoDeLimpieza,
  type ElementoQuitado,
  type EjecutorDeGit,
  type RegistryPaths,
  aplicarLimpieza,
  vistaDeLimpieza,
} from "@valmen/engine";
import { EXIT_INVARIANT, EXIT_OK, toFailure } from "@valmen/core";

import { type CommandResult } from "./commands.js";

export interface OpcionesDeLimpieza {
  readonly home?: string;
  readonly git?: EjecutorDeGit;
  readonly ahora?: Date;
}

function linea(e: ElementoQuitado): string {
  if (e.resultado === "quitado") return `  ${e.ruta}: quitado`;
  if (e.resultado === "error") return `  ${e.ruta}: error: ${e.error ?? "desconocido"}`;
  return e.accion === "quitar"
    ? `  ${e.ruta}: se quitaría (${e.bytes} bytes, tamaño aparente; ${e.motivo})`
    : `  ${e.ruta}: se conserva: ${e.motivo}`;
}

function seccion(titulo: string, elementos: readonly ElementoDeLimpieza[]): string[] {
  return [`${titulo}:`, ...(elementos.length === 0 ? ["  ninguno"] : elementos.map(linea))];
}

export function cleanupCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  opciones: OpcionesDeLimpieza = {},
): CommandResult {
  const confirmar = flags["confirm"] === true;
  const json = flags["json"] === true;
  const peticion = {
    paths,
    ...(opciones.home === undefined ? {} : { home: opciones.home }),
    ...(opciones.git === undefined ? {} : { git: opciones.git }),
    ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
  };
  try {
    const resultado = confirmar
      ? aplicarLimpieza(peticion)
      : { ...vistaDeLimpieza(peticion), recibo: null, fallos: 0 };
    const exitCode = resultado.fallos > 0 ? EXIT_INVARIANT : EXIT_OK;
    if (json) {
      return {
        stdout: `${JSON.stringify({ confirm: confirmar, ...resultado }, null, 2)}\n`,
        stderr: "",
        exitCode,
      };
    }
    const lineas = [
      ...seccion("Worktrees", resultado.worktrees),
      ...seccion("Respaldos de sync", resultado.respaldos),
      confirmar
        ? resultado.recibo === null
          ? "Nada que quitar."
          : `Recibo de recuperación: ${resultado.recibo}`
        : "Vista previa: no se quitó nada; repite con --confirm para quitarlo.",
    ];
    return { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: `${failure.message}\n`, exitCode: failure.exitCode };
  }
}
