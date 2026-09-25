/**
 * El consumo de IA, que es lo último que falta antes de cerrar.
 *
 * La regla del proyecto dice que el consumo es **obligatorio en todos los
 * tickets**. Hasta ahora eso era disciplina: ninguna compuerta lo miraba, y el
 * resultado se vio en el registro real —un ticket cerrado cuyo propio cierre
 * declaraba que una sesión de Hermes había trabajado en él, con el costo de esa
 * sesión registrado entero en otro ticket, y una entrada cuyo `source` decía
 * `hermes:` apuntando a la base de OpenCode—.
 *
 * Lo que se afirma acá:
 *
 * 1. **Sin consumo no hay cierre.** El motor lo rechaza antes de escribir nada.
 * 2. **La fuente se verifica.** El prefijo tiene que apuntar a la base que
 *    nombra, porque un costo que no se puede rastrear es una afirmación.
 * 3. **La salida honesta existe.** Una sesión que sirvió a varios tickets se
 *    declara sin números con `manual:`; lo que no se admite es un reparto
 *    inventado con forma de medición.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addAiUsage, closeAttempt } from "../packages/engine/src/append.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-FILTRO-PARCIAL-20260922";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/**
 * Un ciclo de QA cerrado y aprobado.
 *
 * Se copia la forma de un ticket real del fixture en vez de inventarla: el
 * contrato exige el conjunto exacto de claves, y una entrada escrita a mano que
 * se olvide una falla por un motivo que no es el que este test mide.
 */
const CICLO_QA = [
  {
    id: "QA-001",
    date: "2026-09-22",
    build_reference: `commit:${"a".repeat(40)}`,
    environment: "local, macOS, Node 24",
    result: "pending",
    findings: [],
    correction: null,
    po_confirmation: null,
  },
  {
    id: "QA-002",
    date: "2026-09-22",
    build_reference: null,
    environment: null,
    result: "approved",
    findings: [],
    correction: null,
    po_confirmation: "Aprobado, quedó bien",
  },
];

/** El ticket en `qa_approved`, con su ciclo cerrado: listo para preparar el cierre. */
function ticketCerrable(): void {
  const texto = renderFixtureTicket({
    id: ID,
    workflowStatus: "qa_approved",
    qaStatus: "approved",
    criterios:
      "- [x] Buscar «104» devuelve la orden «1042».\n      <!-- verify: manual -->",
  })
    .replace(
      "## Pruebas\n\nPendiente de ejecución.",
      "## Pruebas\n\n- Resultado comunicado por el PO: probado en la sucursal y conforme.",
    )
    .replace(
      /## QA\n\n```json\n\[\]\n```/,
      `## QA\n\n\`\`\`json\n${JSON.stringify(CICLO_QA, null, 2)}\n\`\`\``,
    );

  mkdirSync(join(lab, "tickets", "2026", ID), { recursive: true });
  writeFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), texto, "utf8");
}

/** Un cierre válido, para que el único motivo de rechazo sea el que se mide. */
function cierre(): string {
  return closeAttempt({
    paths: PATHS(),
    ticketId: ID,
    technicalSummary: "El lookup pasó de exacto a parcial.",
    functionalSummary: "El cajero encuentra la orden escribiendo parte del número.",
    qaStatus: "approved",
    releaseImpact: "Queda unreleased hasta el próximo despliegue.",
  });
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-consumo-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el cierre y el consumo de IA", () => {
  it("sin consumo no hay cierre, y el mensaje dice cómo registrarlo", () => {
    ticketCerrable();

    expect(() => cierre()).toThrowError(/consumo de IA/i);
    // El rechazo nombra el comando y las fuentes válidas: un «falta el consumo»
    // sin decir cómo se agrega deja al agente adivinando.
    expect(() => cierre()).toThrowError(/add-ai-usage/);
    expect(() => cierre()).toThrowError(/manual/);
  });

  it("con una entrada válida, el cierre se prepara", () => {
    ticketCerrable();
    addAiUsage({
      paths: PATHS(),
      ticketId: ID,
      source: "opencode:/tmp/home/.local/share/opencode/opencode.db",
      confidence: "high",
      sessionReference: "ses_abc",
      inputTokens: "1200",
      outputTokens: "300",
      totalTokens: "1500",
      estimatedCostUsd: "0.0123",
    });

    expect(cierre()).toContain("Intento de cierre agregado");
  });

  it("acepta los orígenes declarados, incluido el que no tiene base", () => {
    ticketCerrable();
    // `manual` es el caso declarado de una sesión que no expone agregado, y
    // `process` el de una corrida del propio harness. Los dos son legítimos y no
    // se pueden confundir con un prefijo mal escrito.
    for (const source of [
      "manual:sesión compartida entre cinco tickets, sin reparto",
      "process:cierre-sprint-2",
      "codex:01a0d522-ff58-7752-b2e5-e199eebbef53",
    ]) {
      expect(() =>
        addAiUsage({ paths: PATHS(), ticketId: ID, source, confidence: "high" }),
      ).not.toThrow();
    }
  });

  it("rechaza un origen desconocido, que es como pasa un prefijo mal escrito", () => {
    ticketCerrable();
    for (const source of ["cli", "opencodes:x", "hermes", "valmen:sesion"]) {
      expect(
        () => addAiUsage({ paths: PATHS(), ticketId: ID, source, confidence: "high" }),
        source,
      ).toThrowError(/source/);
    }
  });

  it("rechaza una fuente que dice una cosa y apunta a otra", () => {
    ticketCerrable();
    // El caso real: la entrada que quedó en el cierre de un ticket de SaiOpenCloud
    // decía `hermes:` y apuntaba a la base de OpenCode.
    expect(() =>
      addAiUsage({
        paths: PATHS(),
        ticketId: ID,
        source: "hermes:/Users/quien/.local/share/opencode/opencode.db",
        confidence: "high",
      }),
    ).toThrowError(/hermes/);

    expect(() =>
      addAiUsage({
        paths: PATHS(),
        ticketId: ID,
        source: "opencode:/Users/quien/.hermes/profiles/tienda/state.db",
        confidence: "high",
      }),
    ).toThrowError(/opencode/);
  });

  it("un ticket que ya tiene consumo no se bloquea, aunque sea de antes", () => {
    ticketCerrable();
    addAiUsage({
      paths: PATHS(),
      ticketId: ID,
      source: "manual:sin contabilidad que leer",
      confidence: "high",
      notes: "Sesión compartida entre varios tickets.",
    });

    // Y la entrada sin números es válida: el contrato admite `null` en tokens y
    // coste, que es lo que distingue «no hay dato» de «costó cero».
    expect(cierre()).toContain("CLOSE-001");
  });
});

describe("lo que el cierre deja escrito", () => {
  it("el consumo sobrevive al cierre y valida con el resto del ticket", async () => {
    ticketCerrable();
    addAiUsage({
      paths: PATHS(),
      ticketId: ID,
      source: "opencode:/tmp/home/.local/share/opencode/opencode.db",
      confidence: "high",
      estimatedCostUsd: "0.5",
    });
    cierre();

    const { validateOne } = await import("../packages/cli/src/commands.js");
    expect(validateOne(PATHS(), ID).exitCode).toBe(0);
  });

  it("el ticket del fixture sigue siendo válido sin consumo: la regla es del cierre", async () => {
    // Deliberado: `validate` describe el esquema, y la historia del registro no se
    // reescribe. La obligación del consumo es una precondición del **cierre**, así
    // que no invalida los tickets que ya están cerrados.
    writeFixtureTicket(lab, { id: ID });

    const { validateOne } = await import("../packages/cli/src/commands.js");
    expect(validateOne(PATHS(), ID).exitCode).toBe(0);
  });
});
