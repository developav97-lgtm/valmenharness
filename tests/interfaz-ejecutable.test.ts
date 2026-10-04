/**
 * La interfaz de Mission Control tiene que **ejecutarse**, no solo compilar.
 *
 * Este test existe por un fallo que llegó al navegador de quien la usa: al
 * reescribir un bloque de la vista del ticket se perdió la definición de una
 * función y la pantalla respondió «No se pudo cargar la vista: Can't find
 * variable: pintarLineaDeTiempo».
 *
 * Ningún test lo vio, y no por falta de cobertura: el módulo vive en un
 * `<script type="module">` dentro de un HTML que ningún test ejecutaba.
 * `node --check` valida la sintaxis, y una variable inexistente no es un error de
 * sintaxis — es un error de ejecución, y solo aparece cuando la rama se recorre.
 *
 * Se ejecuta en un proceso aparte: el módulo arranca la navegación y abre el flujo
 * de eventos al importarse, así que dos importaciones en el mismo proceso
 * compartirían ese estado y el segundo resultado no diría nada del código.
 */
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  fasesPorTicket,
  readTicket,
  type FaseDeTicket,
} from "../packages/engine/src/index.js";
import {
  VISTAS,
  ejecutarInterfaz,
  ejecutarTodasLasVistas,
  type NodoFalso,
} from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const SCRIPT = join(RAIZ, "scripts", "verificar-interfaz.mjs");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

describe("la interfaz de Mission Control", () => {
  it("declara paletas clara y oscura, y un foco visible para el teclado", () => {
    const html = readFileSync(HTML, "utf8");
    const temaClaro = /@media\s*\(prefers-color-scheme:\s*light\)\s*\{([\s\S]*?)\n\s*\}/.exec(html)?.[1];

    // Antes de este ticket solo existía :root con la paleta oscura: quien
    // prefiriera claro recibía la misma superficie oscura. Se exige una paleta
    // completa y semántica, no colores en los controles individuales.
    expect(temaClaro).toBeDefined();
    for (const variable of [
      "--fondo:", "--panel:", "--panel-alto:", "--borde:",
      "--texto:", "--tenue:", "--acento:", "--ok:", "--alerta:", "--error:",
    ]) expect(temaClaro).toContain(variable);

    // Enlaces, botones, resúmenes y campos se recorren por Tab. La misma señal
    // visual evita que el foco dependa de cómo lo pinte cada navegador.
    expect(html).toMatch(/a:focus-visible,[\s\S]*button:focus-visible,[\s\S]*summary:focus-visible,[\s\S]*input:focus-visible,[\s\S]*select:focus-visible,[\s\S]*textarea:focus-visible\s*\{/);
    expect(html).toMatch(/:focus-visible[\s\S]*outline:/);
  });

  it("reconcilia ejecución por cursor paginado sin abrir conversaciones", () => {
    const html = readFileSync(HTML, "utf8");
    const reconciliacion = /async function reconciliarEventosDeEjecucion[\s\S]*?\n\s*function puedeRefrescar/.exec(html)?.[0];

    expect(reconciliacion).toContain("/api/execution-events?after=${encodeURIComponent(cursor)}&limit=100");
    expect(reconciliacion).not.toContain("/messages");
    expect(reconciliacion).toContain("guardarCursorDeEjecucion");
  });

  it("se ejecuta sin errores y pinta la vista del ticket", () => {
    const resultado = spawnSync(process.execPath, [SCRIPT, HTML], {
      encoding: "utf8",
    });

    // La salida se incluye en la aserción: cuando esto falle, el mensaje tiene que
    // decir qué variable o qué pieza falta, no solo que el proceso salió con 1.
    expect(resultado.stdout.trim()).toContain("Interfaz verificada.");
    expect(resultado.status).toBe(0);
  });

  it("todas las vistas se ejecutan, no solo la del ticket", () => {
    // Un error de ejecución vive en una rama, no en el archivo: la vista de
    // features llamaba a `barraDeProgreso`, que no existía, y ninguna prueba lo
    // vio hasta que alguien abrió la pantalla con su primer feature descompuesto.
    // Se recorren todas, con datos que hacen pasar por sus ramas.
    return ejecutarTodasLasVistas(HTML).then(({ fallidas }) => {
      const detalle = fallidas
        .map((fallo) => `${fallo.vista} (${fallo.hash}): ${fallo.problemas.join("; ")}`)
        .join("\n");
      expect(detalle).toBe("");
      expect(VISTAS.length).toBeGreaterThanOrEqual(10);
    });
  });

  it("envía el proyecto seleccionado como identidad lógica de cada consulta", async () => {
    const consultas: { ruta: string; project: string | undefined }[] = [];
    await ejecutarInterfaz(HTML, {
      hash: "#/tickets",
      localStorage: { "valmen.project": "dos" },
      respuesta: (ruta, init) => {
        const headers = new Headers(init?.headers);
        consultas.push({ ruta, project: headers.get("X-Valmen-Project") ?? undefined });
        if (ruta.includes("/api/health")) return { root: "/proyectos/dos" };
        if (ruta.includes("/api/standards")) return { proposals: [] };
        if (ruta.includes("/api/tickets")) return { summary: {}, tickets: [] };
        return {};
      },
    });

    expect(consultas.filter((consulta) => consulta.ruta.includes("/api/tickets"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ project: "dos" })]),
    );
  });

  it("el verificador distingue una interfaz rota de una que funciona", () => {
    // Una prueba que solo confirma que el script pasa no dice nada sobre el
    // script: si el verificador no supiera fallar, este test y el anterior
    // pasarían igual sobre una interfaz rota. Se comprueba que **falle** cuando
    // tiene que fallar.
    const verificador = `
      import { readFileSync, writeFileSync } from "node:fs";
      import { ejecutarInterfaz, verificarInterfaz } from ${JSON.stringify(SCRIPT)};
      const html = readFileSync(${JSON.stringify(HTML)}, "utf8");
      const roto = html.replace(
        "async function pintarLineaDeTiempo(id) {",
        "async function pintarLineaDeTiempoRENOMBRADA(id) {",
      );
      if (roto === html) throw new Error("no se pudo fabricar la versión rota");
      writeFileSync("/tmp/valmen-roto.html", roto);
      const r = await ejecutarInterfaz("/tmp/valmen-roto.html");
      const v = verificarInterfaz(r.texto, r.contenido, r.fallos);
      console.log(v.ok ? "DIJO-OK" : "DIJO-FALLO: " + v.detalle);
    `;
    const resultado = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", verificador],
      {
        encoding: "utf8",
      },
    );

    expect(resultado.stdout).toContain("DIJO-FALLO");
    expect(resultado.stdout).toContain("pintarLineaDeTiempo");
  });
});

describe("la banda de fases del ticket", () => {
  const ID = "FEATURE-UI-BANDA-FASES-20260929";
  const ticket = readTicket({ root: RAIZ, ticketsDir: "tickets" }, ID);
  if (ticket === null) throw new Error(`Falta el ticket de prueba ${ID}`);
  // La fase única sale de la creación real del registro, no de una forma inventada.
  const faseUnica = fasesPorTicket(
    ticket.events.filter((evento) => evento["action"] === "created"),
  );

  function pintar(fases: readonly FaseDeTicket[], caida: boolean | "pendiente" = false) {
    return ejecutarInterfaz(HTML, {
      hash: `#/ticket/${ID}`,
      respuesta: (ruta) => {
        const url = new URL(ruta, "http://localhost");
        if (url.pathname === "/api/ticket/fases") {
          expect(url.searchParams.get("ticket")).toBe(ID);
          if (caida === "pendiente") return new Promise(() => {});
          if (caida) throw new Error("API de fases no disponible");
          return {
            ticket: ID,
            fases,
            timeline: { disponible: false },
            sesionesPorFase: [],
            kanban: null,
          };
        }
        if (url.pathname === `/api/tickets/${ID}/gates`) {
          return { gates: [], decisions: [], corrections: [], transitions: null };
        }
        if (url.pathname === `/api/tickets/${ID}`) return ticket;
        if (url.pathname === "/api/timeline") return { available: false };
        if (url.pathname === "/api/health") return { root: RAIZ };
        return {};
      },
    });
  }

  function conClase(nodo: NodoFalso | undefined, clase: string): NodoFalso[] {
    if (nodo === undefined) return [];
    return [
      ...(nodo.className?.split(" ").includes(clase) ? [nodo] : []),
      ...nodo.children.flatMap((hijo) => conClase(hijo, clase)),
    ];
  }

  function texto(nodo: NodoFalso): string {
    return [nodo._texto ?? "", ...nodo.children.map(texto)].join(" ");
  }

  async function montarEnVivo() {
    // Se expone solo el transporte y el clic del DOM mínimo; se ejecutan la vista,
    // el filtro SSE, la cortesía y el temporizador reales, sin sustituir su lógica.
    const temporal = mkdtempSync(join(tmpdir(), "valmen-sse-fases-"));
    const html = join(temporal, "index.html");
    const entorno = globalThis as typeof globalThis & {
      pruebaSSE: {
        eventos: { onmessage: (mensaje: { data: string }) => void };
        retomar: () => void;
      };
      document: {
        activeElement: { tagName: string } | null;
        querySelector: (selector: string) => object | null;
        getElementById: (id: string) => { hidden?: boolean };
      };
      location: { hash: string };
    };
    let fases = faseUnica;
    let caida = false;
    const llamadas: string[] = [];
    writeFileSync(
      html,
      readFileSync(HTML, "utf8").replace(
        '<script type="module">',
        `<script type="module">
          document.activeElement = null;
          globalThis.pruebaSSE = {};
          const TransporteDePrueba = globalThis.EventSource;
          globalThis.EventSource = class extends TransporteDePrueba {
            constructor(...args) {
              super(...args);
              globalThis.pruebaSSE.eventos = this;
            }
          };
          document.getElementById("hay-cambios").addEventListener = (tipo, accion) => {
            if (tipo === "click") globalThis.pruebaSSE.retomar = accion;
          };
        `,
      ),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const resultado = await ejecutarInterfaz(html, {
        hash: `#/ticket/${ID}`,
        respuesta: (ruta) => {
          llamadas.push(ruta);
          const url = new URL(ruta, "http://localhost");
          if (url.pathname === "/api/ticket/fases") {
            expect(url.searchParams.get("ticket")).toBe(ID);
            if (caida) throw new Error("API de fases no disponible");
            return { ticket: ID, fases };
          }
          if (url.pathname === `/api/tickets/${ID}/gates`) {
            return { gates: [], decisions: [], corrections: [], transitions: null };
          }
          if (url.pathname === `/api/tickets/${ID}`) return ticket;
          if (url.pathname === "/api/timeline") return { available: false };
          if (url.pathname === "/api/health") return { root: RAIZ };
          if (url.pathname === "/api/standards") return { proposals: [] };
          if (url.pathname === "/api/tickets") return { tickets: [] };
          return {};
        },
      });
      const banda = conClase(resultado.contenido, "banda-fases")[0]!;
      const tramosIniciales = conClase(banda, "banda-fase");
      const resto = resultado.contenido!.children.filter((nodo) => nodo !== banda);
      const contenidoDelResto = resto.map(texto);
      return {
        resultado,
        banda,
        tramosIniciales,
        resto,
        contenidoDelResto,
        llamadas,
        entorno,
        nuevasFases: () => {
          fases = fasesPorTicket([
            { action: "created", at: "2026-09-29T10:00:00Z", details: "Creado." },
            {
              action: "ticket-transition",
              at: "2026-09-29T11:30:00Z",
              details: "Workflow: intake -> in_progress.",
            },
          ]);
        },
        caer: () => { caida = true; },
        avisar: (id = ID) => entorno.pruebaSSE.eventos.onmessage({
          data: JSON.stringify({ paths: [`tickets/2026/${id}/ticket.md`] }),
        }),
        esperar: async (ms = 300) => {
          await vi.advanceTimersByTimeAsync(ms);
          for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
        },
      };
    } finally {
      unlinkSync(html);
      rmdirSync(temporal);
    }
  }

  it("un aviso SSE propio refresca el detalle completo con el margen de 300 ms", async () => {
    try {
      const vivo = await montarEnVivo();
      vivo.nuevasFases();
      const detalleAntes = vivo.llamadas.filter((ruta) => ruta === `/api/tickets/${ID}`).length;
      vivo.avisar();
      vivo.avisar();
      await vivo.esperar(299);
      expect(conClase(vivo.banda, "banda-fase")).toEqual(vivo.tramosIniciales);
      await vivo.esperar(1);
      const bandaNueva = conClase(vivo.resultado.contenido, "banda-fases")[0]!;
      expect(conClase(bandaNueva, "banda-fase")).toHaveLength(2);
      expect(texto(bandaNueva)).toContain("En curso");
      expect(bandaNueva).not.toBe(vivo.banda);
      expect(vivo.llamadas.filter((ruta) => ruta === `/api/tickets/${ID}`)).toHaveLength(detalleAntes + 1);
      expect(vivo.llamadas.filter((ruta) => ruta.startsWith("/api/ticket/fases?"))).toHaveLength(2);
      expect(vivo.resultado.fallos).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un aviso ajeno o con foco o diálogo no mueve la banda; el aviso pospuesto permite retomarla", async () => {
    for (const ocupacion of ["foco", "dialogo", "foco durante el margen"]) {
      try {
        const vivo = await montarEnVivo();
        vivo.nuevasFases();
        vivo.avisar("FEATURE-OTRO-20260929");
        await vivo.esperar();
        expect(conClase(vivo.banda, "banda-fase")).toEqual(vivo.tramosIniciales);
        expect(vivo.llamadas.filter((ruta) => ruta.startsWith("/api/ticket/fases?"))).toHaveLength(1);
        if (ocupacion === "foco durante el margen") vivo.avisar();
        if (ocupacion === "dialogo") {
          vivo.entorno.document.querySelector = (selector) => selector === "dialog[open]" ? {} : null;
        } else {
          vivo.entorno.document.activeElement = { tagName: "INPUT" };
        }
        if (ocupacion !== "foco durante el margen") vivo.avisar();
        await vivo.esperar();
        expect(conClase(vivo.banda, "banda-fase")).toEqual(vivo.tramosIniciales);
        expect(vivo.llamadas.filter((ruta) => ruta.startsWith("/api/ticket/fases?"))).toHaveLength(1);
        expect(vivo.entorno.document.getElementById("hay-cambios").hidden).toBe(false);
        vivo.entorno.document.activeElement = null;
        vivo.entorno.document.querySelector = () => null;
        vivo.entorno.pruebaSSE.retomar();
        await vivo.esperar(0);
        expect(conClase(vivo.resultado.contenido, "banda-fase")).toHaveLength(2);
        expect(vivo.entorno.document.getElementById("hay-cambios").hidden).toBe(true);
        expect(vivo.resultado.fallos).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("si el endpoint falla al refrescar en vivo conserva el detalle sin mostrar un error", async () => {
    try {
      const vivo = await montarEnVivo();
      vivo.caer();
      vivo.avisar();
      await vivo.esperar();
      expect(vivo.llamadas.filter((ruta) => ruta.startsWith("/api/ticket/fases?"))).toHaveLength(2);
      const bandaNueva = conClase(vivo.resultado.contenido, "banda-fases")[0]!;
      expect(bandaNueva).not.toBe(vivo.banda);
      expect(texto(bandaNueva)).toContain("Sin línea de fases");
      expect(conClase(bandaNueva, "error")).toHaveLength(0);
      expect(vivo.resultado.fallos).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pinta una fase única y los tramos cerrados y en curso con sus tiempos", async () => {
    expect(faseUnica).toHaveLength(1);
    const unica = await pintar(faseUnica);
    expect(unica.fallos).toEqual([]);
    const banda = conClase(unica.contenido, "banda-fases")[0]!;
    expect(conClase(banda, "banda-fase")).toHaveLength(1);
    expect(conClase(banda, "actual")).toHaveLength(1);
    expect(texto(banda)).toContain("Alta");
    expect(texto(banda)).toContain(
      `Inicio: ${new Date(faseUnica[0]!.inicio!).toLocaleString("es-CO")}`,
    );
    expect(texto(banda)).toMatch(/Tiempo llevado: \d/);
    const hijos = unica.contenido!.children;
    expect(hijos.indexOf(banda)).toBe(
      hijos.indexOf(conClase(unica.contenido, "estado-ticket")[0]!) + 1,
    );

    const fases = fasesPorTicket([
      { action: "created", at: "2026-09-29T10:00:00Z", details: "Creado." },
      {
        action: "ticket-transition",
        at: "2026-09-29T11:30:00Z",
        details: "Workflow: intake -> in_progress.",
      },
    ]);
    const varias = await pintar(fases);
    const tramos = conClase(varias.contenido, "banda-fase");
    expect(tramos).toHaveLength(2);
    expect(texto(tramos[0]!)).toContain("Duración: 1 h 30 min 0 s");
    expect(texto(tramos[0]!)).toContain(
      `Fin: ${new Date(fases[0]!.fin!).toLocaleString("es-CO")}`,
    );
    expect(tramos[1]!.className).toContain("actual");
    expect(texto(tramos[1]!)).toMatch(/En curso · Tiempo llevado: \d/);

    const sinHoras = await pintar([
      { estado: "closed", inicio: null, fin: null, ms: null, enCurso: false, motivo: null },
    ]);
    expect(sinHoras.texto).toContain("Sin duración registrada");
    expect(sinHoras.texto).toContain("Sin hora registrada");
    expect(conClase(conClase(sinHoras.contenido, "banda-fases")[0], "actual")).toHaveLength(
      0,
    );
  });

  it("muestra el motivo dentro del tramo y usa variables del tema sin colores literales", async () => {
    for (const estado of ["blocked", "changes_requested"]) {
      const motivo = "Falta confirmación <img src=x onerror=alert(1)>";
      const resultado = await pintar([
        {
          estado,
          inicio: "2026-09-29T10:00:00Z",
          fin: "2026-09-29T11:00:00Z",
          ms: 3_600_000,
          enCurso: false,
          motivo,
        },
        {
          estado: "in_progress",
          inicio: "2026-09-29T11:00:00Z",
          fin: null,
          ms: null,
          enCurso: true,
          motivo: null,
        },
      ]);
      const banda = conClase(resultado.contenido, "banda-fases")[0]!;
      const bloqueo = conClase(banda, "motivo-de-bloqueo")[0]!;
      expect(texto(bloqueo)).toContain(`Motivo del bloqueo: ${motivo}`);
      expect(texto(bloqueo)).toContain("Duración: 1 h 0 min 0 s");
      expect(conClase(banda, "chip")).toHaveLength(0);
      expect(bloqueo.children.some((nodo) => nodo.tagName === "IMG")).toBe(false);
    }
    const reglas = readFileSync(HTML, "utf8").match(/\.banda-[^{]+\{[^}]*\}/g) ?? [];
    expect(reglas.length).toBeGreaterThanOrEqual(7);
    const css = reglas.join("\n");
    expect(css).toContain("var(--acento)");
    expect(css).toContain("var(--error)");
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i);
    const colores = [
      ...css.matchAll(/(?:color|background|border(?:-color)?)\s*:\s*([^;]+);/g),
    ];
    expect(colores.length).toBeGreaterThan(0);
    for (const [, valor] of colores) {
      // Se admite solo la geometría del borde y colores resueltos desde el tema.
      expect(
        valor!.replace(
          /var\(--[\w-]+\)|color-mix\(|in srgb|[\d.]+(?:px|%)?|solid|[\s,)]/g,
          "",
        ),
      ).toBe("");
      expect(valor).toMatch(/var\(--/);
    }
  });

  it("con la API de fases caída conserva toda la vista y muestra una fila informativa", async () => {
    const normal = await pintar(faseUnica);
    const caida = await pintar([], true);
    expect(caida.fallos).toEqual([]);
    // El criterio del propio ticket cita esa frase: no es un aviso de la UI.
    expect(
      caida.contenido!.children.some((nodo) =>
        nodo._texto?.startsWith("No se pudo cargar la vista:"),
      ),
    ).toBe(false);
    const banda = conClase(caida.contenido, "banda-fases")[0]!;
    expect(texto(banda)).toContain("Sin línea de fases");
    expect(conClase(banda, "error")).toHaveLength(0);
    expect(conClase(banda, "banda-fase")).toHaveLength(0);
    const resto = (nodo: NodoFalso | undefined) =>
      nodo!.children
        .filter((hijo) => !hijo.className?.split(" ").includes("banda-fases"))
        .map(texto);
    expect(resto(caida.contenido)).toEqual(resto(normal.contenido));
    expect(caida.texto).toContain("Criterios de aceptación");
    expect(caida.texto).toContain("Línea de tiempo y coste");
    const pendiente = await pintar([], "pendiente");
    expect(pendiente.fallos).toEqual([]);
    expect(pendiente.texto).toContain("Leyendo las fases…");
    expect(resto(pendiente.contenido)).toEqual(resto(normal.contenido));
  });
});

/**
 * El intérprete de Markdown de las secciones.
 *
 * El plan de un ticket es un documento —títulos, pasos numerados con subpasos,
 * código en línea— y como `<pre>` se lee como una pared. Esto comprueba que se
 * interprete, y sobre todo **que sea seguro**: el texto sale de un archivo del
 * repositorio, y renderizar Markdown como HTML crudo es la vía clásica de
 * inyección.
 */
describe("el intérprete de Markdown", () => {
  /** El plan real de un ticket, que es el caso que hay que aguantar. */
  const PLAN = [
    "## Plan",
    "",
    "- Alcance y exclusiones: se cierra el contrato para `invoice` en tres eslabones.",
    "- Gate de plan: **aprobado explícitamente por el PO**, que dijo «si te apruebo el plan».",
    "- Pasos ordenados:",
    "  1. Confirmar el contrato en un entorno autorizado.",
    '  2. Backend compatible: `if "invoice" in JsonData`.',
    "  3. Agente: añadir `COALESCE(I.FACTURABLE,'S')` al SQL.",
    "- Compatibilidad y rollback: la nube primero, el agente después.",
  ].join("\n");

  /**
   * El intérprete, cargado una sola vez.
   *
   * Ejecutar la interfaz arranca la navegación y abre el flujo de eventos, así que
   * hacerlo en cada prueba multiplicaría el trabajo sin añadir nada: el intérprete
   * es el mismo en todas.
   */
  let interprete: Promise<(texto: string) => NodoFalso> | null = null;
  function obtenerInterprete(): Promise<(texto: string) => NodoFalso> {
    interprete ??= ejecutarInterfaz(HTML).then((r) => {
      if (typeof r.render !== "function") {
        throw new Error("el verificador no expuso el intérprete de Markdown");
      }
      return r.render;
    });
    return interprete;
  }

  /** Interpreta un texto y devuelve su árbol. */
  async function interpretar(texto: string): Promise<NodoFalso> {
    return (await obtenerInterprete())(texto);
  }

  /** El texto de cada nodo de una etiqueta, en orden. */
  function recoger(nodo: NodoFalso, etiqueta: string): string[] {
    const propio = nodo.tagName === etiqueta ? [nodo._texto ?? ""] : [];
    return propio.concat((nodo.children ?? []).flatMap((hijo) => recoger(hijo, etiqueta)));
  }

  /** Cuenta nodos por etiqueta dentro de un árbol. */
  function contar(nodo: NodoFalso, etiqueta: string): number {
    let total = nodo.tagName === etiqueta ? 1 : 0;
    for (const hijo of nodo.children ?? []) total += contar(hijo, etiqueta);
    return total;
  }

  it("anida los pasos dentro del punto que los contiene", () => {
    return interpretar(PLAN).then((arbol) => {
      // La lista numerada de pasos cuelga de la viñeta «Pasos ordenados», no del
      // contenedor: es lo que hace que el punto 3 con sus subpasos se lea como un
      // punto con subpasos y no como una lista plana.
      const anidadas = (() => {
        let total = 0;
        const recorrer = (nodo: unknown) => {
          const n = nodo as {
            tagName?: string;
            parentNode?: { tagName?: string };
            children?: unknown[];
          };
          if (n.tagName === "OL" && n.parentNode?.tagName === "LI") total += 1;
          for (const hijo of n.children ?? []) recorrer(hijo);
        };
        recorrer(arbol);
        return total;
      })();

      expect(anidadas).toBe(1);
      expect(contar(arbol, "LI")).toBeGreaterThanOrEqual(6);
    });
  });

  it("interpreta el código en línea y la negrita", async () => {
    const arbol = await interpretar(PLAN);

    // El plan está lleno de nombres de archivo y de funciones: en línea son la
    // diferencia entre leer un paso y descifrarlo. Se comprueba el contenido y no
    // solo el número: tres `code` vacíos también serían tres.
    const fragmentos = recoger(arbol, "CODE");
    expect(fragmentos).toEqual([
      "invoice",
      'if "invoice" in JsonData',
      "COALESCE(I.FACTURABLE,'S')",
    ]);
    expect(recoger(arbol, "STRONG")).toEqual(["aprobado explícitamente por el PO"]);
  });

  it("no interpreta el HTML del ticket: lo trata como texto", async () => {
    const arbol = await interpretar(
      ["# Título", "", "<script>alert(1)</script> y <img src=x onerror=y>"].join("\n"),
    );

    // El texto se ve, y no se crea ningún nodo ejecutable. Es la comprobación que
    // importa: un ticket con `<script>` en el plan no puede ejecutarse al abrirlo.
    expect(contar(arbol, "SCRIPT")).toBe(0);
    expect(contar(arbol, "IMG")).toBe(0);
  });

  it("no cuelga con un documento al que le falta avanzar", async () => {
    // El intérprete lleva un contador de vueltas porque una versión anterior se
    // quedaba en bucle en la rama de los títulos —faltaba un `i += 1`— y la
    // pestaña se quedaba sin memoria sin decir por qué. Esto comprueba que un
    // documento largo termina.
    const largo = Array.from({ length: 400 }, (_, i) => `- punto ${i} con \`código\``).join(
      "\n",
    );
    const arbol = await interpretar(largo);
    expect(contar(arbol, "LI")).toBe(400);
  });
});
