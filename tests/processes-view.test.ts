/**
 * La vista de procesos.
 *
 * Responde a la pregunta que un proceso detenido deja abierta: «¿hay algo que
 * hacer?». Y existe por una razón concreta: aprobar un gate de proceso obligaba a
 * escribir `valmen process approve` en la terminal, que es justo lo que Mission
 * Control está para evitar.
 *
 * Lo que se prueba:
 *
 * 1. **Lo detenido va primero.** Un gate sin aprobar es trabajo esperando a una
 *    persona, y enterrarlo bajo lo ya hecho obliga a buscarlo.
 * 2. **Solo los pasos de tipo `gate` son gates.** `target` lo llevan también los
 *    pasos que invocan otro proceso, y contarlos inventaría aprobaciones que nadie
 *    tiene que dar.
 * 3. **Aprobar exige responsable**, y no retoma nada: decidir y continuar son dos
 *    actos distintos.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listGateRows,
  listProcessRows,
  listRunRows,
  summarizeProcesses,
} from "../packages/server/src/processes.js";
import { handleApi } from "../packages/server/src/server.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-proc-view-"));
  mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
  mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "gates", "deploy.yaml"),
    "id: deploy\ntitle: Aprobación\n",
  );
  writeFileSync(join(lab, ".valmen", ".credentials.yaml"), "version: 1\n", { mode: 0o600 });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un proceso que se detiene en un gate, y otro que invoca a ese. */
function escribirProcesos(): void {
  writeFileSync(
    join(lab, ".valmen", "processes", "deploy.yaml"),
    [
      "id: deploy",
      "title: Despliegue con aprobación",
      "description: Promoción con dry-run obligatorio.",
      "params:",
      "  version: { type: string, required: true }",
      "steps:",
      "  - id: preflight",
      "    kind: command",
      "    run: node -e \"process.stdout.write('ok')\"",
      "  - id: aprobacion",
      "    kind: gate",
      "    gate: deploy",
    ].join("\n"),
  );
  writeFileSync(
    join(lab, ".valmen", "processes", "release.yaml"),
    [
      "id: release",
      "title: Release completa",
      "steps:",
      "  - id: desplegar",
      "    kind: process",
      "    process: deploy",
      "    params: { version: 1.0.0 }",
    ].join("\n"),
  );
}

const contexto = (extra = {}) => ({
  root: lab,
  credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
  env: {},
  ...extra,
});

describe("listProcessRows", () => {
  it("lista los procesos con sus pasos, parámetros y gates", () => {
    escribirProcesos();
    const filas = listProcessRows(lab);
    const deploy = filas.find((fila) => fila.id === "deploy")!;
    expect(deploy.steps).toBe(2);
    // El asterisco marca el obligatorio: quien mira tiene que saber cuál le van a
    // pedir.
    expect(deploy.params).toEqual(["version*"]);
    expect(deploy.gates).toEqual(["deploy"]);
    expect(deploy.invalid).toBeNull();
  });

  it("no cuenta como gate el proceso que un paso invoca", () => {
    // `target` lo llevan los dos tipos, y contar los `process` como gates
    // inventaría aprobaciones que nadie tiene que dar.
    escribirProcesos();
    const release = listProcessRows(lab).find((fila) => fila.id === "release")!;
    expect(release.gates).toEqual([]);
  });

  it("no esconde un proceso que no se puede leer", () => {
    writeFileSync(join(lab, ".valmen", "processes", "roto.yaml"), "id: roto\nsteps: []\n");
    const filas = listProcessRows(lab);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.invalid).toMatch(/steps no puede estar vacío/);
  });

  it("un proceso inválido va después de los válidos", () => {
    escribirProcesos();
    writeFileSync(join(lab, ".valmen", "processes", "roto.yaml"), "id: roto\nsteps: []\n");
    expect(listProcessRows(lab).at(-1)?.id).toBe("roto");
  });
});

describe("listRunRows", () => {
  it("devuelve vacío sin corridas", () => {
    escribirProcesos();
    expect(listRunRows(lab)).toEqual([]);
  });

  it("las detenidas van primero", async () => {
    // Se escriben los dos estados directamente: lo que se prueba es el **orden**, y
    // provocar una corrida fallida de verdad añadiría ruido al caso. Una terminada
    // no sirve —no deja estado, porque solo se guarda lo que hay que retomar—, así
    // que las dos que se pueden ordenar son `failed` y `waiting`.
    escribirProcesos();
    const { writeRun } = await import("@valmen/engine");
    const base = {
      processId: "deploy",
      params: { version: "1.0.0" },
      pendingStep: null,
      steps: [],
      startedAt: "2026-09-21T10:00:00.000Z",
      reason: null,
    } as const;

    writeRun(lab, {
      ...base,
      runId: "deploy-fallida",
      status: "failed",
      updatedAt: "2026-09-21T10:05:00.000Z",
      reason: "falló",
    });
    writeRun(lab, {
      ...base,
      runId: "deploy-esperando",
      status: "waiting",
      pendingStep: "aprobacion",
      // Más antigua que la fallida: si el orden fuera por fecha, iría después.
      updatedAt: "2026-09-21T10:01:00.000Z",
    });

    const filas = listRunRows(lab);
    expect(filas).toHaveLength(2);
    expect(filas.map((fila) => fila.runId)).toEqual(["deploy-esperando", "deploy-fallida"]);
  });
});

describe("listGateRows", () => {
  it("lista los gates con si están aprobados", () => {
    escribirProcesos();
    const gates = listGateRows(lab);
    expect(gates).toHaveLength(1);
    expect(gates[0]?.gate).toBe("deploy");
    expect(gates[0]?.processId).toBe("deploy");
    expect(gates[0]?.approvedBy).toBeNull();
  });

  it("un gate sin aprobar se lista igual: es lo que hay que ver", () => {
    // Una lista que solo mostrara lo hecho escondería justo lo pendiente.
    escribirProcesos();
    expect(listGateRows(lab).filter((gate) => gate.approvedBy === null)).toHaveLength(1);
  });

  it("un gate usado en dos pasos se lista una vez", () => {
    escribirProcesos();
    const conDos = [
      "id: doble",
      "title: Dos veces el mismo gate",
      "steps:",
      "  - id: uno",
      "    kind: gate",
      "    gate: deploy",
      "  - id: dos",
      "    kind: gate",
      "    gate: deploy",
    ].join("\n");
    writeFileSync(join(lab, ".valmen", "processes", "doble.yaml"), conDos);
    expect(listGateRows(lab).filter((gate) => gate.gate === "deploy")).toHaveLength(1);
  });
});

describe("summarizeProcesses", () => {
  it("cuenta lo detenido y los gates sin aprobar", () => {
    escribirProcesos();
    const procesos = listProcessRows(lab);
    const gates = listGateRows(lab);
    const resumen = summarizeProcesses(procesos, [], gates);
    expect(resumen.processes).toBe(2);
    expect(resumen.waiting).toBe(0);
    expect(resumen.gatesPending).toBe(1);
  });
});

describe("los endpoints", () => {
  it("GET /api/processes devuelve el resumen y las tres listas", async () => {
    escribirProcesos();
    const r = await handleApi("GET", "/api/processes", {}, contexto());
    expect(r.status).toBe(200);
    const cuerpo = r.body as {
      summary: { processes: number };
      processes: unknown[];
      runs: unknown[];
      gates: unknown[];
    };
    expect(cuerpo.summary.processes).toBe(2);
    expect(cuerpo.runs).toEqual([]);
    expect(cuerpo.gates).toHaveLength(1);
  });

  it("aprobar sin responsable no se acepta", async () => {
    // Aprobar sin nombre no es auditable, y es la misma regla que en un gate de
    // ticket.
    escribirProcesos();
    const r = await handleApi(
      "POST",
      "/api/processes/gates/deploy/approve",
      {},
      contexto(),
    );
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/responsable/);
  });

  it("aprobar con responsable queda registrado", async () => {
    escribirProcesos();
    const r = await handleApi(
      "POST",
      "/api/processes/gates/deploy/approve",
      { actor: "Juan Andrade", reason: "probado en dev" },
      contexto(),
    );
    expect(r.status).toBe(200);
    expect((r.body as { details: string }).details).toContain("Juan Andrade");

    const despues = await handleApi("GET", "/api/processes", {}, contexto());
    const gate = (despues.body as { gates: { approvedBy: string; reason: string }[] })
      .gates[0]!;
    expect(gate.approvedBy).toBe("Juan Andrade");
    expect(gate.reason).toBe("probado en dev");
  });

  it("aprobar no retoma el proceso", async () => {
    // Decidir y continuar son dos actos distintos: juntarlos haría que aprobar
    // tuviera efectos que quien aprueba no ve.
    escribirProcesos();
    const { runProcess } = await import("@valmen/engine");
    runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.0.0" },
      runCommand: () => ({ status: 0, stdout: "", stderr: "" }),
    });

    await handleApi(
      "POST",
      "/api/processes/gates/deploy/approve",
      { actor: "Juan Andrade" },
      contexto(),
    );

    const r = await handleApi("GET", "/api/processes", {}, contexto());
    const corridas = (r.body as { runs: { status: string }[] }).runs;
    expect(corridas).toHaveLength(1);
    expect(corridas[0]?.status).toBe("waiting");
  });
});
