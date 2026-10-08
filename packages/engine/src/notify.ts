/**
 * La costura de notificación: cómo sale un hecho del harness hacia una persona.
 *
 * El diseño está escrito desde antes de que existiera esta pieza
 * (`docs/06-CONTROL-APP.md` §5.5) y la conclusión a la que llega sigue siendo la
 * correcta: **el harness no integra mensajería**. Integrar Telegram, Slack y
 * WhatsApp por separado son veintiuna integraciones que mantener, y Hermes ya
 * resolvió veintiuna. Lo que hay que construir es la costura, y que sea
 * sustituible para que la dependencia no sea una condena.
 *
 * Tres decisiones de forma, cada una con su motivo:
 *
 * 1. **El canal recibe texto, no una plantilla.** Quien decide qué dice una
 *    notificación es el harness, que es el que sabe qué pasó; el canal decide
 *    cómo sale. Si el canal recibiera el hecho crudo, cada transporte tendría que
 *    saber redactar, y el día que se agregue un segundo canal las dos redacciones
 *    dirían cosas distintas.
 * 2. **`notify` devuelve un recibo y no lanza.** Que un mensaje no llegue no
 *    puede impedir que un gate se registre: la notificación es una comodidad, no
 *    un requisito del flujo, y un `throw` acá convertiría a Hermes en un punto
 *    único de fallo del harness entero. El recibo dice qué pasó, y quien llama
 *    decide si le importa.
 * 3. **El cuerpo va por entrada estándar, nunca por un argumento.** Un mensaje
 *    con saltos de línea y comillas dentro de `argv` es una inyección esperando:
 *    el día que el texto incluya el título de un ticket escrito por alguien, el
 *    argumento se parte y la notificación llega cortada —o ejecuta otra cosa—.
 */
import { spawnSync } from "node:child_process";

import { type ParteDeJornada } from "./journey-handoff.js";

/** Lo que se quiere notificar. */
export interface NotificationPayload {
  /** Una línea, para el encabezado del mensaje. */
  readonly subject: string;
  /** El cuerpo. Puede tener saltos de línea; no pasa por `argv`. */
  readonly body: string;
  /**
   * La identidad del hecho, para no notificar dos veces lo mismo.
   *
   * La usa el canal que sepa deduplicar. El de Hermes hoy no la usa —su
   * `deliver_only` tiene su propia idempotencia por identificador de entrega—,
   * pero viaja igual porque el día que se agregue un segundo canal que sí pueda
   * deduplicar, la información tiene que estar.
   */
  readonly key: string;
}

/** Qué pasó con la entrega. */
export interface DeliveryReceipt {
  readonly channel: string;
  readonly delivered: boolean;
  /** Qué pasó, en una línea, para el registro y para la pantalla. */
  readonly detail: string;
  readonly target?: string | undefined;
}

/** El contrato de un canal. */
export interface NotificationChannel {
  readonly id: string;
  notify(payload: NotificationPayload): DeliveryReceipt;
}

/**
 * Cómo se lanza un proceso.
 *
 * Es una costura y no una llamada directa por el mismo motivo que en `runGate`:
 * sin ella, probar el camino de «el canal entregó» exigiría tener Hermes
 * instalado y una plataforma configurada, así que el camino que importa —el que
 * dice si el mensaje salió— no se probaría nunca de forma determinista. El
 * default es el proceso de verdad.
 */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  input: string,
) => {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly failed: boolean;
};

/** El runner de verdad: un proceso que se lleva el cuerpo por `stdin`. */
export function spawnRunner(
  command: string,
  args: readonly string[],
  input: string,
): ReturnType<CommandRunner> {
  const r = spawnSync(command, [...args], {
    input,
    encoding: "utf8",
    // Un canal de mensajería que no responde no puede colgar el harness: el
    // tiempo de espera es parte del contrato, no un detalle de configuración.
    timeout: 30_000,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    failed: r.error !== undefined,
  };
}

/** Lo que necesita el canal de Hermes. */
export interface HermesSendOptions {
  /** El destino: `telegram`, `discord:#ops`, `telegram:-1001234567890`. */
  readonly target: string;
  /** El ejecutable. Se parametriza para poder probar sin Hermes instalado. */
  readonly command?: string | undefined;
  readonly runner?: CommandRunner | undefined;
}

/** El identificador del canal, que es el que se escribe en la configuración. */
export const HERMES_CHANNEL_ID = "hermes";

/**
 * El canal que delega en `hermes send`.
 *
 * `hermes send` es la pieza que hace que esto sean veinte líneas en vez de un
 * servidor HTTP: manda un mensaje a cualquier plataforma ya configurada, sin
 * agente y sin bucle de LLM, reusando las credenciales que la pasarela ya tiene.
 * No hay puerto que abrir, ni ruta que declarar, ni secreto que compartir, y si
 * Telegram ya funciona en Hermes, esto funciona.
 *
 * Los códigos de salida son el recibo: `0` entregó, `1` el destino rechazó, `2`
 * se usó mal. No hay que interpretar la salida para saber qué pasó.
 */
export function hermesSendChannel(opciones: HermesSendOptions): NotificationChannel {
  const command = opciones.command ?? "hermes";
  const runner = opciones.runner ?? spawnRunner;
  const target = opciones.target;

  return {
    id: HERMES_CHANNEL_ID,
    notify(payload: NotificationPayload): DeliveryReceipt {
      const args = [
        "send",
        "--to",
        target,
        // `--file -` fuerza la lectura por entrada estándar. Sin el `-`, `hermes`
        // la usa solo cuando no hay terminal, y esa condición no la controla este
        // proceso: un harness lanzado desde una terminal interactiva tendría un
        // `stdin` que es una terminal y el cuerpo se perdería en silencio.
        "--file",
        "-",
        "--subject",
        payload.subject,
        "--json",
      ];

      const r = runner(command, args, payload.body);

      if (r.failed) {
        return {
          channel: HERMES_CHANNEL_ID,
          delivered: false,
          target,
          detail: `no se pudo ejecutar \`${command}\`: puede que Hermes no esté instalado`,
        };
      }

      if (r.status === 0) {
        return {
          channel: HERMES_CHANNEL_ID,
          delivered: true,
          target,
          detail: `entregado a ${target}`,
        };
      }

      // El `stderr` de Hermes dice qué rechazó el destino —un chat que no existe,
      // un bot bloqueado, un token vencido— y es lo único que permite arreglarlo.
      // Se recorta porque una traza de Python entera en el registro de un gate no
      // ayuda a nadie, y se dice que se recortó.
      const motivo = (r.stderr.trim() || r.stdout.trim()).split("\n").slice(0, 3).join(" ");
      return {
        channel: HERMES_CHANNEL_ID,
        delivered: false,
        target,
        detail:
          r.status === 2
            ? `el destino "${target}" no es válido: ${motivo}`
            : `el destino rechazó el mensaje: ${motivo === "" ? "sin detalle" : motivo}`,
      };
    },
  };
}

/**
 * El mensaje de prueba.
 *
 * Existe porque el primer fallo de una integración de mensajería es «no llegó», y
 * desde adentro de un gate eso no se distingue de «no había nada que notificar».
 * Un comando que manda un mensaje que la persona está mirando separa las dos
 * cosas de una vez, y es lo primero que hay que correr al conectar.
 */
export function renderTestMessage(root: string, fecha: Date): NotificationPayload {
  return {
    key: "test",
    subject: "ValmenHarness — prueba de conexión",
    body: [
      "Si estás leyendo esto, el harness puede llegar a tu celular.",
      "",
      `  proyecto   ${root}`,
      `  fecha      ${fecha.toISOString()}`,
      "",
      "Lo que va a llegar por acá cuando importe: un gate que espera tu decisión,",
      "un proceso que se detuvo, o un bloqueo. Nada más: el harness ya sabe lo que",
      "pasa, y esto es el canal, no el registro.",
    ].join("\n"),
  };
}

/** Una proposición, con lo justo para explicar el veredicto en un mensaje. */
export interface NotificationProposition {
  readonly id: string;
  /** Qué se juzgó. Sin esto, `criterio_03` no dice nada. */
  readonly description?: string | undefined;
  readonly value: number;
  readonly weight: number;
}

/** Todo lo que hace falta para redactar la notificación de un gate. */
export interface GateNotificationInput {
  readonly ticket: string;
  readonly title: string;
  readonly gate: string;
  readonly module: string;
  readonly riskLevel: string;
  readonly outcome: string;
  readonly reason: string;
  readonly propositions: readonly NotificationProposition[];
  readonly costUsd: number | null;
  /** El código que la persona responde para decidir. */
  readonly code: string;
  readonly expiresAt: string;
}

/** Un valor entre 0 y 1, como porcentaje de dos dígitos. */
function porcentaje(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}

/** Una fecha ISO, en la forma en que se lee en un chat. */
function fechaCorta(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/**
 * El mensaje que llega al celular.
 *
 * Se escribe para leerse **en una notificación**, y eso decide tres cosas:
 *
 * - **Lo primero es qué se decide y de qué ticket**, porque es lo único que se ve
 *   sin abrir el mensaje.
 * - **Las proposiciones van con su valor**, que es lo que permite decidir sin ir
 *   a la pantalla. Un mensaje que solo dijera «el plan está en revisión» obliga a
 *   abrir el portátil, que es exactamente lo que esto existe para evitar.
 * - **El código va aparte y al final**, porque se copia o se dicta, y mezclarlo
 *   con la prosa hace que se copie mal.
 */
export function renderGateNotification(input: GateNotificationInput): NotificationPayload {
  const lineas = [
    `⚠ ${input.gate.toUpperCase()} ESPERA TU DECISIÓN`,
    "",
    `  ticket   ${input.ticket}`,
    `  ${input.title}`,
    `  módulo   ${input.module} · riesgo ${input.riskLevel}`,
    "",
  ];

  if (input.reason.trim() !== "") {
    lineas.push("Motivo del escalado:", `  ${input.reason.trim()}`, "");
  }

  if (input.propositions.length > 0) {
    lineas.push("Lo que evaluó la compuerta:");
    for (const p of input.propositions) {
      const texto = p.description ?? p.id;
      lineas.push(`  ${porcentaje(p.value).padStart(4)}  ${texto}`);
    }
    lineas.push("");
  }

  if (input.costUsd !== null) {
    lineas.push(`Costo de esta evaluación: $${input.costUsd.toFixed(5)}`, "");
  }

  lineas.push(
    "Para decidir, contestá con el código y la decisión:",
    "",
    `    ${input.code} aprobar`,
    `    ${input.code} rechazar`,
    "",
    `Vale hasta el ${fechaCorta(input.expiresAt)} y una sola vez.`,
    "",
    "Los cambios irreversibles —despliegue, migración, release— no se deciden",
    "por acá: eso exige la máquina y el diff delante.",
  );

  return {
    // La identidad del hecho: el mismo recibo no se notifica dos veces, y un
    // recibo nuevo del mismo gate sí es un hecho nuevo.
    key: `${input.ticket}:${input.gate}:${input.code}`,
    subject: `Gate ${input.gate} · ${input.ticket}`,
    body: lineas.join("\n"),
  };
}

/** Un ticket que espera una decisión, con el código si ya se avisó. */
export interface BriefGate {
  readonly ticket: string;
  readonly gate: string;
  readonly code: string | null;
}

/** Una corrida detenida, con el paso que la espera. */
export interface BriefRun {
  readonly processId: string;
  readonly step: string;
  readonly since: string;
}

/** Todo lo que cuenta el parte. */
export interface BriefInput {
  readonly proyecto: string;
  readonly fecha: string;
  readonly gates: readonly BriefGate[];
  readonly corridas: readonly BriefRun[];
  readonly enCurso: readonly { readonly id: string; readonly estado: string }[];
  readonly cerrados: readonly string[];
  readonly diasCerrados: number;
  /** El consumo del período, ya resumido. */
  readonly evaluaciones: number | null;
  readonly costeUsd: number | null;
  readonly decididasEnCodigo: number | null;
  /**
   * Por qué no se pudo calcular el consumo, si no se pudo.
   *
   * Existe porque un parte **no puede fallar entero**: su razón de ser es contar
   * el estado de las cosas, y una de las cosas que puede estar mal es el propio
   * registro. Un parte que no llega porque un ticket está malformado deja a la
   * persona sin la información y sin el motivo, que es el peor de los dos mundos.
   */
  readonly notaConsumo: string | null;
  /** La actividad de la jornada del día; sin ella el parte no cambia. */
  readonly jornada?: BriefJornada | undefined;
}

/** Una lista con viñetas, o nada si está vacía. */
function vinetas(titulo: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return [titulo, ...items.map((i) => `    · ${i}`), ""];
}

/** Un proceso detenido, listo para avisar. */
export interface ProcessNotificationInput {
  readonly processId: string;
  readonly runId: string;
  /** El paso donde se detuvo. */
  readonly step: string;
  /** Desde cuándo. */
  readonly since: string;
}

/**
 * El aviso de un corte de presupuesto (R-S1-003).
 *
 * Existe porque un presupuesto que solo se ve cuando alguien abre el informe no
 * avisa: lo que se quiere saber es que **esta** corrida se está yendo, mientras se
 * está yendo. Los tres números van en el cuerpo —lo que costó, lo que suele costar y
 * cuántas veces es— porque con dos de ellos la persona no puede juzgar si el gasto
 * es razonable.
 *
 * Cuando el corte es la pausa, el mensaje **no resuelve**: pide la decisión. Un
 * aviso que decidiera por su cuenta convertiría la pausa en un trámite.
 */
export interface BudgetNotificationInput {
  readonly ticketId: string;
  readonly title: string;
  readonly type: string;
  readonly costUsd: number;
  readonly typicalUsd: number;
  readonly multiple: number;
  /** El corte alcanzado: `notify`, `degrade` o `pause`. */
  readonly tier: string;
  /** El preset al que se degrada el enrutado, si corresponde. */
  readonly preset?: string | null;
}

/** El aviso de presupuesto, en el payload que el canal entrega. */
export function renderBudgetNotification(input: BudgetNotificationInput): NotificationPayload {
  const lineas = [
    `💵 PRESUPUESTO · ${input.tier.toUpperCase()}`,
    "",
    `  ticket     ${input.ticketId}`,
    `  ${input.title}`,
    `  tipo       ${input.type}`,
    "",
    `  costo      $${input.costUsd.toFixed(4)}`,
    `  típico     $${input.typicalUsd.toFixed(4)} del tipo ${input.type}`,
    `  múltiplo   ${input.multiple.toFixed(1)}× lo típico`,
    "",
  ];

  if (input.preset !== undefined && input.preset !== null) {
    lineas.push(
      `El enrutado de sus compuertas se degrada al preset ${input.preset}: lo que el`,
      "harness ejecute para este ticket deja de usar los modelos caros, y el recibo",
      "de cada evaluación lo declara.",
      "",
    );
  }

  if (input.tier === "pause") {
    lineas.push(
      "La decisión es tuya: la corrida se detiene y el harness no sigue gastando en",
      "silencio, ni decide por vos que hay que parar.",
      "",
    );
  }

  return {
    // El corte entra en la clave: pasar de «avisa» a «degrada» es un hecho nuevo, y
    // el mismo corte no se avisa dos veces.
    key: `budget:${input.ticketId}:${input.tier}`,
    subject: `Presupuesto ${input.tier} · ${input.ticketId}`,
    body: lineas.join("\n").trimEnd(),
  };
}

/**
 * El mensaje de un proceso detenido en un gate.
 *
 * No lleva código, y la diferencia con el mensaje de un gate de ticket es el
 * punto entero: **un paso de proceso no se aprueba a distancia**. Los procesos son
 * el camino por el que se despliega, y aprobar un paso suyo desde una pantalla de
 * cinco pulgadas es exactamente lo que la regla dura prohíbe. Así que el mensaje
 * avisa y dice dónde sí se aprueba.
 *
 * Vale la pena igual: un proceso detenido es trabajo parado, y sin el aviso se
 * descubre cuando alguien mira la pantalla —que es justo lo que la persona no está
 * haciendo cuando el proceso se detiene—.
 */
export function renderProcessNotification(
  input: ProcessNotificationInput,
): NotificationPayload {
  const lineas = [
    "⏸ UN PROCESO SE DETUVO ESPERANDO APROBACIÓN",
    "",
    `  proceso   ${input.processId}`,
    `  corrida   ${input.runId}`,
    `  paso      ${input.step}`,
    `  desde     ${input.since.slice(0, 16).replace("T", " ")}`,
    "",
  ];

  lineas.push(
    "Este no se aprueba por acá: un paso de proceso es el camino por el que se",
    "despliega, y eso exige la máquina y el diff delante. Se aprueba donde",
    "siempre, y la corrida sigue desde donde quedó:",
    "",
    `    valmen process approve ${input.step} --actor <nombre>`,
    `    valmen process resume ${input.runId}`,
  );

  return {
    key: `process:${input.runId}:${input.step}`,
    subject: `Proceso detenido · ${input.processId}`,
    body: lineas.join("\n"),
  };
}

/** Una parada automática que requiere revisión, pero no se aprueba por chat. */
export interface AutonomousStopNotificationInput {
  readonly ticketId: string;
  readonly receiptId: string;
  readonly reason: string;
  readonly detail: string;
  readonly stoppedAt: string;
}

/**
 * Redacta el aviso seguro de una parada autónoma.
 *
 * El detalle viene del recibo, que por contrato ya está redactado: esta función
 * no recibe diffs, salida del ejecutor ni hallazgos que puedan contener secretos.
 */
export function renderAutonomousStopNotification(
  input: AutonomousStopNotificationInput,
): NotificationPayload {
  return {
    key: `autonomous-stop:${input.receiptId}`,
    subject: `Ejecución detenida · ${input.ticketId}`,
    body: [
      "⏸ EJECUCIÓN AUTÓNOMA DETENIDA",
      "",
      `  ticket   ${input.ticketId}`,
      `  motivo   ${input.reason}`,
      `  desde    ${input.stoppedAt.slice(0, 16).replace("T", " ")}`,
      "",
      input.detail,
      "",
      "El ticket conserva un estado válido y no se reintentará solo. Revisá el recibo",
      "de parada en la máquina antes de decidir cómo continuar.",
    ].join("\n"),
  };
}

/** Una jornada cuyos tickets quedaron todos cerrados. */
export interface JourneyFinishedNotificationInput {
  readonly journeyId: string;
  readonly tickets: readonly string[];
}

/** El aviso de que la jornada terminó: no queda ningún ticket pendiente. */
export function renderJourneyFinishedNotification(input: JourneyFinishedNotificationInput): NotificationPayload {
  return {
    key: `journey-finished:${input.journeyId}`,
    subject: `Jornada terminada · ${input.journeyId}`,
    body: [
      "✅ JORNADA TERMINADA",
      "",
      `  jornada  ${input.journeyId}`,
      `  tickets  ${input.tickets.length} cerrado(s)`,
      ...input.tickets.map((ticket) => `    ${ticket}`),
      "",
      "No queda ningún ticket pendiente: el avance no hará nada hasta que armes otra jornada",
      "(valmen journey plan).",
    ].join("\n"),
  };
}

/** Un ticket que llegó a las pruebas del responsable, listo para avisar (R-JORN-008). */
export interface TestsReadyNotificationInput {
  readonly ticketId: string;
  readonly title: string;
  /** Los comandos del contrato de pruebas, tal como están en `## Pruebas`. */
  readonly commands: readonly string[];
  /** La ruta del ticket, donde está el contrato completo. */
  readonly contractPath: string;
  readonly cycle: number;
}

/** El aviso de que un ticket espera las pruebas del responsable, con su contrato. */
export function renderTestsReadyNotification(input: TestsReadyNotificationInput): NotificationPayload {
  return {
    key: `tests-ready:${input.ticketId}:${input.cycle}`,
    subject: `Listo para probar · ${input.ticketId}`,
    body: [
      "✅ LISTO PARA TUS PRUEBAS",
      "",
      `  ticket   ${input.ticketId}`,
      `  título   ${input.title}`,
      "",
      input.commands.length === 0
        ? "El contrato de pruebas no trae comandos: léelo completo."
        : "Comandos del contrato:",
      ...input.commands.map((comando) => `    ${comando}`),
      "",
      `Contrato completo: ${input.contractPath} (sección ## Pruebas).`,
      "Avisar que está listo no aprueba nada: el resultado de las pruebas es tuyo.",
    ].join("\n"),
  };
}

export interface PolicyCloseNotificationInput {
  readonly ticketId: string;
  readonly title: string;
  readonly authorizationId: string;
  readonly receipt: string;
  readonly cycle: number;
}

/** «QA aprobada por política»: con el recibo y la forma de reabrir (R-QAAG-006). */
export function renderPolicyCloseNotification(input: PolicyCloseNotificationInput): NotificationPayload {
  return {
    key: `policy-close:${input.ticketId}:${input.cycle}`,
    subject: `QA aprobada por política · ${input.ticketId}`,
    body: [
      "🧾 QA APROBADA POR POLÍTICA",
      "",
      `  ticket        ${input.ticketId}`,
      `  título        ${input.title}`,
      `  autorización  ${input.authorizationId}`,
      `  recibo        ${input.receipt}`,
      "",
      "No la aprobó el agente: la respaldan tu autorización y el recibo de qa-agent.",
      `Para reabrirlo: valmen transition --id ${input.ticketId} --entity ticket --to changes_requested`,
    ].join("\n"),
  };
}

/** La actividad de la jornada del día, para el parte (R-JORN-008). */
export interface BriefJornada {
  /** Una línea por fase con sesiones hoy. */
  readonly fases: readonly {
    readonly fase: string;
    readonly sesiones: number;
    readonly modelos: readonly string[];
    readonly duracionMs: number;
    /** `null` si el cliente no reportó el costo: se dice, no se inventa. */
    readonly costeUsd: number | null;
    /** Los modelos que el cliente reportó haber usado (vacío = ninguno reportado). */
    readonly modelosUsados?: readonly string[];
    /** Pares declarado → usado de las sesiones cuyo usado difiere del declarado. */
    readonly distintos?: readonly { readonly declarado: string; readonly usado: string }[];
    /** Sesiones de la fase sin modelo usado reportado. */
    readonly sinReportarModelo?: number;
    /** Sesiones de la fase sin costo reportado. */
    readonly sinReportarCoste?: number;
  }[];
  readonly esperanPruebas: readonly string[];
  readonly esperanPlan: readonly string[];
  readonly paradas: readonly string[];
}

/**
 * El parte: lo que pasó y lo que espera, en un mensaje.
 *
 * Existe porque el reporte del harness es una página, y una página hay que
 * acordarse de abrirla. El parte llega. Lo que lo hace útil y no ruido es el
 * orden: **primero lo que espera una decisión tuya** —eso es lo único sobre lo
 * que se puede hacer algo ahora—, después lo que se detuvo, y al final el
 * contexto que se lee de paso.
 *
 * Los bloques vacíos **no se imprimen**. Un parte que dice «0 gates esperando»,
 * «0 procesos detenidos» y «0 cerrados» entrena a quien lo lee a saltearlo, y el
 * día que tenga un gate adentro también lo va a saltar.
 */
export function renderBrief(input: BriefInput): NotificationPayload {
  const lineas = [`📋 Parte de ${input.proyecto} — ${input.fecha}`, ""];

  const gates = input.gates.map((g) =>
    g.code === null
      ? `${g.ticket} · ${g.gate}`
      : `${g.ticket} · ${g.gate} — código ${g.code}`,
  );
  lineas.push(...vinetas(`⚠ ${gates.length} gate(s) esperan tu decisión:`, gates));

  const corridas = input.corridas.map(
    (r) =>
      `${r.processId} · detenido en "${r.step}" desde ${r.since.slice(0, 16).replace("T", " ")}`,
  );
  lineas.push(...vinetas(`⏸ ${corridas.length} proceso(s) detenido(s):`, corridas));

  const enCurso = input.enCurso.map((t) => `${t.id} · ${t.estado}`);
  lineas.push(...vinetas(`▶ ${enCurso.length} en curso:`, enCurso));

  if (input.cerrados.length > 0) {
    lineas.push(
      `✓ ${input.cerrados.length} cerrado(s) en los últimos ${input.diasCerrados} días:`,
    );
    lineas.push(...input.cerrados.slice(0, 8).map((id) => `    · ${id}`));
    if (input.cerrados.length > 8) {
      // Se dice que hay más en vez de cortar en silencio: una lista truncada sin
      // aviso se lee como la lista completa.
      lineas.push(`    … y ${input.cerrados.length - 8} más`);
    }
    lineas.push("");
  }

  if (input.evaluaciones !== null && input.costeUsd !== null) {
    const codigo =
      input.decididasEnCodigo === null
        ? ""
        : ` · ${input.decididasEnCodigo} decididas en código`;
    lineas.push(
      `💵 $${input.costeUsd.toFixed(4)} en ${input.evaluaciones} evaluación(es)${codigo}`,
      "",
    );
  } else if (input.notaConsumo !== null) {
    // Se dice lo que no se pudo calcular, en vez de omitirlo: un parte al que le
    // falta una línea sin explicar se lee como si esa línea no existiera.
    lineas.push(`💵 Sin el consumo: ${input.notaConsumo}`, "");
  }

  // La jornada del día: lo hecho por fase y los altos que esperan a una persona.
  const jornada = input.jornada;
  if (jornada !== undefined) {
    const minutos = (ms: number): string => `${Math.max(1, Math.round(ms / 60_000))} min`;
    lineas.push(
      ...vinetas(
        `🛠 Jornada de hoy — ${jornada.fases.reduce((n, f) => n + f.sesiones, 0)} sesión(es):`,
        jornada.fases.map((f) => {
          const sinCoste = f.sinReportarCoste ?? 0;
          const costo =
            f.costeUsd === null
              ? "costo sin reportar por el cliente"
              : `$${f.costeUsd.toFixed(4)}${sinCoste > 0 ? ` (${sinCoste} sin reportar)` : ""}`;
          const usados = f.modelosUsados ?? [];
          const sinModelo = f.sinReportarModelo ?? 0;
          const extra: string[] = [];
          if (usados.length > 0) extra.push(`usado: ${usados.join(", ")}`);
          for (const par of f.distintos ?? []) extra.push(`⚠ distinto al declarado: ${par.declarado} → ${par.usado}`);
          if (sinModelo > 0) extra.push(`modelo usado sin reportar en ${sinModelo} sesión(es)`);
          return (
            `${f.fase}: ${f.sesiones} sesión(es), ${f.modelos.join(", ")}, ${minutos(f.duracionMs)}, ${costo}` +
            (extra.length === 0 ? "" : ` · ${extra.join(" · ")}`)
          );
        }),
      ),
      ...vinetas(`🧪 ${jornada.esperanPruebas.length} esperan tus pruebas:`, jornada.esperanPruebas),
      ...vinetas(`📝 ${jornada.esperanPlan.length} plan(es) esperan tu aprobación:`, jornada.esperanPlan),
      ...vinetas(`⛔ ${jornada.paradas.length} parada(s) activa(s):`, jornada.paradas),
    );
  }

  if (lineas.length === 2) {
    lineas.push("Nada pendiente y nada en curso.", "");
  }

  return {
    // La clave incluye la fecha: el parte de un día no reemplaza al del anterior,
    // y el mismo parte no se manda dos veces el mismo día.
    key: `parte:${input.fecha}`,
    subject: `Parte de ${input.proyecto} · ${input.fecha}`,
    body: lineas.join("\n").trimEnd(),
  };
}

/** El tope de caracteres de un parte enviado por mensajería (Telegram acota el largo de un mensaje). */
export const TOPE_DEL_PARTE = 3500;

/**
 * El aviso del parte de la jornada: qué probar y cómo en cada ticket, los cerrados por política y
 * lo que falta entregar. Recorta por tickets completos hasta el tope y dice cuántos dejó fuera.
 */
export function renderJourneyHandoffNotification(
  parte: ParteDeJornada,
  opciones: { readonly maxCaracteres?: number } = {},
): NotificationPayload {
  const tope = opciones.maxCaracteres ?? TOPE_DEL_PARTE;
  const unidades: { readonly seccion: number; readonly lineas: string[] }[] = [];
  for (const e of parte.esperanPruebas) {
    const lineas = [`• ${e.ticketId} — ${e.title}`, `    ticket: ${e.ruta}`];
    if (e.omitidoPorSecreto.length > 0) {
      lineas.push(`    contrato omitido: se encontró ${e.omitidoPorSecreto.join(", ")}; léelo en el ticket.`);
    } else if (e.sinContrato) {
      lineas.push("    sin contrato de pruebas: el ticket no trae comandos, léelo en su ruta.");
    } else {
      if (e.directorio !== null) lineas.push(`    directorio: ${e.directorio}`);
      lineas.push(...e.probar.map((linea) => `    probar: ${linea}`));
    }
    lineas.push(...e.manuales.map((linea) => `    manual: ${linea.replace(/^(?:validación manual|manual)\s*:\s*/i, "")}`));
    unidades.push({ seccion: 0, lineas });
  }
  for (const c of parte.cerradosPorPolitica) {
    unidades.push({
      seccion: 1,
      lineas: [`• ${c.ticketId} — ${c.title}`, `    autorización ${c.autorizacion} · recibo ${c.recibo}`],
    });
  }
  for (const s of parte.sinEntregar) unidades.push({ seccion: 2, lineas: [`• ${s.ticketId} [${s.estado}]`] });

  const titulos = [
    "ESPERAN TUS PRUEBAS",
    "CERRADOS POR POLÍTICA DE QA (no los aprobó el agente: los respaldan tu autorización y el recibo)",
    "SIN ENTREGAR TODAVÍA",
  ];
  const cierre = "Este aviso no aprueba nada ni cierra ningún ticket.";
  const encabezado = [
    "📋 PARTE DE LA JORNADA",
    "",
    `  jornada  ${parte.journeyId}`,
    `  esperan tus pruebas ${parte.esperanPruebas.length} · cerrados por política ${parte.cerradosPorPolitica.length} · sin entregar ${parte.sinEntregar.length}`,
  ];

  const componer = (cuantos: number): string => {
    const lineas = [...encabezado];
    let seccionActual = -1;
    for (const unidad of unidades.slice(0, cuantos)) {
      if (unidad.seccion !== seccionActual) {
        seccionActual = unidad.seccion;
        lineas.push("", `${titulos[unidad.seccion]}:`);
      }
      lineas.push(...unidad.lineas);
    }
    if (cuantos < unidades.length) {
      lineas.push("", `… y ${unidades.length - cuantos} más. Parte completo: valmen journey handoff --id ${parte.journeyId} --saved`);
    }
    lineas.push("", cierre);
    return lineas.join("\n");
  };

  let cuantos = unidades.length;
  while (cuantos > 0 && componer(cuantos).length > tope) cuantos -= 1;
  let body = componer(cuantos);
  // Un solo ticket más largo que el tope: se corta el texto, pero la frase final no se pierde.
  if (body.length > tope) body = `${body.slice(0, Math.max(0, tope - cierre.length - 1))}\n${cierre}`.slice(0, tope);
  return {
    key: `journey-handoff:${parte.journeyId}`,
    subject: `Parte de la jornada · ${parte.journeyId}`,
    body,
  };
}
