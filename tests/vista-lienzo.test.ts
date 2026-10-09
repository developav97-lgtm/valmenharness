/**
 * El montaje del lienzo de la vista Agentes (FEATURE-WEB-VISTA-LIENZO-20261008).
 * Sin navegador: el reloj, el cuadro de animación, el almacén y la visibilidad
 * se inyectan, así que el comportamiento se prueba de forma determinista.
 */
import { describe, expect, it } from "vitest";

import { validarMundo } from "../packages/server/web/agentes/motor.js";
import {
  avisosDePregunta,
  crearMontaje,
  filasDePanelAgentes,
} from "../packages/server/web/agentes/montaje.js";
import { MUNDOS, MUNDO_POR_DEFECTO } from "../packages/server/web/agentes/mundos/index.js";

const AHORA = Date.parse("2026-10-09T12:00:00.000Z");
const hace = (s: number) => new Date(AHORA - s * 1000).toISOString();

function fila(agente: string, extra: Record<string, unknown> = {}) {
  return {
    agente,
    principal: false,
    ticket: `TICKET-${agente}`,
    estado: "trabajando",
    ticketEstado: "in_progress",
    faseConfirmada: "implementación",
    faseInferida: null,
    ultimaHerramienta: "Edit",
    pregunta: null,
    ...extra,
  };
}

function almacenEnMemoria(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
  };
}

function banco(opciones: { visible?: () => boolean; almacen?: ReturnType<typeof almacenEnMemoria> } = {}) {
  let reloj = AHORA;
  let siguiente = 1;
  const pendientes = new Map<number, () => void>();
  const llamadas = { pedidos: 0, cancelados: 0 };
  const montaje = crearMontaje({
    almacen: opciones.almacen ?? almacenEnMemoria(),
    visible: opciones.visible ?? (() => true),
    ahora: () => reloj,
    pedirCuadro: (f: () => void) => {
      const id = siguiente++;
      pendientes.set(id, f);
      llamadas.pedidos += 1;
      return id;
    },
    cancelarCuadro: (id: number) => {
      pendientes.delete(id);
      llamadas.cancelados += 1;
    },
  });
  const lienzo = { getContext: () => ({ canvas: { width: 960 }, save() {}, restore() {}, scale() {}, fillRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} }) };
  return {
    montaje,
    lienzo,
    llamadas,
    pendientes,
    avanzarReloj: (ms: number) => void (reloj += ms),
    cuadro() {
      const [id, f] = [...pendientes][0] ?? [];
      if (id === undefined || f === undefined) return;
      pendientes.delete(id);
      f();
    },
  };
}

describe("el montaje del lienzo", () => {
  it("diez montajes con las mismas filas reutilizan el mismo objeto de escena (C1)", () => {
    const b = banco();
    const filas = [fila("a1")];
    b.montaje.montar(b.lienzo, filas, AHORA);
    const primera = b.montaje.escena();
    for (let i = 0; i < 9; i += 1) b.montaje.montar(b.lienzo, filas, AHORA);
    expect(b.montaje.escena()).toBe(primera);
  });

  it("un agente en camino conserva su posición tras diez montajes (C2)", () => {
    const b = banco();
    const filas = [fila("a1")];
    b.montaje.montar(b.lienzo, filas, AHORA);
    for (let i = 0; i < 5; i += 1) {
      b.avanzarReloj(100);
      b.cuadro();
    }
    const agente = b.montaje.escena()!.agentes.get("a1")!;
    const { x, y } = agente;
    const puesto = b.montaje.mundoActual().puestoPrincipal;
    expect({ x, y }).not.toEqual(puesto);
    for (let i = 0; i < 10; i += 1) b.montaje.montar(b.lienzo, filas, AHORA);
    expect(b.montaje.escena()!.agentes.get("a1")).toMatchObject({ x, y });
  });

  it("montar varias veces deja un único cuadro pendiente (C3)", () => {
    const b = banco();
    for (let i = 0; i < 10; i += 1) b.montaje.montar(b.lienzo, [fila("a1")], AHORA);
    expect(b.pendientes.size).toBe(1);
    b.cuadro();
    b.montaje.montar(b.lienzo, [fila("a1")], AHORA);
    expect(b.pendientes.size).toBe(1);
  });

  it("con visible() falso un cuadro no avanza el tiempo de la escena (C15)", () => {
    let visible = false;
    const b = banco({ visible: () => visible });
    b.montaje.montar(b.lienzo, [fila("a1")], AHORA);
    b.avanzarReloj(200);
    b.cuadro();
    expect(b.montaje.escena()!.t).toBe(0);
    visible = true;
    b.avanzarReloj(200);
    b.cuadro();
    expect(b.montaje.escena()!.t).toBeGreaterThan(0);
  });

  it("desmontar cancela el cuadro pendiente (C19)", () => {
    const b = banco();
    b.montaje.montar(b.lienzo, [fila("a1")], AHORA);
    expect(b.pendientes.size).toBe(1);
    b.montaje.desmontar();
    expect(b.pendientes.size).toBe(0);
    expect(b.llamadas.cancelados).toBe(1);
  });
});

describe("el mundo elegido", () => {
  it("sin elección guardada el mundo actual es la pastelería (C4)", () => {
    expect(banco().montaje.mundoActual().id).toBe(MUNDO_POR_DEFECTO);
    expect(MUNDO_POR_DEFECTO).toBe("pasteleria");
  });

  it("un mundo elegido se recupera en otro montaje sobre el mismo almacén (C5)", () => {
    const almacen = almacenEnMemoria();
    const a = banco({ almacen });
    expect(a.montaje.elegirMundo("invernadero")).toBe(true);
    expect(banco({ almacen }).montaje.mundoActual().id).toBe("invernadero");
  });

  it("un valor guardado que no es un mundo registrado deja la pastelería (C4)", () => {
    const almacen = almacenEnMemoria({ "valmen.agentes.mundo": "marte" });
    expect(banco({ almacen }).montaje.mundoActual().id).toBe("pasteleria");
  });

  it("un almacén que lanza al leer deja la pastelería, y al escribir no rompe (C6)", () => {
    const roto = {
      getItem: () => {
        throw new Error("sin acceso");
      },
      setItem: () => {
        throw new Error("sin acceso");
      },
    };
    const b = banco({ almacen: roto as never });
    expect(b.montaje.mundoActual().id).toBe("pasteleria");
    expect(() => b.montaje.elegirMundo("control")).not.toThrow();
    expect(b.montaje.mundoActual().id).toBe("control");
  });

  it("tras elegirMundo la escena nueva contiene los agentes vigentes (C18)", () => {
    const b = banco();
    b.montaje.montar(b.lienzo, [fila("a1"), fila("a2")], AHORA);
    const antes = b.montaje.escena();
    b.montaje.elegirMundo("control");
    const despues = b.montaje.escena()!;
    expect(despues).not.toBe(antes);
    expect(despues.mundo.id).toBe("control");
    expect([...despues.agentes.keys()].sort()).toEqual(["a1", "a2"]);
  });
});

describe("los avisos de pregunta", () => {
  const mundo = MUNDOS[0];

  it("una pregunta abierta avisa a una persona, con ticket, antigüedad y la expresión del mundo (C7-C10)", () => {
    const avisos = avisosDePregunta([fila("a1", { pregunta: { desde: hace(40), respondidaEn: null } })], AHORA, mundo);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      tipo: "pendiente",
      encabezado: "Pregunta pendiente para una persona",
      quien: "una persona",
      ticket: "TICKET-a1",
      hace: "hace 40 s",
      expresion: mundo.pregunta,
    });
  });

  it("una pregunta respondida hace 10 s produce «una persona respondió» (C11)", () => {
    const avisos = avisosDePregunta([fila("a1", { pregunta: { desde: hace(90), respondidaEn: hace(10) } })], AHORA, mundo);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: "respondio", encabezado: "una persona respondió" });
  });

  it("una pregunta respondida hace más de 60 s no produce aviso (C12)", () => {
    expect(avisosDePregunta([fila("a1", { pregunta: { desde: hace(300), respondidaEn: hace(61) } })], AHORA, mundo)).toEqual([]);
  });

  it("una fila sin pregunta no produce aviso", () => {
    expect(avisosDePregunta([fila("a1")], AHORA, mundo)).toEqual([]);
  });
});

describe("el panel de agentes", () => {
  const filas = [
    fila("a1", { estado: "trabajando", faseConfirmada: null, faseInferida: "análisis" }),
    fila("a2", { estado: "termino" }),
    fila("p", { principal: true, ticket: null, estado: "trabajando", ultimaHerramienta: "Agent" }),
    fila("a3", { estado: "esperando" }),
  ];

  it("pone la sesión principal en primer lugar (C13)", () => {
    const panel = filasDePanelAgentes(filas);
    expect(panel[0]).toMatchObject({ agente: "p", principal: true, nombre: "Sesión principal" });
    expect(panel.map((f: { agente: string }) => f.agente)).toEqual(["p", "a1", "a3"]);
  });

  it("cada fila trae nombre, ticket, fase y última herramienta (C14)", () => {
    const [, a1] = filasDePanelAgentes(filas);
    expect(a1).toMatchObject({
      nombre: "a1",
      ticket: "TICKET-a1",
      fase: "análisis",
      inferida: true,
      ultimaHerramienta: "Edit",
    });
  });
});

describe("los mundos registrados", () => {
  it("MUNDOS registra exactamente pasteleria, control e invernadero (C16)", () => {
    expect(MUNDOS.map((m: { id: string }) => m.id)).toEqual(["pasteleria", "control", "invernadero"]);
  });

  it("cada mundo cumple la interfaz del motor (C17)", () => {
    for (const m of MUNDOS) expect(validarMundo(m)).toEqual([]);
  });
});
