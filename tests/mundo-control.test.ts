/**
 * El mundo «Centro de control» de la vista Agentes (FEATURE-WEB-MUNDO-CONTROL-20261008).
 * Sin navegador: un contexto de lienzo falso registra las llamadas y los agentes de
 * escena se fabrican a mano, así que todo es determinista.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validarMundo } from "../packages/server/web/agentes/motor.js";
import {
  anchoDeBarra,
  aparienciaDelDirector,
  aparienciaDelOperador,
  avanzarPuntos,
  colorDeFranja,
  crearMemoria,
  franja,
  memoriaDePuntos,
  monitorDe,
  mundo,
  telefono,
  ticketsEnPantalla,
  xDePantalla,
} from "../packages/server/web/agentes/mundos/control.js";
import { dibujarPersonaje } from "../packages/server/web/agentes/mundos/sprites.js";

const WEB = join(import.meta.dirname, "..", "packages", "server", "web");
const AHORA = Date.parse("2026-10-09T12:00:00.000Z");
const hace = (s: number) => new Date(AHORA - s * 1000).toISOString();

interface Llamada {
  metodo: string;
  args: unknown[];
  estilo: unknown;
}

/** Un contexto de lienzo que acepta cualquier llamada y la registra. */
function contextoFalso(ancho = 960) {
  const llamadas: Llamada[] = [];
  const estado: Record<string, unknown> = { canvas: { width: ancho, height: ancho / 2 }, fillStyle: "" };
  const ctx = new Proxy(estado, {
    get(destino, propiedad: string) {
      if (propiedad in destino) return destino[propiedad];
      return (...args: unknown[]) => {
        llamadas.push({ metodo: propiedad, args, estilo: destino.fillStyle });
      };
    },
    set(destino, propiedad: string, valor) {
      destino[propiedad] = valor;
      return true;
    },
  });
  return { ctx, llamadas };
}

function agente(extra: Record<string, unknown> = {}) {
  return {
    id: "a1",
    estado: "trabajando",
    estacion: 4,
    moviendo: false,
    carril: 0,
    paso: 0,
    principal: false,
    x: 130,
    y: 420,
    fila: { agente: "a1", ticket: "T-1", pregunta: null, ultimaHerramienta: "Read" },
    ...extra,
  };
}

const conPregunta = (estacion: number, pregunta: unknown, extra: Record<string, unknown> = {}) =>
  agente({ estado: "esperando", estacion, fila: { agente: "a1", ticket: "FEATURE-WEB-MUNDO-CONTROL-20261008", pregunta }, ...extra });

describe("el mundo centro de control", () => {
  it("C1: validarMundo no reporta errores", () => {
    expect(validarMundo(mundo)).toEqual([]);
  });

  it("C2: la miniatura con una escena vacía y sin cola no lanza", () => {
    const { ctx } = contextoFalso(160);
    expect(() => mundo.dibujar({ ctx, escena: { agentes: new Map(), t: 0 }, miniatura: true }, 0)).not.toThrow();
  });

  it("C3: la miniatura entre dos cuadros no cambia la x guardada del punto de un operador", () => {
    const op = agente({ id: "m1", estacion: 2, fila: { agente: "m1", ticket: "T-9", pregunta: null } });
    const agentes = new Map([["m1", op]]);
    const completo = contextoFalso();
    mundo.dibujar({ ctx: completo.ctx, escena: { agentes, t: 0 }, miniatura: false }, 0);
    op.estacion = 3;
    mundo.dibujar({ ctx: completo.ctx, escena: { agentes, t: 0.25 }, miniatura: false }, 0.25);
    const antes = memoriaDePuntos.puntos.get("m1")!.x;
    expect(antes).toBe(340);
    const pequena = contextoFalso(160);
    mundo.dibujar({ ctx: pequena.ctx, escena: { agentes, t: 0.25 }, miniatura: true }, 0.25);
    mundo.dibujar({ ctx: pequena.ctx, escena: { agentes, t: 5 }, miniatura: true }, 5);
    expect(memoriaDePuntos.puntos.get("m1")!.x).toBe(antes);
  });

  it("C4: el puesto principal es la tarima, en { x: 480, y: 282 }", () => {
    expect(mundo.puestoPrincipal).toEqual({ x: 480, y: 282 });
  });

  it("C5: el director está sentado, de camisa azul y con gafas", () => {
    expect(aparienciaDelDirector()).toEqual({ sentado: true, camisa: "#1e2c55", sombrero: "gafas" });
  });

  it("C6: la consola depende solo del carril: x = 130 + 175 * (carril % 5), y = 420", () => {
    for (let i = 0; i < 8; i++) {
      for (let carril = 0; carril < 10; carril++) {
        expect(mundo.posicion(i, carril)).toEqual({ x: 130 + 175 * (carril % 5), y: 420 });
      }
    }
  });

  it("C7: las estaciones son las ocho de la sala", () => {
    expect(mundo.estaciones).toEqual(["Ingreso", "Análisis", "Plan", "Autorización", "Ejecución", "Pruebas", "QA", "Cierre"]);
  });

  it("C8: la x de cada pantalla es 78 + 116 * i", () => {
    for (let i = 0; i < 8; i++) expect(xDePantalla(i)).toBe(78 + 116 * i);
  });

  it("C9: un operador en la estación 4 aparece en su pantalla", () => {
    expect(ticketsEnPantalla([agente({ estacion: 4 })], [], 4)).toContain("T-1");
  });

  it("C10: los entregados aparecen en la pantalla 7", () => {
    expect(ticketsEnPantalla([], ["E-1", "E-2"], 7)).toContain("E-2");
  });

  it("C11: cinco operadores en la estación 2 son tres tickets en su pantalla", () => {
    const cinco = [0, 1, 2, 3, 4].map((n) => agente({ id: `o${n}`, carril: n, estacion: 2, fila: { agente: `o${n}`, ticket: `T-${n}`, pregunta: null } }));
    expect(ticketsEnPantalla(cinco, [], 2)).toHaveLength(3);
  });

  it("C12: el ancho de la barra de la pantalla i es 92 * (i + 1) / 8", () => {
    for (let i = 0; i < 8; i++) expect(anchoDeBarra(i)).toBe((92 * (i + 1)) / 8);
  });

  it("C13: dibujar sin miniatura escribe «REQUIERE PERSONA» exactamente dos veces", () => {
    const { ctx, llamadas } = contextoFalso();
    mundo.dibujar({ ctx, escena: { agentes: new Map([["a1", agente()]]), t: 0 }, miniatura: false, cola: [], entregados: [] }, 0);
    expect(llamadas.filter((l) => l.metodo === "fillText" && l.args[0] === "REQUIERE PERSONA")).toHaveLength(2);
  });

  it("C14: el monitor de un operador esperando en t = 0 es ámbar con «ESPERA»", () => {
    expect(monitorDe(agente({ estado: "esperando" }), 0)).toEqual({ color: "#f2a52a", rotulo: "ESPERA" });
  });

  it("C15: el monitor de un operador que terminó es azul con «CERRADA»", () => {
    expect(monitorDe(agente({ estado: "termino" }), 0)).toEqual({ color: "#5b8dff", rotulo: "CERRADA" });
  });

  it("C16: el monitor de un operador trabajando lleva el color de su carril y el primer segmento del ticket", () => {
    const a = agente({ carril: 0, fila: { agente: "a1", ticket: "FEATURE-WEB-X-1", pregunta: null } });
    expect(monitorDe(a, 0)).toEqual({ color: "#2f9e6b77", rotulo: "FEATURE" });
  });

  it("C17: con dos operadores trabajando y sin pregunta la franja cuenta dos misiones activas", () => {
    const dos = [agente(), agente({ id: "a2", carril: 1, fila: { agente: "a2", ticket: "T-2", pregunta: null } })];
    expect(franja(dos)).toEqual({ alerta: false, texto: "TURNO DE NOCHE · 2 MISIONES ACTIVAS" });
  });

  it("C18: con una pregunta abierta en la estación 3 la franja espera a Anita y pregunta por el plan", () => {
    const a = conPregunta(3, { desde: hace(10), respondidaEn: null });
    expect(franja([a]).texto).toBe("ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Apruebo el plan?");
    expect(franja([a]).alerta).toBe(true);
  });

  it("C19: con una pregunta abierta en la estación 5 la franja pregunta por las pruebas", () => {
    const a = conPregunta(5, { desde: hace(10), respondidaEn: null });
    expect(franja([a]).texto.endsWith("¿Pasaron tus pruebas?")).toBe(true);
  });

  it("C20: la franja en alerta alterna de color a 2 Hz", () => {
    expect(colorDeFranja(true, 0)).not.toBe(colorDeFranja(true, 0.5));
    expect(colorDeFranja(false, 0)).toBe(colorDeFranja(false, 0.5));
  });

  it("C21: con una pregunta abierta el teléfono está encendido", () => {
    const a = conPregunta(3, { desde: hace(10), respondidaEn: null });
    expect(telefono([a], AHORA, 60000).encendido).toBe(true);
  });

  it("C22: con una pregunta respondida hace 30 s Anita está en línea", () => {
    const a = conPregunta(3, { desde: hace(90), respondidaEn: hace(30) });
    expect(telefono([a], AHORA, 60000).anitaEnLinea).toBe(true);
  });

  it("C23: con una pregunta respondida hace 61 s Anita ya no está en línea", () => {
    const a = conPregunta(3, { desde: hace(120), respondidaEn: hace(61) });
    expect(telefono([a], AHORA, 60000).anitaEnLinea).toBe(false);
  });

  const escenaDePunto = () => {
    const memoria = crearMemoria();
    const op = agente({ id: "p1", estacion: 2, fila: { agente: "p1", ticket: "T-1", pregunta: null } });
    avanzarPuntos(memoria, [op], 0);
    return { memoria, op };
  };

  it("C24: el punto de un operador nuevo en la estación 2 nace en x = 310", () => {
    expect(escenaDePunto().memoria.puntos.get("p1")!.x).toBe(310);
  });

  it("C25: al pasar a la estación 3 y avanzar 0.5 s el punto está en x = 370", () => {
    const { memoria, op } = escenaDePunto();
    op.estacion = 3;
    avanzarPuntos(memoria, [op], 0.5);
    expect(memoria.puntos.get("p1")!.x).toBe(370);
  });

  it("C26: tras avanzar 2 s más el punto llega a x = 426 y se detiene", () => {
    const { memoria, op } = escenaDePunto();
    op.estacion = 3;
    avanzarPuntos(memoria, [op], 0.5);
    avanzarPuntos(memoria, [op], 2.5);
    expect(memoria.puntos.get("p1")!.x).toBe(426);
    expect(memoria.puntos.get("p1")!.moviendo).toBe(false);
    avanzarPuntos(memoria, [], 3);
    expect(memoria.puntos.size).toBe(0);
  });

  it("C27: el sprite de un operador quieto ocupa 36 px de alto y no pasa de 36 px de ancho", () => {
    const { ctx, llamadas } = contextoFalso();
    const a = { moviendo: false, paso: 0, carril: 0 };
    dibujarPersonaje(ctx, a, 130, 420, aparienciaDelOperador(a));
    const cajas = llamadas.filter((l) => l.metodo === "fillRect").map((l) => l.args as number[]);
    const izquierda = Math.min(...cajas.map(([x]) => x!));
    const derecha = Math.max(...cajas.map(([x, , w]) => x! + w!));
    const arriba = Math.min(...cajas.map(([, y]) => y!));
    const abajo = Math.max(...cajas.map(([, y, , h]) => y! + h!));
    expect(abajo - arriba).toBe(36);
    expect(derecha - izquierda).toBeLessThanOrEqual(36);
    expect(izquierda).toBeGreaterThanOrEqual(130 - 18);
    expect(derecha).toBeLessThanOrEqual(130 + 18);
  });

  it("C28: el operador que camina va de pie y con auricular", () => {
    expect(aparienciaDelOperador({ moviendo: true })).toEqual({ sentado: false, sombrero: "auricular" });
    expect(aparienciaDelOperador({ moviendo: false }).sentado).toBe(true);
  });

  it("C29: los paneles se llaman Telemetría, Misiones en espera y Misiones cerradas", () => {
    expect(mundo.paneles).toEqual({ agentes: "Telemetría", cola: "Misiones en espera", entregados: "Misiones cerradas" });
  });

  it("C30: toda línea de control.js con un color lleva valmen:allow-color", () => {
    const sinMarca = readFileSync(join(WEB, "agentes", "mundos", "control.js"), "utf8")
      .split("\n")
      .map((texto, i) => ({ texto, n: i + 1 }))
      .filter(({ texto }) => !/^\s*\/\//.test(texto))
      .filter(({ texto }) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(texto))
      .filter(({ texto }) => !texto.includes("valmen:allow-color"));
    expect(sinMarca).toEqual([]);
  });

  it("C31: cada valmen:allow-color del CSS del centro de control de index.html nombra el centro de control", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const desde = html.indexOf("/* Telemetría del centro de control");
    const hasta = html.indexOf("/* Pizarra de la pastelería", desde);
    expect(desde).toBeGreaterThan(0);
    expect(hasta).toBeGreaterThan(desde);
    const colores = html.slice(desde, hasta).split("\n").filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l));
    expect(colores.length).toBeGreaterThan(0);
    for (const linea of colores) {
      expect(linea).toContain("valmen:allow-color");
      expect(linea.split("valmen:allow-color")[1]!.toLowerCase()).toContain("centro de control");
    }
  });

  it("dibuja una escena con director, operadores, pregunta, cola y entregados sin lanzar", () => {
    const { ctx, llamadas } = contextoFalso();
    const agentes = new Map([
      ["p", agente({ id: "p", x: 480, y: 282, principal: true, estado: "principal", fila: { agente: "p", ticket: null, pregunta: null } })],
      ["a", agente({ id: "a", estacion: 4 })],
      ["b", conPregunta(3, { desde: hace(5), respondidaEn: null }, { id: "b", carril: 1, x: 305 })],
      ["c", agente({ id: "c", carril: 2, moviendo: true, paso: 1, estacion: 6, x: 400 })],
      ["d", agente({ id: "d", carril: 3, estado: "termino", estacion: 7 })],
    ]);
    expect(() =>
      mundo.dibujar({ ctx, escena: { agentes, t: 1 }, miniatura: false, cola: ["T-3", "T-4"], entregados: ["T-5"], ahoraMs: AHORA, ventanaRespuestaMs: 60000 }, 1),
    ).not.toThrow();
    expect(llamadas.some((l) => l.metodo === "fillText" && String(l.args[0]).startsWith("ESPERANDO A ANITA"))).toBe(true);
  });
});
