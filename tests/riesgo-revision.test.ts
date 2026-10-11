/**
 * El riesgo de la revisión del diff, calculado en código a partir de lo tocado y del ticket
 * (R-REV-002, FEATURE-ENGINE-RIESGO-REVISION-20261010).
 *
 * Un caso por criterio. El lector de git (`cambiosDelDiff`) se prueba sobre repositorios de verdad
 * —el renombre, el borrado y la ruta no ASCII son justo lo que `git diff --name-only` informa mal—,
 * y el cálculo (`riesgoDeRevision`) con los cambios en línea: es una función pura, sin modelo y sin
 * escritura. Las rutas «packages/core/src/permissions.ts» y «docs/» de los casos con git son las del
 * repositorio de prueba, no las de este.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import {
  cambiosDelDiff,
  riesgoDeRevision,
  rutaProhibidaParaQaAgente,
} from "../packages/engine/src/index.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const ID = "FEATURE-ENGINE-RIESGO-REVISION-20261010";
const OTRO_ID = "FEATURE-GATE-OTRO-20261010";
const PERMISOS = "packages/core/src/permissions.ts";

type Cambios = Parameters<typeof riesgoDeRevision>[0]["cambios"];

const ticketDe = (
  opciones: { type?: string; riskLevel?: string; impacts?: string[] } = {},
) =>
  parseTicket(
    renderFixtureTicket({
      id: ID,
      workflowStatus: "in_progress",
      type: opciones.type ?? "FEATURE",
      ...(opciones.riskLevel === undefined ? {} : { riskLevel: opciones.riskLevel }),
      ...(opciones.impacts === undefined ? {} : { impacts: opciones.impacts }),
    }),
  );

const modificados = (...rutas: string[]): Cambios =>
  rutas.map((ruta) => ({ estado: "M", ruta }));

function riesgo(
  cambios: Cambios,
  extra: {
    ticket?: ReturnType<typeof ticketDe>;
    scriptsDePrueba?: string[];
    subirA?: "bajo" | "medio" | "alto";
  } = {},
) {
  return riesgoDeRevision({
    ticket: extra.ticket ?? ticketDe(),
    cambios,
    ticketsDir: "tickets",
    ...extra,
  });
}

// ── Repositorios de verdad ────────────────────────────────────────────────────────────────────

const raices: string[] = [];
afterEach(() => {
  for (const raiz of raices.splice(0)) rmSync(raiz, { recursive: true, force: true });
});

function git(raiz: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { cwd: raiz, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} falló: ${r.stderr}`);
  return r.stdout.trim();
}

function escribir(raiz: string, archivos: Record<string, string>): void {
  for (const [ruta, texto] of Object.entries(archivos)) {
    mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
    writeFileSync(join(raiz, ruta), texto, "utf8");
  }
}

function confirmar(raiz: string, mensaje: string, accion: () => void): string {
  accion();
  git(raiz, "add", "-A");
  git(raiz, "commit", "-q", "-m", mensaje);
  return git(raiz, "rev-parse", "HEAD");
}

function repositorioConBase(archivos: Record<string, string>): {
  raiz: string;
  base: string;
} {
  const raiz = mkdtempSync(join(tmpdir(), "valmen-riesgo-"));
  raices.push(raiz);
  git(raiz, "init", "-q", "-b", "main");
  const base = confirmar(raiz, "base", () => escribir(raiz, archivos));
  return { raiz, base };
}

const lineas = (n: number, prefijo: string): string =>
  Array.from({ length: n }, (_, i) => `${prefijo} ${i}\n`).join("");

const BASE_PERMISOS = { [PERMISOS]: lineas(10, "permiso") };

/** Las dos líneas de «permissions.ts» que cambia el commit de C1 y C2. */
function dosLineasEnPermisos() {
  const { raiz, base } = repositorioConBase(BASE_PERMISOS);
  const destino = confirmar(raiz, "dos líneas", () =>
    escribir(raiz, {
      [PERMISOS]: lineas(10, "permiso")
        .replace("permiso 3", "otro 3")
        .replace("permiso 7", "otro 7"),
    }),
  );
  return cambiosDelDiff(raiz, base, destino);
}

/** El renombre de C17 y C18: «permissions.ts» pasa a «p.ts». */
function renombrePermisos() {
  const { raiz, base } = repositorioConBase(BASE_PERMISOS);
  const destino = confirmar(raiz, "renombre", () =>
    git(raiz, "mv", PERMISOS, "packages/core/src/p.ts"),
  );
  return { raiz, base, destino, cambios: cambiosDelDiff(raiz, base, destino) };
}

// ── C1 a C14: el cálculo por lo tocado ────────────────────────────────────────────────────────

describe("el riesgo por lo que toca el diff", () => {
  it("C1: dos líneas de packages/core/src/permissions.ts dan riesgo alto", () => {
    expect(riesgo(dosLineasEnPermisos()).nivel).toBe("alto");
  });

  it("C2: un motivo de ese riesgo es «packages/core/src/permissions.ts (autenticación)»", () => {
    expect(riesgo(dosLineasEnPermisos()).motivos).toContain(`${PERMISOS} (autenticación)`);
  });

  it("C3: mil líneas en archivos .md de docs/ dan riesgo bajo", () => {
    const { raiz, base } = repositorioConBase({
      "docs/a.md": "# a\n",
      "docs/b.md": "# b\n",
    });
    const destino = confirmar(raiz, "mil líneas", () =>
      escribir(raiz, {
        "docs/a.md": lineas(500, "texto a"),
        "docs/b.md": lineas(500, "texto b"),
      }),
    );
    const resultado = riesgo(cambiosDelDiff(raiz, base, destino));
    expect(resultado.nivel).toBe("bajo");
  });

  it("C4: un diff que solo modifica archivos de prueba da riesgo bajo", () => {
    expect(
      riesgo(modificados("tests/a.test.ts", "packages/engine/test/b.test.ts")).nivel,
    ).toBe("bajo");
  });

  it("C5: un diff que modifica packages/engine/src/drift.ts da riesgo medio", () => {
    expect(riesgo(modificados("packages/engine/src/drift.ts")).nivel).toBe("medio");
  });

  it("C6: un diff que solo modifica packages/server/web/index.html («pantallas», no crítica) da riesgo medio", () => {
    expect(riesgo(modificados("packages/server/web/index.html")).nivel).toBe("medio");
  });

  it("C7: un diff que modifica una migración da riesgo alto", () => {
    expect(riesgo(modificados("BackEnd/pos/migrations/0042_orden.py")).nivel).toBe("alto");
  });

  it("C8: un diff que modifica el Dockerfile da riesgo alto", () => {
    expect(riesgo(modificados("Dockerfile")).nivel).toBe("alto");
  });

  it("C9: un diff que modifica un flujo de CI da riesgo alto", () => {
    expect(riesgo(modificados(".github/workflows/ci.yml")).nivel).toBe("alto");
  });

  it("C10: un diff que modifica .valmen/config.yaml da riesgo alto", () => {
    expect(riesgo(modificados(".valmen/config.yaml")).nivel).toBe("alto");
  });

  it("C11: un diff que solo modifica .valmen/rules/estandares-proceso.md da riesgo alto", () => {
    expect(riesgo(modificados(".valmen/rules/estandares-proceso.md")).nivel).toBe("alto");
  });

  it("C12: frontend/src/auth/login.tsx, que casa con «pantallas» antes que con «autenticación», da riesgo alto", () => {
    expect(riesgo(modificados("frontend/src/auth/login.tsx")).nivel).toBe("alto");
  });

  it("C13: el ticket.md del propio ticket junto con su .valmen/receipts/<ID>.jsonl dan riesgo bajo", () => {
    const resultado = riesgo(
      modificados(`tickets/2026/${ID}/ticket.md`, `.valmen/receipts/${ID}.jsonl`),
    );
    expect(resultado.nivel).toBe("bajo");
  });

  it("C14: el archivo de recibos de otro ticket da riesgo alto", () => {
    expect(riesgo(modificados(`.valmen/receipts/${OTRO_ID}.jsonl`)).nivel).toBe("alto");
  });
});

// ── C15 a C17, C21 y C22: el lector de git sobre un repositorio de verdad ─────────────────────

describe("cambiosDelDiff sobre un repositorio de git", () => {
  it("C15: informa un archivo agregado con estado A", () => {
    const { raiz, base } = repositorioConBase({ "docs/viejo.md": "viejo\n" });
    const destino = confirmar(raiz, "agrega", () =>
      escribir(raiz, { "docs/nuevo.md": "nuevo\n" }),
    );
    expect(cambiosDelDiff(raiz, base, destino)).toEqual([
      { estado: "A", ruta: "docs/nuevo.md" },
    ]);
  });

  it("C16: informa un archivo borrado con estado D y su ruta anterior", () => {
    const { raiz, base } = repositorioConBase({
      "docs/viejo.md": "viejo\n",
      "docs/queda.md": "queda\n",
    });
    const destino = confirmar(raiz, "borra", () => rmSync(join(raiz, "docs/viejo.md")));
    expect(cambiosDelDiff(raiz, base, destino)).toEqual([
      { estado: "D", ruta: "docs/viejo.md" },
    ]);
  });

  it("C17: informa el renombre de permissions.ts a p.ts como D de la ruta vieja más A de la nueva", () => {
    const { cambios } = renombrePermisos();
    expect(cambios).toHaveLength(2);
    expect(cambios).toEqual(
      expect.arrayContaining([
        { estado: "D", ruta: PERMISOS },
        { estado: "A", ruta: "packages/core/src/p.ts" },
      ]),
    );
  });

  it("C21: informa docs/diseño.md sin comillas ni escapes", () => {
    const { raiz, base } = repositorioConBase({ "docs/viejo.md": "viejo\n" });
    const destino = confirmar(raiz, "agrega", () =>
      escribir(raiz, { "docs/diseño.md": "diseño\n" }),
    );
    expect(cambiosDelDiff(raiz, base, destino)).toEqual([
      { estado: "A", ruta: "docs/diseño.md" },
    ]);
  });

  it("C22: con la base igual al destino devuelve una lista vacía", () => {
    const { raiz, base } = repositorioConBase({ "docs/viejo.md": "viejo\n" });
    expect(cambiosDelDiff(raiz, base, base)).toEqual([]);
  });
});

// ── C18 a C20: borrados y renombres ───────────────────────────────────────────────────────────

describe("el riesgo de lo que se borra o se renombra", () => {
  it("C18: el renombre de permissions.ts a p.ts da riesgo alto", () => {
    expect(riesgo(renombrePermisos().cambios).nivel).toBe("alto");
  });

  it("C19: un diff que borra packages/core/src/permissions.ts da riesgo alto", () => {
    expect(riesgo([{ estado: "D", ruta: PERMISOS }]).nivel).toBe("alto");
  });

  it("C20: un diff que solo borra un archivo de prueba da riesgo medio", () => {
    expect(riesgo([{ estado: "D", ruta: "tests/a.test.ts" }]).nivel).toBe("medio");
  });
});

// ── C23 a C29: el ticket, la subida a mano y los scripts de prueba ────────────────────────────

describe("el riesgo por el ticket y por lo que pide una persona", () => {
  it("C23: un diff vacío en un ticket sin factores de riesgo da riesgo bajo", () => {
    const resultado = riesgo([]);
    expect(resultado.nivel).toBe("bajo");
    expect(resultado.motivos).toContain("el diff no toca archivos");
  });

  it("C24: un ticket SECURITY con un diff de solo documentación da riesgo alto", () => {
    expect(
      riesgo(modificados("docs/a.md"), { ticket: ticketDe({ type: "SECURITY" }) }).nivel,
    ).toBe("alto");
  });

  it.each(["sync_impact", "migration_impact", "docker_impact"])(
    "C25: un ticket que declara %s da riesgo alto con un diff de solo documentación",
    (impacto) => {
      expect(
        riesgo(modificados("docs/a.md"), { ticket: ticketDe({ impacts: [impacto] }) })
          .nivel,
      ).toBe("alto");
    },
  );

  it.each(["high", "critical"])(
    "C26: un ticket con risk_level %s da riesgo alto con un diff de solo documentación",
    (nivel) => {
      expect(
        riesgo(modificados("docs/a.md"), { ticket: ticketDe({ riskLevel: nivel }) }).nivel,
      ).toBe("alto");
    },
  );

  it("C27: pedir subirA «alto» sobre un diff de solo documentación da riesgo alto", () => {
    expect(riesgo(modificados("docs/a.md"), { subirA: "alto" }).nivel).toBe("alto");
  });

  it("C28: pedir subirA «bajo» sobre un diff que toca autenticación deja el riesgo en alto y lo dice", () => {
    const resultado = riesgo(modificados(PERMISOS), { subirA: "bajo" });
    expect(resultado.nivel).toBe("alto");
    expect(resultado.motivos.some((motivo) => motivo.includes("subirA"))).toBe(true);
  });

  it("C29: un script de tests/ que figura en scriptsDePrueba da riesgo medio", () => {
    const script = "tests/correr-pruebas.sh";
    expect(riesgo(modificados(script), { scriptsDePrueba: [script] }).nivel).toBe("medio");
    // Sin figurar en test-commands es un archivo de prueba más: la diferencia la hace el comando.
    expect(riesgo(modificados(script)).nivel).toBe("bajo");
  });
});

// ── Regresión: lo que la elegibilidad de QA por agente ya decidía no cambia ───────────────────

describe("regresión: rutaProhibidaParaQaAgente conserva sus categorías, su orden y sus nombres", () => {
  const casos: [string, string | null][] = [
    ["frontend/src/auth/login.tsx", "pantallas"],
    ["templates/orden.html", "pantallas"],
    ["BackEnd/pos/migrations/0042_orden.py", "migraciones"],
    ["Dockerfile", "configuración de despliegue"],
    ["BackEnd/core/permissions.py", "autenticación"],
    [".github/workflows/ci.yml", "CI"],
    [
      ".valmen/rules/estandares-proceso.md",
      "el registro y la configuración del harness (.valmen/)",
    ],
    ["docs/nota.md", null],
    ["packages/engine/src/drift.ts", null],
  ];
  it.each(casos)("%s → %s", (ruta, categoria) => {
    expect(rutaProhibidaParaQaAgente(ruta)).toBe(categoria);
  });

  it("un script de test-commands sigue ganando a las categorías", () => {
    expect(rutaProhibidaParaQaAgente("./tests/correr.sh", ["tests/correr.sh"])).toBe(
      "los scripts que corren las pruebas",
    );
  });
});
