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
