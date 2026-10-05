/**
 * Las sesiones de Claude Code: el quinto agente que trabaja el registro.
 *
 * El PO decidió que los tickets se resuelven desde Claude Code, y la línea de
 * tiempo seguía leyendo opencode, codex y Hermes: un ticket hecho entero aquí
 * salía **sin una sola sesión**, aunque sus compuertas existieran. Un registro que
 * no ve al agente que hizo el trabajo mide mal el trabajo.
 *
 * Claude Code guarda cada sesión como una transcripción
 * `~/.claude/projects/<carpeta>/<id>.jsonl`, una línea JSON por evento. La carpeta
 * es la ruta del proyecto con todo lo que no es letra o número cambiado por `-`
 * (`/Users/yo/p.q` → `-Users-yo-p-q`), y una sesión abierta en un worktree vive en
 * otra carpeta (`<proyecto>--claude-worktrees-<nombre>`) que **también es del
 * proyecto**.
 *
 * Tres cosas de esa transcripción son trampas, y las tres se midieron:
 *
 * 1. **Cada línea de asistente trae un solo bloque de contenido y repite el
 *    `message.id` y el `usage` del mensaje entero.** Una respuesta con texto y dos
 *    llamadas ocupa tres líneas con el mismo uso; sumarlas todas lo inflaba varias
 *    veces (323 líneas para 106 mensajes). Se suma una vez por `message.id`.
 * 2. **El `cwd` cambia dentro de la misma sesión** —el agente entra a `/tmp` o a su
 *    carpeta de memoria—, así que el proyecto no se decide por un `cwd` cualquiera:
 *    manda la carpeta donde Claude Code archivó la sesión, y el primer `cwd` solo
 *    confirma que no es la colisión de dos rutas que dan el mismo nombre.
 * 3. **La transcripción lleva todo lo que el agente leyó.** Una sesión que abrió
 *    `AGENTS.md` o la memoria del proyecto «menciona» veintiocho tickets sin haber
 *    trabajado ninguno (es el caso real). Por eso mencionar no atribuye: se atribuye
 *    por lo que la sesión **escribió** en el registro, o por lo que el usuario le
 *    pidió.
 *
 * **El coste no existe, y no se inventa.** Claude Code va por el plan Max
 * (suscripción): no hay precio por token, así que se registran los tokens y el
 * coste queda como desconocido. Un cero diría «gratis» y una tarifa de API sería un
 * número inventado con forma de medición.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  HERRAMIENTAS_QUE_ESCRIBEN,
  escribePorCli,
  nombreDeHerramienta,
  segmentoInvocaCli,
  subcomandoDeValmen,
  ticketsDeTexto,
  type TicketDeSesion,
} from "./hermes.js";

/** Un modelo que intervino en la sesión, con lo que produjo. */
export interface ModeloDeClaude {
  readonly model: string;
  /** Mensajes únicos del asistente que lo usaron. */
  readonly mensajes: number;
  readonly outputTokens: number;
}

/** Una sesión de Claude Code, con lo que el registro necesita de ella. */
export interface SesionDeClaude {
  readonly id: string;
  readonly path: string;
  /** El título que Claude Code le puso a la sesión, o vacío. */
  readonly title: string;
  /** Cuándo empezó, en milisegundos. */
  readonly startedAt: number;
  /**
   * El modelo que más produjo, o vacío si ningún mensaje lo declara.
   *
   * Una sesión puede cambiar de modelo a mitad —o llevar subagentes en otro—, y un
   * solo nombre no lo dice: gana el que más salida generó, y la lista completa va
   * en `modelos` para que quien registre el consumo pueda declararlo.
   */
  readonly model: string;
  readonly modelos: readonly ModeloDeClaude[];
  /** Mensajes únicos del asistente, ya deduplicados por `message.id`. */
  readonly mensajes: number;
  /**
   * De esos mensajes, cuántos llamaron al harness.
   *
   * Es lo que sí se puede afirmar de una sesión sin coste por mensaje: no cuánto
   * costó el trabajo sobre el registro, pero sí cuánto de la sesión fue. Es la misma
   * cuenta que lleva Hermes, y la pantalla la dice igual en los dos.
   */
  readonly mensajesDelRegistro: number;
  /**
   * Entrada nueva: la que no vino de caché más la que se **escribió** en caché.
   *
   * La creación de caché es entrada que el modelo procesó por primera vez en ese
   * turno; dejarla fuera ocultaba casi toda la entrada real (383 mil frente a 110).
   * La que se **leyó** de caché va aparte, porque es el mismo contexto repetido en
   * cada turno y explica por qué el total engaña.
   */
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  /**
   * La salida, que ya incluye el razonamiento.
   *
   * No se parte en `reasoning`: `output_tokens` ya cuenta los tokens de
   * pensamiento, y declararlos otra vez haría que los totales los sumaran dos
   * veces.
   */
  readonly outputTokens: number;
  /** Llamadas al harness: herramientas MCP `mcp__valmen__*` y el CLI por Bash. */
  readonly intervenciones: number;
  /** De esas, cuántas devolvieron error. */
  readonly fallidas: number;
  /** Cuántos subagentes trabajaron para la sesión; su gasto ya está sumado. */
  readonly subagentes: number;
  /**
   * Los tickets de la sesión, de mayor a menor peso: los que **trabajó** o, si no
   * escribió ninguno, los que el usuario le pidió. Con más de uno es compartida.
   */
  readonly tickets: readonly TicketDeSesion[];
  /** `true` si la sesión sirvió a más de un ticket y su gasto no es de uno solo. */
  readonly compartida: boolean;
}

/** Dónde viven las transcripciones de Claude Code. */
export function claudeProjectsPath(home: string = homedir()): string {
  return join(home, ".claude", "projects");
}

/** `true` si hay una carpeta de transcripciones que leer. */
export function hayDatosDeClaude(home: string = homedir()): boolean {
  return existsSync(claudeProjectsPath(home));
}

/**
 * Macos y Windows no distinguen mayúsculas en las rutas: el mismo proyecto aparece
 * como `ValmenHarness` y `ValMenHarness` según desde dónde se lo abrió, y comparar
 * exacto dejaba esa sesión fuera.
 */
const SIN_MAYUSCULAS = process.platform === "darwin" || process.platform === "win32";

function normal(texto: string): string {
  return SIN_MAYUSCULAS ? texto.toLowerCase() : texto;
}

/**
 * Las carpetas de transcripciones que pueden ser del proyecto.
 *
 * Se aceptan la carpeta del proyecto y toda la que empiece por ella más un guion:
 * ahí caen los worktrees (`--claude-worktrees-<nombre>`) y las sesiones abiertas en
 * una subcarpeta. Dos rutas distintas pueden dar el mismo nombre —`/a/b-c` y
 * `/a/b/c`—, así que esto es un primer corte y la pertenencia la confirma el `cwd`.
 *
 * El nombre se calcula de dos formas porque Claude Code cambió lo que sustituye:
 * todo lo que no es alfanumérico, o solo las barras y los puntos. Sin símbolos raros
 * en la ruta dan lo mismo.
 */
function carpetasDelProyecto(base: string, root: string): string[] {
  const ruta = resolve(root);
  const nombres = new Set(
    [ruta.replace(/[^a-zA-Z0-9]/g, "-"), ruta.replace(/[/\\.]/g, "-")].map(normal),
  );

  let entradas: { name: string; isDirectory(): boolean }[];
  try {
    entradas = readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }

  return entradas
    .filter((entrada) => {
      if (!entrada.isDirectory()) return false;
      const nombre = normal(entrada.name);
      for (const candidato of nombres) {
        if (nombre === candidato || nombre.startsWith(`${candidato}-`)) return true;
      }
      return false;
    })
    .map((entrada) => join(base, entrada.name));
}

/** `true` si la ruta está dentro del proyecto, o es el proyecto. */
function estaDentro(ruta: string, root: string): boolean {
  const diferencia = relative(normal(resolve(root)), normal(resolve(ruta)));
  return (
    diferencia === "" ||
    (!isAbsolute(diferencia) && diferencia !== ".." && !diferencia.startsWith(`..${sep}`))
  );
}

/** Un número de un campo que puede no estar, sin inventarlo. */
function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** El uso de un mensaje del asistente, ya con su modelo. */
interface UsoDeMensaje {
  model: string;
  input: number;
  creacion: number;
  lectura: number;
  salida: number;
}

/** Lo que se va acumulando mientras se leen la transcripción y sus subagentes. */
interface Acumulado {
  readonly mensajes: Map<string, UsoDeMensaje>;
  /** Las llamadas ya vistas: un bloque no se cuenta dos veces. */
  readonly llamadas: Set<string>;
  readonly intervenciones: Set<string>;
  /** Los mensajes del asistente que llamaron al harness, por `message.id`. */
  readonly mensajesDelRegistro: Set<string>;
  readonly resultadosConError: Set<string>;
  readonly tickets: Map<string, { peso: number; trabajado: boolean; pedido: boolean }>;
  cwd: string | null;
  titulo: string;
  inicio: number;
}

/**
 * Los tickets que menciona un texto, con cuántas veces cada uno.
 *
 * Si se pide un ticket concreto se busca además su identificador tal cual: el
 * reconocedor general solo conoce los tipos del contrato, y el ticket que se está
 * mirando tiene que encontrarse aunque su tipo no esté en la lista.
 */
function idsEn(texto: string, ticketId: string | undefined): Map<string, number> {
  const cuenta = ticketsDeTexto(texto);
  if (ticketId !== undefined && !cuenta.has(ticketId)) {
    const veces = texto.split(ticketId).length - 1;
    if (veces > 0) cuenta.set(ticketId, veces);
  }
  return cuenta;
}

function sumar(
  acumulado: Acumulado,
  id: string,
  peso: number,
  marca: "trabajado" | "pedido" | null,
): void {
  const actual = acumulado.tickets.get(id) ?? { peso: 0, trabajado: false, pedido: false };
  acumulado.tickets.set(id, {
    peso: actual.peso + peso,
    trabajado: actual.trabajado || marca === "trabajado",
    pedido: actual.pedido || marca === "pedido",
  });
}

/** Las herramientas MCP del harness, con cualquiera de sus nombres de servidor. */
const SERVIDOR_DEL_HARNESS_RE = /^mcp__valmen(?:_[A-Za-z0-9-]+)?__/;

/**
 * Los campos de una herramienta que dicen **sobre qué ticket** actúa.
 *
 * Solo ahí un identificador prueba trabajo. Otros campos —`tickets` de
 * `guardar_aprendizaje`, el texto de una nota— nombran tickets como referencia, y
 * contarlos haría compartida a una sesión que solo citó otro ticket al anotar lo
 * aprendido.
 */
const CAMPOS_DE_OBJETIVO: readonly string[] = ["id", "ticket"];

/**
 * Los subcomandos del CLI que **escriben** sobre un ticket.
 *
 * Es la contraparte de `HERRAMIENTAS_QUE_ESCRIBEN` para quien trabaja por la
 * terminal: solo estos prueban que la sesión trabajó el ticket. `resume`, `validate`,
 * `show`, `active` o `ask` lo leen, y una sesión que diagnostica el propio harness
 * los corre sobre tres tickets distintos sin haber trabajado ninguno. Con el criterio
 * de Hermes —cualquier comando que nombre el ticket— esa sesión salía como
 * compartida y la foto de consumo le habría escrito una entrada al ticket, en un
 * bloque que no se reescribe. Un falso negativo cuesta poco —queda lo que el usuario
 * pidió—; un falso positivo se queda en el registro.
 */
const SUBCOMANDOS_QUE_ESCRIBEN: ReadonlySet<string> = new Set([
  "create",
  "transition",
  "add-point",
  "add-evidence",
  "add-retest",
  "add-ai-usage",
  "close-attempt",
  "qa-start",
  "qa-close",
  "gate",
  "gate-decide",
  "run",
]);

/**
 * Los ids que un comando del CLI recibe como **objetivo**: el valor de `--id` o de
 * `--ticket`, con o sin `=` y con o sin comillas.
 *
 * Es la contraparte de `CAMPOS_DE_OBJETIVO`. Un id en `--request`, `--title` o
 * `--notes` es texto que se escribe, no el ticket sobre el que se actúa: esta misma
 * sesión creó un ticket con una solicitud que citaba otro, y contar cualquier id del
 * segmento la hacía compartida entre los dos.
 */
const OBJETIVO_DEL_CLI_RE = /--(?:id|ticket)(?:=|\s+)["']?([^\s"';|&]+)/g;

function objetivosDelCli(segmento: string, ticketId: string | undefined): Set<string> {
  const objetivos = new Set<string>();
  for (const coincidencia of segmento.matchAll(OBJETIVO_DEL_CLI_RE)) {
    for (const ticket of idsEn(coincidencia[1] as string, ticketId).keys()) objetivos.add(ticket);
  }
  return objetivos;
}

function leerLlamada(
  bloque: Record<string, unknown>,
  claveDelMensaje: string,
  acumulado: Acumulado,
  ticketId: string | undefined,
): void {
  const id = typeof bloque["id"] === "string" ? bloque["id"] : null;
  if (id !== null) {
    if (acumulado.llamadas.has(id)) return;
    acumulado.llamadas.add(id);
  }
  const nombre = typeof bloque["name"] === "string" ? bloque["name"] : "";
  const entrada = objeto(bloque["input"]) ?? {};

  const contar = (): void => {
    if (id !== null) acumulado.intervenciones.add(id);
    acumulado.mensajesDelRegistro.add(claveDelMensaje);
  };

  if (SERVIDOR_DEL_HARNESS_RE.test(nombre)) {
    contar();
    const escribe = HERRAMIENTAS_QUE_ESCRIBEN.includes(nombreDeHerramienta(nombre));
    const objetivos = new Set<string>();
    if (escribe) {
      for (const campo of CAMPOS_DE_OBJETIVO) {
        const valor = entrada[campo];
        if (typeof valor !== "string") continue;
        for (const ticket of idsEn(valor, ticketId).keys()) objetivos.add(ticket);
      }
    }
    for (const [ticket, veces] of idsEn(JSON.stringify(entrada), ticketId)) {
      const esObjetivo = objetivos.has(ticket);
      sumar(acumulado, ticket, veces * (esObjetivo ? 3 : 1), esObjetivo ? "trabajado" : null);
    }
    return;
  }

  if (nombre === "Bash") {
    const comando = typeof entrada["command"] === "string" ? entrada["command"] : "";
    if (escribePorCli(comando)) contar();
    // Cada segmento responde por los tickets que **él** nombra: el comando del CLI
    // que escribe sobre un `--id` trabaja ese ticket, y los demás ids —los de un
    // comando vecino (`grep` sobre `tickets/`, `git log`, `valmen resume`) o los del
    // texto de una solicitud— solo se citan.
    // Se parte también por salto de línea: aquí el comando es texto real y no un JSON
    // con los saltos escapados, y un guion de varias líneas no es un solo comando.
    for (const segmento of comando.split(/[;&|\n]/)) {
      const subcomando = segmentoInvocaCli(segmento) ? subcomandoDeValmen(segmento) : null;
      const objetivos =
        subcomando !== null && SUBCOMANDOS_QUE_ESCRIBEN.has(subcomando)
          ? objetivosDelCli(segmento, ticketId)
          : new Set<string>();
      for (const [ticket, veces] of idsEn(segmento, ticketId)) {
        const esObjetivo = objetivos.has(ticket);
        sumar(acumulado, ticket, veces * (esObjetivo ? 3 : 1), esObjetivo ? "trabajado" : null);
      }
    }
    return;
  }

  // Una herramienta ajena —Read, Edit, otro MCP— puede citar tickets y nunca los
  // trabaja en el registro.
  for (const [ticket, veces] of idsEn(JSON.stringify(entrada), ticketId)) {
    sumar(acumulado, ticket, veces, null);
  }
}

/** El texto que escribió el usuario en un mensaje, sin lo que el agente leyó. */
function textoDelUsuario(contenido: unknown): string {
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

/**
 * Lee una transcripción —la de la sesión o la de uno de sus subagentes— y suma lo
 * que trae al acumulado.
 *
 * Los subagentes no aportan prompts ni `cwd`: el prompt de un subagente lo escribió
 * el agente padre y no prueba que el usuario pidiera ese ticket, y su `cwd` puede
 * ser una subcarpeta. Sí aportan gasto, llamadas al registro y escrituras.
 */
function leerTranscripcion(
  contenido: string,
  acumulado: Acumulado,
  ticketId: string | undefined,
  esSubagente: boolean,
): void {
  let sinId = 0;

  for (const linea of contenido.split("\n")) {
    if (linea.trim() === "") continue;
    let evento: Record<string, unknown>;
    try {
      evento = JSON.parse(linea) as Record<string, unknown>;
    } catch {
      // Una línea cortada —la sesión se está escribiendo mientras se lee— no
      // invalida las demás.
      continue;
    }

    const marca = typeof evento["timestamp"] === "string" ? Date.parse(evento["timestamp"]) : NaN;
    if (Number.isFinite(marca) && (acumulado.inicio === 0 || marca < acumulado.inicio)) {
      acumulado.inicio = marca;
    }
    if (!esSubagente && acumulado.cwd === null && typeof evento["cwd"] === "string") {
      acumulado.cwd = evento["cwd"];
    }

    const tipo = evento["type"];
    if (tipo === "custom-title" && typeof evento["customTitle"] === "string") {
      acumulado.titulo = evento["customTitle"];
      continue;
    }

    if (tipo === "assistant") {
      const mensaje = objeto(evento["message"]);
      if (mensaje === null) continue;
      const modelo = typeof mensaje["model"] === "string" ? mensaje["model"] : "";
      const clave =
        typeof mensaje["id"] === "string"
          ? mensaje["id"]
          : `${typeof evento["uuid"] === "string" ? evento["uuid"] : "sin-id"}:${(sinId += 1)}`;
      // Claude Code escribe mensajes sintéticos —un error, una interrupción— con
      // el modelo `<synthetic>` y sin gasto: no son un modelo que intervino.
      if (modelo !== "<synthetic>") {
        const uso = objeto(mensaje["usage"]) ?? {};
        const previo = acumulado.mensajes.get(clave);
        // El máximo y no el último: las líneas de un mismo mensaje repiten su uso,
        // y si alguna lo trajera parcial, el mayor es el definitivo.
        acumulado.mensajes.set(clave, {
          model: modelo !== "" ? modelo : (previo?.model ?? ""),
          input: Math.max(previo?.input ?? 0, numero(uso["input_tokens"])),
          creacion: Math.max(previo?.creacion ?? 0, numero(uso["cache_creation_input_tokens"])),
          lectura: Math.max(previo?.lectura ?? 0, numero(uso["cache_read_input_tokens"])),
          salida: Math.max(previo?.salida ?? 0, numero(uso["output_tokens"])),
        });
      }
      if (Array.isArray(mensaje["content"])) {
        for (const bloque of mensaje["content"]) {
          const dato = objeto(bloque);
          if (dato !== null && dato["type"] === "tool_use") {
            leerLlamada(dato, clave, acumulado, ticketId);
          }
        }
      }
      continue;
    }

    if (tipo === "user") {
      const mensaje = objeto(evento["message"]);
      if (mensaje === null) continue;
      const contenidoDelMensaje = mensaje["content"];

      if (Array.isArray(contenidoDelMensaje)) {
        for (const bloque of contenidoDelMensaje) {
          const dato = objeto(bloque);
          if (
            dato !== null &&
            dato["type"] === "tool_result" &&
            dato["is_error"] === true &&
            typeof dato["tool_use_id"] === "string"
          ) {
            acumulado.resultadosConError.add(dato["tool_use_id"]);
          }
        }
      }

      // Lo que pidió el usuario. Un mensaje `isMeta` lo inyecta el cliente
      // —instrucciones de una skill, recordatorios— y no es del usuario.
      if (esSubagente || evento["isMeta"] === true) continue;
      const texto = textoDelUsuario(contenidoDelMensaje);
      if (texto === "") continue;
      for (const [ticket, veces] of idsEn(texto, ticketId)) {
        sumar(acumulado, ticket, veces, "pedido");
      }
    }
  }
}

/** Los archivos de subagentes de una sesión: `<carpeta>/<id>/subagents/agent-*.jsonl`. */
function archivosDeSubagentes(rutaDeSesion: string): string[] {
  const carpeta = join(dirname(rutaDeSesion), basename(rutaDeSesion, ".jsonl"), "subagents");
  let nombres: string[];
  try {
    nombres = readdirSync(carpeta);
  } catch {
    return [];
  }
  return nombres
    .filter((nombre) => nombre.startsWith("agent-") && nombre.endsWith(".jsonl"))
    .sort()
    .map((nombre) => join(carpeta, nombre));
}

/**
 * A quién pertenece la sesión.
 *
 * Primero lo que **escribió** en el registro —un movimiento, una compuerta, una
 * evidencia—: trabajar un ticket es escribirlo, y leer otros diez no la hace de
 * diez. Solo si no escribió nada, lo que el usuario le **pidió**. Mencionarlo al
 * leer un archivo no cuenta: la transcripción lleva todo lo que el agente abrió.
 *
 * Con más de un ticket la sesión es compartida: tiene un solo gasto y ningún modo
 * de repartirlo.
 */
function atribucion(acumulado: Acumulado): TicketDeSesion[] {
  const todos: TicketDeSesion[] = [...acumulado.tickets.entries()]
    .map(([id, dato]) => ({ id, peso: dato.peso, trabajado: dato.trabajado }))
    .sort((a, b) => b.peso - a.peso || a.id.localeCompare(b.id));

  const trabajados = todos.filter((t) => t.trabajado);
  if (trabajados.length > 0) return trabajados;
  return todos.filter((t) => acumulado.tickets.get(t.id)?.pedido === true);
}

/**
 * Lee las sesiones de Claude Code de un proyecto.
 *
 * Con `ticketId`, solo las que **trabajaron** ese ticket —o las compartidas que lo
 * trabajaron, marcadas—: la línea de tiempo de un ticket no tiene por qué cargar
 * las sesiones que no lo tocaron, y el coste que muestra tiene que ser el suyo.
 *
 * Se filtra por fecha de modificación y por una búsqueda del identificador en el
 * texto crudo **antes** de parsear nada: una transcripción pesa megabytes y la gran
 * mayoría no es del ticket que se mira.
 */
export function leerSesionesDeClaude(
  root: string,
  options: {
    readonly home?: string;
    readonly ticketId?: string;
    readonly dias?: number;
  } = {},
): SesionDeClaude[] {
  const base = claudeProjectsPath(options.home ?? homedir());
  if (!existsSync(base)) return [];

  const desde = Date.now() - (options.dias ?? 60) * 24 * 60 * 60 * 1000;
  const sesiones = new Map<string, SesionDeClaude>();

  for (const carpeta of carpetasDelProyecto(base, root)) {
    let nombres: string[];
    try {
      nombres = readdirSync(carpeta);
    } catch {
      continue;
    }

    for (const nombre of nombres) {
      if (!nombre.endsWith(".jsonl")) continue;
      const ruta = join(carpeta, nombre);
      const id = basename(nombre, ".jsonl");
      if (sesiones.has(id)) continue;

      try {
        if (statSync(ruta).mtimeMs < desde) continue;
      } catch {
        continue;
      }

      let contenido: string;
      try {
        contenido = readFileSync(ruta, "utf8");
      } catch {
        continue;
      }
      if (options.ticketId !== undefined && !contenido.includes(options.ticketId)) continue;

      const acumulado: Acumulado = {
        mensajes: new Map(),
        llamadas: new Set(),
        intervenciones: new Set(),
        mensajesDelRegistro: new Set(),
        resultadosConError: new Set(),
        tickets: new Map(),
        cwd: null,
        titulo: "",
        inicio: 0,
      };
      leerTranscripcion(contenido, acumulado, options.ticketId, false);
      // Un `cwd` fuera del proyecto es la colisión de dos rutas con el mismo nombre
      // de carpeta. Sin `cwd` no hay con qué desmentir la carpeta, y se acepta.
      if (acumulado.cwd !== null && !estaDentro(acumulado.cwd, root)) continue;

      const subagentes = archivosDeSubagentes(ruta);
      for (const archivo of subagentes) {
        try {
          leerTranscripcion(readFileSync(archivo, "utf8"), acumulado, options.ticketId, true);
        } catch {
          // Un subagente ilegible no tumba la sesión: se pierde lo suyo y no más.
        }
      }

      // Sin un solo mensaje del asistente no hay nada que medir.
      if (acumulado.mensajes.size === 0) continue;

      const tickets = atribucion(acumulado);
      const compartida = tickets.length > 1;
      if (options.ticketId !== undefined && !tickets.some((t) => t.id === options.ticketId)) {
        continue;
      }

      let inputTokens = 0;
      let cacheReadTokens = 0;
      let outputTokens = 0;
      const porModelo = new Map<string, { mensajes: number; outputTokens: number }>();
      for (const mensaje of acumulado.mensajes.values()) {
        inputTokens += mensaje.input + mensaje.creacion;
        cacheReadTokens += mensaje.lectura;
        outputTokens += mensaje.salida;
        if (mensaje.model === "") continue;
        const actual = porModelo.get(mensaje.model) ?? { mensajes: 0, outputTokens: 0 };
        porModelo.set(mensaje.model, {
          mensajes: actual.mensajes + 1,
          outputTokens: actual.outputTokens + mensaje.salida,
        });
      }
      const modelos = [...porModelo.entries()]
        .map(([model, dato]) => ({ model, ...dato }))
        .sort(
          (a, b) =>
            b.outputTokens - a.outputTokens ||
            b.mensajes - a.mensajes ||
            a.model.localeCompare(b.model),
        );

      let fallidas = 0;
      for (const llamada of acumulado.intervenciones) {
        if (acumulado.resultadosConError.has(llamada)) fallidas += 1;
      }

      sesiones.set(id, {
        id,
        path: ruta,
        title: acumulado.titulo,
        startedAt: acumulado.inicio,
        model: modelos[0]?.model ?? "",
        modelos,
        mensajes: acumulado.mensajes.size,
        mensajesDelRegistro: acumulado.mensajesDelRegistro.size,
        inputTokens,
        cacheReadTokens,
        outputTokens,
        intervenciones: acumulado.intervenciones.size,
        fallidas,
        subagentes: subagentes.length,
        tickets,
        compartida,
      });
    }
  }

  return [...sesiones.values()].sort((a, b) => a.startedAt - b.startedAt);
}
