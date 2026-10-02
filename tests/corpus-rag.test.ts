/** El corpus se publica desde fuentes reales de un laboratorio temporal, sin red. */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COLECCIONES,
  choosePaths,
  construirCorpus,
  publicarCorpus,
  type LoteCorpus,
} from "@valmen/engine";
import { dispatch, parseArgs, USAGE } from "../packages/cli/src/main.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const MANUAL = "docs/manuales/usuario-final/pos/ordenes.md";
const CERRADO = "FEATURE-ENGINE-CERRADO-20260926";
const ABIERTO = "FEATURE-ENGINE-ABIERTO-20260926";
let lab: string;

function escribir(ruta: string, texto: string): void {
  const absoluta = join(lab, ruta);
  mkdirSync(dirname(absoluta), { recursive: true });
  writeFileSync(absoluta, texto, "utf8");
}

function ticket(id: string, cerrado: boolean, conFecha = true): void {
  let texto = renderFixtureTicket({
    id,
    workflowStatus: cerrado ? "closed" : "in_progress",
    title: "Órdenes",
    qaStatus: cerrado ? "approved" : "pending",
  });
  if (cerrado && conFecha) {
    texto = texto.replace(
      "## Cierre\n\n```json\n[]\n```",
      '## Cierre\n\n```json\n[{"date":"2026-09-26"}]\n```',
    );
  }
  escribir(`tickets/2026/${id}/ticket.md`, texto);
}

function correr(...args: string[]) {
  return dispatch(parseArgs(["--root", lab, "corpus", ...args]));
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-corpus-"));
  escribir(
    MANUAL,
    "# Órdenes\n\n**Última actualización:** 2026-09-25\n\nLa pantalla lista las órdenes.\n",
  );
  escribir(".valmen/config.yaml", "memory-sources: [docs/decisions.md]\n");
  escribir(
    "docs/decisions.md",
    "# Decisiones\n\n## ADR-001: Índice sustituible\n\n- **Fecha:** 2026-09-24\n\nLa base vectorial es un plugin.\n",
  );
  ticket(CERRADO, true);
  ticket(ABIERTO, false);
});

afterEach(() => rmSync(lab, { recursive: true, force: true }));

describe("corpus: fuentes y publicación incremental", () => {
  it("publica las tres colecciones con origen, fecha, título y SHA-256 del texto íntegro", () => {
    const resultado = publicarCorpus(choosePaths(lab));
    expect(resultado.documentos).toHaveLength(3);
    expect(resultado.documentos.map((doc) => doc.coleccion)).toEqual(COLECCIONES);
    expect(resultado.documentos[0]).toMatchObject({
      origen: MANUAL,
      fecha: "2026-09-25",
      titulo: "Órdenes",
      texto: readFileSync(join(lab, MANUAL), "utf8"),
    });
    expect(resultado.documentos[1]).toMatchObject({
      origen: "docs/decisions.md:3",
      fecha: "2026-09-24",
      titulo: "Índice sustituible",
    });
    expect(resultado.documentos[1]?.texto).toContain("La base vectorial es un plugin.");
    expect(resultado.documentos[2]).toMatchObject({
      origen: `tickets/2026/${CERRADO}/ticket.md`,
      fecha: "2026-09-26",
      titulo: "Órdenes",
      texto: readFileSync(join(lab, `tickets/2026/${CERRADO}/ticket.md`), "utf8"),
    });
    for (const doc of resultado.documentos) {
      expect(doc.hash).toBe(createHash("sha256").update(doc.texto).digest("hex"));
      expect(
        JSON.parse(
          readFileSync(join(resultado.corpusDir, `${doc.coleccion}.jsonl`), "utf8"),
        ),
      ).toEqual(doc);
    }
  });

  it("no incluye ningún ticket abierto", () => {
    const documentos = construirCorpus(choosePaths(lab));
    expect(
      documentos.filter((doc) => doc.coleccion === "tickets").map((doc) => doc.id),
    ).toEqual([`tickets:${CERRADO}`]);
    expect(documentos.some((doc) => doc.origen.includes(ABIERTO))).toBe(false);
    expect(existsSync(join(lab, ".valmen/corpus"))).toBe(false);
  });

  it("la segunda pasada entrega un lote vacío y no agrega líneas", () => {
    const primera = publicarCorpus(choosePaths(lab));
    const antes = COLECCIONES.map((c) =>
      readFileSync(join(primera.corpusDir, `${c}.jsonl`), "utf8"),
    );
    const segunda = publicarCorpus(choosePaths(lab));
    expect(segunda.documentos).toEqual([]);
    expect(segunda.eliminados).toEqual([]);
    expect(segunda.sinCambios).toBe(3);
    expect(
      COLECCIONES.map((c) => readFileSync(join(primera.corpusDir, `${c}.jsonl`), "utf8")),
    ).toEqual(antes);
  });

  it("editar un manual publica solo ese documento y conserva la versión previa", () => {
    const primera = publicarCorpus(choosePaths(lab));
    escribir(MANUAL, readFileSync(join(lab, MANUAL), "utf8") + "El botón guarda.\n");
    const segunda = publicarCorpus(choosePaths(lab));
    expect(segunda.documentos).toHaveLength(1);
    expect(segunda.documentos[0]?.id).toBe(primera.documentos[0]?.id);
    expect(segunda.documentos[0]?.hash).not.toBe(primera.documentos[0]?.hash);
    const lineas = readFileSync(join(segunda.corpusDir, "manuales.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((linea) => JSON.parse(linea));
    expect(lineas).toEqual([primera.documentos[0], segunda.documentos[0]]);
  });

  it("un doble recibe exactamente el delta sin escribir colecciones JSONL", () => {
    const recibidos: LoteCorpus[] = [];
    const indexador = (lote: LoteCorpus) => {
      recibidos.push(lote);
    };
    const primera = publicarCorpus(choosePaths(lab), { indexador });
    publicarCorpus(choosePaths(lab), { indexador });
    expect(recibidos).toEqual([
      { documentos: primera.documentos, eliminados: [] },
      { documentos: [], eliminados: [] },
    ]);
    expect(existsSync(join(primera.corpusDir, "estado.json"))).toBe(true);
    for (const c of COLECCIONES)
      expect(existsSync(join(primera.corpusDir, `${c}.jsonl`))).toBe(false);
  });

  it("no inventa fechas ausentes y usa updated si el ticket no declara cierre", () => {
    escribir(MANUAL, "# Sin fecha\n\nTexto.\n");
    escribir("docs/decisions.md", "## ADR-001: Sin fecha\n\nDecisión.\n");
    ticket(CERRADO, true, false);
    expect(construirCorpus(choosePaths(lab)).map((doc) => doc.fecha)).toEqual([
      "",
      "",
      "2026-09-21",
    ]);
  });

  it("declara las bajas una sola vez y las anexa sin borrar documentos", () => {
    const primera = publicarCorpus(choosePaths(lab));
    rmSync(join(lab, MANUAL));
    const segunda = publicarCorpus(choosePaths(lab));
    expect(segunda.documentos).toEqual([]);
    expect(segunda.eliminados).toEqual([
      { coleccion: "manuales", id: primera.documentos[0]?.id },
    ]);
    expect(readFileSync(join(segunda.corpusDir, "manuales.jsonl"), "utf8")).toContain(
      '"eliminado":true',
    );
    expect(publicarCorpus(choosePaths(lab)).eliminados).toEqual([]);
  });

  it("completo republica todo y borrar estado reconstruye la publicación", () => {
    const primera = publicarCorpus(choosePaths(lab));
    expect(publicarCorpus(choosePaths(lab), { completo: true }).documentos).toEqual(
      primera.documentos,
    );
    rmSync(join(primera.corpusDir, "estado.json"));
    expect(publicarCorpus(choosePaths(lab)).documentos).toEqual(primera.documentos);
  });

  it("un indexador fallido no confirma el estado y permite reintentar el delta", () => {
    const primera = publicarCorpus(choosePaths(lab));
    const estado = readFileSync(join(primera.corpusDir, "estado.json"), "utf8");
    escribir(MANUAL, "# Cambio\n");
    expect(() =>
      publicarCorpus(choosePaths(lab), {
        indexador: () => {
          throw new Error("Destino no disponible");
        },
      }),
    ).toThrow("Destino no disponible");
    expect(readFileSync(join(primera.corpusDir, "estado.json"), "utf8")).toBe(estado);
    expect(publicarCorpus(choosePaths(lab)).documentos).toHaveLength(1);
  });

  it("lee también la memoria propia del harness", () => {
    escribir(
      ".valmen/memory/aprendizajes.md",
      "### [AP-001] Aprendizaje\n\n- **Fecha:** 2026-09-27\n\nUna lección.\n",
    );
    expect(construirCorpus(choosePaths(lab))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coleccion: "memoria",
          origen: ".valmen/memory/aprendizajes.md:1",
          fecha: "2026-09-27",
        }),
      ]),
    );
  });

  it("el módulo importa solo node: y vecinos del paquete", () => {
    const fuente = readFileSync(
      join(process.cwd(), "packages/engine/src/corpus.ts"),
      "utf8",
    );
    const imports = [...fuente.matchAll(/^import\b[\s\S]*?from\s+["']([^"']+)["'];/gm)].map(
      (m) => m[1]!,
    );
    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.every(
        (ruta) =>
          ruta.startsWith("node:") ||
          /^\.\/(discovery|memory|manuales|tickets)\.js$/.test(ruta),
      ),
    ).toBe(true);
  });
});

describe("corpus publicar desde el CLI", () => {
  it("cablea ayuda, banderas con valor y publicación completa en directorios alternativos", () => {
    escribir("guias/otra.md", "# Otra\n");
    const args = [
      "publicar",
      "--corpus-dir",
      "salida",
      "--manuales-dir",
      "guias",
      "--indexador",
      "archivos",
    ];
    expect(USAGE).toContain("corpus publicar");
    expect(correr(...args).exitCode).toBe(0);
    expect(readFileSync(join(lab, "salida/manuales.jsonl"), "utf8")).toContain(
      "guias/otra.md",
    );
    expect(correr(...args).stdout).toContain("3 sin cambios");
    expect(correr(...args, "--completo").stdout).toContain("0 sin cambios");
    expect(existsSync(join(lab, ".valmen/corpus"))).toBe(false);
  });

  it("rechaza indexadores desconocidos nombrando los válidos, sin publicar", () => {
    for (const nombre of ["inexistente", "toString"]) {
      const resultado = correr("publicar", "--indexador", nombre);
      expect(resultado.exitCode).not.toBe(0);
      expect(resultado.stderr).toContain("Válidos: archivos");
    }
    expect(existsSync(join(lab, ".valmen/corpus"))).toBe(false);
  });

  it("respeta corpus-indexer de la configuración y la bandera tiene precedencia", () => {
    escribir(".valmen/config.yaml", "corpus-indexer: [inexistente]\n");
    expect(correr("publicar").stderr).toContain("Válidos: archivos");
    expect(correr("publicar", "--indexador", "archivos").exitCode).toBe(0);
  });

  it("explica la ausencia o el error de subcomando", () => {
    expect(correr().stderr).toContain("requiere un subcomando: publicar");
    expect(correr("otro").stderr).toContain("Use publicar");
  });
});
