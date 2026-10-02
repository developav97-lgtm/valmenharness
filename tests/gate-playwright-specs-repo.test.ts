/** Specs del repositorio: resolución pura, corrida real y rechazo antes del evaluador. */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_INVARIANT } from "../packages/core/src/index.js";
import * as evaluators from "../packages/engine/src/evaluators.js";
import { runGate } from "../packages/engine/src/gate.js";
import { interfazDelTicket } from "../packages/engine/src/interfaz.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { commandChecksFor, extractCriteriaSpecs } from "../packages/gate/src/index.js";
import { specDelRepositorio } from "../packages/gate/src/specs.js";
import { listGateCards } from "../packages/server/src/gates.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-GATE-SPECS-20260926";
const SPEC = "pruebas de interfaz/orden.spec.js";
const declaracion = { command: "node runner.cjs", project: "chromium", timeoutMs: 30_000 };
let lab: string;
const paths = () => ({ root: lab, ticketsDir: "tickets" });
const repositorio = () => ({
  root: lab,
  esArchivo: (ruta: string) => {
    try {
      return statSync(ruta).isFile();
    } catch {
      return false;
    }
  },
});
const criterio = (command: string) =>
  `- [ ] La pantalla guarda la orden correctamente.\n      <!-- test: ${command} -->`;
const resolver = (command: string) =>
  commandChecksFor(
    extractCriteriaSpecs(criterio(command)),
    [declaracion.command],
    undefined,
    declaracion,
    repositorio(),
  );
function ticket(command: string): void {
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "in_progress",
    criterios: criterio(command),
  });
}
const correr = () => runGate(paths(), { gateId: "qa-mechanical", ticketId: TICKET });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-specs-repo-"));
  mkdirSync(join(lab, ".valmen"));
  writeFileSync(
    join(lab, ".valmen/config.yaml"),
    `name: Laboratorio\nplaywright:\n  command: ${declaracion.command}\n`,
  );
  mkdirSync(join(lab, "pruebas de interfaz"));
  // El archivo se ejecuta de verdad: su salida llega al recibo, no solo al runner.
  writeFileSync(join(lab, SPEC), "console.log('spec del repositorio ejecutado');\n");
  writeFileSync(
    join(lab, "runner.cjs"),
    [
      "const { writeFileSync } = require('node:fs');",
      "const { resolve } = require('node:path');",
      "writeFileSync('corrio.txt', 'sí');",
      "require(resolve(process.argv.at(-1)));",
    ].join("\n"),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(lab, { recursive: true, force: true });
});

describe("el spec es un archivo relativo y canónico del repositorio", () => {
  it("arma el check, corre el archivo y aprueba con su salida en el recibo (CA1)", async () => {
    const command = `playwright "${SPEC}"`;
    const { checks, refused } = resolver(command);
    expect(refused).toEqual([]);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.args).toEqual(["runner.cjs", "--project", "chromium", SPEC]);
    ticket(command);
    expect(
      listGateCards(paths(), TICKET)?.find((card) => card.id === "qa-mechanical")
        ?.hasCommandChecks,
    ).toBe(true);
    const resultado = await correr();
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("APPROVE");
    expect(existsSync(join(lab, "corrio.txt"))).toBe(true);
    const recibo = readReceipts(paths(), TICKET)[0];
    expect(recibo?.commandResults?.[0]?.stdout).toContain("spec del repositorio ejecutado");
    expect(recibo?.commandResults?.[0]?.invocation).toContain(SPEC);
    expect(recibo?.model).toBeNull();
  });

  it.each([
    ["sin ruta (CA2)", "playwright", "falta la ruta", "archivo del repositorio"],
    ["inexistente (CA3)", "playwright ausente.spec.ts", "ausente.spec.ts", "no existe"],
    ["absoluta POSIX (CA4)", "playwright /fuera.spec.ts", "/fuera.spec.ts", "no absoluta"],
    [
      "absoluta Windows (CA4)",
      "playwright C:/fuera.spec.ts",
      "C:/fuera.spec.ts",
      "no absoluta",
    ],
    [
      "fuera del árbol (CA4)",
      "playwright ../fuera.spec.ts",
      "../fuera.spec.ts",
      "fuera del repositorio",
    ],
    [
      "no canónica",
      'playwright "./pruebas de interfaz/orden.spec.js"',
      "./pruebas de interfaz/orden.spec.js",
      "canónica",
    ],
    [
      "directorio",
      'playwright "pruebas de interfaz"',
      "pruebas de interfaz",
      "archivo regular",
    ],
    [
      "comando completo inexistente (CA6)",
      "node runner.cjs ausente.spec.ts",
      "ausente.spec.ts",
      "no existe",
    ],
  ])(
    "rechaza %s sin comandos, evaluador ni recibo (CA7)",
    async (_caso, command, ruta, motivo) => {
      const { checks, refused } = resolver(command);
      expect(checks).toEqual([]);
      expect(refused).toHaveLength(1);
      expect(refused[0]).toContain(ruta);
      expect(refused[0]).toContain(motivo);
      ticket(command);
      const evaluador = vi.spyOn(evaluators, "evaluateGate");
      const resultado = await correr();
      expect(resultado.exitCode).toBe(EXIT_INVARIANT);
      expect(resultado.stderr).toContain(ruta);
      expect(resultado.stderr).toContain(motivo);
      expect(resultado.stdout).toBe("");
      expect(evaluador).not.toHaveBeenCalled();
      expect(existsSync(join(lab, "corrio.txt"))).toBe(false);
      expect(readReceipts(paths(), TICKET)).toEqual([]);
      expect(existsSync(join(lab, ".valmen/receipts"))).toBe(false);
      expect(
        listGateCards(paths(), TICKET)?.find((card) => card.id === "qa-mechanical")
          ?.hasCommandChecks,
      ).toBe(false);
    },
  );

  it("sin repositorio declarado no arma un check aunque el archivo exista (CA5)", () => {
    for (const command of [`playwright "${SPEC}"`, `node runner.cjs "${SPEC}"`]) {
      const resultado = commandChecksFor(
        extractCriteriaSpecs(criterio(command)),
        [declaracion.command],
        undefined,
        declaracion,
      );
      expect(resultado.checks).toEqual([]);
      expect(resultado.refused[0]).toContain(SPEC);
      expect(resultado.refused[0]).toContain("no se declaró el repositorio");
    }
    expect(existsSync(join(lab, "corrio.txt"))).toBe(false);
  });

  it("un criterio inválido impide correr también los checks válidos del mismo ticket", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "in_progress",
      criterios: `${criterio(`playwright "${SPEC}"`)}\n${criterio("playwright ausente.spec.ts")}`,
    });
    expect((await correr()).exitCode).toBe(EXIT_INVARIANT);
    expect(existsSync(join(lab, "corrio.txt"))).toBe(false);
    expect(readReceipts(paths(), TICKET)).toEqual([]);
  });

  it("autorizar el verbo pelado no evita comprobar la ruta", () => {
    const resultado = commandChecksFor(
      extractCriteriaSpecs(criterio("playwright")),
      ["playwright"],
      undefined,
      declaracion,
      repositorio(),
    );
    expect(resultado.checks).toEqual([]);
    expect(resultado.refused[0]).toContain("falta la ruta");
  });

  it.each(["ts", "js", "tsx", "mjs"])(
    "comprueba los argumentos .spec.%s del comando completo",
    (extension) => {
      expect(resolver(`node runner.cjs ausente.spec.${extension}`).refused[0]).toContain(
        "no existe",
      );
    },
  );

  it("el comando completo conserva argumentos y permite filtros por título", () => {
    const completo = resolver(`node runner.cjs "${SPEC}" --grep "guarda la orden"`);
    expect(completo.refused).toEqual([]);
    expect(completo.checks[0]?.args).toEqual([
      "runner.cjs",
      SPEC,
      "--grep",
      "guarda la orden",
    ]);
    expect(resolver('node runner.cjs "guarda la orden"').refused).toEqual([]);
    // Un programa distinto no hereda la regla por coincidir parcialmente.
    expect(
      commandChecksFor(
        extractCriteriaSpecs(criterio("node runner.cjs-otro ausente.spec.ts")),
        ["node"],
        undefined,
        declaracion,
      ).refused,
    ).toEqual([]);
  });

  it.each([
    "./orden.spec.ts",
    "tests//orden.spec.ts",
    "tests/../orden.spec.ts",
    "tests/orden.spec.ts/",
    "tests\\orden.spec.ts",
  ])("rechaza la forma no canónica %s antes de consultar el disco", (ruta) => {
    const esArchivo = vi.fn(() => true);
    expect(specDelRepositorio(ruta, { root: lab, esArchivo })).toHaveProperty("motivo");
    expect(esArchivo).not.toHaveBeenCalled();
  });

  it("consulta el predicado con la ruta absoluta y devuelve la relativa canónica", () => {
    const esArchivo = vi.fn(() => true);
    expect(specDelRepositorio(SPEC, { root: lab, esArchivo })).toEqual({ ruta: SPEC });
    expect(esArchivo).toHaveBeenCalledWith(join(lab, SPEC));
  });
});

describe("compatibilidad y documentación", () => {
  it("la sonda de plan conserva la capacidad sin necesitar un spec", () => {
    const texto = renderFixtureTicket({
      id: TICKET,
      plan: "Ajustar `FrontEnd/src/orden.component.html`.",
    });
    const consultar = (command: string) =>
      interfazDelTicket({
        texto,
        comandos: [],
        playwright: { ...declaracion, command, provider: "openrouter", model: "" },
      });
    expect(consultar(declaracion.command).requiereDeclaracion).toBe(true);
    expect(consultar("  ").capacidadDisponible).toBe(false);
    expect(interfazDelTicket({ texto, comandos: ["playwright"] }).capacidadDisponible).toBe(
      false,
    );
  });

  it("la documentación declara la regla y el origen de la evidencia (CA8)", () => {
    const texto = readFileSync(new URL("../docs/03-GATES.md", import.meta.url), "utf8");
    const seccion = texto.split("### 5.1sexies")[1]?.split("### 5.1septies")[0] ?? "";
    expect(seccion).toContain("archivo regular del repositorio");
    expect(seccion).toContain("relativa y canónica");
    expect(seccion).toContain("sin llamar a un modelo ni emitir un recibo");
    expect(seccion).toContain("ejecución del archivo, no de la sesión del agente");
  });
});

// CA9 se verifica fuera de esta suite: ejecutar `npx vitest run` y
// `npm run typecheck`. Invocarla recursivamente aquí no comprobaría el cierre.
