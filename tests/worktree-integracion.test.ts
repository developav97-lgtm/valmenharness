/**
 * Crear y quitar el worktree de un ticket, contra un repositorio git de laboratorio de verdad.
 * La compilación se simula con un ejecutor que registra las llamadas; `cp` es el real.
 */
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  crearWorktree,
  defaultPaths,
  motivoDeGitDeWorktree,
  motivoDeProcesoDeWorktree,
  nombresDeWorktree,
  quitarWorktree,
  readMachineCapacity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import {
  type Laboratorio,
  PROYECTO,
  TICKET_A,
  TICKET_B,
  crearLaboratorio,
  gitRegistrado,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

let lab: Laboratorio;
afterEach(() => lab?.limpiar());

const nombres = (id: string) => nombresDeWorktree(id);
const reservas = () => readMachineCapacity({ home: lab.home, project: resolveAuthorizedProject({ projectId: PROYECTO, home: lab.home }) }).reservations;
const ramas = () => lab.git("branch", "--list", "valmen/*");
const crear = (id = TICKET_A, extra: Partial<Parameters<typeof crearWorktree>[0]> = {}) =>
  crearWorktree({ paths: defaultPaths(lab.root), ticketId: id, home: lab.home, proceso: procesoSimulado().ejecutor, ...extra });
const quitar = (id = TICKET_A) => quitarWorktree({ paths: defaultPaths(lab.root), ticketId: id, home: lab.home });

/** Integra a mano la rama del ticket en main, como hará el ticket de integración. */
function integrar(id: string, archivo = "hecho.txt"): void {
  const { carpeta, rama } = nombres(id);
  const absoluta = join(lab.root, carpeta);
  writeFileSync(join(absoluta, archivo), "hecho\n");
  lab.gitEn(absoluta, "add", archivo);
  lab.gitEn(absoluta, "commit", "-q", "-m", "trabajo");
  lab.git("merge", "-q", "--ff-only", rama);
}

describe("crear el worktree", () => {
  it("deja la carpeta y la rama apuntando al mismo commit que main (C4)", () => {
    lab = crearLaboratorio();
    const r = crear();
    const { carpeta, rama } = nombres(TICKET_A);
    expect(r.carpeta).toBe(carpeta);
    expect(existsSync(join(lab.root, carpeta, ".git"))).toBe(true);
    expect(lab.git("rev-parse", rama)).toBe(lab.git("rev-parse", "main"));
    expect(lab.gitEn(join(lab.root, carpeta), "rev-parse", "--abbrev-ref", "HEAD")).toBe(rama);
    expect(r.commit).toBe(lab.git("rev-parse", "main"));
  });

  it("clona node_modules con los enlaces de @valmen resolviendo dentro del worktree (C5)", () => {
    lab = crearLaboratorio();
    crear();
    const absoluta = join(lab.root, nombres(TICKET_A).carpeta);
    expect(existsSync(join(absoluta, "node_modules", "otro", "index.js"))).toBe(true);
    const enlace = realpathSync(join(absoluta, "node_modules", "@valmen", "core"));
    expect(enlace.startsWith(realpathSync(absoluta))).toBe(true);
    expect(enlace).toBe(join(realpathSync(absoluta), "packages", "core"));
  });

  it("se niega, sin dejar worktree ni rama ni cupo, si el clon no queda contenido en el worktree (C6)", () => {
    lab = crearLaboratorio();
    rmSync(join(lab.root, "node_modules", "@valmen", "core"));
    symlinkSync(join(lab.root, "packages", "core"), join(lab.root, "node_modules", "@valmen", "core"));
    expect(() => crear()).toThrow(/no quedó contenido en el worktree/);
    expect(existsSync(join(lab.root, nombres(TICKET_A).carpeta))).toBe(false);
    expect(ramas()).toBe("");
    expect(reservas()).toEqual([]);
    expect(lab.git("worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree "))).toHaveLength(1);
  });

  it("compila en el worktree con la receta de build (C7)", () => {
    lab = crearLaboratorio();
    const proceso = procesoSimulado();
    crear(TICKET_A, { proceso: proceso.ejecutor });
    const absoluta = join(lab.root, nombres(TICKET_A).carpeta);
    const [, tsc, web] = proceso.llamadas;
    expect(proceso.llamadas.map((l) => l.comando)).toEqual(["cp", "npx", "node"]);
    expect(proceso.llamadas[0]!.argumentos[0]).toBe("-Rc");
    expect(tsc).toEqual({ comando: "npx", argumentos: ["tsc", "--build", "tsconfig.build.json"], cwd: absoluta });
    expect(web).toEqual({ comando: "node", argumentos: ["scripts/copy-web.mjs"], cwd: absoluta });
  });

  it("si la compilación falla no deja worktree, rama ni cupo (C8)", () => {
    lab = crearLaboratorio();
    for (const falla of ["tsc --build", "copy-web"]) {
      expect(() => crear(TICKET_A, { proceso: procesoSimulado({ fallaEn: falla }).ejecutor })).toThrow(/La compilación falló/);
      expect(existsSync(join(lab.root, nombres(TICKET_A).carpeta))).toBe(false);
      expect(ramas()).toBe("");
      expect(reservas()).toEqual([]);
    }
    // Y el ticket puede intentarse otra vez.
    expect(() => crear()).not.toThrow();
  });

  it("se niega, sin tocarlos, si el worktree o la rama ya existen (C9)", () => {
    lab = crearLaboratorio();
    const { carpeta, rama } = nombres(TICKET_A);
    lab.git("branch", rama);
    expect(() => crear()).toThrow(/La rama valmen\/ticket-uno ya existe/);
    expect(lab.git("rev-parse", rama)).toBe(lab.git("rev-parse", "main"));
    expect(existsSync(join(lab.root, carpeta))).toBe(false);
    expect(reservas()).toEqual([]);
    lab.git("branch", "-d", rama);

    mkdirSync(join(lab.root, carpeta), { recursive: true });
    writeFileSync(join(lab.root, carpeta, "mio.txt"), "no se toca\n");
    expect(() => crear()).toThrow(/ya existe/);
    expect(existsSync(join(lab.root, carpeta, "mio.txt"))).toBe(true);
    expect(ramas()).toBe("");
    expect(reservas()).toEqual([]);
  });

  it("se niega si el ticket no está registrado en main (C10)", () => {
    lab = crearLaboratorio();
    const sinCommit = "FEATURE-WT-TRES-20261008";
    writeFixtureTicket(lab.root, { id: sinCommit, workflowStatus: "approved", type: "FEATURE", module: "WT" });
    expect(() => crear(sinCommit)).toThrow(/no está registrado en main/);
    expect(() => crear("FEATURE-WT-NUNCA-20261008")).toThrow(/no está registrado/);
    expect(ramas()).toBe("");
    expect(reservas()).toEqual([]);
  });

  it("reserva un cupo de la máquina cuando el proyecto está declarado (C11)", () => {
    lab = crearLaboratorio();
    const r = crear();
    expect(r.reserva).toBe("reservada");
    expect(reservas()).toMatchObject([{ projectId: PROYECTO, ticketId: TICKET_A, attemptId: "worktree" }]);
  });

  it("si el proyecto no está declarado en la máquina sigue sin reservar y lo dice (C11)", () => {
    lab = crearLaboratorio({ declarado: false });
    const r = crear();
    expect(r.reserva).toBe("no-declarada");
    expect(r.avisos.join(" ")).toMatch(/no está declarado/);
    expect(existsSync(join(lab.root, nombres(TICKET_A).carpeta))).toBe(true);
  });

  it("se niega, sin dejar worktree ni rama, cuando no hay cupo (C12)", () => {
    lab = crearLaboratorio({ capacidad: 1 });
    crear(TICKET_A);
    expect(() => crear(TICKET_B)).toThrow(/no tiene cupo/);
    expect(existsSync(join(lab.root, nombres(TICKET_B).carpeta))).toBe(false);
    expect(ramas()).toContain(nombres(TICKET_A).rama);
    expect(ramas()).not.toContain(nombres(TICKET_B).rama);
    expect(reservas()).toHaveLength(1);
  });

  it("se niega a correr desde un worktree enlazado y señala el checkout principal (C13)", () => {
    lab = crearLaboratorio();
    crear(TICKET_A);
    const enlazado = join(lab.root, nombres(TICKET_A).carpeta);
    const paths = defaultPaths(enlazado);
    expect(() => crearWorktree({ paths, ticketId: TICKET_B, home: lab.home, proceso: procesoSimulado().ejecutor })).toThrow(/worktree enlazado.*checkout principal/);
    expect(() => quitarWorktree({ paths, ticketId: TICKET_A, home: lab.home })).toThrow(/worktree enlazado.*checkout principal/);
    expect(existsSync(join(enlazado, ".claude"))).toBe(false);
    expect(existsSync(join(lab.root, nombres(TICKET_B).carpeta))).toBe(false);
  });
});

describe("quitar el worktree", () => {
  it("deja al ticket integrado sin worktree ni rama (C14)", () => {
    lab = crearLaboratorio();
    crear();
    integrar(TICKET_A);
    const r = quitar();
    expect(r.rama).toBe("valmen/ticket-uno");
    expect(existsSync(join(lab.root, nombres(TICKET_A).carpeta))).toBe(false);
    expect(ramas()).toBe("");
    expect(lab.git("worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree "))).toHaveLength(1);
    expect(existsSync(join(lab.root, "hecho.txt"))).toBe(true);
  });

  it("libera el cupo reservado para el ticket (C15)", () => {
    lab = crearLaboratorio({ capacidad: 1 });
    crear();
    expect(reservas()).toHaveLength(1);
    integrar(TICKET_A);
    expect(quitar().reserva).toBe("liberada");
    expect(reservas()).toEqual([]);
    // Y el cupo vuelve a servir.
    expect(() => crear(TICKET_B)).not.toThrow();
  });

  it("se niega, conservando worktree y rama, si la rama no está integrada (C16)", () => {
    lab = crearLaboratorio();
    crear();
    const { carpeta, rama } = nombres(TICKET_A);
    const absoluta = join(lab.root, carpeta);
    writeFileSync(join(absoluta, "pendiente.txt"), "x\n");
    lab.gitEn(absoluta, "add", "pendiente.txt");
    lab.gitEn(absoluta, "commit", "-q", "-m", "sin integrar");
    expect(() => quitar()).toThrow(/no está integrada en main/);
    expect(existsSync(absoluta)).toBe(true);
    expect(ramas()).toContain(rama);
    expect(reservas()).toHaveLength(1);
  });

  it("se niega, conservando worktree y rama, si el worktree tiene cambios sin commit (C17)", () => {
    lab = crearLaboratorio();
    crear();
    const { carpeta, rama } = nombres(TICKET_A);
    const absoluta = join(lab.root, carpeta);
    writeFileSync(join(absoluta, "sucio.txt"), "x\n");
    expect(() => quitar()).toThrow(/cambios sin commit \(sucio\.txt\)/);
    expect(existsSync(join(absoluta, "sucio.txt"))).toBe(true);
    expect(ramas()).toContain(rama);
    expect(reservas()).toHaveLength(1);
  });

  it("se niega si la rama no existe y no toca una carpeta ajena", () => {
    lab = crearLaboratorio();
    expect(() => quitar()).toThrow(/no existe/);
    lab.git("branch", nombres(TICKET_A).rama);
    const ajena = join(lab.root, nombres(TICKET_A).carpeta);
    mkdirSync(ajena, { recursive: true });
    writeFileSync(join(ajena, "mio.txt"), "x\n");
    expect(() => quitar()).toThrow(/no es un worktree registrado/);
    expect(existsSync(join(ajena, "mio.txt"))).toBe(true);
    expect(ramas()).toContain("valmen/ticket-uno");
  });

  it("se niega si el checkout principal no está en main", () => {
    lab = crearLaboratorio();
    crear();
    integrar(TICKET_A);
    lab.git("checkout", "-q", "-b", "otra");
    expect(() => quitar()).toThrow(/no en main/);
    expect(existsSync(join(lab.root, nombres(TICKET_A).carpeta))).toBe(true);
  });
});

describe("las listas cerradas", () => {
  it("todo lo que lanzan create y remove sale de las listas, sin push, fetch, reset ni fuerza (C18)", () => {
    lab = crearLaboratorio();
    const git = gitRegistrado();
    const proceso = procesoSimulado();
    crearWorktree({ paths: defaultPaths(lab.root), ticketId: TICKET_A, home: lab.home, git: git.ejecutor, proceso: proceso.ejecutor });
    integrar(TICKET_A);
    quitarWorktree({ paths: defaultPaths(lab.root), ticketId: TICKET_A, home: lab.home, git: git.ejecutor });
    expect(git.llamadas.length).toBeGreaterThan(8);
    for (const argumentos of git.llamadas) expect(motivoDeGitDeWorktree(argumentos)).toBeNull();
    for (const l of proceso.llamadas) expect(motivoDeProcesoDeWorktree(l.comando, l.argumentos)).toBeNull();
    const operaciones = new Set(git.llamadas.map((a) => a[0]));
    for (const prohibida of ["push", "fetch", "pull", "reset", "rebase", "clean", "tag", "remote"]) {
      expect(operaciones.has(prohibida)).toBe(false);
    }
    const banderas = git.llamadas.flat();
    for (const b of ["--force", "-f", "-D", "--hard"]) expect(banderas).not.toContain(b);
    expect(operaciones).toContain("worktree");
  });
});
