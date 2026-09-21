/**
 * Prueba diferencial contra la implementación de referencia.
 *
 * Es la única forma de demostrar que el reemplazo no pierde comportamiento: se
 * ejecutan los **dos CLI** sobre dos copias idénticas del mismo registro, con la
 * misma secuencia de comandos, y se comparan byte a byte los tickets resultantes,
 * el mensaje de error y el código de salida.
 *
 * Está **desactivada por defecto**, y eso es deliberado: `ticket.py` pertenece al
 * proyecto que se está migrando y no vive en este repositorio. Publicarlo aquí
 * sería meter código de un cliente en el harness. Cualquiera que tenga la
 * referencia a mano puede ejecutarla:
 *
 * ```bash
 * VALMEN_REFERENCE_TICKET_PY=/ruta/a/tools/agentic/ticket.py npx vitest run tests/equivalence-ticketpy.test.ts
 * ```
 *
 * Requiere `python3` y `git`. La referencia exige estar dentro de un repositorio
 * Git y usa `docs/tickets` como registro; el harness llega ahí con
 * `--legacy-layout`.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFixtureTicket } from "./helpers/fixtures.js";

/** La ruta a `ticket.py`. Sin ella, esta suite no se ejecuta. */
const REFERENCIA = process.env["VALMEN_REFERENCE_TICKET_PY"] ?? "";
const disponible = REFERENCIA !== "" && existsSync(REFERENCIA);

/** El CLI del harness, ya compilado. */
const VALMEN = join(import.meta.dirname, "..", "packages", "cli", "dist", "main.js");

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;

/** Crea un repositorio Git con el registro en el layout heredado. */
function crearLaboratorio(): string {
  const raiz = mkdtempSync(join(tmpdir(), "valmen-dif-"));
  mkdirSync(join(raiz, "docs", "tickets"), { recursive: true });
  spawnSync("git", ["init", "-q", "."], { cwd: raiz });

  writeFixtureTicket(raiz, { id: TICKET });
  // El generador escribe en `tickets/`; la referencia solo entiende
  // `docs/tickets`.
  mkdirSync(join(raiz, "docs", "tickets", "2026"), { recursive: true });
  renameSync(
    join(raiz, "tickets", "2026", TICKET),
    join(raiz, "docs", "tickets", "2026", TICKET),
  );
  rmSync(join(raiz, "tickets"), { recursive: true, force: true });

  // El índice tiene que **existir**. La referencia no puede crearlo desde cero
  // —comprueba la ruta antes de escribirla— y falla con un error de esquema
  // *después* de haber mutado el ticket. Su propia suite lo copia al fixture por
  // este motivo; aquí se replica esa condición para comparar el camino de
  // escritura, y hay un test aparte que documenta la divergencia.
  writeFileSync(join(raiz, "docs", "tickets", "index.md"), "# Índice de tickets\n");
  return raiz;
}

/** Ejecuta la referencia. */
function referencia(raiz: string, args: readonly string[]) {
  const resultado = spawnSync("python3", [REFERENCIA, ...args], {
    cwd: raiz,
    encoding: "utf8",
  });
  return {
    code: resultado.status ?? -1,
    stderr: resultado.stderr,
    stdout: resultado.stdout,
  };
}

/** Ejecuta el harness. */
function valmen(raiz: string, args: readonly string[]) {
  const resultado = spawnSync(
    process.execPath,
    [VALMEN, "--root", raiz, "--legacy-layout", ...args],
    { cwd: raiz, encoding: "utf8" },
  );
  return {
    code: resultado.status ?? -1,
    stderr: resultado.stderr,
    stdout: resultado.stdout,
  };
}

/** El ticket tal como quedó en disco. */
function ticket(raiz: string): string {
  return readFileSync(join(raiz, "docs", "tickets", "2026", TICKET, "ticket.md"), "utf8");
}

/**
 * Ejecuta el mismo comando con los dos CLI y compara.
 *
 * Devuelve las dos salidas para que un test pueda además comprobar el efecto,
 * pero la aserción de equivalencia ya está hecha aquí: código, stderr y bytes
 * del ticket.
 */
function comparar(args: readonly string[], etiqueta: string): void {
  const a = crearLaboratorio();
  const b = crearLaboratorio();
  try {
    const suyo = referencia(a, args);
    const mio = valmen(b, args);

    expect(mio.code, `código de salida · ${etiqueta}`).toBe(suyo.code);
    expect(mio.stderr, `stderr · ${etiqueta}`).toBe(suyo.stderr);
    expect(ticket(b), `ticket.md · ${etiqueta}`).toBe(ticket(a));
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}

/** Ejecuta el mismo comando sobre una copia ya preparada, y compara el resto. */
function compararSecuencia(
  pasos: readonly (readonly string[])[],
  etiqueta: string,
): void {
  const a = crearLaboratorio();
  const b = crearLaboratorio();
  try {
    for (const [indice, paso] of pasos.entries()) {
      const suyo = referencia(a, paso);
      const mio = valmen(b, paso);
      expect(mio.code, `código · ${etiqueta} · paso ${indice + 1}`).toBe(suyo.code);
      expect(mio.stderr, `stderr · ${etiqueta} · paso ${indice + 1}`).toBe(suyo.stderr);
      expect(mio.stdout, `stdout · ${etiqueta} · paso ${indice + 1}`).toBe(suyo.stdout);
      expect(ticket(b), `ticket · ${etiqueta} · paso ${indice + 1}`).toBe(ticket(a));
    }
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}

beforeEach(() => {
  lab = crearLaboratorio();
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe.skipIf(!disponible)("equivalencia con ticket.py", () => {
  // ── Camino de lectura: el mismo registro, la misma respuesta ──────────────
  describe("los comandos de lectura siguen coincidiendo", () => {
    it("`validate --id` sobre un ticket válido", () => {
      const suyo = referencia(lab, ["validate", "--id", TICKET]);
      const mio = valmen(lab, ["validate", "--id", TICKET]);
      expect(mio.code).toBe(suyo.code);
      expect(mio.stdout).toBe(suyo.stdout);
    });

    it("`validate --id` sobre un ticket roto: mismo rechazo, mensaje de esquema 2", () => {
      const ruta = join(lab, "docs", "tickets", "2026", TICKET, "ticket.md");
      const roto = readFileSync(ruta, "utf8").replace("schema_version: 1", "schema_version: 9");
      // Se escribe con Node, no con `sh`: escapar el texto dentro de una línea de
      // shell es una fuente de fallos que no aporta nada a la comparación.
      writeFileSync(ruta, roto, "utf8");

      const suyo = referencia(lab, ["validate", "--id", TICKET]);
      const mio = valmen(lab, ["validate", "--id", TICKET]);

      // **Divergencia declarada.** La referencia solo conoce el esquema 1 y su
      // mensaje dice «el entero literal 1». El harness acepta el 1 y el 2, así
      // que nombra los dos. Es la diferencia que el esquema 2 introdujo, y el
      // único sitio donde se ve.
      expect(suyo.code).toBe(2);
      expect(mio.code).toBe(2);
      expect(suyo.stderr).toBe("Error: schema_version debe ser el entero literal 1.\n");
      expect(mio.stderr).toBe("Error: schema_version debe ser el entero literal 1 o 2.\n");
    });

    it("sin índice, la referencia muta y falla; el harness muta y lo crea", () => {
      // **Divergencia declarada, y es una corrección.** En un registro sin
      // `index.md`, la referencia escribe el ticket y después falla con código 2
      // («La ruta canónica solicitada no existe.») porque comprueba la ruta del
      // índice antes de generarlo. El resultado es una mutación confirmada
      // reportada como fallo: un script que mire el código de salida cree que no
      // pasó nada y el ticket ya se movió.
      //
      // El harness crea el índice. Un índice derivado tiene que poder
      // reconstruirse desde cero; es la única cosa que se le pide.
      const a = crearLaboratorio();
      const b = crearLaboratorio();
      try {
        rmSync(join(a, "docs", "tickets", "index.md"));
        rmSync(join(b, "docs", "tickets", "index.md"));
        const args = ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"];

        const suyo = referencia(a, args);
        const mio = valmen(b, args);

        // Los dos escriben el ticket...
        expect(ticket(a)).toContain("workflow_status: approved");
        expect(ticket(b)).toBe(ticket(a));
        // ...pero solo uno lo informa bien.
        expect(suyo.code).toBe(2);
        expect(mio.code).toBe(0);
        expect(existsSync(join(b, "docs", "tickets", "index.md"))).toBe(true);
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
    });
  });

  // ── Los 57 tickets reales ────────────────────────────────────────────────
  describe("sobre el registro real de 57 tickets", () => {
    /** Un registro con los 57 tickets reales, en el layout que lee la referencia. */
    function registroReal(): string {
      const raiz = mkdtempSync(join(tmpdir(), "valmen-real-"));
      mkdirSync(join(raiz, "docs"), { recursive: true });
      cpSync(join(import.meta.dirname, "fixtures", "saicloud", "tickets"), join(raiz, "docs", "tickets"), {
        recursive: true,
      });
      spawnSync("git", ["init", "-q", "."], { cwd: raiz });
      return raiz;
    }

    it("`validate --all` da la misma salida sobre los 57", () => {
      const raiz = registroReal();
      try {
        const suyo = referencia(raiz, ["validate", "--all"]);
        const mio = valmen(raiz, ["validate", "--all"]);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stdout).toBe(suyo.stdout);
        expect(mio.stdout).toBe("Tickets válidos: 57\n");
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("`active` coincide: no hay ninguno activo", () => {
      const raiz = registroReal();
      try {
        const suyo = referencia(raiz, ["active"]);
        const mio = valmen(raiz, ["active"]);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stdout).toBe(suyo.stdout);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("`resume` sin `--id` coincide: tampoco hay nada que reanudar", () => {
      const raiz = registroReal();
      try {
        const suyo = referencia(raiz, ["resume"]);
        const mio = valmen(raiz, ["resume"]);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stdout).toBe(suyo.stdout);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("los 57 tienen el formato de bloque que el harness reproduce", () => {
      // No es una comparación contra la referencia, es el hecho que la hace
      // posible: los bloques que hay en disco son los que `json.dumps` produce.
      // Si algún día dejan de serlo, la comparación byte a byte de más arriba
      // empezaría a fallar por una razón que no tiene nada que ver con el comando.
      const raiz = registroReal();
      try {
        const suyo = referencia(raiz, ["index"]);
        expect(suyo.code).toBe(0);
        const indiceReferencia = readFileSync(join(raiz, "docs", "tickets", "index.md"), "utf8");

        const mio = valmen(raiz, ["index"]);
        expect(mio.code).toBe(0);
        const indiceMio = readFileSync(join(raiz, "docs", "tickets", "index.md"), "utf8");

        // **Divergencia declarada**: la cabecera nombra el comando que genera el
        // índice, así que la primera línea de la cita cambia. La tabla —que es
        // lo que un lector usa— tiene que ser idéntica.
        const tabla = (texto: string): string =>
          texto.slice(texto.indexOf("| Fecha |"));
        expect(tabla(indiceMio)).toBe(tabla(indiceReferencia));
        expect(indiceMio).toContain("valmen index");
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });
  });

  // ── Transiciones: lo que se acaba de implementar ─────────────────────────
  describe("las transiciones de ticket", () => {
    it("un salto ilegal da el mismo mensaje y el mismo código", () => {
      comparar(
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "planned"],
        "planned -> planned",
      );
    });

    it("`--reason` fuera de una reapertura se rechaza igual", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "ticket", "--to", "planned",
          "--reason", "porque sí",
        ],
        "--reason indebido",
      );
    });

    it("`--point-id` con una transición de ticket se rechaza igual", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "ticket", "--to", "planned",
          "--point-id", "POINT-001",
        ],
        "--point-id indebido",
      );
    });

    it("`--version` con una transición de ticket se rechaza igual", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "ticket", "--to", "planned",
          "--version", "9.9.9",
        ],
        "--version indebida",
      );
    });

    it("`planned` sin plan real se rechaza igual", () => {
      const raiz = crearLaboratorio();
      try {
        const ruta = join(raiz, "docs", "tickets", "2026", TICKET, "ticket.md");
        const original = readFileSync(ruta, "utf8");
        // Se vacía el plan dejando el placeholders que el contrato reconoce.
        const vaciado = original.replace(
          /(## Plan\n\n)[\s\S]*?(\n## Criterios)/,
          "$1- pendiente\n$2",
        );
        expect(vaciado).not.toBe(original);

        const a = join(raiz, "..", `a-${Date.now()}`);
        const b = join(raiz, "..", `b-${Date.now()}`);
        cpSync(raiz, a, { recursive: true });
        cpSync(raiz, b, { recursive: true });
        for (const destino of [a, b]) {
          spawnSync("sh", [
            "-c",
            `printf '%s' '${vaciado.replace(/'/g, "'\\''")}' > '${join(destino, "docs", "tickets", "2026", TICKET, "ticket.md")}'`,
          ]);
        }

        const args = ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"];
        const suyo = referencia(a, args);
        const mio = valmen(b, args);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stderr).toBe(suyo.stderr);

        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("una transición legal escribe el mismo ticket, byte a byte", () => {
      // El fixture ya está en `planned` con plan estructurado y gate del PO.
      comparar(
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"],
        "planned -> approved",
      );
    });

    it("la secuencia hasta `in_progress` coincide paso a paso", () => {
      compararSecuencia(
        [
          ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"],
          ["transition", "--id", TICKET, "--entity", "ticket", "--to", "in_progress"],
        ],
        "hasta in_progress",
      );
    });

    it("el evento anexado y la fecha son los mismos", () => {
      const a = crearLaboratorio();
      const b = crearLaboratorio();
      try {
        const args = ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"];
        referencia(a, args);
        valmen(b, args);

        const eventos = (texto: string): string => {
          const bloque = /^## Eventos\n\n```json\n([\s\S]*?)\n```/m.exec(texto);
          return bloque?.[1] ?? "";
        };
        expect(eventos(ticket(b))).toBe(eventos(ticket(a)));
        // Y el evento dice lo mismo que en la referencia.
        expect(eventos(ticket(b))).toContain('"details": "Workflow: planned -> approved."');
        expect(eventos(ticket(b))).toContain('"actor": "cli"');
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
    });
  });

  // ── Release ──────────────────────────────────────────────────────────────
  describe("las transiciones de release", () => {
    it("`released` sin versión objetivo se rechaza igual", () => {
      comparar(
        ["transition", "--id", TICKET, "--entity", "release", "--to", "released"],
        "released sin versión",
      );
    });

    it("`not_applicable` con versiones no nulas se rechaza igual", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "release",
          "--to", "not_applicable", "--version", "1.2.3",
        ],
        "not_applicable con versión",
      );
    });

    it("`unreleased -> planned` escribe la versión y coincide", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "release",
          "--to", "planned", "--version", "6.3.0",
        ],
        "release planned",
      );
    });

    it("la secuencia hasta `released` coincide paso a paso", () => {
      compararSecuencia(
        [
          [
            "transition", "--id", TICKET, "--entity", "release",
            "--to", "planned", "--version", "6.3.0",
          ],
          [
            "transition", "--id", TICKET, "--entity", "release",
            "--to", "released", "--version", "6.3.0",
          ],
        ],
        "release hasta released",
      );
    });

    it("`released_in` distinto de `target_release` se rechaza igual", () => {
      const pasos = [
        [
          "transition", "--id", TICKET, "--entity", "release",
          "--to", "planned", "--version", "6.3.0",
        ],
        [
          "transition", "--id", TICKET, "--entity", "release",
          "--to", "released", "--version", "6.4.0",
        ],
      ];
      compararSecuencia(pasos, "released_in incoherente");
    });
  });

  // ── Puntos ───────────────────────────────────────────────────────────────
  describe("las transiciones de punto", () => {
    it("sin `--point-id` se rechaza igual", () => {
      comparar(
        ["transition", "--id", TICKET, "--entity", "point", "--to", "analyzed"],
        "punto sin id",
      );
    });

    it("un punto inexistente se rechaza igual", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "point", "--to", "analyzed",
          "--point-id", "POINT-009",
        ],
        "punto inexistente",
      );
    });

    it("`--version` con una transición de punto se rechaza igual", () => {
      comparar(
        [
          "transition", "--id", TICKET, "--entity", "point", "--to", "analyzed",
          "--point-id", "POINT-001", "--version", "1.0.0",
        ],
        "--version en punto",
      );
    });
  });
});
