/**
 * La fase de ejecución de la jornada y el modelo por fase (R-JORN-005 y R-JORN-006).
 *
 * El avance desatendido se retiró: la ejecución se ejercita ahora con `runAutonomous` directo, que
 * es lo que usa `valmen run` y lo que ejecuta cada subagente de la corrida orquestada.
 *
 * Lo que se afirma: un ticket aprobado llega a las pruebas del responsable **con su contrato de
 * entrega escrito** o no llega; el ejecutor corre como sesión desatendida; el enrutamiento
 * declara un rol por fase y cada sesión usa el modelo de la suya (o cae al de la política
 * diciéndolo); y cada sesión deja su registro por fase.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FASES_DEL_AGENTE,
  PRESETS,
  ROLES,
  modeloDeFase,
  resolveRouting,
} from "../packages/adapter/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";
import {
  armarJornada,
  leerFases,
  prepararTicket,
  resolveAuthorizedProject,
  resolverModeloDeFase,
  runAutonomous,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "ejec-lab";
const A = "FEATURE-EJEC-UNO-20261005";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const CRITERIO = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';
const PRUEBAS = "Contrato de entrega: ejecutar `node -e \"process.exit(0)\"` desde la raíz; esperado: código 0.";

let home: string;
let root: string;
const proyecto = () => resolveAuthorizedProject({ projectId, home });

function politica(modelo = "gpt-6-politica"): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      "  dispatch-executors:",
      "    - codex",
      "autonomous:",
      "  enabled: true",
      "  executor:",
      "    id: codex",
      `    model: ${modelo}`,
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - tests-declared",
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

function enrutamiento(roles: Record<string, [string, string, string]>): void {
  writeFileSync(
    join(root, ".valmen", "routing.yaml"),
    [
      "preset: balanced",
      "roles:",
      ...Object.entries(roles).flatMap(([rol, [provider, model, effort]]) => [
        `  ${rol}:`,
        `    provider: ${provider}`,
        `    model: ${model}`,
        `    effort: ${effort}`,
      ]),
      "",
    ].join("\n"),
    "utf8",
  );
}

function estado(id: string): string {
  return parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")).fields.workflow_status;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-ejec-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: ejec\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica();
  writeFixtureTicket(root, { id: A, workflowStatus: "approved", type: "FEATURE", module: "EJEC", criterios: CRITERIO, pruebas: PRUEBAS });
  armarJornada({ project: proyecto(), tickets: [A], ahora: () => AHORA });
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

/** Un ejecutor que implementa: deja o no deja el contrato de pruebas. */
function implementador(opciones: { contrato: boolean; entornos?: Record<string, string>[]; comandos?: string[] }) {
  return (comando: { command: string; args: readonly string[] }, entorno: Readonly<Record<string, string>> = {}) => {
    opciones.entornos?.push({ ...entorno });
    opciones.comandos?.push([comando.command, ...comando.args].join(" "));
    writeFixtureTicket(root, {
      id: A,
      workflowStatus: "in_progress",
      type: "FEATURE",
      module: "EJEC",
      criterios: CRITERIO,
      ...(opciones.contrato ? { pruebas: PRUEBAS } : {}),
    });
    return { status: 0, stdout: "hecho", stderr: "" };
  };
}

/** Ejecuta el ticket como lo hacía el avance: con el modelo de la fase de implementación. */
async function ejecutar(execute: Parameters<typeof runAutonomous>[0]["execute"]) {
  const modelo = resolverModeloDeFase(root, "implementation");
  return runAutonomous({
    paths: proyecto().paths,
    ticketId: A,
    fase: "implementation",
    ...(modelo === null ? {} : { modelo }),
    ...(execute === undefined ? {} : { execute }),
    now: () => AHORA,
  });
}

describe("la ejecución llega a las pruebas del responsable", () => {
  it("con el contrato escrito y qa-mechanical en verde queda en awaiting_user_tests", async () => {
    const avance = await ejecutar(implementador({ contrato: true }));
    expect(avance.status).toBe("delivered");
    expect(estado(A)).toBe("awaiting_user_tests");
    const recibos = readFileSync(join(root, ".valmen", "receipts", `${A}.jsonl`), "utf8");
    expect(recibos).toContain('"gate":"qa-mechanical"');
  });

  it("si el ejecutor no deja el contrato de pruebas, la verificación falla y no pasa a awaiting_user_tests", async () => {
    const avance = await ejecutar(implementador({ contrato: false }));
    expect(avance.status).not.toBe("delivered");
    expect(estado(A)).toBe("in_progress");
    expect(`${avance.status} ${avance.detail}`).toMatch(/contrato de pruebas|verification-failed/);
  });

  it("el ejecutor corre con VALMEN_UNATTENDED", async () => {
    const entornos: Record<string, string>[] = [];
    await ejecutar(implementador({ contrato: true, entornos }));
    expect(entornos[0]?.["VALMEN_UNATTENDED"]).toBe("1");
  });
});

describe("el enrutamiento por fase", () => {
  it("declara un rol por fase, con consumidor, y todos los presets les dan modelo", () => {
    for (const fase of FASES_DEL_AGENTE) {
      const rol = ROLES.find((r) => r.id === `agent-${fase}`);
      expect(rol?.consumer, fase).toBe("valmen journey brief");
      for (const preset of PRESETS) expect(preset.roles[`agent-${fase}`], `${preset.id}/${fase}`).toBeDefined();
    }
  });

  it("modelo barato en preparación y fuerte en implementación: cada sesión usa el de su fase", async () => {
    enrutamiento({
      "agent-analysis": ["codex", "gpt-6-barato", "medium"],
      "agent-implementation": ["codex", "gpt-6-fuerte", "high"],
    });
    const comandos: string[] = [];
    const avance = await ejecutar(implementador({ contrato: true, comandos }));
    expect(avance.status).toBe("delivered");
    expect(comandos[0]).toContain("--model gpt-6-fuerte");

    // La preparación de otro ticket usa el modelo de la fase de análisis.
    const B = "FEATURE-EJEC-DOS-20261005";
    writeFixtureTicket(root, { id: B, workflowStatus: "intake", type: "FEATURE", module: "EJEC" });
    const lanzados: string[] = [];
    prepararTicket({
      paths: proyecto().paths,
      ticketId: B,
      execute: (comando) => {
        lanzados.push([comando.command, ...comando.args].join(" "));
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    expect(lanzados[0]).toContain("--model gpt-6-barato");

    const fases = leerFases(root);
    expect(fases.find((f) => f.ticketId === A)?.modelo).toBe("gpt-6-fuerte");
    expect(fases.find((f) => f.ticketId === B)?.modelo).toBe("gpt-6-barato");
  });

  it("un rol de otro proveedor que el ejecutor cae al modelo de la política y el registro lo dice", async () => {
    enrutamiento({ "agent-implementation": ["openrouter", "openai/gpt-5.6-luna-pro", "high"] });
    const comandos: string[] = [];
    await ejecutar(implementador({ contrato: true, comandos }));
    expect(comandos[0]).toContain("--model gpt-6-politica");
    const registro = leerFases(root).find((f) => f.ticketId === A);
    expect(registro?.modelo).toBe("gpt-6-politica");
    expect(registro?.origenDelModelo).toContain("politica");
    expect(registro?.origenDelModelo).toContain("openrouter");
  });

  it("modeloDeFase usa el rol cuando el proveedor coincide con el ejecutor", () => {
    const rutas = resolveRouting({ preset: "balanced", roles: { "agent-plan": { provider: "codex", model: "gpt-6-x", effort: "high" } } });
    const modelo = modeloDeFase(rutas, "plan", { id: "codex", model: "gpt-6-politica", effort: "medium" });
    expect(modelo).toMatchObject({ model: "gpt-6-x", effort: "high", origen: "rol" });
  });
});

describe("el registro por fase", () => {
  it("cada sesión deja ticket, fase, modelo, esfuerzo, duración y resultado", async () => {
    await ejecutar(implementador({ contrato: true }));
    const registro = leerFases(root).find((f) => f.ticketId === A);
    expect(registro).toMatchObject({
      kind: "journey-phase",
      ticketId: A,
      fase: "implementation",
      ejecutor: "codex",
      resultado: "delivered",
    });
    expect(typeof registro?.duracionMs).toBe("number");
    expect(registro?.esfuerzo).not.toBe("");
    expect(registro?.origenDelModelo).not.toBe("");
  });
});
