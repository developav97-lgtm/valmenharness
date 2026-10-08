/**
 * La ola de la jornada: qué tickets se pueden despachar ahora a subagentes (C1–C11, C13–C16, C19).
 * Cada barrera lleva su caso de control: lo que debe pasar pasa, y lo que debe quedar fuera queda fuera.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/index.js";
import {
  OLA_CONCURRENCIA_POR_DEFECTO,
  calcularOlaDeJornada,
  esWorktreeDelTicket,
  liberarParada,
  listarWorktreesDeGit,
  parsearWorktrees,
  recordAutonomousStop,
  recordExecutionActivity,
  renderOlaDeJornada,
  slugDeTicket,
  worktreeDelTicket,
  type WorktreeDeGit,
} from "../packages/engine/src/index.js";
import {
  PROYECTO_OLA,
  crearEntornoOla,
  crearJornada,
  enJornada,
  ticketEn,
  type EntornoOla,
} from "./helpers/ola.js";

const A = "FEATURE-JOURNEY-ALFA-20261008";
const B = "FEATURE-JOURNEY-BETA-20261008";
const C = "FEATURE-JOURNEY-GAMA-20261008";
const D = "FEATURE-JOURNEY-DELTA-20261008";
const E = "FEATURE-JOURNEY-EPSILON-20261008";

let entorno: EntornoOla;

beforeEach(() => {
  entorno = crearEntornoOla();
});
afterEach(() => entorno.limpiar());

function ola(extra: Partial<Parameters<typeof calcularOlaDeJornada>[0]> = {}) {
  return calcularOlaDeJornada({
    project: entorno.project(),
    journeyId: "dia",
    worktrees: [],
    ahora: () => new Date("2026-10-08T13:00:00.000Z"),
    ...extra,
  });
}

const ids = (lista: readonly { readonly ticketId: string }[]): string[] => lista.map((item) => item.ticketId);

function actividad(ticketId: string, state: "started" | "active" | "waiting" | "finished" | "failed", n: number): void {
  recordExecutionActivity(entorno.project(), {
    eventId: `ev-${ticketId}-${n}`,
    identity: createExecutionIdentity({ projectId: PROYECTO_OLA, ticketId, executionId: `run-${ticketId}` }),
    attemptId: "intento-1",
    state,
    source: "subagente",
    occurredAt: `2026-10-08T12:0${n}:00.000Z`,
  });
}

describe("nombres y worktrees", () => {
  it("el nombre corto sale del id sin tipo, módulo ni fecha", () => {
    expect(slugDeTicket("FEATURE-ENGINE-JORNADA-OLA-20261008")).toBe("jornada-ola");
    expect(worktreeDelTicket("/r", "FEATURE-ENGINE-JORNADA-OLA-20261008")).toEqual({
      nombre: "ticket-jornada-ola",
      rama: "valmen/ticket-jornada-ola",
      ruta: "/r/.claude/worktrees/ticket-jornada-ola",
    });
  });

  it("C19: la ola reconoce la rama sugerida y también el id completo, y no un nombre parecido", () => {
    const id = "FEATURE-ENGINE-JORNADA-OLA-20261008";
    const sugerido = worktreeDelTicket("/r", id);
    expect(esWorktreeDelTicket({ path: sugerido.ruta, branch: sugerido.rama }, "/r", id)).toBe(true);
    expect(esWorktreeDelTicket({ path: "/otro/x", branch: `valmen/ticket-${id}` }, "/r", id)).toBe(true);
    expect(esWorktreeDelTicket({ path: "/r/.claude/worktrees/ticket-jornada", branch: "valmen/ticket-jornada" }, "/r", id)).toBe(false);
  });

  it("lee la salida porcelain de git", () => {
    const texto = [
      "worktree /r",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /r/.claude/worktrees/ticket-x",
      "HEAD def",
      "branch refs/heads/valmen/ticket-x",
      "",
      "worktree /r/suelto",
      "HEAD 123",
      "detached",
      "",
    ].join("\n");
    expect(parsearWorktrees(texto)).toEqual([
      { path: "/r", branch: "main" },
      { path: "/r/.claude/worktrees/ticket-x", branch: "valmen/ticket-x" },
      { path: "/r/suelto", branch: null },
    ]);
  });
});

describe("listos y orden", () => {
  it("C1: ordena por prioridad y desempata por la posición de la jornada", () => {
    for (const id of [A, B, C]) ticketEn(entorno.root, id, "intake");
    crearJornada(entorno, [enJornada(A, 1, { priority: 2 }), enJornada(B, 2, { priority: 1 }), enJornada(C, 3, { priority: 1 })]);
    expect(ids(ola().listos)).toEqual([B, C, A]);
  });

  it("ofrece los estados de arranque: intake, analyzed, approved y changes_requested", () => {
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "analyzed");
    ticketEn(entorno.root, C, "approved");
    ticketEn(entorno.root, D, "changes_requested");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2), enJornada(C, 3), enJornada(D, 4)]);
    expect(ids(ola({ concurrency: 4 }).listos)).toEqual([A, B, C, D]);
  });

  it("C16: lo que la jornada no contiene nunca se ofrece", () => {
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "approved");
    crearJornada(entorno, [enJornada(A, 1)]);
    const resultado = ola();
    const todos = [...ids(resultado.listos), ...ids(resultado.enCurso), ...ids(resultado.enEspera), ...ids(resultado.entregados)];
    expect(todos).toEqual([A]);
  });
});

describe("dependencias", () => {
  it("C2: una dependencia entregada deja pasar al dependiente", () => {
    for (const estado of ["awaiting_user_tests", "in_qa", "qa_approved", "closed"]) {
      ticketEn(entorno.root, A, estado);
      ticketEn(entorno.root, B, "intake");
      crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2, { dependsOn: [A] })], { journeyId: `dia-${estado}` });
      const resultado = ola({ journeyId: `dia-${estado}` });
      expect(ids(resultado.listos), estado).toEqual([B]);
      expect(ids(resultado.entregados), estado).toEqual([A]);
    }
  });

  it("C3: una dependencia en otro estado, o ausente, espera y el motivo la nombra con su estado", () => {
    ticketEn(entorno.root, A, "approved");
    ticketEn(entorno.root, B, "intake");
    ticketEn(entorno.root, C, "intake");
    crearJornada(entorno, [
      enJornada(A, 1),
      enJornada(B, 2, { dependsOn: [A] }),
      enJornada(C, 3, { dependsOn: ["FEATURE-JOURNEY-FANTASMA-20261008"] }),
    ]);
    const resultado = ola({ concurrency: 1 });
    const espera = (id: string) => resultado.enEspera.find((item) => item.ticketId === id);
    expect(espera(B)).toMatchObject({ motivo: "dependencia", dependencias: [{ ticketId: A, estado: "approved" }] });
    expect(espera(B)?.detalle).toContain(`${A} (approved)`);
    expect(espera(C)).toMatchObject({
      motivo: "dependencia",
      dependencias: [{ ticketId: "FEATURE-JOURNEY-FANTASMA-20261008", estado: "ausente" }],
    });
  });

  it("C4: una dependencia del grafo de la feature que no va en la jornada también espera", () => {
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "intake");
    mkdirSync(join(entorno.root, ".valmen", "features", "ola"), { recursive: true });
    writeFileSync(
      join(entorno.root, ".valmen", "features", "ola", "tickets.yaml"),
      `feature: ola\ngenerated_by:\n  provider: codex\n  model: m\nsprints:\n  - id: S1\n    goal: g\n    tickets:\n      - id: ${A}\n        title: t\n        depends_on:\n          - ${B}\ncoverage:\n  - requirement: R-1\n    covered_by:\n      - ${A}\n`,
    );
    // B existe pero no va en la jornada: A depende de un ticket que la jornada no contiene.
    crearJornada(entorno, [enJornada(A, 1)]);
    expect(ola().enEspera).toMatchObject([{ ticketId: A, motivo: "dependencia", dependencias: [{ ticketId: B, estado: "intake" }] }]);

    // Control: con B entregado, A pasa.
    ticketEn(entorno.root, B, "awaiting_user_tests");
    expect(ids(ola().listos)).toEqual([A]);
  });
});

describe("entregados y en curso", () => {
  it("C5: los estados entregados no se ofrecen y figuran como entregados", () => {
    const estados = ["awaiting_user_tests", "in_qa", "qa_approved", "closed"];
    const tickets = [A, B, C, D];
    tickets.forEach((id, i) => ticketEn(entorno.root, id, estados[i] as string));
    crearJornada(entorno, tickets.map((id, i) => enJornada(id, i + 1)));
    const resultado = ola();
    expect(ids(resultado.entregados)).toEqual(tickets);
    expect(resultado.listos).toEqual([]);
  });

  it("C6: in_progress cuenta como en curso y no se ofrece", () => {
    ticketEn(entorno.root, A, "in_progress");
    crearJornada(entorno, [enJornada(A, 1)]);
    const resultado = ola();
    expect(resultado.listos).toEqual([]);
    expect(resultado.enCurso).toMatchObject([{ ticketId: A, senales: [{ senal: "estado" }] }]);
  });

  it("C7: un worktree de la rama del ticket lo cuenta en curso aunque el registro diga intake", () => {
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "intake");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2)]);
    const propio = worktreeDelTicket(entorno.root, A);
    const resultado = ola({ worktrees: [{ path: propio.ruta, branch: propio.rama }] });
    expect(resultado.enCurso).toMatchObject([{ ticketId: A, estado: "intake", senales: [{ senal: "worktree", fuente: propio.ruta }] }]);
    expect(ids(resultado.listos)).toEqual([B]);
  });

  it("C8: una actividad started, active o waiting lo cuenta en curso y la salida muestra fuente y hora", () => {
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "intake");
    ticketEn(entorno.root, C, "intake");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2), enJornada(C, 3)]);
    actividad(A, "started", 1);
    actividad(B, "active", 2);
    actividad(C, "waiting", 3);
    const resultado = ola({ concurrency: 5 });
    expect(ids(resultado.enCurso)).toEqual([A, B, C]);
    expect(resultado.enCurso[0]?.senales[0]).toEqual({ senal: "actividad", fuente: "subagente", hora: "2026-10-08T12:01:00.000Z" });
    const texto = renderOlaDeJornada(resultado);
    expect(texto).toContain("actividad: subagente (2026-10-08T12:01:00.000Z)");
  });

  it("C9: una actividad finished, la rama de otro ticket y el worktree del checkout principal no cuentan", () => {
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "intake");
    ticketEn(entorno.root, C, "intake");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2), enJornada(C, 3)]);
    actividad(A, "started", 1);
    actividad(A, "finished", 2);
    const deB = worktreeDelTicket(entorno.root, B);
    const worktrees: WorktreeDeGit[] = [
      { path: entorno.root, branch: worktreeDelTicket(entorno.root, C).rama },
      { path: deB.ruta, branch: deB.rama },
    ];
    const resultado = ola({ worktrees });
    // A: la actividad terminó. C: la rama del ticket está en el checkout principal. B sí está en curso.
    expect(ids(resultado.enCurso)).toEqual([B]);
    expect(ids(resultado.listos)).toEqual([A, C]);
  });

  it("una actividad failed no cuenta como en curso", () => {
    ticketEn(entorno.root, A, "intake");
    crearJornada(entorno, [enJornada(A, 1)]);
    actividad(A, "started", 1);
    actividad(A, "failed", 2);
    expect(ids(ola().listos)).toEqual([A]);
  });

  it("detecta un worktree real de git por su rama", () => {
    const git = (...args: string[]) => execFileSync("git", ["-C", entorno.root, ...args], { stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base");
    ticketEn(entorno.root, A, "intake");
    ticketEn(entorno.root, B, "intake");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2)]);
    const propio = worktreeDelTicket(entorno.root, A);
    git("worktree", "add", "-q", "-b", propio.rama, propio.ruta);

    const leidos = listarWorktreesDeGit(entorno.root);
    expect(leidos.aviso).toBeNull();
    expect(leidos.worktrees.map((w) => w.branch)).toEqual(expect.arrayContaining(["main", propio.rama]));

    const resultado = calcularOlaDeJornada({ project: entorno.project(), journeyId: "dia" });
    expect(ids(resultado.enCurso)).toEqual([A]);
    expect(realpathSync((resultado.enCurso[0]?.senales[0]?.fuente) as string)).toBe(realpathSync(propio.ruta));
    expect(ids(resultado.listos)).toEqual([B]);
  });

  it("si git falla, la señal del worktree se omite y la salida lo dice", () => {
    // La raíz no es un repositorio git.
    ticketEn(entorno.root, A, "intake");
    crearJornada(entorno, [enJornada(A, 1)]);
    const resultado = calcularOlaDeJornada({ project: entorno.project(), journeyId: "dia" });
    expect(ids(resultado.listos)).toEqual([A]);
    expect(resultado.avisos.join(" ")).toContain("worktrees de git");
    expect(renderOlaDeJornada(resultado)).toContain("Aviso:");
  });
});

describe("tope de simultáneos", () => {
  it("C10: no pasa de 3 por defecto contando los que ya están en curso", () => {
    expect(OLA_CONCURRENCIA_POR_DEFECTO).toBe(3);
    const todos = [A, B, C, D, E];
    for (const id of todos) ticketEn(entorno.root, id, "intake");
    crearJornada(entorno, todos.map((id, i) => enJornada(id, i + 1)));
    const sin = ola();
    expect(sin.concurrency).toBe(3);
    expect(ids(sin.listos)).toEqual([A, B, C]);
    expect(sin.enEspera.map((e) => [e.ticketId, e.motivo])).toEqual([[D, "cupo"], [E, "cupo"]]);

    ticketEn(entorno.root, A, "in_progress");
    const con = ola();
    expect(ids(con.enCurso)).toEqual([A]);
    expect(ids(con.listos)).toEqual([B, C]);
    expect(con.enEspera.map((e) => e.motivo)).toEqual(["cupo", "cupo"]);
  });

  it("C11: --concurrency cambia el tope", () => {
    const todos = [A, B, C, D, E];
    for (const id of todos) ticketEn(entorno.root, id, "intake");
    crearJornada(entorno, todos.map((id, i) => enJornada(id, i + 1)));
    expect(ids(ola({ concurrency: 1 }).listos)).toEqual([A]);
    expect(ids(ola({ concurrency: 5 }).listos)).toEqual(todos);
    expect(() => ola({ concurrency: 0 })).toThrow(/entero de al menos 1/);
    expect(() => ola({ concurrency: 1.5 })).toThrow(/entero de al menos 1/);
  });

  it("con más en curso que el tope no ofrece ninguno", () => {
    for (const id of [A, B, C]) ticketEn(entorno.root, id, "in_progress");
    ticketEn(entorno.root, D, "intake");
    crearJornada(entorno, [A, B, C, D].map((id, i) => enJornada(id, i + 1)));
    const resultado = ola({ concurrency: 2 });
    expect(resultado.listos).toEqual([]);
    expect(resultado.enEspera).toMatchObject([{ ticketId: D, motivo: "cupo" }]);
  });
});

describe("esperas", () => {
  it("C13: un ticket planned espera la aprobación del plan, no se ofrece ni cuenta como en curso", () => {
    ticketEn(entorno.root, A, "planned");
    crearJornada(entorno, [enJornada(A, 1)]);
    // Aun con worktree y actividad abierta, un plan sin aprobar no es trabajo en curso.
    const propio = worktreeDelTicket(entorno.root, A);
    actividad(A, "started", 1);
    const resultado = ola({ worktrees: [{ path: propio.ruta, branch: propio.rama }] });
    expect(resultado.listos).toEqual([]);
    expect(resultado.enCurso).toEqual([]);
    expect(resultado.enEspera).toMatchObject([{ ticketId: A, motivo: "aprobacion-del-plan" }]);
  });

  it("C14: un ticket bloqueado o con parada activa no se ofrece, muestra el motivo y vuelve al liberar la parada", () => {
    ticketEn(entorno.root, A, "blocked");
    ticketEn(entorno.root, B, "intake");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2)]);
    let resultado = ola();
    expect(resultado.enEspera).toMatchObject([{ ticketId: A, motivo: "parada", detalle: "El ticket está bloqueado." }]);
    expect(ids(resultado.listos)).toEqual([B]);

    recordAutonomousStop(entorno.project().paths, {
      ticketId: B,
      reason: "test-failure",
      detail: "Fallaron las pruebas del ticket.",
      workflowStatus: "intake",
      now: new Date("2026-10-08T12:30:00.000Z"),
    });
    resultado = ola();
    expect(resultado.listos).toEqual([]);
    expect(resultado.enEspera.find((e) => e.ticketId === B)).toMatchObject({
      motivo: "parada",
      detalle: "Fallaron las pruebas del ticket.",
    });

    liberarParada(entorno.project().paths, B, "Juan", new Date("2026-10-08T12:45:00.000Z"));
    expect(ids(ola().listos)).toEqual([B]);
  });

  it("C15: un ticket cuya ventana no permite despachar no se ofrece; con la ventana abierta sí", () => {
    ticketEn(entorno.root, A, "intake");
    crearJornada(entorno, [enJornada(A, 1, { windowId: "manana" })], {
      windows: [{ windowId: "manana", startsAt: "2026-10-08T12:00:00.000Z", endsAt: "2026-10-08T16:00:00.000Z", timeZone: "America/Bogota" }],
    });
    expect(ids(ola({ ahora: () => new Date("2026-10-08T13:00:00.000Z") }).listos)).toEqual([A]);
    const cerrada = ola({ ahora: () => new Date("2026-10-08T18:00:00.000Z") });
    expect(cerrada.listos).toEqual([]);
    expect(cerrada.enEspera).toMatchObject([{ ticketId: A, motivo: "ventana" }]);
  });

  it("un ticket de la jornada ausente del registro espera con el motivo ausente", () => {
    ticketEn(entorno.root, B, "intake");
    crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2)]);
    expect(ola().enEspera).toMatchObject([{ ticketId: A, estado: null, motivo: "ausente" }]);
  });
});

describe("jornada", () => {
  it("sin jornada vigente, o con una inexistente, falla y manda a valmen journey plan", () => {
    expect(() => calcularOlaDeJornada({ project: entorno.project(), worktrees: [] })).toThrow(/valmen journey plan/);
    ticketEn(entorno.root, A, "intake");
    crearJornada(entorno, [enJornada(A, 1)]);
    expect(() => ola({ journeyId: "no-existe" })).toThrow(/no-existe.*valmen journey plan/);
  });

  it("usa la jornada vigente cuando no se indica una", () => {
    ticketEn(entorno.root, A, "intake");
    crearJornada(entorno, [enJornada(A, 1)]);
    const resultado = calcularOlaDeJornada({ project: entorno.project(), worktrees: [] });
    expect(resultado.journeyId).toBe("dia");
    expect(ids(resultado.listos)).toEqual([A]);
  });
});
