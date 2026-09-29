/**
 * El encadenamiento de los manuales al despliegue.
 *
 * Lo que se prueba no es que los YAML se lean, sino las dos decisiones del plan
 * que hacen que un fallo de manuales **avise y no bloquee** la release:
 *
 * 1. El paso `manuales` del `deploy` es `kind: process`, apunta a
 *    `actualizar-manuales` y declara `continue_on_failure` y `notify_on_failure`.
 * 2. Una corrida cuyo paso de manuales falla **igual** ejecuta el paso siguiente
 *    y deja una corrida persistida con ese paso en `failed`.
 *
 * Los procesos se cargan de verdad —los del repositorio, con `requireProcess`—
 * y la corrida va con el ejecutor inyectado: ningún paso toca `git tag` ni
 * `release-publish`.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listRuns, requireProcess, runProcess } from "@valmen/engine";

const REPO = process.cwd();

let lab: string;

/** Copia los procesos y el gate declarados de verdad a un laboratorio. */
function copiarDeclarados(): void {
  mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
  mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
  for (const proceso of ["deploy.yaml", "actualizar-manuales.yaml"]) {
    cpSync(
      join(REPO, ".valmen", "processes", proceso),
      join(lab, ".valmen", "processes", proceso),
    );
  }
  cpSync(
    join(REPO, ".valmen", "gates", "deploy.yaml"),
    join(lab, ".valmen", "gates", "deploy.yaml"),
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-deploy-"));
  copiarDeclarados();
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el proceso deploy declara el paso de manuales", () => {
  it("carga los procesos del repositorio y encadena actualizar-manuales sin bloquear", () => {
    const deploy = requireProcess(REPO, "deploy");
    const manuales = requireProcess(REPO, "actualizar-manuales");

    const paso = deploy.definition.steps.find((step) => step.id === "manuales");
    expect(paso).toBeDefined();
    expect(paso?.kind).toBe("process");
    expect(paso?.target).toBe("actualizar-manuales");
    expect(paso?.continueOnFailure).toBe(true);
    expect(paso?.notifyOnFailure).toBe(true);

    const deteccion = manuales.definition.steps.find(
      (step) => step.id === "detectar-pantallas",
    );
    expect(deteccion?.kind).toBe("command");
    expect(deteccion?.run).toContain("valmen manuales pendientes");
    expect(deteccion?.run).toContain("--tickets {tickets}");
  });
});

describe("el proceso actualizar-manuales declara la auditoría con citas", () => {
  it("carga con el paso auditar-manuales, de tipo command, que corre valmen manuales auditar", () => {
    const manuales = requireProcess(REPO, "actualizar-manuales");

    const auditoria = manuales.definition.steps.find((step) => step.id === "auditar-manuales");
    expect(auditoria).toBeDefined();
    expect(auditoria?.kind).toBe("command");
    expect(auditoria?.run).toContain("valmen manuales auditar");

    // Va al final: la dependencia R-S3-002 agrega su paso en el mismo archivo y
    // el cambio de este ticket es aditivo.
    const ids = manuales.definition.steps.map((step) => step.id);
    expect(ids[ids.length - 1]).toBe("auditar-manuales");
  });
});

describe("un fallo de manuales no corta la release", () => {
  it("ejecuta el paso siguiente y deja la corrida con el paso de manuales en failed", () => {
    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "deploy",
      params: { version: "1.2.3", tickets: "FEATURE-PANTALLAS-POS-20260926" },
      // El ejecutor inyectado: nada de shell real, que los pasos crean tags.
      runCommand: (comando: string) => {
        comandos.push(comando);
        if (comando.includes("manuales pendientes")) {
          return { status: 1, stdout: "", stderr: "manuales falló (simulado)" };
        }
        return { status: 0, stdout: `ok: ${comando}`, stderr: "" };
      },
      onGate: "skip",
    });

    // La release siguió: el paso de cierre corrió después del fallo.
    expect(comandos.some((comando) => comando.includes("valmen index"))).toBe(true);
    expect(corrida.waiting).toBe(false);
    expect(corrida.ok).toBe(true);
    expect(corrida.steps.find((paso) => paso.id === "manuales")?.status).toBe("failed");

    // Y quedó persistida, con el paso de manuales en rojo. (El sub-proceso
    // `actualizar-manuales` también deja su corrida: su propio paso falló.)
    const corridas = listRuns(lab);
    const delDeploy = corridas.find((registrada) => registrada.processId === "deploy");
    expect(delDeploy).toBeDefined();
    expect(delDeploy?.steps.find((paso) => paso.id === "manuales")?.status).toBe("failed");
  });
});
