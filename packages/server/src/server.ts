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
import { type FSWatcher, readFileSync, watch } from "node:fs";
import { extname, join } from "node:path";

import {
  type RegistryPaths,
  ESQUEMA_DESCOMPOSICION,
  SISTEMA_DESCOMPOSICION,
  advanceFeature,
  choosePaths,
  closedTickets,
  decomposeFeature,
  decompositionPrompt,
  defaultReportRange,
  filterReport,
  findTicket,
  renderReport,
  ticketsPath,
  transition,
} from "@valmen/engine";
import { type JsonObject, nextStates, parseTicket, toFailure } from "@valmen/core";
import { architectRoutingFor } from "@valmen/adapter";
import { apiKeyWithPrecedence, callChat } from "@valmen/credentials";

import {
  credentialsPath,
  listProviderModels,
  listProviders,
  probeProvider,
  testProviderModel,
  updateCredentials,
} from "./providers.js";
import {
  type GateRunOutcome,
  listGateCards,
  listGateDecisions,
  pendingCorrections,
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
  readConfig,
  readConfigText,
  readProviderCandidates,
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
  CAMPOS_ORDENABLES,
  type TicketFilters,
  filterTickets,
  listTickets,
  readTicket,
  summarize,
} from "./tickets.js";
import { listFeatureRows, readFeatureDetail, summarizeFeatures } from "./features.js";
import { guardarFotoEnTicket, leerLineaDeTiempo } from "./timeline.js";
import {
  approveGate,
  listGateRows,
  listProcessRows,
  listRunRows,
  summarizeProcesses,
} from "./processes.js";

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
    if (total > 64 * 1024) throw new Error("El cuerpo de la petición es demasiado grande.");
    chunks.push(buffer);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/**
 * Los estados a los que puede ir un ticket, sus puntos y su release.
 *
 * Devuelve `null` para el ticket entero si no se puede leer: un ticket ilegible
 * no tiene transiciones, y fingir que las tiene ofrecería botones que fallan.
 */
function transitionsOf(
  paths: RegistryPaths,
  id: string,
): {
  readonly ticket: readonly string[];
  readonly release: readonly string[];
  readonly points: readonly { readonly id: string; readonly to: readonly string[] }[];
} | null {
  const located = findTicket(paths, id);
  if (located === undefined) return null;
  try {
    const document = parseTicket(located.text);
    return {
      ticket: nextStates("ticket", document.fields.workflow_status),
      release: nextStates("release", document.fields.release_status),
      points: (document.blocks.Puntos ?? []).map((punto: JsonObject) => ({
        id: String(punto.id),
        to: nextStates("point", String(punto.status)),
      })),
    };
  } catch {
    return null;
  }
}

/** Un valor de la query, o `undefined` si no está o viene vacío. */
function valorDeQuery(query: URLSearchParams, nombre: string): string | undefined {
  const valor = query.get(nombre);
  return valor === null || valor === "" ? undefined : valor;
}

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
  if (
    method === "GET" &&
    partes.length === 2 &&
    partes[0] === "api" &&
    partes[1] === "tickets"
  ) {
    const params = query ?? new URLSearchParams();
    const filas = listTickets(paths);
    const filtros: TicketFilters = {
      ...(params.get("workflow") === null
        ? {}
        : { workflowStatus: params.get("workflow") as string }),
      ...(params.get("type") === null ? {} : { type: params.get("type") as string }),
      ...(params.get("module") === null ? {} : { module: params.get("module") as string }),
      ...(params.get("q") === null ? {} : { query: params.get("q") as string }),
      ...(params.get("open") === "1" ? { onlyOpen: true } : {}),
      ...(params.get("invalid") === "1" ? { onlyInvalid: true } : {}),
      ...(params.get("critical") === "1" ? { onlyCritical: true } : {}),
      ...(params.get("con-puntos") === "1" ? { onlyWithOpenPoints: true } : {}),
      ...(params.get("desde") === null ? {} : { desde: params.get("desde") as string }),
      ...(params.get("hasta") === null ? {} : { hasta: params.get("hasta") as string }),
      // Solo los tres campos que el motor conoce. Un nombre inventado se ignora en
      // vez de propagarse: el filtro caería a `updated` sin decirlo.
      ...(["updated", "created", "closedOn"].includes(params.get("fecha") ?? "")
        ? { dateField: params.get("fecha") as "updated" | "created" | "closedOn" }
        : {}),
      // Solo las columnas que el motor conoce: un nombre inventado se ignora en vez
      // de ordenar por algo que la lista no muestra.
      ...(CAMPOS_ORDENABLES.includes(
        params.get("orden") as (typeof CAMPOS_ORDENABLES)[number],
      )
        ? { sortBy: params.get("orden") as (typeof CAMPOS_ORDENABLES)[number] }
        : {}),
      ...(params.get("sentido") === "asc" || params.get("sentido") === "desc"
        ? { sortDir: params.get("sentido") as "asc" | "desc" }
        : {}),
      ...(params.get("limit") === null
        ? {}
        : { limit: Number.parseInt(params.get("limit") as string, 10) }),
    };
    return {
      status: 200,
      body: { summary: summarize(filas), tickets: filterTickets(filas, filtros) },
    };
  }

  // GET /api/providers/:id/models
  //
  // La lista de modelos de un proveedor, para el selector de dos niveles y para
  // los conjuntos —heredoc, args—. Se pide al proveedor y no se inventa: uno que
  // no la publique devuelve 501 y la pantalla ofrece escribir el identificador,
  // que es más honesto que un desplegable que falla al abrirse.
  if (
    method === "GET" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "providers" &&
    partes[3] === "models"
  ) {
    const id = partes[2] as string;
    // Lo declarado en `config.yaml` entra además de lo que el proveedor publique.
    // Es lo que hace usable un proveedor sin catálogo —codex— y lo que permite
    // usar un modelo que el catálogo no lista pero el endpoint acepta.
    const candidatos = readProviderCandidates(readConfig(context.root), id);
    const resultado = await listProviderModels(id, {
      filePath: context.credentialsFile,
      env: context.env,
      candidates: candidatos,
      ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
    });
    if (resultado === null) {
      return {
        status: 501,
        body: {
          error:
            `"${id}" no publica su lista de modelos y el proyecto no declara ` +
            "ninguno. Escríbelos en `.valmen/config.yaml`, bajo " +
            `\`providers.${id}.candidates\`, y aparecerán aquí para elegirlos.`,
          models: [],
          hint: "declara candidates en config.yaml",
        },
      };
    }
    if (!resultado.ok) {
      // 502 con lo declarado incluido: que el catálogo falle no vacía la lista
      // que el usuario escribió.
      return {
        status: 502,
        body: {
          error: resultado.error,
          models: resultado.models,
          ...(resultado.models.length === 0
            ? {}
            : { note: "La lista de abajo es la que declara el proyecto." }),
        },
      };
    }
    return {
      status: 200,
      body: {
        models: resultado.models,
        configured: resultado.configured,
        source: resultado.source,
      },
    };
  }

  // POST /api/providers/:id/models/test
  //
  // Prueba que un identificador de modelo responda con la credencial configurada.
  // Es lo que convierte el selector en algo en lo que se puede confiar: un
  // `gpt-5.6-terrra` con una erre de más pasa la configuración, se guarda, y
  // falla en mitad de un gate con un error del proveedor que no dice qué se
  // escribió mal.
  if (
    method === "POST" &&
    partes.length === 5 &&
    partes[0] === "api" &&
    partes[1] === "providers" &&
    partes[3] === "models" &&
    partes[4] === "test"
  ) {
    const id = partes[2] as string;
    const modelo = (body as { model?: unknown }).model;
    if (typeof modelo !== "string" || modelo.trim() === "") {
      return { status: 400, body: { error: "Falta `model`." } };
    }
    const resultado = await testProviderModel(id, modelo, {
      filePath: context.credentialsFile,
      env: context.env,
      ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
    });
    // Un modelo rechazado no es un error del servidor: la pantalla lo muestra
    // donde el usuario escribió, igual que hace con una clave que no conecta.
    return { status: 200, body: resultado };
  }

  // GET /api/processes
  if (
    method === "GET" &&
    partes.length === 2 &&
    partes[0] === "api" &&
    partes[1] === "processes"
  ) {
    const procesos = listProcessRows(context.root);
    const corridas = listRunRows(context.root);
    const gates = listGateRows(context.root);
    return {
      status: 200,
      body: {
        summary: summarizeProcesses(procesos, corridas, gates),
        processes: procesos,
        runs: corridas,
        gates,
      },
    };
  }

  // POST /api/processes/gates/:gate/approve
  //
  // Aprueba un gate de proceso. No retoma nada: decidir y continuar son dos actos
  // distintos, y juntarlos haría que aprobar tuviera efectos que quien aprueba no
  // ve. Retomar es `valmen process resume`.
  if (
    method === "POST" &&
    partes.length === 5 &&
    partes[0] === "api" &&
    partes[1] === "processes" &&
    partes[2] === "gates" &&
    partes[4] === "approve"
  ) {
    const gate = partes[3] as string;
    const datos = body as { actor?: unknown; reason?: unknown };
    const actor = typeof datos.actor === "string" ? datos.actor.trim() : "";
    if (actor === "") {
      return {
        status: 400,
        body: { error: "Aprobar un gate necesita un responsable: falta `actor`." },
      };
    }
    try {
      const aprobacion = approveGate(
        context.root,
        gate,
        actor,
        typeof datos.reason === "string" ? datos.reason : "",
      );
      return {
        status: 200,
        body: {
          ok: true,
          gate,
          actor: aprobacion.actor,
          at: aprobacion.at,
          details: `Gate "${gate}" aprobado por ${aprobacion.actor}.`,
        },
      };
    } catch (caught) {
      const failure = toFailure(caught);
      return { status: 400, body: { error: failure.message } };
    }
  }

  // GET /api/features
  if (
    method === "GET" &&
    partes.length === 2 &&
    partes[0] === "api" &&
    partes[1] === "features"
  ) {
    const filas = listFeatureRows(context.root);
    return {
      status: 200,
      body: { summary: summarizeFeatures(filas), features: filas },
    };
  }

  // POST /api/features/:slug/transition
  //
  // Mueve el estado de una feature. Igual que con un ticket, los destinos los
  // calcula el servidor a partir de la tabla del contrato: si la interfaz los
  // dedujera por su cuenta, un cambio en la máquina de estados dejaría a la app
  // ofreciendo movimientos ilegales.
  if (
    method === "POST" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "features" &&
    partes[3] === "transition"
  ) {
    const slug = partes[2] as string;
    const to = (body as { to?: unknown }).to;
    if (typeof to !== "string" || to === "") {
      return { status: 400, body: { error: "Falta `to`." } };
    }
    try {
      const fila = advanceFeature({ root: context.root, slug, to });
      return {
        status: 200,
        body: {
          ok: true,
          state: fila.state,
          via: fila.via ?? [],
          details:
            `La feature ${slug} pasó a ${fila.state}` +
            (fila.via === undefined || fila.via.length === 0
              ? "."
              : `, pasando por ${fila.via.join(" → ")}.`),
        },
      };
    } catch (caught) {
      const failure = toFailure(caught);
      return { status: 400, body: { error: failure.message } };
    }
  }

  // POST /api/features/:slug/decompose
  //
  // Descompone una feature desde la pantalla, con el modelo del rol `architect`.
  // Es el paso que más valor tiene de la vista de features y el único que obligaba
  // a abrir la terminal para completar el ciclo.
  if (
    method === "POST" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "features" &&
    partes[3] === "decompose"
  ) {
    const slug = partes[2] as string;
    const datos = body as { dryRun?: unknown; model?: unknown; provider?: unknown };
    const arquitecto = architectRoutingFor(context.root);
    const modelo =
      typeof datos.model === "string" && datos.model !== ""
        ? datos.model
        : arquitecto.model;
    if (modelo === "") {
      return {
        status: 400,
        body: {
          error:
            "No hay modelo para el rol architect. Configúralo en Modelos o en " +
            ".valmen/routing.yaml.",
        },
      };
    }
    const escribir = datos.dryRun !== true;

    // La credencial se resuelve con el archivo de **este** servidor. Sin esto,
    // `callChat` leía el del `$HOME` y la descomposición usaba una clave que el
    // servidor no tenía configurada.
    const proveedor =
      typeof datos.provider === "string" && datos.provider !== ""
        ? datos.provider
        : arquitecto.provider;
    const apiKey = apiKeyWithPrecedence(proveedor, context.credentialsFile, context.env);
    if (apiKey === null) {
      return {
        status: 400,
        body: {
          error:
            `No hay credencial para ${proveedor}. Configúrala en Proveedores antes de ` +
            "descomponer.",
        },
      };
    }

    try {
      const resultado = await decomposeFeature({
        root: context.root,
        slug,
        write: escribir,
        callModel: async (entrada) => {
          const respuesta = await callChat({
            apiKey,
            // El `fetchImpl` del contexto, sin el cual las pruebas de esta ruta
            // salen a la red de verdad y tardan trece segundos en fallar.
            ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
            provider:
              typeof datos.provider === "string" && datos.provider !== ""
                ? datos.provider
                : arquitecto.provider,
            model: modelo,
            // El presupuesto de salida es generoso porque un modelo que razona
            // gasta tokens pensando **antes** de escribir.
            maxTokens: 16_000,
            effort: arquitecto.effort,
            messages: [
              { role: "system", content: SISTEMA_DESCOMPOSICION },
              { role: "user", content: decompositionPrompt(entrada) },
            ],
            structured: {
              name: "feature_decomposition",
              description: "El grafo de tickets de la feature.",
              schema: ESQUEMA_DESCOMPOSICION,
            },
          });
          return {
            proposal: JSON.parse(respuesta.content) as unknown,
            decomposer: {
              provider:
                typeof datos.provider === "string" && datos.provider !== ""
                  ? datos.provider
                  : arquitecto.provider,
              model: respuesta.model,
              ...(respuesta.usage.costUsd === null
                ? {}
                : { costUsd: respuesta.usage.costUsd }),
            },
          };
        },
      });

      if (escribir) {
        advanceFeature({ root: context.root, slug, to: "decomposed" });
      }
      return { status: 200, body: { ok: true, ...resultado } };
    } catch (caught) {
      const failure = toFailure(caught);
      // Una descomposición que no pasa la compuerta no es un fallo del servidor:
      // la pantalla muestra el motivo donde se pidió.
      return { status: 200, body: { ok: false, error: failure.message } };
    }
  }

  // GET /api/features/:slug
  if (
    method === "GET" &&
    partes.length === 3 &&
    partes[0] === "api" &&
    partes[1] === "features"
  ) {
    const detalle = readFeatureDetail(context.root, partes[2] as string);
    if (detalle === null) {
      return {
        status: 404,
        body: { error: `No existe la feature "${partes[2]}".` },
      };
    }
    return { status: 200, body: detalle };
  }

  // GET /api/timeline?ticket=&directory=
  //
  // Quién intervino, con qué modelo y a qué coste. El dato se **lee** de la
  // contabilidad que el cliente de agentes ya escribe en su propia base —opencode
  // guarda coste por mensaje, tokens, proveedor, modelo y agente—, y no se le
  // pregunta al modelo: un agente que reporta su propio gasto puede reportar de
  // menos y no habría forma de notarlo.
  //
  // `available: false` es distinto de una línea de tiempo vacía: significa que no
  // hay base que leer, y la pantalla tiene que poder decir «no hay datos» en vez de
  // mostrar un cero que se lee como «no costó nada».
  if (method === "GET" && path === "/api/timeline") {
    const ticket = valorDeQuery(query, "ticket");
    const directory = valorDeQuery(query, "directory") ?? paths.root;
    const linea = leerLineaDeTiempo(directory, {
      ...(ticket === undefined ? {} : { ticketId: ticket }),
    });

    return {
      status: 200,
      body:
        linea === null
          ? {
              available: false,
              directory,
              reason:
                "No se encontró la contabilidad de opencode. Sin ella no hay forma " +
                "de saber qué modelo intervino ni cuánto costó.",
            }
          : { available: true, directory, ...linea },
    };
  }

  // GET /api/report?desde=&hasta=&type=&q=
  //
  // El reporte en Markdown, el mismo que produce `valmen report`. Es lo único
  // del visor anterior que la pantalla no cubría, y tiene que salir de aquí y no
  // de la interfaz: si el botón y el comando compusieran el texto por su cuenta,
  // el reporte que se pega en un correo podría no ser el que dice el CLI.
  if (method === "GET" && path === "/api/report") {
    const porDefecto = defaultReportRange();
    const desde = valorDeQuery(query, "desde") ?? porDefecto.desde;
    const hasta = valorDeQuery(query, "hasta") ?? porDefecto.hasta;
    const type = valorDeQuery(query, "type");
    const q = valorDeQuery(query, "q");

    const entradas = filterReport(closedTickets(paths), {
      desde,
      hasta,
      ...(type === undefined ? {} : { type }),
      ...(q === undefined ? {} : { query: q }),
    });

    return {
      status: 200,
      body: {
        markdown: renderReport(entradas, desde, hasta),
        count: entradas.length,
        range: { from: desde, to: hasta },
        // El nombre del archivo lo decide el servidor para que el botón y un
        // `curl` produzcan el mismo artefacto con el mismo nombre.
        filename: `tickets-cerrados-${desde}-a-${hasta}.md`,
      },
    };
  }

  // GET /api/tickets/:id
  if (
    method === "GET" &&
    partes.length === 3 &&
    partes[0] === "api" &&
    partes[1] === "tickets"
  ) {
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
      body: {
        gates: tarjetas,
        decisions: listGateDecisions(paths, id),
        corrections: pendingCorrections(paths, id),
        // Los estados a los que el ticket puede ir **hoy**, según la tabla.
        // Los calcula el servidor porque la tabla es del contrato: si la
        // interfaz los dedujera por su cuenta, un cambio en la máquina de
        // estados dejaría a la app ofreciendo movimientos ilegales.
        transitions: transitionsOf(paths, id),
      },
    };
  }

  // POST /api/tickets/:id/consumo
  //
  // Guarda en el ticket una foto del consumo de sus sesiones. Es la mitad durable
  // de la línea de tiempo: la pantalla la muestra en vivo, pero un ticket tiene
  // que poder auditarse meses después, y para entonces la contabilidad del cliente
  // puede no existir.
  //
  // Va en el bloque `## Consumo de IA`, que es append-only: guardar dos veces deja
  // dos registros y no reescribe el primero.
  if (
    method === "POST" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "tickets" &&
    partes[3] === "consumo"
  ) {
    const id = partes[2] as string;
    const foto = guardarFotoEnTicket(paths, id);

    if (foto === null) {
      return {
        status: 409,
        body: {
          error:
            "No hay consumo que registrar para este ticket: no se encontró la " +
            "contabilidad del cliente, o ninguna de sus sesiones lo trabajó.",
        },
      };
    }

    return {
      status: 200,
      body: {
        entradas: foto.entradas,
        detalle: foto.detalle,
        // Se recarga la vista desde el cliente: el ticket cambió y el bloque de
        // consumo tiene que reflejarlo sin recargar la página a mano.
        ticket: readTicket(paths, id),
      },
    };
  }

  // POST /api/tickets/:id/transition
  if (
    method === "POST" &&
    partes.length === 4 &&
    partes[0] === "api" &&
    partes[1] === "tickets" &&
    partes[3] === "transition"
  ) {
    const id = partes[2] as string;
    const datos = body as {
      entity?: unknown;
      to?: unknown;
      pointId?: unknown;
      reason?: unknown;
      version?: unknown;
    };

    if (
      datos.entity !== "ticket" &&
      datos.entity !== "point" &&
      datos.entity !== "release"
    ) {
      return {
        status: 400,
        body: { error: "`entity` debe ser ticket, point o release." },
      };
    }
    if (typeof datos.to !== "string" || datos.to === "") {
      return { status: 400, body: { error: "Falta `to`." } };
    }

    try {
      const resultado = transition({
        paths,
        ticketId: id,
        entity: datos.entity,
        to: datos.to,
        ...(typeof datos.pointId === "string" ? { pointId: datos.pointId } : {}),
        ...(typeof datos.reason === "string" ? { reason: datos.reason } : {}),
        ...(typeof datos.version === "string" ? { version: datos.version } : {}),
      });
      return { status: 200, body: { ok: true, details: resultado.details } };
    } catch (caught) {
      // El motor explica por qué no se puede —transición ilegal, precondición
      // incumplida— y ese mensaje es el que hay que mostrar.
      const fallo = toFailure(caught);
      return {
        status: 409,
        body: { ok: false, error: fallo.message, exitCode: fallo.exitCode },
      };
    }
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
      return {
        status: 400,
        body: { error: `Evaluador desconocido: ${String(evaluador)}.` },
      };
    }

    const resultado: GateRunOutcome = await runTicketGate(paths, id, gateId, {
      ...(evaluador === undefined || evaluador === "auto" ? {} : { evaluator: evaluador }),
      ...(context.jev === undefined ? {} : { jev: context.jev }),
      ...(context.judge === undefined ? {} : { judge: context.judge }),
      // El archivo del servidor, no el del `$HOME`: es el que el usuario
      // configuró en la pantalla, y la evaluación tiene que usar ese.
      credentialsFile: context.credentialsFile,
    });

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
    } else if (
      typeof datos.preset === "string" &&
      typeof datos.roles === "object" &&
      datos.roles !== null
    ) {
      try {
        texto = routingFromForm({
          preset: datos.preset,
          roles: datos.roles as Record<
            string,
            {
              provider?: string;
              model?: string;
              effort?: "auto" | "low" | "medium" | "high";
            }
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
    if (
      typeof datos.preset !== "string" ||
      typeof datos.roles !== "object" ||
      datos.roles === null
    ) {
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
        // El archivo del contexto, no el del `$HOME`: el servidor sabe cuál usa y
        // la clave tiene que salir de ahí.
        credentialsFile: context.credentialsFile,
        ...(orquestador?.model === undefined || orquestador.model === ""
          ? {}
          : { model: orquestador.model }),
        ...(orquestador?.effort === undefined ? {} : { effort: orquestador.effort }),
        ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
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
      ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
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
        // La clave nueva se prueba antes de escribirla, sin pasar por el archivo,
        // y se pasa **como valor**: fingir una variable de entorno obligaba a
        // mantener un mapa de nombres paralelo al catálogo, y ese mapa se
        // desincronizó en cuanto opencode se separó en Go y Zen.
        apiKey: datos.apiKey,
        ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
      });

      if (!prueba.ok) {
        return {
          status: 422,
          body: {
            error:
              "La clave no superó la prueba de conexión; no se guardó nada. " +
              // El motivo va en el mensaje: sin él, «no superó la prueba» no
              // distingue una clave mala de un modelo que el proveedor no
              // reconoce, de una cabecera que falta o de un endpoint mal
              // declarado, y las cuatro se arreglan de forma distinta.
              `Respondió: ${prueba.detail}`,
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

/**
 * Clientes suscritos a los cambios del registro.
 *
 * El estado de Mission Control vive en disco, no en memoria del servidor: el CLI,
 * un agente o un editor pueden cambiarlo en cualquier momento. Empujar el aviso
 * es lo que hace que la pantalla deje de ser una foto.
 */
const suscriptores = new Set<ServerResponse>();

/** Avisa a todos los suscriptores de que algo cambió. */
function broadcast(): void {
  for (const cliente of suscriptores) {
    try {
      cliente.write('data: {"kind":"changed"}\n\n');
    } catch {
      suscriptores.delete(cliente);
    }
  }
}

/**
 * Vigila lo que puede cambiar el estado que la pantalla muestra.
 *
 * Se vigilan los dos sitios que importan —el registro de tickets y `.valmen/`,
 * donde viven los recibos, la configuración y el routing— y **no** la raíz del
 * proyecto: un `fs.watch` recursivo sobre el repositorio entero incluiría
 * `node_modules`, y cada instalación dispararía un refresco.
 *
 * Los avisos se agrupan: una mutación del harness escribe el ticket, el índice y
 * el recibo en milisegundos, y tres eventos seguidos harían que la pantalla se
 * redibujara tres veces.
 */
function vigilar(context: ServerContext, paths: RegistryPaths): () => void {
  const objetivos = [ticketsPath(paths), join(context.root, ".valmen")];
  const vigías: FSWatcher[] = [];
  let pendiente: NodeJS.Timeout | null = null;

  for (const objetivo of objetivos) {
    try {
      vigías.push(
        watch(objetivo, { recursive: true }, () => {
          if (pendiente !== null) clearTimeout(pendiente);
          pendiente = setTimeout(() => {
            pendiente = null;
            broadcast();
          }, 250);
        }),
      );
    } catch {
      // Un directorio que todavía no existe no es un error: el registro se crea
      // en el primer ticket y `.valmen/` al adoptar. La pantalla simplemente no
      // se actualizará sola hasta que existan, y eso se ve al recargar.
    }
  }

  return () => {
    if (pendiente !== null) clearTimeout(pendiente);
    for (const vigía of vigías) vigía.close();
  };
}

/** Crea el servidor HTTP. */
export function createMissionControl(context: ServerContext): Server {
  const paths = context.paths ?? choosePaths(context.root);
  const cerrarVigías = vigilar(context, paths);

  const server = createServer((request, response) => {
    void handleRequest(request, response, context);
  });

  // Un proceso que vigila el disco no termina solo: hay que soltar los vigías
  // cuando el servidor se cierra, o `valmen serve` no se apagaría nunca.
  server.on("close", cerrarVigías);
  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ServerContext,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";

  // El flujo de eventos no es una respuesta con cuerpo y fin: se queda abierto.
  // Por eso se atiende antes del despacho normal, que siempre responde y cierra.
  if (url.pathname === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    // Sin latido, un proxy o el propio navegador pueden cerrar la conexión por
    // inactividad, y la pantalla dejaría de actualizarse en silencio.
    response.write("retry: 3000\n\n");
    suscriptores.add(response);

    const latido = setInterval(() => {
      try {
        response.write(": latido\n\n");
      } catch {
        suscriptores.delete(response);
      }
    }, 25_000);

    request.on("close", () => {
      clearInterval(latido);
      suscriptores.delete(response);
    });
    return;
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      let body: unknown = {};
      if (method === "PUT" || method === "POST") {
        body = await readJson(request);
      }
      const resultado = await handleApi(
        method,
        url.pathname,
        body,
        context,
        url.searchParams,
      );
      send(response, resultado.status, resultado.body, "application/json; charset=utf-8");
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
    raw || typeof body === "string" ? String(body) : JSON.stringify(body, null, 2);
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

export { credentialsPath, listProviders, probeProvider, updateCredentials, MIME };
