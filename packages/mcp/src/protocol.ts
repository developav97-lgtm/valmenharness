/**
 * El protocolo MCP sobre stdio.
 *
 * Un servidor MCP es JSON-RPC 2.0 con mensajes separados por saltos de línea. No
 * hace falta el SDK: los tres métodos que un cliente usa de verdad —`initialize`,
 * `tools/list` y `tools/call`— son unas doscientas líneas, y escribirlas aquí tiene
 * una ventaja concreta para este proyecto: **el camino crítico del harness queda sin
 * dependencias**, igual que `core` y el motor. Un agente que no puede arrancar el
 * servidor porque una dependencia transitiva cambió de versión es un agente que no
 * puede trabajar.
 *
 * Lo que sí se respeta del protocolo, porque un cliente estricto lo exige:
 *
 * - La negociación de versión en `initialize`, y que se responda la que el cliente
 *   pidió si se conoce.
 * - `capabilities.tools` con `listChanged: false`: el catálogo es fijo.
 * - Los errores de herramienta van **dentro** del resultado con `isError: true`, no
 *   como error JSON-RPC. Un error de protocolo significa que la llamada no se pudo
 *   hacer; que el comando haya fallado es un resultado, y el agente tiene que poder
 *   leerlo para corregir.
 */
import { createInterface } from "node:readline";

/** La versión del protocolo que este servidor habla. */
export const PROTOCOL_VERSION = "2025-06-18";

/** Las que se aceptan si el cliente pide otra. */
const COMPATIBLES = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** Lo que declara una herramienta. */
export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** Lo que devuelve una herramienta. */
export interface ToolResult {
  readonly text: string;
  /** `true` si el comando falló. El agente lo lee y corrige. */
  readonly isError: boolean;
}

/** El catálogo que un servidor concreto expone. */
export interface ToolCatalog {
  readonly name: string;
  readonly version: string;
  readonly tools: readonly ToolDefinition[];
  readonly call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
}

interface Peticion {
  readonly jsonrpc: "2.0";
  readonly id?: number | string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** Escribe una respuesta. Una línea por mensaje, sin saltos dentro. */
function responder(mensaje: unknown): void {
  process.stdout.write(`${JSON.stringify(mensaje)}\n`);
}

/** Responde con éxito. */
function exito(id: number | string | undefined, result: unknown): void {
  responder({ jsonrpc: "2.0", id, result });
}

/** Responde con error de protocolo. */
function errorProtocolo(
  id: number | string | undefined,
  code: number,
  message: string,
): void {
  responder({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * Sirve el catálogo por stdio hasta que el cliente cierre.
 *
 * Se lee de `stdin` con `readline` para no partir un mensaje por la mitad: un JSON
 * grande puede llegar en varios trozos, y leer a mano del stream es donde se
 * pierden los mensajes largos.
 *
 * Devuelve una promesa que se resuelve cuando el cliente cierra la entrada. El
 * proceso tiene que quedarse vivo mientras tanto: si el servidor terminara al
 * acabar de registrar los manejadores, el agente vería morir el proceso antes de
 * poder llamar a nada.
 */
export function serveStdio(catalogo: ToolCatalog): Promise<void> {
  const lineas = createInterface({ input: process.stdin, terminal: false });

  lineas.on("line", (linea: string) => {
    const texto = linea.trim();
    if (texto === "") return;

    let peticion: Peticion;
    try {
      peticion = JSON.parse(texto) as Peticion;
    } catch {
      errorProtocolo(undefined, -32700, "El mensaje no es JSON.");
      return;
    }

    // Una notificación no lleva identificador y no se responde.
    const esNotificacion = peticion.id === undefined;

    void (async (): Promise<void> => {
      try {
        const resultado = await atender(peticion, catalogo);
        if (!esNotificacion) exito(peticion.id, resultado);
      } catch (caught) {
        if (esNotificacion) return;
        const detalle = caught instanceof Error ? caught.message : String(caught);
        errorProtocolo(peticion.id, -32603, detalle);
      }
    })();
  });

  return new Promise<void>((resolver) => {
    lineas.on("close", () => resolver());
  });
}

/** Atiende un método del protocolo. */
async function atender(peticion: Peticion, catalogo: ToolCatalog): Promise<unknown> {
  switch (peticion.method) {
    case "initialize": {
      const pedida = peticion.params?.["protocolVersion"];
      const version =
        typeof pedida === "string" && COMPATIBLES.includes(pedida)
          ? pedida
          : PROTOCOL_VERSION;
      return {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: catalogo.name, version: catalogo.version },
      };
    }

    // El cliente lo manda tras inicializar. No hay nada que hacer y no se responde.
    case "notifications/initialized":
    case "notifications/cancelled":
      return undefined;

    case "tools/list":
      return { tools: catalogo.tools };

    case "tools/call": {
      const nombre = peticion.params?.["name"];
      if (typeof nombre !== "string") {
        throw new Error("`tools/call` necesita `name`.");
      }
      const herramienta = catalogo.tools.find((t) => t.name === nombre);
      if (herramienta === undefined) {
        throw new Error(
          `Herramienta desconocida: "${nombre}". Las que hay: ` +
            `${catalogo.tools.map((t) => t.name).join(", ")}.`,
        );
      }

      const bruto = peticion.params?.["arguments"];
      const argumentos =
        typeof bruto === "object" && bruto !== null
          ? (bruto as Record<string, unknown>)
          : {};

      const resultado = await catalogo.call(nombre, argumentos);
      return {
        content: [{ type: "text", text: resultado.text }],
        // Un fallo de la herramienta es un **resultado**, no un error de protocolo:
        // el agente tiene que poder leerlo para corregir. Un error JSON-RPC aquí
        // dejaría al modelo sin el motivo.
        isError: resultado.isError,
      };
    }

    default:
      throw new Error(`Método no soportado: "${peticion.method}".`);
  }
}
