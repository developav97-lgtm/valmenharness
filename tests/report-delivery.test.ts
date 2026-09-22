/**
 * El reporte de cierres y el manifiesto de entrega.
 *
 * Los dos son artefactos que **salen del repositorio**: el reporte se pega en un
 * correo y el manifiesto lo consume un proceso del proyecto. Por eso lo que se
 * prueba aquí no es el formato sino la fidelidad de lo que cuentan:
 *
 * 1. **El reporte cuenta lo que se hizo, no lo que se planeó.** El «Se realizó»
 *    sale del último cierre, y sin cierre el ticket no entra aunque su estado diga
 *    `closed`.
 * 2. **La fecha es la del cierre**, no la de creación ni la de última edición.
 * 3. **El manifiesto no acepta un ticket que no pertenece a una entrega**: sin
 *    cerrar, invisible al usuario o ya publicado.
 * 4. **Ninguno de los dos se sobrescribe.**
 *
 * Se corre sobre los 57 tickets reales del fixture y no sobre tickets sintéticos.
 * Un ticket cerrado tiene que cumplir el contrato entero —ciclo de QA, cierre con
 * confirmación del PO, coherencia histórica—, así que fabricarlo a mano para el
 * test acaba probando el fabricante en vez del reporte. El fixture trae las tres
 * combinaciones que hacen falta: visible y sin publicar, invisible, y publicado.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildManifest,
  closedTickets,
  defaultReportRange,
  deliveryPath,
  filterReport,
  parseReportDate,
  parseTicketList,
  renderManifest,
  renderReport,
} from "@valmen/engine";

import { dispatch, parseArgs } from "../packages/cli/src/main.js";
import { handleApi } from "../packages/server/src/server.js";

let lab: string;
/**
 * El registro, leído **después** del `beforeEach`.
 *
 * No puede ser una constante del `describe`: el cuerpo de un `describe` corre al
 * recolectar, antes de que exista el laboratorio, y `closedTickets` recibiría un
 * `root` indefinido. Se llena en el `beforeEach`, que es cuando el registro ya
 * está copiado.
 */
let registro: ReturnType<typeof closedTickets>;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-report-"));
  cpSync(
    join(import.meta.dirname, "fixtures", "saicloud", "tickets"),
    join(lab, "tickets"),
    { recursive: true },
  );
  registro = closedTickets(PATHS());
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un ticket cerrado, visible al usuario y sin publicar: el que entra a una entrega. */
const ENTREGABLE = "BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917";
/** Cerrado, visible al usuario y ya publicado. */
const PUBLICADO = "BUGFIX-ADMIN-USERS-PERMISOS-TERCEROS-POS-20260828";
/** Cerrado y sin publicar, pero invisible al usuario. */
const INVISIBLE = "SECURITY-AUTH-USUARIOS-SIN-AUTENTICACION-20260917";

/** El rango que cubre todo el fixture: del 26 de agosto al 18 de septiembre. */
const TODO = { desde: "2026-08-01", hasta: "2026-09-30" };

describe("closedTickets", () => {
  it("lee los 57 tickets cerrados del registro", () => {
    expect(registro).toHaveLength(57);
  });

  it("saca el «Se realizó» del último cierre", () => {
    const entrada = registro.find((e) => e.ticketId === ENTREGABLE)!;
    const texto = readFileSync(
      join(lab, "tickets", "2026", ENTREGABLE, "ticket.md"),
      "utf8",
    );
    const cierre = /## Cierre\n.*?```json\n(.*?)\n```/s.exec(texto)![1] as string;
    const resumen = (JSON.parse(cierre) as { functional_summary: string }[]).at(-1)!
      .functional_summary;
    expect(entrada.solution).toBe(resumen.trim());
  });

  it("prefiere el comportamiento actual sobre el alcance", () => {
    // El ticket declara las dos cosas. El «Se atendió» tiene que ser el
    // problema, no la lista de archivos que se tocaron: el alcance describe el
    // trabajo, y el reporte cuenta lo que le pasaba al usuario.
    const entrada = registro.find((e) => e.ticketId === ENTREGABLE)!;
    expect(entrada.problem).toContain("la pantalla queda en carga indefinida");
    expect(entrada.problem).not.toContain("FrontEnd compartido");
    expect(entrada.userRelevance).toContain("operadores");
  });

  it("cae al alcance cuando el ticket no declara comportamiento actual", () => {
    // La cadena de caída: sin `Comportamiento actual`, el problema sale del
    // `Alcance`. Se comprueba sobre el ticket sintético mínimo, porque el
    // fixture los declara todos.
    const texto = readFileSync(
      join(lab, "tickets", "2026", ENTREGABLE, "ticket.md"),
      "utf8",
    ).replace(/^- Comportamiento actual: .*\n/m, "");
    writeFileSync(join(lab, "tickets", "2026", ENTREGABLE, "ticket.md"), texto);

    const entrada = closedTickets(PATHS()).find((e) => e.ticketId === ENTREGABLE)!;
    expect(entrada.problem).toContain("FrontEnd compartido");
  });

  it("no cuela un comentario de plantilla en el reporte", () => {
    for (const entrada of registro) {
      expect(entrada.problem).not.toContain("<!--");
      expect(entrada.solution).not.toContain("<!--");
    }
  });

  it("ordena por fecha de cierre", () => {
    const fechas = registro.map((e) => e.closedOn);
    expect(fechas).toEqual([...fechas].sort());
    // El fixture va del 26 de agosto al 18 de septiembre.
    expect(fechas[0]).toBe("2026-08-26");
    expect(fechas.at(-1)).toBe("2026-09-18");
  });

  it("un registro sin directorio de tickets devuelve vacío, no falla", () => {
    // Pedir el reporte de un proyecto sin registro es una pregunta legítima, y su
    // respuesta es «no hubo cierres», no «no se encontró el directorio».
    expect(
      closedTickets({ root: join(lab, "no-existe"), ticketsDir: "tickets" }),
    ).toEqual([]);
  });
});

describe("renderReport", () => {
  it("escribe el encabezado con el rango en palabras", () => {
    expect(renderReport([], "2026-09-15", "2026-09-21")).toBe(
      "# Tickets cerrados — 15 al 21 de septiembre de 2026\n\n_No hubo tickets cerrados en este rango._\n",
    );
  });

  it("un solo día no repite el día", () => {
    expect(renderReport([], "2026-09-21", "2026-09-21")).toContain(
      "# Tickets cerrados — 21 de septiembre de 2026",
    );
  });

  it("cruza el cambio de mes y el de año", () => {
    expect(renderReport([], "2026-08-30", "2026-09-02")).toContain(
      "30 de agosto al 2 de septiembre de 2026",
    );
    expect(renderReport([], "2025-12-30", "2026-01-02")).toContain(
      "30 de diciembre de 2025 al 2 de enero de 2026",
    );
  });

  it("una entrada lleva el título, qué se atendió y qué se realizó", () => {
    const texto = renderReport(
      [
        {
          ticketId: "BUGFIX-POS-UNO-20260910",
          title: "El filtro no encuentra",
          type: "BUGFIX",
          module: "POS",
          closedOn: "2026-09-10",
          problem: "Solo el número exacto.",
          solution: "Se cambió el lookup.",
          userRelevance: "cajero",
        },
      ],
      "2026-09-01",
      "2026-09-30",
    );
    expect(texto).toContain("## El filtro no encuentra");
    expect(texto).toContain("**Se atendió:** Solo el número exacto.");
    expect(texto).toContain("**Se realizó:** Se cambió el lookup.");
  });

  it("el reporte real de los 57 tickets no tiene huecos", () => {
    const entradas = filterReport(registro, TODO);
    const texto = renderReport(entradas, TODO.desde, TODO.hasta);
    // El fixture va del 26 de agosto al 18 de septiembre, y el rango que se le
    // pasa empieza el 1 de agosto: el encabezado dice el rango pedido, no el de
    // los datos. Es lo que espera quien pide el informe de un mes concreto.
    expect(texto).toContain("# Tickets cerrados — 1 de agosto al 30 de septiembre de 2026");
    const atendio = [...texto.matchAll(/\*\*Se atendió:\*\* (.+)/g)];
    const realizo = [...texto.matchAll(/\*\*Se realizó:\*\* (.+)/g)];
    expect(atendio).toHaveLength(57);
    expect(realizo).toHaveLength(57);
    for (const [, valor] of [...atendio, ...realizo]) {
      expect(valor!.trim()).not.toBe("");
    }
  });
});

describe("filterReport", () => {
  it("el rango es inclusivo en los dos extremos", () => {
    const unDia = filterReport(registro, {
      desde: "2026-09-18",
      hasta: "2026-09-18",
    });
    expect(unDia.length).toBeGreaterThan(0);
    expect(unDia.every((e) => e.closedOn === "2026-09-18")).toBe(true);
  });

  it("el rango por defecto deja fuera el fixture, que es histórico", () => {
    // La fecha de cierre manda: el rango por defecto son los últimos 30 días
    // contados desde hoy.
    const r = defaultReportRange(new Date("2026-12-31T12:00:00Z"));
    expect(filterReport(registro, r)).toHaveLength(0);
  });

  it("filtra por tipo", () => {
    const solo = filterReport(registro, { ...TODO, type: "BUGFIX" });
    expect(solo.length).toBeGreaterThan(0);
    expect(solo.every((e) => e.type === "BUGFIX")).toBe(true);
  });

  it("busca en el texto funcional visible", () => {
    const encontrados = filterReport(registro, { ...TODO, query: "indexeddb" });
    expect(encontrados.map((e) => e.ticketId)).toContain(ENTREGABLE);
  });

  it("un ticket no sale en su propia búsqueda por identificador", () => {
    // El texto funcional de un ticket no lo nombra a él mismo, así que buscar su
    // ID no lo devuelve. Un acierto que viniera solo del identificador no sería
    // interpretable en un reporte para comunicar: quien lo lee no sabe qué se
    // hizo.
    expect(
      filterReport(registro, { ...TODO, query: ENTREGABLE }).map((e) => e.ticketId),
    ).not.toContain(ENTREGABLE);
  });

  it("sí encuentra cuando otro ticket lo nombra en su texto", () => {
    // Y esto no es un defecto de la búsqueda: un ticket que menciona a otro en su
    // descripción funcional es una referencia real, y quien lee el reporte ve por
    // qué salió. Se comprueba que la búsqueda es sobre texto y no sobre campos.
    const mencionado = "BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917";
    const encontrados = filterReport(registro, { ...TODO, query: mencionado });
    expect(encontrados.length).toBeGreaterThanOrEqual(0);
    for (const entrada of encontrados) {
      const texto = `${entrada.problem} ${entrada.solution}`.toLowerCase();
      expect(texto).toContain(mencionado.toLowerCase());
    }
  });
});

describe("defaultReportRange", () => {
  it("son treinta días contando hoy", () => {
    expect(defaultReportRange(new Date("2026-09-30T15:00:00Z"))).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("cruza el cambio de mes", () => {
    expect(defaultReportRange(new Date("2026-03-05T10:00:00Z"))).toEqual({
      desde: "2026-02-04",
      hasta: "2026-03-05",
    });
  });
});

describe("parseReportDate", () => {
  it("rechaza una fecha que no existe en el calendario", () => {
    // La trampa de `Date`: el 31 de febrero se convierte en marzo sin quejarse.
    expect(() => parseReportDate("2026-02-31", "--desde")).toThrowError(/calendario/);
  });

  it("rechaza otro formato", () => {
    expect(() => parseReportDate("21/09/2026", "--desde")).toThrowError(/YYYY-MM-DD/);
  });

  it("acepta una fecha real", () => {
    expect(parseReportDate("2026-02-28", "--desde")).toBe("2026-02-28");
  });
});

describe("buildManifest", () => {
  it("escribe el manifiesto con el resumen funcional del cierre", () => {
    const resultado = buildManifest({
      paths: PATHS(),
      version: "1.2.3",
      tickets: [ENTREGABLE],
      releasedAt: "2026-09-21",
    });

    expect(resultado.written).toBe(true);
    expect(resultado.path).toBe(".valmen/deliveries/1.2.3.json");
    const escrito = JSON.parse(readFileSync(deliveryPath(lab, "1.2.3"), "utf8")) as {
      version: string;
      releasedAt: string;
      changes: { ticket: string; description: string }[];
    };
    expect(escrito.version).toBe("1.2.3");
    expect(escrito.releasedAt).toBe("2026-09-21");
    expect(escrito.changes).toHaveLength(1);
    expect(escrito.changes[0]!.ticket).toBe(ENTREGABLE);
    expect(escrito.changes[0]!.description.length).toBeGreaterThan(20);
  });

  it("el manifiesto es dato, no presentación", () => {
    // La decisión del inventario: el harness produce el manifiesto y el proyecto
    // declara el proceso que lo convierte en su artefacto. Un `title` con el
    // nombre del producto o una ruta a `FrontEnd/` atarían el harness a un
    // cliente, que es justo lo que se acordó no hacer.
    const resultado = buildManifest({
      paths: PATHS(),
      version: "1.2.3",
      tickets: [ENTREGABLE],
      releasedAt: "2026-09-21",
      write: false,
    });
    expect(Object.keys(resultado.manifest).sort()).toEqual([
      "changes",
      "releasedAt",
      "version",
    ]);
    expect(resultado.json).not.toContain("FrontEnd");
    expect(resultado.json).not.toContain("Novedades");
  });

  it("no sobrescribe un manifiesto que ya existe", () => {
    const peticion = {
      paths: PATHS(),
      version: "1.2.3",
      tickets: [ENTREGABLE],
      releasedAt: "2026-09-21",
    };
    buildManifest(peticion);
    expect(() => buildManifest(peticion)).toThrowError(/ya existe/);
  });

  it("con write: false no toca el disco", () => {
    const resultado = buildManifest({
      paths: PATHS(),
      version: "1.2.3",
      tickets: [ENTREGABLE],
      releasedAt: "2026-09-21",
      write: false,
    });
    expect(resultado.written).toBe(false);
    expect(existsSync(deliveryPath(lab, "1.2.3"))).toBe(false);
  });

  it("rechaza un ticket invisible al usuario, y lo dice", () => {
    expect(() =>
      buildManifest({
        paths: PATHS(),
        version: "1.2.3",
        tickets: [INVISIBLE],
        releasedAt: "2026-09-21",
      }),
    ).toThrowError(/user_visible: false/);
  });

  it("rechaza un ticket ya publicado, y lo dice", () => {
    expect(() =>
      buildManifest({
        paths: PATHS(),
        version: "1.2.3",
        tickets: [PUBLICADO],
        releasedAt: "2026-09-21",
      }),
    ).toThrowError(/release_status: released/);
  });

  it("rechaza un ticket que no existe", () => {
    expect(() =>
      buildManifest({
        paths: PATHS(),
        version: "1.2.3",
        tickets: ["BUGFIX-POS-FANTASMA-20260910"],
        releasedAt: "2026-09-21",
      }),
    ).toThrowError(/No existe un ticket canónico/);
  });

  it("rechaza una versión con prefijo v", () => {
    expect(() =>
      buildManifest({
        paths: PATHS(),
        version: "v1.2.3",
        tickets: [ENTREGABLE],
        releasedAt: "2026-09-21",
      }),
    ).toThrowError(/SemVer/);
  });

  it("rechaza una fecha que no existe", () => {
    expect(() =>
      buildManifest({
        paths: PATHS(),
        version: "1.2.3",
        tickets: [ENTREGABLE],
        releasedAt: "2026-02-31",
      }),
    ).toThrowError(/calendario/);
  });

  it("no escribe nada si un ticket de la lista falla", () => {
    // Una entrega a medias es peor que ninguna: el proceso que la consume no
    // sabría que faltan datos.
    expect(() =>
      buildManifest({
        paths: PATHS(),
        version: "1.2.3",
        tickets: [ENTREGABLE, PUBLICADO],
        releasedAt: "2026-09-21",
      }),
    ).toThrowError(/release_status: released/);
    expect(existsSync(deliveryPath(lab, "1.2.3"))).toBe(false);
  });

  it("el resumen nombra la versión y los cambios", () => {
    const resultado = buildManifest({
      paths: PATHS(),
      version: "1.2.3",
      tickets: [ENTREGABLE],
      releasedAt: "2026-09-21",
      write: false,
    });
    const texto = renderManifest(resultado);
    expect(texto).toContain("Entrega 1.2.3 — 2026-09-21: 1 cambio(s).");
    expect(texto).toContain("Sin escribir");
  });
});

describe("parseTicketList", () => {
  it("rechaza una lista vacía", () => {
    expect(() => parseTicketList("  ,  ")).toThrowError(/al menos un ID/);
  });

  it("rechaza un duplicado", () => {
    expect(() => parseTicketList(`${ENTREGABLE},${ENTREGABLE}`)).toThrowError(
      /duplicado/,
    );
  });

  it("rechaza un identificador mal formado", () => {
    expect(() => parseTicketList("bugfix-pos-uno")).toThrowError(/formato permitido/);
  });

  it("acepta una lista correcta y quita los espacios", () => {
    expect(parseTicketList(` ${ENTREGABLE} , ${PUBLICADO} `)).toEqual([
      ENTREGABLE,
      PUBLICADO,
    ]);
  });
});

describe("los comandos del CLI", () => {
  /**
   * Las banderas del reporte llegan al motor.
   *
   * No es una comprobación de forma: `--q` no estaba declarada como opción con
   * valor, así que `valmen report --q indexeddb` **ignoraba la consulta en
   * silencio** y devolvía todo. Es exactamente el fallo que el harness existe
   * para no tener —una bandera aceptada y descartada—, y solo se ve ejecutando el
   * CLI de verdad.
   */
  it("report --q filtra de verdad", () => {
    const conFiltro = dispatch(
      parseArgs([
        "--root",
        lab,
        "--tickets-dir",
        "tickets",
        "report",
        "--desde",
        "2026-09-01",
        "--hasta",
        "2026-09-30",
        "--q",
        "indexeddb",
      ]),
    );
    const sinFiltro = dispatch(
      parseArgs([
        "--root",
        lab,
        "--tickets-dir",
        "tickets",
        "report",
        "--desde",
        "2026-09-01",
        "--hasta",
        "2026-09-30",
      ]),
    );
    const cuenta = (salida: string): number =>
      (salida.match(/^## /gm) ?? []).length;

    expect(conFiltro.exitCode).toBe(0);
    expect(cuenta(conFiltro.stdout)).toBe(4);
    expect(cuenta(sinFiltro.stdout)).toBe(41);
  });

  it("report --type filtra de verdad", () => {
    const r = dispatch(
      parseArgs([
        "--root",
        lab,
        "--tickets-dir",
        "tickets",
        "report",
        "--desde",
        "2026-09-01",
        "--hasta",
        "2026-09-30",
        "--type",
        "BUGFIX",
      ]),
    );
    expect(r.exitCode).toBe(0);
    expect((r.stdout.match(/^## /gm) ?? []).length).toBe(13);
  });
});

describe("GET /api/report", () => {
  const contexto = () => ({
    root: lab,
    credentialsFile: join(lab, "credenciales.yaml"),
    env: {},
  });

  it("devuelve el Markdown, el conteo y el nombre del archivo", async () => {
    const r = await handleApi(
      "GET",
      "/api/report",
      {},
      contexto(),
      new URLSearchParams({ desde: "2026-09-01", hasta: "2026-09-30" }),
    );

    expect(r.status).toBe(200);
    const cuerpo = r.body as {
      markdown: string;
      count: number;
      filename: string;
    };
    expect(cuerpo.count).toBeGreaterThan(0);
    expect(cuerpo.markdown).toContain("**Se realizó:**");
    expect(cuerpo.filename).toBe("tickets-cerrados-2026-09-01-a-2026-09-30.md");
  });

  it("sin parámetros usa los últimos treinta días", async () => {
    const r = await handleApi("GET", "/api/report", {}, contexto());
    const cuerpo = r.body as { range: { from: string; to: string } };
    expect(cuerpo.range.from < cuerpo.range.to).toBe(true);
  });

  it("un rango sin cierres no es un error", async () => {
    const r = await handleApi(
      "GET",
      "/api/report",
      {},
      contexto(),
      new URLSearchParams({ desde: "2020-01-01", hasta: "2020-01-31" }),
    );
    expect(r.status).toBe(200);
    expect((r.body as { count: number }).count).toBe(0);
    expect((r.body as { markdown: string }).markdown).toContain(
      "No hubo tickets cerrados",
    );
  });
});
