/**
 * El tercer modo de verificación de criterios: una persona valida en dev.
 *
 * `verify: dev` no ejecuta una URL: conserva el ambiente que el criterio
 * promete, exige que esté configurado y evita que un resultado genérico avance
 * a QA como si la pantalla desplegada se hubiese comprobado.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readVerifyDevConfig } from "../packages/adapter/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { transition } from "../packages/engine/src/transition.js";
import { extractCriteriaSpecs } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-VERIFY-DEV-20261004";
let lab: string;

const paths = () => ({ root: lab, ticketsDir: "tickets" });
const criterioDev =
  "- [ ] La pantalla conserva el flujo de pago en desarrollo.\n" +
  "      <!-- verify: dev -->";

function config(text: string): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), text, "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-verify-dev-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("la anotación de criterio", () => {
  it("conserva dev como una modalidad humana distinta de manual", () => {
    const criterios = extractCriteriaSpecs(
      `${criterioDev}\n- [ ] La pantalla conserva el contraste.\n      <!-- verify: manual -->`,
    );

    expect(criterios).toMatchObject([
      { command: null, manual: true, dev: true },
      { command: null, manual: true, dev: false },
    ]);
  });
});

describe("la configuración del ambiente", () => {
  it("requiere una URL HTTP(S) y conserva la rama opcional", () => {
    expect(
      readVerifyDevConfig(
        parseConfig('verify-dev:\n  url: "https://dev.ejemplo.test"\n  branch: dev\n'),
      ),
    ).toEqual({ url: "https://dev.ejemplo.test", branch: "dev" });

    expect(() => readVerifyDevConfig(parseConfig("verify-dev:\n  branch: dev\n"))).toThrow(
      /verify-dev.url/,
    );
    expect(() => readVerifyDevConfig(parseConfig("verify-dev:\n  url: ftp://dev.test\n"))).toThrow(
      /verify-dev.url/,
    );
    expect(() =>
      readVerifyDevConfig(
        parseConfig("verify-dev:\n  url: https://dev.test\n  branch:\n    - dev\n"),
      ),
    ).toThrow(/verify-dev.*branch/);
  });
});

describe("qa-mechanical", () => {
  it("rechaza dev sin ambiente y conserva la revisión de un criterio manual", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      type: "FEATURE",
      module: "VERIFY",
      workflowStatus: "in_progress",
      criterios: criterioDev,
    });

    const sinAmbiente = await runGate(paths(), { gateId: "qa-mechanical", ticketId: TICKET });
    expect(sinAmbiente.exitCode).toBe(3);
    expect(sinAmbiente.stderr).toContain("verify-dev");

    writeFixtureTicket(lab, {
      id: TICKET,
      type: "FEATURE",
      module: "VERIFY",
      workflowStatus: "in_progress",
      criterios: "- [ ] La pantalla conserva el contraste.\n      <!-- verify: manual -->",
    });
    const manual = await runGate(paths(), { gateId: "qa-mechanical", ticketId: TICKET });
    expect(manual.stdout).toContain("REVIEW");
    expect(manual.stderr).toBe("");
  });

  it("acepta la modalidad dev configurada sin convertirla en un comando", async () => {
    config('verify-dev:\n  url: "https://dev.ejemplo.test"\n  branch: dev\n');
    writeFixtureTicket(lab, {
      id: TICKET,
      type: "FEATURE",
      module: "VERIFY",
      workflowStatus: "in_progress",
      criterios: criterioDev,
    });

    const result = await runGate(paths(), { gateId: "qa-mechanical", ticketId: TICKET });
    expect(result.stdout).toContain("REVIEW");
    expect(result.stderr).toBe("");
  });
});

describe("el pase a QA", () => {
  it("no acepta un resultado genérico y exige que el PO identifique dev", () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      type: "FEATURE",
      module: "VERIFY",
      workflowStatus: "awaiting_user_tests",
      criterios: criterioDev,
    });
    const ticketPath = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(
      ticketPath,
      readFileSync(ticketPath, "utf8").replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: conforme.",
      ),
      "utf8",
    );

    expect(() => transition({ paths: paths(), ticketId: TICKET, entity: "ticket", to: "in_qa" })).toThrow(
      /resultado del PO u omisión explícita/i,
    );

    writeFileSync(
      ticketPath,
      readFileSync(ticketPath, "utf8").replace(
        "- Resultado del PO: conforme.",
        "- Resultado del PO: validado en dev y conforme.",
      ),
      "utf8",
    );
    expect(
      transition({ paths: paths(), ticketId: TICKET, entity: "ticket", to: "in_qa" }).details,
    ).toContain("awaiting_user_tests -> in_qa");
  });
});
