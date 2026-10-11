/**
 * `journey worktree integrate --retirar`: integra y, con éxito, quita el worktree, borra la rama y libera el cupo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { journeyWorktreeCommand } from "../packages/cli/src/worktree.js";
import { type EjecutorDeGit, defaultPaths } from "../packages/engine/src/index.js";
import {
  type Laboratorio,
  TICKET_A,
  crearLaboratorio,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

let lab: Laboratorio | undefined;
afterEach(() => lab?.limpiar());

const CARPETA = ".claude/worktrees/ticket-uno";
const RAMA = "valmen/ticket-uno";

/** Un laboratorio con el worktree creado y, si se pide, un commit en su rama. */
function preparar(conCommit: boolean) {
  lab = crearLaboratorio();
  const paths = defaultPaths(lab.root);
  const base = { home: lab.home, proceso: procesoSimulado().ejecutor };
  expect(journeyWorktreeCommand(paths, ["create"], { id: TICKET_A }, base).exitCode).toBe(
    0,
  );
  const wt = join(lab.root, CARPETA);
  if (conCommit) {
    writeFileSync(join(wt, "a.txt"), "a\n");
    lab.gitEn(wt, "add", "-A");
    lab.gitEn(wt, "commit", "-q", "-m", "rama");
  }
  return { paths, base, wt, lab };
}

const capacidad = (home: string): string =>
  readFileSync(join(home, ".valmen", "machine-capacity.json"), "utf8");

describe("integrate --retirar", () => {
  it("tras integrar quita el worktree, borra la rama y libera el cupo", () => {
    const { paths, base, wt, lab: l } = preparar(true);
    expect(capacidad(l.home)).toContain(TICKET_A);
    const r = journeyWorktreeCommand(
      paths,
      ["integrate"],
      { id: TICKET_A, retirar: true },
      base,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("integrada en main");
    expect(r.stdout).toContain(`Worktree quitado: ${CARPETA}`);
    expect(r.stdout).toContain("Cupo de la máquina: liberado");
    expect(existsSync(wt)).toBe(false);
    expect(l.git("branch", "--list", RAMA)).toBe("");
    expect(capacidad(l.home)).not.toContain(TICKET_A);
    expect(existsSync(join(l.root, "a.txt"))).toBe(true);
  });

  it("si no había nada que integrar también retira", () => {
    const { paths, base, wt } = preparar(false);
    const r = journeyWorktreeCommand(
      paths,
      ["integrate"],
      { id: TICKET_A, retirar: true },
      base,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Nada que integrar");
    expect(r.stdout).toContain(`Worktree quitado: ${CARPETA}`);
    expect(existsSync(wt)).toBe(false);
  });

  it("si el retiro falla, informa la integración como hecha, el retiro como fallido y la orden que lo resuelve", () => {
    const { paths, base, wt, lab: l } = preparar(true);
    const git: EjecutorDeGit = (argumentos, cwd) => {
      if (argumentos[0] === "worktree" && argumentos[1] === "remove")
        return { status: 1, stdout: "", stderr: "simulado: no se pudo quitar" };
      const r = spawnSync("git", [...argumentos], { cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    };
    const r = journeyWorktreeCommand(
      paths,
      ["integrate"],
      { id: TICKET_A, retirar: true },
      { ...base, git },
    );
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("integrada en main");
    expect(r.stderr).toContain("Retiro fallido");
    expect(r.stderr).toContain(`valmen journey worktree remove --id ${TICKET_A}`);
    expect(existsSync(wt)).toBe(true);
    expect(existsSync(join(l.root, "a.txt"))).toBe(true);
  });

  it("sin la opción el worktree, la rama y el cupo se conservan", () => {
    const { paths, base, wt, lab: l } = preparar(true);
    const r = journeyWorktreeCommand(paths, ["integrate"], { id: TICKET_A }, base);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("Worktree quitado");
    expect(existsSync(wt)).toBe(true);
    expect(l.git("branch", "--list", RAMA)).toContain(RAMA);
    expect(capacidad(l.home)).toContain(TICKET_A);
  });
});
