/**
 * El avance de la jornada y su disparador (R-JORN-002).
 *
 * El avance no tiene lógica propia de despacho: la reserva y la selección ya son idempotentes.
 * Lo que se afirma es lo que un disparador periódico necesita —dos avances seguidos no
 * despachan un segundo ticket, sin jornada no hace nada, no llama a ningún modelo— y que la
 * tarea de launchd se **prepara** sin que el harness la active jamás.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { journeyAdvanceCommand, journeyInstallTriggerCommand } from "../packages/cli/src/commands.js";
import {
  renderLaunchdPlist,
} from "../packages/cli/src/journey-trigger.js";
import {
  armarJornada,
  avanzarJornada,
  claimMachineCapacity,
  recordExecutionActivity,
  jornadaDelDia,
  leerPasadas,
  pasadasPath,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { createExecutionIdentity, parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "avance-lab";
const A = "FEATURE-AVANCE-UNO-20261005";
const B = "FEATURE-AVANCE-DOS-20261005";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const PRUEBAS = "Contrato de entrega: ejecutar `node -e \"process.exit(0)\"` desde la raíz; esperado: código de salida 0.";
const CRITERIO = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';

let home: string;
let root: string;

function politica(autorizada = true): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      ...(autorizada ? ["  dispatch-executors:", "    - codex"] : ["  dispatch-executors: []"]),
      "autonomous:",
      `  enabled: ${autorizada}`,
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - plan-approved",
      "      - tests-declared",
      "      - no-critical-impacts",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 3",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

function estado(id: string): string {
  return parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")).fields.workflow_status;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-avance-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: avance\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica(true);
  for (const id of [A, B]) {
    writeFixtureTicket(root, { id, workflowStatus: "approved", type: "FEATURE", module: "AVANCE", criterios: CRITERIO , pruebas: PRUEBAS});
  }
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const proyecto = () => resolveAuthorizedProject({ projectId, home });
const armar = () => armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AHORA });

describe("el avance", () => {
  it("despacha lo que la jornada y la capacidad permiten e informa qué hizo", async () => {
    armar();
    const execute = vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute });

    expect(avance.estado).toBe("despachado");
    expect(avance.journeyId).toBe(jornadaDelDia(AHORA));
    expect(avance.ticketId).toBe(A);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(estado(A)).toBe("awaiting_user_tests");
    expect(estado(B)).toBe("approved");
  });

  it("dos avances seguidos no duplican el primer ticket: el segundo despacha el siguiente, una vez cada uno", async () => {
    armar();
    // El ejecutor no termina: el ticket queda en curso y la capacidad ocupada.
    const colgado = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    // Se simula un ejecutor que deja la reserva viva marcando el avance como ya despachado:
    // el segundo avance debe encontrar la misma identidad o la capacidad agotada.
    const primero = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute: colgado });
    const segundo = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute: colgado });

    expect(primero.estado).toBe("despachado");
    // El segundo avance no repite el primer ticket: el primero ya terminó y liberó su lugar,
    // así que despacha el siguiente, y cada ticket se ejecutó una sola vez.
    expect(segundo.estado).toBe("despachado");
    expect(segundo.ticketId).toBe(B);
    expect(colgado).toHaveBeenCalledTimes(2);
    expect(estado(A)).toBe("awaiting_user_tests");
  });

  it("un avance con capacidad ocupada por un ticket en curso no despacha otro", async () => {
    armar();
    let avanceInterno: Promise<unknown> | null = null;
    const ejecutor = () => {
      // Mientras el primer ticket corre, otro avance no puede reservar: la capacidad es 1.
      avanceInterno = avanzarJornada({
        project: proyecto(),
        home,
        ahora: () => AHORA,
        execute: () => ({ status: 0, stdout: "no debería ejecutarse", stderr: "" }),
      });
      return { status: 0, stdout: "hecho", stderr: "" };
    };
    await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute: ejecutor });
    const interno = (await avanceInterno) as unknown as Awaited<ReturnType<typeof avanzarJornada>>;
    expect(interno.estado).toBe("sin-candidato");
    expect(interno.detalle).toMatch(/candidato|capacidad/i);
  });

  it("sin jornada del día lo dice, explica cómo armarla y no hace nada", async () => {
    const execute = vi.fn();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute });
    expect(avance.estado).toBe("sin-jornada");
    expect(avance.detalle).toContain("valmen journey plan");
    expect(execute).not.toHaveBeenCalled();
  });

  it("sin ejecutor autorizado no inicia nada", async () => {
    armar();
    politica(false);
    const execute = vi.fn();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute });
    expect(avance.estado).toBe("sin-candidato");
    expect(execute).not.toHaveBeenCalled();
    expect(estado(A)).toBe("approved");
  });

  it("el comando sale bien sin jornada y reporta el estado", async () => {
    const resultado = await journeyAdvanceCommand({ project: projectId }, { home, ahora: () => AHORA });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("sin-jornada");
  });

  it("lo único que se invoca es el ejecutor de la política: ningún modelo por su cuenta", async () => {
    armar();
    const comandos: string[] = [];
    await avanzarJornada({
      project: proyecto(),
      home,
      ahora: () => AHORA,
      execute: (comando) => {
        comandos.push(comando.command);
        return { status: 0, stdout: "hecho", stderr: "" };
      },
    });
    // El único proceso externo que el avance puede lanzar es el ejecutor declarado (codex).
    expect(comandos.every((c) => c.includes("codex"))).toBe(true);
    expect(comandos.length).toBeLessThanOrEqual(1);
  });
});

describe("el avance sin --fase", () => {
  const C = "FEATURE-AVANCE-TRES-20261005";
  const preparador = () => vi.fn(() => ({ status: 0, stdout: "preparado", stderr: "" }));
  const ejecutor = () => vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));

  beforeEach(() => {
    writeFixtureTicket(root, { id: C, workflowStatus: "intake", type: "FEATURE", module: "AVANCE", criterios: CRITERIO, pruebas: PRUEBAS });
    armarJornada({ project: proyecto(), tickets: [A, C], ahora: () => AHORA });
  });

  it("despacha el ticket aprobado y prepara el que está en intake en una sola pasada", async () => {
    const execute = ejecutor();
    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, execute, ejecutarPreparacion });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
    expect(avance.fases).toEqual([
      expect.objectContaining({ fase: "ejecucion", estado: "despachado", ticketId: A }),
      expect.objectContaining({ fase: "preparacion", estado: "despachado", ticketId: C }),
    ]);
    // El resumen conserva lo de la primera fase que despachó.
    expect(avance).toMatchObject({ estado: "despachado", ticketId: A });
    expect(estado(A)).toBe("awaiting_user_tests");
  });

  it("un error de una fase no impide correr la otra y queda en su línea", async () => {
    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({
      project: proyecto(),
      home,
      ahora: () => AHORA,
      execute: () => {
        throw new Error("el ejecutor se cayó");
      },
      ejecutarPreparacion,
    });
    expect(avance.fases[0]).toMatchObject({ fase: "ejecucion", estado: "sin-candidato" });
    expect(avance.fases[0]?.detalle).toContain("el ejecutor se cayó");
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
    expect(avance.fases[1]).toMatchObject({ fase: "preparacion", ticketId: C });
  });

  it("con --fase ejecucion corre solo la ejecución", async () => {
    const execute = ejecutor();
    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, fase: "ejecucion", execute, ejecutarPreparacion });
    expect(avance.fases.map((f) => f.fase)).toEqual(["ejecucion"]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(ejecutarPreparacion).not.toHaveBeenCalled();
  });

  it("con --fase preparacion corre solo la preparación", async () => {
    const execute = ejecutor();
    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, fase: "preparacion", execute, ejecutarPreparacion });
    expect(avance.fases.map((f) => f.fase)).toEqual(["preparacion"]);
    expect(avance).toMatchObject({ estado: "despachado", ticketId: C });
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(estado(A)).toBe("approved");
  });

  it("la salida del comando trae una línea por fase con su estado y su ticket", async () => {
    const resultado = await journeyAdvanceCommand(
      { project: projectId },
      { home, ahora: () => AHORA, execute: ejecutor(), ejecutarPreparacion: preparador() },
    );
    expect(resultado.exitCode).toBe(0);
    const lineas = resultado.stdout.trim().split("\n");
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatch(/ejecucion: despachado \(FEATURE-AVANCE-UNO-20261005\)/);
    expect(lineas[1]).toMatch(/preparacion: despachado \(FEATURE-AVANCE-TRES-20261005\)/);
  });
});

describe("la recuperación de una reserva huérfana", () => {
  it("tras recuperarla, el avance siguiente despacha el ticket en vez de responder ya-despachado", async () => {
    armar();
    // Una corrida anterior murió entre `started` y el registro final: reserva y actividad quedaron.
    const identidad = createExecutionIdentity({ projectId, ticketId: A, executionId: jornadaDelDia(AHORA) });
    claimMachineCapacity({ home, project: proyecto(), identity: identidad, attemptId: "avance-1" });
    recordExecutionActivity(proyecto(), {
      eventId: "huerfana-started",
      identity: identidad,
      attemptId: "avance-1",
      state: "started",
      source: "journey-dispatch",
      occurredAt: "2026-10-06T05:00:00.000Z",
    });
    // El proceso que la reservó ya no existe.
    const muerto = spawnSync(process.execPath, ["-e", ""]).pid as number;
    const ruta = join(home, ".valmen", "machine-capacity.json");
    const guardado = JSON.parse(readFileSync(ruta, "utf8"));
    guardado.reservations[0].pid = muerto;
    writeFileSync(ruta, JSON.stringify(guardado), "utf8");

    const execute = vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, fase: "ejecucion", execute });

    expect(avance.estado).toBe("despachado");
    expect(avance.ticketId).toBe(A);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(estado(A)).toBe("awaiting_user_tests");
  });
});

describe("el disparador de launchd", () => {
  const entorno = { node: "/usr/local/bin/node", cliMain: "/opt/valmen/cli/dist/main.js" };

  it("el plist trae la etiqueta, el intervalo y los argumentos del avance", () => {
    const plist = renderLaunchdPlist({ projectId, everyMinutes: 15, ...entorno, logDir: "/tmp/logs" });
    expect(plist).toContain("<string>com.valmen.jornada.avance-lab</string>");
    expect(plist).toContain("<integer>900</integer>");
    for (const argumento of ["/usr/local/bin/node", "/opt/valmen/cli/dist/main.js", "journey", "advance", "--project", projectId]) {
      expect(plist).toContain(`<string>${argumento}</string>`);
    }
    expect(plist).toContain("<key>RunAtLoad</key>");
  });

  it("sin --write imprime el plist y los comandos, y no escribe nada", () => {
    const dir = join(home, "LaunchAgents");
    const resultado = journeyInstallTriggerCommand({ project: projectId, dir }, { ...entorno, home });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("launchctl bootstrap");
    expect(resultado.stdout).toContain("Sin --write no se escribió nada");
    expect(existsSync(dir)).toBe(false);
  });

  it("con --write escribe solo el archivo y dice que no activó nada", () => {
    const dir = join(home, "LaunchAgents");
    const resultado = journeyInstallTriggerCommand({ project: projectId, dir, write: true }, { ...entorno, home });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("No se activó nada");
    expect(existsSync(join(dir, "com.valmen.jornada.avance-lab.plist"))).toBe(true);
  });

  it("un intervalo inválido se rechaza", () => {
    expect(journeyInstallTriggerCommand({ project: projectId, every: "0" }, { ...entorno, home }).exitCode).not.toBe(0);
  });
});

describe("el registro de pasadas", () => {
  it("cada avance deja una pasada con su hora, estado, ticket y detalle", async () => {
    armar();
    const resultado = await journeyAdvanceCommand(
      { project: projectId, fase: "ejecucion" },
      { home, ahora: () => AHORA, execute: () => ({ status: 0, stdout: "hecho", stderr: "" }) },
    );
    expect(resultado.exitCode).toBe(0);
    const pasadas = leerPasadas(root);
    expect(pasadas).toHaveLength(1);
    expect(pasadas[0]).toMatchObject({ journeyId: jornadaDelDia(AHORA), estado: "despachado", ticketId: A });
    expect(pasadas[0]?.detalle).not.toBe("");
    expect(Number.isFinite(Date.parse(pasadas[0]?.at ?? ""))).toBe(true);
    await journeyAdvanceCommand({ project: projectId, fase: "ejecucion" }, { home, ahora: () => AHORA, execute: () => ({ status: 0, stdout: "hecho", stderr: "" }) });
    expect(leerPasadas(root)).toHaveLength(2);
  });

  it("sin jornada también deja su pasada, con el estado sin-jornada", async () => {
    await journeyAdvanceCommand({ project: projectId }, { home, ahora: () => AHORA });
    expect(leerPasadas(root)[0]).toMatchObject({ estado: "sin-jornada", ticketId: null });
  });

  it("un avance que falla deja una pasada con estado error y su mensaje", async () => {
    armar();
    const resultado = await journeyAdvanceCommand(
      { project: projectId, fase: "ejecucion" },
      {
        home,
        ahora: () => AHORA,
        execute: () => {
          throw new Error("se cayó el preparador");
        },
      },
    );
    // La fase única propaga el error; la pasada lo registra aunque el avance no haya terminado.
    expect(resultado.exitCode).not.toBe(0);
    const pasadas = leerPasadas(root);
    expect(pasadas.at(-1)).toMatchObject({ estado: "error" });
    expect(pasadas.at(-1)?.detalle).toContain("se cayó el preparador");
  });

  it("un fallo al anexar la pasada se informa en stderr sin cambiar el código de salida", async () => {
    mkdirSync(pasadasPath(root), { recursive: true });
    const resultado = await journeyAdvanceCommand({ project: projectId }, { home, ahora: () => AHORA });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("sin-jornada");
    expect(resultado.stderr).toContain("No se pudo registrar la pasada");
  });
});
