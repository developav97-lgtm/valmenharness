/**
 * La línea de tiempo de un ticket: quién intervino, con qué modelo y a qué coste.
 *
 * El problema que resuelve es que el coste del trabajo de un agente **no estaba en
 * ninguna parte del registro**. Los recibos de compuerta sí lo traen —el harness
 * evaluó y lo sabe de primera mano—, pero la parte más cara, que es el agente
 * explorando el código y escribiendo, quedaba fuera. El bloque `## Consumo de IA`
 * del ticket existe desde el principio y estaba siempre vacío porque nada lo
 * alimentaba.
 *
 * **El dato se lee, no se pregunta.** La alternativa era pedirle al agente que
 * reportara su gasto, y eso viola el invariante «el estado vive en disco, no en la
 * conversación»: un modelo puede reportar de menos y no habría forma de notarlo.
 * opencode escribe la contabilidad de verdad en su propia base —coste por mensaje,
 * tokens con su caché, proveedor, modelo y agente—, así que se lee de ahí. La suma
 * de los mensajes cuadra al céntimo con el total de la sesión, y eso se comprobó.
 *
 * Lo que este módulo **no** hace es fingir que hay datos donde no los hay. Sin
 * opencode instalado, sin base, o con un registro que no corresponde, la respuesta
 * es «no hay datos» y no una lista vacía que se lea como «no costó nada».
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseTicket } from "@valmen/core";
import { type RegistryPaths, addAiUsage, findTicket } from "@valmen/engine";

import { leerSesionesDeCodex } from "./codex.js";
import { leerSesionesDeHermes } from "./hermes.js";

/**
 * La base de datos de opencode, cargada **de forma perezosa**.
 *
 * `node:sqlite` es un módulo del núcleo de Node 22+, y cargarlo en la cúpula del
 * archivo rompía la suite entera: el empaquetador de los tests intenta resolver
 * `node:sqlite` como un paquete y falla con «Failed to load url sqlite», porque
 * solo quita el prefijo `node:` y busca `sqlite` en el disco. Trece archivos de
 * tests dejaron de cargar por un import que casi ninguno necesita.
 *
 * Con `createRequire` la carga ocurre dentro de la función, ya en Node de verdad,
 * y quien importe el servidor no arrastra el módulo. Los tipos se toman con
 * `import type`, que el compilador borra y por eso no afecta a la resolución.
 */
type BaseDeDatos = import("node:sqlite").DatabaseSync;
type ConstructorDeBase = typeof import("node:sqlite").DatabaseSync;

function cargarSqlite(): ConstructorDeBase | null {
  try {
    const requerir = createRequire(import.meta.url);
    const modulo = requerir("node:sqlite") as { DatabaseSync: ConstructorDeBase };
    return modulo.DatabaseSync;
  } catch {
    // Una versión de Node sin `node:sqlite` no es un fallo del harness: la línea
    // de tiempo es una capacidad añadida, y sin ella el resto funciona igual.
    return null;
  }
}

/** Una llamada a una herramienta del harness, con lo que costó rodearla. */
export interface Intervencion {
  /** Marca de tiempo en milisegundos. */
  readonly at: number;
  /** Nombre de la herramienta, tal como la llamó el agente. */
  readonly tool: string;
  /** `completed`, `error` o `running`. */
  readonly status: string;
  /** El perfil de agente del cliente: `build`, `plan`, un subagente… */
  readonly agent: string;
  readonly provider: string;
  readonly model: string;
  /** Coste del mensaje que hizo la llamada, en dólares. */
  readonly costUsd: number;
  /**
   * `true` si la llamada falló.
   *
   * Es el dato que hace útil la línea de tiempo: una corrección se ve como dos
   * llamadas a la misma herramienta con un fallo en medio, y eso es trabajo que
   * costó dinero y que conviene poder contar.
   */
  readonly failed: boolean;
}

/** Una sesión de agente, con su total. */
export interface SesionDeAgente {
  readonly id: string;
  readonly title: string;
  /**
   * De qué agente salió la sesión.
   *
   * El harness nació leyendo solo opencode, y eso medía mal el trabajo: el mismo
   * ticket se puede hacer desde codex. El dato se muestra porque una sesión sin
   * coste solo se entiende sabiendo de dónde viene.
   */
  readonly source: "opencode" | "codex" | "hermes";
  readonly agent: string;
  readonly provider: string;
  readonly model: string;
  /**
   * El coste, o `null` cuando no existe.
   *
   * Un proveedor por suscripción no tiene precio por token: poner un cero diría
   * «gratis», que es falso, y estimarlo con la tarifa de otro proveedor sería un
   * número inventado con forma de medición. Los tokens sí se registran: esos son
   * un dato.
   */
  readonly costUsd: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  /**
   * Tokens servidos desde la caché del proveedor.
   *
   * Es el número que explica por qué una sesión larga puede costar poco: en la
   * primera medición real, 1,9 millones de tokens vinieron de caché frente a 91
   * mil de entrada. Sin mostrarlo, el coste parece arbitrario.
   */
  readonly cacheReadTokens: number;
  readonly startedAt: number;
  /**
   * Intervenciones sobre el registro hechas en esta sesión.
   *
   * Se cuentan **antes** de filtrar por ticket, y por eso viven aquí: la lista
   * filtrada pierde las intervenciones de otros tickets de la misma sesión, así
   * que contar sobre ella daría cero en cuanto se pide un ticket concreto. Es un
   * dato de la sesión, no de la vista.
   */
  readonly intervenciones: number;
  readonly fallidas: number;
  /**
   * La base de la que salió esta sesión, cuando no es la de opencode.
   *
   * Se arrastra para poder escribir el `source` del consumo con la base que
   * corresponde: `hermes:<la de Hermes>`, no `hermes:<la de opencode>`, que dice
   * una cosa y muestra otra.
   */
  readonly fuente?: string;
  /**
   * Los tickets que sirvió la sesión, cuando sirvió a más de uno.
   *
   * Su costo no es de este ticket y por eso no se suma: la sesión de Slack de dos
   * horas y media que atendió cinco tickets tiene un solo gasto, y adjudicárselo
   * al más mencionado es un número inventado con forma de medición.
   */
  readonly reparto?: readonly { readonly id: string; readonly peso: number }[];
}

/** El desglose que responde «en qué se fue el dinero». */
export interface DesgloseDeTrabajo {
  /** Coste de los mensajes que llamaron a una herramienta del harness. */
  readonly harnessUsd: number;
  /** Coste del resto: explorar, leer, editar. */
  readonly exploracionUsd: number;
  readonly harnessMensajes: number;
  readonly exploracionMensajes: number;
}

/** La línea de tiempo completa de un proyecto. */
export interface LineaDeTiempo {
  /** De dónde salió el dato, para que la pantalla pueda decirlo. */
  readonly source: string;
  readonly sessions: readonly SesionDeAgente[];
  readonly intervenciones: readonly Intervencion[];
  readonly totalCostUsd: number;
  /** Sesiones cuyo coste no existe —suscripción—, para poder decirlo. */
  readonly sesionesSinCoste: number;
  /**
   * Sesiones que sirvieron a varios tickets.
   *
   * Aparecen en la vista, marcadas, y **no** entran en los totales: su costo es
   * de todos los tickets que atendieron, no del que se está mirando.
   */
  readonly sesionesCompartidas: number;
  /** Lo que costaron las compartidas, para poder decir cuánto queda fuera. */
  readonly costeCompartidoUsd: number;
  readonly totalTokens: {
    readonly input: number;
    readonly output: number;
    readonly reasoning: number;
    readonly cacheRead: number;
  };
  readonly desglose: DesgloseDeTrabajo;
}

/** La ruta de la base de opencode. */
export function opencodeDbPath(home: string = homedir()): string {
  return join(home, ".local", "share", "opencode", "opencode.db");
}

/**
 * `true` si hay una base de opencode que leer.
 *
 * Se comprueba antes de intentar abrirla para poder decir «no hay datos» en vez de
 * devolver una lista vacía, que la pantalla mostraría como un cero y no como una
 * ausencia.
 */
export function hayDatosDeOpencode(home: string = homedir()): boolean {
  return existsSync(opencodeDbPath(home));
}

/** El prefijo de una herramienta del harness, tal como la expone el servidor MCP. */
const PREFIJO_HERRAMIENTA = "valmen_";

/** Abre la base en solo lectura. Devuelve `null` si no se puede. */
function abrir(dbPath: string): BaseDeDatos | null {
  if (!existsSync(dbPath)) return null;
  const DatabaseSync = cargarSqlite();
  if (DatabaseSync === null) return null;
  try {
    // Solo lectura: el harness **observa** la contabilidad del cliente, no la
    // mantiene. Abrir en escritura para leer sería tocar la base de otra
    // herramienta, y no hace falta para nada.
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
}

/** Extrae el identificador de ticket de un texto, si lo hay. */
export function ticketDeTexto(texto: string): string | null {
  // El formato del contrato: <TIPO>-<MODULO>-<DESCRIPCION>-<YYYYMMDD>.
  const match = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}-\d{8})\b/.exec(texto);
  return match === null ? null : (match[1] as string);
}

/** Lo que un mensaje del cliente aporta a la línea de tiempo. */
interface Mensaje {
  readonly agent: string;
  readonly provider: string;
  readonly model: string;
  readonly cost: number;
}

/**
 * El modelo de la sesión, normalizado.
 *
 * La columna guarda a veces un texto y a veces el objeto del modelo serializado
 * —`{"id":"…","providerID":"…","variant":"max"}`—. Volcarlo tal cual deja el
 * registro con un JSON dentro de un campo de texto, que se lee mal y no se puede
 * comparar con nada.
 */
function modeloDeSesion(bruto: string | null): string {
  if (bruto === null || bruto === "") return "";
  const texto = bruto.trim();
  if (!texto.startsWith("{")) return texto;
  try {
    const d = JSON.parse(texto) as Record<string, unknown>;
    const id = typeof d["id"] === "string" ? d["id"] : "";
    const proveedor = typeof d["providerID"] === "string" ? d["providerID"] : "";
    const variante = typeof d["variant"] === "string" ? d["variant"] : "";
    if (id === "") return texto;
    return proveedor === ""
      ? id
      : `${proveedor}/${id}${variante === "" ? "" : ` (${variante})`}`;
  } catch {
    return texto;
  }
}

function leerMensaje(data: string): Mensaje {
  try {
    const d = JSON.parse(data) as Record<string, unknown>;
    return {
      agent: typeof d["agent"] === "string" ? d["agent"] : "",
      provider: typeof d["providerID"] === "string" ? d["providerID"] : "",
      model: typeof d["modelID"] === "string" ? d["modelID"] : "",
      cost: typeof d["cost"] === "number" ? d["cost"] : 0,
    };
  } catch {
    return { agent: "", provider: "", model: "", cost: 0 };
  }
}

/** Una llamada a herramienta, tal como está guardada en una parte del mensaje. */
interface Llamada {
  readonly tool: string;
  readonly status: string;
  readonly at: number;
  /**
   * El texto crudo de la parte.
   *
   * Los **argumentos** de la llamada viven aquí y no en el mensaje: el
   * identificador del ticket viaja en este texto. Buscarlo en el mensaje —que es
   * lo primero que se intenta— da cero coincidencias y el filtro por ticket
   * devuelve una línea de tiempo vacía, que es un resultado plausible y falso.
   */
  readonly data: string;
}

/**
 * Lee la línea de tiempo de un proyecto.
 *
 * `directory` es la carpeta del proyecto tal como opencode la registró: la raíz del
 * registro. Se compara por prefijo porque opencode guarda el directorio donde se
 * abrió cada sesión.
 *
 * Devuelve `null` cuando no hay base que leer o su forma no es la esperada. Es
 * distinto de una línea de tiempo vacía, y la pantalla tiene que poder
 * distinguirlo.
 */
export function leerLineaDeTiempo(
  directory: string,
  options: { readonly home?: string; readonly ticketId?: string } = {},
): LineaDeTiempo | null {
  const dbPath = opencodeDbPath(options.home ?? homedir());
  const db = abrir(dbPath);

  if (db === null) {
    // Sin base de opencode puede haber igual consumo: un proyecto que trabaja
    // desde codex o desde Hermes y nada más. Devolver `null` ahí borraría su línea
    // de tiempo entera, que es lo que pasaba antes de que existieran estos lectores.
    const sesiones = leerSesionesDeCodex(directory, {
      ...(options.home === undefined ? {} : { home: options.home }),
      ...(options.ticketId === undefined ? {} : { ticketId: options.ticketId }),
    });
    if (sesiones.length > 0) return lineaSoloDeCodex(sesiones, directory);

    const deHermes = leerSesionesDeHermes(directory, {
      ...(options.home === undefined ? {} : { home: options.home }),
      ...(options.ticketId === undefined ? {} : { ticketId: options.ticketId }),
    });
    return deHermes.length === 0 ? null : lineaSoloDeHermes(deHermes, directory);
  }

  try {
    return consultar(db, dbPath, directory, options.ticketId, options.home);
  } finally {
    db.close();
  }
}

/** La línea de tiempo de un proyecto del que solo hay sesiones de codex. */
function lineaSoloDeCodex(
  sesiones: readonly import("./codex.js").SesionDeCodex[],
  directory: string,
): LineaDeTiempo {
  return {
    source: `codex:${directory}`,
    sessions: sesiones.map((sesion) => ({
      id: sesion.id,
      title: "Sesión de codex",
      source: "codex" as const,
      agent: "codex",
      provider: "",
      model: "",
      costUsd: null,
      inputTokens: sesion.inputTokens,
      outputTokens: sesion.outputTokens,
      reasoningTokens: sesion.reasoningTokens,
      cacheReadTokens: sesion.cachedInputTokens,
      startedAt: sesion.startedAt,
      intervenciones: sesion.intervenciones,
      fallidas: 0,
    })),
    intervenciones: [],
    totalCostUsd: 0,
    sesionesSinCoste: sesiones.length,
    sesionesCompartidas: 0,
    costeCompartidoUsd: 0,
    totalTokens: {
      input: sesiones.reduce((suma, s) => suma + s.inputTokens, 0),
      output: sesiones.reduce((suma, s) => suma + s.outputTokens, 0),
      reasoning: sesiones.reduce((suma, s) => suma + s.reasoningTokens, 0),
      cacheRead: sesiones.reduce((suma, s) => suma + s.cachedInputTokens, 0),
    },
    desglose: {
      harnessUsd: 0,
      exploracionUsd: 0,
      harnessMensajes: 0,
      exploracionMensajes: 0,
    },
  };
}

/**
 * La línea de tiempo de un proyecto del que solo hay sesiones de Hermes.
 *
 * Mismo caso que el de codex: sin base de opencode, el consumo puede venir del
 * puente al celular, y devolver `null` diría que no hubo trabajo. Hermes sí trae
 * coste estimado, así que el total no es cero cuando el proveedor lo declara.
 */
function lineaSoloDeHermes(
  sesiones: readonly import("./hermes.js").SesionDeHermes[],
  directory: string,
): LineaDeTiempo {
  const convertidas: SesionDeAgente[] = sesiones.map((sesion) => ({
    id: sesion.id,
    title: sesion.title === "" ? "Sesión de Hermes" : sesion.title,
    source: "hermes" as const,
    agent: `hermes:${sesion.origin}`,
    provider: sesion.provider,
    model: sesion.model,
    costUsd: sesion.costUsd,
    inputTokens: sesion.inputTokens,
    outputTokens: sesion.outputTokens,
    reasoningTokens: sesion.reasoningTokens,
    cacheReadTokens: sesion.cacheReadTokens,
    startedAt: sesion.startedAt,
    intervenciones: sesion.toolCalls,
    fallidas: 0,
    fuente: sesion.dbPath,
    ...(sesion.compartida ? { reparto: sesion.tickets } : {}),
  }));

  return {
    source: `hermes:${directory}`,
    sessions: convertidas,
    intervenciones: [],
    totalCostUsd: convertidas
      .filter((s) => s.reparto === undefined)
      .reduce((suma, s) => suma + (s.costUsd ?? 0), 0),
    sesionesSinCoste: convertidas.filter((s) => s.costUsd === null).length,
    sesionesCompartidas: convertidas.filter((s) => s.reparto !== undefined).length,
    costeCompartidoUsd: convertidas
      .filter((s) => s.reparto !== undefined)
      .reduce((suma, s) => suma + (s.costUsd ?? 0), 0),
    totalTokens: {
      input: sesiones.reduce((suma, s) => suma + s.inputTokens, 0),
      output: sesiones.reduce((suma, s) => suma + s.outputTokens, 0),
      reasoning: sesiones.reduce((suma, s) => suma + s.reasoningTokens, 0),
      cacheRead: sesiones.reduce((suma, s) => suma + s.cacheReadTokens, 0),
    },
    desglose: {
      harnessUsd: 0,
      exploracionUsd: 0,
      harnessMensajes: 0,
      exploracionMensajes: 0,
    },
  };
}

/** La consulta y su interpretación, separadas para cerrar la base siempre. */
function consultar(
  db: BaseDeDatos,
  dbPath: string,
  directory: string,
  ticketId: string | undefined,
  home: string | undefined,
): LineaDeTiempo | null {
  const patron = `${directory}%`;

  let filas: {
    sessionId: string;
    title: string;
    cost: number;
    tokensInput: number;
    tokensOutput: number;
    tokensReasoning: number;
    tokensCacheRead: number;
    sessionAgent: string | null;
    sessionModel: string | null;
    messageId: string;
    messageData: string;
    timeCreated: number;
  }[];
  try {
    filas = db
      .prepare(
        `SELECT s.id AS sessionId, s.title AS title, s.cost AS cost,
                s.tokens_input AS tokensInput, s.tokens_output AS tokensOutput,
                s.tokens_reasoning AS tokensReasoning,
                s.tokens_cache_read AS tokensCacheRead,
                s.agent AS sessionAgent, s.model AS sessionModel,
                m.id AS messageId, m.data AS messageData, m.time_created AS timeCreated
           FROM session s
           JOIN message m ON m.session_id = s.id
          WHERE s.directory LIKE ?
          ORDER BY m.time_created`,
      )
      .all(patron) as unknown as typeof filas;
  } catch {
    return null;
  }

  // Se indexa una sola vez por mensaje: el coste y el texto se consultan en varios
  // recorridos, y buscarlos en el array cada vez sería cuadrático.
  const porMensaje = new Map<
    string,
    { mensaje: Mensaje; data: string; sessionId: string }
  >();
  for (const fila of filas) {
    if (porMensaje.has(fila.messageId)) continue;
    porMensaje.set(fila.messageId, {
      mensaje: leerMensaje(fila.messageData),
      data: fila.messageData,
      sessionId: fila.sessionId,
    });
  }

  // Las partes se piden aparte: un mensaje puede tener varias (texto, herramienta,
  // razonamiento) y lo que interesa son las de herramienta.
  const llamadas = new Map<string, Llamada[]>();
  try {
    const filasParte = db
      .prepare(
        `SELECT p.message_id AS messageId, p.data AS data, p.time_created AS timeCreated
           FROM part p JOIN session s ON s.id = p.session_id
          WHERE s.directory LIKE ? AND p.data LIKE '%"tool"%'`,
      )
      .all(patron) as unknown as {
      messageId: string;
      data: string;
      timeCreated: number;
    }[];

    for (const fila of filasParte) {
      let parte: Record<string, unknown>;
      try {
        parte = JSON.parse(fila.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (parte["type"] !== "tool") continue;

      const estado = (parte["state"] ?? {}) as Record<string, unknown>;
      const tiempo = (estado["time"] ?? {}) as Record<string, unknown>;
      const lista = llamadas.get(fila.messageId) ?? [];
      lista.push({
        tool: typeof parte["tool"] === "string" ? parte["tool"] : "",
        status: typeof estado["status"] === "string" ? estado["status"] : "",
        at: typeof tiempo["start"] === "number" ? tiempo["start"] : fila.timeCreated,
        data: fila.data,
      });
      llamadas.set(fila.messageId, lista);
    }
  } catch {
    // Sin partes no hay línea de tiempo, pero los totales por sesión siguen siendo
    // válidos y son la mitad del valor.
  }

  const sesiones = new Map<string, SesionDeAgente>();
  for (const fila of filas) {
    if (sesiones.has(fila.sessionId)) continue;
    const mensaje = leerMensaje(fila.messageData);
    // El agente y el modelo los declara la sesión además del mensaje. El del
    // mensaje es más preciso —una sesión puede cambiar de modelo a mitad— y el de
    // la sesión sirve de respaldo cuando el mensaje no lo trae.
    sesiones.set(fila.sessionId, {
      id: fila.sessionId,
      title: fila.title,
      agent: mensaje.agent === "" ? (fila.sessionAgent ?? "") : mensaje.agent,
      provider: mensaje.provider,
      model: mensaje.model === "" ? modeloDeSesion(fila.sessionModel) : mensaje.model,
      costUsd: fila.cost,
      source: "opencode",
      inputTokens: fila.tokensInput,
      outputTokens: fila.tokensOutput,
      reasoningTokens: fila.tokensReasoning,
      cacheReadTokens: fila.tokensCacheRead,
      startedAt: fila.timeCreated,
      intervenciones: 0,
      fallidas: 0,
    });
  }

  // Un mensaje cuenta como «del harness» si llamó a alguna de sus herramientas, y
  // se cuenta **una vez** aunque haya llamado a tres: el coste es del mensaje, no
  // de la llamada.
  const delHarness = new Set<string>();
  const intervenciones: Intervencion[] = [];
  /** Las sesiones que intervinieron sobre el ticket que se está mirando. */
  const sesionesDelTicket = new Set<string>();
  for (const [messageId, llamadasDelMensaje] of llamadas) {
    const entrada = porMensaje.get(messageId);
    if (entrada === undefined) continue;

    for (const llamada of llamadasDelMensaje) {
      if (!llamada.tool.startsWith(PREFIJO_HERRAMIENTA)) continue;
      delHarness.add(messageId);

      // El conteo por sesión se hace aquí, sobre todas las llamadas, antes del
      // filtro por ticket.
      const sesion = sesiones.get(entrada.sessionId);
      if (sesion !== undefined) {
        sesiones.set(entrada.sessionId, {
          ...sesion,
          intervenciones: sesion.intervenciones + 1,
          fallidas:
            sesion.fallidas +
            (llamada.status === "error" || llamada.status === "failed" ? 1 : 0),
        });
      }

      // El identificador se busca en los argumentos de la llamada, que es donde
      // está; el texto del mensaje no lo lleva.
      if (ticketId !== undefined && !llamada.data.includes(ticketId)) continue;
      // Y la intervención ya sabe de qué sesión salió, así que la pertenencia se
      // resuelve acá y no adivinando por tiempo.
      sesionesDelTicket.add(entrada.sessionId);

      intervenciones.push({
        at: llamada.at,
        tool: llamada.tool,
        status: llamada.status,
        agent: entrada.mensaje.agent,
        provider: entrada.mensaje.provider,
        model: entrada.mensaje.model,
        costUsd: entrada.mensaje.cost,
        failed: llamada.status === "error" || llamada.status === "failed",
      });
    }
  }

  let costeHarness = 0;
  for (const messageId of delHarness) {
    costeHarness += porMensaje.get(messageId)?.mensaje.cost ?? 0;
  }

  // Las sesiones de codex, si las hay. Se leen después de las de opencode porque
  // son otro almacén, y se suman a la misma lista: quien mira quiere el consumo de
  // su ticket, no el de la herramienta con la que se hizo.
  for (const sesion of leerSesionesDeCodex(directory, {
    ...(home === undefined ? {} : { home }),
    ...(ticketId === undefined ? {} : { ticketId }),
  })) {
    sesiones.set(`codex:${sesion.id}`, {
      id: sesion.id,
      title: "Sesión de codex",
      source: "codex",
      agent: "codex",
      provider: "",
      model: "",
      costUsd: null,
      inputTokens: sesion.inputTokens,
      outputTokens: sesion.outputTokens,
      reasoningTokens: sesion.reasoningTokens,
      cacheReadTokens: sesion.cachedInputTokens,
      startedAt: sesion.startedAt,
      intervenciones: sesion.intervenciones,
      fallidas: 0,
    });
  }

  // Las de Hermes —el puente al celular—, que ejecuta con su propio agente: llamó
  // a las herramientas del harness por MCP y hasta ahora no lo veía nadie. Trae
  // coste estimado, que es más de lo que trae codex.
  for (const sesion of leerSesionesDeHermes(directory, {
    ...(home === undefined ? {} : { home }),
    ...(ticketId === undefined ? {} : { ticketId }),
  })) {
    sesiones.set(`hermes:${sesion.id}`, {
      id: sesion.id,
      title: sesion.title === "" ? "Sesión de Hermes" : sesion.title,
      source: "hermes",
      agent: `hermes:${sesion.origin}`,
      provider: sesion.provider,
      model: sesion.model,
      costUsd: sesion.costUsd,
      inputTokens: sesion.inputTokens,
      outputTokens: sesion.outputTokens,
      reasoningTokens: sesion.reasoningTokens,
      cacheReadTokens: sesion.cacheReadTokens,
      startedAt: sesion.startedAt,
      intervenciones: sesion.toolCalls,
      fallidas: 0,
      fuente: sesion.dbPath,
      ...(sesion.compartida ? { reparto: sesion.tickets } : {}),
    });
  }

  // **La atribución, cuando se pide un ticket.** Sin esto, el coste que mostraba
  // la pantalla de un ticket era el de **todas** las sesiones del proyecto: un
  // número con aspecto de dato y sin relación con lo que se estaba mirando. Una
  // sesión pertenece al ticket si intervino sobre él —para opencode, una llamada
  // al harness que lo nombra; para codex, una sesión que lo menciona—.
  if (ticketId !== undefined) {
    for (const [clave, sesion] of sesiones) {
      // Las de codex y Hermes ya vienen filtradas por el ticket desde su lector:
      // ahí la pertenencia se decide por mención —una sesión de Hermes que llama a
      // `mover_ticket` con el identificador es de ese ticket—, que es lo que hay.
      const tocaElTicket =
        sesion.source === "codex" ||
        sesion.source === "hermes" ||
        sesionesDelTicket.has(clave);
      if (!tocaElTicket) sesiones.delete(clave);
    }
  }

  // Las compartidas quedan fuera de los totales: su gasto es de todos los
  // tickets que atendieron, y sumarlo acá diría que este ticket costó lo que
  // costaron los cinco. Se cuentan aparte para poder decirlo en pantalla.
  const compartidas = [...sesiones.values()].filter((s) => s.reparto !== undefined);
  const costeCompartidoUsd = compartidas.reduce((suma, s) => suma + (s.costUsd ?? 0), 0);

  const conCoste = [...sesiones.values()].filter(
    (s) => s.costUsd !== null && s.reparto === undefined,
  );
  const totalCostUsd = conCoste.reduce((suma, s) => suma + (s.costUsd ?? 0), 0);
  const suma = (elegir: (s: SesionDeAgente) => number): number =>
    [...sesiones.values()]
      .filter((s) => s.reparto === undefined)
      .reduce((total, s) => total + elegir(s), 0);

  return {
    source: dbPath,
    sessions: [...sesiones.values()].sort((a, b) => a.startedAt - b.startedAt),
    sesionesSinCoste: [...sesiones.values()].length - conCoste.length,
    sesionesCompartidas: compartidas.length,
    costeCompartidoUsd,
    intervenciones: intervenciones.sort((a, b) => a.at - b.at),
    totalCostUsd,
    totalTokens: {
      input: suma((s) => s.inputTokens),
      output: suma((s) => s.outputTokens),
      reasoning: suma((s) => s.reasoningTokens),
      cacheRead: suma((s) => s.cacheReadTokens),
    },
    desglose: {
      harnessUsd: costeHarness,
      exploracionUsd: totalCostUsd - costeHarness,
      harnessMensajes: delHarness.size,
      exploracionMensajes: porMensaje.size - delHarness.size,
    },
  };
}

/** Lo que se escribió en el ticket al guardar la foto. */
export interface FotoGuardada {
  readonly entradas: readonly string[];
  /** Resumen legible de lo que quedó registrado. */
  readonly detalle: string;
}

/**
 * Guarda en el ticket una foto del consumo de sus sesiones.
 *
 * Es la mitad durable de la línea de tiempo: la pantalla la muestra en vivo, pero
 * un ticket tiene que poder auditarse meses después, y para entonces la base del
 * cliente puede no existir. La foto se anexa al bloque `## Consumo de IA`, que es
 * append-only, así que guardar dos veces deja dos registros y no reescribe el
 * primero: el historial de lo que costó cada tramo se conserva.
 *
 * `confidence` es `high` y no es una opinión: el dato sale de la contabilidad del
 * cliente, que es un registro y no una estimación. Un `low` ahí estaría
 * describiendo mal la procedencia, que es justo lo que el campo existe para decir.
 */
export function guardarFotoEnTicket(
  paths: RegistryPaths,
  ticketId: string,
  options: { readonly home?: string; readonly now?: () => Date } = {},
): FotoGuardada | null {
  const linea = leerLineaDeTiempo(paths.root, {
    ...(options.home === undefined ? {} : { home: options.home }),
    ticketId,
  });
  if (linea === null || linea.sessions.length === 0) return null;

  // Las sesiones que el ticket ya tiene registradas. La foto se puede volver a
  // tomar —un lector nuevo, un agente que antes no se leía— y sin esto la segunda
  // pasada duplicaría lo que ya estaba: el bloque es append-only y no se corrige
  // después.
  const yaEstaban = sesionesRegistradas(paths, ticketId);
  const pendientes = linea.sessions.filter((sesion) => !yaEstaban.has(sesion.id));

  const entradas: string[] = [];
  for (const sesion of pendientes) {
    // La base es la de la sesión, no la de la vista: un `hermes:` que apunta a
    // `opencode.db` dice una cosa y muestra otra, y deja el costo sin verificar.
    const base = sesion.source === "codex" ? sesion.id : (sesion.fuente ?? linea.source);
    const reparto = sesion.reparto;
    entradas.push(
      addAiUsage({
        paths,
        ticketId,
        source: `${sesion.source}:${base}`,
        confidence: "high",
        sessionReference: sesion.id,
        // Una sesión compartida se declara **sin números**. Su costo es de todos
        // los tickets que atendió y repartirlo a ojo sería un número inventado
        // con forma de medición: el hueco declarado se ve, el reparto inventado
        // no. Los números quedan en la entrada de la sesión que sí es de un
        // ticket, o en la nota de esta.
        ...(reparto === undefined
          ? {
              model:
                sesion.provider === ""
                  ? sesion.model
                  : `${sesion.provider}/${sesion.model}`,
              inputTokens: String(sesion.inputTokens),
              outputTokens: String(sesion.outputTokens),
              totalTokens: String(
                sesion.inputTokens + sesion.outputTokens + sesion.reasoningTokens,
              ),
              // Un proveedor por suscripción no tiene coste por token: el campo se
              // deja fuera y la nota lo dice, en vez de escribir un cero que se
              // leería como «gratis».
              ...(sesion.costUsd === null
                ? {}
                : { estimatedCostUsd: sesion.costUsd.toFixed(6) }),
              notes:
                `Agente ${sesion.agent || "(sin declarar)"}. ` +
                `${sesion.intervenciones} intervención(es) sobre el registro, ` +
                `${sesion.fallidas} con fallo. ` +
                `Razonamiento ${sesion.reasoningTokens} tokens, ` +
                `caché leída ${sesion.cacheReadTokens} tokens. ` +
                `Sesión "${sesion.title}".` +
                (sesion.costUsd === null
                  ? " Proveedor por suscripción: no hay coste por token, se registran los tokens."
                  : ""),
            }
          : {
              notes:
                `Agente ${sesion.agent || "(sin declarar)"}. Sesión **compartida**: ` +
                `trabajó ${reparto.length} tickets ` +
                `(${reparto
                  .slice(0, 5)
                  .map((t) => `${t.id} ×${t.peso}`)
                  .join(", ")}), así que su costo no se reparte y acá no se ` +
                `registran números. ` +
                `Costo completo de la sesión: ` +
                (sesion.costUsd === null
                  ? "no declarado por el proveedor"
                  : `$${sesion.costUsd.toFixed(6)}`) +
                `, ${sesion.inputTokens + sesion.outputTokens + sesion.reasoningTokens} tokens. ` +
                `Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde ` +
                `corresponda. Sesión "${sesion.title}".`,
            }),
        ...(options.now === undefined ? {} : { now: options.now }),
      }),
    );
  }

  const compartidas = pendientes.filter((s) => s.reparto !== undefined).length;
  return {
    entradas,
    detalle:
      `${pendientes.length} sesión(es) nuevas de ${linea.sessions.length}. ` +
      `Total $${linea.totalCostUsd.toFixed(6)}: ` +
      `harness $${linea.desglose.harnessUsd.toFixed(6)}, ` +
      `exploración $${linea.desglose.exploracionUsd.toFixed(6)}.` +
      (compartidas === 0
        ? ""
        : ` ${compartidas} compartida(s) entre varios tickets: se registran sin números, ` +
          `porque su costo no es de este ticket.`) +
      (yaEstaban.size === 0
        ? ""
        : ` ${yaEstaban.size} ya estaban registradas y no se repitieron.`),
  };
}

/**
 * Las referencias de sesión que el ticket ya tiene en su bloque de consumo.
 *
 * Se leen del documento: la referencia es lo que identifica a la sesión, y es lo
 * único que permite volver a tomar la foto sin duplicar lo ya escrito.
 */
function sesionesRegistradas(paths: RegistryPaths, ticketId: string): Set<string> {
  const ticket = findTicket(paths, ticketId);
  if (ticket === undefined) return new Set();
  try {
    const documento = parseTicket(ticket.text);
    const consumo = documento.blocks["Consumo de IA"] ?? [];
    return new Set(
      consumo
        .map((entrada) => entrada["session_reference"])
        .filter((referencia): referencia is string => typeof referencia === "string"),
    );
  } catch {
    return new Set();
  }
}
