/**
 * Transcripciones sintéticas de Claude Code para los tests.
 *
 * La sesión real sigue creciendo mientras vive —medirla hoy da un número y mañana
 * otro—, así que los tests no la leen: construyen una con **la forma** que importa
 * y con números que se pueden sumar a mano. La forma es la medida en una sesión
 * real y es la parte que hace fallar a un lector ingenuo:
 *
 * - cada línea de asistente trae **un solo bloque** y repite el `message.id` y el
 *   `usage` del mensaje entero;
 * - solo algunas líneas traen `cwd` (las de cola, título y último prompt no);
 * - el `cwd` cambia dentro de la misma sesión;
 * - los subagentes viven en `<carpeta>/<id>/subagents/agent-*.jsonl`.
 */
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** El nombre de carpeta que Claude Code le da a una ruta de proyecto. */
export function carpetaDeClaude(ruta: string): string {
  return ruta.replace(/[^a-zA-Z0-9]/g, "-");
}

export interface UsoDePrueba {
  readonly input: number;
  readonly creacion: number;
  readonly lectura: number;
  readonly salida: number;
}

/** Un bloque de contenido de un mensaje del asistente. */
export type BloqueDePrueba =
  | { readonly tipo: "texto"; readonly texto: string }
  | {
      readonly tipo: "llamada";
      readonly id: string;
      readonly name: string;
      readonly input: Record<string, unknown>;
    };

export const texto = (contenido: string): BloqueDePrueba => ({ tipo: "texto", texto: contenido });

export const llamada = (
  id: string,
  name: string,
  input: Record<string, unknown> = {},
): BloqueDePrueba => ({ tipo: "llamada", id, name, input });

export interface OpcionesDeLinea {
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
}

/**
 * Las líneas de un mensaje del asistente: **una por bloque**, todas con el mismo
 * `message.id` y el mismo `usage`, que es lo que hace el cliente real.
 *
 * `modelo` en `null` omite el campo, que es la sesión sin modelo; `undefined` usa el
 * de siempre.
 */
export function mensajeDelAsistente(
  datos: {
    readonly id: string;
    readonly modelo?: string | null;
    readonly uso?: Partial<UsoDePrueba>;
    readonly bloques: readonly BloqueDePrueba[];
  },
  opciones: OpcionesDeLinea = {},
): string[] {
  const uso = { input: 1, creacion: 0, lectura: 0, salida: 10, ...datos.uso };
  return datos.bloques.map((bloque, indice) =>
    JSON.stringify({
      parentUuid: `padre-${datos.id}-${indice}`,
      isSidechain: false,
      type: "assistant",
      uuid: `${datos.id}-${indice}`,
      message: {
        id: datos.id,
        type: "message",
        role: "assistant",
        ...(datos.modelo === null ? {} : { model: datos.modelo ?? "claude-sonnet-5-5" }),
        content: [
          bloque.tipo === "texto"
            ? { type: "text", text: bloque.texto }
            : { type: "tool_use", id: bloque.id, name: bloque.name, input: bloque.input },
        ],
        stop_reason: indice === datos.bloques.length - 1 ? "end_turn" : "tool_use",
        usage: {
          input_tokens: uso.input,
          cache_creation_input_tokens: uso.creacion,
          cache_read_input_tokens: uso.lectura,
          output_tokens: uso.salida,
        },
      },
      timestamp: opciones.timestamp ?? "2026-10-05T18:31:10.000Z",
      ...(opciones.cwd === undefined ? {} : { cwd: opciones.cwd }),
      ...(opciones.sessionId === undefined ? {} : { sessionId: opciones.sessionId }),
    }),
  );
}

/** Un mensaje del usuario: lo que escribió, o lo que el cliente le inyectó. */
export function mensajeDelUsuario(
  contenido: string,
  opciones: OpcionesDeLinea & { readonly meta?: boolean } = {},
): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: "user",
    ...(opciones.meta === true ? { isMeta: true } : {}),
    message: { role: "user", content: contenido },
    uuid: `usuario-${contenido.length}`,
    timestamp: opciones.timestamp ?? "2026-10-05T18:31:05.613Z",
    ...(opciones.cwd === undefined ? {} : { cwd: opciones.cwd }),
    ...(opciones.sessionId === undefined ? {} : { sessionId: opciones.sessionId }),
  });
}

/** El resultado de una herramienta: lo que el agente **leyó**, no lo que escribió. */
export function resultadoDeHerramienta(
  idDeLaLlamada: string,
  contenido: string,
  opciones: OpcionesDeLinea & { readonly error?: boolean } = {},
): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: idDeLaLlamada,
          content: contenido,
          ...(opciones.error === true ? { is_error: true } : {}),
        },
      ],
    },
    uuid: `resultado-${idDeLaLlamada}`,
    timestamp: opciones.timestamp ?? "2026-10-05T18:31:20.000Z",
    ...(opciones.cwd === undefined ? {} : { cwd: opciones.cwd }),
    ...(opciones.sessionId === undefined ? {} : { sessionId: opciones.sessionId }),
  });
}

/** Las líneas de cola, título y último prompt, que no traen `cwd`. */
export const lineaDeCola = (contenido: string): string =>
  JSON.stringify({
    type: "queue-operation",
    operation: "enqueue",
    timestamp: "2026-10-05T18:31:05.578Z",
    sessionId: "x",
    content: contenido,
  });

export const lineaDeTitulo = (titulo: string): string =>
  JSON.stringify({ type: "custom-title", customTitle: titulo, sessionId: "x" });

/** Un mensaje sintético: el cliente lo escribe ante un error, sin gasto y con otro modelo. */
export const mensajeSintetico = (id: string): string[] =>
  mensajeDelAsistente({
    id,
    modelo: "<synthetic>",
    uso: { input: 0, creacion: 0, lectura: 0, salida: 0 },
    bloques: [texto("API Error")],
  });

/**
 * Escribe una sesión en `<home>/.claude/projects/<carpeta>/<id>.jsonl`.
 *
 * `carpeta` es el nombre de la carpeta de proyecto —por omisión, el del `root`—.
 * `subagentes` se escriben en `<carpeta>/<id>/subagents/agent-<n>.jsonl`, y
 * `modificado` fija la fecha del archivo para probar la ventana de días.
 */
export function escribirSesionDeClaude(
  home: string,
  opciones: {
    readonly root: string;
    readonly id: string;
    readonly lineas: readonly string[];
    readonly carpeta?: string;
    readonly subagentes?: readonly (readonly string[])[];
    readonly modificado?: Date;
  },
): string {
  const carpeta = join(
    home,
    ".claude",
    "projects",
    opciones.carpeta ?? carpetaDeClaude(opciones.root),
  );
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${opciones.id}.jsonl`);
  writeFileSync(ruta, `${opciones.lineas.join("\n")}\n`, "utf8");

  const subagentes = opciones.subagentes ?? [];
  if (subagentes.length > 0) {
    const directorio = join(carpeta, opciones.id, "subagents");
    mkdirSync(directorio, { recursive: true });
    subagentes.forEach((lineas, indice) => {
      writeFileSync(join(directorio, `agent-a${indice}.jsonl`), `${lineas.join("\n")}\n`, "utf8");
      writeFileSync(
        join(directorio, `agent-a${indice}.meta.json`),
        JSON.stringify({ agentType: "Explore", spawnDepth: 1 }),
        "utf8",
      );
    });
  }

  if (opciones.modificado !== undefined) {
    utimesSync(ruta, opciones.modificado, opciones.modificado);
  }
  return ruta;
}
