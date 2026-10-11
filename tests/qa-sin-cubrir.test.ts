/**
 * El cierre del ciclo de QA declara lo que quedó sin cubrir (R-QAC-001) y los ciclos viejos
 * siguen leyéndose (R-QAC-002).
 *
 * Corre sobre una raíz temporal: un ticket en `in_qa` con el ciclo abierto, cerrado una vez por
 * el CLI (`valmen qa-close`) y otra por la herramienta MCP (`cerrar_qa`) para que las dos
 * fronteras no diverjan.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../packages/cli/src/main.js";
import { parseTicket, validateQa } from "../packages/core/src/index.js";
import { callTool, type ToolContext } from "../packages/mcp/src/tools.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-QASINCUBRIR-20261011";

let lab: string;
const paths = () => ({ root: lab, ticketsDir: "tickets" });
const ruta = () => join(lab, "tickets", "2026", ID, "ticket.md");
const leer = () => readFileSync(ruta(), "utf8");
const contexto = (): ToolContext => ({ paths: paths(), credentialsFile: undefined });

const APERTURA = {
  id: "QA-001",
  date: "2026-10-11",
  build_reference: `worktree:sha256:${"a".repeat(64)}`,
  environment: "local",
  result: "pending",
  findings: [],
  correction: null,
  po_confirmation: null,
};

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-qa-sin-cubrir-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  writeFixtureTicket(lab, { id: ID, workflowStatus: "in_qa", qaStatus: "in_qa" });
  writeFileSync(
    ruta(),
    leer()
      .replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: pasa en local.",
      )
      .replace(
        /## QA\n\n```json\n\[\]\n```/,
        `## QA\n\n\`\`\`json\n${JSON.stringify([APERTURA], null, 2)}\n\`\`\``,
      ),
    "utf8",
  );
});
afterEach(() => rmSync(lab, { recursive: true, force: true }));

/** Corre el CLI y devuelve su salida combinada y su código. */
async function cli(...args: string[]): Promise<{ codigo: number; texto: string }> {
  const trozos: string[] = [];
  const captura = (chunk: unknown): boolean => {
    trozos.push(String(chunk));
    return true;
  };
  const out = vi.spyOn(process.stdout, "write").mockImplementation(captura);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(captura);
  try {
    const codigo = await run(["--root", lab, ...args]);
    return { codigo, texto: trozos.join("") };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

/** La entrada de cierre del ciclo (la segunda del bloque QA). */
function cierre(): Record<string, unknown> {
  const qa = parseTicket(leer()).blocks.QA ?? [];
  return qa[1] as Record<string, unknown>;
}

type Declaracion = "lista" | "todo" | "ninguna" | "ambas" | "vacia";

interface Frontera {
  readonly nombre: string;
  readonly parametro: string;
  readonly cerrar: (declaracion: Declaracion) => Promise<{ ok: boolean; texto: string }>;
}

const LISTA = "Pago con tarjeta\n\n  Reporte Z  \n";

const CLI: Frontera = {
  nombre: "valmen qa-close",
  parametro: "--not-covered",
  cerrar: async (declaracion) => {
    const base = ["qa-close", "--id", ID, "--result", "changes_requested"];
    const extra = {
      lista: ["--not-covered", LISTA],
      todo: ["--all-covered"],
      ninguna: [],
      ambas: ["--not-covered", LISTA, "--all-covered"],
      vacia: ["--not-covered", " \n  \n"],
    }[declaracion];
    const r = await cli(...base, ...extra);
    return { ok: r.codigo === 0, texto: r.texto };
  },
};

const MCP: Frontera = {
  nombre: "cerrar_qa",
  parametro: "sin_cubrir",
  cerrar: async (declaracion) => {
    const base = { id: ID, resultado: "changes_requested" };
    const extra: Record<string, unknown> = {
      lista: { sin_cubrir: LISTA },
      todo: { todo_cubierto: true },
      ninguna: {},
      ambas: { sin_cubrir: LISTA, todo_cubierto: true },
      vacia: { sin_cubrir: " \n  \n" },
    }[declaracion];
    const r = await callTool(contexto(), "cerrar_qa", { ...base, ...extra });
    return { ok: !r.isError, texto: r.text };
  },
};

describe.each([CLI, MCP])("R-QAC-001: $nombre", (f) => {
  it("guarda cada línea no vacía como elemento de not_covered (C1, C2)", async () => {
    const r = await f.cerrar("lista");
    expect(r.ok, r.texto).toBe(true);
    expect(cierre()["not_covered"]).toEqual(["Pago con tarjeta", "Reporte Z"]);
  });

  it("la cobertura completa guarda una lista vacía (C3, C4)", async () => {
    const r = await f.cerrar("todo");
    expect(r.ok, r.texto).toBe(true);
    expect(cierre()["not_covered"]).toEqual([]);
  });

  it("sin declaración falla nombrando el parámetro y deja el ticket igual (C5, C6, C7)", async () => {
    const antes = leer();
    const r = await f.cerrar("ninguna");
    expect(r.ok).toBe(false);
    expect(r.texto).toContain(f.parametro);
    expect(leer()).toBe(antes);
  });

  it("lista junto con cobertura completa se rechaza (C8)", async () => {
    const antes = leer();
    const r = await f.cerrar("ambas");
    expect(r.ok).toBe(false);
    expect(leer()).toBe(antes);
  });

  it("una lista sin ningún elemento no vacío se rechaza (C9)", async () => {
    const antes = leer();
    const r = await f.cerrar("vacia");
    expect(r.ok).toBe(false);
    expect(r.texto).toContain(f.parametro);
    expect(leer()).toBe(antes);
  });
});

describe("R-QAC-002: validateQa", () => {
  const cierreBase = {
    id: "QA-002",
    date: "2026-10-11",
    build_reference: null,
    environment: null,
    result: "changes_requested",
    findings: [],
    correction: null,
    po_confirmation: null,
  };

  it("acepta una entrada de cierre sin not_covered (C10)", () => {
    expect(() => validateQa([APERTURA, cierreBase])).not.toThrow();
  });

  it("acepta not_covered como lista de textos, incluida la vacía", () => {
    expect(() => validateQa([APERTURA, { ...cierreBase, not_covered: [] }])).not.toThrow();
    expect(() =>
      validateQa([APERTURA, { ...cierreBase, not_covered: ["x"] }]),
    ).not.toThrow();
  });

  it.each([["texto"], [[1]], [[""]], [["  "]], [null]])(
    "rechaza not_covered que no es lista de textos no vacíos: %j (C11)",
    (valor) => {
      expect(() => validateQa([APERTURA, { ...cierreBase, not_covered: valor }])).toThrow();
    },
  );

  it("rechaza not_covered en la entrada que abre el ciclo (C12)", () => {
    expect(() => validateQa([{ ...APERTURA, not_covered: [] }, cierreBase])).toThrow();
  });
});

describe("regresión: la confirmación del PO sigue exigida", () => {
  it("valmen qa-close --result approved sin --po-confirmation sigue fallando (C14)", async () => {
    const r = await cli("qa-close", "--id", ID, "--result", "approved", "--all-covered");
    expect(r.codigo).not.toBe(0);
    expect(r.texto).toContain("confirmación explícita del PO");
  });

  it("cerrar_qa con approved sin confirmacion_po sigue fallando (C15)", async () => {
    const r = await callTool(contexto(), "cerrar_qa", {
      id: ID,
      resultado: "approved",
      todo_cubierto: true,
    });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("confirmación explícita del PO");
  });
});
