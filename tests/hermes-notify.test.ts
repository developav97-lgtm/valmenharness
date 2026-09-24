/**
 * Notificar un gate y decidirlo por código: el camino completo, ida y vuelta.
 *
 * Lo que se prueba acá es la costura entre piezas que ya están probadas por
 * separado —el techo de riesgo, la emisión del token, el canal y el registro de la
 * decisión—, y esa costura tiene dos propiedades que no se ven en ninguna de las
 * partes:
 *
 * 1. **El orden de la emisión.** Primero se comprueba el techo y después se
 *    emite. Si se invirtiera, el mensaje ya estaría en el celular de alguien
 *    ofreciendo una decisión que el motor no va a aceptar, y la negativa llegaría
 *    cuando la persona ya contestó.
 * 2. **El hash del estado.** Al decidir se compara el hash de lo que vio el
 *    evaluador contra el hash del ticket de ahora. Es lo que impide aprobar un
 *    artefacto que cambió después de notificarlo —el recibo registraría como
 *    decisión humana algo que ninguna persona decidió sobre ese texto—.
 *
 * El recibo de la fixture se construye con el **estado real del ticket**, y no con
 * un objeto inventado: si el hash no correspondiera, todos los casos de decisión
 * fallarían por la comprobación del punto 2 y la suite estaría probando esa
 * comprobación en vez de lo que dice probar.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type GateReceipt,
  type Proposition,
} from "../packages/gate/src/index.js";
import {
  appendReceipt,
  buildGateState,
  currentReceipts,
  pendingApprovals,
  readApprovalLog,
  readReceipts,
  writeRun,
  type CommandRunner,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import {
  decideByCode,
  hermesNotify,
  armarParte,
  hermesBrief,
  hermesNotifyPendientes,
  pendientesDeAvisar,
} from "../packages/cli/src/hermes.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const SECRETO = "secreto-de-prueba-para-la-firma";
const AHORA = new Date("2026-09-23T12:00:00.000Z");
const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const RECIBO = "GR-20260923-0001";

const PROPOSICIONES: Proposition[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "¿cubre los criterios?" },
];

/** Las respuestas que dejan el veredicto en la banda de revisión. */
const RESPUESTAS = [
  { id: "cubre_todos_los_criterios", kind: "noul", value: 0.72 },
] as const;

let raiz: string;
let paths: RegistryPaths;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "notificar-"));
  mkdirSync(join(raiz, ".valmen"), { recursive: true });
  paths = { root: raiz, ticketsDir: "tickets" };
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

/** El `ticket.md` de la fixture, para leerlo o tocarlo. */
function rutaTicket(): string {
  return join(raiz, "tickets", "2026", TICKET, "ticket.md");
}

/** El estado del ticket tal como está en disco ahora. */
function estadoActual(): Record<string, string> {
  return buildGateState(readFileSync(rutaTicket(), "utf8"));
}

/**
 * Un recibo en banda de revisión: el que sí espera una persona.
 *
 * `0.72` cae entre `blockAt: 0.1` y `approveAt: 0.9`, así que el veredicto es
 * `review` y el recibo queda escalado a una persona. Es el único caso que tiene
 * sentido notificar: avisar de un gate que ya se decidió solo sería ruido.
 */
function reciboEscalado(id: string = RECIBO): GateReceipt {
  const decision = decide(PROPOSICIONES, [...RESPUESTAS], DEFAULT_POLICY);

  return buildReceipt({
    id,
    gate: "plan",
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: TICKET, revision: "1" },
    decision,
    state: estadoActual(),
    answers: [...RESPUESTAS],
    mechanicalChecks: [
      { id: "criterios_presentes", description: "hay criterios", result: "pass" },
    ],
    model: null,
    usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.00042 },
    latencyMs: 500,
    decidedAt: "2026-09-23T11:00:00Z",
  });
}

/** Un runner que dice que el mensaje salió y anota el cuerpo. */
function runnerOk(): { runner: CommandRunner; cuerpos: string[] } {
  const cuerpos: string[] = [];
  const runner: CommandRunner = (_command, _args, input) => {
    cuerpos.push(input);
    return { status: 0, stdout: "{}", stderr: "", failed: false };
  };
  return { runner, cuerpos };
}

/** El ticket y su recibo escalado, listos para notificar. */
function preparar(riesgo = "normal", impactos: readonly string[] = []): void {
  writeFixtureTicket(raiz, {
    id: TICKET,
    riskLevel: riesgo,
    workflowStatus: "planned",
    ...(impactos.length === 0 ? {} : { impacts: impactos }),
  });
  appendReceipt(paths, TICKET, reciboEscalado());
}

function pedido(extra: Partial<Parameters<typeof hermesNotify>[0]> = {}) {
  return {
    paths,
    ticketId: TICKET,
    receiptId: RECIBO,
    to: "telegram",
    secret: SECRETO,
    now: AHORA,
    runner: runnerOk().runner,
    ...extra,
  };
}

/** Notifica y devuelve el código que habría llegado al celular. */
function notificar(riesgo = "normal", impactos: readonly string[] = []): string {
  preparar(riesgo, impactos);
  const { runner } = runnerOk();
  const r = hermesNotify(pedido({ runner }));
  if (r.exitCode !== 0) throw new Error(`no se pudo notificar: ${r.stderr}`);
  return pendingApprovals(paths, AHORA)[0]?.code as string;
}

function decidir(code: string, decision: "approve" | "reject" = "approve") {
  return decideByCode({
    paths,
    code,
    decision,
    actor: "juan",
    reason: "lo revisé en el celular",
    secret: SECRETO,
    now: AHORA,
  });
}

/** El recibo tal como quedó en disco después de una decisión. */
function reciboConDecision(id: string = RECIBO): GateReceipt | undefined {
  return currentReceipts(readReceipts(paths, TICKET)).find((r) => r.id === id);
}

describe("notificar un gate", () => {
  it("en un ticket de riesgo normal emite el token y manda el mensaje", () => {
    preparar();
    const { runner, cuerpos } = runnerOk();
    const r = hermesNotify(pedido({ runner }));

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("código");
    expect(cuerpos).toHaveLength(1);
    expect(pendingApprovals(paths, AHORA)).toHaveLength(1);
  });

  it("en un ticket de riesgo `critical` se niega y no deja ningún token", () => {
    // El caso que sostiene la promesa entera del diseño. El gate **sí** espera una
    // decisión humana —está en revisión— y aun así no se puede decidir a
    // distancia: el riesgo es lo que cierra la puerta, no el veredicto.
    preparar("critical");
    const { runner, cuerpos } = runnerOk();
    const r = hermesNotify(pedido({ runner }));

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("critical");
    // Ni mensaje, ni token: el orden es comprobar y después emitir.
    expect(cuerpos).toHaveLength(0);
    expect(readApprovalLog(paths)).toHaveLength(0);
  });

  it("en un ticket con impacto de migración se niega, aunque el riesgo sea normal", () => {
    preparar("normal", ["migration_impact"]);
    const r = hermesNotify(pedido());

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("migration_impact");
    expect(readApprovalLog(paths)).toHaveLength(0);
  });

  it("la negativa dice dónde sí se decide", () => {
    // Una negativa que no ofrece salida es la que hace que alguien busque el
    // rodeo. El comando que sí funciona va escrito en el error.
    preparar("critical");
    const r = hermesNotify(pedido());
    expect(r.stderr).toContain("gate-decide");
    expect(r.stderr).toContain(RECIBO);
  });

  it("no notifica un gate que no está escalado a una persona", () => {
    // Avisar de algo ya decidido es ruido, y el ruido es lo que hace que se dejen
    // de leer los avisos que sí importan.
    writeFixtureTicket(raiz, {
      id: TICKET,
      riskLevel: "normal",
      workflowStatus: "planned",
    });
    const aprobado = { ...reciboEscalado(), escalatedTo: null } as GateReceipt;
    appendReceipt(paths, TICKET, aprobado);

    const r = hermesNotify(pedido());
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("no está escalado");
  });

  it("distingue «no existe el ticket» de «no existe el recibo»", () => {
    const sinTicket = hermesNotify(pedido());
    expect(sinTicket.stderr).toContain("No existe el ticket");

    writeFixtureTicket(raiz, {
      id: TICKET,
      riskLevel: "normal",
      workflowStatus: "planned",
    });
    const sinRecibo = hermesNotify(pedido({ receiptId: "GR-9999" }));
    expect(sinRecibo.stderr).toContain("No hay un recibo vigente");
  });

  it("si el mensaje no sale, el token ya emitido se dice igual", () => {
    // El token está en el registro y es válido: perderlo porque el canal falló
    // obligaría a emitir otro, y dos tokens vivos para el mismo gate es
    // exactamente lo que el registro existe para evitar.
    preparar();
    const caido: CommandRunner = () => ({
      status: null,
      stdout: "",
      stderr: "",
      failed: true,
    });
    const r = hermesNotify(pedido({ runner: caido }));

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("código");
    expect(r.stderr).toContain("hermes test");

    // Dos entradas y no una: la emisión y el intento fallido. La segunda es la que
    // hace que un reintento no saltee el gate creyendo que ya se avisó.
    expect(readApprovalLog(paths).map((e) => e.kind)).toEqual([
      "approval-issued",
      "approval-undelivered",
    ]);
    expect(pendingApprovals(paths, AHORA)[0]?.awaitingDecision).toBe(false);
  });

  it("el mensaje lleva el código, el ticket y el valor de lo evaluado", () => {
    preparar();
    const { runner, cuerpos } = runnerOk();
    hermesNotify(pedido({ runner }));

    const emitido = pendingApprovals(paths, AHORA)[0];
    expect(cuerpos[0]).toContain(TICKET);
    expect(cuerpos[0]).toContain(emitido?.code as string);
    // Las proposiciones con su valor son lo que permite decidir sin abrir el
    // portátil, que es lo único que justifica la notificación.
    expect(cuerpos[0]).toContain("72%");
    expect(cuerpos[0]).toContain("0.00042");
  });
});

describe("el bucle completo: notificar y decidir por código", () => {
  it("aprueba: el recibo queda con la decisión y el canal de dónde vino", () => {
    // El canal importa: dentro de seis meses, «aprobado desde el celular» y
    // «aprobado en la pantalla» son dos hechos distintos, y el recibo es el único
    // sitio donde esa diferencia se puede conservar.
    const r = decidir(notificar());

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Aprobado");

    const conDecision = reciboConDecision();
    expect(conDecision?.humanDecision?.decision).toBe("approve");
    expect(conDecision?.humanDecision?.actor).toBe("juan");
    expect(conDecision?.humanDecision?.channel).toBe("hermes-celular");
    expect(conDecision?.humanDecision?.reason).toBe("lo revisé en el celular");
  });

  it("rechaza: el veredicto viaja entero", () => {
    const r = decidir(notificar(), "reject");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Rechazado");
    expect(reciboConDecision()?.humanDecision?.decision).toBe("reject");
  });

  it("consume el código: la segunda vez se niega", () => {
    const code = notificar();
    expect(decidir(code).exitCode).toBe(0);

    const segunda = decidir(code);
    expect(segunda.exitCode).not.toBe(0);
    expect(segunda.stderr).toContain("ya se usó");
  });

  it("se niega si el ticket cambió después de notificarlo", () => {
    // **El caso que sostiene la promesa entera.** El veredicto que la persona leyó
    // describe un texto que ya no es el que está en disco, así que su aprobación
    // sería de otra cosa. Sin esta comprobación, el recibo registraría como
    // decisión humana algo que ninguna persona decidió sobre ese artefacto.
    const code = notificar();
    writeFileSync(
      rutaTicket(),
      readFileSync(rutaTicket(), "utf8").replace(
        "## Plan",
        "## Plan\n\nUn paso más que apareció después de notificar.",
      ),
      "utf8",
    );

    const r = decidir(code);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("cambió");
    // Y no se registró nada: negarse a medias sería peor que no negarse.
    expect(reciboConDecision()?.humanDecision).toBeNull();
  });

  it("el código que se negó por obsoleto no se consume", () => {
    // Un rechazo no gasta la credencial; usarla, sí. Consumirlo acá le sacaría a
    // la persona el código por un cambio que hizo otro.
    const code = notificar();
    writeFileSync(
      rutaTicket(),
      readFileSync(rutaTicket(), "utf8").replace("## Plan", "## Plan\n\nOtro paso."),
      "utf8",
    );

    expect(decidir(code).exitCode).not.toBe(0);
    expect(
      readApprovalLog(paths).filter((e) => e.kind === "approval-consumed"),
    ).toHaveLength(0);
  });

  it("un cambio que el evaluador no vio no invalida el código", () => {
    // El hash cubre el estado que se le mandó al evaluador —solicitud,
    // diagnóstico, plan, criterios, tipo, módulo, riesgo e impactos—, no el
    // archivo entero. Un comentario al final del ticket no cambia nada de lo que
    // se juzgó, así que negarse sería rechazar por una razón que no existe.
    const code = notificar();
    writeFileSync(
      rutaTicket(),
      `${readFileSync(rutaTicket(), "utf8")}\n<!-- una nota -->\n`,
      "utf8",
    );

    expect(decidir(code).exitCode).toBe(0);
  });

  it("se niega con un secreto distinto al que firmó", () => {
    const code = notificar();
    const r = decideByCode({
      paths,
      code,
      decision: "approve",
      actor: "juan",
      reason: "",
      // valmen:allow-secret: es de mentira y el caso tiene que existir —lo que se
      // prueba es que un secreto distinto del que firmó hace fallar la firma—.
      secret: "otro-secreto",
      now: AHORA,
    });
    expect(r.exitCode).not.toBe(0);
    // Lo que se afirma es lo que la persona lee, no la etiqueta interna del
    // rechazo: el mensaje tiene que explicar que la firma no cierra.
    expect(r.stderr).toContain("firma");
    expect(r.stderr).toContain("secreto");
  });

  it("una segunda evaluación del mismo gate no invalida el código", () => {
    // Podría parecer lo contrario, y por eso se afirma: el token está atado **al
    // recibo que se notificó**, no a «el que sea vigente ahora». Si el artefacto
    // no cambió, el veredicto que la persona leyó sigue describiéndolo, y la
    // decisión tiene que quedar en ese recibo —el que leyó— y no en el nuevo.
    const code = notificar();
    appendReceipt(paths, TICKET, reciboEscalado("GR-20260923-0002"));

    expect(decidir(code).exitCode).toBe(0);
    expect(reciboConDecision(RECIBO)?.humanDecision?.decision).toBe("approve");
    expect(reciboConDecision("GR-20260923-0002")?.humanDecision).toBeNull();
  });

  it("se niega si el código venció", () => {
    const code = notificar();
    const r = decideByCode({
      paths,
      code,
      decision: "approve",
      actor: "juan",
      reason: "",
      secret: SECRETO,
      now: new Date("2026-09-26T12:00:00Z"),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("venció");
  });

  it("la decisión queda también en el historial del ticket", () => {
    // Un rechazo es una petición de corrección, y quien la va a ejecutar lee el
    // ticket. Si el motivo viviera solo en el recibo, el bucle quedaría abierto a
    // medias: la decisión registrada y la corrección sin encargo.
    decidir(notificar(), "reject");
    expect(readFileSync(rutaTicket(), "utf8")).toContain("gate-rejected");
  });
});

describe("avisar de todo lo que espera una decisión", () => {
  const CONFIG = {
    enabled: true,
    gateTarget: "telegram",
    tokenHours: 24,
    allowedRisk: ["low", "normal"],
  };

  function pendientes() {
    return pendientesDeAvisar(paths, AHORA);
  }

  function avisar(extra: Partial<Parameters<typeof hermesNotifyPendientes>[0]> = {}) {
    return hermesNotifyPendientes({
      paths,
      config: CONFIG,
      secret: SECRETO,
      now: AHORA,
      runner: runnerOk().runner,
      ...extra,
    });
  }

  it("no avisa de un gate que ya se decidió", () => {
    preparar();
    expect(pendientes()).toHaveLength(1);
    decidir(notificar());
    expect(pendientes()).toHaveLength(0);
  });

  it("no avisa de un gate que no está escalado a una persona", () => {
    writeFixtureTicket(raiz, {
      id: TICKET,
      riskLevel: "normal",
      workflowStatus: "planned",
    });
    appendReceipt(paths, TICKET, { ...reciboEscalado(), escalatedTo: null } as GateReceipt);
    expect(pendientes()).toHaveLength(0);
  });

  it("no vuelve a avisar de lo que ya salió", () => {
    // Es lo que permite correrlo desde un cron cada cinco minutos sin llenar el
    // celular de nadie: el token vivo es la prueba de que el aviso salió.
    preparar();
    expect(pendientes()).toHaveLength(1);

    const { runner } = runnerOk();
    hermesNotify(pedido({ runner }));
    expect(pendientes()).toHaveLength(0);
  });

  it("sí vuelve a intentar lo que no salió, pasada la espera", () => {
    // Un aviso que no salió no es un aviso. Si contara como tal, el reintento con
    // el canal ya sano saltearía el gate en silencio.
    preparar();
    const caido: CommandRunner = () => ({
      status: null,
      stdout: "",
      stderr: "",
      failed: true,
    });
    hermesNotify(pedido({ runner: caido }));
    expect(pendientes()).toHaveLength(0);

    const masTarde = new Date(AHORA.getTime() + 2 * 60 * 60 * 1000);
    expect(pendientesDeAvisar(paths, masTarde)).toHaveLength(1);
  });

  it("con el puente apagado no avisa, y dice cómo encenderlo", () => {
    preparar();
    const r = avisar({ config: { ...CONFIG, enabled: false } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("apagado");
    expect(r.stdout).toContain("enabled: true");
  });

  it("sin destino se niega y dice dónde se declara", () => {
    preparar();
    const r = avisar({ config: { ...CONFIG, gateTarget: "" } });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(".valmen/config.yaml");
    expect(r.stderr).toContain("--to");
  });

  it("avisa y lo cuenta", () => {
    preparar();
    const r = avisar();
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("avisados ahora            1");
    expect(r.stdout).toContain(TICKET);
    expect(pendientes()).toHaveLength(0);
  });

  it("cuando el canal no entrega, lo dice en vez de decir que no hay nada", () => {
    // Es la peor mentira que puede decir este informe: hay gates esperando y el
    // canal roto. Un resumen que sumara los intentos fallidos con los entregados
    // diría que todo está avisado justo cuando nada lo está.
    preparar();
    const caido: CommandRunner = () => ({
      status: null,
      stdout: "",
      stderr: "",
      failed: true,
    });
    const r = avisar({ runner: caido });

    expect(r.stdout).toContain("intentos sin entregar     1");
    expect(r.stdout).toContain("no está entregando");
    expect(r.stdout).toContain("hermes test");
    expect(r.stdout).not.toContain("No hay nada esperando");
  });

  it("separa lo que no se puede avisar a distancia de lo que sí", () => {
    preparar("critical");
    const r = avisar();
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("no avisables              1");
    expect(r.stdout).toContain("critical");
  });

  it("en `--json` devuelve el resumen como dato", () => {
    preparar();
    const r = avisar({ json: true });
    const resumen = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(resumen["notificados"]).toHaveLength(1);
    expect(resumen["sinEntregar"]).toBe(0);
    expect(resumen["entregados"]).toBe(1);
  });
});

describe("el parte", () => {
  const CONFIG = {
    enabled: true,
    gateTarget: "telegram",
    tokenHours: 24,
    allowedRisk: ["low", "normal"],
  };

  function armar(extra: Partial<Parameters<typeof armarParte>[0]> = {}) {
    return armarParte({ paths, config: CONFIG, now: AHORA, ...extra });
  }

  it("cuenta el gate que espera y el ticket que está en curso", () => {
    preparar();
    const parte = armar();
    expect(parte.gates).toEqual([{ ticket: TICKET, gate: "plan", code: null }]);
    expect(parte.enCurso).toEqual([{ id: TICKET, estado: "planned" }]);
    expect(parte.cerrados).toEqual([]);
  });

  it("lleva el código cuando ya se avisó", () => {
    // El parte es donde alguien mira el panorama; sin el código tendría que ir a
    // buscar el mensaje original para poder decidir.
    preparar();
    const { runner } = runnerOk();
    hermesNotify(pedido({ runner }));
    expect(armar().gates[0]?.code).toBe(pendingApprovals(paths, AHORA)[0]?.code);
  });

  it("deja de contar el gate cuando se decide", () => {
    preparar();
    decidir(notificar());
    expect(armar().gates).toEqual([]);
  });

  it("un ticket cerrado sale de «en curso» y entra en «cerrados»", () => {
    preparar();
    expect(armar().enCurso).toHaveLength(1);
    // El cierre se escribe con su bloque, que es lo que `closedOn` lee. Se
    // reemplaza el bloque **entero** —la fixture lo deja vacío— y no solo su
    // encabezado: dejar el `[]` de abajo pondría dos bloques JSON seguidos.
    const ruta = rutaTicket();
    const vacio = "## Cierre\n\n```json\n[]\n```\n";
    const conCierre =
      '## Cierre\n\n```json\n[{"kind":"ticket-close","id":"CLOSE-001",' +
      '"date":"2026-09-23","technical_summary":"x","functional_summary":"y",' +
      '"qa_status":"approved","qa_waiver_reason":null,"po_confirmation":null,' +
      '"release_impact":"unreleased"}]\n```\n';
    const texto = readFileSync(ruta, "utf8");
    expect(texto).toContain(vacio);
    writeFileSync(
      ruta,
      texto
        .replace("workflow_status: planned", "workflow_status: closed")
        .replace(vacio, conCierre),
      "utf8",
    );
    const parte = armar();
    expect(parte.enCurso).toEqual([]);
    expect(parte.cerrados).toEqual([TICKET]);
  });

  it("sin destino, se imprime en vez de fallar", () => {
    // El parte es útil en la terminal, y negarse a mostrarlo por no haber
    // configurado un canal sería convertir la falta de una comodidad en la falta
    // de la información.
    preparar();
    const r = hermesBrief({ paths, config: { ...CONFIG, gateTarget: "" }, now: AHORA });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("esperan tu decisión");
    expect(r.stdout).toContain("Para que además llegue al celular");
  });

  it("con destino, lo manda y lo muestra", () => {
    preparar();
    const { runner, cuerpos } = runnerOk();
    const r = hermesBrief({ paths, config: CONFIG, now: AHORA, runner });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Parte enviado a telegram");
    expect(cuerpos[0]).toContain(TICKET);
  });

  it("si el canal falla, el parte se imprime igual", () => {
    // El parte ya está armado: perderlo porque el canal falló obligaría a
    // recalcularlo para nada.
    preparar();
    const caido: CommandRunner = () => ({
      status: null,
      stdout: "",
      stderr: "",
      failed: true,
    });
    const r = hermesBrief({ paths, config: CONFIG, now: AHORA, runner: caido });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("No se pudo mandar");
    expect(r.stderr).toContain("esperan tu decisión");
  });

  it("en `--json` devuelve el parte como dato", () => {
    preparar();
    const r = hermesBrief({ paths, config: CONFIG, now: AHORA, json: true });
    const parte = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parte["proyecto"]).toBeTruthy();
    expect((parte["gates"] as unknown[]).length).toBe(1);
  });
});

describe("un proceso detenido", () => {
  const CONFIG = {
    enabled: true,
    gateTarget: "telegram",
    tokenHours: 24,
    allowedRisk: ["low", "normal"],
  };
  const CORRIDA = "deploy-saicloud-20260923T120000";

  /** Deja una corrida detenida esperando aprobación, como la dejaría el motor. */
  function detener(): void {
    writeRun(raiz, {
      runId: CORRIDA,
      processId: "deploy-saicloud",
      params: {},
      status: "waiting",
      pendingStep: "aprobar-canary",
      steps: [
        { id: "build", status: "ok", at: AHORA.toISOString(), detail: "npm run build" },
      ],
      startedAt: AHORA.toISOString(),
      updatedAt: AHORA.toISOString(),
      reason: "espera aprobación de `aprobar-canary`",
    });
  }

  function avisar(extra: Partial<Parameters<typeof hermesNotifyPendientes>[0]> = {}) {
    return hermesNotifyPendientes({
      paths,
      config: CONFIG,
      secret: SECRETO,
      now: AHORA,
      runner: runnerOk().runner,
      ...extra,
    });
  }

  it("entra en lo pendiente de avisar, con su proceso y su paso", () => {
    detener();
    expect(pendientesDeAvisar(paths, AHORA)).toEqual([
      {
        kind: "proceso",
        runId: CORRIDA,
        processId: "deploy-saicloud",
        step: "aprobar-canary",
      },
    ]);
  });

  it("el mensaje dice dónde sí se aprueba, y no lleva código", () => {
    // Un paso de proceso es el camino por el que se despliega, y aprobarlo desde
    // una pantalla de cinco pulgadas es exactamente lo que la regla dura prohíbe.
    detener();
    const { runner, cuerpos } = runnerOk();
    const r = avisar({ runner });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("deploy-saicloud");
    expect(cuerpos[0]).toContain("aprobar-canary");
    expect(cuerpos[0]).toContain("valmen process approve");
    expect(cuerpos[0]).toContain("valmen process resume");
    expect(cuerpos[0]).toContain("no se aprueba por acá");
    // Sin código: no hay nada que decidir a distancia.
    expect(cuerpos[0]).not.toMatch(/código +[0-9A-Z]{4}-[0-9A-Z]{4}/);
  });

  it("no se avisa dos veces de la misma corrida", () => {
    // Una corrida sigue detenida hasta que alguien la retoma: sin esta marca, un
    // cron la avisaría en cada vuelta.
    detener();
    avisar();
    expect(pendientesDeAvisar(paths, AHORA)).toEqual([]);
  });

  it("si el mensaje no salió, se reintenta", () => {
    // El aviso se anota **después** de que salió: al revés, el reintento lo
    // saltearía y nadie se enteraría de que el proceso está parado.
    detener();
    const caido: CommandRunner = () => ({
      status: null,
      stdout: "",
      stderr: "",
      failed: true,
    });
    const r = avisar({ runner: caido });

    expect(r.stdout).toContain("no se pudieron entregar");
    expect(pendientesDeAvisar(paths, AHORA)).toHaveLength(1);
  });

  it("un gate de ticket y un proceso detenido conviven en la misma corrida", () => {
    preparar();
    detener();
    const { runner, cuerpos } = runnerOk();
    const r = avisar({ runner });

    expect(r.stdout).toContain("avisados ahora            2");
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos.some((c) => c.includes("ESPERA TU DECISIÓN"))).toBe(true);
    expect(cuerpos.some((c) => c.includes("SE DETUVO ESPERANDO"))).toBe(true);
  });

  it("la corrida avisada queda en el registro, que es la prueba de que salió", () => {
    detener();
    avisar();
    expect(readApprovalLog(paths).filter((e) => e.kind === "process-notice")).toHaveLength(
      1,
    );
  });
});
