/**
 * La entrega se mide y avisa al pasar el tope (R-ENT-001, R-ENT-002): C1–C17.
 *
 * Repositorios git de laboratorio en carpetas temporales; nunca toca el repositorio real.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { journeyWorktreeCommand } from "../packages/cli/src/worktree.js";
import { parseTicket } from "../packages/core/src/index.js";
import {
  appendEvent,
  armarParteDeJornada,
  crearWorktree,
  defaultPaths,
  findAllTickets,
  hashDeArchivos,
  indexPath,
  integrarTicket,
  medirEntrega,
  motivoDeGitDeIntegracion,
  nombresDeWorktree,
  renderIndex,
  renderJourneyHandoffNotification,
  topeDeEntrega,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import { crearEntornoOla, crearJornada, enJornada, ticketEn } from "./helpers/ola.js";
import {
  type Laboratorio,
  TICKET_A,
  crearLaboratorio,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

const limpiezas: (() => void)[] = [];
afterEach(() => {
  while (limpiezas.length > 0) limpiezas.pop()?.();
});

const lineas = (n: number, prefijo = "l"): string =>
  Array.from({ length: n }, (_, i) => `${prefijo}${i}`).join("\n") + "\n";
const numstat = (...filas: string[]): string => filas.map((f) => `${f}\0`).join("");
const eventosDe = (root: string, id: string) =>
  (
    parseTicket(
      readFileSync(join(root, "tickets", id.slice(-8, -4), id, "ticket.md"), "utf8"),
    ).blocks.Eventos as { action: string; details: string }[]
  ).filter((e) => e.action === "delivery-size");

describe("medir y leer el tope", () => {
  it("C1 120 añadidas más 30 borradas dan 150 de total", () => {
    const r = medirEntrega(numstat("100\t10\tsrc/a.ts", "20\t20\tsrc/b.ts"));
    expect(r).toMatchObject({ añadidas: 120, borradas: 30, total: 150 });
  });

  it("C1 un binario cuenta 0 y un renombre trae dos rutas", () => {
    const salida = `-\t-\timg/x.png\0`.concat("5\t2\t\0src/viejo.ts\0src/nuevo.ts\0");
    expect(medirEntrega(salida)).toMatchObject({ añadidas: 5, borradas: 2, total: 7 });
  });

  it("C2 no cuenta las rutas del registro del harness", () => {
    const r = medirEntrega(
      numstat(
        "10\t0\tsrc/a.ts",
        "500\t5\ttickets/2026/X/ticket.md",
        "50\t0\ttickets/index.md",
        "40\t0\t.valmen/journeys/events.jsonl",
        "30\t0\t.valmen/receipts/X.jsonl",
      ),
    );
    expect(r.total).toBe(10);
  });

  it("C3 no cuenta los archivos generados de la lista acordada", () => {
    const r = medirEntrega(
      numstat(
        "10\t0\tsrc/a.ts",
        "80\t0\tAGENTS.md",
        "70\t0\tCLAUDE.md",
        "900\t800\tpackage-lock.json",
      ),
    );
    expect(r.total).toBe(10);
  });

  // El tope por defecto subió de 400 a 600 líneas el 2026-10-13 (decisión del PO por AskUserQuestion).
  it("C4 el tope es 600 si config.yaml no declara delivery-budget", () => {
    const root = mkdtempSync(join(tmpdir(), "valmen-tope-"));
    limpiezas.push(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, ".valmen"));
    expect(topeDeEntrega(root)).toBe(600);
    writeFileSync(join(root, ".valmen", "config.yaml"), "delivery-budget: 0\n");
    expect(topeDeEntrega(root)).toBe(600);
  });

  it("C5 el tope es el que declara delivery-budget", () => {
    const root = mkdtempSync(join(tmpdir(), "valmen-tope-"));
    limpiezas.push(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, ".valmen"));
    writeFileSync(join(root, ".valmen", "config.yaml"), "delivery-budget: 250\n");
    expect(topeDeEntrega(root)).toBe(250);
  });

  it("C6 la lista cerrada de git admite diff --numstat -z <rango> y ninguna otra forma", () => {
    const rama = "main...valmen/ticket-uno";
    expect(motivoDeGitDeIntegracion(["diff", "--numstat", "-z", rama])).toBeNull();
    expect(motivoDeGitDeIntegracion(["diff", "--numstat", rama])).not.toBeNull();
    expect(
      motivoDeGitDeIntegracion(["diff", "--numstat", "-z", "--output=x", rama]),
    ).not.toBeNull();
    expect(motivoDeGitDeIntegracion(["diff", "--numstat", "-z", "-x"])).not.toBeNull();
  });
});

const { carpeta: CARPETA } = nombresDeWorktree(TICKET_A);

/** Un laboratorio con `src/dato.txt` (30 líneas) en main y el worktree de A creado. */
function worktree(): {
  lab: Laboratorio;
  wt: string;
  paths: ReturnType<typeof defaultPaths>;
} {
  const lab = crearLaboratorio();
  limpiezas.push(() => lab.limpiar());
  const paths = defaultPaths(lab.root);
  mkdirSync(join(lab.root, "src"), { recursive: true });
  writeFileSync(join(lab.root, "src", "dato.txt"), lineas(30, "viejo"));
  writeFileSync(indexPath(paths), renderIndex(paths, findAllTickets(paths)));
  lab.git("add", "-A");
  lab.git("commit", "-q", "-m", "registro e índice");
  crearWorktree({
    paths,
    ticketId: TICKET_A,
    home: lab.home,
    proceso: procesoSimulado().ejecutor,
  });
  return { lab, wt: join(lab.root, CARPETA), paths };
}

/** Con `borradas`, la rama reescribe `dato.txt` (30 borradas) con `añadidas` líneas; sin ellas, solo añade un archivo. */
function cambiarRama(
  e: ReturnType<typeof worktree>,
  añadidas: number,
  borradas: boolean,
): void {
  writeFileSync(
    join(e.wt, "src", borradas ? "dato.txt" : "nuevo.txt"),
    lineas(añadidas, "nuevo"),
  );
  e.lab.gitEn(e.wt, "add", "-A");
  e.lab.gitEn(e.wt, "commit", "-q", "-m", "rama: cambio");
}

const integrar = (
  e: ReturnType<typeof worktree>,
  git?: Parameters<typeof journeyWorktreeCommand>[3] extends infer O
    ? O extends { git?: infer G }
      ? G
      : never
    : never,
) =>
  journeyWorktreeCommand(
    e.paths,
    ["integrate"],
    { id: TICKET_A },
    {
      home: e.lab.home,
      proceso: procesoSimulado().ejecutor,
      ...(git === undefined ? {} : { git }),
    },
  );

describe("integrar un worktree", () => {
  it("C7 el ticket gana un evento delivery-size con 120 añadidas, 30 borradas y 150 de total", () => {
    const e = worktree();
    cambiarRama(e, 120, true);
    const r = integrar(e);
    expect(r.exitCode).toBe(0);
    const eventos = eventosDe(e.lab.root, TICKET_A);
    expect(eventos).toHaveLength(1);
    expect(JSON.parse(eventos[0]!.details)).toMatchObject({
      añadidas: 120,
      borradas: 30,
      total: 150,
      tope: 600,
      pasaElTope: false,
      via: "worktree",
    });
  });

  it("C8 por avance directo el checkout principal queda sin cambios sin commitear", () => {
    const e = worktree();
    cambiarRama(e, 120, true);
    expect(integrar(e).stdout).toContain("avance directo");
    expect(e.lab.git("status", "--porcelain")).toBe("");
  });

  it("C9 con merge --no-ff también registra el evento y deja el árbol limpio", () => {
    const e = worktree();
    cambiarRama(e, 120, true);
    writeFileSync(join(e.lab.root, "otro.txt"), "x\n");
    e.lab.git("add", "-A");
    e.lab.git("commit", "-q", "-m", "main avanza");
    const r = integrar(e);
    expect(r.stdout).toContain("merge --no-ff");
    expect(eventosDe(e.lab.root, TICKET_A)).toHaveLength(1);
    expect(e.lab.git("status", "--porcelain")).toBe("");
    expect(e.lab.git("rev-list", "--parents", "-n", "1", "HEAD").split(" ")).toHaveLength(
      3,
    );
  });

  it("C10 con 900 líneas contra el tope de 600 termina con código de salida 0", () => {
    const e = worktree();
    cambiarRama(e, 900, false);
    expect(integrar(e).exitCode).toBe(0);
    expect(eventosDe(e.lab.root, TICKET_A)).toHaveLength(1);
  });

  // El tope por defecto subió de 400 a 600 líneas el 2026-10-13 (decisión del PO por AskUserQuestion).
  it("C11 con 900 líneas contra el tope de 600 la salida avisa 900 contra 600", () => {
    const e = worktree();
    cambiarRama(e, 900, false);
    const r = integrar(e);
    expect(r.stdout).toContain("Tamaño de la entrega: 900 líneas (+900 −0), tope 600.");
    expect(r.stdout).toContain("Aviso: La entrega de");
    expect(r.stdout).toContain("suma 900 líneas (+900 −0), más que el tope de 600");
  });

  it("C12 si la medición falla integra la rama con un aviso de que no se pudo medir", () => {
    const e = worktree();
    cambiarRama(e, 120, true);
    const git = (argumentos: readonly string[], cwd: string) => {
      if (argumentos.includes("--numstat"))
        return { status: 128, stdout: "", stderr: "fallo simulado" };
      const r = spawnSync("git", [...argumentos], { cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
    };
    const r = integrar(e, git as never);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Aviso: no se pudo medir");
    expect(readFileSync(join(e.lab.root, "src", "dato.txt"), "utf8")).toContain("nuevo0");
    expect(eventosDe(e.lab.root, TICKET_A)).toHaveLength(0);
  });
});

describe("integrar un ticket de la jornada", () => {
  const ID = "FEATURE-ENTREGA-UNO-20261011";

  function jornada(): {
    root: string;
    paths: ReturnType<typeof defaultPaths>;
    hash: string;
  } {
    const home = mkdtempSync(join(tmpdir(), "valmen-ent-"));
    limpiezas.push(() => rmSync(home, { recursive: true, force: true }));
    const root = join(home, "proyecto");
    mkdirSync(join(root, ".valmen"), { recursive: true });
    writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: ent-lab\n");
    writeFixtureTicket(root, {
      id: ID,
      workflowStatus: "in_progress",
      type: "FEATURE",
      module: "ENTREGA",
    });
    const g = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "T");
    g("add", "-A");
    g("commit", "-q", "-m", "base");
    g("switch", "-q", "-c", "valmen/jornada-20261011");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "uno.ts"), lineas(900));
    return { root, paths: defaultPaths(root), hash: hashDeArchivos(root, ["src/uno.ts"]) };
  }

  const integrarJornada = (j: ReturnType<typeof jornada>) =>
    integrarTicket({
      paths: j.paths,
      ticketId: ID,
      titulo: "Entrega",
      ramaDeTrabajo: "valmen/jornada-20261011",
      ramasProtegidas: ["main"],
      arbolLimpioAlEmpezar: true,
      hashProbado: j.hash,
      recibo: "r1",
      secretos: () => 0,
    });

  it("C13 el commit contiene el evento delivery-size del ticket", () => {
    const j = jornada();
    const r = integrarJornada(j);
    expect(r.estado).toBe("commiteado");
    const enCommit = execFileSync("git", ["show", `HEAD:tickets/2026/${ID}/ticket.md`], {
      cwd: j.root,
      encoding: "utf8",
    });
    expect(enCommit).toContain("delivery-size");
    const [evento] = eventosDe(j.root, ID);
    expect(JSON.parse(evento!.details)).toMatchObject({ total: 900, via: "jornada" });
  });

  it("C14 el árbol de trabajo queda sin cambios sin commitear", () => {
    const j = jornada();
    integrarJornada(j);
    expect(
      execFileSync("git", ["status", "--porcelain"], { cwd: j.root, encoding: "utf8" }),
    ).toBe("");
  });

  it("C15 commitea un ticket de 900 líneas con tope de 400", () => {
    const j = jornada();
    const r = integrarJornada(j);
    expect(r.estado).toBe("commiteado");
    if (r.estado === "commiteado")
      expect(r.entrega).toMatchObject({ total: 900, pasaElTope: true });
  });
});

describe("el parte de la jornada", () => {
  const A = "FEATURE-JOURNEY-ALFA-20261008";
  const B = "FEATURE-JOURNEY-BETA-20261008";

  function parte(): string {
    const entorno = crearEntornoOla();
    limpiezas.push(() => entorno.limpiar());
    for (const id of [A, B]) {
      ticketEn(entorno.root, id, "awaiting_user_tests");
      const ruta = join(entorno.root, "tickets", "2026", id, "ticket.md");
      writeFileSync(
        ruta,
        readFileSync(ruta, "utf8").replace(
          "Resultado del PO: aprobado.",
          "- Ejecutar `npm test`; esperado: pasa.",
        ),
      );
    }
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2)], { journeyId: "JOR-1" });
    const paths = entorno.project().paths;
    const evento = (añadidas: number, borradas: number, tope: number) =>
      JSON.stringify({
        añadidas,
        borradas,
        total: añadidas + borradas,
        tope,
        pasaElTope: añadidas + borradas > tope,
        via: "jornada",
      });
    appendEvent(paths, A, "delivery-size", evento(120, 30, 400));
    appendEvent(paths, B, "delivery-size", evento(900, 0, 400));
    const p = armarParteDeJornada({
      project: entorno.project(),
      journeyId: "JOR-1",
      ahora: () => new Date("2026-10-08T18:00:00.000Z"),
    });
    return renderJourneyHandoffNotification(p).body;
  }

  it("C16 muestra el tamaño de cada ticket que espera pruebas", () => {
    const cuerpo = parte();
    expect(cuerpo).toContain("    tamaño: 150 líneas (+120 −30)");
    expect(cuerpo).toContain("    tamaño: 900 líneas (+900 −0)");
  });

  it("C17 marca el ticket que pasó el tope", () => {
    const cuerpo = parte();
    expect(cuerpo).toContain("    tamaño: 900 líneas (+900 −0) · pasa el tope de 400");
    expect(cuerpo).not.toContain("150 líneas (+120 −30) · pasa");
  });
});
