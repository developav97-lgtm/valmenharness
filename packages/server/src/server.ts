/**
 * Mission Control: servidor local.
 *
 * **Este servidor no tiene lógica de negocio.** Todos sus endpoints llaman al
 * mismo motor que usa el CLI. Si un botón de la interfaz y un comando de
 * terminal pudieran divergir, el sistema sería una mentira: lo que se ve en la
 * pantalla tiene que ser exactamente lo que hace el harness.
 *
 * Por eso la API es fina a propósito. Valida la entrada, llama al motor y
 * serializa el resultado. Nada más.
 *
 * Escucha solo en `127.0.0.1`: la frontera de confianza es la máquina, igual
 * que en cualquier herramienta que maneja credenciales.
 *
 * Ver docs/06-CONTROL-APP.md.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import {
  type ProviderStatus,
  credentialsPath,
  listProviders,
  probeProvider,
  updateCredentials,
} from "./providers.js";
import {
  type TicketFilters,
  filterTickets,
  listTickets,
  readTicket,
  summarize,
} from "./tickets.js";

/** Versión de la API. Un cliente que no la entienda debe fallar, no adivinar. */
export const API_VERSION = 1;

/** Respuesta uniforme de la API. */
interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Contexto que los handlers necesitan, inyectable para pruebas. */
export interface ServerContext {
  /** Raíz del proyecto sobre la que opera la interfaz. */
  readonly root: string;
  readonly credentialsFile: string;
  readonly env: NodeJS.ProcessEnv;
  /** Inyectable para que las pruebas no salgan a la red. */
  readonly fetchImpl?: typeof fetch;
  /** Módulos estáticos a servir, por ruta. */
  readonly statics?: Readonly<
    Record<string, { readonly body: string; readonly type: string }>
  >;
}

/** Construye el contexto por defecto. */
export function defaultContext(root: string): ServerContext {
  return { root, credentialsFile: credentialsPath(), env: process.env };
}

/** Lee el cuerpo de una petición como JSON, con un límite razonable. */
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    // Un cuerpo enorme en un endpoint local es un error, no un caso a soportar.
    if (total > 64 * 1024)
      throw new Error("El cuerpo de la petición es demasiado grande.");
    chunks.push(buffer);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/** Proveedor tal como lo devuelve la API. Nunca incluye el valor de la clave. */
type ProviderDto = ProviderStatus;

/**
 * Enrutado de la API.
 *
 * Se separa del servidor HTTP para poder probar cada endpoint llamándolo
 * directamente, sin abrir un puerto.
 */
export async function handleApi(
  method: string,
  path: string,
  body: unknown,
  context: ServerContext,
  search?: URLSearchParams,
): Promise<ApiResponse> {
  const partes = path.split("/").filter((part) => part !== "");
  const query = search ?? new URLSearchParams();

  // GET /api/health
  if (method === "GET" && path === "/api/health") {
    return {
      status: 200,
      body: { apiVersion: API_VERSION, root: context.root, ok: true },
    };
  }

  // GET /api/tickets?workflow=&type=&module=&q=&open=&invalid=&limit=
  if (method === "GET" && partes.length === 2 && partes[0] === "api" && partes[1] === "tickets") {
    const params = query ?? new URLSearchParams();
    const filas = listTickets(context.root);
    const filtros: TicketFilters = {
      ...(params.get("workflow") === null ? {} : { workflowStatus: params.get("workflow") as string }),
      ...(params.get("type") === null ? {} : { type: params.get("type") as string }),
      ...(params.get("module") === null ? {} : { module: params.get("module") as string }),
      ...(params.get("q") === null ? {} : { query: params.get("q") as string }),
      ...(params.get("open") === "1" ? { onlyOpen: true } : {}),
      ...(params.get("invalid") === "1" ? { onlyInvalid: true } : {}),
      ...(params.get("limit") === null
        ? {}
        : { limit: Number.parseInt(params.get("limit") as string, 10) }),
    };
    return {
      status: 200,
      body: { summary: summarize(filas), tickets: filterTickets(filas, filtros) },
    };
  }

  // GET /api/tickets/:id
  if (method === "GET" && partes.length === 3 && partes[0] === "api" && partes[1] === "tickets") {
    const detalle = readTicket(context.root, partes[2] as string);
    if (detalle === null) {
      return { status: 404, body: { error: `No existe el ticket "${partes[2]}".` } };
    }
    return { status: 200, body: detalle };
  }

  // GET /api/providers
  if (method === "GET" && path === "/api/providers") {
    return {
      status: 200,
      body: { providers: listProviders(context.credentialsFile, context.env) },
    };
  }

  // POST /api/providers/:id/probe
  if (
    method === "POST" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "providers" &&
    partes[3] === "probe"
  ) {
    const id = partes[2] as string;
    const resultado = await probeProvider(id, {
      filePath: context.credentialsFile,
      env: context.env,
      ...(context.fetchImpl === undefined
        ? {}
        : { fetchImpl: context.fetchImpl }),
    });
    return { status: 200, body: resultado };
  }

  // PUT /api/providers/:id/credential
  if (
    method === "PUT" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "providers" &&
    partes[3] === "credential"
  ) {
    const id = partes[2] as string;
    const datos = body as { apiKey?: unknown };
    if (typeof datos.apiKey !== "string") {
      return { status: 400, body: { error: "Falta el campo `apiKey`." } };
    }

    try {
      // Se prueba **antes** de guardar: una clave mal pegada debe fallar en la
      // pantalla, no en la mitad de un gate.
      const prueba = await probeProvider(id, {
        filePath: context.credentialsFile,
        // La clave nueva se prueba antes de escribirla, sin pasar por el archivo.
        env: { ...context.env, ...envFor(id, datos.apiKey) },
        ...(context.fetchImpl === undefined
          ? {}
          : { fetchImpl: context.fetchImpl }),
      });

      if (!prueba.ok) {
        return {
          status: 422,
          body: {
            error:
              "La clave no superó la prueba de conexión; no se guardó nada.",
            probe: prueba,
          },
        };
      }

      const resultado = updateCredentials(
        [{ provider: id, apiKey: datos.apiKey }],
        context.credentialsFile,
      );
      return {
        status: 200,
        body: { written: resultado.written, probe: prueba },
      };
    } catch (caught) {
      const mensaje = caught instanceof Error ? caught.message : String(caught);
      return { status: 400, body: { error: mensaje } };
    }
  }

  // DELETE /api/providers/:id/credential
  if (
    method === "DELETE" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "providers" &&
    partes[3] === "credential"
  ) {
    const id = partes[2] as string;
    try {
      const resultado = updateCredentials(
        [{ provider: id, apiKey: "" }],
        context.credentialsFile,
      );
      return { status: 200, body: { cleared: resultado.written } };
    } catch (caught) {
      const mensaje = caught instanceof Error ? caught.message : String(caught);
      return { status: 400, body: { error: mensaje } };
    }
  }

  return {
    status: 404,
    body: { error: `Ruta no encontrada: ${method} ${path}` },
  };
}

/** Construye el entorno para probar una clave sin escribirla en el archivo. */
function envFor(id: string, apiKey: string): Record<string, string> {
  const variables: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    zhipu: "ZHIPU_API_KEY",
    qwen: "QWEN_API_KEY",
  };
  const nombre = variables[id];
  return nombre === undefined ? {} : { [nombre]: apiKey };
}

/** Tipos MIME de los archivos que sirve la interfaz. */
const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

/** Sirve un archivo estático, o `null` si no corresponde. */
function serveStatic(path: string, context: ServerContext): ApiResponse | null {
  const statics = context.statics;
  if (statics === undefined) return null;

  const nombre = path === "/" ? "index.html" : path.replace(/^\//, "");
  // Sin recorrido de directorios: solo se sirve lo declarado en el mapa.
  const archivo = statics[nombre];
  if (archivo === undefined) return null;

  return {
    status: 200,
    body: { __static: true, body: archivo.body, type: archivo.type },
  };
}

/** Crea el servidor HTTP. */
export function createMissionControl(context: ServerContext): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, context);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ServerContext,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";

  try {
    if (url.pathname.startsWith("/api/")) {
      let body: unknown = {};
      if (method === "PUT" || method === "POST") {
        body = await readJson(request);
      }
      const resultado = await handleApi(method, url.pathname, body, context, url.searchParams);
      send(
        response,
        resultado.status,
        resultado.body,
        "application/json; charset=utf-8",
      );
      return;
    }

    const estatico = serveStatic(url.pathname, context);
    if (estatico !== null) {
      const payload = estatico.body as { body: string; type: string };
      send(response, 200, payload.body, payload.type, true);
      return;
    }

    send(
      response,
      404,
      { error: `No encontrado: ${url.pathname}` },
      "application/json; charset=utf-8",
    );
  } catch (caught) {
    const mensaje = caught instanceof Error ? caught.message : String(caught);
    send(response, 500, { error: mensaje }, "application/json; charset=utf-8");
  }
}

/** Escribe una respuesta. */
function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  type: string,
  raw = false,
): void {
  const texto =
    raw || typeof body === "string"
      ? String(body)
      : JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "Content-Type": type,
    // Una herramienta local no debe ser embebible ni filtrable por un tercero.
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  response.end(texto);
}

/** Carga los estáticos desde un directorio, para el servidor real. */
export function loadStatics(
  directory: string,
  files: readonly string[],
): Readonly<Record<string, { body: string; type: string }>> {
  const mapa: Record<string, { body: string; type: string }> = {};
  for (const archivo of files) {
    const ruta = `${directory}/${archivo}`;
    mapa[archivo] = {
      body: readFileSync(ruta, "utf8"),
      type: MIME[extname(archivo)] ?? "application/octet-stream",
    };
  }
  return mapa;
}

export {
  credentialsPath,
  listProviders,
  probeProvider,
  updateCredentials,
  MIME,
};
