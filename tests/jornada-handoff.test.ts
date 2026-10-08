/**
 * `valmen journey handoff`: el parte final de la corrida (C1–C25).
 *
 * Todo corre sobre un registro temporal con un canal falso: nada sale a la red.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { journeyHandoffCommand } from "../packages/cli/src/journey-handoff.js";
import { avisarParteDeJornada } from "../packages/cli/src/hermes.js";
import { EXIT_INVARIANT, EXIT_OK, EXIT_SCHEMA } from "../packages/core/src/index.js";
import {
  type CommandRunner,
  armarParteDeJornada,
  guardarParteDeJornada,
  leerPartesDeJornada,
  partesDeJornadaAvisados,
  readApprovalLog,
  renderJourneyHandoffNotification,
} from "../packages/engine/src/index.js";
import { USAGE, VALUE_OPTIONS } from "../packages/cli/src/main.js";
import { crearEntornoOla, crearJornada, enJornada, fotoDelArbol, ticketEn, type EntornoOla } from "./helpers/ola.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const JORNADA = "JOR-20261008";
const A = "FEATURE-HANDOFF-ALFA-20261008";
const B = "FEATURE-HANDOFF-BETA-20261008";
const C = "FEATURE-HANDOFF-GAMA-20261008";
const D = "FEATURE-HANDOFF-DELTA-20261008";
const POLITICA = "FEATURE-HANDOFF-POLITICA-20261008";
const PERSONA = "FEATURE-HANDOFF-PERSONA-20261008";
const AJENO = "FEATURE-HANDOFF-AJENO-20261008";
const SIN_CONTRATO = "FEATURE-HANDOFF-PENDIENTE-20261008";
const CON_SECRETO = "FEATURE-HANDOFF-SECRETO-20261008";
const AHORA = () => new Date("2026-10-08T18:00:00.000Z");
const HASH = `sha256:${"a".repeat(64)}`;

const CONTRATO_A = [
  "Contrato de pruebas:",
  "",
  "- Directorio: raíz del worktree del ticket, con `node_modules`.",
  "- `npx vitest run tests/alfa.test.ts`: todas las pruebas pasan.",
  "  Resultado obtenido: 12 pruebas pasadas.",
  "- `npx tsc --noEmit -p tsconfig.json`: sin salida.",
  "- Validación manual: abrir la pantalla de alfa y comprobar el total.",
  "- Manual: revisar el aviso en el celular.",
  "- No se corrió la suite completa (`npx vitest run`): la corre el orquestador.",
].join("\n");

let entorno: EntornoOla;

beforeEach(() => {
  entorno = crearEntornoOla();
});
afterEach(() => entorno.limpiar());

function conContrato(id: string, contrato: string, estado = "awaiting_user_tests"): void {
  ticketEn(entorno.root, id, estado);
  const ruta = join(entorno.root, "tickets", id.slice(-8, -4), id, "ticket.md");
  writeFileSync(ruta, readFileSync(ruta, "utf8").replace("Resultado del PO: aprobado.", contrato), "utf8");
}

function cerrarPorPolitica(id: string, estado: "qa_approved" | "closed"): void {
  ticketEn(entorno.root, id, estado);
  const ruta = join(entorno.root, "tickets", id.slice(-8, -4), id, "ticket.md");
  writeFileSync(
    ruta,
    readFileSync(ruta, "utf8").replace("aprobado por pruebas", `policy:QAA-20261008-abc123:${HASH}|recibo:.valmen/qa/agent-receipts.jsonl:1`),
    "utf8",
  );
}

/** La jornada de la corrida: alfa y beta esperan pruebas, una cerró por política, otra por una persona y una sigue en curso. */
function armarCorrida(): void {
  conContrato(A, CONTRATO_A);
  conContrato(B, "- Ejecutar `npm test`; esperado: pasa.");
  cerrarPorPolitica(POLITICA, "closed");
  ticketEn(entorno.root, PERSONA, "closed");
  ticketEn(entorno.root, C, "in_progress");
  conContrato(AJENO, "- Ejecutar `npm run ajeno`; esperado: pasa.");
  crearJornada(
    entorno,
    [enJornada(A, 1), enJornada(B, 2), enJornada(POLITICA, 3), enJornada(PERSONA, 4), enJornada(C, 5)],
    { journeyId: JORNADA },
  );
}

const parte = () => armarParteDeJornada({ project: entorno.project(), journeyId: JORNADA, ahora: AHORA });
const handoffsPath = () => join(entorno.root, ".valmen", "journeys", "handoffs.jsonl");
const lineasGuardadas = (): string[] =>
  existsSync(handoffsPath()) ? readFileSync(handoffsPath(), "utf8").split("\n").filter((l) => l.trim() !== "") : [];

function canal(falla = false): { runner: CommandRunner; llamadas: { args: readonly string[]; cuerpo: string }[] } {
  const llamadas: { args: readonly string[]; cuerpo: string }[] = [];
  const runner: CommandRunner = (_c, args, input) => {
    llamadas.push({ args, cuerpo: input });
    return falla
      ? { status: 1, stdout: "", stderr: "canal caído", failed: false }
      : { status: 0, stdout: "{}", stderr: "", failed: false };
  };
  return { runner, llamadas };
}

const correr = (flags: Record<string, string | true>, extra: { runner?: CommandRunner } = {}) =>
  journeyHandoffCommand(flags, { home: entorno.home, root: entorno.root, ahora: AHORA, ...extra });

describe("armar el parte", () => {
  it("C1: incluye id, título y ruta de cada ticket que espera pruebas, en el orden de la jornada", () => {
    armarCorrida();
    const p = parte();
    expect(p.esperanPruebas.map((e) => e.ticketId)).toEqual([A, B]);
    expect(p.esperanPruebas[0]?.title).toBeTruthy();
    expect(p.esperanPruebas[0]?.ruta).toBe(`tickets/2026/${A}/ticket.md`);
  });

  it("C2: lleva los comandos con su resultado esperado y las líneas sangradas unidas; un contrato sin credenciales sí se incluye", () => {
    armarCorrida();
    const a = parte().esperanPruebas[0];
    expect(a?.probar).toEqual([
      "`npx vitest run tests/alfa.test.ts`: todas las pruebas pasan. Resultado obtenido: 12 pruebas pasadas.",
      "`npx tsc --noEmit -p tsconfig.json`: sin salida.",
    ]);
    expect(a?.omitidoPorSecreto).toEqual([]);
  });

  it("C3: lleva el directorio de ejecución del contrato y no lo toma por un comando", () => {
    armarCorrida();
    const a = parte().esperanPruebas[0];
    expect(a?.directorio).toBe("raíz del worktree del ticket, con `node_modules`.");
    expect(a?.probar.some((l) => l.includes("node_modules"))).toBe(false);
  });

  it("C4: lleva las validaciones manuales", () => {
    armarCorrida();
    expect(parte().esperanPruebas[0]?.manuales).toEqual([
      "Validación manual: abrir la pantalla de alfa y comprobar el total.",
      "Manual: revisar el aviso en el celular.",
    ]);
  });

  it("C5: un contrato pendiente sale marcado sin contrato y sin comandos inventados", () => {
    ticketEn(entorno.root, SIN_CONTRATO, "awaiting_user_tests");
    const ruta = join(entorno.root, "tickets", "2026", SIN_CONTRATO, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("Resultado del PO: aprobado.", "Pendiente de ejecución."), "utf8");
    crearJornada(entorno, [enJornada(SIN_CONTRATO, 1)], { journeyId: JORNADA });
    const entrada = parte().esperanPruebas[0];
    expect(entrada?.sinContrato).toBe(true);
    expect(entrada?.probar).toEqual([]);
    expect(entrada?.manuales).toEqual([]);
  });

  it("C6: un ticket cerrado por política sale marcado con la autorización y el recibo (qa_approved y closed)", () => {
    cerrarPorPolitica(POLITICA, "closed");
    cerrarPorPolitica(D, "qa_approved");
    crearJornada(entorno, [enJornada(POLITICA, 1), enJornada(D, 2)], { journeyId: JORNADA });
    const p = parte();
    expect(p.cerradosPorPolitica.map((c) => c.ticketId)).toEqual([POLITICA, D]);
    expect(p.cerradosPorPolitica[0]).toMatchObject({
      autorizacion: "QAA-20261008-abc123",
      recibo: ".valmen/qa/agent-receipts.jsonl:1",
    });
  });

  it("C7: un ticket cerrado con la confirmación de una persona no es un cierre por política", () => {
    armarCorrida();
    const p = parte();
    expect(p.cerradosPorPolitica.map((c) => c.ticketId)).toEqual([POLITICA]);
    expect(p.cerradosPorPolitica.some((c) => c.ticketId === PERSONA)).toBe(false);
  });

  it("C8: un ticket en pruebas que no es de la jornada no aparece en ningún bloque", () => {
    armarCorrida();
    const p = parte();
    const todos = [...p.esperanPruebas.map((e) => e.ticketId), ...p.cerradosPorPolitica.map((c) => c.ticketId), ...p.sinEntregar.map((s) => s.ticketId)];
    expect(todos).not.toContain(AJENO);
  });

  it("C9: lo que todavía no se entregó sale en «sin entregar» con su estado, y un ticket ilegible no tumba el parte", () => {
    armarCorrida();
    crearJornada(
      entorno,
      [enJornada(A, 1), enJornada(C, 2), enJornada("FEATURE-HANDOFF-FANTASMA-20261008", 3)],
      { journeyId: "JOR-20261009" },
    );
    const p = armarParteDeJornada({ project: entorno.project(), journeyId: "JOR-20261009", ahora: AHORA });
    expect(p.sinEntregar).toEqual([
      { ticketId: C, estado: "in_progress" },
      { ticketId: "FEATURE-HANDOFF-FANTASMA-20261008", estado: "?" },
    ]);
    expect(p.esperanPruebas.map((e) => e.ticketId)).toEqual([A]);
  });

  it("C10: un contrato con una credencial se omite, con el tipo de hallazgo y sin copiar el valor", () => {
    const valor = "AKIAIOSFODNN7EXAMPLE"; // valmen:allow-secret clave de ejemplo de la documentación de AWS
    conContrato(CON_SECRETO, `- Ejecutar \`npm test\` con la clave ${valor}; esperado: pasa.`);
    conContrato(A, CONTRATO_A);
    crearJornada(entorno, [enJornada(A, 1), enJornada(CON_SECRETO, 2)], { journeyId: JORNADA });
    const p = parte();
    const secreta = p.esperanPruebas.find((e) => e.ticketId === CON_SECRETO);
    expect(secreta?.probar).toEqual([]);
    expect(secreta?.omitidoPorSecreto.length).toBeGreaterThan(0);
    const texto = renderJourneyHandoffNotification(p, { maxCaracteres: Number.POSITIVE_INFINITY }).body;
    expect(texto).toContain("contrato omitido");
    expect(texto).not.toContain(valor);
    expect(JSON.stringify(p)).not.toContain(valor);
    // Control: el ticket sin credenciales sigue con su contrato.
    expect(p.esperanPruebas.find((e) => e.ticketId === A)?.probar).toHaveLength(2);
  });

  it("C11: una jornada que no existe falla nombrándola y no escribe nada", () => {
    armarCorrida();
    const antes = fotoDelArbol(entorno.root);
    expect(() => armarParteDeJornada({ project: entorno.project(), journeyId: "JOR-20990101" })).toThrow(/JOR-20990101/);
    const r = correr({ id: "JOR-20990101" });
    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(r.stderr).toContain("JOR-20990101");
    expect(fotoDelArbol(entorno.root)).toEqual(antes);
    expect(lineasGuardadas()).toEqual([]);
  });
});

describe("guardar el parte", () => {
  it("C12: el comando guarda una línea con el id de la jornada y la huella", () => {
    armarCorrida();
    const r = correr({ id: JORNADA });
    expect(r.exitCode).toBe(EXIT_OK);
    const lineas = lineasGuardadas();
    expect(lineas).toHaveLength(1);
    const registro = JSON.parse(lineas[0] as string);
    expect(registro).toMatchObject({ kind: "journey-handoff", version: 1, journeyId: JORNADA });
    expect(registro.huella).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(registro.parte.esperanPruebas).toHaveLength(2);
    expect(r.stdout).toContain(A);
    expect(r.stdout).toContain("npx vitest run tests/alfa.test.ts");
  });

  it("C13: repetir sin cambios no añade otra línea, aunque cambie la hora", () => {
    armarCorrida();
    correr({ id: JORNADA });
    journeyHandoffCommand({ id: JORNADA }, { home: entorno.home, root: entorno.root, ahora: () => new Date("2026-10-08T23:00:00.000Z") });
    expect(lineasGuardadas()).toHaveLength(1);
  });

  it("C14: un cambio de estado añade una línea nueva y deja la anterior intacta", () => {
    armarCorrida();
    correr({ id: JORNADA });
    const primera = lineasGuardadas()[0];
    const ruta = join(entorno.root, "tickets", "2026", C, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("workflow_status: in_progress", "workflow_status: blocked"), "utf8");
    correr({ id: JORNADA });
    const lineas = lineasGuardadas();
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe(primera);
    expect(leerPartesDeJornada(entorno.root, JORNADA)).toHaveLength(2);
  });

  it("leer ignora una línea ilegible y filtra por jornada", () => {
    armarCorrida();
    correr({ id: JORNADA });
    writeFileSync(handoffsPath(), `${readFileSync(handoffsPath(), "utf8")}{roto\n`, "utf8");
    expect(leerPartesDeJornada(entorno.root)).toHaveLength(1);
    expect(leerPartesDeJornada(entorno.root, "JOR-20990101")).toHaveLength(0);
  });

  it("C15: --saved imprime el último guardado sin escribir nada", () => {
    armarCorrida();
    correr({ id: JORNADA });
    const antes = fotoDelArbol(entorno.root);
    const r = correr({ id: JORNADA, saved: true });
    expect(r.exitCode).toBe(EXIT_OK);
    expect(r.stdout).toContain(A);
    expect(fotoDelArbol(entorno.root)).toEqual(antes);
  });

  it("--saved sin nada guardado falla y no escribe", () => {
    armarCorrida();
    const r = correr({ id: JORNADA, saved: true });
    expect(r.exitCode).toBe(EXIT_INVARIANT);
    expect(lineasGuardadas()).toEqual([]);
  });

  it("C16: los ticket.md y events.jsonl quedan byte a byte iguales", () => {
    armarCorrida();
    const leer = () => ({
      eventos: readFileSync(join(entorno.root, ".valmen", "journeys", "events.jsonl"), "utf8"),
      tickets: Object.fromEntries(Object.entries(fotoDelArbol(join(entorno.root, "tickets"))).filter(([k]) => k.endsWith("ticket.md"))),
    });
    const antes = leer();
    correr({ id: JORNADA });
    correr({ id: JORNADA, to: "telegram:1", }, { runner: canal().runner });
    expect(leer()).toEqual(antes);
  });
});

describe("enviar el parte", () => {
  it("C17: sin --to no se invoca ningún canal", () => {
    armarCorrida();
    const { runner, llamadas } = canal();
    correr({ id: JORNADA }, { runner });
    expect(llamadas).toHaveLength(0);
  });

  it("C18: con --to sale una vez por hermes send hacia ese destino y se anota el aviso", () => {
    armarCorrida();
    const { runner, llamadas } = canal();
    const r = correr({ id: JORNADA, to: "telegram:42" }, { runner });
    expect(r.exitCode).toBe(EXIT_OK);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.args.slice(0, 3)).toEqual(["send", "--to", "telegram:42"]);
    expect(llamadas[0]?.cuerpo).toContain(A);
    const avisos = readApprovalLog({ root: entorno.root, ticketsDir: "tickets" }).filter((e) => e.kind === "journey-handoff-notice");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ journeyId: JORNADA });
    expect(r.stdout).toContain("enviado");
  });

  it("C19: repetir el envío con el mismo contenido no reenvía y lo dice", () => {
    armarCorrida();
    const { runner, llamadas } = canal();
    correr({ id: JORNADA, to: "telegram:42" }, { runner });
    const r = correr({ id: JORNADA, to: "telegram:42" }, { runner });
    expect(llamadas).toHaveLength(1);
    expect(r.stdout).toContain("ya estaba enviado");
    expect(partesDeJornadaAvisados({ root: entorno.root, ticketsDir: "tickets" }).size).toBe(1);
  });

  it("C20: si el canal falla el parte queda guardado, no se anota, se dice que no se envió y el reintento sano lo envía", () => {
    armarCorrida();
    const roto = canal(true);
    const r = correr({ id: JORNADA, to: "telegram:42" }, { runner: roto.runner });
    expect(r.exitCode).toBe(EXIT_OK);
    expect(r.stdout).toContain("NO se envió");
    expect(r.stdout).toContain("canal caído");
    expect(lineasGuardadas()).toHaveLength(1);
    expect(readApprovalLog({ root: entorno.root, ticketsDir: "tickets" }).filter((e) => e.kind === "journey-handoff-notice")).toHaveLength(0);

    const sano = canal();
    correr({ id: JORNADA, to: "telegram:42" }, { runner: sano.runner });
    expect(sano.llamadas).toHaveLength(1);
    expect(lineasGuardadas()).toHaveLength(1);
  });

  it("C21: el cuerpo no pasa de 3500 caracteres y, al recortar, dice cuántos tickets quedaron fuera", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `FEATURE-HANDOFF-MASIVO${String(i).padStart(2, "0")}-20261008`);
    for (const id of ids) {
      conContrato(id, [`- Directorio: raíz.`, `- \`npx vitest run tests/${id}.test.ts\`: ${"pasa con un resultado esperado largo ".repeat(4)}`].join("\n"));
    }
    crearJornada(entorno, ids.map((id, i) => enJornada(id, i + 1)), { journeyId: JORNADA });
    const { runner, llamadas } = canal();
    correr({ id: JORNADA, to: "telegram:42" }, { runner });
    const cuerpo = llamadas[0]?.cuerpo ?? "";
    expect(cuerpo.length).toBeLessThanOrEqual(3500);
    const incluidos = ids.filter((id) => cuerpo.includes(id)).length;
    expect(incluidos).toBeGreaterThan(0);
    expect(incluidos).toBeLessThan(12);
    expect(cuerpo).toContain(`… y ${12 - incluidos} más`);
    expect(cuerpo).toContain("journey handoff --id");
    // Recorta por tickets completos: ningún ticket queda a medias.
    for (const id of ids.slice(0, incluidos)) expect(cuerpo).toContain(`${id}.test.ts`);
    // El parte completo impreso y guardado conserva todos.
    const impreso = correr({ id: JORNADA, saved: true }).stdout;
    for (const id of ids) expect(impreso).toContain(id);
    // Control: sin recorte no hay «y N más».
    const corto = renderJourneyHandoffNotification(parte(), { maxCaracteres: Number.POSITIVE_INFINITY }).body;
    expect(corto).not.toContain("más");
  });

  it("C22: el aviso dice que no aprueba nada ni cierra ningún ticket", () => {
    armarCorrida();
    const { body } = renderJourneyHandoffNotification(parte());
    expect(body).toContain("no aprueba nada ni cierra ningún ticket");
    expect(body.trimEnd().endsWith("no aprueba nada ni cierra ningún ticket.")).toBe(true);
  });

  it("C23: --saved junto con --to se rechaza sin enviar ni escribir", () => {
    armarCorrida();
    const { runner, llamadas } = canal();
    const antes = fotoDelArbol(entorno.root);
    const r = correr({ id: JORNADA, saved: true, to: "telegram:42" }, { runner });
    expect(r.exitCode).toBe(EXIT_SCHEMA);
    expect(llamadas).toHaveLength(0);
    expect(fotoDelArbol(entorno.root)).toEqual(antes);
  });

  it("avisarParteDeJornada: sin red, devuelve ya-enviado con la huella anotada", () => {
    armarCorrida();
    const p = parte();
    const paths = { root: entorno.root, ticketsDir: "tickets" };
    const { runner } = canal();
    const uno = avisarParteDeJornada({ paths, parte: p, to: "telegram:42", now: AHORA(), runner });
    const dos = avisarParteDeJornada({ paths, parte: p, to: "telegram:42", now: AHORA(), runner });
    expect([uno.estado, dos.estado]).toEqual(["enviado", "ya-enviado"]);
  });
});

describe("el comando", () => {
  it("C24: sin --id (o con uno que no es de jornada) falla con el código de uso y muestra cómo se invoca", () => {
    for (const flags of [{}, { id: true }, { id: A }, { id: "DEL-20261008-1" }]) {
      const r = correr(flags as Record<string, string | true>);
      expect(r.exitCode).toBe(EXIT_SCHEMA);
      expect(r.stderr).toContain("journey handoff --id <jornada> [--project <id>] [--to <destino>] [--saved]");
    }
  });

  it("C25: sin --project el proyecto sale del project-id de .valmen/config.yaml", () => {
    armarCorrida();
    const r = correr({ id: JORNADA });
    expect(r.exitCode).toBe(EXIT_OK);
    // Con --project explícito se obtiene lo mismo.
    const explicito = correr({ id: JORNADA, project: "ola-lab" });
    expect(explicito.stdout.split("Este aviso")[0]).toBe(r.stdout.split("Este aviso")[0]);
    // Control: sin project-id ni --project falla.
    writeFileSync(join(entorno.root, ".valmen", "config.yaml"), "name: x\n", "utf8");
    expect(correr({ id: JORNADA }).exitCode).toBe(EXIT_SCHEMA);
  });

  it("C26: la ayuda documenta journey handoff y sus banderas con valor están declaradas", () => {
    expect(USAGE).toContain("journey handoff --id");
    for (const bandera of ["--id", "--to", "--project"]) expect(VALUE_OPTIONS).toContain(bandera);
    expect(VALUE_OPTIONS).not.toContain("--saved");
  });
});

describe("barreras", () => {
  it("guardar dos veces el mismo parte desde el motor tampoco duplica", () => {
    armarCorrida();
    const p = parte();
    expect(guardarParteDeJornada({ project: entorno.project(), parte: p }).guardado).toBe(true);
    expect(guardarParteDeJornada({ project: entorno.project(), parte: p }).guardado).toBe(false);
    expect(lineasGuardadas()).toHaveLength(1);
  });

  it("un ticket de prueba suelto no cambia el parte de otra jornada", () => {
    writeFixtureTicket(entorno.root, { id: AJENO, workflowStatus: "intake" });
    crearJornada(entorno, [enJornada(A, 1)], { journeyId: JORNADA });
    expect(parte().sinEntregar).toEqual([{ ticketId: A, estado: "?" }]);
  });
});
