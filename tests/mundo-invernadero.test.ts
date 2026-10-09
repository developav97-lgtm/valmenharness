/**
 * El mundo «Invernadero» de la vista Agentes (FEATURE-WEB-MUNDO-INVERNADERO-20261008).
 * Sin navegador: un contexto de lienzo falso registra las llamadas y los agentes de
 * escena se fabrican a mano, así que todo es determinista.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validarMundo } from "../packages/server/web/agentes/motor.js";
import {
  aparienciaDe,
  arrodillado,
  cosecha,
  gotas,
  llevaPregunta,
  macetaEnMano,
  mundo,
  piesDibujados,
  regadera,
  sobresDelSemillero,
  xDeCantero,
} from "../packages/server/web/agentes/mundos/invernadero.js";

const WEB = join(import.meta.dirname, "..", "packages", "server", "web");
const AHORA = Date.parse("2026-10-09T12:00:00.000Z");
const hace = (s: number) => new Date(AHORA - s * 1000).toISOString();

interface Llamada {
  metodo: string;
  args: unknown[];
}

/** Un contexto de lienzo que acepta cualquier llamada y la registra. */
function contextoFalso(ancho = 960) {
  const llamadas: Llamada[] = [];
  const estado: Record<string, unknown> = { canvas: { width: ancho, height: ancho / 2 }, fillStyle: "" };
  const ctx = new Proxy(estado, {
    get(destino, propiedad: string) {
      if (propiedad in destino) return destino[propiedad];
      return (...args: unknown[]) => {
        llamadas.push({ metodo: propiedad, args });
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
    x: 580,
    y: 296,
    fila: { agente: "a1", ticket: "T-1", pregunta: null },
    ...extra,
  };
}

const conRespuesta = (hizoHace: number, extra: Record<string, unknown> = {}) =>
  agente({ estacion: 3, fila: { agente: "a1", ticket: "T-1", pregunta: { respondidaEn: hace(hizoHace) } }, ...extra });

describe("el mundo invernadero", () => {
  it("C1: validarMundo no reporta errores", () => {
    expect(validarMundo(mundo)).toEqual([]);
  });

  it("C2: la miniatura con una escena vacía, sin cola y sin ahoraMs no lanza", () => {
    const { ctx } = contextoFalso(160);
    expect(() => mundo.dibujar({ ctx, escena: { agentes: new Map(), t: 0 }, miniatura: true }, 0)).not.toThrow();
  });

  it("C3: el puesto principal es el semillero, en { x: 75, y: 296 }", () => {
    expect(mundo.puestoPrincipal).toEqual({ x: 75, y: 296 });
  });

  it("C4: la sesión principal lleva la banda verde", () => {
    expect(aparienciaDe(agente({ principal: true, estado: "principal", fila: { ticket: null } })).bandaColor).toBe("#3f8f4a");
  });

  it("C5: un subagente quieto con ticket está arrodillado, de paja, banda dorada y peto azul", () => {
    expect(aparienciaDe(agente())).toEqual({ sombrero: "paja", bandaColor: "#e8b84a", delantal: "#4a5e8a", pantalon: "#4a5e8a", sentado: true });
  });

  it("C6: las estaciones son las del cultivo", () => {
    expect(mundo.estaciones).toEqual(["Semilla", "Brote", "Hojas", "Riego de Anita", "Crecimiento", "Floración", "Fruto", "Cosecha"]);
  });

  it("C7: la posición depende de la estación y del carril", () => {
    for (let i = 0; i < 8; i++) {
      for (let carril = 0; carril <= 5; carril++) {
        expect(mundo.posicion(i, carril)).toEqual({ x: 180 + 100 * i + ((carril % 3) - 1) * 11, y: 296 });
      }
    }
  });

  it("C8: xDeCantero es 150 + 100 * i", () => {
    for (let i = 0; i < 8; i++) expect(xDeCantero(i)).toBe(150 + 100 * i);
  });

  it("C9: un subagente trabajando, quieto y con ticket está arrodillado", () => {
    expect(arrodillado(agente())).toBe(true);
  });

  it("C10: un subagente que camina no está arrodillado", () => {
    expect(arrodillado(agente({ moviendo: true }))).toBe(false);
  });

  it("C11: un subagente que terminó y está quieto no está arrodillado", () => {
    expect(arrodillado(agente({ estado: "termino" }))).toBe(false);
  });

  it("C12: los pies de un jardinero arrodillado en y = 296 se dibujan en 322", () => {
    expect(piesDibujados(agente({ y: 296 }))).toBe(322);
    expect(piesDibujados(agente({ y: 296, moviendo: true }))).toBe(296);
  });

  it("C13: la maceta en mano de quien camina en la estación 5 es la etapa 2", () => {
    expect(macetaEnMano(agente({ moviendo: true, estacion: 5 }))).toBe(2);
  });

  it("C14: quieto no lleva maceta", () => {
    expect(macetaEnMano(agente())).toBeNull();
  });

  it("C15: la escena completa escribe SEMILLERO una sola vez", () => {
    const { ctx, llamadas } = contextoFalso();
    mundo.dibujar({ ctx, escena: { agentes: new Map([["a1", agente()]]), t: 0 }, miniatura: false, cola: ["T-2"], entregados: [], ahoraMs: AHORA }, 0);
    expect(llamadas.filter((l) => l.metodo === "fillText" && l.args[0] === "SEMILLERO")).toHaveLength(1);
  });

  it("C16: con un esperando en la estación 3 la regadera flota", () => {
    expect(regadera([agente({ estado: "esperando", estacion: 3 })], 3, 0).flota).toBe(true);
  });

  it("C17: sin esperando la regadera cuelga a 282", () => {
    expect(regadera([agente()], 5, 0)).toEqual({ flota: false, y: 282 });
  });

  it("C18: la regadera flotando oscila alrededor de 226", () => {
    expect(regadera([agente({ estado: "esperando", estacion: 3 })], 3, Math.PI / 6).y).toBeCloseTo(230, 10);
  });

  it("C19: esperando y quieto lleva la pregunta", () => {
    expect(llevaPregunta({ estado: "esperando", moviendo: false })).toBe(true);
  });

  it("C20: esperando y caminando no lleva la pregunta", () => {
    expect(llevaPregunta({ estado: "esperando", moviendo: true })).toBe(false);
  });

  it("C21: una respuesta de hace 30 s hace caer 14 gotas", () => {
    expect(gotas([conRespuesta(30)], AHORA, 60000, 0)).toHaveLength(14);
  });

  it("C22: una respuesta de hace 61 s no hace caer gotas", () => {
    expect(gotas([conRespuesta(61)], AHORA, 60000, 0)).toEqual([]);
  });

  it("C23: las gotas de un jardinero en x = 480 caen entre 440 y 469", () => {
    for (const g of gotas([conRespuesta(5, { x: 480 })], AHORA, 60000, 1.7)) {
      expect(g.x).toBeGreaterThanOrEqual(440);
      expect(g.x).toBeLessThanOrEqual(469);
    }
  });

  it("C24: las gotas no tienen azar: mismos argumentos, misma lista", () => {
    const filas = [conRespuesta(5)];
    expect(gotas(filas, AHORA, 60000, 0.9)).toEqual(gotas(filas, AHORA, 60000, 0.9));
  });

  it("C25: con cinco en cola el semillero muestra tres sobres", () => {
    expect(sobresDelSemillero(["a", "b", "c", "d", "e"])).toHaveLength(3);
  });

  it("C26: el tercer sobre está en x = 90", () => {
    expect(sobresDelSemillero(["a", "b", "c", "d"])[2]!.x).toBe(90);
  });

  it("C27: con doce entregados la cosecha muestra los nueve últimos", () => {
    const doce = Array.from({ length: 12 }, (_, i) => `e${i}`);
    expect(cosecha(doce).map((c: { id: string }) => c.id)).toEqual(doce.slice(-9));
  });

  it("C28: los paneles se llaman Bitácora de cultivo, Semillero y Cosecha", () => {
    expect(mundo.paneles).toEqual({ agentes: "Bitácora de cultivo", cola: "Semillero", entregados: "Cosecha" });
  });

  const lineasConColor = (archivo: string) =>
    readFileSync(archivo, "utf8")
      .split("\n")
      .map((texto, i) => ({ texto, n: i + 1 }))
      .filter(({ texto }) => !/^\s*\/\//.test(texto))
      .filter(({ texto }) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(texto));

  it("C29: invernadero.js no usa Math.random", () => {
    expect(readFileSync(join(WEB, "agentes", "mundos", "invernadero.js"), "utf8")).not.toContain("Math.random");
  });

  it("C30: toda línea de invernadero.js con un color lleva valmen:allow-color", () => {
    const sinMarca = lineasConColor(join(WEB, "agentes", "mundos", "invernadero.js")).filter(({ texto }) => !texto.includes("valmen:allow-color"));
    expect(sinMarca).toEqual([]);
  });

  it("C31: cada valmen:allow-color del CSS de paneles de index.html nombra el invernadero", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const desde = html.indexOf("/* Cuaderno del invernadero");
    const hasta = html.indexOf("/* Telemetría del centro de control", desde);
    expect(desde).toBeGreaterThan(0);
    expect(hasta).toBeGreaterThan(desde);
    const colores = html.slice(desde, hasta).split("\n").filter((l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(l));
    expect(colores.length).toBeGreaterThan(0);
    for (const linea of colores) {
      expect(linea).toContain("valmen:allow-color");
      expect(linea.split("valmen:allow-color")[1]!.toLowerCase()).toContain("invernadero");
    }
  });
});
