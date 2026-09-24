/**
 * El gate mecánico: lo que ya está escrito no se pregunta.
 *
 * Protege el paso de «implementado» a «listo para que lo pruebe el PO», y lo que
 * se afirma acá es lo que lo hace valer: que corra de verdad los criterios que
 * declaran su test, que no corra nada que el proyecto no haya autorizado, y que la
 * entrega **no pase** sin el recibo de haberlos corrido sobre el estado actual.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { testTimeout } from "../packages/engine/src/discovery.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { transition } from "../packages/engine/src/transition.js";
import { commandChecksFor, extractCriteriaSpecs } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un comando de verdad, que pasa o falla sin depender del shell. */
const pasa = 'node -e "process.exit(0)"';
const falla = 'node -e "process.exit(1)"';

/** Escribe el ticket en `in_progress`, con los criterios que pida el test. */
function ticket(criterios: string): void {
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "in_progress",
    criterios,
  });
}

/** Declara en el proyecto qué comandos se pueden correr como verificación. */
function comandos(prefixes: readonly string[]): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    `name: Laboratorio\ntest-commands:\n${prefixes.map((p) => `  - ${p}`).join("\n")}\n`,
    "utf8",
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-mecanico-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const correr = () => runGate(PATHS(), { gateId: "qa-mechanical", ticketId: TICKET });

describe("el tope de tiempo de un comando de verificación", () => {
  it("sale de la configuración del proyecto, con 30 segundos por defecto", async () => {
    // El primer proyecto con tests dentro de `docker compose` se pasó del tope y el
    // gate respondió «El comando "docker" superó el tiempo máximo de 30000 ms»: un
    // error que parece del comando y es del tope.
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    expect(testTimeout(lab)).toBe(30_000);

    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Laboratorio\ntest-timeout: 600\n",
      "utf8",
    );
    expect(testTimeout(lab)).toBe(600_000);
  });

  it("un valor inválido no cambia el tope", () => {
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Laboratorio\ntest-timeout: lo-que-sea\n",
      "utf8",
    );
    expect(testTimeout(lab)).toBe(30_000);
  });
});

describe("corre lo que los criterios declaran", () => {
  it("aprueba cuando el test del criterio pasa, sin gastar una llamada", async () => {
    comandos(["node"]);
    ticket(`- [ ] Buscar "104" devuelve la orden "1042".\n      <!-- test: ${pasa} -->`);

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("APPROVE");
    const recibos = readReceipts(PATHS(), TICKET);
    expect(recibos).toHaveLength(1);
    expect(recibos[0]?.gate).toBe("qa-mechanical");
    // El evaluador que se usó es el determinista: no hubo modelo.
    expect(recibos[0]?.model).toBeNull();
  });

  it("bloquea cuando el test falla, y dice cuál", async () => {
    comandos(["node"]);
    ticket(`- [ ] Buscar "104" devuelve la orden "1042".\n      <!-- test: ${falla} -->`);

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stdout).toContain("BLOCK");
    // El criterio que falló, no un identificador suelto.
    expect(resultado.stdout).toContain('Buscar "104" devuelve la orden "1042".');
    expect(readReceipts(PATHS(), TICKET)[0]?.outcome).toBe("block");
  });

  it("corre varios criterios y bloquea si falla uno solo", async () => {
    comandos(["node"]);
    ticket(
      [
        `- [ ] El primero pasa.\n      <!-- test: ${pasa} -->`,
        `- [ ] El segundo falla.\n      <!-- test: ${falla} -->`,
      ].join("\n"),
    );

    const resultado = await correr();

    expect(resultado.stdout).toContain("BLOCK");
    expect(resultado.stdout).toContain("El segundo falla.");
  });

  it("un criterio manual no se corre y no bloquea: lo verifica una persona", async () => {
    comandos(["node"]);
    ticket(
      [
        `- [ ] El backend rechaza cantidades negativas.\n      <!-- test: ${pasa} -->`,
        "- [ ] La pantalla muestra el saldo actualizado.\n      <!-- verify: manual -->",
      ].join("\n"),
    );

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("APPROVE");
  });

  it("si todos los criterios son manuales, el veredicto es revisión y no aprobación", async () => {
    // El defecto que este proyecto ya pagó una vez: un gate sin proposiciones que
    // aprueba. Acá no hay nada que correr, así que el veredicto es el que dice la
    // verdad —lo verifican las personas— y no una aprobación por vacuidad.
    comandos(["node"]);
    ticket(
      "- [ ] La pantalla muestra el saldo actualizado.\n      <!-- verify: manual -->",
    );

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stdout).toContain("REVIEW");
    expect(readReceipts(PATHS(), TICKET)[0]?.outcome).toBe("review");
  });
});

describe("no corre lo que nadie autorizó", () => {
  it("rechaza un comando que el proyecto no declaró, y no ejecuta nada", async () => {
    // El comando sale del ticket, y el ticket lo escribe quien el gate tiene que
    // controlar: sin la lista de prefijos, escribir un criterio sería escribir una
    // orden arbitraria que el gate obedece.
    comandos(["npx vitest run"]);
    ticket(`- [ ] Un criterio cualquiera.\n      <!-- test: curl http://ejemplo/x -->`);

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stderr).toContain("no autoriza");
    expect(resultado.stderr).toContain("curl http://ejemplo/x");
    // Y no escribió recibo: no se evaluó nada.
    expect(readReceipts(PATHS(), TICKET)).toEqual([]);
  });

  it("el prefijo se compara por palabra completa, no por texto", async () => {
    // `npx vitest run-otra-cosa` no empieza con `npx vitest run`: una comparación
    // por texto lo dejaría pasar, y ahí empieza el juego de escribir un comando
    // que se parece al autorizado.
    comandos(["npx vitest run"]);
    ticket(`- [ ] Un criterio cualquiera.\n      <!-- test: npx vitest run-otra-cosa -->`);

    expect((await correr()).stderr).toContain("no autoriza");
  });

  it("sin `test-commands` en la configuración, dice cómo declararlo", async () => {
    ticket(`- [ ] Un criterio cualquiera.\n      <!-- test: ${pasa} -->`);

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stderr).toContain("test-commands");
    expect(resultado.stderr).toContain(".valmen/config.yaml");
  });

  it("un criterio que no dice cómo se verifica detiene el gate", async () => {
    // La ambigüedad se resuelve sola a favor de «seguramente está bien», así que
    // se exige la declaración. Es una línea por criterio.
    comandos(["node"]);
    ticket(
      [
        `- [ ] Declara su test.\n      <!-- test: ${pasa} -->`,
        "- [ ] Este no declara nada.",
      ].join("\n"),
    );

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stderr).toContain("no declaran cómo se verifican");
    expect(resultado.stderr).toContain("Este no declara nada.");
    expect(resultado.stderr).toContain("verify: manual");
  });
});

describe("la entrega exige el recibo", () => {
  const mover = (to: string) =>
    transition({ paths: PATHS(), ticketId: TICKET, entity: "ticket", to });

  it("sin verificación mecánica, no se entrega", () => {
    comandos(["node"]);
    ticket(`- [ ] Un criterio.\n      <!-- test: ${pasa} -->`);
    writeFileSync(
      join(lab, "tickets", "2026", TICKET, "ticket.md"),
      readFileSync(join(lab, "tickets", "2026", TICKET, "ticket.md"), "utf8").replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: probado.",
      ),
      "utf8",
    );

    expect(() => mover("awaiting_user_tests")).toThrow(/verificación mecánica/);
    expect(() => mover("awaiting_user_tests")).toThrow(/qa-mechanical/);
  });

  it("con el test pasado, la entrega pasa", async () => {
    comandos(["node"]);
    ticket(`- [ ] Un criterio.\n      <!-- test: ${pasa} -->`);
    await correr();
    writeFileSync(
      join(lab, "tickets", "2026", TICKET, "ticket.md"),
      readFileSync(join(lab, "tickets", "2026", TICKET, "ticket.md"), "utf8").replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: probado.",
      ),
      "utf8",
    );

    expect(mover("awaiting_user_tests").details).toContain("awaiting_user_tests");
  });

  it("si el ticket cambió después de correr los tests, el recibo no vale", async () => {
    // Es el caso que un recibo sin hash dejaría pasar en silencio: lo que se probó
    // no es lo que se entrega.
    comandos(["node"]);
    ticket(`- [ ] Un criterio.\n      <!-- test: ${pasa} -->`);
    await correr();

    const ruta = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(
      ruta,
      readFileSync(ruta, "utf8")
        .replace(
          "## Pruebas\n\nPendiente de ejecución.",
          "## Pruebas\n\n- Resultado del PO: probado.",
        )
        // Y ahora alguien toca el plan, que es lo que el gate congeló.
        .replace("## Plan", "## Plan\n\n- Un paso agregado después de probar."),
      "utf8",
    );

    expect(() => mover("awaiting_user_tests")).toThrow(/anterior al último cambio/);
  });

  it("un test que falla impide entregar, y lo dice con el motivo", async () => {
    comandos(["node"]);
    ticket(`- [ ] Un criterio.\n      <!-- test: ${falla} -->`);
    await correr();
    const ruta = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(
      ruta,
      readFileSync(ruta, "utf8").replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: probado.",
      ),
      "utf8",
    );

    expect(() => mover("awaiting_user_tests")).toThrow(/bloqueó/);
  });
});

describe("el comando de un criterio", () => {
  const specs = (seccion: string) => extractCriteriaSpecs(seccion);

  it("se parte respetando las comillas", () => {
    const { checks } = commandChecksFor(
      specs(
        '- [ ] Un criterio cualquiera.\n      <!-- test: node -e "process.exit(0)" -->',
      ),
      ["node"],
    );

    expect(checks[0]).toMatchObject({
      propositionId: "criterio_01",
      command: "node",
      args: ["-e", "process.exit(0)"],
    });
  });

  it("el prefijo autorizado puede tener varios tokens", () => {
    const criterios = specs(
      "- [ ] Un criterio cualquiera.\n      <!-- test: npx vitest run tests/x.test.ts -->",
    );

    expect(commandChecksFor(criterios, ["npx"]).checks).toHaveLength(1);
    expect(commandChecksFor(criterios, ["npx vitest run"]).checks).toHaveLength(1);
    expect(commandChecksFor(criterios, ["npm"]).checks).toHaveLength(0);
  });

  it("los criterios manuales no generan comandos", () => {
    const criterios = specs(
      "- [ ] Un criterio cualquiera.\n      <!-- verify: manual -->\n- [ ] Otro criterio distinto.",
    );

    expect(commandChecksFor(criterios, ["node"]).checks).toEqual([]);
  });
});
