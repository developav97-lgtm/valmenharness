/**
 * La proyección de Procesos que pinta las corridas detenidas primero
 * (FEATURE-WEB-VIVO-PROCESOS-20261014, R-VIVO-003).
 *
 * El boceto `.valmen/features/rediseno-mission-control/assets/procesos.html` necesita lo que
 * la proyección no entregaba: los pasos de cada proceso con su tipo, la descripción de los
 * parámetros, el gate que espera una corrida, la frase exacta que ese gate exige, si ya está
 * aprobado **para esa corrida** y el comando que corrió cada paso. Todo es aditivo: `steps` y
 * `params` siguen como estaban (`tests/processes-view.test.ts`).
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { approveGate, writeRun } from "@valmen/engine";

import { listGateRows, listProcessRows, listRunRows } from "../packages/server/src/processes.js";
import { handleApi } from "../packages/server/src/server.js";

const RAIZ = join(import.meta.dirname, "..");
let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-procesos-detenidas-"));
  mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
  mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
  // Los procesos y el gate reales del proyecto, copiados: el boceto se valida contra ellos.
  for (const archivo of ["deploy.yaml", "actualizar-manuales.yaml"]) {
    copyFileSync(
      join(RAIZ, ".valmen", "processes", archivo),
      join(lab, ".valmen", "processes", archivo),
    );
  }
  copyFileSync(join(RAIZ, ".valmen", "gates", "deploy.yaml"), join(lab, ".valmen", "gates", "deploy.yaml"));
  // Un gate sin frase, para «Más detalle».
  writeFileSync(
    join(lab, ".valmen", "processes", "sencillo.yaml"),
    ["id: sencillo", "title: Sencillo", "steps:", "  - id: espera", "    title: Espera", "    kind: gate", "    gate: visto-bueno"].join("\n"),
  );
  writeFileSync(join(lab, ".valmen", ".credentials.yaml"), "version: 1\n", { mode: 0o600 });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Una corrida de `deploy` detenida en `gate-deploy`, tras un dry-run hecho. */
function corridaDetenida(runId = "deploy-20261014-1"): void {
  writeRun(lab, {
    runId,
    processId: "deploy",
    params: { version: "0.4.0", tickets: "FEATURE-UNO" },
    status: "waiting",
    pendingStep: "gate-deploy",
    steps: [
      {
        id: "preflight",
        status: "ok",
        at: "2026-10-14T10:00:00.000Z",
        detail: "git log --oneline origin/main..HEAD",
      },
    ],
    startedAt: "2026-10-14T10:00:00.000Z",
    updatedAt: "2026-10-14T10:00:01.000Z",
    reason: "El gate \"deploy\" no está aprobado.",
  });
}

describe("la proyección de Procesos para el boceto (R-VIVO-003)", () => {
  it("C10: cada proceso trae sus pasos en orden con su tipo; el gate solo en los kind: gate", () => {
    const deploy = listProcessRows(lab).find((fila) => fila.id === "deploy")!;
    expect(deploy.steps).toBe(6);
    expect(deploy.stepList.map((paso) => [paso.id, paso.kind, paso.gate])).toEqual([
      ["preflight", "command", null],
      ["gate-deploy", "gate", "deploy"],
      ["tag", "command", null],
      ["publish", "command", null],
      ["manuales", "process", null],
      ["post-release", "command", null],
    ]);
    expect(deploy.stepList[1]?.title).toBe("Aprobación humana del despliegue");
  });

  it("C11: cada proceso trae la descripción de sus parámetros", () => {
    const manuales = listProcessRows(lab).find((fila) => fila.id === "actualizar-manuales")!;
    expect(manuales.paramList).toEqual([
      {
        name: "tickets",
        required: true,
        description: "Ids de los tickets de la release, separados por coma.",
        default: null,
      },
      {
        name: "manualesdir",
        required: false,
        description: "Dónde viven los manuales de usuario final.",
        default: "docs/manuales/usuario-final",
      },
    ]);
  });

  it("un proceso inválido trae listas vacías", () => {
    writeFileSync(join(lab, ".valmen", "processes", "roto.yaml"), "id: roto\nsteps: []\n");
    const roto = listProcessRows(lab).find((fila) => fila.id === "roto")!;
    expect(roto.stepList).toEqual([]);
    expect(roto.paramList).toEqual([]);
  });

  it("C4 y C6: la corrida detenida trae su gate y la frase exacta resuelta con sus parámetros", () => {
    corridaDetenida();
    const [corrida] = listRunRows(lab);
    expect(corrida?.pendingGate).toBe("deploy");
    expect(corrida?.requiredPhrase).toBe("APROBAR DEPLOY v0.4.0");
    expect(corrida?.gateApprovedBy).toBeNull();
  });

  it("C8: tras aprobar con la frase para esa corrida, trae quién la aprobó", () => {
    corridaDetenida();
    approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
      runId: "deploy-20261014-1",
      phrase: "APROBAR DEPLOY v0.4.0",
    });
    const [corrida] = listRunRows(lab);
    expect(corrida?.gateApprovedBy).toBe("Juan Andrade");
  });

  it("C9: cada paso ejecutado trae el comando que corrió", () => {
    corridaDetenida();
    expect(listRunRows(lab)[0]?.steps[0]?.detail).toBe("git log --oneline origin/main..HEAD");
  });

  it("C20: los gates dicen si exigen frase", () => {
    const porGate = Object.fromEntries(listGateRows(lab).map((g) => [g.gate, g.requiresPhrase]));
    expect(porGate).toEqual({ deploy: true, "visto-bueno": false });
  });

  it("C6: la ruta ya declarada aprueba el despliegue con actor, corrida y frase", async () => {
    corridaDetenida();
    const contexto = {
      root: lab,
      credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
      env: {},
    };
    const r = await handleApi(
      "POST",
      "/api/processes/gates/deploy/approve",
      { actor: "Juan Andrade", run: "deploy-20261014-1", phrase: "APROBAR DEPLOY v0.4.0" },
      contexto,
    );
    expect(r.status).toBe(200);
    const despues = await handleApi("GET", "/api/processes", {}, contexto);
    const corrida = (despues.body as { runs: { gateApprovedBy: string | null; status: string }[] }).runs[0];
    expect(corrida?.gateApprovedBy).toBe("Juan Andrade");
    // Aprobar no retoma: la corrida sigue detenida hasta `valmen process resume`.
    expect(corrida?.status).toBe("waiting");
  });
});
