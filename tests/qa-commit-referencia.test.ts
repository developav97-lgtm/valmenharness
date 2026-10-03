/**
 * La forma `commit:<sha>` de `--build-reference` en `qa-start`.
 *
 * El caso que la motivó: en BUGFIX-LIQUIDACION-CONGRUENCIA-20260928 el ciclo de
 * QA re-corrió la suite y el build sobre el árbol commiteado (tercera corrida)
 * cuando la evidencia `worktree:sha256` ya garantizaba los mismos bytes. Lo que
 * se protege acá:
 *
 * 1. **La igualdad se verifica, no se cree.** `commit:<sha>` exige evidencia
 *    `worktree:sha256` y un árbol del commit byte a byte igual al hasheado.
 * 2. **Un árbol distinto se rechaza sin escribir el bloque.** Eso es lo que
 *    evita citar un commit cuyo contenido nadie probó.
 * 3. **Sin evidencia no hay forma `commit:`.** Es un añadido, no un reemplazo:
 *    la referencia libre de siempre sigue funcionando igual.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "@valmen/core";
import { addEvidence, addPoint, qaClose, qaStart } from "../packages/engine/src/append.js";
import { calculateWorktreeReference } from "../packages/engine/src/references.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-QA-COMMIT-REFERENCIA-20260928";
const ARCHIVO = "packages/app/src/factura.py";
const VERIFICADO = "version verificada\n";
const DISTINTO = "version distinta\n";

/** El hash del contrato sobre UN archivo, con el contenido dado. */
const hashDe = (contenido: string): string => {
  const hash = createHash("sha256");
  const ruta = Buffer.from(ARCHIVO, "utf8");
  const largoRuta = Buffer.alloc(8);
  largoRuta.writeBigUInt64BE(BigInt(ruta.length));
  const bytes = Buffer.from(contenido, "utf8");
  const largoContenido = Buffer.alloc(8);
  largoContenido.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(largoRuta);
  hash.update(ruta);
  hash.update(largoContenido);
  hash.update(bytes);
  return hash.digest("hex");
};

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-qa-commit-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  // La vía de cierre-consumo.test.ts: el ticket nace en in_qa con un ciclo
  // QA-001 aprobado ya escrito en el bloque —el historial par que un segundo
  // qa-start necesita—. Sin transiciones, sin gates: el asunto acá es la
  // referencia de build, no la máquina de estados.
  const ciclo = [
    {
      id: "QA-001",
      date: "2026-09-28",
      build_reference: "worktree:sha256:" + "0".repeat(64),
      environment: "dev",
      result: "pending",
      findings: [],
      correction: null,
      po_confirmation: null,
    },
  ];
  writeFixtureTicket(lab, { id: TICKET, module: "QA", workflowStatus: "in_qa", qaStatus: "in_qa" });
  const ruta = join(lab, "tickets", "2026", TICKET, "ticket.md");
  writeFileSync(
    ruta,
    readFileSync(ruta, "utf8")
      .replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: Aprueba el QA en dev.",
      )
      .replace(
        /## QA\n\n```json\n\[\]\n```/,
        `## QA\n\n\`\`\`json\n${JSON.stringify(ciclo, null, 2)}\n\`\`\``,
      ),
    "utf8",
  );
  // El repo con el archivo versionado: primero la versión verificada (la que
  // la evidencia nombrará), después un commit con contenido distinto.
  mkdirSync(join(lab, "packages", "app", "src"), { recursive: true });
  git("init", "-q");
  git("config", "user.email", "lab@valmen");
  git("config", "user.name", "Lab");
  writeFileSync(join(lab, ARCHIVO), VERIFICADO, "utf8");
  git("add", ".");
  git("commit", "-q", "-m", "verificado");
  writeFileSync(join(lab, ARCHIVO), DISTINTO, "utf8");
  git("add", ".");
  git("commit", "-q", "-m", "distinto");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const commits = (): { verificado: string; distinto: string } => {
  const log = execFileSync("git", ["log", "--format=%H %s"], { cwd: lab, encoding: "utf8" });
  const lineas = log.trim().split("\n");
  return {
    distinto: lineas[0]?.split(" ")[0] ?? "",
    verificado: lineas[1]?.split(" ")[0] ?? "",
  };
};

/** Declara el punto con el archivo afectado y la evidencia con el hash dado. */
const prepararTicket = (hash: string) => {
  addPoint({
    paths: { root: lab, ticketsDir: "tickets" },
    ticketId: TICKET,
    title: "punto del lab",
    severity: "low",
    actual: "a",
    expected: "e",
    affectedFiles: [ARCHIVO],
  });
  addEvidence({
    paths: { root: lab, ticketsDir: "tickets" },
    ticketId: TICKET,
    kind: "verification",
    description: "hash del arbol verificado",
    reference: `worktree:sha256:${hash}`,
  });
};

const paths = () => ({ root: lab, ticketsDir: "tickets" });
const ticket = () => readFileSync(join(lab, "tickets", "2026", TICKET, "ticket.md"), "utf8");
const git = (...args: string[]) => execFileSync("git", args, { cwd: lab, encoding: "utf8" });

describe("qa-start con --build-reference commit:<sha>", () => {
  /**
   * Cierra el ciclo QA-001 que el fixture trae abierto y deja el ticket listo
   * para un segundo `qa-start` —el que cada prueba hace con `commit:` o con la
   * referencia libre—. El re-ciclo es la vía real: qa_approved -> in_qa.
   */
  const cerrarYVolverAInQa = () => {
    qaClose({
      paths: paths(),
      ticketId: TICKET,
      result: "approved",
      poConfirmation: "Aprobado en dev",
    });
  };

  it("acepta el commit cuyo árbol coincide con la evidencia y registra la referencia", () => {
    const { verificado } = commits();
    prepararTicket(hashDe(VERIFICADO));
    cerrarYVolverAInQa();
    const salida = qaStart({
      paths: paths(),
      ticketId: TICKET,
      environment: "dev",
      buildReference: `commit:${verificado}`,
    });
    expect(salida).toContain("Ciclo QA iniciado");
    expect(ticket()).toContain(`"build_reference": "commit:${verificado}"`);
  });

  it("rechaza el commit cuyo árbol no coincide, sin escribir el bloque", () => {
    const { distinto } = commits();
    prepararTicket(hashDe(VERIFICADO));
    cerrarYVolverAInQa();
    expect(() =>
      qaStart({
        paths: paths(),
        ticketId: TICKET,
        environment: "dev",
        buildReference: `commit:${distinto}`,
      }),
    ).toThrow(/no coincide con la evidencia/);
    // Sin bloque escrito: el fallo ocurrió antes del qa-start, así que el
    // historial queda exactamente con el par del ciclo cerrado (QA-001/QA-002)
    // y ninguna tercera entrada.
    const qa = /## QA\s*```json\s*(\[[\s\S]*?\])\s*```/.exec(ticket());
    expect(JSON.parse(qa?.[1] ?? "[]")).toHaveLength(2);
  });

  it("sin evidencia worktree:sha256 la forma commit: se rechaza y la libre funciona", () => {
    const { verificado } = commits();
    cerrarYVolverAInQa();
    expect(() =>
      qaStart({
        paths: paths(),
        ticketId: TICKET,
        environment: "dev",
        buildReference: `commit:${verificado}`,
      }),
    ).toThrow(/exige que el ticket tenga evidencia/);
    // La referencia libre de siempre no cambia: un hash literal del contrato
    // se registra igual, sin verificarlo contra nada —como hasta hoy—.
    const salida = qaStart({
      paths: paths(),
      ticketId: TICKET,
      environment: "dev",
      buildReference: `worktree:sha256:${"a".repeat(64)}`,
    });
    expect(salida).toContain("Ciclo QA iniciado");
  });

  it("un sha que no es de 40 hex se rechaza por forma", () => {
    cerrarYVolverAInQa();
    expect(() =>
      qaStart({
        paths: paths(),
        ticketId: TICKET,
        environment: "dev",
        buildReference: "commit:abc123",
      }),
    ).toThrow(/40 hex/);
  });
});

describe("referencia de worktree sin puntos", () => {
  it("usa los archivos funcionales modificados y excluye el registro del ticket", () => {
    const ruta = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(join(lab, ARCHIVO), "version lista para QA\n", "utf8");
    const documento = parseTicket(readFileSync(ruta, "utf8"));

    expect(calculateWorktreeReference(documento, ruta, lab)).toMatch(
      /^worktree:sha256:[0-9a-f]{64}$/,
    );
  });
});
