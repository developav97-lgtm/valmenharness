#!/usr/bin/env node
/**
 * Ejecuta el módulo de la interfaz de Mission Control con un DOM mínimo.
 *
 * Existe por un fallo concreto que llegó al navegador de quien la usa: una función
 * llamada desde la vista del ticket se quedó sin definición al reescribir un
 * bloque, y la pantalla respondió «No se pudo cargar la vista: Can't find variable:
 * pintarLineaDeTiempo». **Ningún test lo vio**, y no por falta de cobertura: el
 * módulo se escribe en un `<script type="module">` dentro de un HTML que ningún
 * test ejecuta. `node --check` valida la sintaxis, y una variable inexistente no es
 * un error de sintaxis — es un error de ejecución, y solo aparece cuando la rama se
 * recorre.
 *
 * Este arnés recorre la rama: monta un DOM mínimo, responde la API con datos de la
 * forma que la vista espera, importa el módulo y comprueba **qué se pintó**. Que
 * pinte algo no basta, porque `navegar` captura los fallos y pinta un aviso: lo que
 * se comprueba es que el contenido sea el de la vista y no el del aviso.
 *
 * El DOM es deliberadamente estricto. Un `Proxy` que responde a todo deja pasar
 * errores que el navegador sí lanzaría, y el arnés diría «OK» sobre una interfaz
 * rota —que es exactamente el fallo que esto tiene que impedir.
 *
 * Uso: `node scripts/verificar-interfaz.mjs [ruta-del-html]`
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

/** El DOM mínimo: un nodo real, no un objeto que tolera todo. */
class Nodo {
  constructor(tag = "div") {
    // Un nodo de texto se distingue por `nodeName`, como en el DOM real: buscar
    // `tagName` para encontrarlos deja el texto fuera y el recuento sale a cero.
    this.tagName = String(tag).toUpperCase();
    this.nodeName = tag === "#text" ? "#text" : this.tagName;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this._texto = "";
    this.className = "";
    this.value = "";
    this.type = "";
    this.id = "";
    this.href = "";
    this.title = "";
    this.disabled = false;
    this.open = false;
    this.classList = {
      add: (clase) => {
        if (!this.className.includes(clase)) this.className += ` ${clase}`;
      },
      remove: (clase) => {
        this.className = this.className
          .split(" ")
          .filter((parte) => parte !== clase)
          .join(" ");
      },
      contains: (clase) => this.className.split(" ").includes(clase),
      // `toggle` devuelve el estado nuevo, como el del navegador: la interfaz lo
      // usa para el pliegue de la barra lateral y espera un booleano.
      toggle: (clase, forzar) => {
        const tiene = this.classList.contains(clase);
        const poner = forzar === undefined ? !tiene : Boolean(forzar);
        if (poner) this.classList.add(clase);
        else this.classList.remove(clase);
        return poner;
      },
    };
  }
  get textContent() {
    return this._texto;
  }
  set textContent(valor) {
    this._texto = String(valor);
    this.children = [];
  }
  get innerHTML() {
    return this._texto;
  }
  set innerHTML(valor) {
    this._texto = String(valor);
  }
  append(...nodos) {
    for (const nodo of nodos) {
      if (!nodo) continue;
      nodo.parentNode = this;
      this.children.push(nodo);
    }
  }
  appendChild(nodo) {
    nodo.parentNode = this;
    this.children.push(nodo);
    return nodo;
  }
  replaceChildren(...nodos) {
    this.children = nodos;
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute(clave, valor) {
    this.attrs[clave] = String(valor);
  }
  removeAttribute(clave) {
    delete this.attrs[clave];
  }
  getAttribute(clave) {
    return this.attrs[clave] ?? null;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }
  focus() {}
  reset() {}
  close() {}
  remove() {}
  insertBefore(nodo) {
    this.children.push(nodo);
    return nodo;
  }
}

/** El ticket con el que se ejercita la vista. */
const TICKET = {
  id: "BUGFIX-UNO-20260101",
  title: "El filtro devuelve otros productos",
  type: "BUGFIX",
  module: "POS",
  workflowStatus: "planned",
  qaStatus: "pending",
  releaseStatus: "unreleased",
  riskLevel: "normal",
  created: "2026-01-01",
  updated: "2026-01-01",
  openPoints: 1,
  totalPoints: 2,
  criticalImpacts: [],
  path: "docs/tickets/2026/BUGFIX-UNO-20260101/ticket.md",
  invalid: null,
  request: "petición original",
  sections: {
    "Descripción funcional": "descripción",
    Diagnóstico: "diagnóstico",
    Plan: "plan",
    "Criterios de aceptación": "- [ ] uno\n- [x] dos",
    Implementación: "implementación",
    Pruebas: "pruebas",
    Release: "release",
  },
  points: [{ id: "POINT-001", status: "open", severity: "normal", title: "algo" }],
  qa: [],
  evidence: [],
  retests: [],
  closures: [],
  events: [
    { id: "EVENT-001", date: "2026-01-01", action: "created", actor: "cli", details: "d" },
  ],
  usage: [
    {
      id: "CONSUMO-001",
      date: "2026-01-01",
      model: "proveedor/modelo",
      confidence: "high",
      estimated_cost_usd: 0.1,
      notes: "nota",
    },
  ],
};

/** Una feature descompuesta: la que hace recorrer el progreso y el tablero. */
const FEATURE = {
  id: "kardex",
  title: "Kardex de inventario",
  state: "decomposed",
  created: "2026-01-01",
  updated: "2026-01-02",
  path: ".valmen/features/kardex/feature.md",
  invalid: null,
  hasSpec: true,
  hasDesign: true,
  hasDecomposition: true,
  hasVerify: false,
  requirements: 1,
  tickets: 2,
  closedTickets: 1,
  gaps: 0,
  transitions: ["in_progress"],
  brief: "# Kardex\n",
  specs: [],
  design: null,
  ticketsYaml: "feature: kardex\n",
  decomposition: {
    origin: null,
    sprints: [
      {
        id: "S1",
        goal: "Modelo y API",
        tickets: [
          {
            id: "FEATURE-INVENTARIO-MODELO-20260101",
            title: "Modelo",
            dependsOn: [],
            exists: true,
            state: "closed",
          },
          {
            id: "FEATURE-INVENTARIO-API-20260101",
            title: "API",
            dependsOn: ["FEATURE-INVENTARIO-MODELO-20260101"],
            exists: false,
            state: null,
          },
        ],
      },
    ],
    requirements: [],
    gaps: [],
  },
  decompositionError: null,
  cycles: [],
};

/** Responde cada ruta con la forma que la vista espera. */
function respuesta(ruta) {
  if (ruta.includes("/api/health")) return { root: "/proyecto" };
  if (ruta.includes("/gates")) {
    return {
      gates: [],
      decisions: [
        {
          gate: "plan",
          outcome: "approve",
          receiptId: "GR-1",
          actor: "model",
          decidedAt: "2026-01-01T00:00:00Z",
          stale: false,
          humanDecision: null,
        },
      ],
      corrections: [],
      transitions: { ticket: ["approved"], release: [], points: [] },
    };
  }
  if (ruta.includes("/api/timeline")) return { available: false, reason: "sin datos" };

  // Las demás vistas. Cada una con el dato que la hace recorrer sus ramas: una
  // feature **descompuesta** —que es la que pinta el progreso y el tablero—, una
  // propuesta aceptada y otra pendiente, procesos y proveedores con filas.
  if (ruta.includes("/api/features/")) return FEATURE;
  if (ruta.includes("/api/features")) {
    return {
      summary: { total: 1, decomposed: 1, withGaps: 0, invalid: 0 },
      features: [FEATURE],
    };
  }
  if (ruta.includes("/api/standards")) {
    return {
      standards: [
        {
          area: "presentacion",
          path: ".valmen/rules/estandares-presentacion.md",
          content: "# Reglas\n\nUna regla.",
        },
      ],
      proposals: [
        {
          id: "EST-001",
          title: "Una propuesta",
          area: "datos",
          rule: "Una regla propuesta.",
          why: "Porque sí.",
          tickets: [],
          date: "2026-01-01",
          decidedOn: "",
          instruction: "",
          state: "propuesto",
          source: { path: ".valmen/estandares-propuestos.md", line: 1 },
        },
        {
          id: "EST-002",
          title: "Una aceptada",
          area: "datos",
          rule: "Una regla en vigor.",
          why: "Porque sí.",
          tickets: [],
          date: "2026-01-01",
          decidedOn: "2026-01-02",
          instruction: "aceptala",
          state: "aceptado",
          source: { path: ".valmen/estandares-propuestos.md", line: 9 },
        },
      ],
    };
  }
  if (ruta.includes("/api/processes")) {
    return {
      summary: { processes: 0, waiting: 0, gatesPending: 0, runs: 0 },
      processes: [],
      runs: [],
    };
  }
  if (ruta.includes("/api/providers")) return { providers: [] };
  if (ruta.includes("/api/routing")) {
    return {
      routing: {
        preset: "balanced",
        roles: [
          {
            role: "gate-evaluator",
            description: "Responde las proposiciones de un gate",
            consumer: "valmen gate",
            provider: "openrouter",
            model: "typesafe/jev-1.13",
            effort: "auto",
            source: "preset",
          },
        ],
        presets: [
          {
            id: "balanced",
            description: "El equilibrio por defecto",
            roles: {
              orchestrator: { provider: "openrouter", model: "moonshotai/kimi-k3" },
            },
          },
        ],
        text: "preset: balanced\n",
      },
    };
  }
  if (ruta.includes("/api/config")) {
    // La forma que devuelve el servidor: el estado del archivo con su ruta, su
    // texto y si se pudo leer.
    return {
      config: {
        path: ".valmen/config.yaml",
        text: "name: Demo\n",
        ok: true,
        error: null,
        summary: { name: "Demo", ticketsDir: "", gates: [], keys: ["name"] },
        // El diff contra el archivo en disco: la vista lo recorre para mostrar
        // qué cambiaría, y sin él la pantalla se cae al pintar.
        diff: [],
      },
      impact: null,
    };
  }
  if (ruta.includes("/api/tickets/")) return TICKET;
  if (ruta.includes("/api/tickets")) {
    return {
      summary: {
        total: 1,
        byWorkflow: { planned: 1 },
        byType: {},
        invalid: 0,
        withOpenPoints: 1,
        criticalImpacts: 0,
      },
      tickets: [TICKET],
    };
  }
  return {};
}

/** Recorre el árbol y devuelve todo el texto y las clases que contiene. */
function textoDe(nodo, acumulado = []) {
  if (!nodo || typeof nodo !== "object") return acumulado;
  if (nodo.nodeName === "#text") return acumulado.push(String(nodo._texto ?? ""));
  if (nodo._texto) acumulado.push(String(nodo._texto));
  if (nodo.className) acumulado.push(String(nodo.className));
  for (const hijo of nodo.children ?? []) textoDe(hijo, acumulado);
  return acumulado;
}

/**
 * Monta el entorno, importa el módulo y devuelve el contenido pintado.
 *
 * Se ejecuta en un proceso aparte porque el módulo tiene efectos al importarse
 * —arranca la navegación y abre el flujo de eventos— y dos importaciones en el
 * mismo proceso compartirían ese estado.
 */
/**
 * @param {string} rutaHtml
 * @param {{ hash?: string, respuesta?: (ruta: string) => unknown }} [opciones]
 */
export async function ejecutarInterfaz(rutaHtml, opciones = {}) {
  const codigo = /<script type="module">([\s\S]*?)<\/script>/.exec(
    readFileSync(rutaHtml, "utf8"),
  )?.[1];
  if (codigo === undefined) throw new Error(`No se encontró el módulo en ${rutaHtml}.`);

  // La vista y las respuestas se pueden sustituir para ejercitar otra pantalla
  // —el tablero de una feature, por ejemplo— con los datos que ese caso
  // necesita. Sin argumentos se comporta como siempre: la vista del ticket.
  const hash = opciones.hash ?? `#/ticket/${TICKET.id}`;
  const responder = opciones.respuesta ?? respuesta;

  const porId = new Map();
  const documento = {
    getElementById: (id) => {
      if (!porId.has(id)) porId.set(id, new Nodo("div"));
      return porId.get(id);
    },
    createElement: (tag) => new Nodo(tag),
    createTextNode: (texto) => {
      const nodo = new Nodo("#text");
      nodo._texto = String(texto);
      return nodo;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: new Nodo("body"),
  };

  globalThis.document = documento;
  globalThis.window = { addEventListener: () => {}, location: { hash: "" } };
  globalThis.location = globalThis.window.location;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  globalThis.EventSource = class {
    addEventListener() {}
  };
  globalThis.Option = class {
    constructor(etiqueta, valor) {
      this.text = etiqueta;
      this.value = valor;
    }
  };
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => responder(String(url)),
    text: async () => "",
  });

  const fallos = [];
  const recoger = (error) => {
    fallos.push(`rechazo no capturado: ${error?.message ?? String(error)}`);
  };
  process.on("unhandledRejection", recoger);

  // El hash se fija **dentro** del módulo: `navegar()` se llama al final del
  // script y decide la vista según `location.hash`. Fijarlo desde fuera llega
  // tarde, y sin él la vista del ticket no se ejecuta —que es justo lo que este
  // arnés tiene que recorrer.
  // Un archivo por llamada: el módulo tiene efectos al importarse y el caché de
  // ESM lo importa **una vez por ruta**, así que dos vistas en el mismo proceso
  // con el mismo nombre darían la segunda vacía —sin error— y la prueba diría
  // que la vista no pinta nada cuando lo que pasa es que no se ejecutó.
  const destino = join(tmpdir(), `valmen-interfaz-${process.pid}-${randomUUID()}.mjs`);
  // El intérprete de Markdown se expone además de ejecutar la vista: el resto se
  // comprueba por lo que pinta, pero un documento hay que interpretarlo para saber
  // si se lee.
  writeFileSync(
    destino,
    `globalThis.location.hash = ${JSON.stringify(hash)};\n` +
      codigo +
      "\nglobalThis.RENDER_MARKDOWN = renderMarkdown;\n",
  );

  await import(pathToFileURL(destino).href);
  for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
  try {
    unlinkSync(destino);
  } catch {
    // Si no se puede borrar, el temporal queda en /tmp y no afecta al resultado.
  }
  // Once vistas en el mismo proceso dejaban once oyentes y Node avisaba de una
  // fuga: el aviso era del arnés, no de la interfaz.
  process.off("unhandledRejection", recoger);

  return {
    contenido: porId.get("contenido"),
    texto: textoDe(porId.get("contenido")).join(" | "),
    fallos,
    render: globalThis.RENDER_MARKDOWN,
  };
}

/**
 * Las vistas que la interfaz sabe pintar, con el hash que las abre.
 *
 * Se ejecutan **todas** porque un error de ejecución vive en una rama, no en el
 * archivo: la vista de features llamaba a una función que no existía y ninguna
 * prueba lo vio —la rama solo se recorría con una feature descompuesta, y no
 * había ninguna— hasta que el usuario abrió la pantalla con su primer feature.
 * Es el mismo fallo que originó este verificador, con otra función.
 */
export const VISTAS = [
  ["tickets", "#/tickets"],
  ["features", "#/features"],
  ["feature", "#/feature/kardex"],
  ["procesos", "#/procesos"],
  ["estandares", "#/estandares"],
  ["configurar", "#/configurar"],
  ["modelos", "#/modelos"],
  ["configuracion", "#/configuracion"],
  ["proveedores", "#/proveedores"],
  ["ticket", `#/ticket/${TICKET.id}`],
];

/**
 * Ejecuta cada vista y devuelve las que fallaron.
 *
 * Un fallo es cualquiera de los dos que la aplicación ya sabe reportar: un
 * rechazo sin capturar, o el aviso «No se pudo cargar la vista» que la pantalla
 * pinta cuando el error ocurre dentro de una vista.
 */
export async function ejecutarTodasLasVistas(rutaHtml) {
  const fallidas = [];
  const texto = new Map();

  for (const [nombre, hash] of VISTAS) {
    const resultado = await ejecutarInterfaz(rutaHtml, { hash });
    texto.set(nombre, resultado.texto);
    const problemas = [...resultado.fallos];
    if (resultado.texto.includes("No se pudo cargar la vista")) {
      problemas.push(resultado.texto.slice(resultado.texto.indexOf("No se pudo cargar")));
    }
    if (problemas.length > 0) fallidas.push({ vista: nombre, hash, problemas });
  }

  return { fallidas, texto };
}

/** Comprueba que la vista se pintó y no un aviso de error. */
export function verificarInterfaz(texto, contenido, fallos) {
  const nodos = contenido?.children.length ?? 0;
  if (fallos.length > 0) return { ok: false, detalle: fallos.join("; "), nodos };
  if (texto.includes("No se pudo cargar la vista")) {
    const motivo = /No se pudo cargar la vista: ([^|]*)/.exec(texto);
    return { ok: false, detalle: (motivo?.[1] ?? "sin detalle").trim(), nodos };
  }
  // Que pinte algo no basta: `navegar` captura los fallos y pinta un aviso, así que
  // una vista rota también deja nodos. Se comprueba que esté lo que tiene que estar.
  if (!texto.includes("acordeon") || !texto.includes("Criterios de aceptación")) {
    return { ok: false, detalle: "la vista no pintó sus piezas", nodos };
  }
  return { ok: true, detalle: "", nodos };
}

// Ejecución directa: `node scripts/verificar-interfaz.mjs [ruta]`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
  const ruta = process.argv[2] ?? join(raiz, "packages", "server", "web", "index.html");

  // La copia publicada tiene que ser la misma que la fuente. El servidor sirve
  // `dist/web/`, así que una copia vieja muestra una pantalla vieja **sin decir
  // por qué** —el síntoma más caro que tuvo esta interfaz—, y comprobarlo acá es
  // lo que convierte «acordate de copiar» en algo que no hace falta recordar.
  const publicada = join(raiz, "packages", "cli", "dist", "web", "index.html");
  if (existsSync(publicada)) {
    const fuente = readFileSync(ruta, "utf8");
    if (readFileSync(publicada, "utf8") !== fuente) {
      console.log(
        "FALLO: la interfaz publicada en packages/cli/dist/web/ no coincide con " +
          "la fuente. Ejecute `npm run build`: es lo que sirve el servidor.",
      );
      process.exit(1);
    }
  }

  const { contenido, texto, fallos } = await ejecutarInterfaz(ruta);
  const resultado = verificarInterfaz(texto, contenido, fallos);

  console.log(`nodos en #contenido: ${resultado.nodos}`);

  // Y las demás vistas, que es donde se esconden las ramas que nadie recorría.
  const vistas = await ejecutarTodasLasVistas(ruta);
  if (vistas.fallidas.length > 0) {
    for (const fallo of vistas.fallidas) {
      console.error(`La vista ${fallo.vista} (${fallo.hash}) falló:`);
      for (const problema of fallo.problemas) console.error(`  ${problema}`);
    }
    process.exit(1);
  }
  console.log(`vistas ejecutadas: ${VISTAS.length}`);
  if (!resultado.ok) {
    console.log(`FALLO: ${resultado.detalle}`);
    process.exitCode = 1;
  } else {
    console.log("Interfaz verificada.");
  }
}
