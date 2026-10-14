/**
 * La vista Procesos con las corridas detenidas primero (FEATURE-WEB-VIVO-PROCESOS-20261014:
 * R-VIVO-003 y la parte de Procesos de R-MARCO-006). Se ejecuta la interfaz con el DOM mínimo de
 * `scripts/verificar-interfaz.mjs`. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/procesos.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const fuente = readFileSync(HTML, "utf8");

const paso = (id: string, title: string, kind: string, gate: string | null = null) => ({
  id,
  title,
  kind,
  gate,
});

const DEPLOY = {
  id: "deploy",
  title: "Despliegue de una release",
  description: "Promoción de una release.",
  steps: 6,
  params: ["version*", "tickets*"],
  gates: ["deploy"],
  waiting: 2,
  invalid: null,
  path: ".valmen/processes/deploy.yaml",
  stepList: [
    paso("preflight", "Dry-run de lo que entra en la release", "command"),
    paso("gate-deploy", "Aprobación humana del despliegue", "gate", "deploy"),
    paso("tag", "Tag anotado de la release", "command"),
    paso("publish", "Registrar la publicación de los tickets", "command"),
    paso("manuales", "Actualizar los manuales de usuario final", "process"),
    paso("post-release", "Regenerar el índice del registro tras la publicación", "command"),
  ],
  paramList: [
    { name: "version", required: true, description: "Versión SemVer que se despliega.", default: null },
    { name: "tickets", required: true, description: "Ids de los tickets de la release, separados por coma.", default: null },
  ],
};

const MANUALES = {
  id: "actualizar-manuales",
  title: "Actualizar manuales de usuario final",
  description: "Detecta pantallas tocadas.",
  steps: 4,
  params: ["tickets*", "manualesdir"],
  gates: [],
  waiting: 0,
  invalid: null,
  path: ".valmen/processes/actualizar-manuales.yaml",
  stepList: [
    paso("detectar-pantallas", "Detectar pantallas tocadas y marcar los manuales desactualizados", "command"),
    paso("escribir", "Escribir los manuales", "agent"),
    paso("auditar-manuales", "Auditar los manuales contra el código con citas", "command"),
    paso("publicar-corpus", "Publicar el corpus incremental por colecciones", "command"),
  ],
  paramList: [
    { name: "tickets", required: true, description: "Ids de los tickets de la release, separados por coma.", default: null },
    { name: "manualesdir", required: false, description: "Dónde viven los manuales de usuario final.", default: "docs/manuales/usuario-final" },
  ],
};

const corrida = (runId: string, version: string, aprobadaPor: string | null) => ({
  runId,
  processId: "deploy",
  status: "waiting",
  pendingStep: "gate-deploy",
  reason: "El gate no está aprobado.",
  startedAt: "2026-10-14T10:00:00.000Z",
  updatedAt: "2026-10-14T10:00:01.000Z",
  steps: [
    { id: "preflight", status: "ok", at: "2026-10-14T10:00:00.000Z", detail: "git log --oneline origin/main..HEAD" },
  ],
  params: { version, tickets: "FEATURE-UNO" },
  pendingGate: "deploy",
  requiredPhrase: `APROBAR DEPLOY v${version}`,
  gateApprovedBy: aprobadaPor,
});

const HISTORICA = {
  runId: "actualizar-manuales-20261001",
  processId: "actualizar-manuales",
  status: "failed",
  pendingStep: null,
  reason: "falló la auditoría",
  startedAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:05:00.000Z",
  steps: [{ id: "detectar-pantallas", status: "ok", at: "2026-10-01T10:01:00.000Z", detail: "valmen manuales pendientes" }],
  params: { tickets: "FEATURE-UNO" },
  pendingGate: null,
  requiredPhrase: null,
  gateApprovedBy: null,
};

const GATES = [
  { gate: "deploy", processId: "deploy", approvedBy: null, approvedAt: null, reason: null, requiresPhrase: true },
  { gate: "visto-bueno", processId: "deploy", approvedBy: null, approvedAt: null, reason: null, requiresPhrase: false },
];

const respuestaCon = (runs: unknown[]) => ({
  summary: { processes: 2, invalid: 0, waiting: runs.filter((r) => (r as { status: string }).status === "waiting").length, gatesPending: 2, runs: runs.length },
  processes: [DEPLOY, MANUALES],
  runs,
  gates: GATES,
});

const CON_DETENIDAS = respuestaCon([corrida("deploy-1", "0.4.0", null), corrida("deploy-2", "0.5.0", "Ana Pérez"), HISTORICA]);

/** Todo el texto de un nodo, en orden. */
function texto(nodo: NodoFalso): string {
  const partes: string[] = [];
  const recorrer = (n: NodoFalso): void => {
    if (n._texto) partes.push(String(n._texto));
    for (const hijo of n.children ?? []) recorrer(hijo);
  };
  recorrer(nodo);
  return partes.join(" ");
}

const conClase = (raiz: NodoFalso, clase: string): NodoFalso[] =>
  buscarNodos(raiz, (n: NodoFalso) => String(n.className ?? "").split(" ").includes(clase));

/** Abre Procesos con la respuesta dada y registra cada pedido con su método y su cuerpo. */
async function abrir(datos: unknown = CON_DETENIDAS, almacen: Record<string, string> = {}) {
  const pedidos: Array<{ ruta: string; metodo: string; cuerpo: unknown }> = [];
  const resultado = await ejecutarInterfaz(HTML, {
    hash: "#/procesos",
    localStorage: almacen,
    respuesta: (ruta: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      pedidos.push({ ruta, metodo, cuerpo: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/processes" && metodo === "GET") return datos;
      if (url.pathname.endsWith("/approve")) return { ok: true, details: "Gate aprobado." };
      if (url.pathname === "/api/health") return { root: "/proyecto" };
      return {};
    },
  });
  const escrituras = () => pedidos.filter((p) => p.metodo !== "GET");
  return { ...resultado, pedidos, escrituras };
}

/** Escribe en un campo como lo haría una persona. */
async function escribir(campo: NodoFalso, valor: string): Promise<void> {
  campo.value = valor;
  await disparar(campo, "input");
}

describe("Procesos con las corridas detenidas primero (R-VIVO-003)", () => {
  it("C2: pinta la cabecera del boceto", async () => {
    const { contenido, fallos } = await abrir();
    expect(fallos).toEqual([]);
    const todo = texto(contenido);
    expect(todo).toContain("En vivo");
    expect(todo).toContain("Procesos: despliegues y tareas de varias etapas");
  });

  it("C3: cada corrida detenida tiene su bloque, antes de «Procesos del proyecto»", async () => {
    const { contenido } = await abrir();
    const bloques = conClase(contenido, "proc-detenida");
    expect(bloques).toHaveLength(2);
    expect(texto(bloques[0] as NodoFalso)).toContain("Detenido: espera tu aprobación");
    expect(texto(bloques[0] as NodoFalso)).toContain("deploy · v0.4.0");
    const todo = texto(contenido);
    expect(todo.indexOf("Detenido: espera tu aprobación")).toBeLessThan(todo.indexOf("Procesos del proyecto"));
  });

  it("C4: el paso actual es «Aprobación humana del despliegue» con aria-current=step, y solo ese", async () => {
    const { contenido } = await abrir();
    const bloque = conClase(contenido, "proc-detenida")[0] as NodoFalso;
    const actuales = buscarNodos(bloque, (n: NodoFalso) => n.attrs?.["aria-current"] === "step");
    expect(actuales).toHaveLength(1);
    expect(texto(actuales[0] as NodoFalso)).toContain("Aprobación humana del despliegue");
    const hechos = conClase(bloque, "proc-paso-hecho").map(texto);
    expect(hechos).toEqual([expect.stringContaining("✓ Dry-run de lo que entra en la release")]);
    const pasos = conClase(bloque, "proc-paso");
    expect(pasos).toHaveLength(6);
  });

  it("C5 y C7: aprobar no envía nada sin responsable ni con una frase distinta", async () => {
    const { contenido, escrituras } = await abrir();
    const bloque = conClase(contenido, "proc-detenida")[0] as NodoFalso;
    const boton = conClase(bloque, "proc-aprobar")[0] as NodoFalso;
    const frase = conClase(bloque, "proc-frase")[0] as NodoFalso;
    const actor = conClase(bloque, "proc-responsable")[0] as NodoFalso;
    expect(texto(boton)).toBe("Aprobar despliegue");
    expect(frase.placeholder).toBe("APROBAR DEPLOY v0.4.0");

    // C7: la frase exacta sin responsable.
    await escribir(frase, "APROBAR DEPLOY v0.4.0");
    expect(boton.disabled).toBe(true);
    await disparar(boton, "click");
    expect(escrituras()).toEqual([]);
    expect(texto(bloque)).toContain("Falta el responsable");

    // C5: con responsable, una frase libre como la del boceto no basta.
    await escribir(actor, "Juan Andrade");
    await escribir(frase, "Apruebo el despliegue de v0.4.0 tras revisar el dry-run");
    expect(boton.disabled).toBe(true);
    await disparar(boton, "click");
    expect(escrituras()).toEqual([]);
  });

  it("C6: con responsable y la frase exacta, envía la aprobación de esa corrida", async () => {
    const { contenido, escrituras } = await abrir();
    const bloque = conClase(contenido, "proc-detenida")[0] as NodoFalso;
    await escribir(conClase(bloque, "proc-responsable")[0] as NodoFalso, "Juan Andrade");
    await escribir(conClase(bloque, "proc-frase")[0] as NodoFalso, "APROBAR DEPLOY v0.4.0");
    const boton = conClase(bloque, "proc-aprobar")[0] as NodoFalso;
    expect(boton.disabled).toBe(false);
    await disparar(boton, "click");
    expect(escrituras()).toEqual([
      {
        ruta: "/api/processes/gates/deploy/approve",
        metodo: "POST",
        cuerpo: { actor: "Juan Andrade", run: "deploy-1", phrase: "APROBAR DEPLOY v0.4.0", reason: "" },
      },
    ]);
  });

  it("C8: una corrida ya aprobada muestra cómo retomarla en vez del campo", async () => {
    const { contenido } = await abrir();
    const bloque = conClase(contenido, "proc-detenida")[1] as NodoFalso;
    expect(texto(bloque)).toContain("Aprobado por Ana Pérez");
    expect(texto(bloque)).toContain("valmen process resume deploy-2");
    expect(conClase(bloque, "proc-frase")).toEqual([]);
    expect(conClase(bloque, "proc-aprobar")).toEqual([]);
  });

  it("C9: «Ver dry-run» despliega los pasos ejecutados con su comando", async () => {
    const { contenido } = await abrir();
    const bloque = conClase(contenido, "proc-detenida")[0] as NodoFalso;
    const boton = conClase(bloque, "proc-ver-dryrun")[0] as NodoFalso;
    const panel = conClase(bloque, "proc-dryrun")[0] as NodoFalso;
    expect(texto(boton)).toBe("Ver dry-run");
    expect(boton.attrs["aria-expanded"]).toBe("false");
    expect(panel.hidden).toBe(true);
    await disparar(boton, "click");
    expect(boton.attrs["aria-expanded"]).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(texto(panel)).toContain("git log --oneline origin/main..HEAD");
  });

  it("C10: cada proceso es una tarjeta con sus pasos de persona en ámbar", async () => {
    const { contenido } = await abrir();
    const tarjetas = conClase(contenido, "proc-tarjeta");
    expect(tarjetas).toHaveLength(2);
    const [deploy, manuales] = tarjetas as [NodoFalso, NodoFalso];
    expect(texto(deploy)).toContain("Despliegue de una release");
    expect(texto(deploy)).toContain("deploy");
    expect(conClase(deploy, "proc-paso")).toHaveLength(6);
    expect(conClase(deploy, "proc-paso-persona").map(texto)).toEqual(["Aprobación humana del despliegue"]);
    expect(conClase(manuales, "proc-paso-persona")).toEqual([]);
  });

  it("C11: la tarjeta dice qué pide con las descripciones de sus parámetros", async () => {
    const { contenido } = await abrir();
    const [deploy, manuales] = conClase(contenido, "proc-tarjeta").map((t) => texto(conClase(t, "proc-pide")[0] as NodoFalso));
    expect(deploy).toBe("Pide: versión SemVer que se despliega; ids de los tickets de la release, separados por coma");
    expect(manuales).toContain("dónde viven los manuales de usuario final (opcional)");
  });

  it("C12: «Ejecutar» despliega el comando para la terminal sin escribir nada", async () => {
    const { contenido, escrituras } = await abrir();
    const tarjeta = conClase(contenido, "proc-tarjeta")[1] as NodoFalso;
    const boton = conClase(tarjeta, "proc-ejecutar")[0] as NodoFalso;
    await disparar(boton, "click");
    expect(boton.attrs["aria-expanded"]).toBe("true");
    expect(texto(conClase(tarjeta, "proc-comando")[0] as NodoFalso)).toContain(
      "valmen process run actualizar-manuales --tickets <tickets> [--manualesdir <manualesdir>]",
    );
    expect(escrituras()).toEqual([]);
  });

  it("C13: «Historial» despliega las corridas de ese proceso", async () => {
    const { contenido } = await abrir();
    const tarjeta = conClase(contenido, "proc-tarjeta")[1] as NodoFalso;
    const boton = conClase(tarjeta, "proc-historial")[0] as NodoFalso;
    await disparar(boton, "click");
    const panel = texto(conClase(tarjeta, "proc-corridas")[0] as NodoFalso);
    expect(panel).toContain("actualizar-manuales-20261001");
    expect(panel).not.toContain("deploy-1");
  });

  it("C14: sin corridas detenidas dice «Nada detenido» y no pinta bloque ámbar", async () => {
    const { contenido } = await abrir(respuestaCon([HISTORICA]));
    expect(texto(contenido)).toContain("Nada detenido");
    expect(conClase(contenido, "proc-detenida")).toEqual([]);
  });

  it("C19: «Más detalle» plegado conserva las cifras con las tres tablas de antes", async () => {
    const { contenido } = await abrir();
    const [mas] = conClase(contenido, "proc-mas") as [NodoFalso];
    expect(mas.tagName).toBe("DETAILS");
    expect(mas.open).toBe(false);
    const todo = texto(mas);
    for (const parte of ["Más detalle", "Detenidos", "Gates sin aprobar", "Gates de proceso", "Corridas", "Procesos", ".valmen/processes/deploy.yaml"]) {
      expect(todo).toContain(parte);
    }
    const textoTotal = texto(contenido);
    expect(textoTotal.indexOf("Más detalle")).toBeGreaterThan(textoTotal.indexOf("Procesos del proyecto"));
  });

  it("C20: en «Más detalle», un gate sin frase se aprueba con el responsable; uno con frase remite a su corrida", async () => {
    const { contenido, escrituras } = await abrir(CON_DETENIDAS, { "valmen.actor": "Juan Andrade" });
    const [mas] = conClase(contenido, "proc-mas") as [NodoFalso];
    const botones = buscarNodos(mas, (n: NodoFalso) => n.tagName === "BUTTON" && n._texto === "Aprobar");
    expect(botones).toHaveLength(1);
    expect(texto(mas)).toContain("Se aprueba en su corrida detenida, con la frase");
    await disparar(botones[0] as NodoFalso, "click");
    expect(escrituras()).toEqual([
      { ruta: "/api/processes/gates/visto-bueno/approve", metodo: "POST", cuerpo: { actor: "Juan Andrade" } },
    ]);
  });
});

describe("Procesos en el celular (R-MARCO-006)", () => {
  it("C16: la rejilla de tarjetas acota sus columnas con min(100%, 380px)", () => {
    const i = fuente.indexOf(".proc-tarjetas {");
    expect(i).toBeGreaterThan(-1);
    expect(fuente.slice(i, fuente.indexOf("}", i))).toMatch(/minmax\(min\(100%, 380px\), 1fr\)/);
  });
});
