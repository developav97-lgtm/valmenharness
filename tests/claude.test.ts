/**
 * El lector de las sesiones de Claude Code.
 *
 * Qué prueba y por qué: la transcripción de Claude Code tiene tres trampas y las
 * tres se midieron en una sesión real antes de escribir el lector.
 *
 * 1. **Cada línea de asistente repite el `usage` de su mensaje.** Sumar las líneas
 *    infla el consumo varias veces (299 líneas para 55 mensajes cuando se midió).
 * 2. **El `cwd` cambia dentro de la sesión.** El proyecto no se decide por un `cwd`
 *    cualquiera.
 * 3. **La transcripción lleva todo lo que el agente leyó.** Una sesión que abrió
 *    `AGENTS.md` «menciona» veintiocho tickets sin haber trabajado ninguno.
 *
 * Los datos son sintéticos y se suman a mano: la sesión real sigue creciendo
 * mientras vive y un test que la leyera daría un número distinto cada día.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { leerSesionesDeClaude } from "../packages/server/src/claude.js";
import {
  carpetaDeClaude,
  escribirSesionDeClaude,
  lineaDeCola,
  lineaDeTitulo,
  llamada,
  mensajeDelAsistente,
  mensajeDelUsuario,
  mensajeSintetico,
  resultadoDeHerramienta,
  texto,
} from "./helpers/claude.js";

const ROOT = "/Users/yo/Proyectos/SaiOpenCloud";
const TICKET = "IMPROVEMENT-POS-MENSAJE-ORDEN-NO-FACTURADA-20261005";
const OTRO = "BUGFIX-RESTAURANTE-BONIFICADO-DESMARQUE-20261005";
const SESION = "9d55ce3b-5c13-4e93-af45-77a4977bd5c6";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-claude-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Una sesión mínima que pide el ticket y lo trabaja con una llamada al registro. */
function sesionQueTrabajaElTicket(
  id: string,
  ticket: string,
  extra: readonly string[] = [],
): string[] {
  return [
    mensajeDelUsuario(`Trabaja el ticket ${ticket}`, { cwd: ROOT }),
    ...mensajeDelAsistente(
      {
        id: `msg_${id}_1`,
        uso: { input: 2, creacion: 100, lectura: 1000, salida: 30 },
        bloques: [
          texto("Voy a moverlo."),
          llamada(`toolu_${id}_1`, "mcp__valmen__mover_ticket", { id: ticket, to: "analyzed" }),
        ],
      },
      { cwd: ROOT },
    ),
    ...extra,
  ];
}

describe("sumar el uso de una sesión", () => {
  it("cuenta cada mensaje una vez aunque aparezca en varias líneas", () => {
    // Tres líneas para el mensaje A —un texto y dos llamadas— y una para B. El uso
    // se repite en las tres líneas de A: sumar líneas daría 3·A + B.
    const lineas = [
      mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }),
      ...mensajeDelAsistente(
        {
          id: "msg_A",
          uso: { input: 10, creacion: 100, lectura: 1000, salida: 50 },
          bloques: [
            texto("Miro el registro."),
            llamada("toolu_1", "mcp__valmen__ver_ticket", { id: TICKET }),
            llamada("toolu_2", "mcp__valmen__mover_ticket", { id: TICKET, to: "analyzed" }),
          ],
        },
        { cwd: ROOT },
      ),
      ...mensajeDelAsistente(
        {
          id: "msg_B",
          uso: { input: 20, creacion: 200, lectura: 2000, salida: 70 },
          bloques: [texto("Listo.")],
        },
        { cwd: ROOT },
      ),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });

    expect(sesion?.mensajes).toBe(2);
    // La entrada nueva es la que no vino de caché más la que se escribió en caché.
    expect(sesion?.inputTokens).toBe(10 + 100 + 20 + 200);
    expect(sesion?.cacheReadTokens).toBe(1000 + 2000);
    expect(sesion?.outputTokens).toBe(50 + 70);

    // Y es un test que puede fallar: sumar las cuatro líneas da otro número.
    const sumandoLineas = 3 * (10 + 100) + (20 + 200);
    expect(sumandoLineas).not.toBe(sesion?.inputTokens);
  });

  it("si un mensaje repetido trae el uso parcial en alguna línea, gana el mayor", () => {
    const [primera, segunda] = [
      ...mensajeDelAsistente(
        { id: "msg_X", uso: { salida: 1 }, bloques: [texto("a")] },
        { cwd: ROOT },
      ),
      ...mensajeDelAsistente(
        { id: "msg_X", uso: { salida: 40 }, bloques: [texto("b")] },
        { cwd: ROOT },
      ),
    ];
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }), primera!, segunda!],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home });
    expect(sesion?.outputTokens).toBe(40);
    expect(sesion?.mensajes).toBe(1);
  });

  it("no cuenta como modelo ni como gasto el mensaje sintético", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }),
        ...mensajeDelAsistente(
          { id: "msg_1", uso: { salida: 25 }, bloques: [texto("hola")] },
          { cwd: ROOT },
        ),
        ...mensajeSintetico("msg_sintetico"),
      ],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home });
    expect(sesion?.mensajes).toBe(1);
    expect(sesion?.model).toBe("claude-sonnet-5-5");
    expect(sesion?.modelos.map((m) => m.model)).toEqual(["claude-sonnet-5-5"]);
  });

  it("una sesión sin modelo se lee, con el modelo vacío: no se le inventa uno", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }),
        ...mensajeDelAsistente(
          { id: "msg_1", modelo: null, uso: { salida: 25 }, bloques: [texto("hola")] },
          { cwd: ROOT },
        ),
      ],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion).toBeDefined();
    expect(sesion?.model).toBe("");
    expect(sesion?.modelos).toEqual([]);
    expect(sesion?.outputTokens).toBe(25);
  });

  it("una sesión sin un solo mensaje del asistente no tiene nada que medir", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT })],
    });

    expect(leerSesionesDeClaude(ROOT, { home })).toEqual([]);
  });

  it("si el modelo cambia a mitad, gana el que más produjo y la lista dice el resto", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }),
        ...mensajeDelAsistente(
          { id: "m1", modelo: "claude-haiku-4-5", uso: { salida: 100 }, bloques: [texto("a")] },
          { cwd: ROOT },
        ),
        ...mensajeDelAsistente(
          { id: "m2", modelo: "claude-sonnet-5-5", uso: { salida: 300 }, bloques: [texto("b")] },
          { cwd: ROOT },
        ),
        ...mensajeDelAsistente(
          { id: "m3", modelo: "claude-sonnet-5-5", uso: { salida: 50 }, bloques: [texto("c")] },
          { cwd: ROOT },
        ),
      ],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home });
    expect(sesion?.model).toBe("claude-sonnet-5-5");
    expect(sesion?.modelos).toEqual([
      { model: "claude-sonnet-5-5", mensajes: 2, outputTokens: 350 },
      { model: "claude-haiku-4-5", mensajes: 1, outputTokens: 100 },
    ]);
  });

  it("toma el título que Claude Code le puso a la sesión y la hora de su primera línea", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        lineaDeCola(`Trabaja ${TICKET}`),
        lineaDeTitulo("Mensaje orden no facturada"),
        ...sesionQueTrabajaElTicket("a", TICKET),
      ],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.title).toBe("Mensaje orden no facturada");
    // La primera línea del archivo es la cola (18:31:05.578), anterior al mensaje del
    // usuario: la sesión empieza cuando se escribió su primera línea con hora.
    expect(sesion?.startedAt).toBe(Date.parse("2026-10-05T18:31:05.578Z"));
  });
});

describe("las intervenciones sobre el registro", () => {
  it("cuenta las herramientas MCP del harness y el CLI por Bash, no cualquier herramienta", () => {
    const lineas = [
      mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }),
      ...mensajeDelAsistente(
        {
          id: "m1",
          bloques: [
            llamada("t1", "mcp__valmen__mover_ticket", { id: TICKET, to: "analyzed" }),
            llamada("t2", "mcp__valmen__ver_ticket", { id: TICKET }),
            // El servidor puede registrarse con el nombre del proyecto.
            llamada("t3", "mcp__valmen_saiopencloud__validar_ticket", { id: TICKET }),
            // Ni un MCP ajeno ni una herramienta propia del agente cuentan.
            llamada("t4", "mcp__ccd_session__spawn_task", { prompt: TICKET }),
            llamada("t5", "Edit", { file_path: "/x/y.ts" }),
            // El CLI por Bash cuenta, como en codex y en Hermes.
            llamada("t6", "Bash", { command: `valmen validate --id ${TICKET}` }),
            llamada("t7", "Bash", { command: "npm test" }),
          ],
        },
        { cwd: ROOT },
      ),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.intervenciones).toBe(4);
    // Todas esas llamadas son de un solo mensaje: «tocó el registro» se cuenta una vez.
    expect(sesion?.mensajesDelRegistro).toBe(1);
  });

  it("cuenta como fallidas las que devolvieron error", () => {
    const lineas = [
      mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: ROOT }),
      ...mensajeDelAsistente(
        {
          id: "m1",
          bloques: [
            llamada("t1", "mcp__valmen__mover_ticket", { id: TICKET, to: "approved" }),
            llamada("t2", "mcp__valmen__mover_ticket", { id: TICKET, to: "analyzed" }),
            llamada("t3", "Bash", { command: "ls" }),
          ],
        },
        { cwd: ROOT },
      ),
      resultadoDeHerramienta("t1", "No se puede saltar de intake a approved.", {
        cwd: ROOT,
        error: true,
      }),
      resultadoDeHerramienta("t2", "Movido.", { cwd: ROOT }),
      // Un error de una herramienta que no es del harness no es una intervención fallida.
      resultadoDeHerramienta("t3", "ls: no such file", { cwd: ROOT, error: true }),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.intervenciones).toBe(2);
    expect(sesion?.fallidas).toBe(1);
  });
});

describe("a qué proyecto pertenece una sesión", () => {
  it("entra una sesión de un worktree del proyecto, que vive en otra carpeta", () => {
    const worktree = `${ROOT}/.claude/worktrees/fix-uno`;
    // Es la carpeta real: `<proyecto>--claude-worktrees-<nombre>`.
    expect(carpetaDeClaude(worktree)).toBe(`${carpetaDeClaude(ROOT)}--claude-worktrees-fix-uno`);
    escribirSesionDeClaude(home, {
      root: worktree,
      id: "wt-1",
      lineas: [
        mensajeDelUsuario(`Trabaja ${TICKET}`, { cwd: worktree }),
        ...mensajeDelAsistente(
          {
            id: "m1",
            bloques: [llamada("t1", "mcp__valmen__mover_ticket", { id: TICKET, to: "analyzed" })],
          },
          { cwd: worktree },
        ),
      ],
    });

    const sesiones = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesiones.map((s) => s.id)).toEqual(["wt-1"]);
  });

  it("no mezcla otro proyecto, aunque su carpeta empiece igual", () => {
    // `/Proyectos/SaiOpenCloud-v2` da una carpeta que empieza como la del proyecto:
    // es un primer corte, y el `cwd` lo desmiente.
    const hermano = `${ROOT}-v2`;
    escribirSesionDeClaude(home, {
      root: hermano,
      id: "hermano",
      lineas: sesionQueTrabajaElTicket("h", TICKET).map((l) => l.replaceAll(ROOT, hermano)),
    });
    escribirSesionDeClaude(home, {
      root: "/Users/yo/Proyectos/Otro",
      id: "otro",
      lineas: sesionQueTrabajaElTicket("o", TICKET).map((l) =>
        l.replaceAll(ROOT, "/Users/yo/Proyectos/Otro"),
      ),
    });

    expect(leerSesionesDeClaude(ROOT, { home })).toEqual([]);
  });

  it("dos rutas que dan la misma carpeta no se confunden: el cwd decide", () => {
    // `/a/b-c` y `/a/b/c` dan `-a-b-c`. La carpeta es la misma y el `cwd` no.
    const mia = "/Users/yo/p/q";
    const colision = "/Users/yo/p-q";
    expect(carpetaDeClaude(mia)).toBe(carpetaDeClaude(colision));
    escribirSesionDeClaude(home, {
      root: colision,
      id: "colision",
      lineas: sesionQueTrabajaElTicket("c", TICKET).map((l) => l.replaceAll(ROOT, colision)),
    });

    expect(leerSesionesDeClaude(mia, { home })).toEqual([]);
    expect(leerSesionesDeClaude(colision, { home })).toHaveLength(1);
  });

  it("una sesión cuyo cwd cambia a /tmp a mitad sigue siendo del proyecto", () => {
    // Es el caso real: el agente entró a `/private/tmp` y a su carpeta de memoria, y
    // un lector que mirara el último `cwd` la sacaba del proyecto.
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        lineaDeCola(`Trabaja ${TICKET}`),
        ...sesionQueTrabajaElTicket("a", TICKET),
        mensajeDelUsuario("otra cosa", { cwd: "/private/tmp" }),
        ...mensajeDelAsistente({ id: "m9", bloques: [texto("ok")] }, { cwd: "/private/tmp" }),
      ],
    });

    expect(leerSesionesDeClaude(ROOT, { home, ticketId: TICKET })).toHaveLength(1);
  });

  it("deja fuera una sesión que no se tocó en la ventana de días", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: "vieja",
      lineas: sesionQueTrabajaElTicket("v", TICKET),
      modificado: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: "reciente",
      lineas: sesionQueTrabajaElTicket("r", TICKET),
    });

    expect(leerSesionesDeClaude(ROOT, { home }).map((s) => s.id)).toEqual(["reciente"]);
    expect(leerSesionesDeClaude(ROOT, { home, dias: 120 }).map((s) => s.id).sort()).toEqual([
      "reciente",
      "vieja",
    ]);
  });

  it("sin carpeta de Claude Code devuelve vacío, no un error", () => {
    expect(leerSesionesDeClaude(ROOT, { home })).toEqual([]);
    mkdirSync(join(home, ".claude", "projects"), { recursive: true });
    expect(leerSesionesDeClaude(ROOT, { home })).toEqual([]);
  });
});

describe("a qué ticket pertenece una sesión", () => {
  it("leer un ticket no es trabajarlo: una mención en lo que el agente abrió no atribuye", () => {
    // Es la sesión real: abrió AGENTS.md y la memoria, que nombran decenas de
    // tickets, y la transcripción los trae en resultados de herramientas.
    const lineas = [
      mensajeDelUsuario("Arregla el mensaje de la orden", { cwd: ROOT }),
      ...mensajeDelAsistente(
        { id: "m1", bloques: [llamada("t1", "Read", { file_path: "/x/AGENTS.md" })] },
        { cwd: ROOT },
      ),
      resultadoDeHerramienta("t1", `Visto en ${TICKET} y en ${OTRO}.`, { cwd: ROOT }),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    expect(leerSesionesDeClaude(ROOT, { home, ticketId: TICKET })).toEqual([]);
    expect(leerSesionesDeClaude(ROOT, { home, ticketId: OTRO })).toEqual([]);
    // Sin pedir un ticket, la sesión existe y no es de nadie.
    const [sesion] = leerSesionesDeClaude(ROOT, { home });
    expect(sesion?.tickets).toEqual([]);
    expect(sesion?.compartida).toBe(false);
  });

  it("lo que el usuario pidió atribuye cuando la sesión no escribió el registro", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        mensajeDelUsuario(`Implementa ${TICKET}`, { cwd: ROOT }),
        ...mensajeDelAsistente({ id: "m1", bloques: [texto("hecho")] }, { cwd: ROOT }),
      ],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.tickets.map((t) => t.id)).toEqual([TICKET]);
    expect(sesion?.compartida).toBe(false);
  });

  it("un mensaje que el cliente inyectó (meta) no es del usuario", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        mensajeDelUsuario(`Instrucciones de la skill: ${TICKET}`, { cwd: ROOT, meta: true }),
        ...mensajeDelAsistente({ id: "m1", bloques: [texto("hecho")] }, { cwd: ROOT }),
      ],
    });

    expect(leerSesionesDeClaude(ROOT, { home, ticketId: TICKET })).toEqual([]);
  });

  it("citar otro ticket al guardar un aprendizaje no hace compartida a la sesión", () => {
    // `guardar_aprendizaje` lleva los tickets donde se vio el patrón: son
    // referencias, no trabajo. Solo el campo `id` de una herramienta que escribe
    // dice sobre qué ticket actúa.
    const lineas = sesionQueTrabajaElTicket("a", TICKET, [
      ...mensajeDelAsistente(
        {
          id: "m2",
          bloques: [
            llamada("t2", "mcp__valmen__guardar_aprendizaje", {
              titulo: "Un patrón",
              cuerpo: `Se vio en ${OTRO}`,
              tickets: [TICKET, OTRO],
            }),
          ],
        },
        { cwd: ROOT },
      ),
    ]);
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.compartida).toBe(false);
    expect(sesion?.tickets.map((t) => t.id)).toEqual([TICKET]);
  });

  it("una sesión que escribió dos tickets es compartida y entra a la vista de cada uno", () => {
    const lineas = sesionQueTrabajaElTicket("a", TICKET, [
      ...mensajeDelAsistente(
        {
          id: "m2",
          bloques: [llamada("t2", "mcp__valmen__mover_ticket", { id: OTRO, to: "analyzed" })],
        },
        { cwd: ROOT },
      ),
    ]);
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    for (const ticketId of [TICKET, OTRO]) {
      const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId });
      expect(sesion?.compartida, ticketId).toBe(true);
      // El reparto son los tickets que trabajó, con su peso.
      expect(sesion?.tickets.map((t) => t.id).sort()).toEqual([OTRO, TICKET].sort());
      expect(sesion?.tickets.every((t) => t.trabajado)).toBe(true);
    }
  });

  it("lo que se escribió por el CLI atribuye, por el segmento que lo nombra", () => {
    // Sin que el usuario nombre el ticket: solo la escritura lo prueba. Un comando de
    // lectura sobre otro ticket en el mismo guion no lo trabaja: cada segmento
    // responde por los tickets que **él** nombra.
    const lineas = [
      mensajeDelUsuario("Sigue con lo que quedó pendiente", { cwd: ROOT }),
      ...mensajeDelAsistente(
        {
          id: "m1",
          bloques: [
            llamada("t1", "Bash", {
              command: `valmen transition --id ${TICKET} --entity ticket --to analyzed\ngrep -rn ${OTRO} tickets/`,
            }),
          ],
        },
        { cwd: ROOT },
      ),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.compartida).toBe(false);
    expect(sesion?.tickets.map((t) => t.id)).toEqual([TICKET]);
    expect(sesion?.intervenciones).toBe(1);
    expect(leerSesionesDeClaude(ROOT, { home, ticketId: OTRO })).toEqual([]);
  });

  it("leer otros tickets por el CLI no los trabaja: una sesión de diagnóstico no es compartida", () => {
    // El caso real que ajustó esta regla: una sesión que diagnosticaba el propio
    // harness corrió `valmen resume --id` sobre tres tickets y salía como compartida
    // en cada uno, con una entrada de consumo que el ticket no merecía.
    const lineas = [
      mensajeDelUsuario("Configura los modelos del harness", { cwd: ROOT }),
      ...mensajeDelAsistente(
        {
          id: "m1",
          bloques: [
            llamada("t1", "Bash", { command: `valmen resume --id ${TICKET} | head -70` }),
            llamada("t2", "Bash", { command: `valmen show ${OTRO} && valmen validate --id ${OTRO}` }),
            llamada("t3", "mcp__valmen__ver_ticket", { id: TICKET }),
            llamada("t4", "mcp__valmen__validar_ticket", { id: OTRO }),
          ],
        },
        { cwd: ROOT },
      ),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    for (const ticketId of [TICKET, OTRO]) {
      expect(leerSesionesDeClaude(ROOT, { home, ticketId }), ticketId).toEqual([]);
    }
    // Pero siguen contando como intervenciones sobre el registro, que lo son.
    const [sesion] = leerSesionesDeClaude(ROOT, { home });
    expect(sesion?.intervenciones).toBe(4);
    expect(sesion?.tickets).toEqual([]);
    expect(sesion?.compartida).toBe(false);
  });

  it("un id en el texto de lo que se escribe no es el ticket sobre el que se actúa", () => {
    // El caso que apareció al probar el lector sobre la sesión que lo construía: creó
    // un ticket con `--request` citando otro, y contar cualquier id del segmento la
    // hacía compartida entre los dos.
    const lineas = [
      mensajeDelUsuario("Registra el trabajo", { cwd: ROOT }),
      ...mensajeDelAsistente(
        {
          id: "m1",
          bloques: [
            llamada("t1", "Bash", {
              command:
                `valmen create --id ${TICKET} --title "Mensaje" --request "Caso real: ${OTRO} ` +
                `salía sin datos" && valmen gate plan --id=${TICKET} --evaluator cascade`,
            }),
            llamada("t2", "mcp__valmen__anotar_evidencia", {
              id: TICKET,
              description: `Mismo patrón que ${OTRO}`,
            }),
          ],
        },
        { cwd: ROOT },
      ),
    ];
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.compartida).toBe(false);
    expect(sesion?.tickets.map((t) => t.id)).toEqual([TICKET]);
    expect(leerSesionesDeClaude(ROOT, { home, ticketId: OTRO })).toEqual([]);
  });

  it("el objetivo del CLI se lee con `--id`, `--id=` y `--ticket`, con o sin comillas", () => {
    const comandos = [
      `valmen transition --id "${TICKET}" --entity ticket --to analyzed`,
      `valmen add-evidence --id='${TICKET}' --kind build --description x`,
      `valmen run --ticket ${TICKET}`,
    ];
    for (const [indice, comando] of comandos.entries()) {
      rmSync(join(home, ".claude"), { recursive: true, force: true });
      escribirSesionDeClaude(home, {
        root: ROOT,
        id: `s${indice}`,
        lineas: [
          mensajeDelUsuario("Sigue", { cwd: ROOT }),
          ...mensajeDelAsistente(
            { id: "m1", bloques: [llamada("t1", "Bash", { command: comando })] },
            { cwd: ROOT },
          ),
        ],
      });
      const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
      expect(sesion?.tickets.map((t) => t.id), comando).toEqual([TICKET]);
    }
  });

  it("una sesión que escribió un ticket y solo leyó otro es de uno solo", () => {
    const lineas = sesionQueTrabajaElTicket("a", TICKET, [
      ...mensajeDelAsistente(
        {
          id: "m2",
          bloques: [llamada("t2", "Bash", { command: `valmen resume --id ${OTRO}` })],
        },
        { cwd: ROOT },
      ),
    ]);
    escribirSesionDeClaude(home, { root: ROOT, id: SESION, lineas });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.compartida).toBe(false);
    expect(sesion?.tickets.map((t) => t.id)).toEqual([TICKET]);
    expect(leerSesionesDeClaude(ROOT, { home, ticketId: OTRO })).toEqual([]);
  });
});

describe("los subagentes", () => {
  it("su gasto es del ticket: se suma, y con él su modelo y sus llamadas al registro", () => {
    const padre = sesionQueTrabajaElTicket("a", TICKET);
    // Un subagente trae `sessionId` del padre y sus propios `message.id`, que no se
    // repiten con los del padre.
    const subagente = [
      mensajeDelUsuario(`Explora el código para ${TICKET}`, { cwd: `${ROOT}/FrontEnd` }),
      ...mensajeDelAsistente(
        {
          id: "msg_sub_1",
          modelo: "claude-haiku-4-5",
          uso: { input: 5, creacion: 50, lectura: 500, salida: 20 },
          bloques: [
            texto("Busco."),
            llamada("toolu_sub_1", "mcp__valmen__buscar_memoria", { consulta: "mensaje orden" }),
          ],
        },
        { cwd: `${ROOT}/FrontEnd` },
      ),
    ];
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: padre,
      subagentes: [subagente],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.subagentes).toBe(1);
    expect(sesion?.mensajes).toBe(2);
    expect(sesion?.inputTokens).toBe(2 + 100 + (5 + 50));
    expect(sesion?.cacheReadTokens).toBe(1000 + 500);
    expect(sesion?.outputTokens).toBe(30 + 20);
    // La mover_ticket del padre y la buscar_memoria del subagente.
    expect(sesion?.intervenciones).toBe(2);
    expect(sesion?.modelos.map((m) => m.model)).toEqual(["claude-sonnet-5-5", "claude-haiku-4-5"]);
    // El modelo que se registra es el que más produjo.
    expect(sesion?.model).toBe("claude-sonnet-5-5");
  });

  it("el prompt de un subagente no atribuye: lo escribió el agente, no el usuario", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [
        mensajeDelUsuario("Revisa el código", { cwd: ROOT }),
        ...mensajeDelAsistente({ id: "m1", bloques: [texto("voy")] }, { cwd: ROOT }),
        `${TICKET} aparece en el crudo del padre, pero no como prompt`,
      ],
      subagentes: [[mensajeDelUsuario(`Mira ${TICKET}`), ...mensajeDelAsistente({ id: "s1", bloques: [texto("x")] })]],
    });

    expect(leerSesionesDeClaude(ROOT, { home, ticketId: TICKET })).toEqual([]);
  });

  it("un subagente ilegible no tumba la sesión", () => {
    const ruta = escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: sesionQueTrabajaElTicket("a", TICKET),
      subagentes: [["esto no es json", "{cortado"]],
    });
    expect(ruta).toContain(SESION);

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.mensajes).toBe(1);
    expect(sesion?.subagentes).toBe(1);
  });
});

describe("una transcripción que se está escribiendo", () => {
  it("ignora la línea cortada del final y lee el resto", () => {
    escribirSesionDeClaude(home, {
      root: ROOT,
      id: SESION,
      lineas: [...sesionQueTrabajaElTicket("a", TICKET), '{"type":"assistant","message":{"id":"m'],
    });

    const [sesion] = leerSesionesDeClaude(ROOT, { home, ticketId: TICKET });
    expect(sesion?.mensajes).toBe(1);
  });
});
