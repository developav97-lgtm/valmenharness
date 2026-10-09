/**
 * El mundo «Pastelería» de la vista Agentes (FEATURE-WEB-MUNDO-PASTELERIA-20261008).
 * Sin navegador: un contexto de lienzo falso registra las llamadas y los agentes de
 * escena se fabrican a mano, así que todo es determinista.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validarMundo } from "../packages/server/web/agentes/motor.js";
import { crearMontaje, VENTANA_RESPUESTA_MS } from "../packages/server/web/agentes/montaje.js";
import {
  aparienciaDe,
  comandasDelPase,
  etapaDelPastel,
  hornoEncendido,
  llevaPregunta,
  mundo,
  senalDelMostrador,
  pastelesDeLaVitrina,
} from "../packages/server/web/agentes/mundos/pasteleria.js";
import { cuadroDeMarcha, dibujarPersonaje, rasgosDe } from "../packages/server/web/agentes/mundos/sprites.js";

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
  return { estado: "trabajando", estacion: 4, moviendo: false, carril: 0, paso: 0, principal: false, fila: { ticket: "T-1", pregunta: null }, ...extra };
}

describe("el mundo pastelería", () => {
  it("C1: validarMundo no reporta errores", () => {
    expect(validarMundo(mundo)).toEqual([]);
  });

  it("C2: el montaje entrega a dibujar la cola, los entregados y la hora de montar", () => {
    const recibidos: Record<string, unknown>[] = [];
    const espia = { ...mundo, dibujar: (estado: Record<string, unknown>) => void recibidos.push(estado) };
    let pendiente: (() => void) | null = null;
    const montaje = crearMontaje({
      mundos: [espia],
      pedirCuadro: (f: () => void) => {
        pendiente = f;
        return 1;
      },
      cancelarCuadro: () => undefined,
      ahora: () => AHORA,
    });
    const lienzo = { getContext: () => ({}) };
    montaje.montar(lienzo, [], AHORA, { cola: ["T-A", "T-B"], entregados: ["T-C"] });
    pendiente!();
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({ cola: ["T-A", "T-B"], entregados: ["T-C"], ahoraMs: AHORA, ventanaRespuestaMs: VENTANA_RESPUESTA_MS, miniatura: false });
  });

  it("C3: montar con tres argumentos entrega una cola vacía", () => {
    const recibidos: Record<string, unknown>[] = [];
    const espia = { ...mundo, dibujar: (estado: Record<string, unknown>) => void recibidos.push(estado) };
    let pendiente: (() => void) | null = null;
    const montaje = crearMontaje({
      mundos: [espia],
      pedirCuadro: (f: () => void) => {
        pendiente = f;
        return 1;
      },
      cancelarCuadro: () => undefined,
      ahora: () => AHORA,
    });
    montaje.montar({ getContext: () => ({}) }, [], AHORA);
    pendiente!();
    expect(recibidos[0]?.cola).toEqual([]);
    expect(recibidos[0]?.entregados).toEqual([]);
  });

  it("C4: el puesto principal es el pase, en { x: 64, y: 364 }", () => {
    expect(mundo.puestoPrincipal).toEqual({ x: 64, y: 364 });
  });

  it("C5: dos identificadores en la cola son dos comandas", () => {
    expect(comandasDelPase(["T-A", "T-B"])).toHaveLength(2);
  });

  it("C6: cada comanda queda dentro del ancho del pase, de 16 a 112", () => {
    const cola = Array.from({ length: 12 }, (_, i) => `T-${i}`);
    for (const c of comandasDelPase(cola)) {
      expect(c.x).toBeGreaterThanOrEqual(16);
      expect(c.x).toBeLessThanOrEqual(112);
    }
  });

  it("C7: cada estado visual tiene una apariencia distinta", () => {
    const apariencias = ["trabajando", "esperando", "termino", "principal"].map((estado) => JSON.stringify(aparienciaDe({ estado, carril: 1 })));
    expect(new Set(apariencias).size).toBe(4);
  });

  it("C8: esperando con pregunta abierta en approved enciende la lámpara", () => {
    const a = agente({ estado: "esperando", estacion: 3, fila: { ticket: "T-1", pregunta: { desde: hace(10), respondidaEn: null } } });
    expect(senalDelMostrador([a], AHORA, VENTANA_RESPUESTA_MS).lampara).toBe(true);
  });

  it("C9: sin pregunta abierta la lámpara está apagada", () => {
    expect(senalDelMostrador([agente({ estacion: 3 })], AHORA, VENTANA_RESPUESTA_MS).lampara).toBe(false);
  });

  it("C10: una pregunta respondida hace 30 s deja al PO en la ventanilla", () => {
    const a = agente({ estacion: 3, fila: { ticket: "T-1", pregunta: { desde: hace(90), respondidaEn: hace(30) } } });
    expect(senalDelMostrador([a], AHORA, VENTANA_RESPUESTA_MS).ventanilla).toBe(true);
  });

  it("C11: una pregunta respondida hace 61 s no deja al PO en la ventanilla", () => {
    const a = agente({ estacion: 3, fila: { ticket: "T-1", pregunta: { desde: hace(120), respondidaEn: hace(61) } } });
    expect(senalDelMostrador([a], AHORA, VENTANA_RESPUESTA_MS).ventanilla).toBe(false);
  });

  it("C12: esperando y quieto lleva la pregunta", () => {
    expect(llevaPregunta({ estado: "esperando", moviendo: false })).toBe(true);
  });

  it("C13: esperando pero caminando no lleva la pregunta", () => {
    expect(llevaPregunta({ estado: "esperando", moviendo: true })).toBe(false);
  });

  it("C14: las estaciones son las ocho del obrador", () => {
    expect(mundo.estaciones).toEqual(["Pedidos", "Recetario", "Báscula", "Mostrador", "Horno", "Degustación", "Control", "Vitrina"]);
  });

  it("C15: cada puesto queda en y = 364 y a no más de 22 px de su estación", () => {
    for (let i = 0; i < 8; i++) {
      for (let carril = 0; carril <= 2; carril++) {
        const p = mundo.posicion(i, carril);
        expect(p.y).toBe(364);
        expect(Math.abs(p.x - (180 + 101 * i))).toBeLessThanOrEqual(22);
      }
    }
  });

  it("C16: la etapa del pastel es la estación del agente", () => {
    expect(etapaDelPastel({ estacion: 5 })).toBe(5);
  });

  it("C17: el horno se enciende con un agente trabajando, quieto, en la estación 4", () => {
    expect(hornoEncendido([agente({ estado: "trabajando", moviendo: false, estacion: 4 })])).toBe(true);
  });

  it("C18: el horno no se enciende si el único agente de la estación 4 espera", () => {
    expect(hornoEncendido([agente({ estado: "esperando", estacion: 4 })])).toBe(false);
  });

  it("C19: con ocho tickets cerrados la vitrina muestra los ocho", () => {
    const ocho = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id, estado: "closed" }));
    expect(pastelesDeLaVitrina(ocho).map((t) => t.id)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("C20: los paneles se llaman Comandas, En espera y Vitrina", () => {
    expect(mundo.paneles).toEqual({ agentes: "Comandas", cola: "En espera", entregados: "Vitrina" });
  });

  const lineasConColor = (archivo: string) =>
    readFileSync(archivo, "utf8")
      .split("\n")
      .map((texto, i) => ({ texto, n: i + 1 }))
      .filter(({ texto }) => !/^\s*\/\//.test(texto))
      .filter(({ texto }) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(texto));

  it("C21: toda línea de pasteleria.js con un color lleva valmen:allow-color", () => {
    const sinMarca = lineasConColor(join(WEB, "agentes", "mundos", "pasteleria.js")).filter(({ texto }) => !texto.includes("valmen:allow-color"));
    expect(sinMarca).toEqual([]);
  });

  it("C22: toda línea de sprites.js con un color lleva valmen:allow-color", () => {
    const sinMarca = lineasConColor(join(WEB, "agentes", "mundos", "sprites.js")).filter(({ texto }) => !texto.includes("valmen:allow-color"));
    expect(sinMarca).toEqual([]);
  });

  it("C23: al caminar los cuadros de marcha son 0, 1, 0, 2", () => {
    const cuadros = [0, 1, 2, 3].map((paso) => cuadroDeMarcha({ moviendo: true, paso }));
    expect(cuadros).toEqual([0, 1, 0, 2]);
  });

  it("C24: un agente quieto usa el cuadro 0", () => {
    for (const paso of [0, 1, 2, 3, 7]) expect(cuadroDeMarcha({ moviendo: false, paso })).toBe(0);
  });

  it("C25: rasgosDe devuelve lo mismo para el mismo carril", () => {
    expect(rasgosDe(2)).toEqual(rasgosDe(2));
    expect(rasgosDe(1)).not.toEqual(rasgosDe(2));
  });

  it("C26: el sprite de un pastelero quieto mide 48 px de alto y cabe en 36 px sobre sus pies", () => {
    const { ctx, llamadas } = contextoFalso();
    dibujarPersonaje(ctx, { moviendo: false, paso: 0, carril: 0 }, 300, 364);
    const cajas = llamadas.filter((l) => l.metodo === "fillRect").map((l) => l.args as number[]);
    expect(cajas.length).toBeGreaterThan(0);
    const izquierda = Math.min(...cajas.map(([x]) => x!));
    const derecha = Math.max(...cajas.map(([x, , w]) => x! + w!));
    const arriba = Math.min(...cajas.map(([, y]) => y!));
    const abajo = Math.max(...cajas.map(([, y, , h]) => y! + h!));
    expect(abajo - arriba).toBe(48);
    expect(abajo).toBe(364);
    expect(izquierda).toBeGreaterThanOrEqual(300 - 18);
    expect(derecha).toBeLessThanOrEqual(300 + 18);
  });

  it("C27: la sesión principal lleva la insignia en el pecho y los demás no", () => {
    const insignia = (principal: boolean) => {
      const { ctx, llamadas } = contextoFalso();
      dibujarPersonaje(ctx, { moviendo: false, paso: 0, carril: 0, principal }, 300, 364);
      return llamadas.filter((l) => l.metodo === "fillRect" && (l.args as number[]).join() === [297, 364 - 48 + 22, 6, 6].join());
    };
    expect(insignia(true)).toHaveLength(1);
    expect(insignia(false)).toHaveLength(0);
  });

  it("C29: dibujar la miniatura con una escena vacía y sin cola no lanza", () => {
    const { ctx } = contextoFalso(160);
    expect(() => mundo.dibujar({ ctx, escena: { agentes: new Map(), t: 0 }, miniatura: true }, 0)).not.toThrow();
  });

  it("dibuja una escena con pasteleros, pregunta, comandas y vitrina sin lanzar", () => {
    const { ctx, llamadas } = contextoFalso();
    const agentes = new Map([
      ["a", agente({ x: 584, y: 364, estacion: 4 })],
      ["b", agente({ x: 483, y: 364, estacion: 3, estado: "esperando", fila: { ticket: "T-2", pregunta: { desde: hace(5), respondidaEn: null } } })],
      ["c", agente({ x: 400, y: 364, moviendo: true, paso: 1, estacion: 2 })],
      ["p", agente({ x: 64, y: 364, principal: true, estado: "principal", fila: { ticket: null, pregunta: null } })],
    ]);
    expect(() =>
      mundo.dibujar({ ctx, escena: { agentes, t: 1 }, miniatura: false, cola: ["T-3", "T-4"], entregados: ["T-5"], ahoraMs: AHORA, ventanaRespuestaMs: VENTANA_RESPUESTA_MS }, 1),
    ).not.toThrow();
    expect(llamadas.some((l) => l.metodo === "fillText" && l.args[0] === "?")).toBe(true);
  });

  it("C31: cada valmen:allow-color del CSS de paneles de index.html nombra la pastelería", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const desde = html.indexOf("/* Pizarra de la pastelería");
    const hasta = html.indexOf(".corrida-cuenta {", desde);
    expect(desde).toBeGreaterThan(0);
    expect(hasta).toBeGreaterThan(desde);
    const bloque = html.slice(desde, hasta).split("\n");
    const colores = bloque.filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l));
    expect(colores.length).toBeGreaterThan(0);
    for (const linea of colores) {
      expect(linea).toContain("valmen:allow-color");
      expect(linea.split("valmen:allow-color")[1]!.toLowerCase()).toContain("pastelería");
    }
  });
});
