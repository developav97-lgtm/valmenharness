/**
 * Qué hace cada subagente de la corrida orquestada, leído de sus transcripts.
 *
 * La sesión de Claude Code que abre el PO es el orquestador; cada subagente deja
 * `<sesión>/subagents/agent-<id>.jsonl` y `agent-<id>.meta.json`. Este lector es
 * **solo de lectura** y devuelve una lista blanca de metadatos por agente: nunca
 * copia texto de prompts, entradas ni resultados de herramientas, solo el
 * **nombre** de la última herramienta.
 *
 * La **sesión principal** (la del orquestador) viaja como la primera fila, con
 * `principal: true`; su `ticket`, `descripcion` y fases son null porque no se
 * consulta el registro para ella.
 *
 * El estado se deduce con un reloj inyectable (`ahora`) para ser determinista:
 * `termino` si el último mensaje del asistente cerró con `end_turn`; `esperando`
 * si pasaron más de 60 s sin eventos o hay una herramienta sin resultado (un
 * permiso pedido); `trabajando` en otro caso.
 *
 * La **fase confirmada** sale del registro de actividad de ejecución
 * (`registrar_actividad_ejecucion`): el último estado de actividad registrado para
 * el ticket. La **inferida** solo aparece cuando el registro no trae una, y se
 * deduce del nombre de la última herramienta.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
  createExecutionContract,
  readExecutionActivity,
  readTicket,
  type AuthorizedProject,
  type RegistryPaths,
} from "@valmen/engine";

import {
  archivosDeSubagentes,
  carpetasDelProyecto,
  claudeProjectsPath,
} from "./claude.js";
import { ticketsDeTexto } from "./hermes.js";

/** Pasados estos milisegundos sin eventos, un agente que no terminó está esperando. */
export const ESPERA_MAXIMA_MS = 60_000;
/** Cuánto tiempo después de contestada se sigue declarando la pregunta (propia: no mueve ESPERA_MAXIMA_MS). */
export const VENTANA_RESPUESTA_MS = 60_000;
/** Solo se consideran sesiones con subagentes modificadas dentro de esta ventana. */
const VENTANA_MS = 24 * 60 * 60 * 1000;

export type EstadoDeAgente = "trabajando" | "esperando" | "termino";

/**
 * La pregunta al usuario (`AskUserQuestion`) de un agente: solo horas ISO.
 * Nunca lleva el texto de la pregunta ni el de la respuesta.
 */
export interface PreguntaPendiente {
  readonly desde: string;
  readonly respondidaEn: string | null;
}

/** La fila pública de un agente: lista blanca, sin contenido del transcript. */
export interface AgenteDeCorrida {
  readonly agente: string;
  /** true solo en la fila de la sesión principal (la del orquestador). */
  readonly principal: boolean;
  readonly ticket: string | null;
  readonly descripcion: string | null;
  readonly modelo: string | null;
  readonly esfuerzo: string | null;
  readonly rama: string | null;
  readonly carpeta: string | null;
  readonly ultimaHerramienta: string | null;
  readonly ultimaHerramientaEn: string | null;
  readonly estado: EstadoDeAgente;
  readonly ticketEstado: string | null;
  readonly faseConfirmada: string | null;
  readonly faseInferida: string | null;
  /** La pregunta abierta, o contestada hace menos de VENTANA_RESPUESTA_MS; null si no hay. */
  readonly pregunta: PreguntaPendiente | null;
}

/** Un identificador de sesión simple: sin separadores de ruta ni puntos. */
const SESION_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function esSesionValida(sesion: string): boolean {
  return SESION_RE.test(sesion);
}

/** Lo que se extrae del transcript; no depende del reloj y por eso se cachea. */
interface Lectura {
  ticket: string | null;
  modelo: string | null;
  esfuerzo: string | null;
  rama: string | null;
  carpeta: string | null;
  ultimaHerramienta: string | null;
  ultimaHerramientaEn: number | null;
  ultimoEventoEn: number | null;
  cerro: boolean;
  pendiente: boolean;
  /** Hora absoluta (ms) de la pregunta elegida, o null. */
  preguntaDesde: number | null;
  /** Hora absoluta (ms) en que se contestó, o null si sigue abierta. */
  preguntaRespondidaEn: number | null;
}

const CACHE = new Map<string, Lectura>();

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

/** El texto de un mensaje de usuario, sin resultados de herramientas. */
function textoDeUsuario(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (!Array.isArray(contenido)) return "";
  const partes: string[] = [];
  for (const bloque of contenido) {
    const dato = objeto(bloque);
    if (dato !== null && dato["type"] === "text" && typeof dato["text"] === "string") {
      partes.push(dato["text"]);
    }
  }
  return partes.join("\n");
}

/** Recorre el transcript tolerando líneas cortadas. */
function leerTranscript(contenido: string): Lectura {
  const lectura: Lectura = {
    ticket: null,
    modelo: null,
    esfuerzo: null,
    rama: null,
    carpeta: null,
    ultimaHerramienta: null,
    ultimaHerramientaEn: null,
    ultimoEventoEn: null,
    cerro: false,
    pendiente: false,
    preguntaDesde: null,
    preguntaRespondidaEn: null,
  };
  const abiertas = new Set<string>();
  /** Solo las `AskUserQuestion`: id del tool_use → hora del evento. Nunca su entrada. */
  const preguntas = new Map<string, number>();
  const respondidas = new Map<string, number>();
  let primerMensajeVisto = false;

  for (const linea of contenido.split("\n")) {
    if (linea.trim() === "") continue;
    let evento: Record<string, unknown>;
    try {
      evento = JSON.parse(linea) as Record<string, unknown>;
    } catch {
      continue; // línea cortada: la sesión se está escribiendo
    }

    const marca = typeof evento["timestamp"] === "string" ? Date.parse(evento["timestamp"]) : NaN;
    const tieneMarca = Number.isFinite(marca);
    if (tieneMarca && (lectura.ultimoEventoEn === null || marca > lectura.ultimoEventoEn)) {
      lectura.ultimoEventoEn = marca;
    }
    lectura.carpeta ??= texto(evento["cwd"]);
    lectura.rama ??= texto(evento["gitBranch"]);

    const tipo = evento["type"];
    const mensaje = objeto(evento["message"]);

    if (tipo === "user" && mensaje !== null) {
      const cuerpo = mensaje["content"];
      if (Array.isArray(cuerpo)) {
        for (const bloque of cuerpo) {
          const dato = objeto(bloque);
          if (dato !== null && dato["type"] === "tool_result" && typeof dato["tool_use_id"] === "string") {
            abiertas.delete(dato["tool_use_id"]);
            // Se mira solo el id y la hora: ni `content` ni `is_error`.
            if (tieneMarca && preguntas.has(dato["tool_use_id"])) respondidas.set(dato["tool_use_id"], marca);
          }
        }
      }
      if (!primerMensajeVisto && evento["isMeta"] !== true) {
        const t = textoDeUsuario(cuerpo);
        if (t !== "") {
          primerMensajeVisto = true;
          const primero = ticketsDeTexto(t).keys().next();
          lectura.ticket = primero.done === true ? null : primero.value;
        }
      }
      // Un mensaje del usuario después de un end_turn reabre al agente.
      lectura.cerro = false;
      continue;
    }

    if (tipo === "assistant" && mensaje !== null) {
      const modelo = texto(mensaje["model"]);
      if (modelo !== null && modelo !== "<synthetic>") lectura.modelo = modelo;
      lectura.esfuerzo = texto(evento["effort"]) ?? texto(evento["perTurnEffort"]) ?? lectura.esfuerzo;
      if (Array.isArray(mensaje["content"])) {
        for (const bloque of mensaje["content"]) {
          const dato = objeto(bloque);
          if (dato !== null && dato["type"] === "tool_use") {
            const nombre = texto(dato["name"]);
            if (nombre !== null) {
              lectura.ultimaHerramienta = nombre;
              lectura.ultimaHerramientaEn = tieneMarca ? marca : lectura.ultimaHerramientaEn;
            }
            if (typeof dato["id"] === "string") {
              abiertas.add(dato["id"]);
              if (nombre === "AskUserQuestion" && tieneMarca) preguntas.set(dato["id"], marca);
            }
          }
        }
      }
      lectura.cerro = mensaje["stop_reason"] === "end_turn";
    }
  }

  lectura.pendiente = abiertas.size > 0;

  // Manda la abierta más reciente; sin abiertas, la última respondida.
  let elegida: string | null = null;
  for (const [id, desde] of preguntas) {
    if (!abiertas.has(id)) continue;
    if (elegida === null || desde >= (preguntas.get(elegida) ?? 0)) elegida = id;
  }
  if (elegida !== null) {
    lectura.preguntaDesde = preguntas.get(elegida) ?? null;
  } else {
    for (const [id, desde] of preguntas) {
      if (!respondidas.has(id)) continue;
      if (elegida === null || desde >= (preguntas.get(elegida) ?? 0)) elegida = id;
    }
    if (elegida !== null) {
      lectura.preguntaDesde = preguntas.get(elegida) ?? null;
      lectura.preguntaRespondidaEn = respondidas.get(elegida) ?? null;
    }
  }
  return lectura;
}

function leerConCache(ruta: string): Lectura | null {
  let firma: string;
  try {
    const info = statSync(ruta);
    firma = `${info.mtimeMs}:${info.size}`;
  } catch {
    return null;
  }
  const clave = `${ruta}|${firma}`;
  const guardada = CACHE.get(clave);
  if (guardada !== undefined) return guardada;
  let contenido: string;
  try {
    contenido = readFileSync(ruta, "utf8");
  } catch {
    return null;
  }
  const lectura = leerTranscript(contenido);
  // Una firma nueva del mismo archivo reemplaza a la anterior.
  for (const existente of CACHE.keys()) {
    if (existente.startsWith(`${ruta}|`)) CACHE.delete(existente);
  }
  CACHE.set(clave, lectura);
  return lectura;
}

/** La descripción del `meta.json` del subagente, o null. */
function descripcionDe(rutaJsonl: string): string | null {
  try {
    const meta = objeto(JSON.parse(readFileSync(rutaJsonl.replace(/\.jsonl$/, ".meta.json"), "utf8")));
    return meta === null ? null : texto(meta["description"]);
  } catch {
    return null;
  }
}

/** La ruta de la sesión orquestadora: la forzada, o la más reciente con subagentes. */
function sesionOrquestadora(
  root: string,
  home: string,
  ahora: number,
  sesion: string | undefined,
): string | null {
  const base = claudeProjectsPath(home);
  if (!existsSync(base)) return null;
  let mejor: { ruta: string; mtime: number } | null = null;

  for (const carpeta of carpetasDelProyecto(base, root)) {
    if (sesion !== undefined) {
      const ruta = join(carpeta, `${sesion}.jsonl`);
      if (archivosDeSubagentes(ruta).length > 0) return ruta;
      continue;
    }
    let nombres: string[];
    try {
      nombres = readdirSync(carpeta);
    } catch {
      continue;
    }
    for (const nombre of nombres) {
      if (!nombre.endsWith(".jsonl")) continue;
      const ruta = join(carpeta, nombre);
      if (archivosDeSubagentes(ruta).length === 0) continue;
      let mtime: number;
      try {
        mtime = statSync(ruta).mtimeMs;
      } catch {
        continue;
      }
      if (ahora - mtime > VENTANA_MS) continue;
      if (mejor === null || mtime > mejor.mtime) mejor = { ruta, mtime };
    }
  }
  return mejor === null ? null : mejor.ruta;
}

/** La fase que sugiere el nombre de la última herramienta, solo si falta la confirmada. */
export function inferirFase(herramienta: string | null): string | null {
  if (herramienta === null) return null;
  if (/^(Edit|Write|NotebookEdit)$/.test(herramienta)) return "implementando";
  if (/^(Read|Grep|Glob|WebFetch|WebSearch)$/.test(herramienta)) return "analizando";
  if (/^mcp__valmen[A-Za-z0-9_-]*__(evaluar_compuerta|simular_compuerta|cascada_verificada)$/.test(herramienta)) {
    return "compuerta";
  }
  if (herramienta === "Bash") return "ejecutando";
  return null;
}

export interface OpcionesDeLectura {
  readonly home?: string;
  /** Reloj inyectable, en milisegundos. */
  readonly ahora?: number;
  /** Fuerza la sesión orquestadora (identificador simple). */
  readonly sesion?: string;
  /** Registro para unir el estado real del ticket. */
  readonly paths?: RegistryPaths;
  /** Proyecto autorizado para leer la actividad; sin él la fase confirmada es null. */
  readonly project?: AuthorizedProject;
}

/** Último estado de actividad registrado por ticket (por cursor), o vacío sin proyecto. */
function actividadPorTicket(project: AuthorizedProject | undefined): Map<string, string> {
  const resultado = new Map<string, { cursor: number; estado: string }>();
  if (project === undefined) return new Map();
  try {
    for (const replay of createExecutionContract(project).replay()) {
      for (const actividad of readExecutionActivity(project, replay.identity)) {
        const previa = resultado.get(replay.identity.ticketId);
        if (previa === undefined || actividad.cursor > previa.cursor) {
          resultado.set(replay.identity.ticketId, { cursor: actividad.cursor, estado: actividad.state });
        }
      }
    }
  } catch {
    return new Map();
  }
  return new Map([...resultado].map(([ticket, dato]) => [ticket, dato.estado]));
}

/** La regla de estado, igual para la sesión principal y para los subagentes. */
function estadoDe(lectura: Lectura, ahora: number): EstadoDeAgente {
  if (lectura.cerro && !lectura.pendiente) return "termino";
  if (
    lectura.pendiente ||
    lectura.ultimoEventoEn === null ||
    ahora - lectura.ultimoEventoEn > ESPERA_MAXIMA_MS
  ) {
    return "esperando";
  }
  return "trabajando";
}

/** La pregunta a declarar: abierta, contestada dentro de la ventana, o null. */
function preguntaDe(lectura: Lectura, ahora: number): PreguntaPendiente | null {
  if (lectura.preguntaDesde === null) return null;
  const desde = new Date(lectura.preguntaDesde).toISOString();
  if (lectura.preguntaRespondidaEn === null) return { desde, respondidaEn: null };
  if (ahora - lectura.preguntaRespondidaEn > VENTANA_RESPUESTA_MS) return null;
  return { desde, respondidaEn: new Date(lectura.preguntaRespondidaEn).toISOString() };
}

/** Una fila por la sesión principal y otra por cada subagente; vacío si no hay subagentes. */
export function leerAgentesDeCorrida(
  root: string,
  opciones: OpcionesDeLectura = {},
): AgenteDeCorrida[] {
  const ahora = opciones.ahora ?? Date.now();
  if (opciones.sesion !== undefined && !esSesionValida(opciones.sesion)) return [];
  const ruta = sesionOrquestadora(root, opciones.home ?? homedir(), ahora, opciones.sesion);
  if (ruta === null) return [];

  const actividad = actividadPorTicket(opciones.project);
  const filas: AgenteDeCorrida[] = [];

  const principal = leerConCache(ruta);
  if (principal !== null) {
    filas.push({
      agente: basename(ruta, ".jsonl"),
      principal: true,
      ticket: null,
      descripcion: null,
      modelo: principal.modelo,
      esfuerzo: principal.esfuerzo,
      rama: principal.rama,
      carpeta: principal.carpeta,
      ultimaHerramienta: principal.ultimaHerramienta,
      ultimaHerramientaEn:
        principal.ultimaHerramientaEn === null ? null : new Date(principal.ultimaHerramientaEn).toISOString(),
      estado: estadoDe(principal, ahora),
      ticketEstado: null,
      faseConfirmada: null,
      faseInferida: null,
      pregunta: preguntaDe(principal, ahora),
    });
  }

  for (const archivo of archivosDeSubagentes(ruta)) {
    const lectura = leerConCache(archivo);
    if (lectura === null) continue;

    const estado = estadoDe(lectura, ahora);

    let ticketEstado: string | null = null;
    if (lectura.ticket !== null && opciones.paths !== undefined) {
      try {
        ticketEstado = readTicket(opciones.paths, lectura.ticket)?.workflowStatus ?? null;
      } catch {
        ticketEstado = null;
      }
    }
    const faseConfirmada = lectura.ticket === null ? null : (actividad.get(lectura.ticket) ?? null);

    filas.push({
      agente: basename(archivo, ".jsonl").replace(/^agent-/, ""),
      principal: false,
      ticket: lectura.ticket,
      descripcion: descripcionDe(archivo),
      modelo: lectura.modelo,
      esfuerzo: lectura.esfuerzo,
      rama: lectura.rama,
      carpeta: lectura.carpeta,
      ultimaHerramienta: lectura.ultimaHerramienta,
      ultimaHerramientaEn:
        lectura.ultimaHerramientaEn === null ? null : new Date(lectura.ultimaHerramientaEn).toISOString(),
      estado,
      ticketEstado,
      faseConfirmada,
      faseInferida: faseConfirmada === null ? inferirFase(lectura.ultimaHerramienta) : null,
      pregunta: preguntaDe(lectura, ahora),
    });
  }
  return filas;
}
