/**
 * El recibo de `qa-mechanical` queda atado al árbol que se probó (R-REV-001).
 *
 * Lo que protege: hasta ahora el recibo decía «los criterios pasaron sobre este texto del
 * ticket» y la entrega solo comparaba ese texto, así que un archivo funcional editado después
 * de la compuerta llegaba a la persona como si lo probado fuera lo entregado. Reproducido con
 * un laboratorio git: compuerta en verde, `suma.mjs` pasa de `a + b` a `a - b`, y la entrega a
 * `awaiting_user_tests` se aceptaba.
 *
 * Lo que se afirma acá es lo observable: el recibo guarda `testedTree`, la entrega rechaza un
 * árbol distinto y nombra la compuerta a repetir, y lo que no es del código —el propio registro,
 * un commit del mismo contenido, un proyecto sin git, un recibo de antes de este campo— no se
 * trata como un cambio de código.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { computeNextStep, renderNextStep } from "../packages/engine/src/next-step.js";
import { appendReceipt, readReceipts } from "../packages/engine/src/receipts.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { transition } from "../packages/engine/src/transition.js";
import { type GateReceipt, hashState } from "../packages/gate/src/receipt.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-ARBOL-PROBADO-20261010";
const REPETIR = `valmen gate qa-mechanical --id ${TICKET} --evaluator command`;
const RECIBO_REAL = join(
  import.meta.dirname,
  "fixtures",
  "recibo-qa-mechanical-sin-arbol.jsonl",
);

let lab: string;
const PATHS = () => ({ root: lab, ticketsDir: "tickets" });

const pasa = 'node -e "process.exit(0)"';
const escribeUnArchivo = `node -e "require('fs').writeFileSync('generado.txt','x')"`;

function git(...argumentos: string[]): string {
  const resultado = spawnSync("git", argumentos, { cwd: lab, encoding: "utf8" });
  if (resultado.status !== 0)
    throw new Error(`git ${argumentos.join(" ")}: ${resultado.stderr}`);
  return resultado.stdout.trim();
}

function escribir(ruta: string, contenido: string): void {
  mkdirSync(dirname(join(lab, ruta)), { recursive: true });
  writeFileSync(join(lab, ruta), contenido, "utf8");
}

const rutaDelTicket = () => join(lab, "tickets", "2026", TICKET, "ticket.md");
const textoDelTicket = () => readFileSync(rutaDelTicket(), "utf8");

/** Commitea todo lo que haya en el laboratorio: es el laboratorio quien puede, no el motor. */
function commitear(mensaje: string): void {
  git("add", ".");
  git("commit", "-qm", mensaje);
}

/** Un ticket en `in_progress` con un criterio que declara su test, en un laboratorio con o sin git. */
function armar(opciones: { conGit?: boolean; criterio?: string } = {}): void {
  const { conGit = true, criterio = pasa } = opciones;
  escribir("src/suma.mjs", "export const suma = (a, b) => a + b;\n");
  escribir(".valmen/config.yaml", "name: Laboratorio\ntest-commands:\n  - node\n");
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "in_progress",
    criterios: `- [ ] La suma funciona.\n      <!-- test: ${criterio} -->`,
    pruebas:
      '- Comando: `node -e "process.exit(0)"`, directorio: la raíz del laboratorio.\n' +
      "- Resultado esperado: sale con 0.",
  });
  if (!conGit) return;
  git("init", "-q");
  git("config", "user.email", "prueba@valmen.local");
  git("config", "user.name", "Prueba Valmen");
  commitear("inicial");
}

const correr = () => runGate(PATHS(), { gateId: "qa-mechanical", ticketId: TICKET });

function ultimoRecibo(): GateReceipt {
  const recibos = readReceipts(PATHS(), TICKET).filter((r) => r.gate === "qa-mechanical");
  const ultimo = recibos[recibos.length - 1];
  if (ultimo === undefined)
    throw new Error("el laboratorio no tiene recibo de qa-mechanical");
  return ultimo;
}

const entregar = () =>
  transition({
    paths: PATHS(),
    ticketId: TICKET,
    entity: "ticket",
    to: "awaiting_user_tests",
  });

/** El mensaje con el que la entrega rechaza, o `null` si la acepta. */
function motivoDeRechazo(): string | null {
  try {
    entregar();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-arbol-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el recibo de qa-mechanical guarda el árbol probado", () => {
  it("en un repositorio git, el hash tiene la forma sha256:<64 hex> (C1)", async () => {
    armar();

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    expect(ultimoRecibo().testedTree?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("head es el commit de HEAD al correr la compuerta (C2)", async () => {
    armar();
    const head = git("rev-parse", "HEAD");

    await correr();

    expect(ultimoRecibo().testedTree?.head).toBe(head);
  });

  it("sin cambios funcionales sin commitear, commitTree es el tree de ese commit (C3)", async () => {
    armar();

    await correr();

    expect(ultimoRecibo().testedTree?.commitTree).toBe(git("rev-parse", "HEAD^{tree}"));
  });

  it("con un cambio funcional sin commitear, commitTree es null (C4)", async () => {
    armar();
    escribir("src/suma.mjs", "export const suma = (a, b) => a + b + 0;\n");

    await correr();

    expect(ultimoRecibo().testedTree?.commitTree).toBeNull();
  });

  it("cuenta los archivos funcionales que entraron al árbol", async () => {
    armar();

    await correr();

    // `src/suma.mjs`: el registro (`tickets/` y `.valmen/`) no entra.
    expect(ultimoRecibo().testedTree?.files).toBe(1);
  });

  it("la salida de la compuerta muestra el árbol probado (C18)", async () => {
    armar();

    const resultado = await correr();

    expect(resultado.stdout).toContain("árbol probado");
    expect(resultado.stdout).toContain(
      ultimoRecibo().testedTree?.hash.slice(0, 23) ?? "sin recibo",
    );
  });

  it("si los comandos cambian un archivo funcional, el recibo anota la ruta (C17)", async () => {
    armar({ criterio: escribeUnArchivo });

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    const notas = (ultimoRecibo().notes ?? []).join("\n");
    expect(notas).toContain("generado.txt");
    // El recibo guarda el árbol de antes de correr, así que la entrega con él no vale.
    expect(motivoDeRechazo()).toMatch(/El árbol de trabajo cambió/);
  });

  it("sigue aprobando y entregando cuando el árbol no cambió (regresión de runGate y transition)", async () => {
    armar();
    const largoDelTicket = textoDelTicket().length;

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("APPROVE");
    // `subject.revision` sigue siendo el largo del texto: lo firma la aprobación a distancia.
    expect(ultimoRecibo().subject.revision).toBe(String(largoDelTicket));
    // La entrega corre bajo el lock de mutación, que deja `.valmen.lock` en la raíz mientras
    // comprueba: ese archivo es del motor y no cuenta como un cambio de código.
    expect(motivoDeRechazo()).toBeNull();
  });
});

describe("la entrega rechaza un árbol que no es el que se probó", () => {
  it("un archivo funcional editado después del recibo rechaza la entrega (C5)", async () => {
    armar();
    await correr();
    escribir("src/suma.mjs", "export const suma = (a, b) => a - b;\n");

    expect(() => entregar()).toThrow(/árbol/);
  });

  it("dice que el árbol cambió desde el recibo (C6)", async () => {
    armar();
    await correr();
    escribir("src/suma.mjs", "export const suma = (a, b) => a - b;\n");

    const motivo = motivoDeRechazo() ?? "";

    expect(motivo).toContain("El árbol de trabajo cambió desde la verificación mecánica");
    expect(motivo).toContain(ultimoRecibo().id);
  });

  it("nombra la compuerta a repetir con valmen gate qa-mechanical --id <ID> (C7)", async () => {
    armar();
    await correr();
    escribir("src/suma.mjs", "export const suma = (a, b) => a - b;\n");

    expect(motivoDeRechazo()).toContain(REPETIR);
  });

  it("un archivo funcional nuevo sin versionar rechaza la entrega (C8)", async () => {
    armar();
    await correr();
    escribir("src/resta.mjs", "export const resta = (a, b) => a - b;\n");

    expect(motivoDeRechazo()).toContain("El árbol de trabajo cambió");
  });

  it("un archivo funcional borrado rechaza la entrega (C9)", async () => {
    armar();
    await correr();
    unlinkSync(join(lab, "src", "suma.mjs"));

    expect(motivoDeRechazo()).toContain("El árbol de trabajo cambió");
  });

  it("un cambio en tickets/ después del recibo no rechaza la entrega (C10)", async () => {
    armar();
    await correr();
    writeFileSync(
      rutaDelTicket(),
      textoDelTicket().replace(
        "- Resultado esperado: sale con 0.",
        "- Resultado esperado: sale con 0.\n- Nota agregada después del recibo.",
      ),
      "utf8",
    );
    escribir("tickets/index.md", "# Índice regenerado después del recibo\n");

    expect(motivoDeRechazo()).toBeNull();
  });

  it("un cambio en .valmen/ después del recibo no rechaza la entrega (C11)", async () => {
    armar();
    await correr();
    escribir(
      ".valmen/config.yaml",
      "name: Laboratorio\ntest-commands:\n  - node\n# Ajuste posterior.\n",
    );
    escribir(".valmen/estado-del-harness.json", "{}\n");

    expect(motivoDeRechazo()).toBeNull();
  });

  it("commitear después del recibo el mismo contenido probado no rechaza la entrega (C12)", async () => {
    armar();
    // Lo que se prueba está sin commitear —el caso normal: el commit va después—.
    escribir("src/suma.mjs", "export const suma = (a, b) => a + b + 0;\n");
    await correr();
    expect(ultimoRecibo().testedTree?.commitTree).toBeNull();

    commitear("lo probado");

    expect(motivoDeRechazo()).toBeNull();
  });
});

describe("un recibo de antes de este campo", () => {
  it("un recibo real sin testedTree se sigue leyendo con readReceipts (C13)", () => {
    mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
    copyFileSync(RECIBO_REAL, join(lab, ".valmen", "receipts", `${TICKET}.jsonl`));

    const recibos = readReceipts(PATHS(), TICKET);

    expect(recibos).toHaveLength(1);
    expect(recibos[0]?.gate).toBe("qa-mechanical");
    expect(recibos[0]?.outcome).toBe("approve");
    expect(recibos[0]).not.toHaveProperty("testedTree");
  });

  it("en un repositorio git, la entrega con él se rechaza pidiendo repetir la compuerta (C14)", () => {
    armar();
    const real = JSON.parse(
      readFileSync(RECIBO_REAL, "utf8").split("\n")[0] ?? "",
    ) as GateReceipt;
    // El mismo recibo, atado en memoria a este ticket y a su texto actual: lo único que le falta
    // para valer es el árbol.
    const vigente: GateReceipt = {
      ...real,
      subject: { ...real.subject, id: TICKET },
      stateHash: hashState(buildGateState(textoDelTicket())),
    };
    appendReceipt(PATHS(), TICKET, vigente);

    const motivo = motivoDeRechazo() ?? "";

    expect(motivo).toContain("no guarda el árbol");
    expect(motivo).toContain(REPETIR);
  });

  it("en un proyecto sin git, el recibo vigente por el texto del ticket se acepta (C15)", async () => {
    armar({ conGit: false });

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    const recibo = ultimoRecibo();
    expect(recibo.testedTree).toBeUndefined();
    // Sin árbol que calcular el recibo lo dice, para que no parezca un olvido.
    expect((recibo.notes ?? []).join("\n")).toContain("no es un repositorio git");
    expect(motivoDeRechazo()).toBeNull();
  });
});

describe("el siguiente paso dice lo mismo que la entrega", () => {
  const siguiente = () =>
    renderNextStep(
      computeNextStep(
        PATHS(),
        parseTicket(textoDelTicket()),
        readReceipts(PATHS(), TICKET),
      ),
    ).join("\n");

  it("con el árbol cambiado, in_progress indica volver a correr qa-mechanical (C16)", async () => {
    armar();
    await correr();
    escribir("src/suma.mjs", "export const suma = (a, b) => a - b;\n");

    const texto = siguiente();

    expect(texto).toContain("El árbol de trabajo cambió desde la verificación mecánica");
    expect(texto).toContain(REPETIR);
  });

  it("con el árbol sin cambios, in_progress indica entregar (regresión de computeNextStep)", async () => {
    armar();
    await correr();

    const texto = siguiente();

    expect(texto).toContain("pasó sobre el estado actual");
    expect(texto).not.toContain("El árbol de trabajo cambió");
  });
});
