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
import { readFileSync, writeFileSync } from "node:fs";
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
      remove: () => {},
      contains: () => false,
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
export async function ejecutarInterfaz(rutaHtml) {
  const codigo = /<script type="module">([\s\S]*?)<\/script>/.exec(
    readFileSync(rutaHtml, "utf8"),
  )?.[1];
  if (codigo === undefined) throw new Error(`No se encontró el módulo en ${rutaHtml}.`);

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
    json: async () => respuesta(String(url)),
    text: async () => "",
  });

  const fallos = [];
  process.on("unhandledRejection", (error) => {
    fallos.push(`rechazo no capturado: ${error?.message ?? String(error)}`);
  });

  // El hash se fija **dentro** del módulo: `navegar()` se llama al final del
  // script y decide la vista según `location.hash`. Fijarlo desde fuera llega
  // tarde, y sin él la vista del ticket no se ejecuta —que es justo lo que este
  // arnés tiene que recorrer.
  const destino = join(tmpdir(), `valmen-interfaz-${process.pid}.mjs`);
  // El intérprete de Markdown se expone además de ejecutar la vista: el resto se
  // comprueba por lo que pinta, pero un documento hay que interpretarlo para saber
  // si se lee.
  writeFileSync(
    destino,
    `globalThis.location.hash = "#/ticket/${TICKET.id}";\n` +
      codigo +
      "\nglobalThis.RENDER_MARKDOWN = renderMarkdown;\n",
  );

  await import(pathToFileURL(destino).href);
  for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));

  return {
    contenido: porId.get("contenido"),
    texto: textoDe(porId.get("contenido")).join(" | "),
    fallos,
    render: globalThis.RENDER_MARKDOWN,
  };
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

  const { contenido, texto, fallos } = await ejecutarInterfaz(ruta);
  const resultado = verificarInterfaz(texto, contenido, fallos);

  console.log(`nodos en #contenido: ${resultado.nodos}`);
  if (!resultado.ok) {
    console.log(`FALLO: ${resultado.detalle}`);
    process.exitCode = 1;
  } else {
    console.log("Interfaz verificada.");
  }
}
