/**
 * El marco de la vista Agentes (FEATURE-WEB-VIVO-AGENTES-20261014, R-VIVO-001 y
 * R-VIVO-002): titular con las cuentas, aviso de pregunta pendiente, control «A la
 * vez», escena enmarcada con pestañas de mundo y tabla de quién trabaja.
 *
 * Las pestañas necesitan el módulo de escena real: la prueba usa una copia del HTML
 * con el `import` apuntando al archivo y un `requestAnimationFrame` que no dibuja.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const MONTAJE = join(RAIZ, "packages", "server", "web", "agentes", "montaje.js");
const PROYECTO = "valmen-harness";

type Nodo = {
  tagName?: string;
  _texto?: string;
  className?: string;
  value?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  hidden?: boolean;
  children: Nodo[];
};

const temporales: string[] = [];
afterEach(() => {
  for (const t of temporales.splice(0)) rmSync(t, { recursive: true, force: true });
});

function textoDe(nodo: Nodo | undefined): string {
  if (nodo === undefined) return "";
  return [nodo._texto ?? "", ...nodo.children.map(textoDe)]
    .filter((p) => p !== "")
    .join(" | ");
}

function buscar(nodo: Nodo | undefined, prueba: (n: Nodo) => boolean): Nodo[] {
  if (nodo === undefined) return [];
  return [
    ...(prueba(nodo) ? [nodo] : []),
    ...nodo.children.flatMap((hijo) => buscar(hijo, prueba)),
  ];
}

const conClase = (clase: string) => (n: Nodo) =>
  (n.className ?? "").split(" ").includes(clase);

const AHORA = new Date().toISOString();

function agente(id: string, ticket: string | null, estado: string, extra: Record<string, unknown> = {}) {
  return {
    agente: id,
    principal: false,
    ticket,
    descripcion: `Trabajo de ${ticket}`,
    modelo: "claude-sonnet-5-5",
    esfuerzo: "high",
    rama: null,
    carpeta: null,
    ultimaHerramienta: "Edit",
    ultimaHerramientaEn: AHORA,
    estado,
    ticketEstado: null,
    faseConfirmada: null,
    faseInferida: "implementando",
    pregunta: null,
    ...extra,
  };
}

const PRINCIPAL = agente("sesion-principal", null, "trabajando", {
  principal: true,
  descripcion: null,
  faseInferida: null,
  rama: "main",
  modelo: "claude-opus-5-5",
});
const PREGUNTA = "¿La rama base sale de la configuración o de la rama actual?";
const AGENTES = {
  agentes: [
    PRINCIPAL,
    agente("a1", "BUGFIX-RAMA-20261014", "esperando", {
      faseConfirmada: "análisis",
      modelo: "claude-opus-5-5",
      pregunta: { desde: AHORA, respondidaEn: null, texto: PREGUNTA, respuesta: null },
    }),
    agente("a2", "FEATURE-TAMANO-20261010", "trabajando"),
    agente("a3", "FEATURE-FIN-20261008", "termino"),
  ],
};
const TICKETS = {
  tickets: [
    { id: "BUGFIX-RAMA-20261014", title: "Worktrees y hash de QA fallan fuera de main", workflowStatus: "in_progress", publicState: null },
    { id: "FEATURE-TAMANO-20261010", title: "El plan declara tamaño previsto y partición", workflowStatus: "in_progress", publicState: null },
  ],
};
const JORNADAS = { authorization: { observationSources: [], dispatchExecutors: [] }, journeys: [] };

interface Opciones {
  agentes?: unknown;
  localStorage?: Record<string, string>;
  conEscena?: boolean;
}

async function abrir(o: Opciones = {}, llamadas: { metodo: string; ruta: string }[] = []) {
  let html = HTML;
  if (o.conEscena === true) {
    const dir = mkdtempSync(join(tmpdir(), "valmen-agentes-marco-"));
    temporales.push(dir);
    html = join(dir, "index.html");
    const fuente = readFileSync(HTML, "utf8");
    expect(fuente).toContain('import("/agentes/montaje.js")');
    writeFileSync(
      html,
      fuente
        .replace('import("/agentes/montaje.js")', `import(${JSON.stringify(pathToFileURL(MONTAJE).href)})`)
        .replace(
          '<script type="module">',
          '<script type="module">\n          globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};\n',
        ),
    );
  }
  const resultado = await ejecutarInterfaz(html, {
    hash: "#/agentes",
    localStorage: { "valmen.project": PROYECTO, ...(o.localStorage ?? {}) },
    respuesta: (ruta: string, init?: RequestInit) => {
      llamadas.push({ metodo: init?.method ?? "GET", ruta });
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/portafolio")
        return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
      if (url.pathname === "/api/corrida/agentes") return o.agentes ?? AGENTES;
      if (url.pathname === "/api/journeys") return JORNADAS;
      if (url.pathname === "/api/tickets") return TICKETS;
      return {};
    },
  });
  // Con la escena, la vista espera el `import` del módulo: se espera a que pinte.
  const raiz = resultado.contenido as Nodo;
  for (let i = 0; i < 200 && raiz.children.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(resultado.fallos).toEqual([]);
  return { raiz, llamadas };
}

describe("R-VIVO-001: el titular, el aviso de pregunta y «A la vez»", () => {
  it.each([
    ["C1: dos vivos y uno pregunta", AGENTES, "2 agentes trabajando, 1 te pregunta algo"],
    ["C2: sin agentes vivos", { agentes: [PRINCIPAL] }, "Ningún agente trabajando"],
  ])("%s", async (_caso, agentes, titular) => {
    const { raiz } = await abrir({ agentes });
    expect(buscar(raiz, (n) => n.tagName === "H1").map(textoDe)).toEqual([titular]);
  });

  it("C3-C5: el aviso va antes de la escena, nombra ticket y fase, y muestra la pregunta", async () => {
    const { raiz } = await abrir({ conEscena: true });
    const avisos = buscar(raiz, (n) => n.attrs?.role === "alert");
    expect(avisos).toHaveLength(1);
    const texto = textoDe(avisos[0]);
    expect(texto).toContain("BUGFIX-RAMA-20261014 · análisis");
    expect(texto).toContain(PREGUNTA);
    const orden = buscar(raiz, (n) => n.attrs?.role === "alert" || conClase("agm-escena")(n));
    expect(orden.map((n) => (n.attrs?.role === "alert" ? "aviso" : "escena"))).toEqual([
      "aviso",
      "escena",
    ]);
  });

  it("C5: un texto de pregunta con marcado HTML se pinta como texto", async () => {
    const marcado = '<img src=x onerror="alert(1)"><b>negrita</b>';
    const { raiz } = await abrir({
      agentes: {
        agentes: [
          agente("a1", "BUGFIX-RAMA-20261014", "esperando", {
            pregunta: { desde: AHORA, respondidaEn: null, texto: marcado },
          }),
        ],
      },
    });
    expect(textoDe(raiz)).toContain(marcado);
    expect(buscar(raiz, (n) => n.tagName === "IMG" || n._texto === "negrita")).toEqual([]);
  });

  it("C6: «Responder en la sesión» despliega dónde se contesta sin pedir nada", async () => {
    const { raiz, llamadas } = await abrir();
    const boton = buscar(raiz, (n) => n.tagName === "BUTTON" && textoDe(n) === "Responder en la sesión")[0]!;
    expect(boton.attrs?.["aria-expanded"]).toBe("false");
    const antes = llamadas.length;
    await disparar(boton as never, "click");
    expect(boton.attrs?.["aria-expanded"]).toBe("true");
    const aviso = buscar(raiz, (n) => n.attrs?.role === "alert")[0];
    const indicacion = buscar(aviso, conClase("agm-aviso-indicacion"))[0]!;
    expect(indicacion.hidden).toBe(false);
    expect(textoDe(indicacion)).toContain("sesión de Claude Code");
    expect(llamadas.slice(antes)).toEqual([]);
  });

  it("C7: «A la vez» muestra la cuenta viva sobre la deseada", async () => {
    const { raiz } = await abrir();
    const control = buscar(raiz, conClase("agm-alavez"))[0]!;
    expect(textoDe(control)).toMatch(/^A la vez/);
    expect(textoDe(buscar(control, conClase("agm-alavez-vivos"))[0])).toBe("2");
    expect(textoDe(buscar(control, conClase("agm-alavez-sep"))[0])).toBe("/");
    expect(buscar(control, (n) => n.tagName === "SELECT")[0]!.value).toBe("3");
  });

  it("C8: «+» sube la deseada y la guarda solo en el navegador", async () => {
    const { raiz, llamadas } = await abrir();
    const control = buscar(raiz, conClase("agm-alavez"))[0]!;
    const mas = buscar(control, (n) => n.attrs?.["aria-label"] === "Uno más")[0]!;
    const antes = llamadas.length;
    await disparar(mas as never, "click");
    expect(buscar(control, (n) => n.tagName === "SELECT")[0]!.value).toBe("4");
    expect(globalThis.localStorage.getItem("valmen.corrida.simultaneos")).toBe("4");
    expect(llamadas.slice(antes)).toEqual([]);
  });
});

describe("R-VIVO-002: la escena enmarcada y la tabla de quién trabaja", () => {
  const pestanas = (raiz: Nodo) =>
    buscar(buscar(raiz, (n) => n.attrs?.role === "tablist")[0], (n) => n.attrs?.role === "tab");
  const filas = (raiz: Nodo) =>
    buscar(buscar(raiz, conClase("corrida-agente"))[0], (n) => n.tagName === "TR").filter((tr) =>
      tr.children.some((c) => c.tagName === "TD"),
    );

  it("C9: las pestañas de mundo siguen el orden de la spec", async () => {
    const { raiz } = await abrir({ conEscena: true });
    expect(pestanas(raiz).map(textoDe)).toEqual(["Sala de control", "Pastelería", "Invernadero"]);
  });

  it("C10-C12: elegir «Pastelería» la marca, no pide nada y deja la tabla igual", async () => {
    const { raiz, llamadas } = await abrir({
      conEscena: true,
      localStorage: { "valmen.agentes.mundo": "control" },
    });
    expect(pestanas(raiz).map((p) => p.attrs?.["aria-selected"])).toEqual(["true", "false", "false"]);
    const antes = filas(raiz).map(textoDe);
    const previas = llamadas.length;
    await disparar(pestanas(raiz)[1] as never, "click");
    expect(pestanas(raiz).map((p) => p.attrs?.["aria-selected"])).toEqual(["false", "true", "false"]);
    expect(globalThis.localStorage.getItem("valmen.agentes.mundo")).toBe("pasteleria");
    expect(llamadas.slice(previas)).toEqual([]);
    expect(filas(raiz).map(textoDe)).toEqual(antes);
  });

  it("C13: la escena identifica la sesión principal", async () => {
    const { raiz } = await abrir({ conEscena: true });
    const escena = buscar(raiz, conClase("agm-escena"))[0];
    expect(textoDe(escena)).toContain("Sesión principal: reparte e integra · solo ella toca main");
  });

  it("C14-C16: la principal primero con su rama, cada subagente con su título y la pregunta en la fase", async () => {
    const { raiz } = await abrir();
    const lista = filas(raiz);
    expect(lista).toHaveLength(3);
    expect(textoDe(lista[0])).toContain("Sesión principal");
    expect(textoDe(lista[0])).toContain("main");
    const a1 = textoDe(lista[1]);
    expect(a1).toMatch(/Worktrees y hash de QA fallan fuera de main \| BUGFIX-RAMA-20261014/);
    expect(a1).toContain("análisis | pregunta");
    const a2 = textoDe(lista[2]);
    expect(a2).toMatch(/El plan declara tamaño previsto y partición \| FEATURE-TAMANO-20261010/);
    expect(a2).not.toContain("pregunta");
    expect(textoDe(raiz)).not.toContain("FEATURE-FIN-20261008");
  });
});
