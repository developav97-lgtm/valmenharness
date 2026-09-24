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
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
