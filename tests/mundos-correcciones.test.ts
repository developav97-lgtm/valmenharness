/**
 * Correcciones de los tres mundos tras la revisión del PO (IMPROVEMENT-WEB-MUNDOS-CORRECCIONES-20261009).
 * Sin navegador: un contexto de lienzo falso registra las llamadas y la escena se fabrica a mano.
 * Cada `describe` lleva el prefijo «Cn:» de los criterios que cubre.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { crearMontaje } from "../packages/server/web/agentes/montaje.js";
import {
  SALIDA_MS,
  actualizar,
  avanzar,
  carrilLibre,
  crearEscena,
  ticketsPorEstacion,
} from "../packages/server/web/agentes/motor.js";
import { mundo as control } from "../packages/server/web/agentes/mundos/control.js";
import {
  TOPE_POR_CANTERO,
  mundo as invernadero,
  plantasDelCantero,
  xDeCantero,
} from "../packages/server/web/agentes/mundos/invernadero.js";
import {
  TOPE_POR_PUESTO,
  mundo as pasteleria,
  pastelesDeLaVitrina,
  pastelesDelPuesto,
  repartoDeLaPasteleria,
} from "../packages/server/web/agentes/mundos/pasteleria.js";

const WEB = join(import.meta.dirname, "..", "packages", "server", "web");
const INDEX = readFileSync(join(WEB, "index.html"), "utf8");

interface Llamada {
  metodo: string;
  args: unknown[];
}

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

const tickets = (n: number, estado: string) => Array.from({ length: n }, (_, i) => ({ id: `T-${estado}-${i}`, estado }));

function fila(agente: string, sobre: Record<string, unknown> = {}) {
  return {
    agente,
    principal: false,
    estado: "trabajando",
    ticket: `T-${agente}`,
    ticketEstado: "in_progress",
    faseConfirmada: null,
    faseInferida: null,
    ultimaHerramienta: null,
    pregunta: null,
    ...sobre,
  };
}

function agenteDeEscena(extra: Record<string, unknown> = {}) {
  return {
    id: "a1", estado: "trabajando", estacion: 4, moviendo: false, carril: 0, paso: 0, principal: false, x: 550, y: 296,
    fila: { agente: "a1", ticket: "T-1", pregunta: null },
    ...extra,
  };
}

/** Las llamadas a `translate` que ubican una planta o un pastel a media escala. */
const ubicaciones = (llamadas: Llamada[]) =>
  llamadas.filter((l) => l.metodo === "translate").map((l) => ({ x: l.args[0] as number, y: l.args[1] as number }));

describe("C1-C6: el reparto de tickets por estación", () => {
  it("C1: 12 tickets en awaiting_user_tests dan 9 en la estación 5 del invernadero", () => {
    const reparto = ticketsPorEstacion(tickets(12, "awaiting_user_tests"), TOPE_POR_CANTERO);
    expect(reparto[5]).toHaveLength(9);
  });

  it("C2: 8 tickets en awaiting_user_tests dan 8 en la estación 5 del invernadero", () => {
    expect(ticketsPorEstacion(tickets(8, "awaiting_user_tests"), TOPE_POR_CANTERO)[5]).toHaveLength(8);
  });

  it("C3: 10 tickets en in_progress dan 6 en la estación 4 de la pastelería", () => {
    expect(repartoDeLaPasteleria(tickets(10, "in_progress"))[4]).toHaveLength(6);
  });

  it("C4: 12 tickets cerrados dan 9 pasteles en la vitrina", () => {
    expect(pastelesDeLaVitrina(tickets(12, "closed"))).toHaveLength(9);
  });

  it("C5: un ticket en qa_approved cuenta en la estación 7", () => {
    expect(ticketsPorEstacion(tickets(1, "qa_approved"), 9)[7]).toHaveLength(1);
  });

  it("C6: un ticket en blocked no cuenta en ninguna estación", () => {
    const reparto = ticketsPorEstacion([...tickets(1, "blocked"), ...tickets(1, "changes_requested"), { id: "x", estado: null }], 9);
    expect(reparto.flat()).toHaveLength(0);
  });
});

describe("C7-C8: las posiciones caben en su tierra y su mostrador", () => {
  it("C7: las 9 posiciones de planta de un cantero quedan en la tierra (x ± 40, y de 310 a 368)", () => {
    for (let i = 0; i < 8; i++) {
      const posiciones = plantasDelCantero(i, 9);
      expect(posiciones).toHaveLength(9);
      for (const p of posiciones) {
        expect(Math.abs(p.x - xDeCantero(i))).toBeLessThanOrEqual(40);
        expect(p.y).toBeGreaterThanOrEqual(310);
        expect(p.y).toBeLessThanOrEqual(368);
      }
      expect(new Set(posiciones.map((p) => `${p.x},${p.y}`)).size).toBe(9);
    }
  });

  it("C8: las 6 posiciones de pastel de un puesto quedan en su tramo de mostrador (x ± 50)", () => {
    for (let i = 0; i < 7; i++) {
      const posiciones = pastelesDelPuesto(i, 9);
      expect(posiciones).toHaveLength(TOPE_POR_PUESTO);
      for (const p of posiciones) expect(Math.abs(p.x - (180 + i * 101))).toBeLessThanOrEqual(50);
      expect(new Set(posiciones.map((p) => `${p.x},${p.y}`)).size).toBe(6);
    }
  });
});

describe("C9-C11: el dibujo pinta un objeto por ticket y no por agente", () => {
  it("C9: tres tickets en in_progress y ningún agente pintan 3 plantas en el cantero 4", () => {
    const { ctx, llamadas } = contextoFalso();
    invernadero.dibujar({ ctx, escena: { agentes: new Map(), t: 0 }, miniatura: false, tickets: tickets(3, "in_progress") }, 0);
    const enElCantero = ubicaciones(llamadas).filter((u) => Math.abs(u.x - xDeCantero(4)) <= 40);
    expect(enElCantero).toHaveLength(3);
  });

  it("C10: un jardinero arrodillado y ningún ticket no pintan plantas en los canteros", () => {
    const { ctx, llamadas } = contextoFalso();
    const agentes = new Map([["a1", agenteDeEscena({ x: xDeCantero(4) })]]);
    invernadero.dibujar({ ctx, escena: { agentes, t: 0 }, miniatura: false, tickets: [] }, 0);
    expect(ubicaciones(llamadas)).toHaveLength(0);
  });

  it("C11: un pastelero quieto y ningún ticket no pintan pasteles sobre el mostrador", () => {
    const { ctx, llamadas } = contextoFalso();
    const agentes = new Map([["a1", agenteDeEscena({ x: 584, y: 364 })]]);
    pasteleria.dibujar({ ctx, escena: { agentes, t: 0 }, miniatura: false, tickets: [] }, 0);
    expect(ubicaciones(llamadas)).toHaveLength(0);
  });
});

describe("C12-C13: los tickets llegan hasta el mundo", () => {
  it("C12: montar entrega al dibujar del mundo los tickets de datos.tickets", () => {
    const recibidos: unknown[] = [];
    const mundoEspia = { ...invernadero, dibujar: (estado: { tickets: unknown }) => recibidos.push(estado.tickets) };
    let cuadro: (() => void) | null = null;
    const montaje = crearMontaje({
      mundos: [mundoEspia],
      pedirCuadro: (f: () => void) => {
        cuadro = f;
        return 1;
      },
      cancelarCuadro: () => undefined,
    });
    const lienzo = { getContext: () => ({}) };
    const lista = tickets(2, "planned");
    montaje.montar(lienzo, [], 0, { tickets: lista });
    cuadro!();
    expect(recibidos[0]).toBe(lista);
    montaje.montar(lienzo, [], 0, {});
    cuadro!();
    expect(recibidos[1]).toEqual([]);
  });

  it("C13: la vista Corrida pasa cada ticket de idsDeLaCorrida con su workflowStatus", () => {
    const fuente = (nombre: string) => {
      const m = INDEX.match(new RegExp(`function ${nombre}\\([^)]*\\) \\{[\\s\\S]*?\\n      \\}`));
      expect(m, nombre).not.toBeNull();
      return m![0];
    };
    const ticketsDeLaEscena = new Function(
      `${fuente("idsDeLaCorrida")}\n${fuente("estadoDeRegistro")}\n${fuente("ticketsDeLaEscena")}\nreturn ticketsDeLaEscena;`,
    )() as (a: unknown, f: unknown, t: unknown) => unknown;
    const resultado = ticketsDeLaEscena(
      [{ ticket: "T-2" }, { ticket: "T-1" }],
      [{ ticketId: "T-1" }, { ticketId: "T-3" }],
      [{ id: "T-1", workflowStatus: "in_qa" }, { id: "T-2", workflowStatus: "planned" }],
    );
    expect(resultado).toEqual([
      { id: "T-1", estado: "in_qa" },
      { id: "T-3", estado: null },
      { id: "T-2", estado: "planned" },
    ]);
    expect(INDEX).toMatch(/tickets: ticketsDeLaEscena\(agentes, filas, tickets\)/);
  });
});

describe("C16: el nombre del personaje no aparece", () => {
  it("C16: ningún archivo bajo packages/server/web contiene «anita», sin distinguir mayúsculas", () => {
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else archivos.push(ruta);
      }
    };
    recorrer(WEB);
    const conNombre = archivos.filter((ruta) => {
      try {
        return /anita/i.test(readFileSync(ruta, "utf8"));
      } catch {
        return false;
      }
    });
    expect(conNombre).toEqual([]);
  });
});

describe("C21-C22: el encabezado de los paneles", () => {
  it("C21: la regla .corrida-panel th declara position: static", () => {
    expect(INDEX).toMatch(/\.corrida-panel th \{[^}]*position:\s*static;/);
  });

  it("C22: el th general sigue sticky con top: 51px", () => {
    const m = INDEX.match(/\n      th \{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/position:\s*sticky;/);
    expect(m![0]).toMatch(/top:\s*51px;/);
  });
});

describe("C24-C28: los agentes terminados no reaparecen", () => {
  const mundoDe = (m: typeof control) => m;

  it("C24: una fila en termino de un agente que la escena no conoce no lo agrega", () => {
    const escena = crearEscena(mundoDe(control));
    actualizar(escena, [fila("viejo", { estado: "termino" })], 0);
    expect(escena.agentes.size).toBe(0);
  });

  it("C25: un agente que terminó y salió no vuelve con la siguiente actualización", () => {
    const escena = crearEscena(mundoDe(control));
    actualizar(escena, [fila("a")], 0);
    actualizar(escena, [fila("a", { estado: "termino" })], 1000);
    avanzar(escena, 0.1, 1000 + SALIDA_MS);
    expect(escena.agentes.has("a")).toBe(false);
    actualizar(escena, [fila("a", { estado: "termino" })], 7000);
    expect(escena.agentes.has("a")).toBe(false);
  });

  it("C26: tras cinco ciclos con 24 filas en termino y 2 vivas quedan 2 agentes que no son la principal", () => {
    const escena = crearEscena(mundoDe(control));
    const filas = [
      fila("p", { principal: true, ticket: null }),
      ...Array.from({ length: 24 }, (_, i) => fila(`t${i}`, { estado: "termino" })),
      fila("v1"),
      fila("v2", { ticketEstado: "planned" }),
    ];
    for (let ciclo = 0; ciclo < 5; ciclo++) {
      actualizar(escena, filas, ciclo * 5200);
      expect([...escena.agentes.values()].filter((a) => !a.principal)).toHaveLength(2);
      avanzar(escena, 5.2, ciclo * 5200 + 5200);
    }
    expect([...escena.agentes.values()].filter((a) => !a.principal)).toHaveLength(2);
  });

  it("C27: un agente nuevo recibe el carril libre más bajo entre los presentes", () => {
    const escena = crearEscena(mundoDe(control));
    actualizar(escena, [fila("a"), fila("b"), fila("c")], 0);
    expect([...escena.agentes.values()].map((a) => a.carril)).toEqual([0, 1, 2]);
    actualizar(escena, [fila("a"), fila("c")], 1000);
    avanzar(escena, 0.1, 1000 + SALIDA_MS);
    expect(carrilLibre(escena)).toBe(1);
    actualizar(escena, [fila("a"), fila("c"), fila("d")], 7000);
    expect(escena.agentes.get("d")!.carril).toBe(1);
    expect(escena.agentes.get("a")!.carril).toBe(0);
    expect(escena.agentes.get("c")!.carril).toBe(2);
  });

  it("C28: con 24 filas en termino y 2 vivas, los operadores vivos quedan en consolas distintas", () => {
    const escena = crearEscena(mundoDe(control));
    const filas = [
      ...Array.from({ length: 24 }, (_, i) => fila(`t${i}`, { estado: "termino" })),
      fila("v1"),
      fila("v2"),
    ];
    for (let ciclo = 0; ciclo < 5; ciclo++) {
      actualizar(escena, filas, ciclo * 5200);
      avanzar(escena, 5.2, ciclo * 5200 + 5200);
    }
    const [a, b] = ["v1", "v2"].map((id) => escena.agentes.get(id)!.carril % 5);
    expect(a).not.toBe(b);
  });
});

describe("C31-C32: el cuaderno del invernadero", () => {
  const regla = (selector: string) => {
    const m = INDEX.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`));
    expect(m, selector).not.toBeNull();
    return m![1];
  };

  it("C31: el th del invernadero declara un fondo que no es var(--fondo)", () => {
    const fondo = regla('.corrida-paneles[data-mundo="invernadero"] .corrida-panel th').match(/background:\s*([^;]+);/);
    expect(fondo).not.toBeNull();
    expect(fondo![1]).not.toContain("var(--fondo)");
  });

  it("C32: la fila con ratón encima del invernadero declara un fondo que no es var(--panel)", () => {
    const fondo = regla('.corrida-paneles[data-mundo="invernadero"] .corrida-panel tbody tr:hover td').match(/background:\s*([^;]+);/);
    expect(fondo).not.toBeNull();
    expect(fondo![1]).not.toContain("var(--panel)");
  });
});
