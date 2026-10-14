/**
 * La rama base de los worktrees de ticket sale de `execution.base-branch` (BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014).
 *
 * El caso que lo motivó: SaiOpenCloud trabaja sobre `dev` con `main` atrasada, y `journey worktree
 * create|integrate|remove` exigían `main`. Sin la clave, la base sigue siendo `main` (regresión).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { journeyWorktreeCommand } from "../packages/cli/src/worktree.js";
import {
  defaultPaths,
  motivoDeGitDeWorktree,
  ramaBaseDelProyecto,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import {
  type Laboratorio,
  TICKET_A,
  crearLaboratorio,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

const TICKET_C = "FEATURE-WT-TRES-20261008";
const CARPETA = ".claude/worktrees/ticket-uno";
const RAMA = "valmen/ticket-uno";

let lab: Laboratorio | undefined;
const sueltos: string[] = [];
afterEach(() => {
  lab?.limpiar();
  lab = undefined;
  for (const d of sueltos.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * Un laboratorio que trabaja sobre `dev`: declara `execution.base-branch: dev`, registra en `dev`
 * un ticket que `main` no tiene y deja `main` ausente o atrasada.
 */
function laboratorioSobreDev(main: "ausente" | "atrasada"): Laboratorio {
  const l = crearLaboratorio();
  l.git("branch", "-m", "main", "dev");
  if (main === "atrasada") l.git("branch", "main", "dev");
  appendFileSync(join(l.root, ".valmen", "config.yaml"), "execution:\n  base-branch: dev\n");
  writeFixtureTicket(l.root, { id: TICKET_C, workflowStatus: "approved", type: "FEATURE", module: "WT" });
  l.git("add", "-A");
  l.git("commit", "-q", "-m", "dev avanza");
  return l;
}

const opciones = (l: Laboratorio) => ({ home: l.home, proceso: procesoSimulado().ejecutor });

describe("ramaBaseDelProyecto (C1, C2)", () => {
  const casos: ReadonlyArray<[string, string | null, string | RegExp]> = [
    ["sin config.yaml", null, "main"],
    ["sin la clave", "project-id: x\n", "main"],
    ["con la clave", "execution:\n  base-branch: dev\n", "dev"],
    ["vacía", 'execution:\n  base-branch: ""\n', /base-branch/],
    ["con ..", "execution:\n  base-branch: a..b\n", /base-branch/],
    ["con barra final", "execution:\n  base-branch: dev/\n", /base-branch/],
    ["terminada en .lock", "execution:\n  base-branch: dev.lock\n", /base-branch/],
    ["con plantilla", "execution:\n  base-branch: dev-<AAAAMMDD>\n", /base-branch/],
    ["rama de ticket", "execution:\n  base-branch: valmen/ticket-uno\n", /base-branch/],
  ];
  it.each(casos)("%s", (_nombre, config, esperado) => {
    const root = mkdtempSync(join(tmpdir(), "valmen-rama-base-"));
    sueltos.push(root);
    if (config !== null) {
      mkdirSync(join(root, ".valmen"), { recursive: true });
      writeFileSync(join(root, ".valmen", "config.yaml"), config);
    }
    if (typeof esperado === "string") expect(ramaBaseDelProyecto(root)).toBe(esperado);
    else expect(() => ramaBaseDelProyecto(root)).toThrow(esperado);
  });
});

describe("journey worktree sobre la rama base declarada", () => {
  it.each(["ausente", "atrasada"] as const)(
    "create sale de dev con main %s y lo dice (C3, C8)",
    (main) => {
      lab = laboratorioSobreDev(main);
      const r = journeyWorktreeCommand(defaultPaths(lab.root), ["create"], { id: TICKET_C }, opciones(lab));
      expect(r.stderr).toBe("");
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("desde dev en");
      expect(lab.git("rev-parse", "valmen/ticket-tres")).toBe(lab.git("rev-parse", "dev"));
    },
  );

  it("create rechaza un ticket que no está commiteado en dev y nombra dev (C4)", () => {
    lab = laboratorioSobreDev("atrasada");
    writeFixtureTicket(lab.root, { id: "FEATURE-WT-CUATRO-20261008", workflowStatus: "approved" });
    const r = journeyWorktreeCommand(
      defaultPaths(lab.root),
      ["create"],
      { id: "FEATURE-WT-CUATRO-20261008" },
      opciones(lab),
    );
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("no está registrado en dev");
  });

  it("integrate lleva la rama a dev, se niega desde otra rama y remove la quita (C5, C6, C7)", () => {
    lab = laboratorioSobreDev("atrasada");
    const paths = defaultPaths(lab.root);
    const base = opciones(lab);
    expect(journeyWorktreeCommand(paths, ["create"], { id: TICKET_A }, base).exitCode).toBe(0);
    const wt = join(lab.root, CARPETA);
    writeFileSync(join(wt, "a.txt"), "a\n");
    lab.gitEn(wt, "add", "-A");
    lab.gitEn(wt, "commit", "-q", "-m", "rama");

    lab.git("switch", "-q", "-c", "otra");
    const desdeOtra = journeyWorktreeCommand(paths, ["integrate"], { id: TICKET_A }, base);
    expect(desdeOtra.exitCode).toBe(3);
    expect(desdeOtra.stderr).toContain('está en "otra", no en dev');
    lab.git("switch", "-q", "dev");

    const integrada = journeyWorktreeCommand(paths, ["integrate"], { id: TICKET_A }, base);
    expect(integrada.stderr).toBe("");
    expect(integrada.exitCode).toBe(0);
    expect(integrada.stdout).toContain("integrada en dev");
    expect(lab.git("merge-base", "--is-ancestor", RAMA, "dev")).toBe("");
    expect(existsSync(join(lab.root, "a.txt"))).toBe(true);

    const quitada = journeyWorktreeCommand(paths, ["remove"], { id: TICKET_A }, base);
    expect(quitada.stderr).toBe("");
    expect(quitada.exitCode).toBe(0);
    expect(quitada.stdout).toContain("ya estaba integrada en dev");
    expect(existsSync(wt)).toBe(false);
    expect(lab.git("branch", "--list", RAMA)).toBe("");
  });

  it("la lista cerrada admite worktree add solo hacia la base declarada (C9)", () => {
    const add = (base: string) => ["worktree", "add", "-b", RAMA, CARPETA, base];
    expect(motivoDeGitDeWorktree(add("dev"), "dev")).toBeNull();
    expect(motivoDeGitDeWorktree(add("main"), "dev")).not.toBeNull();
    expect(motivoDeGitDeWorktree(add("otra"), "dev")).not.toBeNull();
    expect(motivoDeGitDeWorktree(add("main"))).toBeNull();
    expect(motivoDeGitDeWorktree(add("dev"))).not.toBeNull();
  });
});

describe("regresión: sin la clave todo sigue sobre main (C10)", () => {
  it("create, integrate y remove operan contra main", () => {
    lab = crearLaboratorio();
    const paths = defaultPaths(lab.root);
    const base = opciones(lab);
    const creado = journeyWorktreeCommand(paths, ["create"], { id: TICKET_A }, base);
    expect(creado.exitCode).toBe(0);
    expect(creado.stdout).toContain("desde main en");
    const wt = join(lab.root, CARPETA);
    writeFileSync(join(wt, "a.txt"), "a\n");
    lab.gitEn(wt, "add", "-A");
    lab.gitEn(wt, "commit", "-q", "-m", "rama");
    const integrada = journeyWorktreeCommand(paths, ["integrate"], { id: TICKET_A }, base);
    expect(integrada.exitCode).toBe(0);
    expect(integrada.stdout).toContain("integrada en main por avance directo");
    const quitada = journeyWorktreeCommand(paths, ["remove"], { id: TICKET_A }, base);
    expect(quitada.exitCode).toBe(0);
    expect(quitada.stdout).toContain("ya estaba integrada en main");
  });
});
