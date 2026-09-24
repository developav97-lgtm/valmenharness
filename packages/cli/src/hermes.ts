/**
 * El comando `hermes`: conectar el harness con Hermes, y decir si está conectado.
 *
 * Hermes es el único destino que no vive en el proyecto. Su configuración es
 * `~/.hermes/config.yaml` —una sola para todos los proyectos de la máquina— y eso
 * hace que este comando tenga dos trabajos que en `valmen mcp` son uno:
 *
 * 1. **Escribir** el bloque que declara el servidor, con la raíz de *este*
 *    proyecto, porque Hermes no tiene forma de deducirla. Es `connect`.
 * 2. **Diagnosticar**, porque un servidor MCP que no aparece no dice por qué. Es
 *    `status`, y existe por la misma razón que `valmen-mcp --check`: el primer
 *    fallo de una integración es «no está», y adivinar cuál de las cinco cosas
 *    falta cuesta más que leerlas.
 *
 * Lo que este comando **no** hace es delegar en `hermes mcp add`, y conviene
 * decirlo porque parece lo obvio. Su parser usa `nargs=REMAINDER` para `--args`
 * y el alta hace un sondeo con una lista de herramientas que se confirma con
 * ENTER: un comando del harness que se queda esperando a que alguien pulse una
 * tecla en medio de un `--install` es peor que uno que escribe cuatro líneas. El
 * comando se imprime igual, para quien prefiera su CLI y su checklist.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  HERMES_SERVER_ID,
  buildHermesEntry,
  hermesAddCommand,
  hermesBlock,
  hermesConfigPath,
  hermesDeepLink,
  hermesSkill,
  hermesSkillPath,
  mergeHermesConfig,
  parseConfig,
  readHermesConfig,
  readIfExists,
  readSkills,
  readString,
  type HermesConfig,
  type HermesEntry,
} from "@valmen/adapter";

import { EXIT_SCHEMA, declaredImpactIds, parseTicket } from "@valmen/core";
import { blockOf, credentialsPath, fieldOf } from "@valmen/credentials";
import {
  appendApproval,
  buildGateState,
  corridasAvisadas,
  currentReceipts,
  findTicket,
  hermesSendChannel,
  listTickets,
  mintApproval,
  pendingApprovals,
  readReceipts,
  renderBrief,
  renderGateNotification,
  renderProcessNotification,
  renderTestMessage,
  resolveApprovalCode,
  ultimoIntento,
  usageReport,
  waitingRuns,
  verifyApproval,
  type BriefGate,
  type BriefInput,
  type CeilingInput,
  type CommandRunner,
  type PendingApproval,
  type RegistryPaths,
} from "@valmen/engine";
import { hashState } from "@valmen/gate";
import { recordHumanDecision } from "@valmen/server";

import type { CommandResult } from "./commands.js";

/** Lo que hace falta para notificar un gate y emitir su token. */
export interface NotifyRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly receiptId: string;
  /** A dónde va el mensaje: `telegram`, `discord:#ops`. */
  readonly to: string;
  readonly secret: string;
  readonly now: Date;
  readonly ttlHours?: number | undefined;
  /** La costura del proceso, por el mismo motivo que en `test`. */
  readonly runner?: CommandRunner | undefined;
}

/** Lo que se pidió. */
export interface HermesRequest {
  readonly root: string;
  /** El ejecutable del CLI, para deducir el del servidor MCP. */
  readonly cliEntry: string;
  readonly action: "status" | "connect" | "test";
  /** El nombre de la entrada. Un proyecto, una entrada: ver `hermesBlock`. */
  readonly name: string;
  readonly dryRun: boolean;
  readonly untrusted: boolean;
  readonly json: boolean;
  /** Escribe aunque Hermes no parezca instalado. */
  readonly force: boolean;
  /**
   * Costura de inyección para las pruebas.
   *
   * `connect` se niega a escribir cuando Hermes no está, y esa decisión depende
   * de un binario que existe o no en la máquina donde corren los tests. Sin esta
   * costura, el camino de «se negó» solo se probaría en una máquina sin Hermes y
   * el de «escribió» solo en una con Hermes: una prueba que cambia de resultado
   * según dónde se corra no prueba nada, y la mitad del comando quedaría sin
   * cubrir en cualquiera de las dos. Es la misma costura que `runGate` expone
   * para el evaluador, con el mismo motivo.
   */
  readonly instalado?: (() => boolean) | undefined;
  /** El destino de la prueba: `telegram`, `discord:#ops`. Solo con `test`. */
  readonly to?: string | undefined;
  /** La costura del proceso, por el mismo motivo que `instalado`. */
  readonly runner?: CommandRunner | undefined;
}

function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function falla(stderr: string, exitCode: number = EXIT_SCHEMA): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/**
 * Si el binario de Hermes responde.
 *
 * Se comprueba **ejecutándolo** y no buscándolo en el `PATH`: un `hermes` que
 * existe y no arranca —un entorno virtual roto, un shim de otro programa— se ve
 * igual que uno sano desde una búsqueda de archivo, y el diagnóstico diría que
 * todo está bien justo cuando no lo está.
 */
export function hermesBinaryWorks(): boolean {
  try {
    const r = spawnSync("hermes", ["--version"], { encoding: "utf8", timeout: 10_000 });
    return r.error === undefined && r.status === 0;
  } catch {
    return false;
  }
}

/** La entrada que este comando declara. */
export function entryFor(request: HermesRequest): HermesEntry {
  return buildHermesEntry({
    root: request.root,
    invocation: request.cliEntry,
    name: request.name,
    untrusted: request.untrusted,
  });
}

/** El estado de la conexión, en datos, para `--json` y para el informe. */
export interface HermesStatus {
  readonly configPath: string;
  readonly configExists: boolean;
  readonly binaryWorks: boolean;
  readonly declared: boolean;
  /** La raíz que declara la entrada, si se pudo leer. */
  readonly declaredRoot: string | null;
  readonly pointsHere: boolean;
}

/**
 * Lee la raíz que declara la entrada existente.
 *
 * Es una lectura de texto y no un análisis de YAML a propósito: el archivo de
 * Hermes puede tener cualquier cosa —anclas, bloques, escalares raros— y el
 * harness no tiene por qué saber leerlo entero para contestar una pregunta que es
 * de una sola línea. Si no la encuentra, devuelve `null` y el informe dice «no se
 * pudo leer» en vez de inventar una respuesta.
 */
export function declaredRoot(texto: string, nombre: string): string | null {
  const entrada = new RegExp(`^ {2}${nombre}:\\s*$`, "m");
  if (!entrada.test(texto)) return null;

  const desde = texto.slice(entrada.exec(texto)!.index);
  const cwd = /^ {4}cwd:\s*"?([^"\n]*)"?\s*$/m.exec(desde);
  return cwd === null ? null : (cwd[1] as string);
}

/** El diagnóstico. */
export function hermesStatus(request: HermesRequest): CommandResult {
  const configPath = hermesConfigPath();
  const texto = readIfExists(configPath);
  const raiz = texto === null ? null : declaredRoot(texto, request.name);
  const instalado = request.instalado ?? hermesBinaryWorks;

  const estado: HermesStatus = {
    configPath,
    configExists: texto !== null,
    binaryWorks: instalado(),
    declared: raiz !== null,
    declaredRoot: raiz,
    pointsHere: raiz === request.root,
  };

  if (request.json) return ok(JSON.stringify(estado, null, 2) + "\n");

  const marca = (bien: boolean): string => (bien ? "sí" : "no");

  // El ancho de la columna sale de la etiqueta más larga y no de una constante:
  // la de la entrada lleva el nombre, que es configurable, así que un número
  // escrito a mano se queda corto en cuanto alguien conecta un segundo proyecto
  // con un nombre más largo —y el desalineado es lo primero que se ve—.
  const etiquetas = [
    "Hermes instalado",
    "archivo de configuración",
    `entrada \`${request.name}\` declarada`,
    ...(texto === null ? [] : ["apunta a este proyecto"]),
  ];
  const ancho = Math.max(...etiquetas.map((e) => e.length)) + 2;
  const fila = (etiqueta: string, valor: string): string =>
    `  ${etiqueta.padEnd(ancho)}${valor}`;

  const lineas = [
    "Conexión con Hermes",
    `  configuración   ${configPath}`,
    "",
    fila("Hermes instalado", marca(estado.binaryWorks)),
    fila("archivo de configuración", marca(estado.configExists)),
    fila(`entrada \`${request.name}\` declarada`, marca(estado.declared)),
  ];

  if (estado.declared) {
    lineas.push(
      fila("apunta a este proyecto", marca(estado.pointsHere)),
      `    declara   ${estado.declaredRoot ?? "(no se pudo leer)"}`,
      `    el CLI    ${request.root}`,
    );
  }

  // El siguiente paso, y solo el que hace falta. Un diagnóstico que lista todo lo
  // que podría estar mal obliga a leerlo entero para encontrar lo único que sí.
  // El comando que se sugiere lleva el nombre puesto: sin él, alguien con dos
  // proyectos copiaría el consejo, escribiría la entrada `valmen` y volvería a
  // este mismo diagnóstico sin entender por qué.
  const conectar =
    request.name === HERMES_SERVER_ID
      ? "valmen hermes connect"
      : `valmen hermes connect --name ${request.name}`;

  lineas.push("");
  if (!estado.configExists || !estado.declared) {
    lineas.push("Falta declarar el servidor:", `    ${conectar}`);
  } else if (!estado.pointsHere) {
    lineas.push(
      "La entrada declarada apunta a otro proyecto. Hermes es global: cada",
      "proyecto necesita su propia entrada, con su propio nombre.",
      `    valmen hermes connect --name ${request.name}-${basenameSeguro(request.root)}`,
    );
  } else if (!estado.binaryWorks) {
    lineas.push(
      "La configuración está lista, pero el binario `hermes` no responde.",
      "Instálalo o revísalo: hasta entonces la entrada no la lee nadie.",
    );
  } else {
    lineas.push(
      "Todo en orden. Para que Hermes vea la entrada en una sesión abierta:",
      "    /reload-mcp",
    );
  }

  return ok(lineas.join("\n") + "\n");
}

/** El último segmento de la ruta, para sugerir un nombre de entrada. */
function basenameSeguro(ruta: string): string {
  const partes = ruta.split(/[/\\]/).filter((p) => p !== "");
  return (partes[partes.length - 1] ?? "proyecto").toLowerCase();
}

/** La escritura. */
export function hermesConnect(request: HermesRequest): CommandResult {
  const configPath = hermesConfigPath();
  const entry = entryFor(request);
  const bloque = hermesBlock(entry);
  const instalado = request.instalado ?? hermesBinaryWorks;

  if (!request.force && !instalado() && !existsSync(configPath)) {
    return falla(
      "No parece haber Hermes instalado: no responde `hermes --version` y no existe\n" +
        `${configPath}.\n\n` +
        "Escribir la configuración de un programa que no está deja un archivo que\n" +
        "nadie lee y un diagnóstico que dice que todo está bien. Instálalo primero,\n" +
        "o insiste con --force si sabes lo que haces.\n\n" +
        "Cuando lo tengas, esto declara lo mismo por su CLI:\n" +
        `  ${hermesAddCommand(entry)}\n`,
    );
  }

  const fusion = mergeHermesConfig(readIfExists(configPath), bloque, request.name);

  if (request.dryRun) {
    return ok(
      [
        `Escribiría en ${configPath}`,
        `  ${fusion.note}`,
        "",
        "El bloque:",
        "",
        bloque.trimEnd(),
        "",
      ].join("\n") + "\n",
    );
  }

  // La skill se instala **antes** del corte por «sin cambios», y el orden
  // importa: la entrada MCP y la skill son dos cosas distintas, y si la segunda
  // dependiera de que la primera fuera nueva, un proyecto ya declarado nunca
  // recibiría la skill —ni después de una versión que la agregue—.
  // Las dos cosas se calculan **antes** del corte por «sin cambios», y el orden
  // importa: son hechos sobre el proyecto y el perfil, no sobre el archivo de
  // configuración. Cuando vivían solo en el camino que escribe, una segunda
  // conexión —o una con la entrada ya declarada— no decía ni que la skill se
  // había instalado ni que faltaba proyectar las del proyecto.
  const skill = instalarSkill(request.force);
  const skills = pasoDeSkills(request.root);

  if (!fusion.changed) {
    return ok(
      [
        `Sin cambios: ${fusion.note}`,
        `  archivo  ${configPath}`,
        ...skill.lineas,
        ...skills,
        "",
      ].join("\n") + "\n",
    );
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, fusion.content, "utf8");

  return ok(
    [
      "Hermes — configuración global",
      `  archivo      ${configPath}`,
      `  ${fusion.note}`,
      "",
      `  raíz         ${request.root}`,
      `  entrada      ${request.name}`,
      "",
      "Comprueba cómo quedó:",
      "    valmen hermes status",
      "",
      "En una sesión de Hermes ya abierta, `/reload-mcp` la carga sin reiniciar.",
      "",
      "Si prefieres su asistente, o quieres elegir qué herramientas ve el celular:",
      `    ${hermesAddCommand(entry)}`,
      `    hermes mcp configure ${request.name}`,
      "",
      "Y si tienes la app de escritorio abierta, esto hace lo mismo con confirmación:",
      `    ${hermesDeepLink(entry)}`,
      ...skill.lineas,
      ...skills,
      "",
    ].join("\n") + "\n",
  );
}

/**
 * Escribe la skill del harness en el directorio global de Hermes.
 *
 * Es global y no del proyecto a propósito: describe cómo se usa **el harness**,
 * que es el mismo en todos, mientras que las skills del proyecto —las que
 * `valmen sync` proyecta a `.agents/skills/`— describen cómo se trabaja en uno.
 *
 * **No pisa lo que ya está.** Si el archivo existe y difiere, lo más probable es
 * que alguien lo haya editado para su caso, y reemplazarlo en silencio le borraría
 * el trabajo; si difiere porque el harness cambió, se dice y se ofrece `--force`.
 * La comparación es de contenido y no de fecha: dos instalaciones seguidas del
 * mismo harness dejan el archivo idéntico y la segunda no tiene nada que hacer.
 */
function instalarSkill(forzar: boolean): { readonly lineas: readonly string[] } {
  const ruta = hermesSkillPath();
  const contenido = hermesSkill();
  const existente = readIfExists(ruta);

  if (existente === contenido) {
    return { lineas: ["", `  skill        ${ruta} (ya estaba al día)`] };
  }

  if (existente !== null && !forzar) {
    return {
      lineas: [
        "",
        `  skill        ${ruta}`,
        "               ya existía y es distinta; no se tocó.",
        "               Para reemplazarla por la del harness: valmen hermes connect --force",
      ],
    };
  }

  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido, "utf8");
  return {
    lineas: [
      "",
      `  skill        ${ruta}`,
      existente === null
        ? "               es la que le enseña al celular cómo se trabaja acá."
        : "               reemplazada por la del harness (--force).",
    ],
  };
}

/** Lo que hace falta para decidir un gate con un código. */
export interface DecideByCodeRequest {
  readonly paths: RegistryPaths;
  readonly code: string;
  readonly decision: "approve" | "reject";
  /** Quién decide. Va al recibo: una decisión sin responsable no es auditable. */
  readonly actor: string;
  readonly reason: string;
  readonly secret: string;
  readonly now: Date;
}

/** El canal que se registra en el recibo cuando la decisión vino de un código. */
export const CANAL_REMOTO = "hermes-celular";

/**
 * Decide un gate a partir del código que llegó al celular.
 *
 * Es la vuelta del puente, y la parte que hace que el token sirva para algo. El
 * camino es largo a propósito —resolver el código, verificar la firma, comprobar
 * que el recibo siga siendo el vigente, comparar el hash del estado y recién ahí
 * registrar— porque **cada paso tapa un agujero distinto**:
 *
 * - La firma impide que alguien invente un token o le cambie el sujeto.
 * - La vigencia impide que una notificación de la semana pasada decida hoy.
 * - El recibo vigente impide aprobar un artefacto que ya se volvió a evaluar.
 * - **El hash del estado impide lo más caro de todo**: aprobar un ticket que
 *   cambió después de que el evaluador lo miró. El veredicto que la persona leyó
 *   en el celular describe un texto que ya no es el que está en disco, así que su
 *   aprobación sería de otra cosa. Sin esta comprobación, el recibo registraría
 *   como decisión humana algo que ninguna persona decidió sobre ese artefacto.
 *
 * La decisión la registra `recordHumanDecision`, que es **la misma función que
 * usa el botón de Mission Control**. Si este camino escribiera el recibo por su
 * cuenta, habría dos formas de aprobar y el día que divergieran el recibo de una
 * no describiría a la otra.
 */
export function decideByCode(request: DecideByCodeRequest): CommandResult {
  const resuelto = resolveApprovalCode(request.paths, request.code, request.now);
  if (!resuelto.ok) return falla(resuelto.refusal);

  const verificado = verifyApproval(request.secret, resuelto.pending.token, request.now);
  if (!verificado.ok) {
    return falla(
      `El token del código ${resuelto.pending.code} no sirve: ${verificado.detail}.`,
    );
  }
  const claims = verificado.claims;

  const ticket = findTicket(request.paths, claims.ticket);
  if (ticket === undefined) {
    return falla(`El ticket ${claims.ticket} ya no está en el registro.`);
  }

  const vigentes = currentReceipts(readReceipts(request.paths, claims.ticket));
  const recibo = vigentes.find((r) => r.id === claims.receipt);
  if (recibo === undefined) {
    // Un recibo no desaparece del registro —es append-only—, así que llegar acá
    // significa que el ticket se reescribió por fuera del motor. Se dice tal cual
    // en vez de inventar una explicación.
    return falla(
      `El recibo ${claims.receipt} que autoriza este código no está en el registro ` +
        `de ${claims.ticket}.`,
    );
  }

  // El hash del estado actual, con las mismas dos funciones que usa la pantalla
  // para marcar un recibo como obsoleto. Una segunda forma de calcularlo daría un
  // hash distinto y el token nunca validaría —o peor, validaría siempre—.
  let actual: string;
  try {
    actual = hashState(buildGateState(ticket.text));
  } catch (caught) {
    return falla(
      `El ticket ${claims.ticket} no se puede leer, así que no se puede comprobar ` +
        `que sea el mismo que se notificó: ${caught instanceof Error ? caught.message : String(caught)}`,
    );
  }

  if (actual !== claims.stateHash) {
    return falla(
      `El ticket ${claims.ticket} cambió desde que se notificó este gate.\n\n` +
        "El veredicto que leíste describe un texto que ya no es el que está en\n" +
        "disco, así que aprobarlo sería aprobar otra cosa. Volvé a evaluar la\n" +
        "compuerta y decidí sobre el recibo nuevo:\n" +
        `  valmen gate --id ${claims.ticket} --gate ${claims.gate}\n\n` +
        "El código queda sin usar hasta que venza.",
    );
  }

  const resultado = recordHumanDecision(request.paths, claims.ticket, claims.receipt, {
    decision: request.decision,
    actor: request.actor,
    reason: request.reason,
    // El canal queda en el recibo: dentro de seis meses, «aprobado desde el
    // celular» y «aprobado en la pantalla» son dos hechos distintos, y el recibo
    // es el único sitio donde esa diferencia se puede conservar.
    channel: CANAL_REMOTO,
  });

  if (!resultado.ok) return falla(resultado.error);

  // Se consume **después** de que la decisión quedó registrada. Al revés, un
  // fallo al registrar dejaría el código quemado y la decisión sin tomar, que es
  // la peor combinación: la persona cree que decidió y el registro dice que no.
  appendApproval(request.paths, {
    kind: "approval-consumed",
    code: resuelto.pending.code,
    consumedAt: request.now.toISOString(),
    actor: request.actor,
    decision: request.decision,
  });

  const lineas = [
    `${request.decision === "approve" ? "Aprobado" : "Rechazado"} desde el celular.`,
    `  ticket     ${claims.ticket}`,
    `  compuerta  ${claims.gate}`,
    `  recibo     ${claims.receipt}`,
    `  por        ${request.actor}`,
    `  código     ${resuelto.pending.code} (consumido)`,
  ];
  if (resultado.error !== "") lineas.push("", `Aviso: ${resultado.error}`);
  return ok(lineas.join("\n") + "\n");
}

/** Lo que hace falta para notificar todo lo que espera una decisión. */
export interface NotifyPendingRequest {
  readonly paths: RegistryPaths;
  readonly config: HermesConfig;
  readonly secret: string;
  readonly now: Date;
  /** Pisa al destino de la configuración. */
  readonly to?: string | undefined;
  readonly runner?: CommandRunner | undefined;
  readonly json?: boolean | undefined;
}

/**
 * Cuánto se espera antes de reintentar un aviso que no salió.
 *
 * Sin esta espera, un Hermes caído y un cron cada cinco minutos dejan
 * doscientos ochenta y ocho renglones por día en el registro de aprobaciones y
 * doscientos ochenta y ocho intentos de proceso. La hora es un compromiso: un
 * canal caído se reintenta sin intervención, y un canal que vuelve en cinco
 * minutos no espera a la próxima corrida manual.
 */
const ESPERA_REINTENTO_MS = 60 * 60 * 1000;

/**
 * Qué gates esperan una decisión y todavía no se avisaron.
 *
 * «Espera una decisión» son dos condiciones del recibo: está escalado a una
 * persona y no tiene decisión humana. «Todavía no se avisó» son dos condiciones
 * más, y las dos importan:
 *
 * - No hay un token **vivo** para ese recibo. El registro de aprobaciones es la
 *   prueba de que ya se avisó: un contador aparte sería un segundo estado que se
 *   puede desincronizar del primero, y el día que se desincronice el harness manda
 *   el mismo aviso dos veces o ninguna.
 * - Si el último intento **no salió**, pasó suficiente tiempo. Un token emitido
 *   cuyo mensaje nunca llegó no cuenta como aviso —si contara, un reintento con
 *   Hermes ya sano saltearía el gate en silencio— pero tampoco se reintenta en
 *   cada corrida.
 *
 * Con las dos, esto se puede correr seguido sin llenar el celular de nadie.
 */
/** Lo que el puente tiene para avisar, de las dos clases que hay. */
export type PendienteDeAvisar =
  | { readonly kind: "gate"; readonly ticket: string; readonly receipt: string }
  | {
      readonly kind: "proceso";
      readonly runId: string;
      readonly processId: string;
      readonly step: string;
    };

export function pendientesDeAvisar(paths: RegistryPaths, now: Date): PendienteDeAvisar[] {
  const porRecibo = new Map<string, PendingApproval[]>();
  for (const p of pendingApprovals(paths, now)) {
    const clave = `${p.ticket}:${p.receipt}`;
    porRecibo.set(clave, [...(porRecibo.get(clave) ?? []), p]);
  }

  const salida: PendienteDeAvisar[] = [];
  for (const fila of listTickets(paths)) {
    for (const recibo of currentReceipts(readReceipts(paths, fila.id))) {
      if (recibo.escalatedTo !== "human" || recibo.humanDecision !== null) continue;

      const previos = porRecibo.get(`${fila.id}:${recibo.id}`) ?? [];
      if (previos.some((p) => p.awaitingDecision)) continue;

      const ultimo = ultimoIntento(paths, fila.id, recibo.id);
      if (
        ultimo !== null &&
        now.getTime() - new Date(ultimo).getTime() < ESPERA_REINTENTO_MS
      ) {
        continue;
      }

      salida.push({ kind: "gate", ticket: fila.id, receipt: recibo.id });
    }
  }

  // Y las corridas detenidas, que son la otra forma de que algo espere a una
  // persona. La prueba de que ya se avisó es el registro, igual que con los
  // gates: una corrida sigue detenida hasta que alguien la retoma, así que sin
  // esto un cron la avisaría en cada vuelta.
  const avisadas = corridasAvisadas(paths);
  for (const corrida of waitingRuns(paths.root)) {
    if (avisadas.has(corrida.runId)) continue;
    salida.push({
      kind: "proceso",
      runId: corrida.runId,
      processId: corrida.processId,
      step: corrida.pendingStep ?? "(sin paso)",
    });
  }

  return salida;
}

/** Los avisos que salieron y todavía esperan una decisión. */
function avisosEntregados(paths: RegistryPaths, now: Date): number {
  return pendingApprovals(paths, now).filter((p) => p.awaitingDecision).length;
}

/**
 * Los intentos cuyo mensaje no salió y siguen vigentes.
 *
 * Se cuentan aparte porque son lo contrario de un aviso: hay un gate esperando y
 * el canal no lo entregó. Un resumen que los sumara con los entregados diría que
 * todo está avisado justo cuando nada lo está.
 */
function avisosSinEntregar(paths: RegistryPaths, now: Date): number {
  return pendingApprovals(paths, now).filter(
    (p) => p.undelivered && !p.expired && !p.consumed,
  ).length;
}

/** La primera línea de un mensaje, para un resumen de una línea por ítem. */
function primeraLinea(texto: string): string {
  return texto.split("\n")[0]?.trim() ?? "";
}

/**
 * Avisa de todos los gates que esperan una decisión.
 *
 * Existe porque el momento en que un gate se escala no es uno solo: lo puede
 * escalar el CLI, el servidor MCP o el botón de la pantalla, y enganchar el aviso
 * en los tres sería tres sitios donde olvidarlo. Acá hay uno, y funciona sin
 * importar quién evaluó.
 *
 * Se corre a mano, desde un cron, o desde un gancho de Hermes. Y se puede correr
 * seguido: lo que ya se avisó no se vuelve a avisar, porque el token vivo es la
 * prueba de que salió.
 */
export function hermesNotifyPendientes(request: NotifyPendingRequest): CommandResult {
  if (!request.config.enabled) {
    // Apagado por defecto, y decirlo no es un error: es la respuesta. Una
    // herramienta que empieza a mandar mensajes porque alguien actualizó una
    // versión es una herramienta que se desinstala.
    return ok(
      "El puente con Hermes está apagado, así que no se avisó a nadie.\n\n" +
        "Para encenderlo, en `.valmen/config.yaml`:\n\n" +
        "  hermes:\n" +
        "    enabled: true\n" +
        "    notify:\n" +
        "      gate: telegram\n",
    );
  }

  const to = request.to ?? request.config.gateTarget;
  if (to.trim() === "") {
    return falla(
      "No hay destino para los avisos.\n\n" +
        "Se declara en `.valmen/config.yaml`:\n\n" +
        "  hermes:\n" +
        "    notify:\n" +
        "      gate: telegram\n\n" +
        "O se pasa en esta corrida con `--to telegram`. Los que tengas\n" +
        "configurados en Hermes se listan con `hermes send --list`.\n",
    );
  }

  const pendientes = pendientesDeAvisar(request.paths, request.now);
  const notificados: string[] = [];
  // Dos listas y no una: «no se puede avisar» es el techo de riesgo —una decisión
  // que por diseño no se toma a distancia— y «no se pudo entregar» es el canal
  // caído. Meterlas juntas haría que un Hermes roto se leyera como una regla de
  // seguridad, y son cosas que se arreglan de maneras distintas.
  const noAvisables: { ticket: string; motivo: string }[] = [];
  const fallidos: { que: string; motivo: string }[] = [];

  for (const pendiente of pendientes) {
    if (pendiente.kind === "proceso") {
      const corrida = waitingRuns(request.paths.root).find(
        (c) => c.runId === pendiente.runId,
      );
      const entrega = hermesSendChannel({
        target: to,
        ...(request.runner === undefined ? {} : { runner: request.runner }),
      }).notify(
        renderProcessNotification({
          processId: pendiente.processId,
          runId: pendiente.runId,
          step: pendiente.step,
          since: corrida?.updatedAt ?? request.now.toISOString(),
        }),
      );

      if (!entrega.delivered) {
        // No se anota: un aviso que no salió no puede contar como avisado, así
        // que la próxima corrida lo reintenta.
        fallidos.push({
          que: `${pendiente.processId} · ${pendiente.step}`,
          motivo: entrega.detail,
        });
        continue;
      }

      // Se anota **después** de que salió: un aviso que no llegó no puede contar
      // como avisado, o el reintento lo saltearía en silencio.
      appendApproval(request.paths, {
        kind: "process-notice",
        runId: pendiente.runId,
        processId: pendiente.processId,
        step: pendiente.step,
        notifiedAt: request.now.toISOString(),
      });
      notificados.push(`${pendiente.processId} · ${pendiente.step}`);
      continue;
    }

    const { ticket, receipt } = pendiente;
    const r = hermesNotify({
      paths: request.paths,
      ticketId: ticket,
      receiptId: receipt,
      to,
      secret: request.secret,
      now: request.now,
      ttlHours: request.config.tokenHours,
      ...(request.runner === undefined ? {} : { runner: request.runner }),
    });

    if (r.exitCode === 0) {
      notificados.push(`${ticket} · ${receipt}`);
      continue;
    }

    // La negativa del techo no es un fallo de esta corrida: es un gate que no se
    // decide a distancia y va a seguir sin poder decidirse. Se acumula con su
    // motivo para decirlo una vez al final, en vez de repetir el mismo párrafo
    // por cada ticket crítico del registro.
    noAvisables.push({ ticket: `${ticket} · ${receipt}`, motivo: primeraLinea(r.stderr) });
  }

  const entregados = avisosEntregados(request.paths, request.now);
  const sinEntregar = avisosSinEntregar(request.paths, request.now) + fallidos.length;

  if (request.json) {
    return ok(
      JSON.stringify({ notificados, noAvisables, entregados, sinEntregar }, null, 2) + "\n",
    );
  }

  const lineas = [
    "Avisos de gates pendientes",
    `  destino                   ${to}`,
    `  avisados ahora            ${notificados.length}`,
    `  entregados sin decidir    ${entregados}`,
    `  intentos sin entregar     ${sinEntregar}`,
    `  no avisables              ${noAvisables.length}`,
    "",
  ];

  if (sinEntregar > 0) {
    // Lo más importante del informe: hay gates esperando y el canal no los
    // entregó. Sin esta línea, el resumen diría «no hay nada pendiente» con el
    // canal roto, que es la peor mentira que puede decir un diagnóstico.
    lineas.push(
      "⚠ Hay avisos que no salieron. El canal no está entregando:",
      `    valmen hermes test --to ${to}`,
      "Se reintentan solos una vez por hora.",
      "",
    );
  }

  if (notificados.length > 0) {
    lineas.push("Avisados:", ...notificados.map((n) => `  ${n}`), "");
  }

  if (noAvisables.length > 0) {
    lineas.push(
      "Estos no se avisan a distancia, y no es un fallo de esta corrida:",
      ...noAvisables.map((n) => `  ${n.ticket} — ${n.motivo}`),
      "",
      "Se deciden donde siempre: en Mission Control o con `valmen gate-decide`.",
      "",
    );
  }

  if (fallidos.length > 0) {
    lineas.push(
      "Estos no se pudieron entregar; se reintentan en la próxima corrida:",
      ...fallidos.map((n) => `  ${n.que} — ${n.motivo}`),
      "",
    );
  }

  if (
    notificados.length === 0 &&
    noAvisables.length === 0 &&
    entregados === 0 &&
    sinEntregar === 0
  ) {
    lineas.push("No hay nada esperando una decisión.", "");
  }

  return ok(lineas.join("\n"));
}

/** La configuración de Hermes del proyecto, o la de por defecto si no hay archivo. */
export function configDeHermes(paths: RegistryPaths): HermesConfig {
  const texto = readIfExists(join(paths.root, ".valmen", "config.yaml"));
  return readHermesConfig(texto === null ? {} : parseConfig(texto));
}

/**
 * El paso que falta para que Hermes cargue las skills del proyecto.
 *
 * Hermes busca skills project-local en `<raíz>/.agents/skills/` —la convención
 * cross-tool, que es a donde `valmen sync` las proyecta— y las carga con la
 * precedencia más alta: aparecen en su índice, se cargan solas cuando vienen al
 * caso y quedan como `/comando`. Es más que lo que da el MCP, donde el agente
 * tiene que saber que puede pedirlas.
 *
 * Pero Hermes **no las carga de un repositorio clonado sin permiso**, y hace bien:
 * una skill es un procedimiento que el agente sigue, así que aceptarlas de
 * cualquier repo es aceptar instrucciones de cualquier repo. La confianza se da
 * una vez por repositorio con `hermes skills trust`.
 *
 * Este comando la **dice y no la ejecuta**. Es exactamente la clase de decisión
 * que un instalador no puede tomar por la persona: el harness acaba de escribir en
 * el proyecto, y encadenar eso con «y ahora confiá en las instrucciones que hay
 * adentro» es la forma de que un `git clone` se convierta en ejecución de código
 * ajeno.
 */
function pasoDeSkills(root: string): readonly string[] {
  const skills = readSkills(root);
  if (skills.length === 0) return [];

  // Las skills viven en `.valmen/skills/` y Hermes lee la **proyección**, que es un
  // artefacto generado y por lo tanto no está en un clon recién bajado. Decir
  // «confiá en el repositorio» sin comprobarlo manda a un comando que contesta
  // «no hay ninguna skill de proyecto» —y el aviso de Hermes nombra `.hermes/` y
  // `.agents/`, no la fuente, así que tampoco explica dónde mirar—.
  //
  // Pasó de verdad la primera vez que se conectó un proyecto: la confianza quedó
  // registrada, las ocho skills no aparecieron, y el motivo estaba a un `sync` de
  // distancia. Este comando no lo corre solo —escribe en el proyecto, y eso no lo
  // hace un instalador por su cuenta— pero tiene que decir que falta.
  if (!existsSync(join(root, ".agents", "skills"))) {
    return [
      "",
      `Este proyecto declara ${skills.length} skill(s), pero su proyección a`,
      ".agents/skills/ todavía no existe, así que `hermes skills trust` no va a",
      "encontrar ninguna. Corré primero:",
      "",
      "    valmen sync",
    ];
  }

  return [
    "",
    "Las skills de este proyecto van a `.agents/skills/`, que Hermes lee como",
    "skills project-local. Para que las cargue hay que confiar en el repositorio,",
    "una vez:",
    "",
    `    hermes skills trust ${root}`,
    "",
    "No lo hace este comando a propósito: una skill es un procedimiento que el",
    "agente sigue, y aceptarlas de un repositorio es una decisión de la persona.",
    "Se ven en el índice de Hermes etiquetadas como [project].",
  ];
}

/** Lo que hace falta para armar y mandar el parte. */
export interface BriefRequest {
  readonly paths: RegistryPaths;
  readonly config: HermesConfig;
  readonly now: Date;
  readonly to?: string | undefined;
  readonly runner?: CommandRunner | undefined;
  readonly json?: boolean | undefined;
  /** Cuántos días hacia atrás se cuentan los cierres. Por defecto, 7. */
  readonly dias?: number | undefined;
}

/**
 * Junta lo que el parte cuenta.
 *
 * Se separa de mandarlo para poder verlo sin mandarlo, que es lo primero que
 * alguien quiere hacer con un mensaje automático: leerlo antes de que llegue al
 * celular de nadie.
 */
export function armarParte(request: BriefRequest): BriefInput {
  const dias = request.dias ?? 7;
  const desde = new Date(request.now.getTime() - dias * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // Los gates que esperan, con su código si sigue vivo. Se listan **todos** los
  // que esperan una decisión, se hayan avisado o no: el parte es el panorama, y
  // esconder un gate porque su aviso no salió sería justo lo contrario de lo que
  // hace falta saber.
  const vivos = new Map(
    pendingApprovals(request.paths, request.now)
      .filter((p) => !p.consumed && !p.expired)
      .map((p) => [`${p.ticket}:${p.receipt}`, p.code]),
  );

  const gates: BriefGate[] = [];
  const enCurso: { id: string; estado: string }[] = [];
  const cerrados: string[] = [];

  for (const fila of listTickets(request.paths)) {
    if (fila.closedOn === null) {
      enCurso.push({ id: fila.id, estado: fila.workflowStatus });
    } else if (fila.closedOn >= desde) {
      cerrados.push(fila.id);
    }

    for (const recibo of currentReceipts(readReceipts(request.paths, fila.id))) {
      if (recibo.escalatedTo !== "human" || recibo.humanDecision !== null) continue;
      gates.push({
        ticket: fila.id,
        gate: recibo.gate,
        code: vivos.get(`${fila.id}:${recibo.id}`) ?? null,
      });
    }
  }

  // El consumo se calcula aparte y tolerando el fallo. `usageReport` recorre el
  // registro leyendo cada ticket, y un ticket malformado lo hace fallar entero
  // —igual que a `valmen report` y a `valmen usage value`—. En una terminal eso
  // se arregla; en un mensaje que sale a las ocho de la mañana, el parte no
  // llegaría y nadie sabría por qué. Se pierde la línea del consumo y se dice.
  let consumo: { evaluaciones: number; costeUsd: number; byCode: number } | null = null;
  let notaConsumo: string | null = null;
  try {
    const informe = usageReport(request.paths, { desde });
    consumo = {
      evaluaciones: informe.evaluations,
      costeUsd: informe.costUsd,
      byCode: informe.byCode,
    };
  } catch (caught) {
    notaConsumo = caught instanceof Error ? caught.message : String(caught);
  }

  const config = readIfExists(join(request.paths.root, ".valmen", "config.yaml"));
  const nombre = config === null ? "" : readString(parseConfig(config), "name", "");

  return {
    proyecto: nombre === "" ? basenameSeguro(request.paths.root) : nombre,
    fecha: request.now.toISOString().slice(0, 10),
    gates,
    corridas: waitingRuns(request.paths.root).map((corrida) => ({
      processId: corrida.processId,
      step: corrida.pendingStep ?? "(sin paso)",
      since: corrida.updatedAt,
    })),
    enCurso,
    cerrados,
    diasCerrados: dias,
    evaluaciones: consumo?.evaluaciones ?? null,
    costeUsd: consumo?.costeUsd ?? null,
    decididasEnCodigo: consumo?.byCode ?? null,
    notaConsumo,
  };
}

/**
 * El parte diario: lo que espera, lo que se detuvo y lo que se cerró.
 *
 * Existe porque el reporte del harness es una página, y una página hay que
 * acordarse de abrirla. El parte llega. Se corre desde un cron de Hermes, desde un
 * temporizador del sistema, o a mano cuando alguien quiere el panorama —y sin
 * destino se imprime, que es como se revisa antes de que le llegue a nadie—.
 */
export function hermesBrief(request: BriefRequest): CommandResult {
  const parte = armarParte(request);

  if (request.json === true) return ok(JSON.stringify(parte, null, 2) + "\n");

  const cuerpo = renderBrief(parte).body;
  const to = request.to ?? request.config.gateTarget;

  if (to.trim() === "") {
    // Sin destino se muestra en vez de fallar: el parte es útil en la terminal, y
    // negarse a mostrarlo por no haber configurado un canal sería convertir la
    // falta de una comodidad en la falta de la información.
    return ok(
      `${cuerpo}\n\nPara que además llegue al celular, en .valmen/config.yaml:\n` +
        "  hermes:\n    notify:\n      gate: telegram\n",
    );
  }

  const canal = hermesSendChannel({
    target: to,
    ...(request.runner === undefined ? {} : { runner: request.runner }),
  });
  const entrega = canal.notify(renderBrief(parte));

  if (!entrega.delivered) {
    // El cuerpo se imprime igual: el parte ya está armado, y perderlo porque el
    // canal falló obligaría a recalcularlo para nada.
    return falla(`No se pudo mandar el parte a ${to}.\n  ${entrega.detail}\n\n${cuerpo}\n`);
  }

  return ok(`Parte enviado a ${to}.\n  ${entrega.detail}\n\n${cuerpo}\n`);
}

/** El punto de entrada del comando. */
export function runHermes(request: HermesRequest): CommandResult {
  if (request.action === "connect") return hermesConnect(request);
  if (request.action === "test") return hermesTest(request);
  return hermesStatus(request);
}

/**
 * El secreto con el que se firman los tokens de aprobación.
 *
 * Dos fuentes y en este orden, por el mismo motivo que las claves de proveedor:
 * la variable de entorno permite una prueba puntual sin escribir el secreto en
 * disco, y el archivo de credenciales es lo que persiste. **Nunca** se genera uno
 * solo ni se guarda dentro del proyecto: un secreto que el harness crea por su
 * cuenta y escribe en el repositorio es un secreto que termina commiteado, y este
 * es el que autoriza aprobar gates.
 *
 * El bloque se llama `aprobacion` y el campo `secret`, en el mismo archivo que ya
 * usa el resto del harness —`~/.valmen/.credentials.yaml`—, para que no haya dos
 * sitios donde buscar credenciales.
 */
export function approvalSecret(credentialsFile?: string): string | null {
  const env = process.env["VALMEN_APPROVAL_SECRET"];
  if (env !== undefined && env.trim() !== "") return env.trim();

  const texto = readIfExists(credentialsFile ?? credentialsPath());
  if (texto === null) return null;
  const bloque = blockOf(texto, "aprobacion");
  return bloque === null ? null : fieldOf(bloque, "secret");
}

/** Cómo crear el secreto, para poder decirlo en el error. */
export const COMO_CREAR_EL_SECRETO =
  '  printf \'aprobacion:\\n  secret: "%s"\\n\' "$(openssl rand -base64 32)" \\\n' +
  "    >> ~/.valmen/.credentials.yaml\n" +
  "  # o, para una prueba puntual:\n" +
  '  export VALMEN_APPROVAL_SECRET="$(openssl rand -base64 32)"';

/**
 * Notifica un gate y emite el token con el que se decide desde el celular.
 *
 * El orden importa y es la mitad del diseño: **primero se comprueba el techo de
 * riesgo y después se emite**. Si se notificara primero, el mensaje ya estaría en
 * el celular de alguien ofreciendo una decisión que el motor no va a aceptar, y
 * la negativa llegaría cuando la persona ya contestó —que es la peor forma de
 * decir que no a algo—.
 */
export function hermesNotify(request: NotifyRequest): CommandResult {
  const ticket = findTicket(request.paths, request.ticketId);
  if (ticket === undefined) {
    return falla(`No existe el ticket ${request.ticketId} en este proyecto.`);
  }

  const recibos = currentReceipts(readReceipts(request.paths, request.ticketId));
  const recibo = recibos.find((r) => r.id === request.receiptId);
  if (recibo === undefined) {
    return falla(
      `No hay un recibo vigente ${request.receiptId} para ${request.ticketId}.\n` +
        `Los vigentes: ${recibos.map((r) => r.id).join(", ") || "ninguno"}.`,
    );
  }

  if (recibo.escalatedTo !== "human") {
    return falla(
      `El recibo ${recibo.id} no está escalado a una persona: su veredicto fue ` +
        `\`${recibo.outcome}\`.\n` +
        "Notificar una decisión que nadie tiene que tomar es ruido, y el ruido es lo\n" +
        "que hace que se dejen de leer las notificaciones que sí importan.",
    );
  }

  // Los datos del sujeto salen del ticket y no del recibo: el recibo guarda el
  // hash de lo que vio el evaluador, y el techo se decide sobre el ticket tal como
  // está ahora. Si alguien subió el riesgo después de evaluar, el techo lo ve —y
  // el hash del token delata, al decidir, que el artefacto cambió—.
  const parsed = parseTicket(
    readFileSync(join(request.paths.root, ticket.relativePath), "utf8"),
  );
  const ceiling: CeilingInput = {
    subjectType: "ticket",
    riskLevel: String(parsed.fields["risk_level"] ?? "normal"),
    impacts: declaredImpactIds(parsed),
  };

  const emision = mintApproval({
    secret: request.secret,
    gate: recibo.gate,
    ticket: request.ticketId,
    receipt: recibo.id,
    stateHash: recibo.stateHash,
    revision: recibo.subject.revision,
    ceiling,
    now: request.now,
    ...(request.ttlHours === undefined ? {} : { ttlHours: request.ttlHours }),
  });

  if (!emision.ok) {
    return falla(
      `Este gate no se puede decidir a distancia: ${emision.refusal}.\n\n` +
        "La decisión queda donde siempre: en Mission Control o en\n" +
        `  valmen gate-decide --id ${request.ticketId} --receipt ${recibo.id} ` +
        "--decision approve --actor <nombre>\n",
    );
  }

  appendApproval(request.paths, emision.issued);

  const canal = hermesSendChannel({
    target: request.to,
    ...(request.runner === undefined ? {} : { runner: request.runner }),
  });
  const entrega = canal.notify(
    renderGateNotification({
      ticket: request.ticketId,
      title: String(parsed.fields["title"] ?? ""),
      gate: recibo.gate,
      module: String(parsed.fields["module"] ?? ""),
      riskLevel: ceiling.riskLevel,
      outcome: recibo.outcome,
      reason: recibo.reason,
      propositions: recibo.propositions.map((p) => ({
        id: p.id,
        ...(p.description === undefined ? {} : { description: p.description }),
        value: p.value,
        weight: p.weight,
      })),
      costUsd: recibo.usage?.costUsd ?? null,
      code: emision.issued.code,
      expiresAt: emision.issued.expiresAt,
    }),
  );

  if (!entrega.delivered) {
    // El token ya está emitido y en el registro: la notificación falló, pero la
    // decisión no se perdió. Se anota el intento fallido —para que un reintento
    // **no** saltee el gate creyendo que ya se avisó— y se dice el código igual,
    // porque quien está en la terminal puede usarlo o pasarlo a mano.
    appendApproval(request.paths, {
      kind: "approval-undelivered",
      code: emision.issued.code,
      attemptedAt: request.now.toISOString(),
      detail: entrega.detail,
    });

    return falla(
      `El token se emitió, pero el mensaje no salió.\n  ${entrega.detail}\n\n` +
        `  código   ${emision.issued.code}\n` +
        `  vale     hasta ${emision.issued.expiresAt}\n\n` +
        "Revisá el canal antes de confiar en que un gate llega al celular:\n" +
        `  valmen hermes test --to ${request.to}\n\n` +
        "El próximo `valmen hermes notify` lo vuelve a intentar, porque un aviso\n" +
        "que no salió no cuenta como aviso.\n",
    );
  }

  return ok(
    [
      "Gate notificado.",
      `  ticket     ${request.ticketId}`,
      `  compuerta  ${recibo.gate}`,
      `  destino    ${entrega.target}`,
      `  ${entrega.detail}`,
      "",
      `  código     ${emision.issued.code}`,
      `  vale       hasta ${emision.issued.expiresAt}`,
      "",
      "Una sola vez, y solo ese recibo: si el ticket cambia, el token deja de servir.",
      "",
    ].join("\n") + "\n",
  );
}

/**
 * La prueba de punta a punta.
 *
 * El primer fallo de una integración de mensajería es «no llegó», y desde adentro
 * de un gate eso no se distingue de «no había nada que notificar». Esto manda un
 * mensaje que la persona está mirando y separa las dos cosas de una vez. Es lo
 * primero que hay que correr después de conectar, y por eso el destino es
 * obligatorio: adivinarlo haría que la prueba pasara sin probar el destino que
 * usa el proyecto de verdad.
 */
export function hermesTest(request: HermesRequest): CommandResult {
  if (request.to === undefined) {
    return falla(
      "Falta el destino. `valmen hermes test --to telegram`.\n\n" +
        "Los que tengas configurados en Hermes:\n" +
        "    hermes send --list\n",
    );
  }

  const canal = hermesSendChannel({
    target: request.to,
    ...(request.runner === undefined ? {} : { runner: request.runner }),
  });
  const recibo = canal.notify(renderTestMessage(request.root, new Date()));

  if (!recibo.delivered) {
    return falla(`No se entregó a ${request.to}.\n  ${recibo.detail}\n`);
  }

  return ok(
    [
      "Mensaje de prueba enviado.",
      `  canal       ${recibo.channel}`,
      `  destino     ${recibo.target}`,
      `  ${recibo.detail}`,
      "",
      "Si no llegó, el problema está en Hermes y no en el harness:",
      `    hermes send --to ${request.to} "prueba directa"`,
      "",
    ].join("\n") + "\n",
  );
}

/** El nombre por defecto de la entrada. Se exporta para el CLI y para los tests. */
export { HERMES_SERVER_ID };
