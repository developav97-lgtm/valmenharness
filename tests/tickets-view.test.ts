/**
 * La vista de tickets de Mission Control.
 *
 * Reemplaza al visor anterior, que mostraba solo los tickets cerrados. Mission
 * Control necesita **todo el ciclo**: qué está en curso, qué espera una decisión
 * y qué está bloqueado son las preguntas que importan durante el trabajo.
 *
 * Lo que estos tests protegen:
 *
 * 1. **Un ticket inválido no se oculta.** Un registro con un ticket roto es
 *    precisamente lo que hay que ver; esconderlo dejaría la lista con aspecto
 *    completo y un dato falso.
 * 2. **La proyección no inventa.** Lo que la interfaz muestra sale del ticket o
 *    es un conteo derivado; nada se calcula con criterio propio.
 * 3. **Los filtros filtran de verdad**, y la búsqueda no entra en los bloques
 *    JSON, donde los resultados no serían interpretables en una lista.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  filterTickets,
  listTickets,
  readTicket,
  summarize,
} from "../packages/engine/src/tickets.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import { handleApi } from "../packages/server/src/server.js";

/** Rutas del registro del laboratorio. El laboratorio usa el layout nuevo. */
const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

const FIXTURE = join(import.meta.dirname, "fixtures", "saicloud", "tickets");

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-tickets-"));
  cpSync(FIXTURE, join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const UN_TICKET = "BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907";
/** Un ticket que no está cerrado, para probar lo que se excluye por estado. */
const ABIERTO = "BUGFIX-POS-ABIERTO-20260922";

// ── Proyección ──────────────────────────────────────────────────────────────

describe("proyección del registro", () => {
  it("lee los 57 tickets reales", () => {
    const filas = listTickets(PATHS());
    expect(filas).toHaveLength(57);
    expect(filas.every((fila) => fila.invalid === null)).toBe(true);
  });

  it("deriva el resumen de las filas", () => {
    const resumen = summarize(listTickets(PATHS()));
    expect(resumen.total).toBe(57);
    // Los 57 están cerrados en el fixture.
    expect(resumen.byWorkflow["closed"]).toBe(57);
    expect(resumen.withOpenPoints).toBe(0);
    // Los tipos salen del propio registro, no de una lista escrita a mano.
    const suma = Object.values(resumen.byType).reduce((total, n) => total + n, 0);
    expect(suma).toBe(57);
  });

  it("cuenta los impactos críticos declarados", () => {
    const resumen = summarize(listTickets(PATHS()));
    const conImpacto = listTickets(PATHS()).filter(
      (fila) => fila.criticalImpacts.length > 0,
    );
    expect(resumen.criticalImpacts).toBe(conImpacto.length);
    // Cada impacto informado es uno de los tres del contrato.
    for (const fila of conImpacto) {
      for (const impacto of fila.criticalImpacts) {
        expect(["sync_impact", "migration_impact", "docker_impact"]).toContain(impacto);
      }
    }
  });

  it("ordena del más reciente al más antiguo", () => {
    // Lo que se está trabajando ahora es lo que primero se quiere ver.
    const filas = filterTickets(listTickets(PATHS()), {});
    for (let i = 1; i < filas.length; i += 1) {
      expect(
        (filas[i - 1] as { updated: string }).updated >=
          (filas[i] as { updated: string }).updated,
      ).toBe(true);
    }
  });

  it("un ticket inválido se incluye con su error, no se oculta", () => {
    // Esconderlo dejaría la lista con aspecto completo y un dato falso.
    const ruta = join(lab, "tickets", "2026", UN_TICKET, "ticket.md");
    writeFileSync(
      ruta,
      readFileSync(ruta, "utf8").replace(/^risk_level: .*$/m, "risk_level: gravisimo"),
      "utf8",
    );

    const filas = listTickets(PATHS());
    expect(filas).toHaveLength(57);
    const roto = filas.find((fila) => fila.id === UN_TICKET);
    expect(roto?.invalid).toContain("risk_level no pertenece al esquema");
    // Y se conserva lo que sí se pudo leer: una fila vacía no ayudaría a nadie.
    expect(roto?.title.length).toBeGreaterThan(0);
    expect(roto?.type).toBe("BUGFIX");
  });

  it("un ticket con frontmatter ilegible no rompe la lista", () => {
    const ruta = join(lab, "tickets", "2026", UN_TICKET, "ticket.md");
    writeFileSync(ruta, "esto no es un ticket", "utf8");
    const filas = listTickets(PATHS());
    expect(filas).toHaveLength(57);
    expect(filas.find((fila) => fila.id === UN_TICKET)?.invalid).toBeTruthy();
  });
});

// ── Detalle ─────────────────────────────────────────────────────────────────

describe("detalle de un ticket", () => {
  it("devuelve las secciones, los bloques y la solicitud", () => {
    const detalle = readTicket(PATHS(), UN_TICKET);
    expect(detalle).not.toBeNull();
    expect(detalle?.title).toBe("El reporte Z mezcla cierres de sucursales");
    expect(Object.keys(detalle?.sections ?? {})).toHaveLength(15);
    expect(detalle?.events.length).toBeGreaterThan(0);
    expect(detalle?.request.length).toBeGreaterThan(0);
    expect(detalle?.invalid).toBeNull();
  });

  it("devuelve null si el ticket no existe", () => {
    expect(readTicket(PATHS(), "BUGFIX-POS-NO-EXISTE-20260101")).toBeNull();
  });

  it("muestra un ticket inválido con su error", () => {
    const ruta = join(lab, "tickets", "2026", UN_TICKET, "ticket.md");
    writeFileSync(
      ruta,
      readFileSync(ruta, "utf8").replace(/^qa_status: .*$/m, "qa_status: inventado"),
      "utf8",
    );
    const detalle = readTicket(PATHS(), UN_TICKET);
    // El usuario necesita ver qué tiene el ticket, no un error genérico.
    expect(detalle?.invalid).toContain("qa_status no pertenece al esquema");
    expect(detalle?.sections).toBeDefined();
  });
});

// ── Filtros ─────────────────────────────────────────────────────────────────

describe("filtros", () => {
  const filas = (): ReturnType<typeof listTickets> => listTickets(PATHS());

  it("filtra por tipo", () => {
    const sync = filterTickets(filas(), { type: "SYNC" });
    expect(sync.length).toBeGreaterThan(0);
    expect(sync.every((fila) => fila.type === "SYNC")).toBe(true);
  });

  it("filtra por estado", () => {
    expect(filterTickets(filas(), { workflowStatus: "closed" })).toHaveLength(57);
    expect(filterTickets(filas(), { workflowStatus: "intake" })).toHaveLength(0);
  });

  it("filtra por módulo", () => {
    const pos = filterTickets(filas(), { module: "POS" });
    expect(pos.length).toBeGreaterThan(0);
    expect(pos.every((fila) => fila.module === "POS")).toBe(true);
  });

  it("busca por identificador, título y módulo", () => {
    expect(filterTickets(filas(), { query: UN_TICKET }).length).toBe(1);
    expect(filterTickets(filas(), { query: "reporte z" }).length).toBeGreaterThan(0);
    expect(filterTickets(filas(), { query: "restaurante" }).length).toBeGreaterThan(0);
  });

  it("la búsqueda es insensible a mayúsculas", () => {
    const minusculas = filterTickets(filas(), { query: "restaurante" }).length;
    const mayusculas = filterTickets(filas(), { query: "RESTAURANTE" }).length;
    expect(mayusculas).toBe(minusculas);
  });

  it("no busca dentro de los bloques JSON", () => {
    // Un resultado que solo coincide en un bloque de eventos no es
    // interpretable en una lista, así que no se busca ahí.
    const enBloques = filterTickets(filas(), { query: "ticket-event" });
    expect(enBloques).toHaveLength(0);
  });

  it("solo abiertos excluye los cerrados", () => {
    expect(filterTickets(filas(), { onlyOpen: true })).toHaveLength(0);
  });

  it("solo inválidos", () => {
    expect(filterTickets(filas(), { onlyInvalid: true })).toHaveLength(0);
    const ruta = join(lab, "tickets", "2026", UN_TICKET, "ticket.md");
    writeFileSync(ruta, "roto", "utf8");
    expect(filterTickets(listTickets(PATHS()), { onlyInvalid: true })).toHaveLength(1);
  });

  it("solo con impacto crítico", () => {
    // Es el filtro que hace útil la tarjeta «Impacto crítico» del resumen: sin él,
    // la tarjeta muestra un número que obliga a buscar sus tickets a mano.
    const todos = filas();
    const criticos = filterTickets(todos, { onlyCritical: true });
    expect(criticos.length).toBeGreaterThan(0);
    expect(criticos.every((f) => f.criticalImpacts.length > 0)).toBe(true);
    expect(criticos.length).toBeLessThan(todos.length);
  });

  it("solo con puntos abiertos", () => {
    const conPuntos = filterTickets(filas(), { onlyWithOpenPoints: true });
    expect(conPuntos.every((f) => f.openPoints > 0)).toBe(true);
  });

  it("los filtros de conjunto se combinan con los de campo", () => {
    const todos = filas();
    // `module` no puede ser el nombre de una variable en un módulo ES: TypeScript
    // la resuelve al objeto `Module` y el tipo deja de ser texto.
    const moduloBuscado = todos.find((f) => f.criticalImpacts.length > 0)?.module ?? "";
    const combinado = filterTickets(todos, {
      onlyCritical: true,
      module: moduloBuscado,
    });
    expect(
      combinado.every((f) => f.module === moduloBuscado && f.criticalImpacts.length > 0),
    ).toBe(true);
  });

  it("el endpoint acepta los dos filtros nuevos", async () => {
    // El filtro y su parámetro son dos sitios que tienen que decir lo mismo: un
    // filtro implementado y no expuesto es un filtro que la pantalla no puede usar.
    const criticos = await handleApi(
      "GET",
      "/api/tickets",
      {},
      { root: lab, credentialsFile: join(lab, ".valmen", ".credentials.yaml"), env: {} },
      new URLSearchParams("critical=1"),
    );
    const cuerpo = criticos.body as { tickets: { criticalImpacts: string[] }[] };
    expect(cuerpo.tickets.length).toBeGreaterThan(0);
    expect(cuerpo.tickets.every((t) => t.criticalImpacts.length > 0)).toBe(true);

    const conPuntos = await handleApi(
      "GET",
      "/api/tickets",
      {},
      { root: lab, credentialsFile: join(lab, ".valmen", ".credentials.yaml"), env: {} },
      new URLSearchParams("con-puntos=1"),
    );
    const otro = conPuntos.body as { tickets: { openPoints: number }[] };
    expect(otro.tickets.every((t) => t.openPoints > 0)).toBe(true);
  });

  it("filtra por rango de fechas sobre la última edición", () => {
    const todos = filas();
    const fechas = todos.map((f) => f.updated).sort();
    const primera = fechas[0] as string;
    const ultima = fechas[fechas.length - 1] as string;

    // El rango incluye los dos extremos: es lo que se espera de «del 1 al 7», que
    // el 7 entre.
    const enRango = filterTickets(todos, { desde: primera, hasta: ultima });
    expect(enRango).toHaveLength(todos.length);

    const unDia = filterTickets(todos, { desde: primera, hasta: primera });
    expect(unDia.length).toBeGreaterThan(0);
    expect(unDia.every((f) => f.updated === primera)).toBe(true);
  });

  it("filtra por fecha de cierre, y deja fuera los que no están cerrados", () => {
    // La diferencia que justifica el campo: un ticket cerrado el lunes y editado
    // el jueves aparece en el rango del jueves por `updated` y en el del lunes por
    // `closedOn`. Ninguno de los dos es «el correcto» sin saber qué se cuenta, y
    // el reporte de cierres cuenta cierres.
    const todos = filas();
    const cerrados = filterTickets(todos, {
      desde: "2000-01-01",
      hasta: "2100-01-01",
      dateField: "closedOn",
    });

    expect(cerrados.length).toBeGreaterThan(0);
    expect(cerrados.every((f) => f.closedOn !== null)).toBe(true);
    expect(cerrados.every((f) => f.workflowStatus === "closed")).toBe(true);

    // Un ticket abierto no tiene fecha de cierre, así que no cae en ningún rango de
    // cierres. Los 57 del fixture están cerrados, así que hay que añadir uno abierto
    // para probarlo: sin este caso, tratar el `null` como cadena vacía —que lo
    // colaría en **todos** los rangos— pasaría inadvertido.
    writeFixtureTicket(lab, { id: ABIERTO, workflowStatus: "planned" });
    const conAbierto = filterTickets(listTickets(PATHS()), {
      desde: "2000-01-01",
      hasta: "2100-01-01",
      dateField: "closedOn",
    });
    expect(conAbierto.some((f) => f.id === ABIERTO)).toBe(false);
    expect(conAbierto.every((f) => f.closedOn !== null)).toBe(true);
  });

  it("el endpoint acepta el rango y el campo de fecha", async () => {
    const r = await handleApi(
      "GET",
      "/api/tickets",
      {},
      { root: lab, credentialsFile: join(lab, ".valmen", ".credentials.yaml"), env: {} },
      new URLSearchParams("desde=2000-01-01&hasta=2100-01-01&fecha=closedOn"),
    );
    const cuerpo = r.body as { tickets: { closedOn: string | null }[] };
    expect(cuerpo.tickets.length).toBeGreaterThan(0);
    expect(cuerpo.tickets.every((t) => t.closedOn !== null)).toBe(true);
  });

  it("un campo de fecha inventado no rompe: se usa el de por defecto", async () => {
    // Ignorarlo en silencio es lo correcto aquí: el filtro cae a `updated`, que es
    // el comportamiento documentado, en vez de fallar la petición entera por un
    // parámetro de más.
    const r = await handleApi(
      "GET",
      "/api/tickets",
      {},
      { root: lab, credentialsFile: join(lab, ".valmen", ".credentials.yaml"), env: {} },
      new URLSearchParams("desde=2000-01-01&fecha=inventado"),
    );
    expect(r.status).toBe(200);
  });

  it("respeta el límite", () => {
    expect(filterTickets(filas(), { limit: 5 })).toHaveLength(5);
  });

  it("combina filtros", () => {
    const resultado = filterTickets(filas(), { type: "SYNC", module: "OFFLINESYNC" });
    expect(
      resultado.every((fila) => fila.type === "SYNC" && fila.module === "OFFLINESYNC"),
    ).toBe(true);
  });
});

// ── La API ──────────────────────────────────────────────────────────────────

describe("endpoints de tickets", () => {
  const contexto = (): {
    root: string;
    credentialsFile: string;
    env: NodeJS.ProcessEnv;
  } => ({
    root: lab,
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  });

  it("GET /api/tickets devuelve el resumen y la lista", async () => {
    const r = await handleApi("GET", "/api/tickets", {}, contexto());
    expect(r.status).toBe(200);
    const cuerpo = r.body as { summary: { total: number }; tickets: unknown[] };
    expect(cuerpo.summary.total).toBe(57);
    expect(cuerpo.tickets).toHaveLength(57);
  });

  it("acepta los filtros por query string", async () => {
    const r = await handleApi(
      "GET",
      "/api/tickets",
      {},
      contexto(),
      new URLSearchParams({ type: "SYNC", limit: "3" }),
    );
    const cuerpo = r.body as { tickets: { type: string }[] };
    expect(cuerpo.tickets).toHaveLength(3);
    expect(cuerpo.tickets.every((t) => t.type === "SYNC")).toBe(true);
  });

  it("GET /api/tickets/:id devuelve el detalle", async () => {
    const r = await handleApi("GET", `/api/tickets/${UN_TICKET}`, {}, contexto());
    expect(r.status).toBe(200);
    expect((r.body as { id: string }).id).toBe(UN_TICKET);
  });

  it("un ticket inexistente devuelve 404 con el identificador", async () => {
    const r = await handleApi(
      "GET",
      "/api/tickets/BUGFIX-POS-NO-EXISTE-20260101",
      {},
      contexto(),
    );
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toContain("NO-EXISTE");
  });

  it("un registro vacío no es un error", async () => {
    const vacio = mkdtempSync(join(tmpdir(), "valmen-vacio-"));
    mkdirSync(join(vacio, "tickets"), { recursive: true });
    try {
      const r = await handleApi(
        "GET",
        "/api/tickets",
        {},
        {
          root: vacio,
          credentialsFile: join(vacio, ".valmen", ".credentials.yaml"),
          env: {},
        },
      );
      expect(r.status).toBe(200);
      expect((r.body as { summary: { total: number } }).summary.total).toBe(0);
    } finally {
      rmSync(vacio, { recursive: true, force: true });
    }
  });

  it("un registro inexistente tampoco es un error del servidor", async () => {
    // Un proyecto sin tickets todavía es un caso normal, no un fallo.
    const sinRegistro = mkdtempSync(join(tmpdir(), "valmen-sin-"));
    try {
      const r = await handleApi(
        "GET",
        "/api/tickets",
        {},
        {
          root: sinRegistro,
          credentialsFile: join(sinRegistro, ".valmen", ".credentials.yaml"),
          env: {},
        },
      );
      expect(r.status).toBe(200);
      expect((r.body as { tickets: unknown[] }).tickets).toHaveLength(0);
    } finally {
      rmSync(sinRegistro, { recursive: true, force: true });
    }
  });
});

// ── El visor anterior ───────────────────────────────────────────────────────

describe("lo que el visor anterior ofrecía sigue disponible", () => {
  it("los campos funcionales del cierre se conservan en el detalle", () => {
    // El visor anterior mostraba problema, solución y relevancia para el
    // usuario, tomados del cierre. Mission Control los expone en crudo.
    const detalle = readTicket(PATHS(), UN_TICKET);
    expect(detalle?.closures.length).toBeGreaterThan(0);
    const cierre = detalle?.closures.at(-1) as Record<string, unknown>;
    expect(typeof cierre["functional_summary"]).toBe("string");
    expect(typeof cierre["technical_summary"]).toBe("string");
    expect(typeof cierre["release_impact"]).toBe("string");
  });

  it("la lista cubre todo el ciclo, no solo los cerrados", () => {
    // Es la diferencia con el visor anterior: durante el trabajo importa qué
    // está en curso y qué espera una decisión.
    const resumen = summarize(listTickets(PATHS()));
    const todosLosEstados = Object.keys(resumen.byWorkflow);
    expect(todosLosEstados.length).toBeGreaterThan(0);
    // El resumen informa cada estado presente, no solo `closed`.
    expect(todosLosEstados).toContain("closed");
  });
});
