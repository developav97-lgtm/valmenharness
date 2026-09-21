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
import { dirname, join } from "node:path";

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

/**
 * Reemplaza el cuerpo de una sección, sin depender de la prosa de la plantilla.
 *
 * Sustituir frases concretas ataría estos tests al texto exacto de la plantilla
 * del proyecto, y cambiarían de significado el día que alguien reescriba una
 * sección. Lo que se está preparando es el **estado** del sujeto, no su prosa.
 */
function conSeccion(texto: string, seccion: string, cuerpo: string): string {
  const patron = new RegExp(`(^## ${seccion}\\n\\n)[\\s\\S]*?(?=\\n## )`, "m");
  if (!patron.test(texto)) {
    throw new Error(`La plantilla no tiene la sección ${seccion}.`);
  }
  return texto.replace(patron, `$1${cuerpo}\n`);
}

/**
 * La plantilla canónica de la referencia.
 *
 * Se copia al laboratorio para que las dos implementaciones partan del **mismo
 * texto**: sin eso, la comparación mediría la diferencia entre dos plantillas,
 * que no es lo que se está probando.
 */
function plantillaDeReferencia(): string {
  const raiz = dirname(dirname(dirname(REFERENCIA)));
  return join(raiz, "docs", "agentic", "templates", "ticket.template.md");
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

  // ── El ciclo de vida completo ────────────────────────────────────────────
  describe("el ciclo de vida de un ticket, paso a paso", () => {
    /** El SHA que se usa como referencia de build. Solo se valida su forma. */
    const COMMIT = "0123456789abcdef0123456789abcdef01234567";

    /**
     * Escribe el resultado del PO en `Pruebas`, que es lo que exige `in_qa`.
     *
     * Se aplica igual a las dos copias: es preparación del sujeto, no parte de
     * lo que se está comparando.
     */
    function prepararPruebas(raiz: string): void {
      const ruta = join(raiz, "docs", "tickets", "2026", TICKET, "ticket.md");
      const texto = readFileSync(ruta, "utf8").replace(
        "Pendiente de ejecución.",
        "Resultado PO: probado en la sucursal con el PO delante.",
      );
      writeFileSync(ruta, texto, "utf8");
    }

    it("de punta a punta: punto, evidencia, QA, retest, cierre y release", () => {
      const a = crearLaboratorio();
      const b = crearLaboratorio();
      try {
        prepararPruebas(a);
        prepararPruebas(b);

        const id = ["--id", TICKET];
        const pasos: readonly (readonly string[])[] = [
          // El punto recorre su propia máquina hasta quedar listo para el retest.
          ["add-point", ...id, "--title", "El listado no pagina", "--severity", "normal",
            "--actual", "devuelve todo", "--expected", "devuelve 20"],
          ["transition", ...id, "--entity", "point", "--point-id", "POINT-001", "--to", "analyzed"],
          ["transition", ...id, "--entity", "point", "--point-id", "POINT-001", "--to", "in_progress"],
          ["transition", ...id, "--entity", "point", "--point-id", "POINT-001", "--to", "awaiting_retest"],
          ["add-evidence", ...id, "--kind", "prueba", "--description", "Captura del listado paginado",
            "--reference", `commit:${COMMIT}`, "--point-id", "POINT-001"],
          // El ticket avanza hasta QA.
          ["transition", ...id, "--entity", "ticket", "--to", "approved"],
          ["transition", ...id, "--entity", "ticket", "--to", "in_progress"],
          ["transition", ...id, "--entity", "ticket", "--to", "awaiting_user_tests"],
          ["transition", ...id, "--entity", "ticket", "--to", "in_qa"],
          ["qa-start", ...id, "--environment", "staging", "--build-reference", `commit:${COMMIT}`],
          ["add-retest", ...id, "--point-id", "POINT-001", "--result", "approved",
            "--po-confirmation", "Confirmado por el PO"],
          ["qa-close", ...id, "--result", "approved", "--po-confirmation", "Aprobado por el PO"],
          ["transition", ...id, "--entity", "ticket", "--to", "qa_approved"],
          ["close-attempt", ...id,
            "--technical-summary", "Se cambió el lookup del filtro.",
            "--functional-summary", "El listado pagina de veinte en veinte.",
            "--qa-status", "approved",
            "--release-impact", "Entra en la próxima release."],
          ["transition", ...id, "--entity", "ticket", "--to", "closed"],
          // El consumo se registra incluso con el ticket cerrado.
          ["add-ai-usage", ...id, "--source", "cli", "--confidence", "high",
            "--model", "deepseek/deepseek-v4-flash", "--input-tokens", "751",
            "--output-tokens", "115", "--estimated-cost-usd", "0.0000315"],
          // Y la release se publica.
          ["transition", ...id, "--entity", "release", "--to", "planned", "--version", "6.3.0"],
          ["transition", ...id, "--entity", "release", "--to", "released", "--version", "6.3.0"],
        ];

        for (const [indice, paso] of pasos.entries()) {
          const suyo = referencia(a, paso as string[]);
          const mio = valmen(b, paso as string[]);
          const etiqueta = `paso ${indice + 1}: ${paso[0]}`;

          expect(mio.code, `código · ${etiqueta}`).toBe(suyo.code);
          expect(mio.stderr, `stderr · ${etiqueta}`).toBe(suyo.stderr);
          expect(mio.stdout, `stdout · ${etiqueta}`).toBe(suyo.stdout);
          expect(ticket(b), `ticket · ${etiqueta}`).toBe(ticket(a));
        }

        // Y el resultado final es el que se esperaba, para que un fallo de los
        // dos lados a la vez no pase como equivalencia.
        const final = ticket(b);
        expect(final).toContain("workflow_status: closed");
        expect(final).toContain("release_status: released");
        expect(final).toContain("released_in: 6.3.0");
        expect(final).toContain('"status": "verified"');
        expect(final).toContain('"id": "CONSUMO-001"');
        // Python escribe los costes por debajo de 1e-4 en notación científica,
        // y el harness lo replica: es la razón de que exista `formatPythonNumber`.
        expect(final).toContain('"estimated_cost_usd": 3.15e-05');
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
    });

    it("la reapertura de un ticket cerrado y no publicado", () => {
      const a = crearLaboratorio();
      const b = crearLaboratorio();
      try {
        prepararPruebas(a);
        prepararPruebas(b);
        const id = ["--id", TICKET];
        const pasos: readonly (readonly string[])[] = [
          ["transition", ...id, "--entity", "ticket", "--to", "approved"],
          ["transition", ...id, "--entity", "ticket", "--to", "in_progress"],
          ["transition", ...id, "--entity", "ticket", "--to", "awaiting_user_tests"],
          ["transition", ...id, "--entity", "ticket", "--to", "in_qa"],
          ["qa-start", ...id, "--environment", "staging",
            "--build-reference", `commit:${"a".repeat(40)}`],
          ["qa-close", ...id, "--result", "approved", "--po-confirmation", "Aprobado"],
          ["transition", ...id, "--entity", "ticket", "--to", "qa_approved"],
          ["close-attempt", ...id, "--technical-summary", "T", "--functional-summary", "F",
            "--qa-status", "approved", "--release-impact", "R"],
          ["transition", ...id, "--entity", "ticket", "--to", "closed"],
          // El hallazgo posterior: reabre, anexa dos ciclos QA y pide motivo.
          ["transition", ...id, "--entity", "ticket", "--to", "changes_requested",
            "--reason", "El PO encontró un caso sin cubrir."],
        ];

        for (const [indice, paso] of pasos.entries()) {
          const suyo = referencia(a, paso as string[]);
          const mio = valmen(b, paso as string[]);
          const etiqueta = `paso ${indice + 1}: ${paso[0]} ${paso[7] ?? ""}`;
          expect(mio.code, `código · ${etiqueta}`).toBe(suyo.code);
          expect(mio.stderr, `stderr · ${etiqueta}`).toBe(suyo.stderr);
          expect(ticket(b), `ticket · ${etiqueta}`).toBe(ticket(a));
        }

        const final = ticket(b);
        expect(final).toContain("workflow_status: changes_requested");
        expect(final).toContain("qa_status: pending");
        expect(final).toContain("Reapertura por hallazgo");
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
    });
  });

  // ── Alta de tickets ──────────────────────────────────────────────────────
  describe("`create`", () => {
    const NUEVO = "BUGFIX-POS-PAGINACION-20260921";
    const SOLICITUD =
      "Cuando entro al listado de órdenes me devuelve todo de una vez y se cuelga.";

    function crearLaboratorioDeAlta(): string {
      const raiz = mkdtempSync(join(tmpdir(), "valmen-alta-"));
      mkdirSync(join(raiz, "docs", "tickets"), { recursive: true });
      mkdirSync(join(raiz, "docs", "agentic", "templates"), { recursive: true });
      mkdirSync(join(raiz, ".valmen", "templates"), { recursive: true });
      spawnSync("git", ["init", "-q", "."], { cwd: raiz });
      writeFileSync(join(raiz, "docs", "tickets", "index.md"), "# Índice de tickets\n");

      const plantilla = readFileSync(plantillaDeReferencia(), "utf8");
      // La misma plantilla en los dos sitios: donde la lee la referencia y donde
      // la lee el harness.
      writeFileSync(join(raiz, "docs", "agentic", "templates", "ticket.template.md"), plantilla);
      writeFileSync(join(raiz, ".valmen", "templates", "ticket.md"), plantilla);
      return raiz;
    }

    const args = [
      "create", "--id", NUEVO, "--title", "El listado no pagina",
      "--type", "BUGFIX", "--module", "POS", "--request", SOLICITUD,
    ];

    it("produce el mismo ticket salvo la versión de esquema", () => {
      const a = crearLaboratorioDeAlta();
      const b = crearLaboratorioDeAlta();
      try {
        const suyo = referencia(a, args);
        const mio = valmen(b, args);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stdout).toBe(suyo.stdout);

        const leer = (raiz: string): string =>
          readFileSync(join(raiz, "docs", "tickets", "2026", NUEVO, "ticket.md"), "utf8");

        // **Divergencia declarada, y es la única.** El harness escribe el esquema
        // 2 y la referencia el 1. Normalizada esa línea, el resto del ticket es
        // idéntico byte a byte: mismas secciones, mismos bloques, misma fecha,
        // mismo evento.
        expect(leer(a)).toContain("schema_version: 1");
        expect(leer(b)).toContain("schema_version: 2");
        expect(leer(b).replace("schema_version: 2", "schema_version: 1")).toBe(leer(a));
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
    });

    it("la solicitud se conserva literal, con sus saltos de línea", () => {
      const raiz = crearLaboratorioDeAlta();
      try {
        const larga = "Primera línea.\n\nSegunda línea, con coma, y acentos: ñáé.";
        const mio = valmen(raiz, [
          "create", "--id", NUEVO, "--title", "T", "--type", "BUGFIX",
          "--module", "POS", "--request", larga,
        ]);
        expect(mio.code).toBe(0);
        const texto = readFileSync(
          join(raiz, "docs", "tickets", "2026", NUEVO, "ticket.md"),
          "utf8",
        );
        expect(texto).toContain(larga);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("un ID que no coincide con el tipo se rechaza igual", () => {
      const raiz = crearLaboratorioDeAlta();
      try {
        const suyo = referencia(raiz, [
          "create", "--id", NUEVO, "--title", "T", "--type", "FEATURE",
          "--module", "POS", "--request", "R",
        ]);
        const mio = valmen(raiz, [
          "create", "--id", NUEVO, "--title", "T", "--type", "FEATURE",
          "--module", "POS", "--request", "R",
        ]);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stderr).toBe(suyo.stderr);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("un módulo que no coincide con el ID se rechaza igual", () => {
      const raiz = crearLaboratorioDeAlta();
      try {
        const argumentos = [
          "create", "--id", NUEVO, "--title", "T", "--type", "BUGFIX",
          "--module", "VENTAS", "--request", "R",
        ];
        const suyo = referencia(raiz, argumentos);
        const mio = valmen(raiz, argumentos);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stderr).toBe(suyo.stderr);
      } finally {
        rmSync(raiz, { recursive: true, force: true });
      }
    });

    it("crear dos veces el mismo ID se rechaza con el código de historial", () => {
      // Cada implementación hace su propia secuencia sobre su propia copia: si
      // el harness creara primero, la referencia leería un ticket del esquema 2
      // y fallaría al validar la colección, que no es lo que se está probando.
      const a = crearLaboratorioDeAlta();
      const b = crearLaboratorioDeAlta();
      try {
        expect(referencia(a, args).code).toBe(0);
        expect(valmen(b, args).code).toBe(0);

        const suyo = referencia(a, args);
        const mio = valmen(b, args);

        expect(mio.code).toBe(suyo.code);
        expect(mio.code).toBe(4);
        expect(mio.stderr).toBe(suyo.stderr);
      } finally {
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
      }
    });
  });

  // ── Los comandos de anexado, uno por uno ─────────────────────────────────
  describe("los comandos de anexado", () => {
    it("`add-point` con severidad inválida se rechaza igual", () => {
      comparar(
        ["add-point", "--id", TICKET, "--title", "T", "--severity", "urgentísimo",
          "--actual", "A", "--expected", "E"],
        "severidad inválida",
      );
    });

    it("`add-point` con título multilínea se rechaza igual", () => {
      comparar(
        ["add-point", "--id", TICKET, "--title", "T\ncon salto", "--severity", "normal",
          "--actual", "A", "--expected", "E"],
        "título con salto",
      );
    });

    it("`add-evidence` con una referencia mal formada se rechaza igual", () => {
      comparar(
        ["add-evidence", "--id", TICKET, "--kind", "log", "--description", "D",
          "--reference", "commit:ABCDEF"],
        "referencia en mayúsculas",
      );
    });

    it("`add-evidence` sobre un punto inexistente se rechaza igual", () => {
      comparar(
        ["add-evidence", "--id", TICKET, "--kind", "log", "--description", "D",
          "--point-id", "POINT-004"],
        "punto inexistente",
      );
    });

    it("`add-ai-usage` con confianza inválida se rechaza igual", () => {
      comparar(
        ["add-ai-usage", "--id", TICKET, "--source", "cli", "--confidence", "altísima"],
        "confianza inválida",
      );
    });

    it("`add-ai-usage` con coste exponencial se rechaza igual", () => {
      comparar(
        ["add-ai-usage", "--id", TICKET, "--source", "cli", "--confidence", "high",
          "--estimated-cost-usd", "1e3"],
        "coste exponencial",
      );
    });

    it("`add-ai-usage` con tokens negativos se rechaza igual", () => {
      comparar(
        ["add-ai-usage", "--id", TICKET, "--source", "cli", "--confidence", "high",
          "--input-tokens", "-5"],
        "tokens negativos",
      );
    });

    it("`qa-start` fuera de `in_qa` se rechaza igual", () => {
      comparar(
        ["qa-start", "--id", TICKET, "--environment", "staging",
          "--build-reference", `commit:${"a".repeat(40)}`],
        "qa-start fuera de in_qa",
      );
    });

    it("`qa-start` sin ambiente se rechaza igual", () => {
      comparar(["qa-start", "--id", TICKET], "qa-start sin banderas");
    });

    it("`qa-close` sin ciclo abierto se rechaza igual", () => {
      comparar(
        ["qa-close", "--id", TICKET, "--result", "approved", "--po-confirmation", "PO"],
        "qa-close sin ciclo",
      );
    });

    it("`add-retest` fuera de `in_qa` se rechaza igual", () => {
      comparar(
        ["add-retest", "--id", TICKET, "--point-id", "POINT-001", "--result", "approved",
          "--po-confirmation", "PO"],
        "retest fuera de in_qa",
      );
    });

    it("`close-attempt` con QA no aprobada se rechaza igual", () => {
      comparar(
        ["close-attempt", "--id", TICKET, "--technical-summary", "T",
          "--functional-summary", "F", "--qa-status", "waived", "--release-impact", "R"],
        "cierre sin exención",
      );
    });

    it("`close-attempt` con `qa-status` fuera del esquema se rechaza igual", () => {
      comparar(
        ["close-attempt", "--id", TICKET, "--technical-summary", "T",
          "--functional-summary", "F", "--qa-status", "maybe", "--release-impact", "R"],
        "qa-status inválido",
      );
    });
  });

  // ── Publicación de releases ──────────────────────────────────────────────
  describe("`release-publish`", () => {
    /**
     * Un repositorio con `production`, un tag anotado sobre su tip y un ticket
     * cerrado cuya implementación menciona ese commit.
     *
     * El cierre se hace **con la referencia** para los dos lados: producir el
     * ticket cerrado con el harness lo dejaría en el esquema 2, que la referencia
     * no sabe leer, y el fallo mediría eso en vez de la publicación.
     */
    function laboratorioDeRelease(): { raiz: string; commit: string } {
      const raiz = mkdtempSync(join(tmpdir(), "valmen-release-"));
      mkdirSync(join(raiz, "docs", "tickets"), { recursive: true });
      spawnSync("git", ["init", "-q", "-b", "production", "."], { cwd: raiz });
      spawnSync("git", ["config", "user.email", "prueba@valmen.local"], { cwd: raiz });
      spawnSync("git", ["config", "user.name", "Prueba"], { cwd: raiz });

      writeFileSync(join(raiz, "app.txt"), "contenido\n");
      spawnSync("git", ["add", "."], { cwd: raiz });
      // Fechas fijas: el SHA de un commit depende de su marca de tiempo, y dos
      // laboratorios creados en segundos distintos producirían SHA distintos. Eso
      // haría fallar la comparación por una diferencia que no tiene nada que ver
      // con lo que se está probando: el commit que el ticket menciona.
      const cuando = { GIT_AUTHOR_DATE: "2026-09-21T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-21T00:00:00Z" };
      spawnSync("git", ["commit", "-q", "-m", "trabajo"], {
        cwd: raiz,
        env: { ...process.env, ...cuando },
      });
      const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" })
        .stdout.trim();

      // El índice tiene que existir **antes** de crear: la referencia comprueba
      // la ruta del índice al final de cada mutación, así que sin él hasta un
      // alta falla después de escribir el archivo.
      writeFileSync(join(raiz, "docs", "tickets", "index.md"), "# Índice de tickets\n");

      // Y la plantilla, que la referencia lee de su ruta del proyecto.
      mkdirSync(join(raiz, "docs", "agentic", "templates"), { recursive: true });
      writeFileSync(
        join(raiz, "docs", "agentic", "templates", "ticket.template.md"),
        readFileSync(plantillaDeReferencia(), "utf8"),
      );

      // El ticket, creado y cerrado con la referencia: es el sujeto que las dos
      // implementaciones van a publicar.
      const alta = referencia(raiz, [
        "create", "--id", TICKET, "--title", "El filtro no encuentra por número parcial",
        "--type", "BUGFIX", "--module", "POS", "--request", "No encuentra la orden.",
      ]);
      expect(alta.code, `alta con la referencia: ${alta.stderr}`).toBe(0);
      const ruta = join(raiz, "docs", "tickets", "2026", TICKET, "ticket.md");
      let texto = readFileSync(ruta, "utf8");
      texto = conSeccion(
        texto,
        "Plan",
        [
          "- Gate de plan y aprobación del PO: aprobado explícitamente por el PO (gate de plan).",
          "- Pasos ordenados:",
          "  1. Cambiar el `lookup_expr` del filtro de número a `icontains`.",
          "  2. Añadir una prueba de búsqueda parcial.",
          "  3. Verificar que el número exacto sigue encontrando.",
          "- Rollback: revertir el cambio de una línea.",
        ].join("\n"),
      );
      texto = conSeccion(
        texto,
        "Pruebas",
        "- Resultado comunicado por el PO: probado en la sucursal con el PO delante.",
      );
      texto = conSeccion(texto, "Implementación", `Commit ${commit}.`);
      writeFileSync(ruta, texto, "utf8");

      const pasos: readonly (readonly string[])[] = [
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "analyzed"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "planned"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "in_progress"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "awaiting_user_tests"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "in_qa"],
        ["qa-start", "--id", TICKET, "--environment", "staging",
          "--build-reference", `commit:${commit}`],
        ["qa-close", "--id", TICKET, "--result", "approved", "--po-confirmation", "PO"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "qa_approved"],
        ["close-attempt", "--id", TICKET, "--technical-summary", "T",
          "--functional-summary", "F", "--qa-status", "approved", "--release-impact", "R"],
        ["transition", "--id", TICKET, "--entity", "ticket", "--to", "closed"],
      ];
      for (const paso of pasos) {
        const resultado = referencia(raiz, paso as string[]);
        expect(resultado.code, `cierre con la referencia: ${paso[0]} ${paso[3] ?? ""}`).toBe(0);
      }

      // El tag se crea después del último commit, así que apunta al tip de
      // production: el commit documental del ticket no se hace, que es como
      // trabaja el flujo real.
      spawnSync("git", ["tag", "-a", "v6.3.0", "-m", "release"], { cwd: raiz });
      return { raiz, commit };
    }

    const args = ["release-publish", "--version", "6.3.0", "--tickets", TICKET];

    it("publica y deja el mismo ticket byte a byte", () => {
      const a = laboratorioDeRelease();
      const b = laboratorioDeRelease();
      try {
        const suyo = referencia(a.raiz, args);
        const mio = valmen(b.raiz, args);

        expect(mio.code, mio.stderr).toBe(suyo.code);
        expect(mio.stdout).toBe(suyo.stdout);
        expect(ticket(b.raiz)).toBe(ticket(a.raiz));
        expect(ticket(b.raiz)).toContain("release_status: released");
        expect(ticket(b.raiz)).toContain("target_release: 6.3.0");
        expect(ticket(b.raiz)).toContain("released_in: 6.3.0");
      } finally {
        rmSync(a.raiz, { recursive: true, force: true });
        rmSync(b.raiz, { recursive: true, force: true });
      }
    });

    it("sin tag anotado se rechaza igual, y no escribe nada", () => {
      const a = laboratorioDeRelease();
      const b = laboratorioDeRelease();
      try {
        for (const raiz of [a.raiz, b.raiz]) {
          spawnSync("git", ["tag", "-d", "v6.3.0"], { cwd: raiz });
          spawnSync("git", ["tag", "v6.3.0"], { cwd: raiz });
        }
        const antes = ticket(b.raiz);

        const suyo = referencia(a.raiz, args);
        const mio = valmen(b.raiz, args);

        expect(mio.code, mio.stderr).toBe(suyo.code);
        expect(mio.code).toBe(5);
        expect(mio.stderr).toBe(suyo.stderr);
        expect(ticket(b.raiz)).toBe(antes);
      } finally {
        rmSync(a.raiz, { recursive: true, force: true });
        rmSync(b.raiz, { recursive: true, force: true });
      }
    });

    it("una versión con prefijo `v` se rechaza igual", () => {
      const a = laboratorioDeRelease();
      const b = laboratorioDeRelease();
      try {
        const malo = ["release-publish", "--version", "v6.3.0", "--tickets", TICKET];
        const suyo = referencia(a.raiz, malo);
        const mio = valmen(b.raiz, malo);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stderr).toBe(suyo.stderr);
      } finally {
        rmSync(a.raiz, { recursive: true, force: true });
        rmSync(b.raiz, { recursive: true, force: true });
      }
    });

    it("una lista con IDs duplicados se rechaza igual", () => {
      const a = laboratorioDeRelease();
      const b = laboratorioDeRelease();
      try {
        const malo = [
          "release-publish", "--version", "6.3.0",
          "--tickets", `${TICKET},${TICKET}`,
        ];
        const suyo = referencia(a.raiz, malo);
        const mio = valmen(b.raiz, malo);
        expect(mio.code).toBe(suyo.code);
        expect(mio.stderr).toBe(suyo.stderr);
      } finally {
        rmSync(a.raiz, { recursive: true, force: true });
        rmSync(b.raiz, { recursive: true, force: true });
      }
    });

    it("un ticket cuya implementación no está en el tag se rechaza igual", () => {
      const a = laboratorioDeRelease();
      const b = laboratorioDeRelease();
      try {
        // Un commit que existe pero no es ancestro del tag: se avanza production
        // después de etiquetar, así que el tag deja de apuntar al tip.
        for (const raiz of [a.raiz, b.raiz]) {
          writeFileSync(join(raiz, "otro.txt"), "más trabajo\n");
          spawnSync("git", ["add", "."], { cwd: raiz });
          spawnSync("git", ["commit", "-q", "-m", "trabajo posterior"], { cwd: raiz });
        }
        const antes = ticket(b.raiz);

        const suyo = referencia(a.raiz, args);
        const mio = valmen(b.raiz, args);

        expect(mio.code, mio.stderr).toBe(suyo.code);
        expect(mio.code).toBe(5);
        expect(mio.stderr).toBe(suyo.stderr);
        expect(ticket(b.raiz)).toBe(antes);
      } finally {
        rmSync(a.raiz, { recursive: true, force: true });
        rmSync(b.raiz, { recursive: true, force: true });
      }
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
