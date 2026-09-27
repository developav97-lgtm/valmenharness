/**
 * Las sesiones de Hermes.
 *
 * Hermes es el cuarto agente que trabaja el registro: se le pide por Slack y
 * ejecuta con **su propio** agente, llamando a las herramientas del harness por
 * MCP. El primer ticket que trabajó así quedó con la línea de tiempo vacía —el
 * harness leía opencode y codex—, y el registro no decía nada del trabajo ni de su
 * coste.
 *
 * Lo que se afirma acá es la atribución, que es la parte que puede mentir: la
 * sesión pertenece al ticket que **trabajó**, no al que consultó de paso. Y que un
 * coste desconocido no se convierta en cero.
 *
 * La base se fabrica en el test con el esquema real —`sessions`, `messages`,
 * `session_model_usage`— porque el lector depende de sus columnas: probarlo contra
 * un objeto de mentira diría que el código funciona sin decir nada de la base que
 * hay en la máquina de alguien.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HERRAMIENTAS_DE_LECTURA,
  HERRAMIENTAS_QUE_ESCRIBEN,
  esIntervencionDelHarness,
  leerSesionesDeHermes,
  ticketsDeTexto,
} from "../packages/server/src/hermes.js";

const requerir = createRequire(import.meta.url);

/**
 * El módulo `node:sqlite`, cargado aparte.
 *
 * Con `import` no se puede: el empaquetador de las pruebas no conoce el prefijo
 * `node:` para este módulo y falla al resolverlo. Y cargarlo aparte permite
 * saltar las pruebas en una versión de Node que no lo traiga, en vez de romper.
 */
const sqlite = (() => {
  try {
    return requerir("node:sqlite") as { DatabaseSync: new (ruta: string) => DatabaseSync };
  } catch {
    return null;
  }
})();

/** Lo mínimo de la base que usan estas pruebas. */
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): { run(...valores: unknown[]): void };
  close(): void;
}

let lab: string;
let base: string;

/** El esquema de Hermes, con las columnas que el lector usa. */
function crearBase(ruta: string): DatabaseSync {
  if (sqlite === null) throw new Error("Esta versión de Node no trae `node:sqlite`.");
  mkdirSync(join(ruta, ".."), { recursive: true });
  const db = new sqlite.DatabaseSync(ruta);
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT, title TEXT, display_name TEXT, model TEXT,
      billing_provider TEXT, cwd TEXT, git_repo_root TEXT, api_call_count INTEGER,
      tool_call_count INTEGER, input_tokens INTEGER, output_tokens INTEGER,
      reasoning_tokens INTEGER, cache_read_tokens INTEGER, estimated_cost_usd REAL,
      actual_cost_usd REAL, cost_status TEXT, started_at REAL, ended_at REAL,
      end_reason TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, session_id TEXT, content TEXT, tool_calls TEXT
    );
  `);
  return db;
}

/** Una sesión, con lo que el lector mira. */
function sesion(
  db: DatabaseSync,
  id: string,
  opciones: {
    readonly cwd?: string;
    readonly startedAt?: number;
    readonly coste?: number | null;
    readonly costeReal?: number | null;
    readonly tokens?: number;
    readonly title?: string;
    readonly ended?: boolean;
  } = {},
): void {
  db.prepare(
    `INSERT INTO sessions (id, source, title, display_name, model, billing_provider, cwd,
       git_repo_root, api_call_count, tool_call_count, input_tokens, output_tokens,
       reasoning_tokens, cache_read_tokens, estimated_cost_usd, actual_cost_usd,
       cost_status, started_at, ended_at, end_reason)
     VALUES (?, 'slack', ?, NULL, 'deepseek-v4.1-flash', 'opencode-go', ?, NULL, 12, 5,
             ?, 300, 40, 200, ?, ?, 'estimated', ?, ?, NULL)`,
  ).run(
    id,
    opciones.title ?? "Sesión de trabajo",
    opciones.cwd ?? "/proyectos/tienda",
    opciones.tokens ?? 4000,
    opciones.coste === undefined ? 0.07 : opciones.coste,
    opciones.costeReal === undefined ? 0 : opciones.costeReal,
    opciones.startedAt ?? Date.now() / 1000,
    opciones.ended === false ? null : Date.now() / 1000,
  );
}

/** Un mensaje con llamadas a herramientas del harness. */
function mensaje(db: DatabaseSync, id: string, sessionId: string, toolCalls: string): void {
  db.prepare(
    "INSERT INTO messages (id, session_id, content, tool_calls) VALUES (?, ?, NULL, ?)",
  ).run(id, sessionId, toolCalls);
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-hermes-"));
  base = join(lab, ".hermes", "state.db");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe.skipIf(sqlite === null)("los identificadores que menciona un texto", () => {
  it("reconoce los del contrato y descarta lo que se le parece", () => {
    const cuenta = ticketsDeTexto(
      "Trabajando FEATURE-AUDITORIA-DOCUMENTO-20260924 y mirando SYNC-EDICION-RESYNC-SAIOPEN-20260924. " +
        "FEATURE-AUDITORIA-DOCUMENTO-20260924 otra vez. NO-ES-UN-TICKET-20260924.",
    );
    expect([...cuenta.keys()].sort()).toEqual([
      "FEATURE-AUDITORIA-DOCUMENTO-20260924",
      "SYNC-EDICION-RESYNC-SAIOPEN-20260924",
    ]);
    expect(cuenta.get("FEATURE-AUDITORIA-DOCUMENTO-20260924")).toBe(2);
  });
});

describe.skipIf(sqlite === null)("las sesiones de Hermes", () => {
  it("lee la base principal y la de cada perfil", () => {
    const principal = crearBase(base);
    sesion(principal, "20260924_100000_aaaaaa", { cwd: "/proyectos/tienda" });
    principal.close();

    const perfil = crearBase(join(lab, ".hermes", "profiles", "tienda", "state.db"));
    sesion(perfil, "20260924_110000_bbbbbb", { cwd: "/proyectos/tienda" });
    perfil.close();

    const sesiones = leerSesionesDeHermes("/proyectos/tienda", { home: lab });
    expect(sesiones.map((s) => s.id).sort()).toEqual([
      "20260924_100000_aaaaaa",
      "20260924_110000_bbbbbb",
    ]);
  });

  it("la sesión es del ticket que trabajó, no del que consultó", () => {
    // Una sesión lee los tickets que dependen del suyo: contar menciones sin
    // distinguir llamadas de texto atribuiría el trabajo al ticket equivocado.
    const db = crearBase(base);
    sesion(db, "20260924_120000_cccccc");
    mensaje(
      db,
      "m1",
      "20260924_120000_cccccc",
      '[{"function":{"name":"mcp__valmen__mover_ticket","arguments":"{\\"id\\":\\"FEATURE-UNO-20260924\\"}"}}]',
    );
    mensaje(
      db,
      "m2",
      "20260924_120000_cccccc",
      '[{"function":{"name":"mcp__valmen__mover_ticket","arguments":"{\\"id\\":\\"FEATURE-UNO-20260924\\"}"}}]',
    );
    mensaje(
      db,
      "m3",
      "20260924_120000_cccccc",
      '[{"function":{"name":"mcp__valmen__ver_ticket","arguments":"{\\"id\\":\\"FEATURE-DOS-20260924\\"}"}}]',
    );
    db.close();

    const sesiones = leerSesionesDeHermes("/proyectos/tienda", { home: lab });
    expect(sesiones[0]?.ticket).toBe("FEATURE-UNO-20260924");
  });

  it("una sesión que trabaja el registro por el CLI tiene el ticket por trabajado", () => {
    // El caso que dejaba la línea de tiempo vacía: la sesión no llama ninguna
    // herramienta con nombre del harness —ejecuta el CLI desde la shell—, así que
    // el ticket sólo contaba como mencionado. Y mencionar no basta: acá otro ticket
    // se nombra más veces que las que se trabajó, así que sin contar el CLI como
    // escritura el ticket trabajado se perdía detrás de las menciones.
    const db = crearBase(base);
    sesion(db, "20260924_140000_ffffff");
    for (const id of ["m1", "m2", "m3", "m4"]) {
      mensaje(
        db,
        id,
        "20260924_140000_ffffff",
        '[{"function":{"name":"mcp__valmen__ver_ticket","arguments":"{\\"id\\":\\"BUGFIX-OTRO-20260924\\"}"}}]',
      );
    }
    // El CLI tal como se lo ejecuta desde el propio repositorio, que es como se
    // trabaja el harness cuando se lo está desarrollando: no aparece la palabra
    // `valmen` en ninguna parte del comando.
    mensaje(
      db,
      "m5",
      "20260924_140000_ffffff",
      '[{"function":{"name":"terminal","arguments":"{\\"command\\":\\"node /Users/q/Desktop/ValmenHarness/packages/cli/dist/main.js --root /Users/q/Desktop/ValmenHarness validate --id FEATURE-UNO-20260924\\"}"}}]',
    );
    db.close();

    const suyas = leerSesionesDeHermes("/proyectos/tienda", {
      home: lab,
      ticketId: "FEATURE-UNO-20260924",
    });
    expect(suyas.map((s) => s.id)).toEqual(["20260924_140000_ffffff"]);
  });

  it("filtra por ticket cuando se pide uno", () => {
    const db = crearBase(base);
    sesion(db, "20260924_130000_dddddd");
    mensaje(
      db,
      "m1",
      "20260924_130000_dddddd",
      '{"id":"FEATURE-AUDITORIA-DOCUMENTO-20260924"}',
    );
    sesion(db, "20260924_130001_eeeeee");
    mensaje(db, "m2", "20260924_130001_eeeeee", '{"id":"BUGFIX-POS-OTRO-20260924"}');
    db.close();

    const suyas = leerSesionesDeHermes("/proyectos/tienda", {
      home: lab,
      ticketId: "FEATURE-AUDITORIA-DOCUMENTO-20260924",
    });
    expect(suyas.map((s) => s.id)).toEqual(["20260924_130000_dddddd"]);
  });

  it("una sesión que trabajó dos tickets no se atribuye a uno solo", () => {
    // El caso real: una sesión de Slack de dos horas y media movió dos tickets y
    // su costo entero quedó registrado en el que más nombró. Una sesión así tiene
    // un solo gasto y ningún modo de repartirlo, y decirlo es la única respuesta
    // honesta.
    const db = crearBase(base);
    sesion(db, "20260924_180000_jjjjjj", { coste: 0.0755 });
    for (const [id, ticket] of [
      ["m1", "FEATURE-AUDITORIA-DOCUMENTO-20260924"],
      ["m2", "FEATURE-CREACION-MANUAL-CORE-20260924"],
    ] as const) {
      mensaje(
        db,
        id,
        "20260924_180000_jjjjjj",
        `[{"function":{"name":"mcp__valmen__mover_ticket","arguments":"{\\"id\\":\\"${ticket}\\"}"}}]`,
      );
    }
    db.close();

    const sesionLeida = leerSesionesDeHermes("/proyectos/tienda", { home: lab })[0];
    expect(sesionLeida?.compartida).toBe(true);
    expect(sesionLeida?.ticket).toBeNull();
    // Y se puede decir entre cuáles, que es lo que permite ir a buscar el costo.
    expect(sesionLeida?.tickets.map((t) => t.id).sort()).toEqual([
      "FEATURE-AUDITORIA-DOCUMENTO-20260924",
      "FEATURE-CREACION-MANUAL-CORE-20260924",
    ]);
    expect(sesionLeida?.tickets.every((t) => t.trabajado)).toBe(true);
  });

  it("una sesión compartida entra en la vista de cada ticket que trabajó", () => {
    // Esconderla dejaría la vista diciendo que nadie de Hermes la tocó; contarla
    // sin marca le adjudicaría a este ticket el gasto del otro. Entra marcada.
    const db = crearBase(base);
    sesion(db, "20260924_190000_kkkkkk");
    for (const [id, ticket] of [
      ["m1", "FEATURE-UNO-20260924"],
      ["m2", "FEATURE-DOS-20260924"],
    ] as const) {
      mensaje(
        db,
        id,
        "20260924_190000_kkkkkk",
        `[{"function":{"name":"valmen_anotar_evidencia","arguments":"{\\"id\\":\\"${ticket}\\"}"}}]`,
      );
    }
    db.close();

    for (const ticketId of ["FEATURE-UNO-20260924", "FEATURE-DOS-20260924"]) {
      const suyas = leerSesionesDeHermes("/proyectos/tienda", { home: lab, ticketId });
      expect(
        suyas.map((s) => s.id),
        ticketId,
      ).toEqual(["20260924_190000_kkkkkk"]);
    }
  });

  it("consultar un ticket no lo convierte en trabajo de la sesión", () => {
    // Sin esta distinción, la vista de un ticket se llena con las sesiones que
    // alguna vez lo nombraron, y el costo de un ticket pasa a incluir el de todo
    // lo que se miró desde ahí.
    const db = crearBase(base);
    sesion(db, "20260924_200000_llllll");
    // Trabajó UNO: lo movió. Y de paso consultó DOS.
    mensaje(
      db,
      "m1",
      "20260924_200000_llllll",
      '[{"function":{"name":"mcp__valmen__mover_ticket","arguments":"{\\"id\\":\\"FEATURE-UNO-20260924\\"}"}}]',
    );
    mensaje(
      db,
      "m2",
      "20260924_200000_llllll",
      '[{"function":{"name":"mcp__valmen__ver_ticket","arguments":"{\\"id\\":\\"FEATURE-DOS-20260924\\"}"}}]',
    );
    mensaje(
      db,
      "m3",
      "20260924_200000_llllll",
      '[{"function":{"name":"mcp__valmen__listar_tickets","arguments":"{\\"modulo\\":\\"FEATURE-DOS-20260924\\"}"}}]',
    );
    db.close();

    // La vista de DOS no la incluye: consultarlo no fue trabajar en él, aunque lo
    // nombre más veces que al ticket que sí movió.
    expect(
      leerSesionesDeHermes("/proyectos/tienda", {
        home: lab,
        ticketId: "FEATURE-DOS-20260924",
      }),
    ).toEqual([]);
    expect(
      leerSesionesDeHermes("/proyectos/tienda", {
        home: lab,
        ticketId: "FEATURE-UNO-20260924",
      }).map((s) => s.id),
    ).toEqual(["20260924_200000_llllll"]);

    const sesionLeida = leerSesionesDeHermes("/proyectos/tienda", { home: lab })[0];
    expect(sesionLeida?.compartida).toBe(false);
    expect(sesionLeida?.ticket).toBe("FEATURE-UNO-20260924");
    expect(
      sesionLeida?.tickets.find((t) => t.id === "FEATURE-DOS-20260924")?.trabajado,
    ).toBe(false);
  });

  it("la lista de herramientas de lectura coincide con el catálogo MCP", async () => {
    // La distinción entre trabajar y consultar se apoya en esta lista, y una
    // herramienta de lectura nueva que no se agregue acá haría que consultarla
    // cuente como trabajo. El catálogo ya declara cuáles son: `readOnlyHint`.
    const { TOOLS } = await import("../packages/mcp/src/tools.js");
    const leenEnElCatalogo = TOOLS.filter((t) => t.annotations.readOnlyHint)
      .map((t) => t.name)
      .sort();
    expect([...HERRAMIENTAS_DE_LECTURA].sort()).toEqual(leenEnElCatalogo);

    // Y las que escriben son exactamente el resto: una herramienta nueva tiene que
    // caer de un lado o del otro, no quedar sin clasificar.
    const escribenEnElCatalogo = TOOLS.filter((t) => !t.annotations.readOnlyHint)
      .map((t) => t.name)
      .sort();
    expect([...HERRAMIENTAS_QUE_ESCRIBEN].sort()).toEqual(escribenEnElCatalogo);
  });

  it("no lee sesiones de otro proyecto", () => {
    const db = crearBase(base);
    sesion(db, "20260924_140000_ffffff", { cwd: "/otro/proyecto" });
    db.close();
    expect(leerSesionesDeHermes("/proyectos/tienda", { home: lab })).toEqual([]);
  });

  it("un coste desconocido no se convierte en cero", () => {
    // Es el caso del proveedor por suscripción: hay tokens y no hay precio.
    const db = crearBase(base);
    sesion(db, "20260924_150000_gggggg", { coste: 0, costeReal: 0 });
    db.close();

    const sesiones = leerSesionesDeHermes("/proyectos/tienda", { home: lab });
    expect(sesiones[0]?.costUsd).toBeNull();
    expect(sesiones[0]?.inputTokens).toBe(4000);
  });

  it("el coste real manda sobre el estimado", () => {
    const db = crearBase(base);
    sesion(db, "20260924_160000_hhhhhh", { coste: 0.9, costeReal: 0.12 });
    db.close();
    expect(leerSesionesDeHermes("/proyectos/tienda", { home: lab })[0]?.costUsd).toBe(0.12);
  });

  it("una base ilegible no rompe la lectura", () => {
    // El archivo existe y no es una base: es la contabilidad de otra herramienta, y
    // no poder leerla no puede tumbar la línea de tiempo del proyecto.
    mkdirSync(join(lab, ".hermes"), { recursive: true });
    const db = crearBase(base);
    sesion(db, "20260924_170000_iiiiii");
    db.close();

    const rota = crearBase(join(lab, ".hermes", "profiles", "roto", "state.db"));
    rota.exec("DROP TABLE messages");
    rota.close();

    const sesiones = leerSesionesDeHermes("/proyectos/tienda", { home: lab });
    expect(sesiones.map((s) => s.id)).toEqual(["20260924_170000_iiiiii"]);
  });

  it("sin base de Hermes devuelve una lista vacía, no un error", () => {
    expect(leerSesionesDeHermes("/proyectos/tienda", { home: lab })).toEqual([]);
  });
});

describe("qué cuenta como intervención sobre el harness", () => {
  // El reparto de la línea de tiempo buscaba el prefijo `valmen_` de opencode, y
  // desde Hermes las herramientas llegan con otro nombre —`mcp__valmen__…`,
  // `mcp__valmen_<perfil>__…`— o no llegan: el harness se maneja por la shell y
  // entonces no hay nombre de herramienta, hay un comando. Las tres formas son la
  // misma intervención, y ninguna se contaba.
  it("reconoce las dos convenciones de nombre y el CLI", () => {
    expect(
      esIntervencionDelHarness(
        '{"id":"1","function":{"name":"mcp__valmen__mover_ticket","arguments":"{}"}}',
      ),
    ).toBe(true);
    expect(
      esIntervencionDelHarness(
        '{"id":"2","function":{"name":"mcp__valmen_saicloud__listar_tickets","arguments":"{}"}}',
      ),
    ).toBe(true);
    expect(
      esIntervencionDelHarness(
        '{"id":"3","function":{"name":"terminal","arguments":"{\\"command\\":\\"valmen gate plan --id X\\"}"}}',
      ),
    ).toBe(true);
  });

  it("no cuenta lo que no toca el registro", () => {
    expect(
      esIntervencionDelHarness(
        '{"id":"4","function":{"name":"read_file","arguments":"{\\"path\\":\\"/Users/q/Desktop/ValmenHarness/src/x.ts\\"}"}}',
      ),
    ).toBe(false);
    expect(
      esIntervencionDelHarness(
        '{"id":"5","function":{"name":"execute_code","arguments":"{\\"code\\":\\"print(1)\\"}"}}',
      ),
    ).toBe(false);
    expect(
      esIntervencionDelHarness(
        '{"id":"6","function":{"name":"mcp__otrosistema__listar_cosas","arguments":"{}"}}',
      ),
    ).toBe(false);
    expect(esIntervencionDelHarness("")).toBe(false);
  });

  it("una llamada sin subcomando no es una intervención del CLI", () => {
    // La ruta del propio repositorio contiene la palabra y no es una llamada: el
    // subcomando es lo que distingue una invocación de una mención.
    expect(
      esIntervencionDelHarness(
        '{"id":"7","function":{"name":"terminal","arguments":"{\\"command\\":\\"ls /Users/q/valmen/\\"}"}}',
      ),
    ).toBe(false);
  });

  it("reconoce el CLI del propio repositorio, no sólo el comando instalado", () => {
    // Trabajar el harness desde su repositorio es invocarlo por su ruta, con las
    // banderas antes del subcomando: `node …/packages/cli/dist/main.js --root … validate`.
    expect(
      esIntervencionDelHarness(
        '{"id":"8","function":{"name":"terminal","arguments":"{\\"command\\":\\"node /Users/q/Desktop/ValmenHarness/packages/cli/dist/main.js --root /Users/q/Desktop/ValmenHarness validate --id FEATURE-UNO-20260924\\"}"}}',
      ),
    ).toBe(true);
    expect(
      esIntervencionDelHarness(
        '{"id":"9","function":{"name":"terminal","arguments":"{\\"command\\":\\"node main.js --root /x resume --id FEATURE-UNO-20260924\\"}"}}',
      ),
    ).toBe(true);
  });
});

describe.skipIf(sqlite === null)(
  "las intervenciones sobre el harness en una sesión",
  () => {
    it("cuenta los mensajes que tocaron el registro, y cuántos mensajes hay", () => {
      const db = crearBase(base);
      sesion(db, "20260924_180000_jjjjjj");
      // Dos mensajes del harness —uno por MCP y otro por el CLI— y uno de trabajo
      // propio: el número tiene que decir 2 de 3, no 0 de 3.
      mensaje(
        db,
        "h1",
        "20260924_180000_jjjjjj",
        '[{"function":{"name":"mcp__valmen__mover_ticket","arguments":"{\\"id\\":\\"FEATURE-UNO-20260924\\"}"}}]',
      );
      mensaje(
        db,
        "h2",
        "20260924_180000_jjjjjj",
        '[{"function":{"name":"terminal","arguments":"{\\"command\\":\\"valmen validate --id FEATURE-UNO-20260924\\"}"}}]',
      );
      mensaje(
        db,
        "h3",
        "20260924_180000_jjjjjj",
        '[{"function":{"name":"read_file","arguments":"{\\"path\\":\\"/x/y.ts\\"}"}}]',
      );
      db.close();

      const sesiones = leerSesionesDeHermes("/proyectos/tienda", { home: lab });
      expect(sesiones[0]?.intervencionesDelHarness).toBe(2);
      expect(sesiones[0]?.mensajes).toBe(3);
    });
  },
);
