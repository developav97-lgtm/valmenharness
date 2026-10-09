/**
 * La vista muestra el texto de la pregunta y la respuesta (FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008).
 * El texto viene de la conversación de un agente: se escapa siempre, y la prueba lo demuestra con
 * un documento falso que lanza si alguien asigna `innerHTML`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { avisosDePregunta, cajaDeAviso } from "../packages/server/web/agentes/montaje.js";
import { mundo as control, ajustarAlAncho, franja } from "../packages/server/web/agentes/mundos/control.js";
import { mundo as invernadero } from "../packages/server/web/agentes/mundos/invernadero.js";
import { mundo as pasteleria } from "../packages/server/web/agentes/mundos/pasteleria.js";

const WEB = join(import.meta.dirname, "..", "packages", "server", "web");
const AHORA = Date.parse("2026-10-09T12:00:00.000Z");
const hace = (s: number) => new Date(AHORA - s * 1000).toISOString();
const HOSTIL = `<script>alert("x")</script><b>'negrita'</b> & "comillas"`;
const MUNDO = { pregunta: "línea 1 abierta" };

const abierta = (extra: Record<string, unknown> = {}) => [
  { agente: "a1", ticket: "FEATURE-WEB", pregunta: { desde: hace(40), respondidaEn: null, ...extra } },
];
const respondida = (extra: Record<string, unknown> = {}) => [
  { agente: "a1", ticket: "FEATURE-WEB", pregunta: { desde: hace(60), respondidaEn: hace(10), ...extra } },
];
const BASE_PENDIENTE = {
  tipo: "pendiente",
  encabezado: "Pregunta pendiente para una persona",
  quien: "una persona",
  ticket: "FEATURE-WEB",
  hace: "hace 40 s",
  expresion: MUNDO.pregunta,
};

interface Nodo {
  tag: string;
  className: string;
  textContent: string;
  children: Nodo[];
  append: (...n: Nodo[]) => void;
}
function documentoFalso() {
  const creados: Nodo[] = [];
  const doc = {
    createElement(tag: string): Nodo {
      const n: Record<string, unknown> = { tag, className: "", textContent: "", children: [] as Nodo[] };
      n.append = (...hijos: Nodo[]) => (n.children as Nodo[]).push(...hijos);
      Object.defineProperty(n, "innerHTML", {
        set() {
          throw new Error("innerHTML asignado");
        },
      });
      creados.push(n as unknown as Nodo);
      return n as unknown as Nodo;
    },
  };
  return { doc, creados };
}

/** Un contexto 2D falso: 7 px por carácter, y registra cada fillText. */
function contexto() {
  const textos: string[] = [];
  const medidos: string[] = [];
  const ctx = new Proxy(
    { canvas: { width: 960, height: 480 }, fillStyle: "" } as Record<string, unknown>,
    {
      get(d, p: string) {
        if (p === "measureText") return (s: string) => (medidos.push(s), { width: Array.from(s).length * 7 });
        if (p === "fillText") return (s: string) => void textos.push(s);
        if (p in d) return d[p];
        return () => undefined;
      },
      set(d, p: string, v) {
        d[p] = v;
        return true;
      },
    },
  );
  return { ctx, textos, medidos };
}

const operador = (estacion: number, pregunta: Record<string, unknown> | null, ticket = "FEATURE-WEB-X") => ({
  id: "a1",
  estado: pregunta ? "esperando" : "trabajando",
  estacion,
  moviendo: false,
  carril: 0,
  paso: 0,
  principal: false,
  x: 130,
  y: 420,
  fila: { agente: "a1", ticket, pregunta, ultimaHerramienta: "Read" },
});
const preguntaAbierta = (texto?: string) => ({ desde: hace(40), respondidaEn: null, ...(texto === undefined ? {} : { texto }) });

function dibujarCon(mundo: typeof control, texto: string | undefined) {
  const { ctx, textos } = contexto();
  const a = operador(3, preguntaAbierta(texto));
  mundo.dibujar({ ctx, escena: { agentes: new Map([["a1", a]]), t: 0 }, miniatura: false, cola: [], entregados: [], ahoraMs: AHORA }, 0);
  return textos;
}

describe("la vista muestra el texto de la pregunta y la respuesta", () => {
  it("C1: el aviso pendiente lleva el texto", () => {
    const [aviso] = avisosDePregunta(abierta({ texto: "¿Apruebo el plan de FEATURE-X?" }), AHORA, MUNDO);
    expect(aviso.texto).toBe("¿Apruebo el plan de FEATURE-X?");
  });
  it("C2: el aviso respondio lleva la respuesta", () => {
    const [aviso] = avisosDePregunta(respondida({ respuesta: "Sí, aprobado." }), AHORA, MUNDO);
    expect(aviso.respuesta).toBe("Sí, aprobado.");
  });
  it("C3: sin la clave texto el aviso es el de siempre", () => {
    expect(avisosDePregunta(abierta(), AHORA, MUNDO)).toEqual([BASE_PENDIENTE]);
  });
  it("C4: texto null no agrega la clave", () => {
    const [aviso] = avisosDePregunta(abierta({ texto: null }), AHORA, MUNDO);
    expect(aviso).toEqual(BASE_PENDIENTE);
    expect("texto" in aviso).toBe(false);
  });
  it("C5: texto en blanco no agrega la clave", () => {
    const [aviso] = avisosDePregunta(abierta({ texto: "   \n " }), AHORA, MUNDO);
    expect(aviso).toEqual(BASE_PENDIENTE);
    expect("texto" in aviso).toBe(false);
  });
  it("C6: sin la clave respuesta el aviso respondio es el de siempre", () => {
    expect(avisosDePregunta(respondida(), AHORA, MUNDO)).toEqual([
      { tipo: "respondio", encabezado: "una persona respondió", ticket: "FEATURE-WEB", hace: "hace 10 s" },
    ]);
  });
  it("C7: la caja pone el texto hostil como textContent exacto", () => {
    const { doc } = documentoFalso();
    const [aviso] = avisosDePregunta(abierta({ texto: HOSTIL }), AHORA, MUNDO);
    const caja = cajaDeAviso(doc, aviso) as unknown as Nodo;
    const texto = caja.children.find((h) => h.className === "texto");
    expect(texto?.textContent).toBe(HOSTIL);
  });
  it("C8: la caja no asigna innerHTML en ningún elemento", () => {
    const { doc, creados } = documentoFalso();
    const [aviso] = avisosDePregunta(abierta({ texto: HOSTIL }), AHORA, MUNDO);
    expect(() => cajaDeAviso(doc, aviso)).not.toThrow();
    expect(creados.length).toBeGreaterThan(1);
  });
  it("C9: la caja del aviso respondio muestra la respuesta", () => {
    const { doc } = documentoFalso();
    const [aviso] = avisosDePregunta(respondida({ respuesta: "Sí, aprobado." }), AHORA, MUNDO);
    const caja = cajaDeAviso(doc, aviso) as unknown as Nodo;
    expect(caja.children.find((h) => h.className === "texto")?.textContent).toBe("Sí, aprobado.");
  });
  it("C10: sin texto la caja tiene rotulo, id y resultado, en ese orden", () => {
    const { doc } = documentoFalso();
    const [aviso] = avisosDePregunta(abierta(), AHORA, MUNDO);
    const caja = cajaDeAviso(doc, aviso) as unknown as Nodo;
    expect(caja.children.map((h) => h.className)).toEqual(["rotulo", "id", "resultado"]);
  });
  it("C11: index.html no asigna innerHTML", () => {
    expect(readFileSync(join(WEB, "index.html"), "utf8")).not.toMatch(/innerHTML\s*=/);
  });
  it("C12: pintarAvisos arma la caja con modulo.cajaDeAviso(document, aviso)", () => {
    expect(readFileSync(join(WEB, "index.html"), "utf8")).toContain("modulo.cajaDeAviso(document, aviso)");
  });
  it("C13: el CSS declara .corrida-aviso .texto con pre-wrap", () => {
    expect(readFileSync(join(WEB, "index.html"), "utf8")).toMatch(/\.corrida-aviso \.texto\s*\{[^}]*white-space:\s*pre-wrap/);
  });
  it("C14: la franja usa el texto real", () => {
    expect(franja([operador(3, preguntaAbierta("¿Despliego a staging?"))]).texto).toBe(
      "ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Despliego a staging?",
    );
  });
  it("C15: la franja reduce saltos de línea y espacios", () => {
    expect(franja([operador(3, preguntaAbierta("línea uno\n\nlínea dos"))]).texto.endsWith("línea uno línea dos")).toBe(true);
  });
  it("C16: sin texto en la estación 3 conserva el texto inferido", () => {
    expect(franja([operador(3, preguntaAbierta())]).texto).toBe("ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Apruebo el plan?");
  });
  it("C17: sin texto en la estación 5 conserva el texto inferido", () => {
    expect(franja([operador(5, preguntaAbierta())]).texto.endsWith("¿Pasaron tus pruebas?")).toBe(true);
  });
  it("C18: ajustarAlAncho recorta 500 caracteres a 128 como máximo con «…»", () => {
    const { ctx } = contexto();
    const r = ajustarAlAncho(ctx, "a".repeat(500), 896);
    expect(Array.from(r).length).toBeLessThanOrEqual(128);
    expect(r.endsWith("…")).toBe(true);
  });
  it("C19: ajustarAlAncho deja intacto un texto corto", () => {
    const { ctx } = contexto();
    expect(ajustarAlAncho(ctx, "a".repeat(20), 896)).toBe("a".repeat(20));
  });
  it("C20: el centro de control escribe el texto hostil literal en la franja", () => {
    expect(dibujarCon(control, HOSTIL).some((t) => t.includes(`<script>alert("x")</script>`))).toBe(true);
  });
  it("C21: la franja con 500 caracteres cabe en 896 px", () => {
    const { ctx, textos } = contexto();
    const a = operador(3, preguntaAbierta("x".repeat(500)));
    control.dibujar({ ctx, escena: { agentes: new Map([["a1", a]]), t: 0 }, miniatura: false, cola: [], entregados: [], ahoraMs: AHORA }, 0);
    const franjaEscrita = textos.find((t) => t.startsWith("ESPERANDO A ANITA"));
    expect(franjaEscrita).toBeDefined();
    expect(Array.from(franjaEscrita as string).length * 7).toBeLessThanOrEqual(896);
    expect((franjaEscrita as string).endsWith("…")).toBe(true);
  });
  it("C22: la pastelería no pasa el texto a fillText", () => {
    expect(dibujarCon(pasteleria as typeof control, HOSTIL).some((t) => t.includes("script"))).toBe(false);
  });
  it("C23: el invernadero no pasa el texto a fillText", () => {
    expect(dibujarCon(invernadero as typeof control, HOSTIL).some((t) => t.includes("script"))).toBe(false);
  });
  it("C24: montaje.js no referencia document fuera de un parámetro", () => {
    expect(readFileSync(join(WEB, "agentes", "montaje.js"), "utf8")).not.toContain("document.");
  });
});
