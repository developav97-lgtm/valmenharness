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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  guardarFotoEnTicket,
  mensajesDelRegistroEnTexto,
  ticketDeTexto,
} from "../packages/server/src/timeline.js";
import { parseTicket } from "../packages/core/src/index.js";
import { addAiUsage } from "../packages/engine/src/append.js";
import {
  escribirSesionDeClaude,
  llamada,
  mensajeDelAsistente,
  mensajeDelUsuario,
  texto,
} from "./helpers/claude.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

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

describe("guardar la foto de consumo", () => {
  it("omite una sesión sin modelo sin bloquear el cierre", () => {
    if (sqlite() === null) return;

    const ticketId = "BUGFIX-POS-MODELO-VACIO-20261002";
    writeFixtureTicket(lab, { id: ticketId });
    escribirBase({
      directorio: lab,
      sesiones: [
        {
          id: "ses_sin_modelo",
          title: `Ticket: ${ticketId}`,
          cost: 0.01,
          modelo: "",
          mensajes: [
            {
              id: "m1",
              data: mensaje(0.01, { providerID: "", modelID: "" }),
              partes: [{ tool: "valmen_cerrar_ticket", status: "completed" }],
            },
          ],
        },
      ],
    });

    const modulo = sqlite();
    if (modulo === null) return;
    const db = new modulo.DatabaseSync(
      join(lab, ".local", "share", "opencode", "opencode.db"),
    );
    db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(
      JSON.stringify({
        type: "tool",
        tool: "valmen_cerrar_ticket",
        state: {
          status: "completed",
          time: { start: 1 },
          input: { id: ticketId },
        },
      }),
      "m1",
    );
    db.close();

    const foto = guardarFotoEnTicket(
      { root: lab, ticketsDir: "tickets" },
      ticketId,
      { home: lab },
    );

    expect(foto?.entradas).toEqual([]);
    expect(foto?.detalle).toContain("0 sesión(es) nuevas de 1");
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

describe("las sesiones de Claude Code", () => {
  const TICKET = "IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005";
  const OTRO = "BUGFIX-RESTAURANTE-BONIFICADO-DESMARQUE-20261005";
  const SESION = "9d55ce3b-5c13-4e93-af45-77a4977bd5c6";

  /**
   * Una sesión que pide el ticket, lo mueve dos veces y lo cierra, con números que
   * se suman a mano: dos mensajes únicos, el primero repetido en tres líneas.
   */
  function lineasDeTrabajo(root: string, ticket: string, opciones: { modelo?: string | null } = {}) {
    return [
      mensajeDelUsuario(`Trabaja el ticket ${ticket}`, { cwd: root }),
      ...mensajeDelAsistente(
        {
          id: "msg_1",
          ...(opciones.modelo === undefined ? {} : { modelo: opciones.modelo }),
          uso: { input: 10, creacion: 1000, lectura: 50_000, salida: 400 },
          bloques: [
            texto("Lo muevo."),
            llamada("t1", "mcp__valmen__mover_ticket", { id: ticket, to: "analyzed" }),
            llamada("t2", "mcp__valmen__evaluar_compuerta", { id: ticket, gate: "analysis" }),
          ],
        },
        { cwd: root },
      ),
      ...mensajeDelAsistente(
        {
          id: "msg_2",
          ...(opciones.modelo === undefined ? {} : { modelo: opciones.modelo }),
          uso: { input: 20, creacion: 2000, lectura: 60_000, salida: 600 },
          bloques: [texto("Listo.")],
        },
        { cwd: root },
      ),
    ];
  }

  it("sin base de opencode, la línea del ticket trae la sesión con sus tokens y sin coste", async () => {
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: SESION,
      lineas: lineasDeTrabajo("/proyecto", TICKET),
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    expect(linea?.sessions).toHaveLength(1);
    const sesion = linea?.sessions[0];
    expect(sesion?.source).toBe("claude");
    expect(sesion?.id).toBe(SESION);
    expect(sesion?.model).toBe("claude-sonnet-5-5");
    // El proveedor hace falta: `guardarFotoEnTicket` descarta lo que no tiene modelo.
    expect(sesion?.provider).toBe("anthropic");
    // Y el coste no se inventa: el plan Max no tiene precio por token. Ni cero.
    expect(sesion?.costUsd).toBeNull();
    expect(sesion?.inputTokens).toBe(10 + 1000 + 20 + 2000);
    expect(sesion?.cacheReadTokens).toBe(50_000 + 60_000);
    expect(sesion?.outputTokens).toBe(400 + 600);
    // El razonamiento ya va dentro de la salida: declararlo otra vez lo sumaría doble.
    expect(sesion?.reasoningTokens).toBe(0);
    expect(sesion?.intervenciones).toBe(2);
    expect(sesion?.mensajes).toBe(2);
    expect(sesion?.mensajesDelRegistro).toBe(1);

    expect(linea?.sesionesSinCoste).toBe(1);
    expect(linea?.totalCostUsd).toBe(0);
    expect(linea?.totalTokens).toEqual({
      input: 3030,
      output: 1000,
      reasoning: 0,
      cacheRead: 110_000,
    });
    // «1 de 2 mensajes tocaron el registro»: lo que sí se puede afirmar sin coste.
    expect(linea?.desglose.harnessMensajes).toBe(1);
    expect(linea?.desglose.exploracionMensajes).toBe(1);
  });

  it("con base de opencode, suma a sus sesiones y no pisa las que ya había", async () => {
    if (sqlite() === null) return;
    // Una sesión de opencode que trabajó **este** ticket y una que trabajó otro.
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_mia",
          title: "Implementación",
          cost: 0.05,
          mensajes: [
            { id: "m1", data: mensaje(0.05), partes: [{ tool: "valmen_mover_ticket", status: "completed" }] },
          ],
        },
        {
          id: "ses_ajena",
          title: "Otra cosa",
          cost: 0.5,
          mensajes: [
            { id: "m2", data: mensaje(0.5), partes: [{ tool: "valmen_mover_ticket", status: "completed" }] },
          ],
        },
      ],
    });
    const db = new (sqlite() as NonNullable<ReturnType<typeof sqlite>>).DatabaseSync(
      join(lab, ".local", "share", "opencode", "opencode.db"),
    );
    const conArgumentos = (id: string): string =>
      JSON.stringify({
        type: "tool",
        tool: "valmen_mover_ticket",
        state: { status: "completed", time: { start: 1 }, input: { id } },
      });
    db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(conArgumentos(TICKET), "m1");
    db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(conArgumentos(OTRO), "m2");
    db.close();

    // Lo que se comprueba es **lo que Claude Code agrega** al desglose, midiendo
    // antes y después: el reparto de opencode ya está acotado a las sesiones del
    // ticket y se prueba más abajo.
    const { leerLineaDeTiempo } = await cargar();
    const antes = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: SESION,
      lineas: lineasDeTrabajo("/proyecto", TICKET),
    });
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: "de-otro-ticket",
      lineas: lineasDeTrabajo("/proyecto", OTRO),
    });

    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    expect(linea?.sessions.map((s) => `${s.source}:${s.id}`).sort()).toEqual([
      `claude:${SESION}`,
      "opencode:ses_mia",
    ]);
    // El coste de opencode es el suyo; el de Claude Code no existe y no suma nada.
    expect(linea?.totalCostUsd).toBeCloseTo(0.05, 6);
    expect(linea?.sesionesSinCoste).toBe(1);
    expect(linea?.totalTokens.cacheRead).toBe(110_000);
    // Y los mensajes de Claude Code entran al desglose sin inventarle coste: de sus
    // dos mensajes, uno tocó el registro y uno no.
    expect(linea!.desglose.harnessMensajes - antes!.desglose.harnessMensajes).toBe(1);
    expect(linea!.desglose.exploracionMensajes - antes!.desglose.exploracionMensajes).toBe(1);
    expect(linea!.desglose.harnessUsd).toBeCloseTo(antes!.desglose.harnessUsd, 9);
  });

  /**
   * `escribirBase` deja las llamadas al harness sin argumentos: acá se les pone el
   * ticket que nombran, que es lo que decide a qué ticket pertenece la sesión.
   */
  function nombrarTicketEnLlamadas(ticketPorMensaje: Record<string, string>): void {
    const modulo = sqlite();
    if (modulo === null) return;
    const db = new modulo.DatabaseSync(join(lab, ".local", "share", "opencode", "opencode.db"));
    for (const [messageId, ticket] of Object.entries(ticketPorMensaje)) {
      db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(
        JSON.stringify({
          type: "tool",
          tool: "valmen_mover_ticket",
          state: { status: "completed", time: { start: 1 }, input: { id: ticket } },
        }),
        messageId,
      );
    }
    db.close();
  }

  it("el desglose del ticket no arrastra el reparto de una sesión de opencode de otro ticket", async () => {
    if (sqlite() === null) return;
    // Solo hay sesiones de opencode de **otro** ticket, con llamadas al harness y
    // coste; las del ticket pedido son de Claude Code y no traen coste.
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_ajena",
          title: "Otra cosa",
          cost: 0.75,
          mensajes: [
            { id: "ma1", data: mensaje(0.5), partes: [{ tool: "valmen_mover_ticket", status: "completed" }] },
            { id: "ma2", data: mensaje(0.25), partes: [{ tool: "read", status: "completed" }] },
          ],
        },
      ],
    });
    nombrarTicketEnLlamadas({ ma1: OTRO });
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: SESION,
      lineas: lineasDeTrabajo("/proyecto", TICKET),
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    expect(linea?.sessions.map((s) => `${s.source}:${s.id}`)).toEqual([`claude:${SESION}`]);
    expect(linea?.totalCostUsd).toBe(0);
    // Ni el coste ni los mensajes de la sesión ajena entran: la exploración no puede
    // salir negativa por restarle al total del ticket el harness de todo el proyecto.
    expect(linea?.desglose.harnessUsd).toBe(0);
    expect(linea?.desglose.exploracionUsd).toBeGreaterThanOrEqual(0);
    expect(linea?.desglose.costeNoAtribuibleUsd).toBe(0);
    // Los mensajes son los de la sesión de Claude Code: uno tocó el registro y uno no.
    expect(linea?.desglose.harnessMensajes).toBe(1);
    expect(linea?.desglose.exploracionMensajes).toBe(1);

    // Sin pedir el ticket el reparto sigue siendo el del proyecto entero: la
    // atribución acota lo que se pide por ticket, no lo que se lee.
    const proyecto = leerLineaDeTiempo("/proyecto", { home: lab });
    expect(proyecto?.desglose.harnessUsd).toBeCloseTo(0.5, 9);
    expect(proyecto?.desglose.exploracionUsd).toBeCloseTo(0.25, 9);
  });

  it("con una sesión de opencode del ticket y otra ajena, el desglose suma solo la del ticket", async () => {
    if (sqlite() === null) return;
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_mia",
          title: "Implementación",
          cost: 0.08,
          mensajes: [
            { id: "m1", data: mensaje(0.05), partes: [{ tool: "valmen_mover_ticket", status: "completed" }] },
            { id: "m3", data: mensaje(0.03), partes: [{ tool: "read", status: "completed" }] },
          ],
        },
        {
          id: "ses_ajena",
          title: "Otra cosa",
          cost: 0.75,
          mensajes: [
            { id: "ma1", data: mensaje(0.5), partes: [{ tool: "valmen_mover_ticket", status: "completed" }] },
            { id: "ma2", data: mensaje(0.25), partes: [{ tool: "read", status: "completed" }] },
          ],
        },
      ],
    });
    nombrarTicketEnLlamadas({ m1: TICKET, ma1: OTRO });
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: SESION,
      lineas: lineasDeTrabajo("/proyecto", TICKET),
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    expect(linea?.sessions.map((s) => `${s.source}:${s.id}`).sort()).toEqual([
      `claude:${SESION}`,
      "opencode:ses_mia",
    ]);
    expect(linea?.totalCostUsd).toBeCloseTo(0.08, 9);
    // El coste de la sesión del ticket se reparte entre sus dos mensajes: 0.05 del
    // harness y 0.03 de exploración. Nada de la sesión ajena.
    expect(linea?.desglose.harnessUsd).toBeCloseTo(0.05, 9);
    expect(linea?.desglose.exploracionUsd).toBeCloseTo(0.03, 9);
    // Un mensaje del harness y uno de exploración en opencode, y lo mismo en Claude Code.
    expect(linea?.desglose.harnessMensajes).toBe(2);
    expect(linea?.desglose.exploracionMensajes).toBe(2);
  });

  it("sin base de opencode, no tapa a codex ni a Hermes: las fuentes se unen", async () => {
    // Antes la primera fuente que daba algo —codex— dejaba a las demás fuera, y con
    // Claude Code como agente de los tickets eso escondería sus sesiones.
    const fecha = new Date().toISOString().slice(0, 10);
    const [anio, mes, dia] = fecha.split("-") as [string, string, string];
    const directorio = join(lab, ".codex", "sessions", anio, mes, dia);
    mkdirSync(directorio, { recursive: true });
    writeFileSync(
      join(directorio, `rollout-${fecha}T10-00-00-codex-uno.jsonl`),
      [
        JSON.stringify({
          type: "session_meta",
          payload: { id: "codex-uno", timestamp: `${fecha}T10:00:00.000Z`, cwd: "/proyecto" },
        }),
        JSON.stringify({ payload: { text: `cerré ${TICKET}` } }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 2000,
                cached_input_tokens: 1000,
                output_tokens: 100,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
      ].join("\n"),
      "utf8",
    );
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: SESION,
      lineas: lineasDeTrabajo("/proyecto", TICKET),
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    expect(linea?.sessions.map((s) => s.source).sort()).toEqual(["claude", "codex"]);
    expect(linea?.sesionesSinCoste).toBe(2);
    expect(linea?.totalCostUsd).toBe(0);
    expect(linea?.totalTokens.input).toBe(1000 + 3030);
  });

  it("una sesión compartida aparece marcada y no entra en los totales", async () => {
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: SESION,
      lineas: [
        ...lineasDeTrabajo("/proyecto", TICKET),
        ...mensajeDelAsistente(
          {
            id: "msg_3",
            bloques: [llamada("t9", "mcp__valmen__mover_ticket", { id: OTRO, to: "analyzed" })],
          },
          { cwd: "/proyecto" },
        ),
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    expect(linea?.sessions).toHaveLength(1);
    expect(linea?.sessions[0]?.reparto?.map((t) => t.id).sort()).toEqual([OTRO, TICKET].sort());
    expect(linea?.sesionesCompartidas).toBe(1);
    expect(linea?.totalTokens).toEqual({ input: 0, output: 0, reasoning: 0, cacheRead: 0 });
    expect(linea?.desglose.harnessMensajes).toBe(0);
  });

  describe("guardar el consumo en el ticket", () => {
    const paths = () => ({ root: lab, ticketsDir: "tickets" });

    function consumo(): Record<string, unknown>[] {
      const ruta = join(lab, "tickets", "2026", TICKET, "ticket.md");
      return (parseTicket(readFileSync(ruta, "utf8")).blocks["Consumo de IA"] ?? []) as Record<
        string,
        unknown
      >[];
    }

    it("escribe la sesión con `claude:<id>`, el modelo con su proveedor y los tokens medidos", () => {
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: lineasDeTrabajo(lab, TICKET),
      });

      const foto = guardarFotoEnTicket(paths(), TICKET, { home: lab });

      expect(foto?.entradas).toHaveLength(1);
      const [entrada] = consumo();
      expect(entrada?.["source"]).toBe(`claude:${SESION}`);
      expect(entrada?.["session_reference"]).toBe(SESION);
      expect(entrada?.["model"]).toBe("anthropic/claude-sonnet-5-5");
      expect(entrada?.["input_tokens"]).toBe(3030);
      expect(entrada?.["output_tokens"]).toBe(1000);
      // El total es entrada + salida, sin la caché leída: la misma regla que el resto.
      expect(entrada?.["total_tokens"]).toBe(4030);
      // Sin coste en dólares: el campo queda en `null`, que no es cero.
      expect(entrada?.["estimated_cost_usd"]).toBeNull();
      expect(entrada?.["confidence"]).toBe("high");
      const notas = String(entrada?.["notes"]);
      expect(notas).toContain("suscripción");
      expect(notas).toContain("creación de caché");
      expect(notas).toContain("110000");
      expect(notas).not.toContain("Razonamiento 0");
    });

    it("no duplica una sesión que el ticket ya tiene, aunque la registraran a mano", () => {
      // El caso real: el ticket ya tenía `CONSUMO-001`, registrado a mano con fuente
      // `manual:` y la misma referencia de sesión.
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      addAiUsage({
        paths: paths(),
        ticketId: TICKET,
        source: "manual:claude-code-transcripcion-9d55ce3b",
        confidence: "high",
        sessionReference: SESION,
        model: "anthropic/claude-sonnet-5-5",
        inputTokens: "10963091",
        outputTokens: "91021",
        totalTokens: "11054112",
      });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: lineasDeTrabajo(lab, TICKET),
      });

      const foto = guardarFotoEnTicket(paths(), TICKET, { home: lab });

      expect(foto?.entradas).toEqual([]);
      expect(foto?.detalle).toContain("0 sesión(es) nuevas de 1");
      expect(foto?.detalle).toContain("1 ya estaban registradas");
      expect(consumo()).toHaveLength(1);
      expect(consumo()[0]?.["source"]).toBe("manual:claude-code-transcripcion-9d55ce3b");
    });

    it("una sesión que otro ticket ya tiene con números se declara aquí sin números y no falla (R-CTRL-005)", () => {
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      writeFixtureTicket(lab, { id: OTRO, type: "BUGFIX", module: "RESTAURANTE" });
      // El otro ticket ya cargó la sesión completa, con sus números.
      addAiUsage({
        paths: paths(),
        ticketId: OTRO,
        source: `claude:${SESION}`,
        confidence: "high",
        sessionReference: SESION,
        model: "anthropic/claude-sonnet-5-5",
        inputTokens: "3030",
        outputTokens: "1000",
        totalTokens: "4030",
      });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: lineasDeTrabajo(lab, TICKET),
      });

      const foto = guardarFotoEnTicket(paths(), TICKET, { home: lab });

      // No falla: declara la sesión sin números, diciendo dónde están.
      expect(foto?.entradas).toHaveLength(1);
      const [entrada] = consumo();
      expect(entrada?.["session_reference"]).toBe(SESION);
      expect(entrada?.["input_tokens"]).toBeNull();
      expect(entrada?.["total_tokens"]).toBeNull();
      expect(entrada?.["estimated_cost_usd"]).toBeNull();
      expect(String(entrada?.["notes"])).toContain(`ya cargada con números en ${OTRO}`);
    });

    it("volver a tomar la foto no repite lo ya escrito", () => {
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: lineasDeTrabajo(lab, TICKET),
      });

      guardarFotoEnTicket(paths(), TICKET, { home: lab });
      const segunda = guardarFotoEnTicket(paths(), TICKET, { home: lab });

      expect(segunda?.entradas).toEqual([]);
      expect(consumo()).toHaveLength(1);
    });

    it("una sesión sin modelo no se registra: no se le inventa uno", () => {
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: lineasDeTrabajo(lab, TICKET, { modelo: null }),
      });

      const foto = guardarFotoEnTicket(paths(), TICKET, { home: lab });

      expect(foto?.entradas).toEqual([]);
      expect(foto?.detalle).toContain("0 sesión(es) nuevas de 1");
      expect(consumo()).toEqual([]);
    });

    it("una sesión compartida se registra sin números y con la lista de tickets", () => {
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: [
          ...lineasDeTrabajo(lab, TICKET),
          ...mensajeDelAsistente(
            {
              id: "msg_3",
              bloques: [llamada("t9", "mcp__valmen__mover_ticket", { id: OTRO, to: "analyzed" })],
            },
            { cwd: lab },
          ),
        ],
      });

      const foto = guardarFotoEnTicket(paths(), TICKET, { home: lab });

      expect(foto?.entradas).toHaveLength(1);
      const [entrada] = consumo();
      expect(entrada?.["source"]).toBe(`claude:${SESION}`);
      expect(entrada?.["input_tokens"]).toBeNull();
      expect(entrada?.["output_tokens"]).toBeNull();
      expect(entrada?.["model"]).toBeNull();
      expect(String(entrada?.["notes"])).toContain("compartida");
      expect(String(entrada?.["notes"])).toContain(OTRO);
    });

    it("con varios modelos o subagentes lo dice en las notas y registra el dominante", () => {
      writeFixtureTicket(lab, { id: TICKET, type: "IMPROVEMENT", module: "POS" });
      escribirSesionDeClaude(lab, {
        root: lab,
        id: SESION,
        lineas: lineasDeTrabajo(lab, TICKET),
        subagentes: [
          mensajeDelAsistente(
            {
              id: "msg_sub",
              modelo: "claude-haiku-4-5",
              uso: { input: 1, creacion: 10, lectura: 100, salida: 5 },
              bloques: [texto("exploro")],
            },
            { cwd: lab },
          ),
        ],
      });

      guardarFotoEnTicket(paths(), TICKET, { home: lab });

      const [entrada] = consumo();
      expect(entrada?.["model"]).toBe("anthropic/claude-sonnet-5-5");
      expect(String(entrada?.["notes"])).toContain("claude-haiku-4-5 (1 mensajes)");
      expect(String(entrada?.["notes"])).toContain("1 subagente(s)");
    });
  });
});

describe("las sesiones de opencode 2.0.16 (session_v2)", () => {
  /**
   * Escribe la forma v2: la sesión en `session_v2` y sus mensajes en
   * `session_message`. El coste y los tokens de sesión vienen en la fila; el
   * coste por mensaje vive dentro del data de cada mensaje assistant.
   */
  function escribirBaseV2(datos: {
    directorio: string;
    sesiones: {
      id: string;
      title: string;
      cost: number | null;
      agente?: string | null;
      modelo?: string;
      tokensInput?: number;
      tokensOutput?: number;
      tokensReasoning?: number;
      tokensCacheRead?: number;
      conMensajes?: boolean;
      mensajes?: {
        tipo: string;
        data: Record<string, unknown>;
      }[];
    }[];
  }): void {
    const modulo = sqlite();
    if (modulo === null) return;
    mkdirSync(join(lab, ".local", "share", "opencode"), { recursive: true });
    const db = new modulo.DatabaseSync(join(lab, ".local", "share", "opencode", "opencode.db"));

    db.exec(`
      CREATE TABLE session_v2 (
        id text PRIMARY KEY, title text, cost real, tokens_input integer,
        tokens_output integer, tokens_reasoning integer, tokens_cache_read integer,
        agent text, model text, directory text, time_created integer
      );
      CREATE TABLE session_message (
        id text PRIMARY KEY, session_id text, type text, data text, time_created integer
      );
    `);

    let t = 1_700_000_000_000;
    for (const s of datos.sesiones) {
      db.prepare(
        "INSERT INTO session_v2 VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        s.id,
        s.title,
        s.cost,
        s.tokensInput ?? 0,
        s.tokensOutput ?? 0,
        s.tokensReasoning ?? 0,
        s.tokensCacheRead ?? 0,
        s.agente ?? null,
        s.modelo ?? null,
        datos.directorio,
        t,
      );
      if (s.conMensajes === false) continue;
      for (const m of s.mensajes ?? []) {
        t += 1000;
        db.prepare("INSERT INTO session_message VALUES (?,?,?,?,?)").run(
          `sm_${s.id}_${t}`,
          s.id,
          m.tipo,
          JSON.stringify(m.data),
          t,
        );
      }
    }
    db.close();
  }

  /** Un mensaje assistant de la v2, con coste y tool entries. */
  function mensajeV2(
    coste: number,
    content: Record<string, unknown>[] = [],
  ): Record<string, unknown> {
    return {
      time: { created: 1_700_000_000_000 },
      agent: "build",
      model: { id: "deepseek-v4.1-flash", providerID: "opencode-go" },
      cost: coste,
      content,
    };
  }

  /** Un tool entry de la v2: el nombre sin prefijo de página y el input en state. */
  function toolV2(nombre: string, input: Record<string, unknown>): Record<string, unknown> {
    return {
      type: "tool",
      name: nombre,
      state: { status: "completed", time: { start: 1_700_000_001_000 }, input },
    };
  }

  it("la sesión del ejecutor entra con su coste y tokens reales de session_v2", async () => {
    escribirBaseV2({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_v2_ejecutor",
          title: "TICKET: BUGFIX-POS-UNO-20260101",
          cost: 0.07315299,
          tokensInput: 174613,
          tokensOutput: 19625,
          tokensReasoning: 34365,
          tokensCacheRead: 4855680,
          mensajes: [
            { tipo: "user", data: { text: "Ticket: BUGFIX-POS-UNO-20260101. Implementá el plan." } },
            { tipo: "assistant", data: mensajeV2(0.03, [{ type: "reasoning", text: "leo" }]) },
            { tipo: "assistant", data: mensajeV2(0.04315299, [{ type: "text", text: "listo" }]) },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: "BUGFIX-POS-UNO-20260101" });

    expect(linea?.sessions).toHaveLength(1);
    const sesion = linea?.sessions[0];
    expect(sesion?.source).toBe("opencode");
    expect(sesion?.costUsd).toBeCloseTo(0.07315299, 9);
    expect(sesion?.inputTokens).toBe(174613);
    expect(sesion?.outputTokens).toBe(19625);
    expect(sesion?.model).toContain("deepseek-v4.1-flash");
    // Sin llamadas al registro, la sesión es exploración: es desarrollo, y se dice
    // con el desglose, no se esconde en «harness».
    expect(linea?.desglose.harnessUsd).toBe(0);
    expect(linea?.desglose.costeNoAtribuibleUsd).toBe(0);
    expect(linea?.totalCostUsd).toBeCloseTo(0.07315299, 9);
  });

  it("una llamada MCP del harness en la v2 cuenta harness y atribuye por sus argumentos", async () => {
    escribirBaseV2({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_v2_mcp",
          title: "trabajo con registro",
          cost: 0.02,
          mensajes: [
            {
              tipo: "assistant",
              data: mensajeV2(0.02, [
                toolV2("valmen_mover_ticket", { id: "BUGFIX-POS-UNO-20260101" }),
              ]),
            },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: "BUGFIX-POS-UNO-20260101" });
    expect(linea?.sessions).toHaveLength(1);
    expect(linea?.desglose.harnessUsd).toBeCloseTo(0.02, 6);
    expect(linea?.sessions[0]?.intervenciones).toBe(1);
  });

  it("el desglose del ticket suma solo sus sesiones v2 y no las de otro ticket", async () => {
    const ticket = "BUGFIX-POS-UNO-20260101";
    const otro = "BUGFIX-POS-DOS-20260102";
    // Una sesión v2 de **otro** ticket con llamadas al harness y coste, una del
    // ticket pedido, y una sesión de Claude Code del ticket, sin coste.
    escribirBaseV2({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_v2_ajena",
          title: `Ticket: ${otro}`,
          cost: 0.5,
          mensajes: [
            { tipo: "user", data: { text: `Ticket: ${otro}. Implementá el plan.` } },
            {
              tipo: "assistant",
              data: mensajeV2(0.3, [toolV2("valmen_mover_ticket", { id: otro })]),
            },
            { tipo: "assistant", data: mensajeV2(0.2, [{ type: "text", text: "listo" }]) },
          ],
        },
        {
          id: "ses_v2_propia",
          title: `Ticket: ${ticket}`,
          cost: 0.06,
          mensajes: [
            {
              tipo: "assistant",
              data: mensajeV2(0.04, [toolV2("valmen_mover_ticket", { id: ticket })]),
            },
            { tipo: "assistant", data: mensajeV2(0.02, [{ type: "text", text: "listo" }]) },
          ],
        },
      ],
    });
    escribirSesionDeClaude(lab, {
      root: "/proyecto",
      id: "claude-v2-del-ticket",
      lineas: [
        mensajeDelUsuario(`Trabaja el ticket ${ticket}`, { cwd: "/proyecto" }),
        ...mensajeDelAsistente(
          {
            id: "msg_1",
            bloques: [llamada("t1", "mcp__valmen__mover_ticket", { id: ticket, to: "analyzed" })],
          },
          { cwd: "/proyecto" },
        ),
        ...mensajeDelAsistente(
          { id: "msg_2", bloques: [texto("Listo.")] },
          { cwd: "/proyecto" },
        ),
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: ticket });

    expect(linea?.sessions.map((s) => `${s.source}:${s.id}`).sort()).toEqual([
      "claude:claude-v2-del-ticket",
      "opencode:ses_v2_propia",
    ]);
    expect(linea?.totalCostUsd).toBeCloseTo(0.06, 9);
    // Del coste del ticket: 0.04 en el mensaje del harness y 0.02 en el otro. Nada
    // de los 0.5 de la sesión ajena.
    expect(linea?.desglose.harnessUsd).toBeCloseTo(0.04, 9);
    expect(linea?.desglose.exploracionUsd).toBeCloseTo(0.02, 9);
    // Un mensaje del harness y uno de exploración en la v2, y lo mismo en Claude Code.
    expect(linea?.desglose.harnessMensajes).toBe(2);
    expect(linea?.desglose.exploracionMensajes).toBe(2);
  });

  it("una sesión presente en session y en session_v2 aparece una sola vez", async () => {
    // La misma sesión registrada en las dos tablas: la entrada que ya se leyó de
    // la forma vieja gana, y la v2 no la duplica.
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_doble",
          title: "Sesión en las dos tablas",
          cost: 0.05,
          mensajes: [
            { id: "m1", data: mensaje(0.05), partes: [{ tool: "read", status: "completed" }] },
          ],
        },
      ],
    });
    escribirBaseV2({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_doble",
          title: "Sesión en las dos tablas",
          cost: 0.05,
          conMensajes: false,
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const r = leerLineaDeTiempo("/proyecto", { home: lab });
    expect(r?.sessions).toHaveLength(1);
    expect(r?.totalCostUsd).toBeCloseTo(0.05, 9);
  });

  it("una base sin session_v2 (opencode viejo) sigue devolviendo la línea de siempre", async () => {
    // La misma escribirBase de las tablas viejas, sin session_v2: el lector de v2
    // falla al consultar la tabla y el catch lo convierte en «siga como estaba».
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_vieja",
          title: "Sesión vieja",
          cost: 0.01,
          mensajes: [
            { id: "m1", data: mensaje(0.01), partes: [{ tool: "read", status: "completed" }] },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const r = leerLineaDeTiempo("/proyecto", { home: lab });
    expect(r).not.toBeNull();
    expect(r?.sessions).toHaveLength(1);
    expect(r?.totalCostUsd).toBeCloseTo(0.01, 9);
  });
});

/** El ticket que se trabaja en la prueba del reparto. */
const TICKET = "BUGFIX-POS-UNO-20260101";

/**
 * Una base de Hermes de mentira, con lo que su lector consulta.
 *
 * El reparto de la línea de tiempo solo miraba la base de opencode, así que una
 * sesión de Hermes —`hermes:desktop`, la que trabaja el harness desde la app—
 * entraba con su coste entero y sin una sola intervención contada: el registro
 * decía «harness $0.000000» y le adjudicaba a la exploración un gasto que fue
 * trabajo sobre el ticket.
 */
function escribirBaseDeHermes(datos: {
  directorio: string;
  sesiones: {
    id: string;
    coste: number;
    mensajes: { id: string; toolCalls: string }[];
  }[];
}): void {
  const modulo = sqlite();
  if (modulo === null) return;

  mkdirSync(join(lab, ".hermes"), { recursive: true });
  const db = new modulo.DatabaseSync(join(lab, ".hermes", "state.db"));
  db.exec(`
        CREATE TABLE sessions (
        id text PRIMARY KEY, source text, title text, display_name text, model text,
        billing_provider text, cwd text, git_repo_root text, api_call_count integer,
        tool_call_count integer, input_tokens integer, output_tokens integer,
        reasoning_tokens integer, cache_read_tokens integer, estimated_cost_usd real,
        actual_cost_usd real, cost_status text, started_at real, ended_at real,
        end_reason text
        );
        CREATE TABLE messages (id text PRIMARY KEY, session_id text, content text, tool_calls text);
        `);

  for (const s of datos.sesiones) {
    db.prepare(
      `INSERT INTO sessions VALUES (?, 'desktop', 'Sesión de trabajo', NULL,
           'deepseek-v4.1-flash', 'opencode-go', ?, NULL, 12, 5, 4000, 300, 40, 200,
           ?, 0, 'estimated', ?, NULL, NULL)`,
    ).run(s.id, datos.directorio, s.coste, Date.now() / 1000);
    for (const m of s.mensajes) {
      db.prepare("INSERT INTO messages VALUES (?,?,NULL,?)").run(m.id, s.id, m.toolCalls);
    }
  }
  db.close();
}

describe.skipIf(sqlite === null)("el trabajo del harness desde Hermes", () => {
  it("cuenta sus intervenciones y no le llama exploración a su gasto", async () => {
    // La sesión de opencode: un mensaje, del harness, con su coste.
    escribirBase({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "ses_opencode",
          title: "Sesión de opencode",
          cost: 0.02,
          mensajes: [
            {
              id: "m1",
              data: mensaje(0.02),
              partes: [{ tool: "valmen_mover_ticket", status: "completed" }],
            },
          ],
        },
      ],
    });

    const modulo = sqlite();
    if (modulo === null) return;
    const db = new modulo.DatabaseSync(
      join(lab, ".local", "share", "opencode", "opencode.db"),
    );
    db.prepare("UPDATE part SET data = ? WHERE message_id = ?").run(
      JSON.stringify({
        type: "tool",
        tool: "valmen_mover_ticket",
        state: { status: "completed", time: { start: 1 }, input: { id: TICKET } },
      }),
      "m1",
    );
    db.close();

    // La sesión de Hermes: tres mensajes, dos del harness —uno por MCP y otro por
    // el CLI—, y un coste que Hermes solo sabe por sesión, no por mensaje.
    escribirBaseDeHermes({
      directorio: "/proyecto",
      sesiones: [
        {
          id: "20260926_182737_425c0d",
          coste: 0.07,
          mensajes: [
            {
              id: "h1",
              toolCalls: `[{"function":{"name":"mcp__valmen__mover_ticket","arguments":"{\\"id\\":\\"${TICKET}\\"}"}}]`,
            },
            {
              id: "h2",
              toolCalls: `[{"function":{"name":"terminal","arguments":"{\\"command\\":\\"valmen gate plan --id ${TICKET}\\"}"}}]`,
            },
            {
              id: "h3",
              toolCalls: '[{"function":{"name":"read_file","arguments":"{}"}}]',
            },
          ],
        },
      ],
    });

    const { leerLineaDeTiempo } = await cargar();
    const linea = leerLineaDeTiempo("/proyecto", { home: lab, ticketId: TICKET });

    // Las sesiones de las dos herramientas entran: quien mira quiere el consumo de
    // su ticket, no el de la herramienta con la que se hizo.
    expect(linea?.sessions).toHaveLength(2);
    // Un mensaje del harness en opencode más dos en Hermes.
    expect(linea?.desglose.harnessMensajes).toBe(3);
    expect(linea?.desglose.exploracionMensajes).toBe(1);
    // El coste de opencode es del mensaje, y ese mensaje era del harness.
    expect(linea?.desglose.harnessUsd).toBeCloseTo(0.02, 6);
    // El de Hermes no se puede repartir, así que no se afirma que sea exploración.
    expect(linea?.desglose.exploracionUsd).toBeCloseTo(0, 6);
    expect(linea?.desglose.costeNoAtribuibleUsd).toBeCloseTo(0.07, 6);
    // Y sí se dice cuántos mensajes de cuántos fueron trabajo sobre el registro.
    const deHermes = linea?.sessions.find((s) => s.source === "hermes");
    expect(mensajesDelRegistroEnTexto(deHermes!)).toBe(
      "2 de 3 mensajes tocaron el registro. ",
    );
  });

  it("el resumen no llama «harness» a lo que no lo es, ni afirma un cero", async () => {
    // Lo que veía el PO: «harness $0.000000, exploración $0.229688» en un ticket
    // cuyas compuertas costaron de verdad. El nombre era del reparto de la sesión,
    // pero se leía como si el harness no hubiera costado nada.
    const { renderDesglose } = await cargar();
    const deHermes = renderDesglose(
      {
        harnessUsd: 0,
        exploracionUsd: 0,
        harnessMensajes: 79,
        exploracionMensajes: 165,
        costeNoAtribuibleUsd: 0.229688,
      },
      0.229688,
    );

    expect(deHermes).not.toContain("harness");
    expect(deHermes).toContain("79 mensaje(s) que tocaron el registro");
    // Un cero con mensajes no es gratis: es una sesión sin coste por mensaje.
    expect(deHermes).not.toContain("$0.000000");
    expect(deHermes).toContain("sin repartir");

    // Con coste por mensaje, el reparto sí se puede afirmar.
    const deOpencode = renderDesglose(
      {
        harnessUsd: 0.02,
        exploracionUsd: 0.01,
        harnessMensajes: 3,
        exploracionMensajes: 5,
        costeNoAtribuibleUsd: 0,
      },
      0.03,
    );
    expect(deOpencode).toContain("$0.020000 en 3 mensaje(s) que tocaron el registro");
    expect(deOpencode).not.toContain("sin repartir");
  });
});

describe("el desglose de compuertas del endpoint /api/timeline", () => {
  /**
   * El costo de decidir también es costo del ticket. Los recibos traen el uso
   * de primera mano —el harness lo pagó— y ninguna vista los sumaba: se leen
   * acá a través del endpoint, con un recibo Jev con coste y uno mecánico sin
   * modelo, que es la pareja real de cualquier ticket del registro.
   */
  it("el endpoint agrega compuertas con tokens y coste de los recibos", async () => {
    const { handleApi } = await import("../packages/server/src/server.js");
    const { writeFixtureTicket } = await import("./helpers/fixtures.js");
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const lab = mkdtempSync(join(tmpdir(), "valmen-timeline-gates-"));
    try {
      mkdirSync(join(lab, "tickets"), { recursive: true });
      const id = "FEATURE-COMPUERTAS-VISIBLES-20260928";
      writeFixtureTicket(lab, { id });

      const reciboJev = {
        kind: "gate-receipt",
        receiptVersion: 1,
        schemaVersion: "1",
        id: "GT-001",
        gate: "analysis",
        gateHash: "a".repeat(64),
        subject: { type: "ticket", id, revision: 1 },
        outcome: "approve",
        reason: "ok",
        actor: "model",
        decidedAt: "2026-09-28T09:00:00Z",
        stateHash: "b".repeat(64),
        policy: { approveAt: 0.9, blockAt: 0.1 },
        mechanicalChecks: [],
        modelAnswers: [],
        propositions: [],
        model: { provider: "TypeSafe", model: "typesafe/jev-1.13", resolvedVersion: "x" },
        usage: { inputTokens: 3050, outputTokens: 148, costUsd: 0.0001281 },
        latencyMs: 900,
        escalatedTo: null,
        humanDecision: null,
      };
      const reciboMecanico = {
        ...reciboJev,
        id: "GT-002",
        gate: "qa-mechanical",
        model: null,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
      mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
      writeFileSync(
        join(lab, ".valmen", "receipts", `${id}.jsonl`),
        `${JSON.stringify(reciboJev)}\n${JSON.stringify(reciboMecanico)}\n`,
        "utf8",
      );

      const respuesta = await handleApi(
        "GET",
        "/api/timeline",
        {},
        {
          root: lab,
          paths: { root: lab, ticketsDir: "tickets" },
          credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
          env: {},
        },
        new URLSearchParams({ ticket: id }),
      );
      expect(respuesta.status).toBe(200);
      const cuerpo = respuesta.body as { compuertas: { gate: string; costUsd: number; model: string | null }[] };
      expect(cuerpo.compuertas.map((c) => c.gate)).toEqual(["analysis", "qa-mechanical"]);
      const [jev, mecanico] = cuerpo.compuertas;
      expect(jev?.model).toBe("TypeSafe/typesafe/jev-1.13");
      expect(jev?.costUsd).toBeCloseTo(0.0001281, 7);
      // El mecánico no miente con un modelo que no tuvo: se rotula.
      expect(mecanico?.model).toBeNull();
    } finally {
      rmSync(lab, { recursive: true, force: true });
    }
  });
});
