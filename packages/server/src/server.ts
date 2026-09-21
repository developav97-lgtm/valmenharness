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

import { type RegistryPaths, choosePaths } from "@valmen/engine";

import {
  type ProviderStatus,
  credentialsPath,
  listProviders,
  probeProvider,
  updateCredentials,
} from "./providers.js";
import {
  type GateCard,
  type GateDecisionView,
  type GateRunOutcome,
  listGateCards,
  listGateDecisions,
  recordHumanDecision,
  runTicketGate,
} from "./gates.js";
import {
  type ApplyRequest,
  ConfigChatError,
  applyChanges,
  proposeConfigChange,
} from "./chat.js";
import {
  type ConfigState,
  checkConfig,
  configPath,
  projectionImpact,
  readConfigText,
  syncProjections,
  writeConfig,
} from "./config.js";
import {
  type RoutingState,
  checkRouting,
  fetchCatalog,
  hasRouting,
  readRouting,
  resetCatalogCache,
  routingFromForm,
  writeRouting,
} from "./routing.js";
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
  /**
   * Rutas del registro de tickets.
   *
   * Si no se indica, se detecta el layout del proyecto. Está hardcodeado en
   * ningún sitio a propósito: el registro de un proyecto adoptado vive en
   * `docs/tickets` y la interfaz tiene que mostrar ese, no uno vacío.
   */
  readonly paths?: RegistryPaths;
  readonly credentialsFile: string;
  readonly env: NodeJS.ProcessEnv;
  /** Inyectable para que las pruebas no salgan a la red. */
  readonly fetchImpl?: typeof fetch;
  /**
   * Evaluador semántico inyectable, para probar la pantalla de gates sin red.
   *
   * El nombre coincide con el del motor para que un mock se pueda pasar tal
   * cual: un parámetro con otro nombre que el motor ignora en silencio
   * convierte una prueba en una ilusión.
   */
  readonly jev?: NonNullable<Parameters<typeof runTicketGate>[3]>["jev"];
  readonly judge?: NonNullable<Parameters<typeof runTicketGate>[3]>["judge"];
  /** Módulos estáticos a servir, por ruta. */
  readonly statics?: Readonly<
    Record<string, { readonly body: string; readonly type: string }>
  >;
}

/** Construye el contexto por defecto. */
export function defaultContext(root: string): ServerContext {
  return {
    root,
    paths: choosePaths(root),
    credentialsFile: credentialsPath(),
    env: process.env,
  };
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
  const paths = context.paths ?? choosePaths(context.root);

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
    const filas = listTickets(paths);
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
    const detalle = readTicket(paths, partes[2] as string);
    if (detalle === null) {
      return { status: 404, body: { error: `No existe el ticket "${partes[2]}".` } };
    }
    return { status: 200, body: detalle };
  }

  // GET /api/tickets/:id/gates
  if (
    method === "GET" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "tickets" &&
    partes[3] === "gates"
  ) {
    const id = partes[2] as string;
    const tarjetas = listGateCards(paths, id);
    if (tarjetas === null) {
      return { status: 404, body: { error: `No existe el ticket "${id}".` } };
    }
    return {
      status: 200,
      body: { gates: tarjetas, decisions: listGateDecisions(paths, id) },
    };
  }

  // POST /api/tickets/:id/gates/:gateId/run
  if (
    method === "POST" &&
    partes.length === 6 &&
    partes[0] === "api" &&
    partes[1] === "tickets" &&
    partes[3] === "gates" &&
    partes[5] === "run"
  ) {
    const id = partes[2] as string;
    const gateId = partes[4] as string;
    const datos = body as { evaluator?: unknown };
    const evaluador = datos.evaluator;
    if (
      evaluador !== undefined &&
      evaluador !== "auto" &&
      evaluador !== "command" &&
      evaluador !== "jev" &&
      evaluador !== "llm-judge"
    ) {
      return { status: 400, body: { error: `Evaluador desconocido: ${String(evaluador)}.` } };
    }

    const resultado: GateRunOutcome = await runTicketGate(
      paths,
      id,
      gateId,
      {
        ...(evaluador === undefined || evaluador === "auto"
          ? {}
          : { evaluator: evaluador }),
        ...(context.jev === undefined ? {} : { jev: context.jev }),
        ...(context.judge === undefined ? {} : { judge: context.judge }),
      },
    );

    // Un bloqueo por checks mecánicos es un resultado, no un error del servidor:
    // se devuelve 200 con el motivo para que la pantalla lo explique.
    return { status: 200, body: resultado };
  }

  // POST /api/tickets/:id/gates/:receiptId/decision
  if (
    method === "POST" &&
    partes.length === 6 &&
    partes[0] === "api" &&
    partes[1] === "tickets" &&
    partes[3] === "gates" &&
    partes[5] === "decision"
  ) {
    const id = partes[2] as string;
    const receiptId = partes[4] as string;
    const datos = body as {
      decision?: unknown;
      actor?: unknown;
      reason?: unknown;
      channel?: unknown;
    };

    if (datos.decision !== "approve" && datos.decision !== "reject") {
      return {
        status: 400,
        body: { error: "La decisión debe ser `approve` o `reject`." },
      };
    }
    if (typeof datos.actor !== "string" || datos.actor.trim() === "") {
      return {
        status: 400,
        body: { error: "Falta `actor`: una decisión humana necesita responsable." },
      };
    }

    const resultado = recordHumanDecision(paths, id, receiptId, {
      decision: datos.decision,
      actor: datos.actor,
      reason: typeof datos.reason === "string" ? datos.reason : "",
      ...(typeof datos.channel === "string" ? { channel: datos.channel } : {}),
    });

    return resultado.ok
      ? { status: 200, body: resultado }
      : { status: 409, body: resultado };
  }

  // GET /api/config
  if (method === "GET" && path === "/api/config") {
    const estado = checkConfig(context.root, readConfigText(context.root));
    return {
      status: 200,
      body: { config: estado, impact: projectionImpact(context.root, estado.text) },
    };
  }

  // POST /api/config/check  — analiza y muestra el efecto, sin escribir
  if (method === "POST" && path === "/api/config/check") {
    const datos = body as { text?: unknown };
    if (typeof datos.text !== "string") {
      return { status: 400, body: { error: "Falta el campo `text`." } };
    }
    const estado: ConfigState = checkConfig(context.root, datos.text);
    return {
      status: 200,
      body: {
        config: estado,
        impact: estado.ok ? projectionImpact(context.root, datos.text) : null,
      },
    };
  }

  // PUT /api/config  — guarda solo si el texto parsea
  if (method === "PUT" && path === "/api/config") {
    const datos = body as { text?: unknown };
    if (typeof datos.text !== "string") {
      return { status: 400, body: { error: "Falta el campo `text`." } };
    }
    const resultado = writeConfig(context.root, datos.text);
    if (!resultado.written) {
      // No es un error del servidor: el archivo no se tocó y el motivo es del
      // texto. Se devuelve 200 con `written: false` para que la pantalla lo
      // explique donde el usuario está mirando.
      return {
        status: 200,
        body: { config: resultado, impact: null, path: configPath(context.root) },
      };
    }
    return {
      status: 200,
      body: {
        config: checkConfig(context.root, readConfigText(context.root)),
        impact: projectionImpact(context.root, resultado.text),
        path: configPath(context.root),
      },
    };
  }

  // GET /api/routing  — roles, preset activo y catálogo de modelos
  if (method === "GET" && path === "/api/routing") {
    // `?refresh=1` fuerza volver a consultar el catálogo: la caché es de una
    // hora, y un modelo recién publicado no debería exigir reiniciar la app.
    if (query.get("refresh") === "1") resetCatalogCache();
    return {
      status: 200,
      body: {
        routing: readRouting(context.root),
        adopted: hasRouting(context.root),
        catalog: await fetchCatalog(context.fetchImpl ?? fetch),
      },
    };
  }

  // POST /api/routing/check  — analiza un texto y muestra la resolución
  if (method === "POST" && path === "/api/routing/check") {
    const datos = body as { text?: unknown };
    if (typeof datos.text !== "string") {
      return { status: 400, body: { error: "Falta el campo `text`." } };
    }
    return { status: 200, body: { routing: checkRouting(context.root, datos.text) } };
  }

  // PUT /api/routing  — guarda solo si el texto parsea
  if (method === "PUT" && path === "/api/routing") {
    const datos = body as {
      preset?: unknown;
      roles?: unknown;
      text?: unknown;
    };

    // Dos formas de guardar: el formulario manda `preset` y `roles`, y el
    // editor de texto manda `text`. El formulario se convierte a texto **con la
    // misma función que usa el CLI para escribir el archivo**, así que las dos
    // vías producen exactamente el mismo formato.
    let texto: string;
    if (typeof datos.text === "string") {
      texto = datos.text;
    } else if (typeof datos.preset === "string" && typeof datos.roles === "object" && datos.roles !== null) {
      try {
        texto = routingFromForm({
          preset: datos.preset,
          roles: datos.roles as Record<
            string,
            { provider?: string; model?: string; effort?: "auto" | "low" | "medium" | "high" }
          >,
        });
      } catch (caught) {
        return {
          status: 400,
          body: { error: caught instanceof Error ? caught.message : String(caught) },
        };
      }
    } else {
      return {
        status: 400,
        body: { error: "Se espera `text`, o bien `preset` y `roles`." },
      };
    }

    const resultado: RoutingState & { written: boolean } = writeRouting(
      context.root,
      texto,
    );
    return { status: 200, body: { routing: resultado, text: texto } };
  }

  // POST /api/routing/preview  — el texto que produciría el formulario
  if (method === "POST" && path === "/api/routing/preview") {
    const datos = body as { preset?: unknown; roles?: unknown };
    if (typeof datos.preset !== "string" || typeof datos.roles !== "object" || datos.roles === null) {
      return { status: 400, body: { error: "Se esperan `preset` y `roles`." } };
    }
    try {
      const texto = routingFromForm({
        preset: datos.preset,
        roles: datos.roles as Record<
          string,
          { provider?: string; model?: string; effort?: "auto" | "low" | "medium" | "high" }
        >,
      });
      return {
        status: 200,
        body: { text: texto, routing: checkRouting(context.root, texto) },
      };
    } catch (caught) {
      return {
        status: 400,
        body: { error: caught instanceof Error ? caught.message : String(caught) },
      };
    }
  }

  // POST /api/chat/config  — propone cambios; **nunca** escribe
  if (method === "POST" && path === "/api/chat/config") {
    const datos = body as { message?: unknown };
    if (typeof datos.message !== "string" || datos.message.trim() === "") {
      return { status: 400, body: { error: "Falta el mensaje." } };
    }

    // El modelo lo decide el routing, como todo lo demás: el rol `orchestrator`
    // por defecto, que hasta ahora estaba declarado sin consumidor.
    const rutas = readRouting(context.root);
    const orquestador = rutas.roles.find((ruta) => ruta.role === "orchestrator");

    try {
      const propuesta = await proposeConfigChange(context.root, {
        message: datos.message,
        ...(orquestador?.model === undefined || orquestador.model === ""
          ? {}
          : { model: orquestador.model }),
        ...(orquestador?.effort === undefined
          ? {}
          : { effort: orquestador.effort }),
        ...(context.fetchImpl === undefined
          ? {}
          : { fetchImpl: context.fetchImpl }),
      });
      return { status: 200, body: propuesta };
    } catch (caught) {
      // Un fallo del configurador no es un fallo del servidor: la pantalla lo
      // muestra donde el usuario escribió.
      return {
        status: 200,
        body: {
          ok: false,
          error:
            caught instanceof ConfigChatError
              ? caught.message
              : caught instanceof Error
                ? caught.message
                : String(caught),
          code: caught instanceof ConfigChatError ? caught.code : "ERROR",
          summary: "",
          changes: [],
          model: "",
          usage: null,
          latencyMs: 0,
        },
      };
    }
  }

  // POST /api/chat/config/apply  — escribe lo que el usuario aprobó
  if (method === "POST" && path === "/api/chat/config/apply") {
    const datos = body as { changes?: unknown };
    if (!Array.isArray(datos.changes)) {
      return { status: 400, body: { error: "Falta `changes`." } };
    }

    const cambios: ApplyRequest[] = [];
    for (const crudo of datos.changes) {
      const item = crudo as { file?: unknown; text?: unknown; confirm?: unknown };
      if (item.file !== "config" && item.file !== "routing") {
        return {
          status: 400,
          body: { error: "Cada cambio debe declarar `file`: config o routing." },
        };
      }
      if (typeof item.text !== "string") {
        return { status: 400, body: { error: "Cada cambio debe traer su `text`." } };
      }
      cambios.push({
        file: item.file,
        text: item.text,
        ...(typeof item.confirm === "string" ? { confirm: item.confirm } : {}),
      });
    }

    return { status: 200, body: applyChanges(context.root, cambios) };
  }

  // POST /api/config/sync  — regenera los archivos proyectados
  if (method === "POST" && path === "/api/config/sync") {
    const resultado = syncProjections(context.root);
    return {
      status: 200,
      body: {
        ...resultado,
        impact: projectionImpact(context.root, readConfigText(context.root)),
      },
    };
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
