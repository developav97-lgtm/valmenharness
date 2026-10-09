/**
 * El motor de escena de la vista Agentes (FEATURE-WEB-MOTOR-ESCENA-20261008).
 *
 * Sin lienzo ni DOM: el mundo es ficticio, declarado aquí, y el reloj llega por
 * argumento. Cada `describe` lleva el prefijo «Cn:» del criterio que cubre.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ESTACIONES,
  ESTADOS_VISUALES,
  SALIDA_MS,
  VELOCIDAD_PX_S,
  actualizar,
  avanzar,
  crearEscena,
  estacionDe,
  estadoVisualDe,
  objetivoDe,
  rotuloDe,
  validarMundo,
  type FilaDeAgente,
  type Mundo,
} from "../packages/server/web/agentes/motor.js";

function mundoFicticio(sobre: Partial<Mundo> = {}): Mundo {
  return {
    id: "ficticio",
    nombre: "Mundo de prueba",
    lema: "Un mundo que solo existe en el test.",
    pregunta: "¿Te toca a ti?",
    estaciones: ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"],
    puestoPrincipal: { x: 10, y: 20 },
    posicion: (indice, carril) => ({ x: 100 + indice * 100, y: 50 + carril * 40 }),
    dibujar: () => undefined,
    ...sobre,
  };
}

function fila(agente: string, sobre: Partial<FilaDeAgente> = {}): FilaDeAgente {
  return {
    agente,
    principal: false,
    estado: "trabajando",
    ticketEstado: "intake",
    faseConfirmada: null,
    faseInferida: null,
    ultimaHerramienta: null,
    ...sobre,
  };
}

/** Avanza cuadros de 0,1 s hasta que nadie se mueva (o se agoten los cuadros). */
function llegar(escena: ReturnType<typeof crearEscena>, ahoraMs = 0): void {
  for (let i = 0; i < 1000; i++) {
    avanzar(escena, 0.1, ahoraMs);
    if ([...escena.agentes.values()].every((a) => !a.moviendo)) return;
  }
}

describe("C1: estación por estado del ticket", () => {
  it("C1: in_progress queda en el índice 4 sin desvío", () => {
    expect(estacionDe(fila("a", { ticketEstado: "in_progress" }), null)).toEqual({ indice: 4, desvio: false });
    expect(ESTACIONES.map((e) => e.id)).toHaveLength(8);
    expect(ESTACIONES.filter((e) => e.humano).map((e) => e.id)).toEqual(["approved", "awaiting_user_tests"]);
  });
});

describe("C2: rótulo", () => {
  it("C2: faseConfirmada, luego faseInferida, luego ultimaHerramienta", () => {
    expect(rotuloDe(fila("a", { faseConfirmada: "plan", faseInferida: "análisis", ultimaHerramienta: "Read" }))).toBe("plan");
    expect(rotuloDe(fila("a", { faseInferida: "análisis", ultimaHerramienta: "Read" }))).toBe("análisis");
    expect(rotuloDe(fila("a", { ultimaHerramienta: "Read" }))).toBe("Read");
    expect(rotuloDe(fila("a"))).toBe("");
  });
});

describe("C3: desvío tras una estación válida", () => {
  it("C3: de planned a blocked queda en planned con desvío", () => {
    const escena = crearEscena(mundoFicticio());
    actualizar(escena, [fila("a", { ticketEstado: "planned" })], 0);
    actualizar(escena, [fila("a", { ticketEstado: "blocked" })], 1000);
    const a = escena.agentes.get("a")!;
    expect(a.estacion).toBe(2);
    expect(a.desvio).toBe(true);
  });
});

describe("C4: desvío sin historial", () => {
  it("C4: aparecer en changes_requested lleva a intake con desvío", () => {
    const escena = crearEscena(mundoFicticio());
    actualizar(escena, [fila("a", { ticketEstado: "changes_requested" })], 0);
    const a = escena.agentes.get("a")!;
    expect(a.estacion).toBe(0);
    expect(a.desvio).toBe(true);
    expect(estacionDe(fila("b", { ticketEstado: null }), null)).toEqual({ indice: 0, desvio: false });
  });
});

describe("C5: movimiento a velocidad constante", () => {
  it("C5: cada cuadro acerca VELOCIDAD_PX_S * dt píxeles al objetivo, sin saltar", () => {
    const mundo = mundoFicticio();
    const escena = crearEscena(mundo);
    actualizar(escena, [fila("a", { ticketEstado: "planned" })], 0);
    llegar(escena);
    actualizar(escena, [fila("a", { ticketEstado: "in_progress" })], 0);
    const a = escena.agentes.get("a")!;
    const objetivo = mundo.posicion(4, a.carril);
    expect(a.objetivoX).toBe(objetivo.x);
    expect(a.objetivoY).toBe(objetivo.y);
    const dt = 0.05;
    for (let i = 0; i < 5; i++) {
      const antes = Math.hypot(objetivo.x - a.x, objetivo.y - a.y);
      avanzar(escena, dt, 0);
      const despues = Math.hypot(objetivo.x - a.x, objetivo.y - a.y);
      expect(antes - despues).toBeCloseTo(VELOCIDAD_PX_S * dt, 6);
    }
  });
});

describe("C6: moviendo", () => {
  it("C6: es verdadero mientras no llegó y falso al llegar", () => {
    const escena = crearEscena(mundoFicticio());
    actualizar(escena, [fila("a", { ticketEstado: "in_progress" })], 0);
    const a = escena.agentes.get("a")!;
    avanzar(escena, 0.1, 0);
    expect(a.moviendo).toBe(true);
    llegar(escena);
    expect(a.moviendo).toBe(false);
    expect(a.x).toBe(a.objetivoX);
    expect(a.y).toBe(a.objetivoY);
  });
});

describe("C7: aparición", () => {
  it("C7: un agente nuevo aparece en el puesto principal", () => {
    const mundo = mundoFicticio();
    const escena = crearEscena(mundo);
    actualizar(escena, [fila("a", { ticketEstado: "analyzed" })], 0);
    const a = escena.agentes.get("a")!;
    expect({ x: a.x, y: a.y }).toEqual(mundo.puestoPrincipal);
  });
});

describe("C8: salida al terminar", () => {
  it("C8: vuelve al puesto principal y desaparece pasados 5 s del reloj", () => {
    const mundo = mundoFicticio();
    const escena = crearEscena(mundo);
    actualizar(escena, [fila("a", { ticketEstado: "in_qa" })], 0);
    llegar(escena);
    actualizar(escena, [fila("a", { ticketEstado: "closed", estado: "termino" })], 10_000);
    const a = escena.agentes.get("a")!;
    expect(a.objetivoX).toBe(mundo.puestoPrincipal.x);
    expect(a.objetivoY).toBe(mundo.puestoPrincipal.y);
    expect(a.saleEn).toBe(10_000 + SALIDA_MS);
    avanzar(escena, 0.1, 10_000 + SALIDA_MS - 1);
    expect(escena.agentes.has("a")).toBe(true);
    avanzar(escena, 0.1, 10_000 + SALIDA_MS);
    expect(escena.agentes.has("a")).toBe(false);
  });

  it("C8: un agente que deja de venir en las filas también sale", () => {
    const escena = crearEscena(mundoFicticio());
    actualizar(escena, [fila("a")], 0);
    actualizar(escena, [], 2000);
    expect(escena.agentes.get("a")!.saleEn).toBe(2000 + SALIDA_MS);
  });
});

describe("C9: estados visuales", () => {
  it("C9: exactamente cuatro y la fila principal da principal", () => {
    expect([...ESTADOS_VISUALES]).toEqual(["trabajando", "esperando", "termino", "principal"]);
    expect(estadoVisualDe(fila("p", { principal: true }))).toBe("principal");
    expect(estadoVisualDe(fila("a", { estado: "termino" }))).toBe("termino");
  });
});

describe("C10: esperando", () => {
  it("C10: en su estación tiene estado esperando y no se desplaza al avanzar", () => {
    const escena = crearEscena(mundoFicticio());
    const f = fila("a", { ticketEstado: "approved", estado: "esperando" });
    actualizar(escena, [f], 0);
    llegar(escena);
    const a = escena.agentes.get("a")!;
    const antes = { x: a.x, y: a.y };
    actualizar(escena, [f], 1000);
    avanzar(escena, 1, 1000);
    expect(a.estado).toBe("esperando");
    expect({ x: a.x, y: a.y }).toEqual(antes);
  });
});

describe("C11: la escena no se reinicia al refrescar", () => {
  it("C11: diez actualizaciones iguales no cambian objetivo, posición ni carril", () => {
    const mundo = mundoFicticio();
    const escena = crearEscena(mundo);
    const filas = [
      fila("p", { principal: true }),
      fila("a", { ticketEstado: "planned" }),
      fila("b", { ticketEstado: "in_progress" }),
    ];
    actualizar(escena, filas, 0);
    llegar(escena);
    const foto = () =>
      [...escena.agentes.values()].map((a) => [a.id, a.x, a.y, a.objetivoX, a.objetivoY, a.carril, a.paso]);
    const antes = foto();
    const mapa = escena.agentes;
    for (let i = 0; i < 10; i++) actualizar(escena, filas, 1000 + i);
    expect(foto()).toEqual(antes);
    expect(escena.agentes).toBe(mapa);
    const a = escena.agentes.get("a")!;
    expect(a.objetivoX).not.toBe(mundo.puestoPrincipal.x);
  });
});

describe("C12: mundo válido", () => {
  it("C12: validarMundo devuelve una lista vacía", () => {
    expect(validarMundo(mundoFicticio())).toEqual([]);
  });
});

describe("C13: mundo inválido", () => {
  it("C13: nombra cada elemento ausente o mal formado y crearEscena lanza", () => {
    const malo = {
      id: "x",
      nombre: "",
      estaciones: ["solo", "dos"],
      posicion: "no",
      dibujar: 3,
      puestoPrincipal: { x: 1 },
    } as unknown as Mundo;
    const errores = validarMundo(malo).join("\n");
    for (const campo of ["nombre", "lema", "pregunta", "estaciones", "posicion", "dibujar", "puestoPrincipal"]) {
      expect(errores).toContain(campo);
    }
    expect(() => crearEscena(malo)).toThrow(/Mundo inválido/);
    expect(validarMundo(null)).not.toEqual([]);
  });
});

describe("C14: el motor no conoce mundos", () => {
  it("C14: el código no nombra ningún mundo y uno ficticio funciona", () => {
    const codigo = leerMotor().toLowerCase();
    for (const nombre of ["pasteler", "invernadero", "centro de control"]) expect(codigo).not.toContain(nombre);
    const mundo = mundoFicticio({ id: "otro", puestoPrincipal: { x: 0, y: 0 } });
    const escena = crearEscena(mundo);
    actualizar(escena, [fila("a", { ticketEstado: "closed" })], 0);
    expect(objetivoDe(mundo, escena.agentes.get("a")!)).toEqual(mundo.posicion(7, 0));
  });
});

describe("C15: sin lienzo ni azar", () => {
  it("C15: corre en node sin document y el motor no referencia document, window, Math.random ni Date.now", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const codigo = leerMotor()
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codigo).not.toMatch(/\bdocument\b/);
    expect(codigo).not.toMatch(/\bwindow\b/);
    expect(codigo).not.toMatch(/Math\.random/);
    expect(codigo).not.toMatch(/Date\.now/);
  });
});

function leerMotor(): string {
  return readFileSync(fileURLToPath(new URL("../packages/server/web/agentes/motor.js", import.meta.url)), "utf8");
}
