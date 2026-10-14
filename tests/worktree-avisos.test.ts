/**
 * Los avisos de `journey worktree` dicen lo que de verdad pasó
 * (BUGFIX-ENGINE-AVISOS-WORKTREE-ENGANOSOS-20261014).
 *
 * `integrate` solo dice «Recompilado.» si corrió la receta de compilación, y un `create` abortado
 * que deshizo todo no dice «quedó a medias»; un residuo real se sigue informando, una sola vez. Los
 * códigos de salida no cambian. Git de verdad en una carpeta temporal; la compilación se simula.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { journeyWorktreeCommand } from "../packages/cli/src/worktree.js";
import {
  type EjecutorDeGit,
  type EjecutorDeProceso,
  crearWorktree,
  defaultPaths,
} from "../packages/engine/src/index.js";
import {
  type Laboratorio,
  TICKET_A,
  crearLaboratorio,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

let lab: Laboratorio | undefined;
afterEach(() => {
  lab?.limpiar();
  lab = undefined;
});

const RAMA = "valmen/ticket-uno";
const CARPETA = join(".claude", "worktrees", "ticket-uno");

/** Git de verdad, salvo la orden que `trampa` decida responder o romper. */
function gitCon(
  trampa: (argumentos: readonly string[]) => ReturnType<EjecutorDeGit> | undefined,
): EjecutorDeGit {
  return (argumentos, cwd) => {
    const respuesta = trampa(argumentos);
    if (respuesta !== undefined) return respuesta;
    const r = spawnSync("git", [...argumentos], { cwd, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

function crearEIntegrar(
  l: Laboratorio,
  procesoAlIntegrar: EjecutorDeProceso,
): ReturnType<typeof journeyWorktreeCommand> {
  const paths = defaultPaths(l.root);
  const creado = journeyWorktreeCommand(
    paths,
    ["create"],
    { id: TICKET_A },
    { home: l.home, proceso: procesoSimulado().ejecutor },
  );
  expect(creado.exitCode).toBe(0);
  const wt = join(l.root, CARPETA);
  writeFileSync(join(wt, "a.txt"), "a\n");
  l.gitEn(wt, "add", "--", "a.txt");
  l.gitEn(wt, "commit", "-q", "-m", "rama");
  return journeyWorktreeCommand(
    paths,
    ["integrate"],
    { id: TICKET_A },
    { home: l.home, proceso: procesoAlIntegrar },
  );
}

const worktreesRegistrados = (l: Laboratorio): number =>
  l.git("worktree", "list", "--porcelain").split("\n").filter((x) => x.startsWith("worktree "))
    .length;

describe("integrate dice si recompiló según lo que de verdad pasó (C1–C5)", () => {
  it("sin la receta de compilación no dice «Recompilado.», dice por qué y sale con 0 (C1, C2, C3)", () => {
    lab = crearLaboratorio();
    rmSync(join(lab.root, "node_modules"), { recursive: true });
    const r = crearEIntegrar(lab, procesoSimulado().ejecutor);
    expect(r.stdout).not.toContain("Recompilado.");
    expect(r.stdout).toContain(
      "Sin recompilar: el proyecto no tiene la receta de compilación del harness",
    );
    expect(r.exitCode).toBe(0);
  });

  it("con la receta sigue diciendo «Recompilado.» y, si la recompilación falla, sale con 3 (C4, C5)", () => {
    lab = crearLaboratorio();
    const recompila = procesoSimulado();
    const hecha = crearEIntegrar(lab, recompila.ejecutor);
    expect(hecha.exitCode).toBe(0);
    expect(hecha.stdout).toContain("Recompilado.");
    expect(hecha.stdout).not.toContain("Sin recompilar");
    expect(recompila.llamadas.map((x) => x.comando)).toEqual(["npx", "node"]);
    lab.limpiar();

    lab = crearLaboratorio();
    const fallida = crearEIntegrar(lab, procesoSimulado({ fallaEn: "tsc" }).ejecutor);
    expect(fallida.exitCode).toBe(3);
    expect(fallida.stderr).toContain("la recompilación falló");
  });
});

describe("un create abortado que limpió todo no dice que quedó a medias (C6–C11)", () => {
  const casos: ReadonlyArray<{
    nombre: string;
    preparar: (l: Laboratorio) => void;
    proceso: () => EjecutorDeProceso;
    motivo: string;
  }> = [
    {
      nombre: "receta sin node_modules, tras crear la rama (C6, C7, C8, C9)",
      preparar: (l) => {
        rmSync(join(l.root, "node_modules"), { recursive: true });
        writeFileSync(join(l.root, "tsconfig.build.json"), "{}\n");
        l.git("add", "--", "tsconfig.build.json");
        l.git("commit", "-q", "-m", "receta");
      },
      proceso: () => procesoSimulado().ejecutor,
      motivo: "instala las dependencias",
    },
    {
      nombre: "compilación fallida, con worktree y rama ya creados (C10, C11)",
      preparar: () => undefined,
      proceso: () => procesoSimulado({ fallaEn: "tsc" }).ejecutor,
      motivo: "La compilación falló",
    },
  ];

  it.each(casos)("$nombre", ({ preparar, proceso, motivo }) => {
    lab = crearLaboratorio();
    preparar(lab);
    const r = journeyWorktreeCommand(
      defaultPaths(lab.root),
      ["create"],
      { id: TICKET_A },
      { home: lab.home, proceso: proceso() },
    );
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain(motivo);
    expect(r.stderr).not.toContain("quedó a medias");
    expect(lab.git("branch", "--list", RAMA)).toBe("");
    expect(worktreesRegistrados(lab)).toBe(1);
    expect(existsSync(join(lab.root, CARPETA))).toBe(false);
  });
});

describe("un residuo real se sigue informando, una sola vez (C12–C15)", () => {
  it("si branch -d falla al deshacer, lo dice una vez y sale con 3 (C12, C13, C14)", () => {
    lab = crearLaboratorio();
    const git = gitCon((a) =>
      a[0] === "branch" && a[1] === "-d"
        ? { status: 1, stdout: "", stderr: "error: simulado" }
        : undefined,
    );
    const r = journeyWorktreeCommand(
      defaultPaths(lab.root),
      ["create"],
      { id: TICKET_A },
      { home: lab.home, git, proceso: procesoSimulado({ fallaEn: "tsc" }).ejecutor },
    );
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("La compilación falló");
    expect(r.stderr).toContain("quedó a medias: no se pudo borrar la rama: error: simulado");
    expect(r.stderr.split("quedó a medias").length - 1).toBe(1);
    expect(lab.git("branch", "--list", RAMA)).toContain(RAMA);
  });

  it("un fallo inesperado que no pasa por abortar sigue deshaciendo la rama y el worktree (C15)", () => {
    lab = crearLaboratorio();
    const git = gitCon((a) => {
      if (a[0] === "rev-parse" && a[1] === RAMA) throw new Error("git se cayó");
      return undefined;
    });
    expect(() =>
      crearWorktree({
        paths: defaultPaths(lab!.root),
        ticketId: TICKET_A,
        home: lab!.home,
        git,
        proceso: procesoSimulado().ejecutor,
      }),
    ).toThrow("git se cayó");
    expect(lab.git("branch", "--list", RAMA)).toBe("");
    expect(worktreesRegistrados(lab)).toBe(1);
  });
});
