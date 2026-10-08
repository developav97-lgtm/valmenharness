/**
 * Integrar la rama de un worktree al checkout principal, con repositorios git de laboratorio en
 * carpetas temporales. Nunca toca el repositorio real ni integra ramas en él.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildIndex } from "../packages/cli/src/commands.js";
import {
  crearWorktree,
  defaultPaths,
  integrarWorktree,
  motivoDeGitDeIntegracion,
  motivoDeProcesoDeWorktree,
  nombresDeWorktree,
  type EjecutorDeProceso,
  findAllTickets,
  indexPath,
  renderIndex,
} from "../packages/engine/src/index.js";
import { type Laboratorio, TICKET_A, TICKET_B, crearLaboratorio, gitRegistrado, procesoSimulado } from "./helpers/worktree-lab.js";

let lab: Laboratorio | undefined;
afterEach(() => lab?.limpiar());

const EVENTOS = ".valmen/executions/events.jsonl";
const { rama: RAMA, carpeta: CARPETA } = nombresDeWorktree(TICKET_A);

const evento = (eventId: string, cursor: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ eventId, kind: "ejecucion.avance", occurredAt: "2026-10-08T10:00:00.000Z", cursor, receivedAt: "2026-10-08T10:00:00.000Z", ...extra });

interface Entorno {
  readonly lab: Laboratorio;
  readonly wt: string;
  readonly paths: ReturnType<typeof defaultPaths>;
  integrar(opciones?: { proceso?: EjecutorDeProceso; git?: ReturnType<typeof gitRegistrado>["ejecutor"]; paths?: ReturnType<typeof defaultPaths> }): ReturnType<typeof integrarWorktree>;
  escribirEn(base: string, ruta: string, contenido: string): void;
  commitEnMain(ruta: string, contenido: string): void;
  commitEnRama(ruta: string, contenido: string): void;
}

/** Un laboratorio con el índice y un registro de eventos ya commiteados, y el worktree creado. */
function preparar(opciones: { sinWorktree?: boolean } = {}): Entorno {
  lab = crearLaboratorio();
  const l = lab;
  const paths = defaultPaths(l.root);
  mkdirSync(join(l.root, ".valmen", "executions"), { recursive: true });
  writeFileSync(join(l.root, EVENTOS), `${evento("e1", 1)}\n${evento("e2", 2)}\n`);
  writeFileSync(indexPath(paths), renderIndex(paths, findAllTickets(paths)));
  l.git("add", "-A");
  l.git("commit", "-q", "-m", "registro e índice");
  const wt = join(l.root, CARPETA);
  if (opciones.sinWorktree !== true) {
    crearWorktree({ paths, ticketId: TICKET_A, home: l.home, proceso: procesoSimulado().ejecutor });
  }
  const escribirEn = (base: string, ruta: string, contenido: string): void => {
    mkdirSync(join(base, ruta, ".."), { recursive: true });
    writeFileSync(join(base, ruta), contenido);
  };
  return {
    lab: l,
    wt,
    paths,
    integrar: (o = {}) =>
      integrarWorktree({ paths: o.paths ?? paths, ticketId: TICKET_A, home: l.home, proceso: o.proceso ?? procesoSimulado().ejecutor, ...(o.git === undefined ? {} : { git: o.git }) }),
    escribirEn,
    commitEnMain: (ruta, contenido) => {
      escribirEn(l.root, ruta, contenido);
      l.git("add", "-A");
      l.git("commit", "-q", "-m", `main: ${ruta}`);
    },
    commitEnRama: (ruta, contenido) => {
      escribirEn(wt, ruta, contenido);
      l.gitEn(wt, "add", "-A");
      l.gitEn(wt, "commit", "-q", "-m", `rama: ${ruta}`);
    },
  };
}

const padres = (l: Laboratorio, rev = "HEAD"): string[] => l.git("rev-list", "--parents", "-n", "1", rev).split(" ").slice(1);
const estado = (l: Laboratorio): string => l.git("status", "--porcelain");
const rechazo = (e: Entorno, patron: RegExp, opciones?: Parameters<Entorno["integrar"]>[0]): void => {
  const antes = e.lab.git("rev-parse", "HEAD");
  expect(() => e.integrar(opciones)).toThrow(patron);
  expect(e.lab.git("rev-parse", "HEAD")).toBe(antes);
};

describe("las barreras previas", () => {
  it("se niega si el checkout principal está sucio, sin modificar nada (C9)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    e.escribirEn(e.lab.root, "otro.txt", "sin commit\n");
    rechazo(e, /checkout principal tiene cambios sin commit \(otro\.txt\)/);
    expect(readFileSync(join(e.lab.root, "otro.txt"), "utf8")).toBe("sin commit\n");
    expect(existsSync(join(e.lab.root, "codigo/a.txt"))).toBe(false);
  });

  it("se niega si un archivo con cambios sin commit del principal también lo cambia la rama (C10)", () => {
    const e = preparar();
    e.commitEnRama(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("t3", 3)}\n`);
    // El estado del harness no cuenta como sucio, pero sí como solape.
    writeFileSync(join(e.lab.root, EVENTOS), `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("o3", 3)}\n`);
    rechazo(e, /también cambia la rama \(\.valmen\/executions\/events\.jsonl\)/);
    expect(readFileSync(join(e.lab.root, EVENTOS), "utf8")).toContain("o3");
  });

  it("un cambio sin commit del principal que la rama no toca no estorba (C10)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    writeFileSync(join(e.lab.root, EVENTOS), `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("o3", 3)}\n`);
    expect(e.integrar().modo).toBe("avance-directo");
    expect(readFileSync(join(e.lab.root, EVENTOS), "utf8")).toContain("o3");
  });

  it("se niega si la rama cambia archivos que una jornada no commitea (C11)", () => {
    const e = preparar();
    e.commitEnRama(".valmen/routing.yaml", "x: 1\n");
    rechazo(e, /cambia archivos que no se integran: .*\.valmen\/routing\.yaml/);
  });

  it("se niega si el worktree tiene cambios sin commit (C12)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    e.escribirEn(e.wt, "sucio.txt", "x\n");
    rechazo(e, /worktree .* tiene cambios sin commit \(sucio\.txt\)/);
  });

  it("sobre una rama ya integrada dice «nada que integrar» y no modifica main (C13)", () => {
    const e = preparar();
    const antes = e.lab.git("rev-parse", "HEAD");
    const r = e.integrar();
    expect(r.modo).toBe("nada-que-integrar");
    expect(e.lab.git("rev-parse", "HEAD")).toBe(antes);
    e.commitEnRama("codigo/a.txt", "a\n");
    e.integrar();
    const integrada = e.lab.git("rev-parse", "HEAD");
    expect(e.integrar().modo).toBe("nada-que-integrar");
    expect(e.lab.git("rev-parse", "HEAD")).toBe(integrada);
  });

  it("se niega si el checkout principal no está en main (C14)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    e.lab.git("checkout", "-q", "-b", "otra");
    rechazo(e, /está en "otra", no en main/);
  });

  it("se niega a correr desde un worktree enlazado y señala el checkout principal (C15)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    expect(() => e.integrar({ paths: defaultPaths(e.wt) })).toThrow(/worktree enlazado.*checkout principal/);
    expect(e.lab.git("branch", "--list", RAMA)).toContain(RAMA);
  });

  it("se niega si la rama o el worktree del ticket no existen (C16)", () => {
    const e = preparar({ sinWorktree: true });
    rechazo(e, /La rama valmen\/ticket-uno no existe/);
    e.lab.git("branch", RAMA);
    rechazo(e, /El worktree .* no existe/);
  });
});

describe("avance directo y merge", () => {
  it("avanza main con merge --ff-only cuando no se movió, sin commit de merge (C17)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    const puntaDeLaRama = e.lab.gitEn(e.wt, "rev-parse", "HEAD");
    const r = e.integrar();
    expect(r.modo).toBe("avance-directo");
    expect(e.lab.git("rev-parse", "HEAD")).toBe(puntaDeLaRama);
    expect(padres(e.lab)).toHaveLength(1);
    expect(r.indiceRegenerado).toBe(false);
    expect(readFileSync(join(e.lab.root, "codigo/a.txt"), "utf8")).toBe("a\n");
  });

  it("hace merge --no-ff cuando main avanzó, con dos padres (C19)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    e.commitEnMain("codigo/b.txt", "b\n");
    const r = e.integrar();
    expect(r.modo).toBe("merge");
    expect(padres(e.lab)).toHaveLength(2);
    expect(e.lab.git("log", "-1", "--format=%s")).toBe(`Integra ${TICKET_A} desde su worktree`);
    expect(existsSync(join(e.lab.root, "codigo/a.txt")) && existsSync(join(e.lab.root, "codigo/b.txt"))).toBe(true);
    expect(estado(e.lab)).toBe("");
  });

  it("une las dos versiones de events.jsonl por eventId con cursores consecutivos (C20)", () => {
    const e = preparar();
    e.commitEnRama(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("t3", 3)}\n${evento("t4", 4)}\n`);
    e.commitEnMain(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("o3", 3)}\n`);
    const r = e.integrar();
    expect(r.registrosUnidos).toEqual([EVENTOS]);
    const lineas = readFileSync(join(e.lab.root, EVENTOS), "utf8").split("\n").filter((l) => l !== "");
    const eventos = lineas.map((l) => JSON.parse(l) as { eventId: string; cursor: number });
    expect(eventos.map((x) => x.eventId)).toEqual(["e1", "e2", "o3", "t3", "t4"]);
    expect(eventos.map((x) => x.cursor)).toEqual([1, 2, 3, 4, 5]);
    expect(padres(e.lab)).toHaveLength(2);
    expect(estado(e.lab)).toBe("");
  });

  it("ante un conflicto de código no modifica main, lista los archivos y no deja merge a medias (C18)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "rama\n");
    e.commitEnMain("codigo/a.txt", "main\n");
    rechazo(e, /Conflicto de código .* en: codigo\/a\.txt\. No se tocó main/);
    expect(existsSync(join(e.lab.root, ".git", "MERGE_HEAD"))).toBe(false);
    expect(readFileSync(join(e.lab.root, "codigo/a.txt"), "utf8")).toBe("main\n");
    expect(estado(e.lab)).toBe("");
  });

  it("un conflicto de código junto a uno de registro tampoco toca main (C18)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "rama\n");
    e.commitEnRama(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("t3", 3)}\n`);
    e.commitEnMain("codigo/a.txt", "main\n");
    e.commitEnMain(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("o3", 3)}\n`);
    rechazo(e, /Conflicto de código .* en: codigo\/a\.txt/);
  });

  it("si la unión de un registro es imposible hace merge --abort y deja main como estaba (C21)", () => {
    const e = preparar();
    e.commitEnRama(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2, { kind: "editada" })}\n`);
    e.commitEnMain(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("o3", 3)}\n`);
    e.commitEnRama("codigo/a.txt", "a\n");
    rechazo(e, /No se puede unir el registro: .*events\.jsonl.*merge --abort/);
    expect(existsSync(join(e.lab.root, ".git", "MERGE_HEAD"))).toBe(false);
    expect(estado(e.lab)).toBe("");
    expect(existsSync(join(e.lab.root, "codigo/a.txt"))).toBe(false);
  });

  it("un eventId con contenido distinto en las dos versiones también aborta (C21)", () => {
    const e = preparar();
    e.commitEnRama(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("dup", 3, { kind: "a" })}\n`);
    e.commitEnMain(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("dup", 3, { kind: "b" })}\n`);
    rechazo(e, /eventId dup tiene contenido distinto/);
    expect(estado(e.lab)).toBe("");
  });
});

describe("el índice y la recompilación", () => {
  it("regenera tickets/index.md y coincide con el de `valmen index` (C22)", () => {
    const e = preparar();
    const ruta = join(e.wt, "tickets", TICKET_B.slice(-8, -4), TICKET_B, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("workflow_status: approved", "workflow_status: in_progress"));
    e.lab.gitEn(e.wt, "add", "-A");
    e.lab.gitEn(e.wt, "commit", "-q", "-m", "rama: avanza otro ticket");
    e.commitEnMain("codigo/b.txt", "b\n");
    const r = e.integrar();
    expect(r.indiceRegenerado).toBe(true);
    expect(buildIndex(e.paths, true).exitCode).toBe(0);
    expect(readFileSync(indexPath(e.paths), "utf8")).toContain("in_progress");
    expect(estado(e.lab)).toBe("");
    expect(padres(e.lab)).toHaveLength(2);
  });

  it("tras un avance directo el índice regenerado va en un commit propio (C22)", () => {
    const e = preparar();
    const ruta = join(e.wt, "tickets", TICKET_B.slice(-8, -4), TICKET_B, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("workflow_status: approved", "workflow_status: in_progress"));
    e.lab.gitEn(e.wt, "add", "-A");
    e.lab.gitEn(e.wt, "commit", "-q", "-m", "rama: avanza otro ticket");
    const punta = e.lab.gitEn(e.wt, "rev-parse", "HEAD");
    const r = e.integrar();
    expect(r.modo).toBe("avance-directo");
    expect(r.indiceRegenerado).toBe(true);
    expect(e.lab.git("rev-parse", "HEAD~1")).toBe(punta);
    expect(padres(e.lab)).toHaveLength(1);
    expect(buildIndex(e.paths, true).exitCode).toBe(0);
  });

  it("recompila el checkout principal con la receta de build tras integrar (C23)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    const proceso = procesoSimulado();
    e.integrar({ proceso: proceso.ejecutor });
    expect(proceso.llamadas.map((l) => `${l.comando} ${l.argumentos.join(" ")}`)).toEqual(["npx tsc --build tsconfig.build.json", "node scripts/copy-web.mjs"]);
    expect(proceso.llamadas.every((l) => l.cwd === e.lab.root)).toBe(true);
    // Sobre una rama ya integrada no hay nada que recompilar.
    const otra = procesoSimulado();
    e.integrar({ proceso: otra.ejecutor });
    expect(otra.llamadas).toEqual([]);
  });

  it("si la recompilación falla conserva la integración y lo dice (C24)", () => {
    const e = preparar();
    e.commitEnRama("codigo/a.txt", "a\n");
    const punta = e.lab.gitEn(e.wt, "rev-parse", "HEAD");
    expect(() => e.integrar({ proceso: procesoSimulado({ fallaEn: "tsc" }).ejecutor })).toThrow(/quedó integrada en main.*la recompilación falló.*se conserva/s);
    expect(e.lab.git("rev-parse", "HEAD")).toBe(punta);
  });
});

describe("las listas cerradas", () => {
  it("todo lo que lanza integrate sale de las listas, sin push, fetch, reset ni fuerza (C27)", () => {
    const e = preparar();
    e.commitEnRama(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("t3", 3)}\n`);
    e.commitEnMain(EVENTOS, `${evento("e1", 1)}\n${evento("e2", 2)}\n${evento("o3", 3)}\n`);
    const git = gitRegistrado();
    const proceso = procesoSimulado();
    e.integrar({ git: git.ejecutor, proceso: proceso.ejecutor });
    expect(git.llamadas.length).toBeGreaterThan(12);
    for (const argumentos of git.llamadas) expect(motivoDeGitDeIntegracion(argumentos)).toBeNull();
    for (const l of proceso.llamadas) expect(motivoDeProcesoDeWorktree(l.comando, l.argumentos)).toBeNull();
    const operaciones = new Set(git.llamadas.map((a) => a[0]));
    for (const prohibida of ["push", "fetch", "pull", "reset", "rebase", "clean", "tag", "remote"]) expect(operaciones.has(prohibida)).toBe(false);
    for (const b of ["--force", "-f", "-D", "--hard"]) expect(git.llamadas.flat()).not.toContain(b);
    for (const esperada of ["show", "merge-tree", "merge", "add", "commit", "diff"]) expect(operaciones).toContain(esperada);
  });

  it("rechaza lo que no está en la lista antes de lanzarlo (C27)", () => {
    for (const a of [
      ["push"], ["fetch"], ["pull"], ["reset", "--hard"], ["rebase", "main"], ["clean", "-fd"], ["tag", "x"], ["remote", "add", "o", "u"],
      ["merge", "valmen/ticket-uno"], ["merge", "--ff-only", "main"], ["merge", "--no-ff", "valmen/ticket-uno"],
      ["commit", "--amend", "-m", "x"], ["commit", "-m"], ["add", "-A"], ["add", "--", "../fuera"], ["add", "--"],
      ["show", "HEAD"], ["show", "main:../x"], ["diff", "--name-only", "main"], ["merge-tree", "a", "b"],
      ["branch", "-D", "valmen/ticket-uno"], ["merge", "--no-ff", "--no-commit", "valmen/ticket-uno", "--force"],
    ]) {
      expect(motivoDeGitDeIntegracion(a), a.join(" ")).not.toBeNull();
    }
    for (const a of [
      ["show", "main:.valmen/executions/events.jsonl"], ["diff", "--name-only", "-z", "main...valmen/ticket-uno"], ["merge-base", "main", "valmen/ticket-uno"],
      ["merge-tree", "--write-tree", "--name-only", "--no-messages", "main", "valmen/ticket-uno"], ["merge", "--ff-only", "valmen/ticket-uno"],
      ["merge", "--no-ff", "--no-commit", "valmen/ticket-uno"], ["merge", "--abort"], ["add", "--", "a.txt", "b/c.txt"], ["commit", "-m", "Integra"],
      ["status", "--porcelain", "-uall"], ["merge-base", "--is-ancestor", "a", "b"],
    ]) {
      expect(motivoDeGitDeIntegracion(a), a.join(" ")).toBeNull();
    }
  });
});
