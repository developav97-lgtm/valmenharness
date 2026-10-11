/**
 * La compuerta `code-review`: la revisión del diff con profundidad por riesgo, un recibo atado al
 * árbol revisado y una sola corrección (R-REV-003, R-REV-004 y R-REV-005,
 * FEATURE-GATE-CODE-REVIEW-20261010).
 *
 * Lo que se afirma es lo observable: cuántos revisores se llaman y con qué entrada, qué veredicto
 * deja el código con lo que ellos responden, qué guarda el recibo y qué pasa en la segunda ronda.
 * Los laboratorios son repositorios git de verdad, con base `main`, y los revisores son falsos
 * inyectados por `reviewDiff`: ninguna prueba llama a un modelo real ni usa una clave. La clave
 * `code-review: exigida` no existe en ningún laboratorio: la compuerta se corre a mano.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_INVARIANT, EXIT_SCHEMA, parseTicket } from "../packages/core/src/index.js";
import { COMANDOS } from "../packages/cli/src/command-table.js";
import { run } from "../packages/cli/src/index.js";
import { ROLES } from "../packages/adapter/src/index.js";
import { TOPE_DE_ENTRADA } from "../packages/engine/src/code-review.js";
import { simulateGate } from "../packages/engine/src/simulate.js";
import { type GateRunOptions, runGate } from "../packages/engine/src/gate.js";
import {
  calcularArbolProbado,
  motivoDeArbolNoVigente,
} from "../packages/engine/src/arbol-probado.js";
import { appendReceipt, readReceipts } from "../packages/engine/src/receipts.js";
import { transition } from "../packages/engine/src/transition.js";
import {
  type GateReceipt,
  GATES,
  gateById,
  withHumanDecision,
} from "../packages/gate/src/index.js";
import {
  type RespuestaDeDiff,
  type ReviewDiffEvaluation,
  type ReviewDiffOptions,
  reviewDiffWithModel,
} from "../packages/gate-llm-judge/src/index.js";
import { TOOLS, callTool } from "../packages/mcp/src/tools.js";
import {
  listGateCards,
  listGateDecisions,
  runTicketGate,
} from "../packages/server/src/gates.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

// El gancho que corre justo después de calcular el árbol de trabajo: es la única forma de editar un
// archivo entre el primer cálculo y el segundo sin un temporizador. Sin gancho no cambia nada.
const ganchos = vi.hoisted(() => ({ alTomarElArbol: null as null | (() => void) }));
vi.mock("../packages/engine/src/arbol-probado.js", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../packages/engine/src/arbol-probado.js")>();
  return {
    ...real,
    calcularArbolProbado: (...argumentos: Parameters<typeof real.calcularArbolProbado>) => {
      const arbol = real.calcularArbolProbado(...argumentos);
      const gancho = ganchos.alTomarElArbol;
      ganchos.alTomarElArbol = null;
      gancho?.();
      return arbol;
    },
  };
});

const ID = "FEATURE-GATE-REVISION-LAB-20261010";
const PASA = 'node -e "process.exit(0)"';

let lab: string;
const PATHS = () => ({ root: lab, ticketsDir: "tickets" });

// ── El laboratorio ───────────────────────────────────────────────────────────────────────────

function git(...argumentos: string[]): string {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.email=prueba@valmen.local",
      "-c",
      "user.name=Prueba Valmen",
      "-c",
      "commit.gpgsign=false",
      ...argumentos,
    ],
    { cwd: lab, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${argumentos.join(" ")} falló: ${r.stderr}`);
  return r.stdout.trim();
}

function escribir(ruta: string, contenido: string | Buffer): void {
  mkdirSync(dirname(join(lab, ruta)), { recursive: true });
  writeFileSync(join(lab, ruta), contenido);
}

function leer(ruta: string): string {
  return readFileSync(join(lab, ruta), "utf8");
}

/** Un archivo de `n` líneas numeradas, una función por línea. */
function lineas(prefijo: string, n: number): string {
  return `${Array.from({ length: n }, (_, i) => `export const ${prefijo}${i + 1} = () => ${i + 1};`).join("\n")}\n`;
}

/** Cambia una línea (contando desde 1) de un archivo del laboratorio. */
function cambiarLinea(ruta: string, numero: number, nueva: string): void {
  const todas = leer(ruta).split("\n");
  todas[numero - 1] = nueva;
  escribir(ruta, todas.join("\n"));
}

function commitear(mensaje: string): void {
  git("add", "-A");
  git("commit", "-qm", mensaje);
}

interface OpcionesDelLaboratorio {
  readonly type?: string;
  readonly riskLevel?: string;
  /** El contenido de `.valmen/routing.yaml`, escrito antes del commit de la base. */
  readonly routing?: string;
  /** Archivos más de la base, por ruta. */
  readonly base?: Readonly<Record<string, string | Buffer>>;
}

/** Un ticket en `in_progress` en un repositorio con la rama `main` como base y `trabajo` checked out. */
function armar(opciones: OpcionesDelLaboratorio = {}): void {
  git("init", "-q", "-b", "main");
  escribir(".valmen/config.yaml", "name: Laboratorio\ntest-commands:\n  - node\n");
  if (opciones.routing !== undefined) escribir(".valmen/routing.yaml", opciones.routing);
  escribir("src/app.ts", lineas("f", 60));
  escribir("src/otro.ts", lineas("g", 30));
  escribir("packages/gate/src/decide.ts", lineas("d", 20));
  escribir("BackEnd/pos/migrations/0001_inicial.py", "# migración inicial\n");
  for (const [ruta, contenido] of Object.entries(opciones.base ?? {}))
    escribir(ruta, contenido);
  writeFixtureTicket(lab, {
    id: ID,
    workflowStatus: "in_progress",
    type: opciones.type ?? "FEATURE",
    module: "GATE",
    ...(opciones.riskLevel === undefined ? {} : { riskLevel: opciones.riskLevel }),
    criterios: `- [ ] La suma funciona.\n      <!-- test: ${PASA} -->`,
    pruebas: `- Comando: \`${PASA}\`, directorio: la raíz del laboratorio.\n- Resultado esperado: sale con 0.`,
  });
  commitear("base");
  git("checkout", "-q", "-b", "trabajo");
}

/** El cambio de riesgo medio de siempre: una línea de `src/app.ts`. */
const tocarApp = (): void =>
  cambiarLinea("src/app.ts", 50, "export const f50 = () => 5000;");
const tocarOtro = (): void =>
  cambiarLinea("src/otro.ts", 10, "export const g10 = () => 1000;");

/** Un cambio de riesgo bajo: solo una prueba nueva. */
const soloUnaPrueba = (): void =>
  escribir("tests/nuevo.test.ts", "export const prueba = true;\n");

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-code-review-"));
});

afterEach(() => {
  ganchos.alTomarElArbol = null;
  rmSync(lab, { recursive: true, force: true });
});

// ── Los revisores falsos ────────────────────────────────────────────────────────────────────

/** Lo que el revisor falso vio en una llamada. */
interface LlamadaDeRevisor {
  readonly entrada: string;
  readonly proposiciones: readonly string[];
  readonly provider: string;
  readonly model: string;
}

type Guion = (
  llamada: LlamadaDeRevisor,
  indice: number,
) => Readonly<Record<string, Partial<RespuestaDeDiff>>>;

const NADA: Guion = () => ({});

/**
 * Un revisor falso: cuenta las llamadas, guarda lo que vio y responde según el guion; sin guion,
 * cada proposición se cumple con confianza alta. Con `simultaneos`, cada llamada espera a que
 * lleguen todas: si la compuerta las hiciera una tras otra, la primera nunca se liberaría.
 */
function revisorFalso(
  guion: Guion = NADA,
  opciones: {
    readonly costo?: number;
    readonly simultaneos?: number;
    readonly alVer?: () => void;
  } = {},
): {
  readonly llamadas: LlamadaDeRevisor[];
  readonly revisor: NonNullable<GateRunOptions["reviewDiff"]>;
} {
  const llamadas: LlamadaDeRevisor[] = [];
  let llegadas = 0;
  let liberar: () => void = () => undefined;
  const todos = new Promise<void>((resolver) => {
    liberar = resolver;
  });

  const revisor = async (options: ReviewDiffOptions): Promise<ReviewDiffEvaluation> => {
    const indice = llegadas;
    const llamada: LlamadaDeRevisor = {
      entrada: options.entrada,
      proposiciones: options.proposiciones.map((p) => p.id),
      provider: options.provider,
      model: options.model,
    };
    llamadas.push(llamada);
    llegadas += 1;
    if (opciones.simultaneos !== undefined) {
      if (llegadas >= opciones.simultaneos) liberar();
      await Promise.race([
        todos,
        new Promise<never>((_, rechazar) =>
          setTimeout(
            () => rechazar(new Error("los revisores no corrieron a la vez")),
            1500,
          ),
        ),
      ]);
    }
    opciones.alVer?.();
    const guionado = guion(llamada, indice);
    return {
      respuestas: options.proposiciones.map((p) => ({
        proposicion: p.id,
        cumple: true,
        confianza: 0.95,
        motivo: "Sin hallazgo severo.",
        hallazgos: [],
        ...guionado[p.id],
      })),
      model: {
        provider: "revisor-falso",
        model: "falso-1",
        resolvedVersion: "falso-1-20261010",
      },
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: opciones.costo ?? 0.01 },
      latencyMs: 7,
    };
  };
  return { llamadas, revisor };
}

/** Una respuesta que no cumple, con un hallazgo citado. */
function hallazgo(
  ruta: string,
  linea: number,
  motivo = "El cambio rompe a su consumidor.",
): Partial<RespuestaDeDiff> {
  return {
    cumple: false,
    confianza: 0.95,
    motivo: "Hay un defecto severo.",
    hallazgos: [{ ruta, linea, motivo }],
  };
}

/** Un guion que no cumple `sin_hallazgo_severo` citando `ruta:línea`. */
const bloqueaEn =
  (ruta: string, linea: number): Guion =>
  () => ({ sin_hallazgo_severo: hallazgo(ruta, linea) });

// ── Correr la compuerta ─────────────────────────────────────────────────────────────────────

const correr = (opciones: Partial<GateRunOptions> = {}) =>
  runGate(PATHS(), { gateId: "code-review", ticketId: ID, ...opciones });

/** Los recibos de `code-review`, en orden de escritura, con la decisión humana colapsada. */
function recibos(): GateReceipt[] {
  const porId = new Map<string, GateReceipt>();
  for (const recibo of readReceipts(PATHS(), ID)) {
    if (recibo.gate === "code-review") porId.set(recibo.id, recibo);
  }
  return [...porId.values()];
}

function ultimoRecibo(): GateReceipt {
  const todos = recibos();
  const ultimo = todos[todos.length - 1];
  if (ultimo === undefined)
    throw new Error("el laboratorio no tiene recibo de code-review");
  return ultimo;
}

function revision(recibo: GateReceipt): NonNullable<GateReceipt["codeReview"]> {
  if (recibo.codeReview === undefined)
    throw new Error(`el recibo ${recibo.id} no guarda codeReview`);
  return recibo.codeReview;
}

// ── C1 a C4: riesgo bajo y comprobaciones estructurales ────────────────────────────────────

describe("R-REV-003: el riesgo bajo y lo que decide el código sin modelo", () => {
  beforeEach(() => armar());

  it("C1: un diff que solo toca pruebas aprueba sin llamar a ningún revisor", async () => {
    soloUnaPrueba();
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(llamadas).toHaveLength(0);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("approve");
    expect(recibo.evaluator).toBe("command");
    expect(revision(recibo).riesgo.nivel).toBe("bajo");
    expect(revision(recibo).profundidad).toBe("sin-revisores");
    expect(revision(recibo).revisores).toEqual([]);
  });

  it("C2: un secreto en una línea agregada bloquea sin llamar a ningún revisor y sin repetir su valor", async () => {
    // El valor se arma en la prueba: un literal con su forma sería un hallazgo de `valmen secrets`.
    const token = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
    cambiarLinea("src/app.ts", 50, `export const token = "${token}";`);
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(llamadas).toHaveLength(0);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("block");
    expect(recibo.mechanicalChecks.find((c) => c.id === "sin_secretos")?.result).toBe(
      "fail",
    );
    expect(recibo.reason).toContain("src/app.ts:50");
    expect(JSON.stringify(recibo)).not.toContain(token);
    expect(r.stdout).not.toContain(token);
  });

  it("C3: un archivo que rechaza motivoDeArchivoProhibido deja la compuerta en review sin llamar a ningún revisor", async () => {
    escribir("claves/servidor.pem", "contenido de prueba\n");
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(llamadas).toHaveLength(0);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(recibo.escalatedTo).toBe("human");
    expect(recibo.reason).toContain("claves/servidor.pem");
    expect(
      recibo.mechanicalChecks.find((c) => c.id === "sin_archivos_prohibidos")?.result,
    ).toBe("warn");
  });

  it("C4: un color fijo agregado en un archivo de interfaz queda como nota sin cambiar el veredicto", async () => {
    escribir("web/estilo.css", ".boton {\n  color: #ff0000;\n}\n");
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(llamadas).toHaveLength(1);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("approve");
    expect(recibo.mechanicalChecks.find((c) => c.id === "colores_fijos")?.result).toBe(
      "warn",
    );
    expect((recibo.notes ?? []).join("\n")).toContain("web/estilo.css");
  });

  it("un diff vacío no se aprueba por vacuidad: queda en review sin llamar a ningún revisor", async () => {
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(llamadas).toHaveLength(0);
    expect(ultimoRecibo().outcome).toBe("review");
    expect(ultimoRecibo().reason).toMatch(/no cambia ningún archivo/);
  });

  it("una credencial que ya estaba, fuera de las líneas agregadas, impide enviar la entrada y deja review", async () => {
    const token = ["gh", "p_", "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2"].join("");
    armarOtro({ "src/legado.ts": `export const token = "${token}";\n${lineas("h", 20)}` });
    cambiarLinea("src/legado.ts", 3, "export const h2 = () => 2000;");
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(llamadas).toHaveLength(0);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(recibo.reason).toMatch(/credencial/);
    expect(JSON.stringify(recibo)).not.toContain(token);
  });
});

/** Rehace el laboratorio con más archivos en la base (para los casos que los necesitan). */
function armarOtro(
  base: Readonly<Record<string, string | Buffer>>,
  opciones: OpcionesDelLaboratorio = {},
): void {
  rmSync(lab, { recursive: true, force: true });
  lab = mkdtempSync(join(tmpdir(), "valmen-code-review-"));
  armar({ ...opciones, base });
}

// ── C5 a C8: la profundidad por riesgo ──────────────────────────────────────────────────────

const LENTES = [
  "sin_hallazgo_severo_riesgo",
  "sin_hallazgo_severo_resiliencia",
  "sin_hallazgo_severo_legibilidad",
  "sin_hallazgo_severo_fiabilidad",
];

describe("R-REV-003: la profundidad la decide el riesgo", () => {
  it("C5: con riesgo medio llama una sola vez al revisor con la proposición sin_hallazgo_severo", async () => {
    armar();
    tocarApp();
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.proposiciones).toEqual(["sin_hallazgo_severo"]);
    const recibo = ultimoRecibo();
    expect(revision(recibo).riesgo.nivel).toBe("medio");
    expect(revision(recibo).profundidad).toBe("un-revisor");
    // Las cuatro lentes no se usaron, y el recibo dice por qué.
    expect((recibo.notApplicable ?? []).map((n) => n.id).sort()).toEqual(
      [...LENTES].sort(),
    );
    expect(recibo.evaluator).toBe("llm-judge");
  });

  it("C6: con riesgo alto llama una sola vez al revisor con las cuatro proposiciones de lente", async () => {
    armar();
    escribir("BackEnd/pos/migrations/0002_agrega_columna.py", "# agrega una columna\n");
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.proposiciones).toEqual(LENTES);
    const recibo = ultimoRecibo();
    expect(revision(recibo).riesgo.nivel).toBe("alto");
    expect(revision(recibo).profundidad).toBe("un-revisor-cuatro-lentes");
    expect((recibo.notApplicable ?? []).map((n) => n.id)).toEqual(["sin_hallazgo_severo"]);
  });

  it("C7: en un ticket SECURITY llama a dos revisores a la vez con la misma entrada congelada", async () => {
    armar({ type: "SECURITY" });
    tocarApp();
    const { llamadas, revisor } = revisorFalso(NADA, { simultaneos: 2 });

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0]?.entrada).toBe(llamadas[1]?.entrada);
    expect(llamadas[0]?.proposiciones).toEqual(LENTES);
    expect(llamadas[1]?.proposiciones).toEqual(LENTES);
    const recibo = ultimoRecibo();
    expect(revision(recibo).profundidad).toBe("dos-revisores");
    expect(revision(recibo).revisores).toHaveLength(2);
    expect(revision(recibo).riesgo.nivel).toBe("alto");
  });

  it("C8: en un ticket SECURITY ninguno de los dos revisores recibe la respuesta del otro", async () => {
    armar({ type: "SECURITY" });
    tocarApp();
    const { llamadas, revisor } = revisorFalso(
      (_, indice) => ({
        sin_hallazgo_severo_riesgo: {
          motivo: indice === 0 ? "MOTIVO-DEL-REVISOR-A-9f1" : "MOTIVO-DEL-REVISOR-B-4c7",
        },
      }),
      { simultaneos: 2 },
    );

    await correr({ reviewDiff: revisor });

    expect(llamadas).toHaveLength(2);
    for (const llamada of llamadas)
      expect(llamada.entrada).not.toContain("MOTIVO-DEL-REVISOR");
    const motivos = revision(ultimoRecibo()).revisores.map(
      (r) =>
        r.respuestas.find((x) => x.proposicion === "sin_hallazgo_severo_riesgo")?.motivo,
    );
    expect(motivos).toEqual(["MOTIVO-DEL-REVISOR-A-9f1", "MOTIVO-DEL-REVISOR-B-4c7"]);
  });
});

// ── C9 a C12: lo que decide el código con lo que responden ──────────────────────────────────

describe("R-REV-003: un hallazgo cuenta solo si cae en una línea que el cambio agrega o modifica", () => {
  beforeEach(() => armar());

  it("C9: un hallazgo severo citado dentro de las líneas cambiadas bloquea la compuerta", async () => {
    tocarApp();
    const { llamadas, revisor } = revisorFalso(bloqueaEn("src/app.ts", 50));

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(llamadas).toHaveLength(1);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("block");
    expect(
      recibo.propositions.find((p) => p.id === "sin_hallazgo_severo")?.effect?.outcome,
    ).toBe("block");
    const respuesta = revision(recibo).revisores[0]?.respuestas[0];
    expect(respuesta?.hallazgos).toEqual([
      {
        ruta: "src/app.ts",
        linea: 50,
        motivo: "El cambio rompe a su consumidor.",
        verificado: true,
      },
    ]);
  });

  it("C10: un hallazgo citado fuera de las líneas cambiadas deja su proposición en banda de revisión", async () => {
    tocarApp();
    const { revisor } = revisorFalso(bloqueaEn("src/app.ts", 3));

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(recibo.escalatedTo).toBe("human");
    const proposicion = recibo.propositions.find((p) => p.id === "sin_hallazgo_severo");
    expect(proposicion?.inBand).toBe(true);
    expect(proposicion?.value).toBe(0.5);
    expect(revision(recibo).revisores[0]?.respuestas[0]?.hallazgos[0]?.verificado).toBe(
      false,
    );
  });

  it("un hallazgo en un archivo que el diff no toca tampoco cuenta", async () => {
    tocarApp();
    const { revisor } = revisorFalso(bloqueaEn("src/otro.ts", 10));

    await correr({ reviewDiff: revisor });

    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(revision(recibo).revisores[0]?.respuestas[0]?.hallazgos[0]?.verificado).toBe(
      false,
    );
  });

  it("una línea de contexto del parche no es una línea cambiada", async () => {
    tocarApp();
    // La línea 51 está a un renglón del cambio: sale como contexto del parche, no como cambiada.
    const { revisor } = revisorFalso(bloqueaEn("src/app.ts", 51));

    await correr({ reviewDiff: revisor });

    expect(ultimoRecibo().outcome).toBe("review");
  });

  it("un borrado se cita en la línea del corte", async () => {
    const todas = leer("src/app.ts").split("\n");
    todas.splice(29, 1); // borra la línea 30
    escribir("src/app.ts", todas.join("\n"));
    const { revisor } = revisorFalso(bloqueaEn("src/app.ts", 30));

    await correr({ reviewDiff: revisor });

    expect(ultimoRecibo().outcome).toBe("block");
  });

  it("una confianza baja en un hallazgo verificado no bloquea: queda en banda", async () => {
    tocarApp();
    const { revisor } = revisorFalso(() => ({
      sin_hallazgo_severo: { ...hallazgo("src/app.ts", 50), confianza: 0.5 },
    }));

    await correr({ reviewDiff: revisor });

    expect(ultimoRecibo().outcome).toBe("review");
  });
});

describe("R-REV-003: en un ticket SECURITY el hallazgo lo confirman los dos o no bloquea", () => {
  beforeEach(() => {
    armar({ type: "SECURITY" });
    // Tres líneas seguidas cambiadas: los dos revisores pueden citar renglones distintos del mismo tramo.
    tocarApp();
    cambiarLinea("src/app.ts", 51, "export const f51 = () => 5100;");
    cambiarLinea("src/app.ts", 52, "export const f52 = () => 5200;");
  });

  const lente = (...hallazgos: [string, number][]): Guion => {
    return (_, indice) => {
      const [ruta, linea] = hallazgos[indice] ?? ["", 0];
      return indice < hallazgos.length && ruta !== ""
        ? { sin_hallazgo_severo_riesgo: hallazgo(ruta, linea) }
        : {};
    };
  };

  it("C11: un hallazgo que confirman los dos revisores, a tres líneas o menos, bloquea la compuerta", async () => {
    const { revisor } = revisorFalso(lente(["src/app.ts", 50], ["src/app.ts", 52]));

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(ultimoRecibo().outcome).toBe("block");
  });

  it("C12: un hallazgo que informa un solo revisor deja la compuerta en review", async () => {
    const { revisor } = revisorFalso(lente(["src/app.ts", 50]));

    await correr({ reviewDiff: revisor });

    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(recibo.escalatedTo).toBe("human");
  });

  it("dos hallazgos en la misma ruta a más de tres líneas no se confirman entre sí", async () => {
    cambiarLinea("src/app.ts", 20, "export const f20 = () => 2000;");
    const { revisor } = revisorFalso(lente(["src/app.ts", 20], ["src/app.ts", 50]));

    await correr({ reviewDiff: revisor });

    expect(ultimoRecibo().outcome).toBe("review");
  });

  it("si ninguno informa un hallazgo, decide el menor de los dos valores", async () => {
    const { revisor } = revisorFalso(() => ({}));

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(ultimoRecibo().outcome).toBe("approve");
  });
});

// ── C13 y C14: lo que no es una respuesta y lo que no se puede pedir ────────────────────────

describe("R-REV-003: lo que sale del esquema no aprueba y el evaluador no se elige", () => {
  beforeEach(() => {
    armar();
    tocarApp();
  });

  it("C13: una respuesta del revisor fuera del esquema no deja ningún recibo approve ni consume ronda", async () => {
    const prosa = async (opciones: ReviewDiffOptions) =>
      reviewDiffWithModel({
        ...opciones,
        // Por la red simulada y no por el CLI de Claude, sea cual sea el proveedor del rol.
        provider: "openrouter",
        apiKey: "k",
        fetchImpl: (async () =>
          new Response(
            JSON.stringify({
              model: "falso",
              choices: [{ message: { content: "Aprobado: el cambio está bien." } }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }),
            { status: 200 },
          )) as unknown as typeof fetch,
      });

    const r = await correr({ reviewDiff: prosa });

    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).not.toMatch(/APPROVE/);
    expect(r.stderr).toMatch(/revisor|esquema|respuesta/i);
    expect(recibos()).toHaveLength(0);

    // No consumió una ronda: la siguiente corrida vuelve a ser la primera.
    const { revisor } = revisorFalso();
    await correr({ reviewDiff: revisor });
    expect(revision(ultimoRecibo()).ronda).toBe(1);
  });

  it("C14: con --evaluator se rechaza sin llamar a ningún revisor ni escribir recibo", async () => {
    const { llamadas, revisor } = revisorFalso();

    for (const evaluator of ["command", "llm-judge", "cascade"] as const) {
      const r = await correr({ reviewDiff: revisor, evaluator });
      expect(r.exitCode).toBe(EXIT_SCHEMA);
      expect(r.stderr).toMatch(/--evaluator/);
    }

    expect(llamadas).toHaveLength(0);
    expect(recibos()).toHaveLength(0);
  });
});

// ── C15 y C16: la propia compuerta y el tope de la entrada ─────────────────────────────────

describe("R-REV-003: la compuerta no amplía su propia autoridad ni gasta sin tope", () => {
  it("C15: un diff que toca un archivo de la propia compuerta deja como máximo un recibo review", async () => {
    armar();
    cambiarLinea("packages/gate/src/decide.ts", 5, "export const d5 = () => 5000;");
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    // El revisor aprueba, y aun así la compuerta que cambió el propio diff no lo da por bueno.
    expect(llamadas).toHaveLength(1);
    expect(r.exitCode).toBe(EXIT_INVARIANT);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(recibo.reason).toMatch(/propia compuerta/);
    expect(revision(recibo).propiaCompuerta).toEqual(["packages/gate/src/decide.ts"]);
  });

  it("C16: un diff mayor que el tope de entrada deja la compuerta en review sin llamar a ningún revisor", async () => {
    armar();
    escribir("src/enorme.ts", lineas("e", Math.ceil(TOPE_DE_ENTRADA / 20)));
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(llamadas).toHaveLength(0);
    const recibo = ultimoRecibo();
    expect(recibo.outcome).toBe("review");
    expect(recibo.reason).toMatch(/tope/);
  });

  it("si el parche cabe y los archivos completos no, se envía solo el parche", async () => {
    armarOtro({ "src/grande1.ts": lineas("p", 3800), "src/grande2.ts": lineas("q", 3800) });
    cambiarLinea("src/grande1.ts", 100, "export const p100 = () => 7;");
    cambiarLinea("src/grande2.ts", 100, "export const q100 = () => 7;");
    const { llamadas, revisor } = revisorFalso();

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(0);
    expect(llamadas).toHaveLength(1);
    const entrada = revision(ultimoRecibo()).entrada;
    expect(entrada.soloParche).toBe(true);
    expect(entrada.bytes).toBeLessThanOrEqual(TOPE_DE_ENTRADA);
    // El parche trae lo cambiado; de los archivos completos no viaja una línea lejana.
    expect(llamadas[0]?.entrada).toContain("export const p100 = () => 7;");
    expect(llamadas[0]?.entrada).not.toContain("export const p3000 = ");
  });
});

// ── Lo que ve cada revisor ──────────────────────────────────────────────────────────────────

describe("R-REV-003: el revisor ve solo la entrada congelada", () => {
  beforeEach(() => armar());

  it("trae el contexto del ticket, el parche y los archivos completos, sin el registro del propio ticket", async () => {
    tocarApp();
    escribir("src/nuevo.ts", "export const nuevo = 1;\n");
    escribir("assets/logo.bin", Buffer.from([0, 1, 2, 3, 0, 255, 0, 7]));
    // El registro del ticket cambia mientras se trabaja y no es parte del cambio.
    writeFileSync(
      join(lab, "tickets", "2026", ID, "ticket.md"),
      `${readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8")}\nNota de la implementación.\n`,
    );
    const { llamadas, revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    const entrada = llamadas[0]?.entrada ?? "";
    expect(entrada).toContain(ID);
    // El contexto del ticket está, marcado como contexto y no como evidencia.
    expect(entrada).toContain("Descripción funcional");
    expect(entrada).toMatch(/contexto/i);
    expect(entrada).toContain("export const f50 = () => 5000;");
    // El archivo nuevo sin versionar entra como alta completa.
    expect(entrada).toContain("src/nuevo.ts");
    expect(entrada).toContain("export const nuevo = 1;");
    // El archivo completo después del cambio, con su línea lejana.
    expect(entrada).toContain("export const f3 = () => 3;");
    // De un binario, solo el nombre.
    expect(entrada).toContain("assets/logo.bin");
    expect(entrada).toMatch(/binario/i);
    // El registro del propio ticket no viaja.
    expect(entrada).not.toContain("Nota de la implementación");
    expect(entrada).not.toContain(".valmen/receipts");
    const archivos = revision(ultimoRecibo()).entrada.archivos.map((a) => a.ruta);
    expect(archivos).toEqual(["assets/logo.bin", "src/app.ts", "src/nuevo.ts"]);
  });

  it("el diff cubre lo commiteado desde la base y lo que falta por commitear", async () => {
    tocarApp();
    commitear("primer cambio");
    tocarOtro();
    const { llamadas, revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    const entrada = llamadas[0]?.entrada ?? "";
    expect(entrada).toContain("export const f50 = () => 5000;");
    expect(entrada).toContain("export const g10 = () => 1000;");
    expect(revision(ultimoRecibo()).entrada.archivos.map((a) => a.ruta)).toEqual([
      "src/app.ts",
      "src/otro.ts",
    ]);
  });

  it("sin la rama main la base es HEAD y solo cuenta lo que falta por commitear", async () => {
    tocarApp();
    commitear("primer cambio");
    git("branch", "-m", "main", "principal");
    tocarOtro();
    const { llamadas, revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    const recibo = revision(ultimoRecibo());
    expect(recibo.base.ref).toBe("HEAD");
    expect(recibo.entrada.archivos.map((a) => a.ruta)).toEqual(["src/otro.ts"]);
    expect(llamadas[0]?.entrada).not.toContain("export const f50 = () => 5000;");
  });

  it("una base que no existe se rechaza sin llamar a nadie ni escribir recibo", async () => {
    tocarApp();
    const { llamadas, revisor } = revisorFalso();

    for (const base of ["no-existe", "--output=/tmp/x"]) {
      const r = await correr({ reviewDiff: revisor, base });
      expect(r.exitCode).toBe(EXIT_INVARIANT);
      expect(r.stderr).toMatch(/base/i);
    }

    expect(llamadas).toHaveLength(0);
    expect(recibos()).toHaveLength(0);
  });
});

// ── C17 a C23: el recibo atado al árbol revisado ────────────────────────────────────────────

describe("R-REV-004: el recibo queda atado al árbol revisado y caduca si cambia", () => {
  beforeEach(() => {
    armar();
    tocarApp();
  });

  it("C17: guarda la base resuelta como commit", async () => {
    commitear("trabajo adelantado");
    tocarOtro();
    const { revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    const base = revision(ultimoRecibo()).base;
    expect(base.ref).toBe("main");
    expect(base.commit).toBe(git("rev-parse", "main"));
    expect(base.commit).not.toBe(git("rev-parse", "HEAD"));
  });

  it("C18: guarda en testedTree el árbol revisado", async () => {
    const { revisor } = revisorFalso();
    const antes = calcularArbolProbado(PATHS());

    await correr({ reviewDiff: revisor });

    const recibo = ultimoRecibo();
    expect(recibo.testedTree).toBeDefined();
    expect(recibo.testedTree?.hash).toBe(antes?.registro.hash);
    expect(recibo.testedTree?.files).toBe(antes?.registro.files);
  });

  it("C19: guarda el nivel de riesgo calculado con sus motivos", async () => {
    const { revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    const riesgo = revision(ultimoRecibo()).riesgo;
    expect(riesgo.nivel).toBe("medio");
    expect(riesgo.motivos.join("\n")).toContain("src/app.ts");
  });

  it("C20: guarda el modelo de cada revisor con sus respuestas", async () => {
    const { revisor } = revisorFalso(bloqueaEn("src/app.ts", 50));

    await correr({ reviewDiff: revisor });

    const recibo = ultimoRecibo();
    const revisores = revision(recibo).revisores;
    expect(revisores).toHaveLength(1);
    expect(revisores[0]).toMatchObject({
      rol: "reviewer",
      provider: "revisor-falso",
      model: "falso-1",
      resolvedVersion: "falso-1-20261010",
    });
    expect(revisores[0]?.respuestas).toEqual([
      {
        proposicion: "sin_hallazgo_severo",
        cumple: false,
        confianza: 0.95,
        motivo: "Hay un defecto severo.",
        hallazgos: [
          {
            ruta: "src/app.ts",
            linea: 50,
            motivo: "El cambio rompe a su consumidor.",
            verificado: true,
          },
        ],
      },
    ]);
    expect(recibo.model?.resolvedVersion).toBe("falso-1-20261010");
  });

  it("C21: suma en usage.costUsd el costo de todos los revisores", async () => {
    convertirEnSecurity();
    const { revisor } = revisorFalso(NADA, { costo: 0.0125 });

    await correr({ reviewDiff: revisor });

    const recibo = ultimoRecibo();
    expect(revision(recibo).revisores).toHaveLength(2);
    expect(recibo.usage?.costUsd).toBeCloseTo(0.025, 6);
    expect(recibo.usage?.inputTokens).toBe(2000);
    expect(recibo.usage?.outputTokens).toBe(200);
  });

  it("C22: si el árbol cambia mientras corren los revisores, el recibo anota las rutas que cambiaron", async () => {
    const antes = calcularArbolProbado(PATHS());
    const { revisor } = revisorFalso(NADA, {
      alVer: () => escribir("src/otro.ts", "export const cambiado = true;\n"),
    });

    await correr({ reviewDiff: revisor });

    const recibo = ultimoRecibo();
    expect((recibo.notes ?? []).join("\n")).toContain("src/otro.ts");
    // El recibo conserva el árbol que se revisó, no el que había al volver.
    expect(recibo.testedTree?.hash).toBe(antes?.registro.hash);
    expect(calcularArbolProbado(PATHS())?.registro.hash).not.toBe(antes?.registro.hash);
  });

  it("si el árbol cambia mientras se arma la entrada, no se llama a nadie ni se escribe recibo", async () => {
    const { llamadas, revisor } = revisorFalso();
    ganchos.alTomarElArbol = () =>
      escribir("src/otro.ts", "export const cambiado = true;\n");

    const r = await correr({ reviewDiff: revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(r.stderr).toMatch(/cambió/);
    expect(llamadas).toHaveLength(0);
    expect(recibos()).toHaveLength(0);
  });

  it("C23: con un archivo funcional cambiado después, motivoDeArbolNoVigente da el recibo por vencido y nombra la compuerta", async () => {
    const { revisor } = revisorFalso();
    await correr({ reviewDiff: revisor });
    const recibo = ultimoRecibo();

    expect(motivoDeArbolNoVigente(recibo, PATHS(), ID, "code-review")).toBeNull();

    tocarOtro();
    const motivo = motivoDeArbolNoVigente(recibo, PATHS(), ID, "code-review");
    expect(motivo).not.toBeNull();
    expect(motivo).toContain(`valmen gate code-review --id ${ID}`);
    expect(motivo).not.toContain("qa-mechanical");
  });

  it("repetir la compuerta sobre el mismo estado se rechaza sin llamar al revisor, salvo con motivo", async () => {
    const { llamadas, revisor } = revisorFalso();
    await correr({ reviewDiff: revisor });

    const repetida = await correr({ reviewDiff: revisor });

    expect(repetida.exitCode).toBe(EXIT_INVARIANT);
    expect(repetida.stderr).toMatch(/--force-reason/);
    expect(llamadas).toHaveLength(1);
    expect(recibos()).toHaveLength(1);

    const forzada = await correr({
      reviewDiff: revisor,
      forceReason: "Se quiere otra lectura",
    });
    expect(forzada.exitCode).toBe(0);
    expect(llamadas).toHaveLength(2);
    expect(ultimoRecibo().forced?.reason).toBe("Se quiere otra lectura");
  });
});

/** Cambia el ticket a SECURITY en el laboratorio de la prueba, sin rehacer el repositorio. */
function convertirEnSecurity(): void {
  const ruta = join(lab, "tickets", "2026", ID, "ticket.md");
  writeFileSync(
    ruta,
    readFileSync(ruta, "utf8").replace("type: FEATURE", "type: SECURITY"),
  );
}

// ── C24 a C28: una sola corrección acotada ──────────────────────────────────────────────────

describe("R-REV-005: tras un bloqueo se admite una corrección y una segunda ronda acotada", () => {
  beforeEach(() => {
    armar();
    tocarApp();
    tocarOtro();
  });

  it("C24: la segunda corrida envía al revisor solo los archivos que cambiaron desde el árbol revisado", async () => {
    const primera = revisorFalso(bloqueaEn("src/app.ts", 50));
    await correr({ reviewDiff: primera.revisor });
    expect(ultimoRecibo().outcome).toBe("block");

    // La corrección toca solo `src/app.ts`.
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 500;");
    const segunda = revisorFalso();
    const r = await correr({ reviewDiff: segunda.revisor });

    expect(r.exitCode).toBe(0);
    expect(segunda.llamadas).toHaveLength(1);
    const entrada = segunda.llamadas[0]?.entrada ?? "";
    expect(entrada).toContain("export const f50 = () => 500;");
    expect(entrada).not.toContain("src/otro.ts");
    expect(entrada).not.toContain("export const g10 = () => 1000;");
    // La ronda 2 recibe lo que la ronda 1 señaló.
    expect(entrada).toContain("El cambio rompe a su consumidor.");
    const recibo = ultimoRecibo();
    expect(revision(recibo).ronda).toBe(2);
    expect(revision(recibo).entrada.acotadaA).toEqual(["src/app.ts"]);
    expect(revision(recibo).reciboAnterior).toBe(recibos()[0]?.id);
    expect(recibo.outcome).toBe("approve");
  });

  it("C25: un hallazgo de la primera ronda en un archivo que la corrección no tocó bloquea sin llamar al revisor", async () => {
    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/otro.ts", 10)).revisor });
    expect(ultimoRecibo().outcome).toBe("block");

    cambiarLinea("src/app.ts", 50, "export const f50 = () => 500;");
    const segunda = revisorFalso();
    const r = await correr({ reviewDiff: segunda.revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(segunda.llamadas).toHaveLength(0);
    const recibo = ultimoRecibo();
    expect(revision(recibo).ronda).toBe(2);
    expect(recibo.outcome).not.toBe("approve");
    expect(recibo.reason).toContain("src/otro.ts:10");
    expect(
      recibo.mechanicalChecks.find((c) => c.id === "hallazgo_sin_atender")?.result,
    ).toBe("fail");
  });

  it("C26: una segunda ronda que vuelve a bloquear deja un recibo escalado a una persona que cita los dos recibos", async () => {
    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/app.ts", 50)).revisor });
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 51;");

    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/app.ts", 50)).revisor });

    const [primero, segundo] = recibos();
    expect(recibos()).toHaveLength(2);
    expect(segundo?.outcome).toBe("review");
    expect(segundo?.escalatedTo).toBe("human");
    expect(segundo?.reason).toContain("segunda ronda: lo decide una persona");
    expect(segundo?.reason).toContain(primero?.id);
    expect(segundo?.reason).toContain(segundo?.id);
    expect(segundo?.reason).toContain("no se abre una tercera");
  });

  it("C27: tras la segunda ronda sin decisión humana, una tercera corrida se rechaza sin llamar a ningún revisor", async () => {
    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/app.ts", 50)).revisor });
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 51;");
    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/app.ts", 50)).revisor });
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 52;");
    const tercera = revisorFalso();

    const r = await correr({ reviewDiff: tercera.revisor });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(r.stderr).toMatch(/gate-decide/);
    expect(r.stderr).toContain(recibos()[0]?.id);
    expect(r.stderr).toContain(recibos()[1]?.id);
    expect(tercera.llamadas).toHaveLength(0);
    expect(recibos()).toHaveLength(2);
  });

  it("C28: tras el rechazo humano de la segunda ronda, la siguiente corrida vuelve a ser la primera ronda", async () => {
    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/app.ts", 50)).revisor });
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 51;");
    await correr({ reviewDiff: revisorFalso(bloqueaEn("src/app.ts", 50)).revisor });
    const escalado = ultimoRecibo();
    appendReceipt(
      PATHS(),
      ID,
      withHumanDecision(escalado, {
        actor: "PO",
        decision: "reject",
        reason: "Hay que rehacer el cambio",
        channel: "cli",
        decidedAt: "2026-10-10T12:00:00.000Z",
      }),
    );
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 53;");
    const nueva = revisorFalso();

    const r = await correr({ reviewDiff: nueva.revisor });

    expect(r.exitCode).toBe(0);
    expect(nueva.llamadas).toHaveLength(1);
    expect(revision(ultimoRecibo()).ronda).toBe(1);
    // Una ronda 1 revisa el diff completo, otra vez.
    expect(nueva.llamadas[0]?.entrada).toContain("export const g10 = () => 1000;");
  });

  it("tras una ronda aprobada, la siguiente corrida con otro árbol vuelve a ser la primera ronda", async () => {
    await correr({ reviewDiff: revisorFalso().revisor });
    expect(ultimoRecibo().outcome).toBe("approve");
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 54;");

    await correr({ reviewDiff: revisorFalso().revisor });

    expect(revision(ultimoRecibo()).ronda).toBe(1);
  });

  it("la profundidad de la segunda ronda es la mayor entre la de la primera y la del diff actual", async () => {
    escribir("BackEnd/pos/migrations/0002_agrega_columna.py", "# agrega una columna\n");
    const primera = revisorFalso(() => ({
      sin_hallazgo_severo_riesgo: hallazgo("src/app.ts", 50),
    }));
    await correr({ reviewDiff: primera.revisor });
    expect(revision(ultimoRecibo()).profundidad).toBe("un-revisor-cuatro-lentes");

    // La corrección saca la migración del diff: el riesgo de ahora es medio, la profundidad no baja.
    rmSync(join(lab, "BackEnd/pos/migrations/0002_agrega_columna.py"));
    cambiarLinea("src/app.ts", 50, "export const f50 = () => 500;");
    const segunda = revisorFalso();
    await correr({ reviewDiff: segunda.revisor });

    expect(revision(ultimoRecibo()).riesgo.nivel).toBe("medio");
    expect(revision(ultimoRecibo()).profundidad).toBe("un-revisor-cuatro-lentes");
    expect(segunda.llamadas[0]?.proposiciones).toEqual(LENTES);
  });

  it("una segunda ronda con una ronda 1 que no corrió revisores revisa el diff completo", async () => {
    // La primera ronda deja un secreto en lo agregado: bloquea sin revisores.
    const token = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
    cambiarLinea("src/app.ts", 50, `export const token = "${token}";`);
    await correr({ reviewDiff: revisorFalso().revisor });
    expect(ultimoRecibo().outcome).toBe("block");

    cambiarLinea("src/app.ts", 50, "export const f50 = () => 500;");
    const segunda = revisorFalso();
    await correr({ reviewDiff: segunda.revisor });

    // `src/otro.ts` no cambió en la corrección y aun así se revisa, porque la ronda 1 no lo vio.
    expect(segunda.llamadas[0]?.entrada).toContain("export const g10 = () => 1000;");
    expect(revision(ultimoRecibo()).ronda).toBe(2);
  });
});

// ── C29 y C30: se corre a mano y no condiciona ninguna entrega ──────────────────────────────

describe("sin la clave code-review: exigida la compuerta se corre a mano y no condiciona la entrega", () => {
  beforeEach(() => armar());

  it("C29: valmen gate code-review --id <ID> corre a mano hasta dejar su recibo", async () => {
    soloUnaPrueba();
    expect(leer(".valmen/config.yaml")).not.toContain("code-review");

    const r = await ejecutarCli(["--root", lab, "gate", "code-review", "--id", ID]);

    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("RESULTADO: APPROVE");
    expect(recibos()).toHaveLength(1);
    expect(revision(ultimoRecibo()).base.ref).toBe("main");
  });

  it("--base cambia la base del diff y el recibo guarda la que se pidió", async () => {
    soloUnaPrueba();
    commitear("la prueba ya está commiteada");
    escribir("tests/otra.test.ts", "export const otra = true;\n");

    const r = await ejecutarCli([
      "--root",
      lab,
      "gate",
      "code-review",
      "--id",
      ID,
      "--base",
      "HEAD",
    ]);

    expect(r.codigo).toBe(0);
    const recibo = revision(ultimoRecibo());
    expect(recibo.base.ref).toBe("HEAD");
    expect(recibo.entrada.archivos.map((a) => a.ruta)).toEqual(["tests/otra.test.ts"]);
  });

  it("C30: un recibo block de code-review no impide entregar a awaiting_user_tests con el recibo vigente de qa-mechanical", async () => {
    const token = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
    cambiarLinea("src/app.ts", 50, `export const token = "${token}";`);
    const mecanica = await runGate(PATHS(), {
      gateId: "qa-mechanical",
      ticketId: ID,
      evaluator: "command",
    });
    expect(mecanica.exitCode).toBe(0);
    await correr({ reviewDiff: revisorFalso().revisor });
    expect(ultimoRecibo().outcome).toBe("block");

    const entrega = transition({
      paths: PATHS(),
      ticketId: ID,
      entity: "ticket",
      to: "awaiting_user_tests",
    });

    expect(entrega).toBeDefined();
    expect(
      parseTicket(readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8"))
        .fields.workflow_status,
    ).toBe("awaiting_user_tests");
  });

  it("un recibo approve de code-review tampoco habilita la entrega sin el de qa-mechanical", async () => {
    soloUnaPrueba();
    await correr({ reviewDiff: revisorFalso().revisor });
    expect(ultimoRecibo().outcome).toBe("approve");

    expect(() =>
      transition({
        paths: PATHS(),
        ticketId: ID,
        entity: "ticket",
        to: "awaiting_user_tests",
      }),
    ).toThrow(/qa-mechanical/);
  });
});

/** Ejecuta el CLI de punta a punta y devuelve el código y lo que escribió. */
async function ejecutarCli(
  argv: readonly string[],
): Promise<{ readonly codigo: number; readonly salida: string }> {
  const escrituras: string[] = [];
  const escribirSalida = (trozo: unknown): boolean => {
    escrituras.push(String(trozo));
    return true;
  };
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(escribirSalida);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(escribirSalida);
  try {
    const codigo = await run(argv);
    return { codigo, salida: escrituras.join("") };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

// ── El revisor del enrutado ─────────────────────────────────────────────────────────────────

describe("el revisor es el del rol reviewer del enrutado", () => {
  it("llama con el proveedor, el modelo y el esfuerzo del rol y no agrega ningún rol", async () => {
    armar({
      routing:
        "preset: balanced\n\nroles:\n  reviewer:\n    provider: claude-code\n    model: claude-opus-5-5\n    effort: high\n" +
        "  agent-implementation:\n    provider: claude-code\n    model: claude-sonnet-5-5\n    effort: high\n",
    });
    tocarApp();
    const { llamadas, revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    expect(llamadas[0]?.provider).toBe("claude-code");
    expect(llamadas[0]?.model).toBe("claude-opus-5-5");
    expect(revision(ultimoRecibo()).revisores[0]?.effort).toBe("high");
    expect((ultimoRecibo().notes ?? []).join("\n")).not.toMatch(/mismo modelo/);
  });

  it("anota en el recibo que el revisor es el mismo modelo que el rol agent-implementation (H3)", async () => {
    armar({
      routing:
        "preset: balanced\n\nroles:\n  reviewer:\n    provider: claude-code\n    model: claude-sonnet-5-5\n    effort: medium\n" +
        "  agent-implementation:\n    provider: claude-code\n    model: claude-sonnet-5-5\n    effort: high\n",
    });
    tocarApp();
    const { revisor } = revisorFalso();

    await correr({ reviewDiff: revisor });

    expect((ultimoRecibo().notes ?? []).join("\n")).toMatch(
      /mismo modelo que .*agent-implementation/,
    );
  });

  it("el rol reviewer declara su segundo consumidor, valmen gate code-review", () => {
    const consumidor = ROLES.find((rol) => rol.id === "reviewer")?.consumer ?? "";
    expect(consumidor).toContain("valmen review-agent");
    expect(consumidor).toContain("valmen gate code-review");
  });
});

// ── Los bordes: MCP, panel y simulación ─────────────────────────────────────────────────────

describe("la compuerta nueva en los bordes que corren compuertas", () => {
  beforeEach(() => armar());

  it("evaluar_compuerta acepta code-review y conserva las que ya aceptaba", async () => {
    const herramienta = TOOLS.find((t) => t.name === "evaluar_compuerta");
    const enumeracion = (
      herramienta?.inputSchema.properties as Record<string, { enum?: string[] }>
    )["gate"]?.enum;
    expect(enumeracion).toEqual(["analysis", "plan", "qa-mechanical", "code-review"]);

    soloUnaPrueba();
    const resultado = await callTool(
      { paths: PATHS(), credentialsFile: undefined },
      "evaluar_compuerta",
      {
        gate: "code-review",
        id: ID,
      },
    );
    expect(resultado.isError).toBe(false);
    expect(resultado.data).toMatchObject({ resultado: "approve" });
    expect(recibos()).toHaveLength(1);
  });

  it("Mission Control muestra una tarjeta más, con las cinco proposiciones, y la corre", async () => {
    const tarjetas = listGateCards(PATHS(), ID) ?? [];
    expect(tarjetas.map((t) => t.id)).toEqual([
      "analysis",
      "plan",
      "qa-mechanical",
      "code-review",
    ]);
    const tarjeta = tarjetas.find((t) => t.id === "code-review");
    expect(tarjeta?.propositionCount).toBe(5);
    expect(tarjeta?.applies).toBe(true);

    soloUnaPrueba();
    const salida = await runTicketGate(PATHS(), ID, "code-review");
    expect(salida.ok).toBe(true);
    expect(salida.receipt?.outcome).toBe("approve");
    // El recibo de la revisión caduca con el árbol y no con el texto del ticket: sin cambios, vigente.
    expect(salida.receipt?.stale).toBe(false);

    const vigente = listGateDecisions(PATHS(), ID).find((d) => d.gate === "code-review");
    expect(vigente?.stale).toBe(false);
    // Con un archivo funcional cambiado después, el mismo recibo se muestra obsoleto.
    tocarOtro();
    const obsoleto = listGateDecisions(PATHS(), ID).find((d) => d.gate === "code-review");
    expect(obsoleto?.stale).toBe(true);
  });

  it("simulateGate rechaza una compuerta de diff: un ticket histórico no tiene el diff de su entrega", async () => {
    await expect(simulateGate(PATHS(), { gate: gateById("code-review") })).rejects.toThrow(
      /no se puede simular/,
    );
  });

  it("valmen simulate code-review lo dice con el código de esquema y no revienta", async () => {
    const r = await ejecutarCli(["--root", lab, "simulate", "code-review"]);

    expect(r.codigo).toBe(EXIT_SCHEMA);
    expect(r.salida).toMatch(/no se puede simular/);
  });
});

// ── Lo que ya existía sigue igual ───────────────────────────────────────────────────────────

describe("compatibilidad: lo que ya existía sigue igual", () => {
  beforeEach(() => armar());

  it("las tres compuertas de siempre siguen declaradas y una desconocida lo sigue diciendo", () => {
    expect(Object.keys(GATES)).toEqual([
      "analysis",
      "plan",
      "qa-mechanical",
      "code-review",
    ]);
    for (const id of ["analysis", "plan", "qa-mechanical"])
      expect(gateById(id).diffReview).toBeUndefined();
    expect(gateById("code-review").diffReview).toBe(true);
    expect(() => gateById("inexistente")).toThrow(
      /Gate desconocido: "inexistente"\. Disponibles: analysis, plan, qa-mechanical/,
    );
  });

  it("qa-mechanical con el evaluador command sigue aprobando y su recibo no trae codeReview", async () => {
    const r = await runGate(PATHS(), {
      gateId: "qa-mechanical",
      ticketId: ID,
      evaluator: "command",
    });

    expect(r.exitCode).toBe(0);
    const recibo = readReceipts(PATHS(), ID).find((x) => x.gate === "qa-mechanical");
    expect(recibo?.outcome).toBe("approve");
    expect(recibo?.testedTree).toBeDefined();
    expect(recibo?.codeReview).toBeUndefined();
  });

  it("motivoDeArbolNoVigente da para qa-mechanical el mismo mensaje de siempre", async () => {
    await runGate(PATHS(), { gateId: "qa-mechanical", ticketId: ID, evaluator: "command" });
    const recibo = readReceipts(PATHS(), ID).find(
      (x) => x.gate === "qa-mechanical",
    ) as GateReceipt;
    expect(motivoDeArbolNoVigente(recibo, PATHS(), ID, "qa-mechanical")).toBeNull();

    tocarApp();
    const motivo = motivoDeArbolNoVigente(recibo, PATHS(), ID, "qa-mechanical");

    expect(motivo).toBe(
      `El árbol de trabajo cambió desde la verificación mecánica (recibo ${recibo.id}): lo que se probó no es ` +
        `lo que se entrega. Para entregar hay que repetir la compuerta: valmen gate qa-mechanical --id ${ID} --evaluator command`,
    );
  });

  it("la entrega sigue pidiendo qa-mechanical y rechaza un árbol que cambió", async () => {
    await runGate(PATHS(), { gateId: "qa-mechanical", ticketId: ID, evaluator: "command" });
    tocarApp();

    expect(() =>
      transition({
        paths: PATHS(),
        ticketId: ID,
        entity: "ticket",
        to: "awaiting_user_tests",
      }),
    ).toThrow(/valmen gate qa-mechanical --id .* --evaluator command/);
  });

  it("valmen gate sigue aceptando --evaluator, --force-reason y --dry-run, y rechaza una bandera desconocida", async () => {
    expect(COMANDOS["gate"]?.conValor).toEqual(
      expect.arrayContaining(["--id", "--evaluator", "--force-reason", "--base"]),
    );
    expect(COMANDOS["gate"]?.booleanas).toContain("--dry-run");

    const conocida = await ejecutarCli([
      "--root",
      lab,
      "gate",
      "qa-mechanical",
      "--id",
      ID,
      "--evaluator",
      "command",
      "--dry-run",
      "--force-reason",
      "prueba",
    ]);
    expect(conocida.codigo).toBe(0);

    const desconocida = await ejecutarCli([
      "--root",
      lab,
      "gate",
      "qa-mechanical",
      "--id",
      ID,
      "--inventada",
    ]);
    expect(desconocida.codigo).toBe(EXIT_SCHEMA);
  });

  it("una compuerta de siempre sobre un ticket en otro estado sigue diciendo el estado que pide", async () => {
    const r = await runGate(PATHS(), { gateId: "plan", ticketId: ID });

    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(r.stderr).toMatch(/solo aplica a un ticket en `planned`/);
  });
});
