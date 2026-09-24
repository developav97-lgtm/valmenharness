/**
 * El protocolo MCP sobre stdio.
 *
 * Un servidor MCP es JSON-RPC 2.0 con mensajes separados por saltos de línea. No
 * hace falta el SDK: los métodos que un cliente usa de verdad —`initialize`,
 * `tools/list`, `tools/call`, `prompts/list` y `prompts/get`— son unas doscientas
 * líneas, y escribirlas aquí tiene
 * una ventaja concreta para este proyecto: **el camino crítico del harness queda sin
 * dependencias**, igual que `core` y el motor. Un agente que no puede arrancar el
 * servidor porque una dependencia transitiva cambió de versión es un agente que no
 * puede trabajar.
 *
 * Lo que sí se respeta del protocolo, porque un cliente estricto lo exige:
 *
 * - La negociación de versión en `initialize`, y que se responda la que el cliente
 *   pidió si se conoce.
 * - `capabilities.tools` y `capabilities.prompts`, los dos con `listChanged: false`:
 *   los catálogos son fijos —salen del disco y no cambian mientras el servidor
 *   vive—, así que prometer notificaciones de cambio sería prometer algo que nadie
 *   va a mandar.
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

/**
 * Lo que una herramienta declara de sí misma, además de su forma.
 *
 * Existe porque un cliente MCP tiene que poder decidir **sin llamar** si una
 * herramienta es segura de ejecutar sola. Hasta ahora no podía: las treinta y
 * cinco se veían iguales, así que un cliente con aprobación por herramienta
 * —Hermes con `trust: untrusted`, Claude Code, Cursor— solo tenía dos opciones,
 * preguntar por todo o no preguntar por nada. Ninguna de las dos es aceptable:
 * la primera vuelve inusable un servidor de consulta, y la segunda deja que un
 * agente escriba en el registro sin que nadie lo mire.
 *
 * El campo es **obligatorio** en `ToolDefinition` a propósito. Una anotación que
 * se puede omitir es una anotación que se omite, y el default del protocolo para
 * `destructiveHint` es `true`: una herramienta nueva sin anotar no rompe nada, se
 * declara peligrosa en silencio y el cliente le pide permiso a la persona para
 * leer un ticket. Haciéndolo obligatorio, la herramienta que se agregue sin
 * anotar **no compila**, que es la única forma de que esto no se desactualice.
 *
 * El criterio con el que se llenan está escrito en `tools.ts`, junto a las
 * constantes que las agrupan: no se inventa herramienta por herramienta.
 */
export interface ToolAnnotations {
  /**
   * No escribe en el registro **y no gasta**.
   *
   * Las dos condiciones, y la segunda no es un detalle: `simular_compuerta` y
   * `calibrar_compuerta` no tocan un archivo, pero cada llamada evalúa el
   * histórico contra un proveedor de modelo. Un cliente que auto-apruebe todo lo
   * que se declara de solo lectura tiene que poder confiar en que eso también
   * significa que no le va a costar dinero a nadie.
   */
  readonly readOnlyHint: boolean;
  /**
   * Reescribe algo que ya existía.
   *
   * Se corresponde con el invariante 4 del harness —los bloques append-only no se
   * reescriben—: una herramienta que solo anexa o que crea un archivo nuevo nunca
   * lo es, y una que mueve un estado, reescribe un índice o cierra una decisión
   * sí. El valor por defecto del protocolo es `true`, así que declararlo exige
   * haberlo pensado.
   */
  readonly destructiveHint: boolean;
  /** Repetirla con los mismos argumentos deja el mismo estado. */
  readonly idempotentHint: boolean;
  /**
   * Sale del proyecto: llama a un proveedor de modelo o ejecuta pasos que el
   * proceso declara. Es lo que le dice a un cliente que la herramienta tiene
   * efectos fuera del registro.
   */
  readonly openWorldHint: boolean;
}

/** Lo que declara una herramienta. */
export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  /**
   * Si escribe, si borra, si se puede repetir y si sale del proyecto.
   *
   * Obligatorio, y por eso no lleva `?`: ver `ToolAnnotations`.
   */
  readonly annotations: ToolAnnotations;
  /**
   * El esquema del contenido estructurado, cuando la herramienta lo devuelve.
   *
   * **No todas lo tienen, y eso es la decisión de diseño de este archivo.** El
   * protocolo exige que una herramienta que declara `outputSchema` devuelva
   * siempre `structuredContent` que lo cumpla, así que declararlo es prometer una
   * forma estable. Aquí solo se promete donde la fuente **ya es un dato canónico
   * en disco** —el recibo que el motor acaba de escribir, el frontmatter que el
   * parser de `@valmen/core` ya lee— y nunca donde habría que inventar una
   * segunda representación del texto que la herramienta ya devuelve. Dos
   * representaciones del mismo hecho se desincronizan, y la que se desincroniza
   * es siempre la que nadie mira.
   */
  readonly outputSchema?: Record<string, unknown>;
}

/** Lo que devuelve una herramienta. */
export interface ToolResult {
  readonly text: string;
  /** `true` si el comando falló. El agente lo lee y corrige. */
  readonly isError: boolean;
  /**
   * El mismo resultado, como dato.
   *
   * Va **además** del texto, nunca en su lugar: el texto es el informe del motor
   * —que dice qué falta y con qué código de salida— y el dato es para que el
   * agente ramifique sin tener que interpretar prosa. Cuando está, `tools/call` lo
   * emite como `structuredContent`.
   */
  readonly data?: Record<string, unknown>;
}

/**
 * Lo que declara un prompt.
 *
 * Un prompt es un procedimiento que el cliente ofrece a la persona —en la mayoría
 * de los clientes, un comando— y que se materializa como un mensaje. El harness
 * publica así sus skills, para no depender de un adaptador por agente.
 */
export interface PromptDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
}

/** Lo que devuelve `prompts/get`: el contenido del prompt, ya armado. */
export interface PromptResult {
  readonly description: string;
  readonly messages: readonly {
    readonly role: "user";
    readonly content: { readonly type: "text"; readonly text: string };
  }[];
}

/** El catálogo que un servidor concreto expone. */
export interface ServerCatalog {
  readonly name: string;
  readonly version: string;
  readonly tools: readonly ToolDefinition[];
  readonly prompts: readonly PromptDefinition[];
  readonly call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  readonly getPrompt: (name: string, args: Record<string, unknown>) => PromptResult;
}

/** Una petición del cliente. Se exporta para poder probar el despacho sin stdio. */
export interface Peticion {
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
export function serveStdio(catalogo: ServerCatalog): Promise<void> {
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

/**
 * Arma la respuesta de `tools/call` a partir del resultado de una herramienta.
 *
 * Está separada de `atender` para que se pueda probar: la alternativa era
 * afirmar sobre `stdout`, que es el canal del protocolo y el sitio donde una
 * prueba se vuelve frágil —basta un mensaje de aviso de Node para que deje de
 * medir lo que dice medir.
 */
export function respuestaDeHerramienta(resultado: ToolResult): Record<string, unknown> {
  const respuesta: Record<string, unknown> = {
    content: [{ type: "text", text: resultado.text }],
    // Un fallo de la herramienta es un **resultado**, no un error de protocolo:
    // el agente tiene que poder leerlo para corregir. Un error JSON-RPC aquí
    // dejaría al modelo sin el motivo.
    isError: resultado.isError,
  };
  // `structuredContent` solo cuando la herramienta devolvió dato. Emitirlo vacío
  // en las que no lo tienen sería prometer una forma que nadie llenó, y el
  // cliente la validaría contra un `outputSchema` que no existe.
  if (resultado.data !== undefined) respuesta["structuredContent"] = resultado.data;
  return respuesta;
}

/**
 * Atiende un método del protocolo.
 *
 * Está separada de `serveStdio` por la misma razón que `respuestaDeHerramienta`:
 * afirmar sobre `stdout` es afirmar sobre el canal del protocolo, y ahí una prueba
 * se vuelve frágil —basta un aviso de Node para que deje de medir lo que dice
 * medir—. Así se prueba lo que el cliente recibe, que es lo que importa.
 */
export async function atender(
  peticion: Peticion,
  catalogo: ServerCatalog,
): Promise<unknown> {
  switch (peticion.method) {
    case "initialize": {
      const pedida = peticion.params?.["protocolVersion"];
      const version =
        typeof pedida === "string" && COMPATIBLES.includes(pedida)
          ? pedida
          : PROTOCOL_VERSION;
      return {
        protocolVersion: version,
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
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
      return respuestaDeHerramienta(resultado);
    }

    case "prompts/list":
      return {
        prompts: catalogo.prompts.map((prompt) => ({
          name: prompt.name,
          title: prompt.title,
          description: prompt.description,
          // Sin `arguments`: las skills del harness resuelven por sí solas qué leer.
          // Declarar argumentos vacíos haría que algunos clientes pidieran valores
          // para una lista que no existe.
        })),
      };

    case "prompts/get": {
      const nombre = peticion.params?.["name"];
      if (typeof nombre !== "string") {
        throw new Error("`prompts/get` necesita `name`.");
      }
      const conocido = catalogo.prompts.find((prompt) => prompt.name === nombre);
      if (conocido === undefined) {
        throw new Error(
          `Prompt desconocido: "${nombre}". Los que hay: ` +
            `${catalogo.prompts.map((p) => p.name).join(", ") || "(ninguno)"}.`,
        );
      }
      const bruto = peticion.params?.["arguments"];
      const argumentos =
        typeof bruto === "object" && bruto !== null
          ? (bruto as Record<string, unknown>)
          : {};
      return catalogo.getPrompt(nombre, argumentos);
    }

    default:
      throw new Error(`Método no soportado: "${peticion.method}".`);
  }
}
