/**
 * Laboratorio de los worktrees por ticket: un repositorio git de verdad en una carpeta temporal,
 * con un `node_modules` mínimo y las máquinas declaradas. Nunca toca el repositorio real.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EjecutorDeGit, EjecutorDeProceso } from "../../packages/engine/src/index.js";
import { writeFixtureTicket } from "./fixtures.js";

export const PROYECTO = "wt-lab";
export const TICKET_A = "FEATURE-WT-UNO-20261008";
export const TICKET_B = "FEATURE-WT-DOS-20261008";

export interface Laboratorio {
  readonly home: string;
  readonly root: string;
  git(...args: string[]): string;
  gitEn(cwd: string, ...args: string[]): string;
  limpiar(): void;
}

export function crearLaboratorio(opciones: { capacidad?: number; declarado?: boolean } = {}): Laboratorio {
  const home = mkdtempSync(join(tmpdir(), "valmen-wt-"));
  const root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  mkdirSync(join(root, "packages", "core"), { recursive: true });
  mkdirSync(join(root, "node_modules", "@valmen"), { recursive: true });
  mkdirSync(join(root, "node_modules", "otro"), { recursive: true });
  writeFileSync(join(root, "packages", "core", "package.json"), "{}\n");
  writeFileSync(join(root, "node_modules", "otro", "index.js"), "module.exports = 1;\n");
  symlinkSync("../../packages/core", join(root, "node_modules", "@valmen", "core"));
  writeFileSync(join(root, ".gitignore"), "node_modules/\ndist/\n.claude/\n");
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${PROYECTO}\n`);
  if (opciones.declarado !== false) {
    writeFileSync(
      join(home, ".valmen", "bindings.local.yaml"),
      `schema-version: 1\nmachine-id: wt\nmanaged-execution-capacity: ${opciones.capacidad ?? 2}\nprojects:\n  ${PROYECTO}:\n    root: ${root}\n`,
    );
  }
  for (const id of [TICKET_A, TICKET_B]) {
    writeFixtureTicket(root, { id, workflowStatus: "approved", type: "FEATURE", module: "WT" });
  }
  const gitEn = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const git = (...args: string[]): string => gitEn(root, ...args);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return { home, root, git, gitEn, limpiar: () => rmSync(home, { recursive: true, force: true }) };
}

export interface Llamada {
  readonly comando: string;
  readonly argumentos: readonly string[];
  readonly cwd: string;
}

/** `cp` de verdad; la compilación se simula y se registra. */
export function procesoSimulado(opciones: { fallaEn?: string } = {}): { ejecutor: EjecutorDeProceso; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const ejecutor: EjecutorDeProceso = (comando, argumentos, cwd) => {
    llamadas.push({ comando, argumentos: [...argumentos], cwd });
    if (comando === "cp") {
      const r = spawnSync(comando, [...argumentos], { cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    }
    if (opciones.fallaEn !== undefined && `${comando} ${argumentos.join(" ")}`.includes(opciones.fallaEn)) {
      return { status: 2, stdout: "", stderr: "error TS0000: simulado" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { ejecutor, llamadas };
}

/** Git de verdad, registrando cada invocación. */
export function gitRegistrado(): { ejecutor: EjecutorDeGit; llamadas: string[][] } {
  const llamadas: string[][] = [];
  const ejecutor: EjecutorDeGit = (argumentos, cwd) => {
    llamadas.push([...argumentos]);
    const r = spawnSync("git", [...argumentos], { cwd, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
  return { ejecutor, llamadas };
}
