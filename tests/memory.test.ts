/**
 * La memoria del proyecto.
 *
 * Lo que se afirma acá es que el índice sirve sobre los documentos **reales** y no
 * sobre un formato ideal: los tres encabezados que conviven en ellos, las
 * secciones de plantilla que no hay que indexar, y —lo que decide si la función
 * sirve o no— que buscar con las palabras del dominio devuelva la entrada que
 * corresponde arriba de todo.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadMemory,
  memoryFiles,
  parseMemory,
  renderHits,
  saveLearning,
  searchMemory,
  tokenize,
} from "../packages/engine/src/memory.js";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un documento con los tres formatos que conviven en los archivos reales. */
const DOCUMENTO = `# Errors — Registro de Errores y Patrones

## Formato de Entrada

### [ID] Título breve del patrón

**Síntoma:** descripción del síntoma.

**Causa raíz:** la causa.

## Patrones Registrados

### [E001] \`bulk_create\` no dispara \`post_save\` → la cola de sync no se alimenta

**Síntoma:** los registros creados en masa no aparecen en \`SyncQueue\`.

**Causa raíz:** Django no dispara señales \`post_save\` en \`bulk_create\`.

**Fix:** registrar los objetos con \`register_bulk_sync()\`.

### [E002] La sesión se pierde al recargar en el POS

**Fecha:** 2026-09-01
**Estado:** Resuelto
**Síntoma:** el cajero vuelve a autenticarse cada vez que recarga la pantalla.

## Patrones Pendientes de Documentar

## E-010: Los filtros por fecha ignoran la zona horaria

**Síntoma:** una factura de las 21:00 aparece en el día siguiente.

## E031 — La impresión sale con el consecutivo anterior

**Síntoma:** el número impreso no coincide con el de la nube.
`;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-memoria-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Declara las fuentes de memoria del proyecto. */
function fuentes(archivos: readonly string[]): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    `name: Laboratorio\nmemory-sources:\n${archivos.map((a) => `  - ${a}`).join("\n")}\n`,
    "utf8",
  );
}

/** Escribe un documento en el proyecto. */
function documento(relativa: string, texto: string): void {
  const ruta = join(lab, relativa);
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, texto, "utf8");
}

describe("el análisis de los documentos", () => {
  it("reconoce los tres formatos de encabezado que conviven en los archivos reales", () => {
    // Se escribieron en momentos distintos, y un índice que solo entienda el
    // último deja afuera las dos terceras partes del conocimiento.
    const entradas = parseMemory(DOCUMENTO, "docs/errors.md");

    expect(entradas.map((entrada) => entrada.id)).toEqual([
      "E001",
      "E002",
      "E-010",
      "E031",
    ]);
    expect(entradas.map((entrada) => entrada.source.line)).toEqual([13, 21, 29, 33]);
  });

  it("no indexa la sección que explica el formato", () => {
    // Una plantilla indexada aparece en cada búsqueda y compite con las entradas
    // de verdad sin decir nada.
    const entradas = parseMemory(DOCUMENTO, "docs/errors.md");
    expect(entradas.some((entrada) => /título breve del patrón/i.test(entrada.title))).toBe(
      false,
    );
  });

  it("lee la fecha y el estado cuando están declarados", () => {
    const entradas = parseMemory(DOCUMENTO, "docs/errors.md");
    const segunda = entradas.find((entrada) => entrada.id === "E002");

    expect(segunda?.date).toBe("2026-09-01");
    expect(segunda?.status).toBe("Resuelto");
    // Y sin declararlos no los inventa.
    expect(entradas[0]?.date).toBeNull();
  });

  it("deduce de qué clase es cada entrada", () => {
    expect(parseMemory(DOCUMENTO, "docs/errors.md")[0]?.kind).toBe("error");
    expect(
      parseMemory(
        "### [ADR-041] Una decisión cualquiera\n\n**Fecha:** 2026-08-26\n",
        "docs/decisions.md",
      )[0]?.kind,
    ).toBe("decision");
  });

  it("un documento que es prosa no produce entradas inventadas", () => {
    // Hay documentos que no son un registro, y forzarlos a entradas produciría
    // fragmentos sin identificador que después nadie puede citar.
    const entradas = parseMemory(
      "# Notas\n\n## Lo que hicimos hoy\n\nProsa suelta.\n",
      "x.md",
    );
    expect(entradas).toEqual([]);
  });

  it("saca las palabras vacías y las tildes de los términos", () => {
    expect(tokenize("La configuración de la sesión")).toEqual(["configuracion", "sesion"]);
  });
});

describe("la búsqueda", () => {
  const memoria = () => parseMemory(DOCUMENTO, "docs/errors.md");

  it("devuelve arriba la entrada que corresponde a la consulta del dominio", () => {
    const hits = searchMemory(memoria(), "bulk_create no alimenta la cola de sync", 3);
    expect(hits[0]?.entry.id).toBe("E001");
    expect(hits[0]?.matched).toContain("bulk_create");
  });

  it("el identificador y el título pesan más que el cuerpo", () => {
    // Buscar por identificador tiene que encontrarlo, aunque el cuerpo no lo
    // repita: es la forma en que se cita una entrada.
    const hits = searchMemory(memoria(), "E031", 1);
    expect(hits[0]?.entry.id).toBe("E031");
  });

  it("no exige que aparezcan todas las palabras", () => {
    // Una consulta es una descripción, no un filtro: quien lee los candidatos
    // decide si sirven.
    const hits = searchMemory(memoria(), "impresión consecutivo nube zona horaria", 4);
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.map((hit) => hit.entry.id)).toContain("E031");
  });

  it("una entrada larga no gana por tamaño", () => {
    // Sin normalizar por longitud, la entrada más larga gana siempre: menciona
    // todos los términos una vez y suma más.
    const larga = `### [E100] Cualquier cosa\n\n${"relleno palabra ".repeat(400)}timeout\n`;
    const corta =
      "### [E101] El timeout del POS\n\n**Síntoma:** el POS corta a los 30 segundos.\n";

    const hits = searchMemory(parseMemory(`${larga}\n${corta}`, "x.md"), "timeout", 2);
    expect(hits[0]?.entry.id).toBe("E101");
  });

  it("sin resultados lo dice, en vez de devolver cualquier cosa", () => {
    const hits = searchMemory(memoria(), "kubernetes terraform", 5);
    expect(hits).toEqual([]);
    expect(renderHits(hits, "kubernetes terraform")).toContain("Sin resultados");
  });

  it("muestra el estado declarado, para que una decisión supersedida se vea", () => {
    // El documento gestiona su propia obsolescencia con `**Estado:**`, y quien lee
    // el resultado tiene que poder verlo sin abrir el archivo.
    const texto = renderHits(
      searchMemory(memoria(), "sesión se pierde al recargar", 1),
      "x",
    );
    expect(texto).toContain("Resuelto");
  });

  it("el informe ubica cada resultado en su archivo y su línea", () => {
    const texto = renderHits(searchMemory(memoria(), "bulk_create", 1), "bulk_create");
    // La línea del encabezado, que es lo que hay que abrir.
    expect(texto).toContain("docs/errors.md:13");
    expect(texto).toContain("[error]");
  });
});

describe("lo que el harness guarda", () => {
  it("un aprendizaje guardado se encuentra en la búsqueda siguiente", () => {
    // El viaje completo: lo que el harness escribe tiene que poder leerse con el
    // mismo índice que lee lo que escribieron las personas. Si no, guardar es una
    // escritura sin lectura.
    fuentes([]);
    saveLearning(PATHS(), {
      title: "El caché de permisos sobrevive al cambio de sucursal",
      body: "El guard de sucursal lee de `Users` en IndexedDB y no se invalida al cambiar de sucursal.",
      tickets: ["BUGFIX-POS-UNO-20260921"],
      now: () => new Date("2026-09-23T10:00:00Z"),
    });

    const memoria = loadMemory(PATHS());
    expect(memoria).toHaveLength(1);

    const hits = searchMemory(memoria, "caché de permisos sucursal", 1);
    expect(hits[0]?.entry.id).toBe("AP-001");
    expect(hits[0]?.entry.date).toBe("2026-09-23");
    expect(
      readFileSync(join(lab, ".valmen", "memory", "aprendizajes.md"), "utf8"),
    ).toContain("**Tickets:** BUGFIX-POS-UNO-20260921");
  });

  it("numera los aprendizajes sin pisar los anteriores", () => {
    fuentes([]);
    saveLearning(PATHS(), { title: "El primero", body: "Cuerpo uno." });
    const segundo = saveLearning(PATHS(), { title: "El segundo", body: "Cuerpo dos." });

    expect(segundo.id).toBe("AP-002");
    expect(loadMemory(PATHS()).map((entrada) => entrada.id)).toEqual(["AP-001", "AP-002"]);
  });

  it("el archivo propio se indexa aunque no esté declarado", () => {
    // Guardar sin declarar nada tiene que funcionar: lo que el harness escribe es
    // memoria por definición.
    saveLearning(PATHS(), { title: "Sin configurar nada", body: "Cuerpo." });
    expect(memoryFiles(lab)).toEqual([join(".valmen", "memory", "aprendizajes.md")]);
    expect(loadMemory(PATHS())).toHaveLength(1);
  });
});

describe("las fuentes", () => {
  it("lee los documentos donde están y no los mueve", () => {
    // Mover el conocimiento de un proyecto para poder consultarlo sería pedirle
    // que se adapte a la herramienta.
    documento("docs/errors.md", DOCUMENTO);
    documento("docs/decisions.md", "### [ADR-001] Una decisión\n\n**Fecha:** 2026-01-01\n");
    fuentes(["docs/decisions.md", "docs/errors.md"]);

    const antes = readFileSync(join(lab, "docs", "errors.md"), "utf8");
    const memoria = loadMemory(PATHS());
    expect(memoria).toHaveLength(5);
    expect(readFileSync(join(lab, "docs", "errors.md"), "utf8")).toBe(antes);
  });

  it("una fuente declarada que no existe no rompe la búsqueda", () => {
    documento("docs/errors.md", DOCUMENTO);
    fuentes(["docs/errors.md", "docs/no-existe.md"]);

    expect(loadMemory(PATHS())).toHaveLength(4);
  });

  it("sin fuentes declara vacío, en vez de fallar", () => {
    expect(memoryFiles(lab)).toEqual([]);
    expect(loadMemory(PATHS())).toEqual([]);
  });
});
