/**
 * Las sesiones de codex: consumo real de un agente que no es opencode.
 *
 * El harness nació leyendo la contabilidad de opencode y eso estaba bien mientras
 * el trabajo saliera de ahí. Pero **el mismo ticket se puede trabajar desde
 * codex**, y entonces la línea de tiempo no encontraba nada: la pantalla mostraba
 * el gasto de otras sesiones y el ticket quedaba sin su consumo. Un registro que
 * solo ve a un agente mide mal el trabajo.
 *
 * codex guarda cada sesión en `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl`, y el
 * archivo trae lo que hace falta: el directorio de trabajo en la primera línea, el
 * uso de tokens acumulado, y las invocaciones al harness.
 *
 * **El coste no existe, y no se inventa.** codex va por suscripción: no hay precio
 * por token, así que lo que se registra son los tokens —que son un dato medido— y
 * el coste queda como desconocido. Poner un cero ahí diría «gratis», que es falso,
 * y estimarlo con la tarifa de otro proveedor sería peor: un número inventado con
 * forma de medición.
 */
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Una sesión de codex, con lo que el registro necesita de ella. */
export interface SesionDeCodex {
  readonly id: string;
  readonly path: string;
  /** Cuándo empezó, en milisegundos. */
  readonly startedAt: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  /** Cuántas veces se invocó el harness desde esta sesión. */
  readonly intervenciones: number;
  /** `true` si la sesión nombra el ticket que se está mirando. */
  readonly mencionaElTicket: boolean;
}

/** Dónde viven las sesiones de codex. */
export function codexSessionsPath(home: string = homedir()): string {
  return join(home, ".codex", "sessions");
}

/**
 * Los archivos de sesión de los últimos días.
 *
 * Se recorren los directorios por fecha y no todo el archivo histórico: con 272
 * sesiones y 612 MB, buscar en todo tarda ocho segundos, y una línea de tiempo que
 * tarda ocho segundos no se usa. Sesenta días cubren cualquier ticket abierto.
 */
function archivosRecientes(base: string, dias: number, hoy = new Date()): string[] {
  const rutas: string[] = [];

  // Se empieza en **mañana** y se usan las fechas en UTC. Las dos cosas son por lo
  // mismo: codex nombra la carpeta con la fecha del archivo, que es UTC, y este
  // equipo está cinco horas detrás. Calcular el directorio de «hoy» con la fecha
  // local hacía que la sesión recién empezada quedara en la carpeta siguiente —a la
  // que el escaneo nunca llegaba—, así que el consumo de hoy no aparecía hasta
  // mañana. Un día de margen hacia adelante cubre cualquier desfase horario.
  for (let atras = -1; atras <= dias; atras += 1) {
    const fecha = new Date(hoy);
    fecha.setUTCDate(fecha.getUTCDate() - atras);
    const anio = String(fecha.getUTCFullYear());
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getUTCDate()).padStart(2, "0");
    const directorio = join(base, anio, mes, dia);

    let nombres: string[];
    try {
      nombres = readdirSync(directorio);
    } catch {
      continue;
    }
    for (const nombre of nombres) {
      if (nombre.endsWith(".jsonl")) rutas.push(join(directorio, nombre));
    }
  }

  return rutas.sort();
}

/**
 * El directorio de trabajo de una sesión.
 *
 * Está en la primera línea del archivo, así que se lee un trozo y no el archivo
 * entero: es lo que permite descartar una sesión de otro proyecto sin parsear
 * megabytes de conversación.
 *
 * Se busca con una expresión regular y **no se parsea la línea**: la primera línea
 * de una sesión de codex trae las instrucciones completas del agente —cientos de
 * kilobytes de texto— y un `JSON.parse` sobre un trozo cortado falla. El `cwd`
 * aparece en los primeros cientos de bytes y encontrarlo no necesita entender el
 * resto.
 */
function directorioDeSesion(ruta: string): string | null {
  let descriptor: number;
  try {
    descriptor = openSync(ruta, "r");
  } catch {
    return null;
  }

  let trozo: string;
  try {
    const buffer = Buffer.alloc(4096);
    const leidos = readSync(descriptor, buffer, 0, buffer.length, 0);
    trozo = buffer.subarray(0, leidos).toString("utf8");
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }

  const encontrado = /"cwd"\s*:\s*"([^"]+)"/.exec(trozo);
  return encontrado === null ? null : (encontrado[1] as string);
}

/** El uso acumulado de una sesión, leído del último `token_count`. */
interface UsoDeTokens {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
}

/** Un número de un campo que puede no estar, sin inventarlo. */
function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/**
 * Lee las sesiones de codex de un proyecto.
 *
 * Con `ticketId`, solo las que lo nombran: la línea de tiempo de un ticket no
 * tiene por qué cargar las sesiones que no lo tocaron, y el coste que muestra
 * tiene que ser el suyo.
 */
export function leerSesionesDeCodex(
  root: string,
  options: {
    readonly home?: string;
    readonly ticketId?: string;
    readonly dias?: number;
  } = {},
): SesionDeCodex[] {
  const base = codexSessionsPath(options.home ?? homedir());
  if (!existsSync(base)) return [];

  const sesiones: SesionDeCodex[] = [];

  for (const ruta of archivosRecientes(base, options.dias ?? 60)) {
    const cwd = directorioDeSesion(ruta);
    if (cwd === null || cwd !== root) continue;

    let contenido: string;
    try {
      contenido = readFileSync(ruta, "utf8");
    } catch {
      continue;
    }

    let id = "";
    let startedAt = 0;
    let uso: UsoDeTokens | null = null;
    let intervenciones = 0;
    let mencionaElTicket = options.ticketId === undefined;

    for (const linea of contenido.split("\n")) {
      if (linea.trim() === "") continue;
      // Las invocaciones al harness se cuentan sobre el texto crudo y no sobre el
      // JSON parseado: aparecen en comandos, en salidas y en llamadas, y buscar la
      // palabra es lo que las encuentra todas.
      if (linea.includes("valmen ")) {
        intervenciones += linea.split("valmen ").length - 1;
      }
      if (options.ticketId !== undefined && linea.includes(options.ticketId)) {
        mencionaElTicket = true;
      }

      let evento: Record<string, unknown>;
      try {
        evento = JSON.parse(linea) as Record<string, unknown>;
      } catch {
        continue;
      }
      const payload = (evento["payload"] ?? {}) as Record<string, unknown>;

      if (evento["type"] === "session_meta") {
        id = typeof payload["id"] === "string" ? payload["id"] : id;
        const marca = payload["timestamp"];
        if (typeof marca === "string") startedAt = Date.parse(marca) || startedAt;
        continue;
      }

      // El uso es acumulado: el último `token_count` del archivo es el total.
      if (payload["type"] === "token_count") {
        const info = (payload["info"] ?? {}) as Record<string, unknown>;
        const total = (info["total_token_usage"] ?? {}) as Record<string, unknown>;
        uso = {
          // `input_tokens` incluye los servidos desde caché: se separan para que
          // el número se pueda comparar con lo que muestra codex.
          inputTokens: numero(total["input_tokens"]) - numero(total["cached_input_tokens"]),
          cachedInputTokens: numero(total["cached_input_tokens"]),
          outputTokens: numero(total["output_tokens"]),
          reasoningTokens: numero(total["reasoning_output_tokens"]),
        };
      }
    }

    if (id === "" || uso === null) continue;
    if (!mencionaElTicket) continue;

    sesiones.push({
      id,
      path: ruta,
      startedAt,
      ...uso,
      intervenciones,
      mencionaElTicket,
    });
  }

  return sesiones;
}
