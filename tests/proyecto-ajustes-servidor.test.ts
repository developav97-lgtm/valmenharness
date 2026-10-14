/**
 * Los datos que la vista Ajustes › Proyecto necesita del servidor (FEATURE-WEB-AJUSTES-PROYECTO-20261014,
 * R-AJU-006): el estado de la aprobación por defecto en `GET /api/approval/authorizations` (D-001)
 * y, en el resumen de `GET /api/config`, los comandos de prueba, el tiempo máximo y los avisos.
 *
 * Todo corre sobre una raíz temporal: nunca se revoca ni se escribe nada del repositorio.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listarAutorizacionesDeAprobacion,
  revocarAutorizacionDeAprobacionMc,
} from "../packages/server/src/approval-autorizaciones.js";
import { checkConfig } from "../packages/server/src/config.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-proyecto-ajustes-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

interface PorDefecto {
  readonly id: string;
  readonly estado: string;
}
const porDefecto = (): PorDefecto | undefined =>
  (listarAutorizacionesDeAprobacion(root).body as { porDefecto?: PorDefecto }).porDefecto;

describe("C9: el estado de la aprobación por defecto en GET /api/approval/authorizations", () => {
  it("es vigente sin revocación y revocada tras revocar POLITICA-POR-DEFECTO; la lista no cambia", () => {
    expect(porDefecto()).toMatchObject({ id: "POLITICA-POR-DEFECTO", estado: "vigente" });

    const r = revocarAutorizacionDeAprobacionMc(
      root,
      { id: "POLITICA-POR-DEFECTO", actor: "Ana Prueba", quote: "vuelvo a aprobar yo" },
      {},
    );
    expect(r.status).toBe(200);

    expect(porDefecto()).toMatchObject({ id: "POLITICA-POR-DEFECTO", estado: "revocada" });
    // Regresión: `authorizations` sigue trayendo solo las del registro.
    const cuerpo = listarAutorizacionesDeAprobacion(root).body as { authorizations: unknown[] };
    expect(cuerpo.authorizations).toEqual([]);
  });
});

describe("C10: el resumen de la configuración trae Pruebas y Avisos", () => {
  it.each([
    {
      caso: "sin claves",
      texto: "name: Demo\n",
      esperado: { testCommands: [], testTimeout: null, avisos: { enabled: false, gate: "", budget: "" } },
    },
    {
      caso: "con pruebas y hermes",
      texto:
        "name: Demo\ntest-commands:\n  - npx vitest run\n  - node\ntest-timeout: 420\n" +
        "hermes:\n  enabled: true\n  notify:\n    gate: telegram\n    budget: slack:#ops\n",
      esperado: {
        testCommands: ["npx vitest run", "node"],
        testTimeout: 420,
        avisos: { enabled: true, gate: "telegram", budget: "slack:#ops" },
      },
    },
    {
      caso: "un token-hours inválido no tumba el resumen",
      texto: "name: Demo\nhermes:\n  enabled: true\n  approval:\n    token-hours: 0\n",
      esperado: { testCommands: [], testTimeout: null, avisos: { enabled: true, gate: "", budget: "" } },
    },
  ])("$caso", ({ texto, esperado }) => {
    const estado = checkConfig(root, texto);
    expect(estado.ok).toBe(true);
    expect(estado.summary).toMatchObject(esperado);
    // Regresión: las claves de siempre no cambian.
    expect(estado.summary?.name).toBe("Demo");
  });
});
