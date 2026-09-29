/**
 * La auditoría de manuales contra el código, con citas.
 *
 * Lo que se prueba aquí no es que los `.md` se lean, sino el contraste que hoy no
 * existe en ninguna pieza: qué afirma el manual y si la línea que cita la
 * respalda. El laboratorio es temporal —`mkdtemp` y se borra en `afterEach`— y
 * nunca toca el registro vivo ni `.valmen/receipts/` del repositorio.
 *
 * Cada `it` cubre un criterio de aceptación del ticket que declara este archivo.
 */
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

import { auditarManuales, choosePaths } from "@valmen/engine";

import { USAGE, dispatch, parseArgs } from "../packages/cli/src/main.js";

const FUENTE = "FrontEnd/src/app/pos/ordenes.component.ts";
const MANUAL = "docs/manuales/usuario-final/ordenes.md";
const SIN_CITA = "docs/manuales/usuario-final/sin-cita.md";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-auditar-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Escribe un archivo del laboratorio, creando los directorios que falten. */
function escribir(ruta: string, contenido: string): void {
  const absoluta = join(lab, ...ruta.split("/"));
  mkdirSync(dirname(absoluta), { recursive: true });
  writeFileSync(absoluta, contenido, "utf8");
}

/** Una fuente con las líneas dadas, 1-based. */
function escribirFuente(lineas: readonly string[], ruta = FUENTE): void {
  escribir(ruta, lineas.join("\n") + "\n");
}

/** Corre el comando como lo haría el CLI, sin salir del laboratorio. */
function correr(...args: string[]) {
  return dispatch(parseArgs(["--root", lab, "manuales", ...args]));
}

/** Un manual aprobable: cada afirmación con su cita, que resuelve. */
function manualAprobable(): string {
  return [
    "# Órdenes del POS",
    "",
    `<!-- rutas-fuente: ${FUENTE} -->`,
    "",
    "## Órdenes",
    "",
    "La pantalla lista las órdenes de la sucursal.",
    `<!-- cita: ${FUENTE}:1 -->`,
    "",
    "El botón guarda la orden.",
    `<!-- cita: ${FUENTE}:2 -->`,
    "",
  ].join("\n");
}

/** El manual con una afirmación sin cita. */
const MANUAL_SIN_CITA = ["# Sin cita", "", "## Sección", "", "El botón guarda la orden.", ""].join(
  "\n",
);

describe("manuales auditar: los tres veredictos", () => {
  it("aprueba cuando cada afirmación declara cita y cada cita resuelve", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(MANUAL, manualAprobable());

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.veredicto).toBe("approve");
    expect(resultado.manuales).toHaveLength(1);
    expect(resultado.manuales[0]?.veredicto).toBe("approve");
    expect(resultado.manuales[0]?.hallazgos).toEqual([]);
  });

  it("imprime el veredicto de cada manual que auditó", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(MANUAL, manualAprobable());
    escribir(SIN_CITA, MANUAL_SIN_CITA);

    const salida = correr("auditar");

    expect(salida.stdout).toMatch(/ordenes\.md.*— approve/);
    expect(salida.stdout).toMatch(/sin-cita\.md.*— block/);
    expect(salida.stdout).toContain("Veredicto de la corrida: block");
  });

  it("sale con código 0 cuando el veredicto de la corrida es approve", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(MANUAL, manualAprobable());

    const salida = correr("auditar");

    expect(salida.exitCode).toBe(0);
  });

  it("bloquea un manual con una afirmación sin cita", () => {
    escribir(SIN_CITA, MANUAL_SIN_CITA);

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "sin-cita")).toBe(true);
  });

  it("sale con código 3 cuando la corrida tiene un manual en block", () => {
    escribir(SIN_CITA, MANUAL_SIN_CITA);

    const salida = correr("auditar");

    expect(salida.exitCode).toBe(3);
  });
});

describe("manuales auditar: las causas de bloqueo", () => {
  it("bloquea una cita que apunta a una ruta que no existe", () => {
    escribir(
      MANUAL,
      ["# M", "", "## Sección", "", "La pantalla lista.", "<!-- cita: src/no-existe.ts:1 -->", ""].join(
        "\n",
      ),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(
      resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "cita-no-resuelve"),
    ).toBe(true);
  });

  it("bloquea una cita cuya línea cae fuera del archivo citado", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(
      MANUAL,
      [
        "# M",
        "",
        "## Sección",
        "",
        "La pantalla lista.",
        `<!-- cita: ${FUENTE}:999 -->`,
        "",
      ].join("\n"),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(
      resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "cita-no-resuelve"),
    ).toBe(true);
  });

  it("bloquea una cita cuya línea está vacía", () => {
    escribirFuente(["const listar = true;", "", "const guardar = true;"]);
    escribir(
      MANUAL,
      ["# M", "", "## Sección", "", "La pantalla lista.", `<!-- cita: ${FUENTE}:2 -->`, ""].join(
        "\n",
      ),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(
      resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "cita-no-resuelve"),
    ).toBe(true);
  });

  it("bloquea una cita cuya línea no es un número", () => {
    escribirFuente(["const listar = true;"]);
    escribir(
      MANUAL,
      ["# M", "", "## Sección", "", "La pantalla lista.", `<!-- cita: ${FUENTE}:abc -->`, ""].join(
        "\n",
      ),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(
      resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "cita-mal-formada"),
    ).toBe(true);
  });

  it("bloquea una ruta técnica con extensión de fuente en el texto visible", () => {
    escribirFuente(["const listar = true;"]);
    escribir(
      MANUAL,
      [
        "# M",
        "",
        "## Sección",
        "",
        "La pantalla vive en src/app/pos/ordenes.component.ts y lista las órdenes.",
        `<!-- cita: ${FUENTE}:1 -->`,
        "",
      ].join("\n"),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(
      resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "ruta-tecnica"),
    ).toBe(true);
  });
});

describe("manuales auditar: la banda de revisión", () => {
  it("un literal de error que no aparece en las fuentes citadas deja el manual en review", () => {
    escribirFuente(["const listar = true;"]);
    escribir(
      MANUAL,
      [
        "# M",
        "",
        "## Qué hacer si algo sale mal",
        "",
        'El sistema muestra "No se pudo guardar la orden".',
        `<!-- cita: ${FUENTE}:1 -->`,
        "",
      ].join("\n"),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("review");
    expect(
      resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "mensaje-no-literal"),
    ).toBe(true);
  });

  it("un manual en review no bloquea la corrida: el veredicto es review y no block", () => {
    escribirFuente(["const listar = true;"]);
    escribir(
      MANUAL,
      [
        "# M",
        "",
        "## Qué hacer si algo sale mal",
        "",
        'El sistema muestra "No se pudo guardar la orden".',
        `<!-- cita: ${FUENTE}:1 -->`,
        "",
      ].join("\n"),
    );

    const resultado = auditarManuales(choosePaths(lab), {});
    const salida = correr("auditar");

    expect(resultado.veredicto).toBe("review");
    expect(salida.exitCode).toBe(6);
  });

  it("un directorio de manuales sin ningún .md deja el veredicto de la corrida en review", () => {
    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.veredicto).toBe("review");
    expect(resultado.manuales).toEqual([]);
  });

  it("la corrida con veredicto review sale con código distinto de 0", () => {
    const salida = correr("auditar");

    expect(salida.exitCode).not.toBe(0);
    expect(salida.exitCode).toBe(6);
  });
});

describe("manuales auditar: lo que no es una afirmación", () => {
  it("el bloque de metadata de la plantilla no exige cita", () => {
    escribirFuente(["const listar = true;"]);
    escribir(
      MANUAL,
      [
        "# Órdenes del POS",
        "",
        "**Módulo:** Órdenes",
        "**¿Dónde encontrarla?:** Menú Órdenes",
        "**Última actualización:** 2026-09-29",
        "**Código:** ORD",
        "**Versión:** V1",
        "",
        "## ¿Qué es esta pantalla?",
        "",
        "La pantalla lista las órdenes de la sucursal.",
        `<!-- cita: ${FUENTE}:1 -->`,
        "",
      ].join("\n"),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("approve");
    expect(resultado.manuales[0]?.hallazgos).toEqual([]);
    // Las cinco etiquetas quedan fuera del conteo: la única afirmación del
    // manual es la de la sección.
    expect(resultado.manuales[0]?.afirmaciones).toBe(1);
  });

  it("el manual que emite el CLI se audita de punta a punta en approve", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    const emitida = correr(
      "plantilla",
      "--pantalla",
      "Órdenes",
      "--escribir",
      "--destino",
      MANUAL,
    );
    expect(emitida.exitCode).toBe(0);

    // El manual se escribe sobre el esqueleto que el proceso usa: cada sección
    // recibe su afirmación con su cita, y la de pendientes queda sin cita —que es
    // lo que la skill del proceso pide dejar ahí—.
    const esqueleto = readFileSync(join(lab, ...MANUAL.split("/")), "utf8");
    const texto = esqueleto
      .split("\n")
      .flatMap((linea) =>
        linea.startsWith("## ") && !linea.toLowerCase().includes("pendiente")
          ? [
              linea,
              "",
              "La pantalla hace lo que esta sección describe.",
              `<!-- cita: ${FUENTE}:1 -->`,
            ]
          : [linea],
      )
      .join("\n");
    escribir(MANUAL, texto);

    const salida = correr("auditar");

    expect(salida.exitCode).toBe(0);
    expect(salida.stdout).toContain("— approve");
    expect(salida.stdout).toContain("Veredicto de la corrida: approve");
  });

  it("la fila de cabecera de una tabla no exige cita y sus filas de cuerpo sí", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(
      MANUAL,
      [
        "# M",
        "",
        "## Campos del formulario",
        "",
        "| Campo | Uso |",
        "| --- | --- |",
        "| Cliente | Elige el tercero de la orden. |",
        `<!-- cita: ${FUENTE}:2 -->`,
        "",
      ].join("\n"),
    );

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("approve");
    expect(resultado.manuales[0]?.hallazgos).toEqual([]);
  });

  it("una línea en negrita fuera del bloque de metadata sí exige cita", () => {
    escribir(SIN_CITA, [
      "# M",
      "",
      "## ¿Cómo se usa?",
      "",
      "**Importante:** el botón guarda la orden.",
      "",
    ].join("\n"));

    const resultado = auditarManuales(choosePaths(lab), {});

    expect(resultado.manuales[0]?.veredicto).toBe("block");
    expect(resultado.manuales[0]?.hallazgos.some((h) => h.tipo === "sin-cita")).toBe(true);
  });
});

describe("manuales auditar: el recibo", () => {
  it("queda en .valmen/receipts/actualizar-manuales.jsonl con sujeto de proceso", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(MANUAL, manualAprobable());
    escribir(SIN_CITA, MANUAL_SIN_CITA);

    const salida = correr("auditar");

    expect(salida.exitCode).toBe(3);
    const ruta = join(lab, ".valmen", "receipts", "actualizar-manuales.jsonl");
    expect(existsSync(ruta)).toBe(true);

    const lineas = readFileSync(ruta, "utf8").trim().split("\n");
    const recibo = JSON.parse(lineas[lineas.length - 1] as string) as {
      kind: string;
      gate: string;
      subject: { type: string; id: string; revision: string };
    };

    expect(recibo.kind).toBe("gate-receipt");
    expect(recibo.gate).toBe("manuals");
    expect(recibo.subject.type).toBe("process");
    expect(recibo.subject.id).toBe("actualizar-manuales");
    expect(recibo.subject.revision).toMatch(/^sha256:/);
  });

  it("guarda el veredicto de cada manual auditado y el resultado de cada check mecánico", () => {
    escribirFuente(["const listar = true;", "const guardar = true;"]);
    escribir(MANUAL, manualAprobable());
    escribir(SIN_CITA, MANUAL_SIN_CITA);

    correr("auditar");

    const ruta = join(lab, ".valmen", "receipts", "actualizar-manuales.jsonl");
    const lineas = readFileSync(ruta, "utf8").trim().split("\n");
    const recibo = JSON.parse(lineas[lineas.length - 1] as string) as {
      propositions: { label: string; effect: { outcome: string } }[];
      mechanicalChecks: { id: string; result: string }[];
    };

    const etiquetas = recibo.propositions.map((p) => p.label);
    expect(etiquetas).toContain(`${MANUAL}=approve`);
    expect(etiquetas).toContain(`${SIN_CITA}=block`);

    expect(recibo.mechanicalChecks.map((c) => c.id)).toEqual([
      "citas_presentes",
      "citas_resuelven",
      "sin_rutas_tecnicas",
      "mensajes_de_error",
    ]);
    expect(recibo.mechanicalChecks.find((c) => c.id === "citas_presentes")?.result).toBe("fail");
    expect(recibo.mechanicalChecks.find((c) => c.id === "citas_resuelven")?.result).toBe("pass");
    expect(recibo.mechanicalChecks.find((c) => c.id === "sin_rutas_tecnicas")?.result).toBe("pass");
    expect(recibo.mechanicalChecks.find((c) => c.id === "mensajes_de_error")?.result).toBe("skip");
  });
});

describe("manuales auditar: la ayuda del CLI", () => {
  it("documenta manuales auditar con el contrato de citas, los tres veredictos y la ruta del recibo", () => {
    expect(USAGE).toContain("manuales auditar");
    expect(USAGE).toContain("<!-- cita: <ruta>:<línea> -->");
    expect(USAGE).toContain("approve");
    expect(USAGE).toContain("block");
    expect(USAGE).toContain("review");
    expect(USAGE).toContain(".valmen/receipts/actualizar-manuales.jsonl");
  });
});
