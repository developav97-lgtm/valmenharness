/**
 * Adjuntos de una feature.
 *
 * Lo que se afirma acá es lo que hace que un diseño aprobado llegue a quien lo
 * implementa:
 *
 * 1. **La copia es exacta y verificable**: el sha256 del destino es el del origen.
 * 2. **El manifiesto solo recibe entradas**: un nombre repetido con otro contenido
 *    falla sin tocar lo que había.
 * 3. **Un enlace sin copia se avisa**, porque los agentes no lo pueden abrir.
 * 4. **Los tickets heredan las rutas** y una feature sin adjuntos se materializa
 *    igual que siempre.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import {
  attachFeatureAsset,
  externalLinkWarnings,
  listFeatureAssets,
} from "../packages/engine/src/feature-assets.js";
import { materializeFeature } from "../packages/engine/src/materialize.js";

let lab: string;
const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });
const FEATURE = join(".valmen", "features", "kardex");

const GRAFO = [
  "feature: kardex",
  "sprints:",
  "  - id: S1",
  "    goal: Pantalla del kardex",
  "    tickets:",
  "      - id: FEATURE-INVENTARIO-PANTALLA-20260924",
  "        title: Pantalla del kardex",
  "        depends_on: []",
  "coverage:",
  "  - requirement: R-INV-001",
  "    covered_by:",
  "      - FEATURE-INVENTARIO-PANTALLA-20260924",
  "gaps: []",
  "",
].join("\n");

function spec(extra = ""): string {
  return `### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento\n\nEl kardex lista entradas y salidas.\n${extra}\n`;
}

function escribirSpec(texto: string): void {
  writeFileSync(join(lab, FEATURE, "spec", "inventario", "spec.md"), texto, "utf8");
}

function ticketMaterializado(): string {
  materializeFeature(PATHS(), "kardex");
  return readFileSync(
    join(lab, "tickets", "2026", "FEATURE-INVENTARIO-PANTALLA-20260924", "ticket.md"),
    "utf8",
  );
}

/** Un archivo de origen con contenido binario, para que un truncado por texto se note. */
function origen(nombre: string, contenido: Buffer): string {
  const ruta = join(lab, "origen", nombre);
  mkdirSync(join(lab, "origen"), { recursive: true });
  writeFileSync(ruta, contenido);
  return ruta;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]);

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-assets-"));
  mkdirSync(join(lab, FEATURE, "spec", "inventario"), { recursive: true });
  writeFileSync(
    join(lab, FEATURE, "feature.md"),
    [
      "---",
      "schema_version: 2",
      "id: kardex",
      "title: Kardex de inventario",
      "state: decomposed",
      "created: 2026-09-24",
      "updated: 2026-09-24",
      "---",
      "",
      "# Kardex de inventario",
      "",
    ].join("\n"),
    "utf8",
  );
  escribirSpec(spec());
  writeFileSync(join(lab, FEATURE, "tickets.yaml"), GRAFO, "utf8");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("anexar un adjunto", () => {
  it("copia el archivo con el mismo sha256 que el original", () => {
    const { asset } = attachFeatureAsset({
      root: lab,
      slug: "kardex",
      source: origen("pantalla.png", PNG),
      description: "Captura aprobada de la pantalla",
    });
    const copiado = readFileSync(join(lab, FEATURE, "assets", "pantalla.png"));
    expect(copiado.equals(PNG)).toBe(true);
    expect(asset.sha256).toBe(createHash("sha256").update(PNG).digest("hex"));
    expect(asset.path).toBe("assets/pantalla.png");
    expect(asset.kind).toBe("imagen");
  });

  it("anota ruta, huella, tamaño, descripción y origen en el manifiesto", () => {
    attachFeatureAsset({
      root: lab,
      slug: "kardex",
      source: origen("proto.html", Buffer.from("<html></html>")),
      description: "Prototipo aprobado",
      originUrl: "https://claude.ai/artifact/abc",
      now: () => new Date("2026-10-06T10:00:00Z"),
    });
    const manifiesto = JSON.parse(
      readFileSync(join(lab, FEATURE, "assets", "manifest.json"), "utf8"),
    );
    expect(manifiesto.assets).toHaveLength(1);
    expect(manifiesto.assets[0]).toMatchObject({
      path: "assets/proto.html",
      bytes: 13,
      kind: "prototipo",
      description: "Prototipo aprobado",
      origin_url: "https://claude.ai/artifact/abc",
      added: "2026-10-06",
    });
  });

  it("solo agrega: repetir el mismo contenido no escribe nada y otro contenido falla", () => {
    const fuente = origen("pantalla.png", PNG);
    attachFeatureAsset({ root: lab, slug: "kardex", source: fuente, description: "d" });
    const otra = attachFeatureAsset({ root: lab, slug: "kardex", source: fuente, description: "d" });
    expect(otra.alreadyPresent).toBe(true);
    expect(listFeatureAssets(lab, "kardex")).toHaveLength(1);

    const distinto = origen("otro.png", Buffer.from([1, 2, 3]));
    expect(() =>
      attachFeatureAsset({
        root: lab,
        slug: "kardex",
        source: distinto,
        name: "pantalla.png",
        description: "d",
      }),
    ).toThrow(/otro contenido/);
    expect(readFileSync(join(lab, FEATURE, "assets", "pantalla.png")).equals(PNG)).toBe(true);
  });

  it("rechaza un enlace en lugar de un archivo y pide la copia local", () => {
    expect(() =>
      attachFeatureAsset({
        root: lab,
        slug: "kardex",
        source: "https://claude.ai/artifact/abc",
        description: "d",
      }),
    ).toThrow(/copia local/);
  });
});

describe("enlaces externos sin copia local", () => {
  it("avisa por cada enlace que ningún adjunto declara como origen", () => {
    escribirSpec(spec("Prototipo: https://claude.ai/artifact/abc\n"));
    const avisos = externalLinkWarnings(lab, "kardex");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("spec/inventario/spec.md");
    expect(avisos[0]).toContain("https://claude.ai/artifact/abc");
  });

  it("deja de avisar cuando un adjunto declara ese enlace como origen", () => {
    escribirSpec(spec("Prototipo: https://claude.ai/artifact/abc\n"));
    attachFeatureAsset({
      root: lab,
      slug: "kardex",
      source: origen("proto.html", Buffer.from("<html></html>")),
      description: "Prototipo",
      originUrl: "https://claude.ai/artifact/abc",
    });
    expect(externalLinkWarnings(lab, "kardex")).toEqual([]);
  });

  it("materialize lo informa sin bloquear", () => {
    escribirSpec(spec("Prototipo: https://claude.ai/artifact/abc\n"));
    const resultado = materializeFeature(PATHS(), "kardex");
    expect(resultado.created).toHaveLength(1);
    expect(resultado.warnings).toHaveLength(1);
  });
});

describe("referencias en los tickets materializados", () => {
  it("escribe las rutas de los adjuntos que citan los requisitos del ticket", () => {
    attachFeatureAsset({
      root: lab,
      slug: "kardex",
      source: origen("pantalla.png", PNG),
      description: "Captura del detalle",
    });
    attachFeatureAsset({
      root: lab,
      slug: "kardex",
      source: origen("otro.png", Buffer.from([9, 9])),
      description: "Captura que nadie cita",
    });
    escribirSpec(spec("Ver `assets/pantalla.png`.\n"));
    const ticket = ticketMaterializado();
    expect(ticket).toContain("### Referencias de diseño");
    expect(ticket).toContain(".valmen/features/kardex/assets/pantalla.png");
    expect(ticket).not.toContain("assets/otro.png");
  });

  it("si ningún requisito cita un adjunto, el ticket recibe todos", () => {
    attachFeatureAsset({
      root: lab,
      slug: "kardex",
      source: origen("pantalla.png", PNG),
      description: "Captura del detalle",
    });
    const ticket = ticketMaterializado();
    expect(ticket).toContain("### Referencias de diseño");
    expect(ticket).toContain(".valmen/features/kardex/assets/pantalla.png");
  });
});
