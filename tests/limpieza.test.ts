/**
 * `valmen cleanup` (FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010): vista previa por defecto, quitado solo con
 * `--confirm` y nada fuera de lo integrado.
 *
 * Toda prueba corre sobre un repositorio git de verdad creado por `crearLaboratorio` en una carpeta
 * temporal: jamás se toca este repositorio ni sus worktrees.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupCommand } from "../packages/cli/src/limpieza.js";
import { run } from "../packages/cli/src/main.js";
import {
  crearWorktree,
  defaultPaths,
  readMachineCapacity,
  resolveAuthorizedProject,
  type EjecutorDeGit,
} from "../packages/engine/src/index.js";
import {
  ejecutarGitDeLimpieza,
  motivoDeGitDeLimpieza,
} from "../packages/engine/src/limpieza-git.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import {
  type Laboratorio,
  PROYECTO,
  TICKET_A,
  crearLaboratorio,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

let lab: Laboratorio | undefined;
afterEach(() => lab?.limpiar());

const AHORA = new Date("2026-10-11T12:00:00Z");
const hace31Dias = "20260910T120000Z";
const hace3Dias = "20261008T120000Z";

function nuevoLab(): Laboratorio {
  lab = crearLaboratorio();
  return lab;
}

/** Un worktree bajo `.claude/worktrees/<nombre>`; con `rama` nace con ella, sin `rama` desacoplado. */
function agregarWorktree(l: Laboratorio, nombre: string, rama?: string): string {
  const carpeta = join(l.root, ".claude", "worktrees", nombre);
  if (rama === undefined) l.git("worktree", "add", "--detach", carpeta, "main");
  else l.git("worktree", "add", "-b", rama, carpeta, "main");
  return carpeta;
}

function agregarRespaldo(l: Laboratorio, marca: string): string {
  const carpeta = join(l.root, ".valmen", "backups", "sync", marca);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "manifiesto.json"), JSON.stringify({ marca, archivos: [] }));
  writeFileSync(join(carpeta, "AGENTS.md"), "respaldo\n");
  return carpeta;
}

function limpiar(l: Laboratorio, flags: Record<string, string | true> = {}) {
  return cleanupCommand(defaultPaths(l.root), flags, { home: l.home, ahora: AHORA });
}

interface Elemento {
  ruta: string;
  accion: string;
  motivo: string;
  bytes: number;
  rama: string | null;
  commit: string | null;
  resultado?: string;
  error?: string;
}
interface Salida {
  worktrees: Elemento[];
  respaldos: Elemento[];
  recibo: string | null;
}
function enJson(l: Laboratorio, flags: Record<string, string | true> = {}): Salida {
  return JSON.parse(limpiar(l, { json: true, ...flags }).stdout) as Salida;
}
const del = (s: Salida, nombre: string): Elemento =>
  s.worktrees.find((w) => w.ruta.endsWith(`/${nombre}`))!;

describe("R-LIM-001: sin banderas muestra qué quitaría y no quita nada", () => {
  it("C1: un worktree integrado y limpio se lista como «se quitaría» con su tamaño en bytes", () => {
    const l = nuevoLab();
    agregarWorktree(l, "listo");
    const r = limpiar(l);
    expect(r.stdout).toMatch(/\.claude\/worktrees\/listo: se quitaría \(\d+ bytes/);
    const w = del(enJson(l), "listo");
    expect(w.accion).toBe("quitar");
    expect(w.bytes).toBeGreaterThan(0);
  });

  it("C2: un worktree con un archivo sin commitear se conserva por árbol sucio", () => {
    const l = nuevoLab();
    const carpeta = agregarWorktree(l, "sucio");
    writeFileSync(join(carpeta, "pendiente.txt"), "x\n");
    expect(limpiar(l).stdout).toContain(
      ".claude/worktrees/sucio: se conserva: árbol sucio",
    );
  });

  it("C3: un worktree cuyo único cambio está en .valmen/journeys/ se conserva por árbol sucio", () => {
    const l = nuevoLab();
    const carpeta = agregarWorktree(l, "jornada");
    mkdirSync(join(carpeta, ".valmen", "journeys"), { recursive: true });
    writeFileSync(join(carpeta, ".valmen", "journeys", "events.jsonl"), "{}\n");
    const w = del(enJson(l), "jornada");
    expect(w.accion).toBe("conservar");
    expect(w.motivo).toBe("árbol sucio");
  });

  it("C4: sin backup-retention-days un respaldo de sync de 31 días se lista como «se quitaría»", () => {
    const l = nuevoLab();
    agregarRespaldo(l, hace31Dias);
    expect(limpiar(l).stdout).toContain(`.valmen/backups/sync/${hace31Dias}: se quitaría`);
  });

  it("C5: con backup-retention-days: 7 un respaldo de 3 días se conserva dentro de la retención", () => {
    const l = nuevoLab();
    writeFileSync(
      join(l.root, ".valmen", "config.yaml"),
      `project-id: ${PROYECTO}\nbackup-retention-days: 7\n`,
    );
    agregarRespaldo(l, hace3Dias);
    expect(limpiar(l).stdout).toContain(
      `.valmen/backups/sync/${hace3Dias}: se conserva: dentro de la retención`,
    );
  });

  it("C6: deja igual la salida de git worktree list --porcelain", () => {
    const l = nuevoLab();
    agregarWorktree(l, "uno");
    agregarWorktree(l, "dos", "feat/dos");
    const antes = l.git("worktree", "list", "--porcelain");
    limpiar(l);
    expect(l.git("worktree", "list", "--porcelain")).toBe(antes);
  });

  it("C7: sale con código 0, también por el despacho de la CLI", async () => {
    const l = nuevoLab();
    agregarWorktree(l, "uno");
    expect(limpiar(l).exitCode).toBe(0);
    expect(await run(["cleanup", "--root", l.root])).toBe(0);
    expect(await run(["cleanup", "--nada", "--root", l.root])).toBe(2);
    expect(existsSync(join(l.root, ".claude", "worktrees", "uno"))).toBe(true);
  });

  it("C8: deja igual la lista de carpetas de .valmen/backups/sync/", () => {
    const l = nuevoLab();
    agregarRespaldo(l, hace31Dias);
    agregarRespaldo(l, hace3Dias);
    const carpeta = join(l.root, ".valmen", "backups", "sync");
    const antes = readdirSync(carpeta).sort();
    limpiar(l);
    expect(readdirSync(carpeta).sort()).toEqual(antes);
    expect(existsSync(join(l.root, ".valmen", "backups", "cleanup"))).toBe(false);
  });

  it("C9: --json trae ruta, accion, motivo y bytes en cada worktree", () => {
    const l = nuevoLab();
    agregarWorktree(l, "uno");
    const salida = enJson(l);
    expect(salida.worktrees).toHaveLength(1);
    for (const campo of ["ruta", "accion", "motivo", "bytes"])
      expect(Object.keys(salida.worktrees[0]!)).toContain(campo);
  });
});

describe("R-LIM-002: solo con --confirm quita lo que la vista previa listó", () => {
  it("C10: quita un worktree desacoplado cuyo commit es alcanzable desde main", () => {
    const l = nuevoLab();
    const carpeta = agregarWorktree(l, "suelto");
    const r = limpiar(l, { confirm: true });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("quitado");
    expect(existsSync(carpeta)).toBe(false);
    expect(l.git("worktree", "list", "--porcelain")).not.toContain("suelto");
  });

  it("C11: borra la rama del worktree integrado que quitó", () => {
    const l = nuevoLab();
    agregarWorktree(l, "conrama", "feat/conrama");
    expect(l.git("branch", "--list", "feat/conrama")).not.toBe("");
    limpiar(l, { confirm: true });
    expect(l.git("branch", "--list", "feat/conrama")).toBe("");
  });

  it("C12: libera el cupo de la máquina que reservaba el worktree quitado", () => {
    const l = nuevoLab();
    const paths = defaultPaths(l.root);
    crearWorktree({
      paths,
      ticketId: TICKET_A,
      home: l.home,
      proceso: procesoSimulado().ejecutor,
    });
    writeFixtureTicket(l.root, {
      id: TICKET_A,
      workflowStatus: "closed",
      type: "FEATURE",
      module: "WT",
    });
    const project = resolveAuthorizedProject({ projectId: PROYECTO, home: l.home });
    expect(readMachineCapacity({ home: l.home, project }).reservations).toHaveLength(1);
    const r = limpiar(l, { confirm: true });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(l.root, ".claude", "worktrees", "ticket-uno"))).toBe(false);
    expect(readMachineCapacity({ home: l.home, project }).reservations).toHaveLength(0);
  });

  it("C13: borra la carpeta del respaldo de sync vencido y deja la vigente", () => {
    const l = nuevoLab();
    const vencido = agregarRespaldo(l, hace31Dias);
    const vigente = agregarRespaldo(l, hace3Dias);
    limpiar(l, { confirm: true });
    expect(existsSync(vencido)).toBe(false);
    expect(existsSync(vigente)).toBe(true);
  });

  it("C14: el recibo ya existe cuando git recibe el primer worktree remove", () => {
    const l = nuevoLab();
    agregarWorktree(l, "uno");
    const carpetaDeRecibos = join(l.root, ".valmen", "backups", "cleanup");
    const existiaAlQuitar: boolean[] = [];
    const git: EjecutorDeGit = (argumentos, cwd) => {
      if (argumentos[0] === "worktree" && argumentos[1] === "remove")
        existiaAlQuitar.push(
          existsSync(carpetaDeRecibos) && readdirSync(carpetaDeRecibos).length > 0,
        );
      const r = spawnSync("git", [...argumentos], { cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    };
    cleanupCommand(
      defaultPaths(l.root),
      { confirm: true },
      { home: l.home, git, ahora: AHORA },
    );
    expect(existiaAlQuitar).toEqual([true]);
    expect(readdirSync(carpetaDeRecibos)).toEqual(["20261011T120000Z.json"]);
  });

  it("C15: el recibo registra el commit de cada worktree quitado", () => {
    const l = nuevoLab();
    agregarWorktree(l, "uno", "feat/uno");
    agregarWorktree(l, "dos");
    const commit = l.git("rev-parse", "HEAD");
    limpiar(l, { confirm: true });
    const recibo = JSON.parse(
      readFileSync(
        join(l.root, ".valmen", "backups", "cleanup", "20261011T120000Z.json"),
        "utf8",
      ),
    ) as { worktrees: { carpeta: string; rama: string | null; commit: string }[] };
    expect(recibo.worktrees).toHaveLength(2);
    expect(recibo.worktrees.map((w) => w.commit)).toEqual([commit, commit]);
    expect(recibo.worktrees.find((w) => w.carpeta.endsWith("/uno"))!.rama).toBe("feat/uno");
  });

  it("C16: un worktree que git se niega a quitar se informa con el error de git y sale con 3", () => {
    const l = nuevoLab();
    const carpeta = agregarWorktree(l, "trabado");
    l.git("worktree", "lock", carpeta);
    const r = limpiar(l, { confirm: true });
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toMatch(/trabado: error: .*locked/s);
    expect(existsSync(carpeta)).toBe(true);
  });
});

describe("R-LIM-003: no toca el registro ni nada sin integrar", () => {
  it("C17: conserva un worktree limpio con un commit fuera de main, «commits sin integrar»", () => {
    const l = nuevoLab();
    const carpeta = agregarWorktree(l, "adelante", "feat/adelante");
    writeFileSync(join(carpeta, "nuevo.txt"), "x\n");
    l.gitEn(carpeta, "add", "nuevo.txt");
    l.gitEn(carpeta, "commit", "-q", "-m", "fuera de main");
    const salida = enJson(l, { confirm: true });
    expect(del(salida, "adelante").motivo).toBe("commits sin integrar");
    expect(existsSync(carpeta)).toBe(true);
    expect(l.git("branch", "--list", "feat/adelante")).not.toBe("");
  });

  it("C18: conserva un worktree ticket-<slug> cuyo ticket no está closed, «ticket sin cerrar»", () => {
    const l = nuevoLab();
    const carpeta = agregarWorktree(l, "ticket-uno", "valmen/ticket-uno");
    const registro = join(l.root, "tickets");
    const antes = readFileSync(join(registro, "2026", TICKET_A, "ticket.md"), "utf8");
    const salida = enJson(l, { confirm: true });
    expect(del(salida, "ticket-uno").motivo).toBe("ticket sin cerrar");
    expect(existsSync(carpeta)).toBe(true);
    expect(readFileSync(join(registro, "2026", TICKET_A, "ticket.md"), "utf8")).toBe(antes);
  });

  it("C19: motivoDeGitDeLimpieza rechaza banderas de fuerza y carpetas ajenas sin llamar a git", () => {
    const rechazados = [
      ["worktree", "remove", "--force", ".claude/worktrees/x"],
      ["worktree", "remove", "-f", ".claude/worktrees/x"],
      ["branch", "-D", "feat/x"],
      ["branch", "-d", "main"],
      ["worktree", "remove", "/etc"],
      ["worktree", "remove", ".claude/worktrees/../x"],
      ["worktree", "remove", "otra/carpeta"],
      ["reset", "--hard"],
      ["push"],
    ];
    for (const argumentos of rechazados)
      expect(motivoDeGitDeLimpieza(argumentos), argumentos.join(" ")).not.toBeNull();
    for (const argumentos of [
      ["worktree", "list", "--porcelain"],
      ["status", "--porcelain", "-uall"],
      ["merge-base", "--is-ancestor", "abc123", "main"],
      ["worktree", "remove", ".claude/worktrees/x"],
      ["branch", "-d", "feat/x"],
    ])
      expect(motivoDeGitDeLimpieza(argumentos), argumentos.join(" ")).toBeNull();

    let llamadas = 0;
    const ejecutor: EjecutorDeGit = () => {
      llamadas += 1;
      return { status: 0, stdout: "", stderr: "" };
    };
    expect(() =>
      ejecutarGitDeLimpieza("/no/existe", ["branch", "-D", "x"], ejecutor),
    ).toThrow();
    expect(llamadas).toBe(0);
  });
});
