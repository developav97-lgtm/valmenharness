/**
 * Las sesiones de Hermes: el cuarto agente que trabaja el registro.
 *
 * Hermes es el puente al celular —se le pide por Slack y ejecuta—, y ejecuta con
 * **su propio agente**, no con opencode: llama a las herramientas del harness por
 * MCP (`mcp__valmen_...__mover_ticket`). El primer ticket que trabajó así quedó
 * con la línea de tiempo vacía, y no era un fallo de la pantalla: el harness leía
 * la contabilidad de opencode y de codex, y Hermes no estaba en ninguna de las
 * dos. Un registro que no ve al agente que hizo el trabajo mide mal el trabajo.
 *
 * De dónde sale el dato: Hermes guarda cada sesión en SQLite —`state.db`, y un
 * archivo por perfil en `profiles/<nombre>/state.db`—, con la tabla `sessions`
 * trayendo lo que hace falta: directorio, título, llamadas, tokens de entrada y
 * salida, caché, razonamiento, y **coste estimado y real** con su procedencia.
 *
 * La atribución al ticket se hace por las llamadas a herramientas: el
 * identificador está en los argumentos de `ver_ticket`, `mover_ticket`, etc. Una
 * sesión puede mencionar varios —el que trabaja y los que consulta—, así que se
 * queda con **el que más aparece**: es el que trabajó.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

/**
 * `node:sqlite` se carga dentro de una función y no en la cúpula.
 *
 * El empaquetador de las pruebas solo quita el prefijo `node:` y busca `sqlite`
 * en el disco, así que un import arriba rompe la carga del módulo —y con él la de
 * todos los tests que lo importen—. Con `createRequire` la carga ocurre en Node
 * de verdad, y quien no tenga ese módulo simplemente no lee esta contabilidad.
 */
type BaseDeDatos = import("node:sqlite").DatabaseSync;

function cargarSqlite():
  (new (ruta: string, opciones?: { readOnly?: boolean }) => BaseDeDatos) | null {
  try {
    const requerir = createRequire(import.meta.url);
    const modulo = requerir("node:sqlite") as {
      DatabaseSync: new (ruta: string, opciones?: { readOnly?: boolean }) => BaseDeDatos;
    };
    return modulo.DatabaseSync;
  } catch {
    return null;
  }
}

/** Cuánto pesó un ticket dentro de una sesión. */
export interface TicketDeSesion {
  readonly id: string;
  /** Apariciones ponderadas: una escritura vale más que una lectura o un texto. */
  readonly peso: number;
  /** `true` si la sesión **escribió** sobre este ticket, no solo lo consultó. */
  readonly trabajado: boolean;
}

/** Una sesión de Hermes, con lo que el registro necesita de ella. */
export interface SesionDeHermes {
  readonly id: string;
  readonly source: "hermes";
  /** De dónde salió: `slack`, `desktop`, `oneshot`… */
  readonly origin: string;
  readonly title: string;
  readonly model: string;
  readonly provider: string;
  /** La base de Hermes de la que salió esta sesión. */
  readonly dbPath: string;
  readonly startedAt: number;
  readonly apiCalls: number;
  readonly toolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cacheReadTokens: number;
  /** El coste, o `null` cuando Hermes no lo sabe. */
  readonly costUsd: number | null;
  /**
   * El ticket dominante, o `null` si la sesión sirvió a varios.
   *
   * `null` **no** es «no se sabe»: es «no se puede atribuir». Una sesión que
   * atendió cinco tickets tiene un solo costo y ningún modo de repartirlo, y
   * quedarse con el más mencionado le adjudicaría el gasto de los otros cuatro.
   */
  readonly ticket: string | null;
  /** Los tickets que la sesión mencionó, de mayor a menor peso. */
  readonly tickets: readonly TicketDeSesion[];
  /** `true` si ningún ticket domina: la sesión sirvió a más de uno. */
  readonly compartida: boolean;
  /** `true` si la sesión falló o quedó sin cerrar. */
  readonly failed: boolean;
}

/** La ruta de la base de Hermes, o `null` si no está. */
export function hermesDbPath(home: string = homedir()): string {
  return join(home, ".hermes", "state.db");
}

/** Las bases de Hermes: la principal y la de cada perfil. */
export function hermesDbs(home: string = homedir()): string[] {
  const base = join(home, ".hermes");
  const rutas: string[] = [];
  if (existsSync(join(base, "state.db"))) rutas.push(join(base, "state.db"));

  let perfiles: string[];
  try {
    perfiles = readdirSync(join(base, "profiles"));
  } catch {
    perfiles = [];
  }
  for (const perfil of perfiles) {
    const ruta = join(base, "profiles", perfil, "state.db");
    if (existsSync(ruta)) rutas.push(ruta);
  }
  return rutas;
}

/**
 * El identificador de ticket de un texto.
 *
 * Se exige la forma completa del contrato —`<TIPO>-<MODULO>-<DESC>-<YYYYMMDD>`—
 * y **que sea un tipo conocido**: así una cadena en mayúsculas con guiones y ocho
 * dígitos que no es un ticket no cuenta como uno.
 */
const TIPOS = [
  "FEATURE",
  "BUGFIX",
  "IMPROVEMENT",
  "SYNC",
  "INTEGRATION",
  "AGENT",
  "SECURITY",
  "CHORE",
  "DOCS",
];
const TICKET_RE = new RegExp(
  `\\b((?:${TIPOS.join("|")})-[A-Z0-9]+(?:-[A-Z0-9]+)*-(\\d{8}))\\b`,
  "g",
);

/**
 * Las herramientas que **solo leen** el registro, y las que lo escriben.
 *
 * La distinción decide de quién es una sesión: trabajar un ticket es escribirlo
 * —moverlo, anotarle algo, evaluarle una compuerta—, y una sesión que además
 * consultó otros diez no trabajó diez. Sin esto, contar menciones le adjudica el
 * gasto al ticket que más se nombró, que puede ser el que solo se miró.
 *
 * Las dos listas replican el catálogo MCP —`readOnlyHint` y su complemento—, y un
 * test las contrasta contra él: una herramienta nueva se agrega allá y el test
 * dice si acá falta.
 *
 * Una herramienta que no es del harness —`patch`, `read_file`, `execute_code`,
 * los del propio agente— no clasifica: no escribe el registro, así que no dice
 * que la sesión haya trabajado el ticket. Las que sí, se reconocen por el nombre
 * sin prefijo: `mcp__valmen_saicloud__mover_ticket` es `mover_ticket`.
 */
export const HERRAMIENTAS_DE_LECTURA: readonly string[] = [
  "ver_ticket",
  "listar_tickets",
  "validar_ticket",
  "reanudar_ticket",
  "ver_features",
  "ver_procesos",
  "estado_proceso",
  "reporte_cierres",
  "revisar_secretos",
  "reporte_consumo",
  "revisar_drift",
  "reporte_valor",
  "buscar_memoria",
  "ver_estandares",
  "revisar_presentacion",
];

/** Las que escriben el registro, que son las que convierten una sesión en trabajo. */
export const HERRAMIENTAS_QUE_ESCRIBEN: readonly string[] = [
  "crear_ticket",
  "mover_ticket",
  "anotar_punto",
  "mover_punto",
  "anotar_evidencia",
  "registrar_consumo_ia",
  "evaluar_compuerta",
  "simular_compuerta",
  "descomponer_feature",
  "materializar_feature",
  "ejecutar_proceso",
  "calibrar_compuerta",
  "manifiesto_entrega",
  "indexar_registro",
  "guardar_aprendizaje",
  "revisar_aprendizajes",
  "proponer_estandar",
  "decidir_estandar",
  "iniciar_qa",
  "anotar_retest",
  "cerrar_qa",
  "preparar_cierre",
];

/**
 * El nombre de una herramienta sin el prefijo de la página que la llama.
 *
 * `mcp__valmen_saicloud__mover_ticket`, `mcp__valmen__mover_ticket` y
 * `valmen_mover_ticket` son la misma herramienta, y compararlas por sufijo no
 * sirve: `mover_ticket` termina en `ver_ticket`, y una herramienta que escribe
 * pasaría por lectura.
 */
function nombreDeHerramienta(nombre: string): string {
  const corte = nombre.lastIndexOf("__");
  const base = corte === -1 ? nombre : nombre.slice(corte + 2);
  return base.replace(/^valmen_/, "");
}

/** Los tickets que menciona un texto, con cuántas veces cada uno. */
export function ticketsDeTexto(texto: string): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const match of texto.matchAll(TICKET_RE)) {
    const id = match[1] as string;
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  return cuenta;
}

/** Una fila de la tabla `sessions`. */
interface FilaSesion {
  readonly id: string;
  readonly source: string | null;
  readonly title: string | null;
  readonly display_name: string | null;
  readonly model: string | null;
  readonly billing_provider: string | null;
  readonly cwd: string | null;
  readonly git_repo_root: string | null;
  readonly api_call_count: number | null;
  readonly tool_call_count: number | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly reasoning_tokens: number | null;
  readonly cache_read_tokens: number | null;
  readonly estimated_cost_usd: number | null;
  readonly actual_cost_usd: number | null;
  readonly cost_status: string | null;
  readonly started_at: number | null;
  readonly ended_at: number | null;
  readonly end_reason: string | null;
}

/** El número de una columna que puede venir nula. */
function n(valor: number | null | undefined): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/**
 * Las sesiones de Hermes que intervinieron en un proyecto.
 *
 * `directory` acota por directorio de trabajo cuando la sesión lo declara —las
 * viejas no lo guardan—, y el ticket se atribuye por el uso de las herramientas
 * del harness. Una base que no se puede abrir —bloqueada, de otra versión— se
 * salta: es la contabilidad de otra herramienta, y no poder leerla no puede
 * romper la línea de tiempo del proyecto.
 */
export function leerSesionesDeHermes(
  directory: string,
  options: {
    readonly home?: string;
    readonly ticketId?: string;
    readonly dias?: number;
  } = {},
): SesionDeHermes[] {
  const home = options.home ?? homedir();
  const dias = options.dias ?? 30;
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  const sesiones: SesionDeHermes[] = [];

  const Abrir = cargarSqlite();
  if (Abrir === null) return [];

  for (const ruta of hermesDbs(home)) {
    let db: BaseDeDatos;
    try {
      // En solo lectura: es la base de otra herramienta y leerla no puede
      // modificarla ni bloquearla.
      db = new Abrir(ruta, { readOnly: true });
    } catch {
      continue;
    }

    try {
      const filas = db
        .prepare(
          `SELECT id, source, title, display_name, model, billing_provider, cwd,
                  git_repo_root, api_call_count, tool_call_count, input_tokens,
                  output_tokens, reasoning_tokens, cache_read_tokens,
                  estimated_cost_usd, actual_cost_usd, cost_status,
                  started_at, ended_at, end_reason
             FROM sessions
            WHERE started_at IS NULL OR started_at >= ?`,
        )
        .all(desde / 1000) as unknown as FilaSesion[];

      for (const fila of filas) {
        const delProyecto =
          fila.cwd === null ||
          fila.cwd === "" ||
          fila.cwd.startsWith(directory) ||
          (fila.git_repo_root ?? "").startsWith(directory);
        if (!delProyecto) continue;

        const tickets = ticketsDeSesion(db, fila.id);
        const { ticket, compartida } = atribucionDeSesion(tickets);
        // Al pedir un ticket, una sesión compartida **entra** —trabajó ese
        // ticket— pero marcada: esconderla dejaría la vista diciendo que nadie
        // de Hermes la tocó, y contarla sin marca le adjudicaría a este ticket el
        // gasto de los otros. Entra si lo **trabajó**; haberlo consultado no
        // alcanza, o la vista de un ticket se llenaría con las sesiones que
        // alguna vez lo nombraron.
        if (
          options.ticketId !== undefined &&
          ticket !== options.ticketId &&
          !tickets.some((t) => t.id === options.ticketId && t.trabajado)
        ) {
          continue;
        }

        const estimado = n(fila.estimated_cost_usd);
        const real = n(fila.actual_cost_usd);
        const coste = real > 0 ? real : estimado > 0 ? estimado : null;

        sesiones.push({
          id: fila.id,
          source: "hermes",
          origin: fila.source ?? "",
          title: fila.title ?? fila.display_name ?? "",
          model: fila.model ?? "",
          provider: fila.billing_provider ?? "",
          dbPath: ruta,
          startedAt: n(fila.started_at) * 1000,
          apiCalls: n(fila.api_call_count),
          toolCalls: n(fila.tool_call_count),
          inputTokens: n(fila.input_tokens),
          outputTokens: n(fila.output_tokens),
          reasoningTokens: n(fila.reasoning_tokens),
          cacheReadTokens: n(fila.cache_read_tokens),
          costUsd: coste,
          ticket,
          tickets,
          compartida,
          failed:
            fila.ended_at === null ||
            (fila.end_reason ?? "").toLowerCase().includes("error"),
        });
      }
    } catch {
      // Una base sin las columnas esperadas —otra versión de Hermes— no aporta
      // nada y tampoco puede tumbar el resto.
    } finally {
      db.close();
    }
  }

  return sesiones.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * El peso de cada ticket dentro de una sesión, y si se trabajó o solo se miró.
 *
 * Se mira lo que la sesión **hizo**: los argumentos de las llamadas a
 * herramientas. Una llamada que escribe pesa tres y marca el ticket como
 * trabajado; una de lectura pesa uno; el texto de los mensajes pesa uno y nunca
 * marca trabajo. Una sesión cita los tickets que dependen del suyo, así que la
 * lista no se recorta a uno: se devuelve entera, ordenada, y quien decide si hay
 * un dueño claro es `atribucionDeSesion`.
 */
function ticketsDeSesion(db: BaseDeDatos, sessionId: string): TicketDeSesion[] {
  const cuenta = new Map<string, { peso: number; trabajado: boolean }>();
  let filas: { data: string | null; content: string | null }[] = [];
  try {
    filas = db
      .prepare(
        `SELECT tool_calls AS data, content AS content
           FROM messages
          WHERE session_id = ? AND (tool_calls IS NOT NULL OR content IS NOT NULL)`,
      )
      .all(sessionId) as unknown as typeof filas;
  } catch {
    return [];
  }

  const sumar = (id: string, peso: number, trabajado: boolean): void => {
    const actual = cuenta.get(id) ?? { peso: 0, trabajado: false };
    cuenta.set(id, {
      peso: actual.peso + peso,
      trabajado: actual.trabajado || trabajado,
    });
  };

  for (const fila of filas) {
    const llamadas = fila.data ?? "";
    // Los nombres viajan con el prefijo de la página que llama, y en Hermes
    // además anidados dentro de `tool_call` con las comillas escapadas: se
    // desescapa para poder leerlos.
    const nombres = [
      ...llamadas.replace(/\\"/g, '"').matchAll(/"name"\s*:\s*"([A-Za-z_0-9]+)"/g),
    ].map((m) => nombreDeHerramienta(m[1] as string));
    const escribe = nombres.some((nombre) => HERRAMIENTAS_QUE_ESCRIBEN.includes(nombre));
    for (const [id, veces] of ticketsDeTexto(llamadas)) {
      sumar(id, veces * (escribe ? 3 : 1), escribe);
    }
    for (const [id, veces] of ticketsDeTexto(fila.content ?? "")) {
      sumar(id, veces, false);
    }
  }

  return [...cuenta.entries()]
    .map(([id, datos]) => ({ id, peso: datos.peso, trabajado: datos.trabajado }))
    .sort((a, b) => b.peso - a.peso || a.id.localeCompare(b.id));
}

/**
 * Si la sesión tiene un dueño claro, y cuál.
 *
 * Gana el ticket más pesado **si es el único que la sesión trabajó**. Dos tickets
 * escritos por la misma sesión son dos trabajos con un solo gasto, y elegir al más
 * mencionado le adjudicaría a uno el costo del otro: es el caso real que motivó la
 * regla —una sesión de Slack de dos horas y media que movió dos tickets, cuyo
 * costo entero quedó registrado en el primero—. Leer otros diez no la hace
 * compartida: consultar no es trabajar.
 */
function atribucionDeSesion(tickets: readonly TicketDeSesion[]): {
  ticket: string | null;
  compartida: boolean;
} {
  const trabajados = tickets.filter((t) => t.trabajado);
  if (trabajados.length > 1) return { ticket: null, compartida: true };
  if (trabajados.length === 1)
    return { ticket: trabajados[0]?.id ?? null, compartida: false };

  // Ninguna escritura: una sesión de conversación. El más mencionado es lo único
  // que hay, y no se marca compartida porque no hay trabajo que repartir.
  return { ticket: tickets[0]?.id ?? null, compartida: false };
}

/** `true` si el directorio tiene una contabilidad de Hermes que leer. */
export function hayDatosDeHermes(home: string = homedir()): boolean {
  return hermesDbs(home).some((ruta) => {
    try {
      return statSync(ruta).size > 0;
    } catch {
      return false;
    }
  });
}
