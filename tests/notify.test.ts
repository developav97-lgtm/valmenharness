/**
 * La costura de notificación y el canal de Hermes.
 *
 * Lo que se prueba es una frontera, y la frontera tiene una propiedad que vale
 * más que las demás: **que un mensaje no llegue no puede romper el flujo**. La
 * notificación es una comodidad —el gate queda pendiente en Mission Control y en
 * el CLI igual—, así que el canal devuelve un recibo y nunca lanza. Si lanzara,
 * Hermes sería un punto único de fallo del harness entero, que es exactamente lo
 * contrario de lo que dice el diseño al elegir no reimplementar mensajería.
 *
 * El proceso se inyecta: sin esa costura, el camino de «entregó» solo se probaría
 * en una máquina con Hermes instalado y una plataforma configurada, o sea en
 * ninguna parte de forma determinista.
 */
import { describe, expect, it } from "vitest";

import {
  HERMES_CHANNEL_ID,
  hermesSendChannel,
  renderBrief,
  renderTestMessage,
  type CommandRunner,
} from "../packages/engine/src/index.js";

/** Un runner que anota lo que se le pidió y contesta lo que se le diga. */
function runnerFalso(respuesta: {
  status: number | null;
  stdout?: string;
  stderr?: string;
  failed?: boolean;
}): {
  runner: CommandRunner;
  llamadas: { command: string; args: readonly string[]; input: string }[];
} {
  const llamadas: { command: string; args: readonly string[]; input: string }[] = [];
  const runner: CommandRunner = (command, args, input) => {
    llamadas.push({ command, args, input });
    return {
      status: respuesta.status,
      stdout: respuesta.stdout ?? "",
      stderr: respuesta.stderr ?? "",
      failed: respuesta.failed ?? false,
    };
  };
  return { runner, llamadas };
}

const payload = { subject: "Asunto", body: "Cuerpo del mensaje", key: "k1" };

describe("el canal de Hermes", () => {
  it("se identifica con el nombre que va en la configuración", () => {
    const { runner } = runnerFalso({ status: 0 });
    expect(hermesSendChannel({ target: "telegram", runner }).id).toBe(HERMES_CHANNEL_ID);
  });

  it("manda el cuerpo por entrada estándar y no por un argumento", () => {
    // Un cuerpo con saltos de línea y comillas dentro de `argv` se parte: el día
    // que el texto incluya el título de un ticket escrito por alguien, la
    // notificación llega cortada o el proceso hace otra cosa.
    const { runner, llamadas } = runnerFalso({ status: 0 });
    const conComillas = 'Cuerpo con "comillas" y\nvarias\nlíneas';

    hermesSendChannel({ target: "telegram", runner }).notify({
      ...payload,
      body: conComillas,
    });

    const llamada = llamadas[0]!;
    expect(llamada.input).toBe(conComillas);
    expect(llamada.args).not.toContain(conComillas);
    // `--file -` fuerza la lectura por entrada estándar: sin el `-`, Hermes la
    // usa solo cuando no hay terminal, y esa condición no la controla el harness.
    expect(llamada.args).toContain("--file");
    expect(llamada.args[llamada.args.indexOf("--file") + 1]).toBe("-");
  });

  it("arma el comando con el destino y el asunto", () => {
    const { runner, llamadas } = runnerFalso({ status: 0 });
    hermesSendChannel({ target: "discord:#ops", runner }).notify(payload);

    expect(llamadas[0]!.command).toBe("hermes");
    expect(llamadas[0]!.args.slice(0, 3)).toEqual(["send", "--to", "discord:#ops"]);
    expect(llamadas[0]!.args).toContain("--subject");
    expect(llamadas[0]!.args).toContain("Asunto");
    expect(llamadas[0]!.args).toContain("--json");
  });

  it("el código de salida cero es el recibo de que salió", () => {
    const { runner } = runnerFalso({ status: 0 });
    const recibo = hermesSendChannel({ target: "telegram", runner }).notify(payload);
    expect(recibo.delivered).toBe(true);
    expect(recibo.target).toBe("telegram");
    expect(recibo.detail).toContain("telegram");
  });

  it("un destino inválido se informa como tal y no como una caída", () => {
    // El código 2 de `hermes send` es «se usó mal»: el destino no existe. Decir
    // «falló la entrega» mandaría a buscar el problema en la red cuando está en
    // el nombre que se escribió.
    const { runner } = runnerFalso({ status: 2, stderr: "unknown platform: telgram" });
    const recibo = hermesSendChannel({ target: "telgram", runner }).notify(payload);
    expect(recibo.delivered).toBe(false);
    expect(recibo.detail).toContain("no es válido");
    expect(recibo.detail).toContain("telgram");
  });

  it("un rechazo del destino trae el motivo, que es lo único que permite arreglarlo", () => {
    const { runner } = runnerFalso({ status: 1, stderr: "chat not found" });
    const recibo = hermesSendChannel({ target: "telegram:-1", runner }).notify(payload);
    expect(recibo.delivered).toBe(false);
    expect(recibo.detail).toContain("rechazó");
    expect(recibo.detail).toContain("chat not found");
  });

  it("recorta el motivo y no vuelca una traza entera en el registro", () => {
    const { runner } = runnerFalso({
      status: 1,
      stderr: ["linea uno", "linea dos", "linea tres", "linea cuatro"].join("\n"),
    });
    const recibo = hermesSendChannel({ target: "telegram", runner }).notify(payload);
    expect(recibo.detail).toContain("linea uno");
    expect(recibo.detail).toContain("linea tres");
    expect(recibo.detail).not.toContain("linea cuatro");
  });

  it("si Hermes no está instalado lo dice, en vez de hablar de la entrega", () => {
    const { runner } = runnerFalso({ status: null, failed: true });
    const recibo = hermesSendChannel({ target: "telegram", runner }).notify(payload);
    expect(recibo.delivered).toBe(false);
    expect(recibo.detail).toContain("no se pudo ejecutar");
    expect(recibo.detail).toContain("Hermes");
  });

  it("nunca lanza: devuelve un recibo en todos los caminos", () => {
    // Es la propiedad que sostiene el diseño entero. Si esto lanzara, un Hermes
    // caído tumbaría la evaluación de un gate, y la comodidad se habría vuelto
    // un requisito.
    for (const status of [0, 1, 2, null]) {
      const { runner } = runnerFalso({ status, failed: status === null });
      expect(() =>
        hermesSendChannel({ target: "telegram", runner }).notify(payload),
      ).not.toThrow();
    }
  });
});

describe("el mensaje de prueba", () => {
  it("lleva el proyecto y la fecha, para que se pueda ubicar", () => {
    const msg = renderTestMessage("/tmp/proyecto", new Date("2026-09-23T12:00:00Z"));
    expect(msg.body).toContain("/tmp/proyecto");
    expect(msg.body).toContain("2026-09-23T12:00:00.000Z");
    expect(msg.subject).toContain("prueba");
  });

  it("dice para qué sirve el canal, que es lo que la prueba no puede mostrar", () => {
    const msg = renderTestMessage("/tmp/proyecto", new Date("2026-09-23T12:00:00Z"));
    expect(msg.body).toContain("gate");
  });
});

describe("el parte", () => {
  /** Un parte mínimo, sin nada pendiente, para ir agregando bloques. */
  function parte(extra: Partial<Parameters<typeof renderBrief>[0]> = {}) {
    return renderBrief({
      proyecto: "SaiOpenCloud",
      fecha: "2026-09-24",
      gates: [],
      corridas: [],
      enCurso: [],
      cerrados: [],
      diasCerrados: 7,
      evaluaciones: null,
      costeUsd: null,
      decididasEnCodigo: null,
      notaConsumo: null,
      ...extra,
    });
  }

  it("los bloques vacíos no se imprimen", () => {
    // Un parte que dice «0 gates esperando», «0 procesos detenidos» y «0
    // cerrados» entrena a quien lo lee a saltearlo, y el día que tenga un gate
    // adentro también lo va a saltar.
    const cuerpo = parte().body;
    expect(cuerpo).toContain("Nada pendiente y nada en curso.");
    expect(cuerpo).not.toContain("gate(s) esperan");
    expect(cuerpo).not.toContain("detenido");
    expect(cuerpo).not.toContain("cerrado");
  });

  it("lo que espera una decisión va primero, con su código si lo tiene", () => {
    // Es lo único sobre lo que se puede hacer algo ahora, y el código es lo que
    // permite hacerlo sin abrir el portátil.
    const cuerpo = parte({
      gates: [
        { ticket: "FEATURE-INVENTARIO-API", gate: "plan", code: "5YF9-4NR5" },
        { ticket: "BUGFIX-POS-FILTRO", gate: "analysis", code: null },
      ],
      // Con un ticket en curso, para que el bloque exista y el orden se pueda
      // comparar: sin él los dos bloques se omiten y no hay nada que ordenar.
      enCurso: [{ id: "CHORE-DOCS-LEEME", estado: "in_progress" }],
    }).body;

    const posicionGate = cuerpo.indexOf("esperan tu decisión");
    const posicionCurso = cuerpo.indexOf("en curso");
    expect(posicionGate).toBeLessThan(posicionCurso);
    expect(cuerpo).toContain("código 5YF9-4NR5");
    // El que no tiene código igual se lista: el aviso puede no haber salido, y
    // esconderlo sería justo lo contrario de lo que hay que saber.
    expect(cuerpo).toContain("BUGFIX-POS-FILTRO · analysis");
  });

  it("una lista larga de cierres se corta diciendo que se cortó", () => {
    // Una lista truncada sin aviso se lee como la lista completa.
    const doce = Array.from({ length: 12 }, (_, i) => `TICKET-${i}`);
    const cuerpo = parte({ cerrados: doce }).body;
    expect(cuerpo).toContain("TICKET-7");
    expect(cuerpo).not.toContain("TICKET-8");
    expect(cuerpo).toContain("y 4 más");
  });

  it("el consumo va al final, con lo decidido en código", () => {
    const cuerpo = parte({
      evaluaciones: 12,
      costeUsd: 4.1234,
      decididasEnCodigo: 9,
    }).body;
    expect(cuerpo).toContain("$4.1234 en 12 evaluación(es) · 9 decididas en código");
  });

  it("si el consumo no se pudo calcular, lo dice en vez de omitirlo", () => {
    const cuerpo = parte({ notaConsumo: "un ticket no parsea" }).body;
    expect(cuerpo).toContain("Sin el consumo: un ticket no parsea");
  });

  it("el asunto y la clave llevan el proyecto y la fecha", () => {
    // La clave incluye la fecha: el parte de un día no reemplaza al del anterior,
    // y el mismo parte no se manda dos veces el mismo día.
    const msg = parte();
    expect(msg.subject).toContain("SaiOpenCloud");
    expect(msg.subject).toContain("2026-09-24");
    expect(msg.key).toBe("parte:2026-09-24");
  });
});
