/**
 * La línea de tiempo del ticket: quién intervino, con qué modelo y a qué coste.
 *
 * Lo que se prueba aquí es la **interpretación**, no la lectura. La lectura vive
 * en `timeline.ts` y habla con la base de opencode, que tiene una forma concreta y
 * cambia con su versión; lo que puede estar mal de verdad —y lo estuvo— es cómo se
 * interpreta lo leído.
 *
 * Dos fallos reales que motivaron estas pruebas, los dos silenciosos:
 *
 * 1. **El identificador del ticket se buscaba en el mensaje y no en los argumentos
 *    de la llamada.** El filtro por ticket devolvía cero intervenciones, que es un
 *    resultado plausible y falso: se lee como «esta sesión no trabajó el ticket».
 * 2. **El modelo de la sesión se volcaba crudo.** La columna guarda a veces un
 *    texto y a veces el objeto serializado, así que el registro quedaba con un
 *    JSON dentro de un campo de texto.
 *
 * El módulo se prueba a través de su API pública con una base de opencode
 * **falsa**: un archivo SQLite con las tablas y columnas que el módulo consulta.
 * Es la única forma de probar la interpretación sin depender de la base real de
 * quien ejecuta los tests, que además cambia mientras trabaja.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ticketDeTexto } from "../packages/server/src/timeline.js";

const requerir = createRequire(import.meta.url);

/** El módulo del núcleo, o `null` si esta versión de Node no lo trae. */
function sqlite(): { DatabaseSync: new (ruta: string) => SqliteDb } | null {
  try {
    return requerir("node:sqlite") as { DatabaseSync: new (ruta: string) => SqliteDb };
  } catch {
    return null;
  }
}

/** Lo mínimo de la interfaz de la base que usan estas pruebas. */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...valores: unknown[]): void };
  close(): void;
}

/** El módulo, cargado aparte para poder saltar si no hay `node:sqlite`. */
async function cargar(): Promise<typeof import("../packages/server/src/timeline.js")> {
  return await import("../packages/server/src/timeline.js");
}

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-linea-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/**
 * Escribe una base de opencode de mentira, con las columnas que el módulo lee.
 *
 * Se declaran todas aunque no se usen: si el módulo pidiera una que falta, la
 * consulta falla y el test lo dice —que es lo que se quiere— en vez de devolver
 * silenciosamente una línea de tiempo vacía.
 */
function escribirBase(datos: {
  directorio: string;
  sesiones: {
    id: string;
    title: string;
    cost: number;
    agente?: string;
    modelo?: string;
    tokensInput?: number;
    mensajes: {
      id: string;
      data: Record<string, unknown>;
      partes: { tool: string; status: string }[];
    }[];
  }[];
}): void {
  const modulo = sqlite();
  if (modulo === null) return;

  const dir = join(lab, ".local", "share", "opencode");
  mkdirSync(dir, { recursive: true });
  const db = new modulo.DatabaseSync(join(dir, "opencode.db"));

  db.exec(`
    CREATE TABLE session (
      id text PRIMARY KEY, title text, directory text, cost real,
      tokens_input integer, tokens_output integer, tokens_reasoning integer,
      tokens_cache_read integer, agent text, model text, time_created integer
    );
    CREATE TABLE message (
      id text PRIMARY KEY, session_id text, time_created integer, data text
    );
    CREATE TABLE part (
      id text PRIMARY KEY, message_id text, session_id text,
      time_created integer, data text
    );
  `);

  let t = 1_700_000_000_000;
  let n = 0;
  for (const s of datos.sesiones) {
    db.prepare("INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      s.id,
      s.title,
      datos.directorio,
      s.cost,
      s.tokensInput ?? 0,
      0,
      0,
      0,
      s.agente ?? null,
      s.modelo ?? null,
      t,
    );

    for (const m of s.mensajes) {
      t += 1000;
      db.prepare("INSERT INTO message VALUES (?,?,?,?)").run(
        m.id,
        s.id,
        t,
        JSON.stringify(m.data),
      );
      for (const p of m.partes) {
        n += 1;
        db.prepare("INSERT INTO part VALUES (?,?,?,?,?)").run(
          `part_${n}`,
          m.id,
          s.id,
          t,
          JSON.stringify({
            type: "tool",
            tool: p.tool,
            state: { status: p.status, time: { start: t } },
          }),
        );
      }
    }
  }
  db.close();
}

/** Un mensaje de asistente, como lo guarda el cliente. */
function mensaje(
  coste: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    role: "assistant",
    agent: "build",
    providerID: "opencode-go",
    modelID: "deepseek-v4.1-flash",
    cost: coste,
    ...extra,
  };
}

describe("sacar el ticket de un texto", () => {
  it("reconoce el formato del contrato", () => {
    expect(ticketDeTexto("Ticket: BUGFIX-INVENTARIO-FILTRO-20260922")).toBe(
      "BUGFIX-INVENTARIO-FILTRO-20260922",
    );
  });

  it("no inventa un identificador donde no lo hay", () => {
    expect(ticketDeTexto("una sesión cualquiera")).toBeNull();
    // Un fragmento con forma parecida pero sin la fecha completa no cuenta.
    expect(ticketDeTexto("BUGFIX-POS-20260922")).toBeNull();
  });
});

describe("leer la línea de tiempo", () => {
  it("sin base devuelve `null`, que no es lo mismo que vacío", async () => {
    // La diferencia importa: una línea vacía se muestra como un cero y se lee
    // como «no costó nada»; `null` deja que la pantalla diga «no hay datos».
    const { leerLineaDeTiempo } = await cargar();
    expect(leerLineaDeTiempo("/proyecto", { home: lab })).toBeNull();
  });

  it("suma el coste de las sesiones y separa el trabajo del harness del resto", async () => {
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_1",
          title: "Ticket: BUGFIX-POS-UNO-20260101",
          cost: 0.03,
          agente: "build",
          modelo: "opencode-go/kimi",
          tokensInput: 100,
          mensajes: [
            // Un mensaje que explora: no llama a ninguna herramienta del harness.
            {
              id: "m1",
              data: mensaje(0.02),
              partes: [{ tool: "read", status: "completed" }],
            },
            // Uno que sí: 0.01.
            {
              id: "m2",
              data: mensaje(0.01),
              partes: [
                { tool: "valmen_crear_ticket", status: "completed" },
                { tool: "valmen_validar_ticket", status: "completed" },
              ],
            },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const r = leerLineaDeTiempo("/proyecto", { home: lab });

    expect(r).not.toBeNull();
    expect(r?.totalCostUsd).toBeCloseTo(0.03, 9);
    expect(r?.desglose.harnessUsd).toBeCloseTo(0.01, 9);
    expect(r?.desglose.exploracionUsd).toBeCloseTo(0.02, 9);
    // Dos llamadas al harness en **un** mensaje cuentan como un mensaje: el coste
    // es del mensaje, no de la llamada.
    expect(r?.desglose.harnessMensajes).toBe(1);
    expect(r?.desglose.exploracionMensajes).toBe(1);
    expect(r?.intervenciones).toHaveLength(2);
    expect(r?.sessions[0]?.intervenciones).toBe(2);
  });

  it("marca las que fallaron, que es lo que hace visible una corrección", async () => {
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_1",
          title: "Ticket: BUGFIX-POS-UNO-20260101",
          cost: 0.02,
          mensajes: [
            {
              id: "m1",
              data: mensaje(0.01),
              partes: [{ tool: "valmen_evaluar_compuerta", status: "error" }],
            },
            {
              id: "m2",
              data: mensaje(0.01),
              partes: [{ tool: "valmen_evaluar_compuerta", status: "completed" }],
            },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const r = leerLineaDeTiempo("/proyecto", { home: lab });
    expect(r?.intervenciones.map((i) => i.failed)).toEqual([true, false]);
    expect(r?.sessions[0]?.fallidas).toBe(1);
  });

  it("filtra por ticket usando los argumentos de la llamada", async () => {
    // El fallo real: el identificador se buscaba en el texto del **mensaje**, pero
    // viaja en los argumentos de la **parte**. El filtro devolvía cero, que se lee
    // como «esta sesión no trabajó el ticket» y es falso.
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_1",
          title: "Dos tickets en una sesión",
          cost: 0.02,
          mensajes: [
            {
              id: "m1",
              data: mensaje(0.01),
              partes: [{ tool: "ERROR_DEL_TEST", status: "completed" }],
            },
            {
              id: "m2",
              data: mensaje(0.01),
              partes: [{ tool: "ERROR_DEL_TEST", status: "completed" }],
            },
          ],
        },
      ],
    });

    // Las partes se reescriben con sus argumentos, que es donde va el identificador.
    const modulo = sqlite();
    if (modulo === null) return;
    const db = new modulo.DatabaseSync(
      join(lab, ".local", "share", "opencode", "opencode.db"),
    );

    const conArgumentos = (tool: string, argumentos: Record<string, unknown>): string =>
      JSON.stringify({
        type: "tool",
        tool,
        state: { status: "completed", time: { start: 1 }, input: argumentos },
      });

    db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(
      conArgumentos("valmen_crear_ticket", { id: "BUGFIX-POS-UNO-20260101" }),
      "m1",
    );
    db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(
      conArgumentos("valmen_validar_ticket", { id: "BUGFIX-POS-DOS-20260102" }),
      "m2",
    );
    db.close();

    const { leerLineaDeTiempo } = await cargar();

    const uno = leerLineaDeTiempo("/proyecto", {
      home: lab,
      ticketId: "BUGFIX-POS-UNO-20260101",
    });
    expect(uno?.intervenciones).toHaveLength(1);
    expect(uno?.intervenciones[0]?.tool).toBe("valmen_crear_ticket");

    const dos = leerLineaDeTiempo("/proyecto", {
      home: lab,
      ticketId: "BUGFIX-POS-DOS-20260102",
    });
    expect(dos?.intervenciones).toHaveLength(1);
    expect(dos?.intervenciones[0]?.tool).toBe("valmen_validar_ticket");

    // Pedir un ticket que ninguna sesión tocó **no devuelve sesiones**. Antes sí
    // las devolvía —con su coste— y eso hacía que la pantalla de un ticket mostrara
    // el gasto de todo el proyecto como si fuera suyo: un número con aspecto de
    // dato y sin relación con lo que se estaba mirando. La decisión anterior está
    // escrita en este mismo test, y era la equivocada.
    const ninguno = leerLineaDeTiempo("/proyecto", {
      home: lab,
      ticketId: "BUGFIX-POS-TRES-20260103",
    });
    expect(ninguno?.intervenciones).toHaveLength(0);
    expect(ninguno?.sessions).toEqual([]);
    expect(ninguno?.totalCostUsd).toBe(0);
  });

  it("no mezcla las sesiones de otro proyecto", async () => {
    escribirBase({
      directorio: "/otro-proyecto",
      sesiones: [
        {
          id: "ses_ajena",
          title: "De otro proyecto",
          cost: 5,
          mensajes: [
            {
              id: "m1",
              data: mensaje(5),
              partes: [{ tool: "valmen_crear_ticket", status: "completed" }],
            },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const r = leerLineaDeTiempo("/proyecto", { home: lab });
    // Hay base, pero nada de este proyecto: línea de tiempo vacía, no `null`.
    expect(r).not.toBeNull();
    expect(r?.sessions).toHaveLength(0);
    expect(r?.totalCostUsd).toBe(0);
  });
});

describe("las sesiones de codex", () => {
  /** Una sesión de codex, con la forma real: metadatos, uso y comandos. */
  function escribirSesionDeCodex(
    home: string,
    opciones: {
      readonly fecha: string;
      readonly id: string;
      readonly cwd: string;
      readonly tokens: number;
      readonly lineas: readonly string[];
    },
  ): string {
    const [anio, mes, dia] = opciones.fecha.split("-") as [string, string, string];
    const directorio = join(home, ".codex", "sessions", anio, mes, dia);
    mkdirSync(directorio, { recursive: true });
    // La primera línea real trae las instrucciones completas del agente: cientos
    // de kilobytes que hacen que un `JSON.parse` sobre un trozo cortado falle.
    const meta = JSON.stringify({
      type: "session_meta",
      payload: {
        id: opciones.id,
        timestamp: `${opciones.fecha}T10:00:00.000Z`,
        cwd: opciones.cwd,
        base_instructions: { text: "x".repeat(30_000) },
      },
    });
    const uso = JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: opciones.tokens,
            cached_input_tokens: Math.floor(opciones.tokens / 2),
            output_tokens: 1000,
            reasoning_output_tokens: 500,
          },
        },
      },
    });
    const ruta = join(
      directorio,
      `rollout-${opciones.fecha}T10-00-00-${opciones.id}.jsonl`,
    );
    writeFileSync(ruta, [meta, ...opciones.lineas, uso].join("\n"), "utf8");
    return ruta;
  }

  const hoy = (): string => new Date().toISOString().slice(0, 10);

  it("lee el consumo de la sesión que trabajó el ticket", async () => {
    const home = mkdtempSync(join(tmpdir(), "valmen-codex-"));
    try {
      escribirSesionDeCodex(home, {
        fecha: hoy(),
        id: "01a0cf37-489d-7752-b64f-705554ddc130",
        cwd: "/proyecto",
        tokens: 2_000_000,
        lineas: [
          JSON.stringify({
            payload: { command: "valmen validate --id BUGFIX-POS-UNO-20260101" },
          }),
          JSON.stringify({ payload: { text: "cerré BUGFIX-POS-UNO-20260101" } }),
        ],
      });

      const { leerLineaDeTiempo } = await cargar();
      const linea = leerLineaDeTiempo("/proyecto", {
        home,
        ticketId: "BUGFIX-POS-UNO-20260101",
      });

      expect(linea?.sessions).toHaveLength(1);
      const sesion = linea?.sessions[0];
      expect(sesion?.source).toBe("codex");
      // La entrada se descuenta de los tokens de entrada: codex los cuenta juntos.
      expect(sesion?.inputTokens).toBe(1_000_000);
      expect(sesion?.cacheReadTokens).toBe(1_000_000);
      expect(sesion?.intervenciones).toBe(1);
      // Y el coste no se inventa: una suscripción no tiene precio por token.
      expect(sesion?.costUsd).toBeNull();
      expect(linea?.sesionesSinCoste).toBe(1);
      expect(linea?.totalCostUsd).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("no cuenta las sesiones de otro proyecto", async () => {
    const home = mkdtempSync(join(tmpdir(), "valmen-codex-"));
    try {
      escribirSesionDeCodex(home, {
        fecha: hoy(),
        id: "otro",
        cwd: "/otro-proyecto",
        tokens: 500_000,
        lineas: [],
      });

      // Sin sesiones de este proyecto y sin base de opencode, la línea de tiempo
      // es `null`: «no hay datos», que la API traduce a `available: false` para que
      // la pantalla lo diga en vez de mostrar un cero que se lee como «no costó».
      const { leerLineaDeTiempo } = await cargar();
      expect(leerLineaDeTiempo("/proyecto", { home })).toBeNull();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("sin el ticket, una sesión que no lo menciona no se atribuye", async () => {
    const home = mkdtempSync(join(tmpdir(), "valmen-codex-"));
    try {
      escribirSesionDeCodex(home, {
        fecha: hoy(),
        id: "ajena",
        cwd: "/proyecto",
        tokens: 100_000,
        lineas: [JSON.stringify({ payload: { text: "otra cosa" } })],
      });

      const { leerLineaDeTiempo } = await cargar();
      expect(
        leerLineaDeTiempo("/proyecto", { home, ticketId: "BUGFIX-POS-UNO-20260101" }),
      ).toBeNull();
      // Pero sin filtro aparece: el proyecto sí la tiene, con sus tokens.
      expect(leerLineaDeTiempo("/proyecto", { home })?.sessions).toHaveLength(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
