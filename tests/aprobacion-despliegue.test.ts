/**
 * El gate de despliegue exige su frase con la versión y consume la aprobación (R-CTRL-002).
 *
 * Antes la frase `require_phrase` se declaraba y nadie la leía, y «la última aprobación
 * manda» volvía permanente una aprobación: la de la 1.4.0 habilitaba también la 1.5.0. Los
 * casos recorren una corrida real que se detiene, se aprueba y se retoma, sin ejecutar
 * ningún despliegue (los comandos los sustituye un simulador).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  approveGate,
  gateApproved,
  readApprovals,
  runProcess,
  waitingRuns,
} from "@valmen/engine";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-aprobdep-"));
  mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
  mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "gates", "deploy.yaml"),
    'id: deploy\ntitle: Aprobación\nmode: human\nrequire_phrase: "APROBAR DEPLOY v{version}"\n',
  );
  writeFileSync(
    join(lab, ".valmen", "gates", "manuales.yaml"),
    "id: manuales\ntitle: Aprobación sin frase\nmode: human\n",
  );
  writeFileSync(
    join(lab, ".valmen", "processes", "deploy.yaml"),
    [
      "id: deploy",
      "title: Despliegue",
      "params:",
      "  version: { type: string, required: true }",
      "steps:",
      "  - id: aprobacion",
      "    title: Aprobación final",
      "    kind: gate",
      "    gate: deploy",
      "  - id: publicar",
      "    title: Publicar",
      "    kind: command",
      "    run: publicar {version}",
      "",
    ].join("\n"),
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const simulador = (comandos: string[] = []) => (comando: string) => {
  comandos.push(comando);
  return { status: 0, stdout: "ok", stderr: "" };
};

/** Corre el proceso hasta que se detiene en el gate y devuelve la corrida en espera. */
function detenerEn(version: string) {
  runProcess({ root: lab, id: "deploy", params: { version }, runCommand: simulador() });
  const esperando = waitingRuns(lab).find((corrida) => corrida.params["version"] === version);
  if (esperando === undefined) throw new Error(`no hay corrida esperando para ${version}`);
  return esperando;
}

function retomar(corrida: ReturnType<typeof detenerEn>, comandos: string[] = []) {
  return runProcess({
    root: lab,
    id: "deploy",
    params: corrida.params,
    resume: corrida,
    runCommand: simulador(comandos),
  });
}

describe("la frase", () => {
  it("aprobar con la frase y la versión de la corrida procede", () => {
    const corrida = detenerEn("1.5.0");
    const aprobacion = approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
      runId: corrida.runId,
      phrase: "APROBAR DEPLOY v1.5.0",
    });
    expect(aprobacion.runId).toBe(corrida.runId);
    expect(aprobacion.version).toBe("1.5.0");
  });

  it("una frase distinta se rechaza y no deja aprobación", () => {
    const corrida = detenerEn("1.5.0");
    expect(() =>
      approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
        runId: corrida.runId,
        phrase: "aprobar deploy",
      }),
    ).toThrow(/APROBAR DEPLOY v1\.5\.0/);
    expect(() =>
      approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
        runId: corrida.runId,
        phrase: "APROBAR DEPLOY v1.4.0",
      }),
    ).toThrow(/no coincide/);
    expect(readApprovals(lab)).toEqual([]);
  });

  it("sin corrida o sobre una corrida inexistente se rechaza", () => {
    expect(() => approveGate(lab, "deploy", "Juan Andrade", "")).toThrow(/--run/);
    expect(() =>
      approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
        runId: "deploy-inexistente",
        phrase: "APROBAR DEPLOY v1.5.0",
      }),
    ).toThrow(/No existe la corrida/);
  });
});

describe("la atadura a la corrida y a la versión", () => {
  it("la aprobación de la 1.4.0 no habilita el despliegue de la 1.5.0", () => {
    const vieja = detenerEn("1.4.0");
    approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
      runId: vieja.runId,
      phrase: "APROBAR DEPLOY v1.4.0",
    });

    const nueva = detenerEn("1.5.0");
    const comandos: string[] = [];
    const corrida = retomar(nueva, comandos);

    expect(corrida.waiting).toBe(true);
    expect(comandos).toEqual([]);
    expect(gateApproved(lab, "deploy", { runId: nueva.runId, params: nueva.params })).toBeNull();
  });
});

describe("el consumo", () => {
  it("la aprobación se gasta al usarse y una segunda corrida de la misma versión queda esperando", () => {
    const primera = detenerEn("1.5.0");
    approveGate(lab, "deploy", "Juan Andrade", "", new Date(), {
      runId: primera.runId,
      phrase: "APROBAR DEPLOY v1.5.0",
    });
    const comandos: string[] = [];
    expect(retomar(primera, comandos).ok).toBe(true);
    expect(comandos).toEqual(["publicar 1.5.0"]);
    expect(readApprovals(lab)[0]?.consumedAt).toBeDefined();

    // Otra corrida de la misma versión: la aprobación anterior ya no sirve.
    runProcess({ root: lab, id: "deploy", params: { version: "1.5.0" }, runCommand: simulador() });
    const segunda = waitingRuns(lab).find((c) => c.runId !== primera.runId);
    expect(segunda).toBeDefined();
    expect(retomar(segunda as NonNullable<typeof segunda>).waiting).toBe(true);
  });
});

describe("compatibilidad", () => {
  it("una aprobación vieja, sin corrida ni versión, no habilita un gate que exige frase", () => {
    writeFileSync(
      join(lab, ".valmen", "gates", "approvals.json"),
      JSON.stringify([
        { gate: "deploy", actor: "Alguien", reason: "", at: "2026-01-01T00:00:00.000Z" },
      ]),
    );
    const corrida = detenerEn("1.5.0");
    expect(gateApproved(lab, "deploy", { runId: corrida.runId, params: corrida.params })).toBeNull();
    expect(retomar(corrida).waiting).toBe(true);
  });

  it("un gate sin require_phrase conserva su comportamiento: la última aprobación manda", () => {
    approveGate(lab, "manuales", "Primera", "");
    approveGate(lab, "manuales", "Segunda", "");
    expect(gateApproved(lab, "manuales")?.actor).toBe("Segunda");
    expect(readFileSync(join(lab, ".valmen", "gates", "approvals.json"), "utf8")).not.toContain("consumedAt");
  });
});
