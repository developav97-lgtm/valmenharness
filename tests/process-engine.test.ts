/**
 * El motor de procesos.
 *
 * Un proceso es lo que convierte «acordarse de actualizar los manuales» en un
 * paso verificado. Por eso lo que se prueba aquí no es que el YAML se lea, sino
 * las cuatro decisiones que hacen que un proceso sea auditable:
 *
 * 1. **La sustitución es estricta.** `{version}` sin valor falla; no se convierte
 *    en nada. `git tag v{version}` con la variable vacía da `git tag v`, que no
 *    falla, y el error aparece mucho después y en otro sitio.
 * 2. **Un proceso no se ejecuta si no se puede ejecutar entero.** Los
 *    sub-procesos y los gates se comprueban al cargar, no al llegar a ellos.
 * 3. **Un fallo detiene, salvo que el proceso diga lo contrario** con
 *    `continue_on_failure`.
 * 4. **Cada paso deja evidencia**: comando ya sustituido, salida, latencia y
 *    código.
 *
 * La ejecución real de comandos se inyecta en casi todos los casos, para que un
 * fallo del motor no dependa de qué shell haya debajo. Los que sí ejecutan de
 * verdad están marcados y usan `node` para ser portables.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ProcessDefinition,
  TICKET_TEMPLATE,
  parseProcess,
  parseYamlSubset,
  processCycle,
  validateProcess,
} from "@valmen/core";
import {
  evaluateWhen,
  listRuns,
  loadProcesses,
  requireProcess,
  resolveParams,
  runProcess,
  substitute,
} from "@valmen/engine";

import { dispatch, parseArgs } from "../packages/cli/src/main.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-process-"));
  mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Escribe un proceso en el laboratorio. */
function escribirProceso(id: string, cuerpo: string): void {
  writeFileSync(join(lab, ".valmen", "processes", `${id}.yaml`), `id: ${id}\n${cuerpo}`);
}

/**
 * Un `runCommand` que no ejecuta nada.
 *
 * Devuelve lo que se le pide y, si el comando empieza por `falla`, sale con 1.
 * Así un test de propagación de fallos no depende del shell ni de qué comandos
 * haya instalados.
 */
function simulador(comandos: string[] = []) {
  return (comando: string): { status: number; stdout: string; stderr: string } => {
    comandos.push(comando);
    if (comando.startsWith("falla")) {
      return { status: 1, stdout: "", stderr: `error simulado en: ${comando}` };
    }
    return { status: 0, stdout: `ok: ${comando}`, stderr: "" };
  };
}

// ── El parser ───────────────────────────────────────────────────────────────

describe("parseProcess", () => {
  it("lee un proceso con parámetros y pasos", () => {
    const proceso = parseProcess(
      [
        "id: deploy",
        "title: Despliegue",
        "description: Algo",
        "params:",
        "  version: { type: string, required: true, pattern: '^\\d+\\.\\d+\\.\\d+$' }",
        "steps:",
        "  - id: preflight",
        "    title: Dry-run",
        "    kind: command",
        "    run: git log --oneline",
        "    on_failure: abort",
      ].join("\n"),
    );

    expect(proceso.id).toBe("deploy");
    expect(proceso.params).toHaveLength(1);
    expect(proceso.params[0]).toMatchObject({
      name: "version",
      type: "string",
      required: true,
      pattern: "^\\d+\\.\\d+\\.\\d+$",
    });
    expect(proceso.steps).toHaveLength(1);
    expect(proceso.steps[0]).toMatchObject({
      id: "preflight",
      kind: "command",
      run: "git log --oneline",
      onFailure: "abort",
    });
  });

  it("lee un escalar de bloque plegado en la descripción", () => {
    // El diseño lo escribe así en su propio ejemplo, y una descripción larga en
    // una sola línea del YAML es ilegible.
    const proceso = parseProcess(
      [
        "id: manuales",
        "description: >",
        "  Sigue docs/manuales/PROCESO-MANUALES.md.",
        "  El código real siempre manda.",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: ls",
      ].join("\n"),
    );
    expect(proceso.description).toBe(
      "Sigue docs/manuales/PROCESO-MANUALES.md. El código real siempre manda.",
    );
  });

  it("lee un escalar literal y conserva los saltos", () => {
    const proceso = parseProcess(
      [
        "id: x",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: |",
        "      eco uno",
        "      eco dos",
      ].join("\n"),
    );
    expect(proceso.steps[0]!.run).toBe("eco uno\neco dos");
  });

  it("una almohadilla dentro de un escalar de bloque es contenido", () => {
    const proceso = parseProcess(
      [
        "id: x",
        "description: >",
        "  el ticket #42 es el bueno",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: ls",
      ].join("\n"),
    );
    expect(proceso.description).toBe("el ticket #42 es el bueno");
  });

  it("rechaza un proceso sin pasos", () => {
    // Un proceso sin pasos es un nombre. Aceptarlo haría que `process run` saliera
    // con éxito sin hacer nada.
    expect(() => parseProcess("id: x\nsteps: []\n")).toThrowError(
      /steps no puede estar vacío/,
    );
  });

  it("rechaza pasos repetidos", () => {
    const texto = [
      "id: x",
      "steps:",
      "  - id: uno",
      "    kind: command",
      "    run: a",
      "  - id: uno",
      "    kind: command",
      "    run: b",
    ].join("\n");
    expect(() => parseProcess(texto)).toThrowError(/está repetido/);
  });

  it("rechaza un tipo de paso que no existe", () => {
    const texto = ["id: x", "steps:", "  - id: uno", "    kind: magia", "    run: a"].join(
      "\n",
    );
    expect(() => parseProcess(texto)).toThrowError(/no existe/);
  });

  it("rechaza un `kind: process` sin decir cuál", () => {
    const texto = ["id: x", "steps:", "  - id: uno", "    kind: process"].join("\n");
    expect(() => parseProcess(texto)).toThrowError(/process debe ser un texto/);
  });

  it("rechaza un patrón que no es una expresión regular", () => {
    const texto = [
      "id: x",
      "params:",
      "  v: { type: string, pattern: '[sin cerrar' }",
      "steps:",
      "  - id: uno",
      "    kind: command",
      "    run: a",
    ].join("\n");
    expect(() => parseProcess(texto)).toThrowError(/expresión regular válida/);
  });

  it("rechaza un tipo de parámetro inventado", () => {
    const texto = [
      "id: x",
      "params:",
      "  v: { type: fecha }",
      "steps:",
      "  - id: uno",
      "    kind: command",
      "    run: a",
    ].join("\n");
    expect(() => parseProcess(texto)).toThrowError(/type debe ser/);
  });

  it("rechaza parámetros en un paso que no invoca a otro proceso", () => {
    const texto = [
      "id: x",
      "steps:",
      "  - id: uno",
      "    kind: command",
      "    run: a",
      "    params: { algo: 1 }",
    ].join("\n");
    expect(() => parseProcess(texto)).toThrowError(
      /Los parámetros son para los sub-procesos/,
    );
  });

  it("lee `on_success` en sus dos formas", () => {
    const base = ["steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n");
    expect(parseProcess(`id: x\non_success: [a, b]\n${base}`).onSuccess).toEqual([
      "a",
      "b",
    ]);
    expect(
      parseProcess(`id: x\non_success:\n  run_process: [c]\n${base}`).onSuccess,
    ).toEqual(["c"]);
  });
});

// ── La validación contra el catálogo ────────────────────────────────────────

describe("validateProcess", () => {
  const catalogo = (processes: string[], gates: string[] = []) => ({
    processes,
    gates,
  });

  const conPaso = (paso: string): ProcessDefinition =>
    parseProcess(["id: padre", "steps:", `  - id: uno`, `    ${paso}`].join("\n"));

  it("un agente exige instrucciones", () => {
    // Sin ellas el runtime no tiene nada que hacer, y decirlo al cargar es la
    // diferencia entre un error y un proceso que se detiene a mitad.
    expect(() =>
      parseProcess(["id: padre", "steps:", "  - id: uno", "    kind: agent"].join("\n")),
    ).toThrowError(/instructions debe ser un texto/);
  });

  it("un agente exige runtime, y lo dice al cargar", () => {
    // El harness no trae uno propio: hay que decir con qué se ejecuta. Inventarlo
    // sería decidir por el proyecto qué modelo y qué agente usa.
    const proceso = parseProcess(
      [
        "id: padre",
        "steps:",
        "  - id: uno",
        "    kind: agent",
        "    instructions: escribe los manuales",
      ].join("\n"),
    );
    expect(() => validateProcess(proceso, catalogo(["padre"]))).toThrowError(
      /no declara\s+`runtime:`/,
    );
  });

  it("dos pasos no pueden compartir runtime", () => {
    // Compartirlo les pisaría el contexto, que es la parte del trabajo que no se ve.
    const proceso = parseProcess(
      [
        "id: padre",
        "steps:",
        "  - id: uno",
        "    kind: agent",
        "    instructions: primero",
        "    runtime: dsh --profile headless",
        "  - id: dos",
        "    kind: agent",
        "    instructions: segundo",
        "    runtime: dsh --profile headless",
      ].join("\n"),
    );
    expect(() => validateProcess(proceso, catalogo(["padre"]))).toThrowError(
      /el mismo\s+runtime/,
    );
  });

  it("rechaza invocar un proceso que no existe, y nombra los que hay", () => {
    const proceso = conPaso("kind: process\n    process: fantasma");
    expect(() => validateProcess(proceso, catalogo(["padre", "otro"]))).toThrowError(
      /"fantasma", que no existe.*otro/s,
    );
  });

  it("rechaza un gate que no está declarado", () => {
    const proceso = conPaso("kind: gate\n    gate: deploy");
    expect(() => validateProcess(proceso, catalogo(["padre"]))).toThrowError(
      /gate "deploy", que no está declarado/,
    );
  });

  it("rechaza la autoinvocación", () => {
    const proceso = conPaso("kind: process\n    process: padre");
    expect(() => validateProcess(proceso, catalogo(["padre"]))).toThrowError(
      /se invoca a sí mismo/,
    );
  });

  it("rechaza pasarle a un sub-proceso un parámetro que no declara", () => {
    const hijo: ProcessDefinition = parseProcess(
      [
        "id: hijo",
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: a",
      ].join("\n"),
    );
    const padre = parseProcess(
      [
        "id: padre",
        "params:",
        "  version: { type: string }",
        "steps:",
        "  - id: uno",
        "    kind: process",
        "    process: hijo",
        "    params: { modulo: m, versio: x }",
      ].join("\n"),
    );
    const definiciones = new Map([
      ["hijo", hijo],
      ["padre", padre],
    ]);
    expect(() =>
      validateProcess(padre, { ...catalogo(["hijo", "padre"]), definitions: definiciones }),
    ).toThrowError(/"versio", que ese proceso no declara/);
  });

  it("rechaza un sub-proceso al que no se le pasa un obligatorio", () => {
    // Se comprueba al cargar y no al llegar: para entonces ya se hizo la mitad
    // del proceso.
    const hijo: ProcessDefinition = parseProcess(
      [
        "id: hijo",
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: a",
      ].join("\n"),
    );
    const padre = parseProcess(
      ["id: padre", "steps:", "  - id: uno", "    kind: process", "    process: hijo"].join(
        "\n",
      ),
    );
    const definiciones = new Map([
      ["hijo", hijo],
      ["padre", padre],
    ]);
    expect(() =>
      validateProcess(padre, { ...catalogo(["hijo", "padre"]), definitions: definiciones }),
    ).toThrowError(/sin pasarle\s+"modulo", que es obligatorio/);
  });

  it("acepta un sub-proceso al que sí se le pasa lo obligatorio", () => {
    const hijo: ProcessDefinition = parseProcess(
      [
        "id: hijo",
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: a",
      ].join("\n"),
    );
    const padre = parseProcess(
      [
        "id: padre",
        "steps:",
        "  - id: uno",
        "    kind: process",
        "    process: hijo",
        "    params: { modulo: inventario }",
      ].join("\n"),
    );
    const definiciones = new Map([
      ["hijo", hijo],
      ["padre", padre],
    ]);
    expect(() =>
      validateProcess(padre, { ...catalogo(["hijo", "padre"]), definitions: definiciones }),
    ).not.toThrow();
  });
});

describe("processCycle", () => {
  const proceso = (id: string, target: string | null): ProcessDefinition =>
    parseProcess(
      target === null
        ? ["id: " + id, "steps:", "  - id: uno", "    kind: command", "    run: a"].join(
            "\n",
          )
        : [
            "id: " + id,
            "steps:",
            "  - id: uno",
            "    kind: process",
            `    process: ${target}`,
          ].join("\n"),
    );

  it("no encuentra ciclo en una cadena lineal", () => {
    const mapa = new Map([
      ["a", proceso("a", "b")],
      ["b", proceso("b", "c")],
      ["c", proceso("c", null)],
    ]);
    expect(processCycle("a", mapa)).toBeNull();
  });

  it("encuentra un ciclo de dos y lo devuelve entero", () => {
    const mapa = new Map([
      ["a", proceso("a", "b")],
      ["b", proceso("b", "a")],
    ]);
    expect(processCycle("a", mapa)).toEqual(["a", "b", "a"]);
  });

  it("encuentra un ciclo largo", () => {
    const mapa = new Map([
      ["a", proceso("a", "b")],
      ["b", proceso("b", "c")],
      ["c", proceso("c", "a")],
    ]);
    expect(processCycle("a", mapa)).toEqual(["a", "b", "c", "a"]);
  });
});

// ── La sustitución y las condiciones ────────────────────────────────────────

describe("substitute", () => {
  it("reemplaza las variables que existen", () => {
    expect(substitute("git tag v{version}", { version: "1.2.3" })).toBe("git tag v1.2.3");
  });

  it("falla si la variable no existe, y nombra las que hay", () => {
    // Es la decisión central: dejar la variable vacía convierte `git tag
    // v{version}` en `git tag v`, que no falla.
    expect(() => substitute("git tag v{version}", { tickets: "X" })).toThrowError(
      /La variable \{version\} no está definida.*tickets/s,
    );
  });

  it("permite una llave literal con doble llave", () => {
    expect(substitute("echo {{version}}", {})).toBe("echo {version}");
  });

  it("no toca lo que no es una variable", () => {
    expect(substitute("echo {Version} y {version-x}", { "version-x": "1" })).toBe(
      "echo {Version} y 1",
    );
  });
});

describe("evaluateWhen", () => {
  const valores = { modulo: "inventario", migra: "true" };

  it("compara por igualdad", () => {
    expect(evaluateWhen("modulo == inventario", valores)).toBe(true);
    expect(evaluateWhen("modulo == reportes", valores)).toBe(false);
  });

  it("compara por desigualdad", () => {
    expect(evaluateWhen("modulo != reportes", valores)).toBe(true);
    expect(evaluateWhen("modulo != inventario", valores)).toBe(false);
  });

  it("sustituye antes de comparar", () => {
    expect(
      evaluateWhen("modulo == {esperado}", { ...valores, esperado: "inventario" }),
    ).toBe(true);
  });

  it("rechaza una condición que no se entiende", () => {
    // No es un lenguaje: lo que no sea una comparación es un error, no un
    // `false` silencioso.
    expect(() => evaluateWhen("modulo", valores)).toThrowError(/no se entiende/);
  });
});

describe("resolveParams", () => {
  const definicion = parseProcess(
    [
      "id: x",
      "params:",
      "  version: { type: string, required: true, pattern: '^\\d+\\.\\d+\\.\\d+$' }",
      "  cantidad: { type: number, required: false, default: '3' }",
      "  migra: { type: boolean, required: false }",
      "steps:",
      "  - id: uno",
      "    kind: command",
      "    run: a",
    ].join("\n"),
  );

  it("aplica el valor por defecto", () => {
    const valores = resolveParams(definicion, { version: "1.2.3" });
    expect(valores["cantidad"]).toBe("3");
    // Un opcional sin valor **no entra al mapa**: así una variable que lo use
    // falla con su nombre en vez de sustituirse por nada.
    expect(Object.hasOwn(valores, "migra")).toBe(false);
  });

  it("rechaza un obligatorio que falta", () => {
    expect(() => resolveParams(definicion, {})).toThrowError(
      /requiere el parámetro "version"/,
    );
  });

  it("rechaza un valor que no cumple el patrón", () => {
    expect(() => resolveParams(definicion, { version: "1.2" })).toThrowError(
      /no cumple su patrón/,
    );
  });

  it("rechaza un número que no lo es", () => {
    expect(() =>
      resolveParams(definicion, { version: "1.2.3", cantidad: "muchas" }),
    ).toThrowError(/debe ser un número/);
  });

  it("rechaza un booleano que no lo es", () => {
    expect(() => resolveParams(definicion, { version: "1.2.3", migra: "si" })).toThrowError(
      /debe ser true o false/,
    );
  });

  it("rechaza un parámetro que el proceso no declara", () => {
    expect(() =>
      resolveParams(definicion, { version: "1.2.3", inventado: "x" }),
    ).toThrowError(/no declara el parámetro "inventado"/);
  });
});

// ── La ejecución ────────────────────────────────────────────────────────────

describe("runProcess", () => {
  it("ejecuta los pasos en orden y deja evidencia", () => {
    escribirProceso(
      "simple",
      [
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: eco uno",
        "  - id: dos",
        "    kind: command",
        "    run: eco dos",
      ].join("\n"),
    );

    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "simple",
      params: {},
      runCommand: simulador(comandos),
    });

    expect(corrida.ok).toBe(true);
    expect(comandos).toEqual(["eco uno", "eco dos"]);
    expect(corrida.steps.map((paso) => paso.status)).toEqual(["ok", "ok"]);
    expect(corrida.steps[0]!.stdout).toBe("ok: eco uno");
  });

  it("detiene el proceso en el primer fallo que bloquea", () => {
    escribirProceso(
      "corta",
      [
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: eco uno",
        "  - id: dos",
        "    kind: command",
        "    run: falla aqui",
        "  - id: tres",
        "    kind: command",
        "    run: eco tres",
      ].join("\n"),
    );

    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "corta",
      params: {},
      runCommand: simulador(comandos),
    });

    expect(corrida.ok).toBe(false);
    // El tercero no corre: un fallo que bloquea detiene el proceso.
    expect(comandos).toEqual(["eco uno", "falla aqui"]);
    expect(corrida.steps.map((paso) => paso.status)).toEqual(["ok", "failed"]);
    expect(corrida.steps[1]!.stderr).toContain("error simulado");
  });

  it("`continue_on_failure` deja seguir", () => {
    escribirProceso(
      "sigue",
      [
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: falla pero no importa",
        "    continue_on_failure: true",
        "  - id: dos",
        "    kind: command",
        "    run: eco dos",
      ].join("\n"),
    );

    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "sigue",
      params: {},
      runCommand: simulador(comandos),
    });

    expect(comandos).toEqual(["falla pero no importa", "eco dos"]);
    expect(corrida.steps.map((paso) => paso.status)).toEqual(["failed", "ok"]);
    // El proceso se considera completado: el fallo estaba declarado como no
    // bloqueante, y decirlo distinto haría que un proceso correcto pareciera roto.
    expect(corrida.ok).toBe(true);
  });

  it("un `when` que no se cumple saltea el paso sin fallar", () => {
    escribirProceso(
      "condicional",
      [
        "params:",
        "  migra: { type: boolean, required: false, default: 'false' }",
        "steps:",
        "  - id: migrar",
        "    kind: command",
        "    run: migra todo",
        "    when: 'migra == true'",
        "  - id: siempre",
        "    kind: command",
        "    run: eco siempre",
      ].join("\n"),
    );

    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "condicional",
      params: {},
      runCommand: simulador(comandos),
    });

    expect(comandos).toEqual(["eco siempre"]);
    expect(corrida.steps[0]!.status).toBe("skipped");
    expect(corrida.steps[0]!.reason).toContain("no se cumple");
    expect(corrida.ok).toBe(true);
  });

  it("un `when` que sí se cumple ejecuta el paso", () => {
    escribirProceso(
      "condicional",
      [
        "params:",
        "  migra: { type: boolean, required: false, default: 'true' }",
        "steps:",
        "  - id: migrar",
        "    kind: command",
        "    run: migra todo",
        "    when: 'migra == true'",
      ].join("\n"),
    );

    const comandos: string[] = [];
    runProcess({
      root: lab,
      id: "condicional",
      params: {},
      runCommand: simulador(comandos),
    });
    expect(comandos).toEqual(["migra todo"]);
  });

  it("sustituye las variables en el comando", () => {
    escribirProceso(
      "con-params",
      [
        "params:",
        "  version: { type: string, required: true }",
        "  tickets: { type: string, required: true }",
        "steps:",
        "  - id: publicar",
        "    kind: command",
        "    run: publicar {version} con {tickets}",
      ].join("\n"),
    );

    const comandos: string[] = [];
    runProcess({
      root: lab,
      id: "con-params",
      params: { version: "1.2.3", tickets: "A,B" },
      runCommand: simulador(comandos),
    });
    expect(comandos).toEqual(["publicar 1.2.3 con A,B"]);
  });

  it("ejecuta un sub-proceso y le reenvía lo que necesita", () => {
    escribirProceso(
      "hijo",
      [
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: manual",
        "    kind: command",
        "    run: actualizar {modulo}",
      ].join("\n"),
    );
    escribirProceso(
      "padre",
      [
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: antes",
        "    kind: command",
        "    run: eco antes",
        "  - id: hijo",
        "    kind: process",
        "    process: hijo",
        "    params: { modulo: '{modulo}' }",
      ].join("\n"),
    );

    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "padre",
      params: { modulo: "inventario" },
      runCommand: simulador(comandos),
    });

    expect(corrida.ok).toBe(true);
    expect(comandos).toEqual(["eco antes", "actualizar inventario"]);
    // La salida del hijo aparece antes que la del paso que lo invoca: se emite al
    // vuelo, así que el orden es el de la ejecución.
    expect(corrida.steps.map((paso) => paso.id)).toEqual(["antes", "hijo.manual", "hijo"]);
  });

  it("un sub-proceso que falla detiene al padre", () => {
    escribirProceso(
      "hijo",
      ["steps:", "  - id: manual", "    kind: command", "    run: falla el manual"].join(
        "\n",
      ),
    );
    escribirProceso(
      "padre",
      [
        "steps:",
        "  - id: hijo",
        "    kind: process",
        "    process: hijo",
        "  - id: despues",
        "    kind: command",
        "    run: eco despues",
      ].join("\n"),
    );

    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "padre",
      params: {},
      runCommand: simulador(comandos),
    });

    expect(corrida.ok).toBe(false);
    expect(comandos).toEqual(["falla el manual"]);
    const paso = corrida.steps.find((resultado) => resultado.id === "hijo")!;
    expect(paso.status).toBe("failed");
    expect(paso.reason).toContain("El sub-proceso falló en: manual");
  });

  it("ejecuta `on_success` solo si el proceso salió bien", () => {
    escribirProceso(
      "post",
      ["steps:", "  - id: aviso", "    kind: command", "    run: avisar"].join("\n"),
    );
    escribirProceso(
      "principal",
      [
        "on_success: [post]",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: eco uno",
      ].join("\n"),
    );

    const comandos: string[] = [];
    runProcess({ root: lab, id: "principal", params: {}, runCommand: simulador(comandos) });
    expect(comandos).toEqual(["eco uno", "avisar"]);
  });

  it("no ejecuta `on_success` si el proceso falló", () => {
    escribirProceso(
      "post",
      ["steps:", "  - id: aviso", "    kind: command", "    run: avisar"].join("\n"),
    );
    escribirProceso(
      "principal",
      [
        "on_success: [post]",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: falla",
      ].join("\n"),
    );

    const comandos: string[] = [];
    runProcess({ root: lab, id: "principal", params: {}, runCommand: simulador(comandos) });
    expect(comandos).toEqual(["falla"]);
  });

  it("rechaza un proceso que no existe y nombra los que hay", () => {
    escribirProceso(
      "otro",
      ["steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n"),
    );
    expect(() =>
      runProcess({ root: lab, id: "fantasma", params: {}, runCommand: simulador() }),
    ).toThrowError(/"fantasma".*otro/s);
  });

  it("ejecuta de verdad, con el shell del sistema", () => {
    // El único test que no inyecta el ejecutor: comprueba que el motor lanza
    // procesos de verdad y recoge su salida.
    escribirProceso(
      "real",
      [
        "steps:",
        "  - id: eco",
        "    kind: command",
        "    run: node -e \"process.stdout.write('hola desde el shell')\"",
        "  - id: sale-mal",
        "    kind: check",
        '    run: node -e "process.exit(4)"',
      ].join("\n"),
    );

    const corrida = runProcess({ root: lab, id: "real", params: {} });
    expect(corrida.steps[0]!.stdout).toBe("hola desde el shell");
    expect(corrida.steps[0]!.status).toBe("ok");
    expect(corrida.steps[1]!.exitCode).toBe(4);
    expect(corrida.ok).toBe(false);
  });
});

describe("loadProcesses", () => {
  it("devuelve vacío en un proyecto sin procesos", () => {
    rmSync(join(lab, ".valmen", "processes"), { recursive: true, force: true });
    expect(loadProcesses(lab)).toEqual([]);
  });

  it("no esconde un proceso que no se puede leer: lo lista con su error", () => {
    // Un archivo con un error de tipeo que desaparece de la lista hace creer que
    // el proceso no existe, y entonces alguien lo escribe otra vez.
    escribirProceso("roto", "steps:\n  - id: uno\n    kind: magia\n");
    const cargados = loadProcesses(lab);
    expect(cargados).toHaveLength(1);
    expect(cargados[0]!.invalid).toMatch(/no existe/);
  });

  it("un proceso roto impide ejecutar cualquier otro", () => {
    // Se valida todo el proyecto y no solo el proceso pedido: un sub-proceso roto
    // no impide que el padre corra hasta que llega a él, y para entonces ya hizo
    // la mitad del trabajo.
    escribirProceso(
      "bueno",
      ["steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n"),
    );
    escribirProceso("roto", "steps:\n  - id: uno\n    kind: magia\n");
    expect(() => requireProcess(lab, "bueno")).toThrowError(/roto\.yaml no se puede leer/);
  });
});

// ── La superficie del CLI ───────────────────────────────────────────────────

describe("valmen process", () => {
  const correr = (...args: string[]) =>
    dispatch(parseArgs(["--root", lab, "--tickets-dir", "tickets", "process", ...args]));

  it("list muestra los procesos y sus parámetros", () => {
    escribirProceso(
      "deploy",
      [
        "title: Despliegue",
        "params:",
        "  version: { type: string, required: true }",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: a",
      ].join("\n"),
    );
    const r = correr("list");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("deploy");
    expect(r.stdout).toContain("1 paso(s)");
    expect(r.stdout).toContain("[version]");
  });

  it("list dice dónde viven cuando no hay ninguno", () => {
    const r = correr("list");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(".valmen/processes/");
  });

  it("list marca un proceso ilegible con su error", () => {
    escribirProceso("roto", "steps:\n  - id: uno\n    kind: magia\n");
    const r = correr("list");
    expect(r.stdout).toContain("inválido");
  });

  it("show imprime los pasos con su tipo y su destino", () => {
    escribirProceso(
      "hijo",
      [
        "params:",
        "  x: { type: number, required: false }",
        "steps:",
        "  - id: uno",
        "    kind: command",
        "    run: a",
      ].join("\n"),
    );
    escribirProceso(
      "padre",
      [
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: uno",
        "    kind: process",
        "    process: hijo",
        "    params: { x: 1 }",
        "    continue_on_failure: true",
      ].join("\n"),
    );
    const r = correr("show", "padre");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("→ hijo");
    expect(r.stdout).toContain("un fallo aquí no detiene el proceso");
    expect(r.stdout).toContain("modulo (string, obligatorio)");
  });

  it("show falla si el proceso no existe", () => {
    const r = correr("show", "fantasma");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/No existe el proceso/);
  });

  it("run ejecuta y sale con cero", () => {
    escribirProceso(
      "simple",
      [
        "params:",
        "  version: { type: string, required: true }",
        "steps:",
        "  - id: eco",
        "    kind: command",
        '    run: node -e "process.stdout.write(process.argv[1])" {version}',
      ].join("\n"),
    );
    const r = correr("run", "simple", "--version", "1.2.3");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Proceso simple");
  });

  it("run sale con invariante si un paso falla, y muestra su salida", () => {
    escribirProceso(
      "rompe",
      [
        "steps:",
        "  - id: malo",
        "    kind: command",
        "    run: node -e \"process.stderr.write('no se pudo'); process.exit(3)\"",
      ].join("\n"),
    );
    const r = correr("run", "rompe");
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("se detuvo en malo");
    expect(r.stderr).toContain("no se pudo");
  });

  it("run rechaza una bandera que no es del proceso", () => {
    // Una bandera aceptada y descartada en silencio es cómo un proceso publica lo
    // que no era: `--veersión` con una tilde de más.
    escribirProceso(
      "simple",
      [
        "params:",
        "  version: { type: string, required: false, default: '0.0.1' }",
        "steps:",
        "  - id: eco",
        "    kind: command",
        "    run: eco {version}",
      ].join("\n"),
    );
    const r = correr("run", "simple", "--veersión", "1.2.3");
    expect(r.exitCode).toBe(2);
    // Y el mensaje nombra la bandera que sobra y los parámetros que sí hay.
    expect(r.stderr).toContain("--veersión");
    expect(r.stderr).toContain("version");
  });

  it("run acepta un parámetro por su nombre", () => {
    // Los comandos de un proceso son de verdad, así que el test usa `node` y no
    // `echo`: un `eco` inexistente salía con 127 y parecía un fallo del motor.
    escribirProceso(
      "simple",
      [
        "params:",
        "  version: { type: string, required: true }",
        "steps:",
        "  - id: imprimir",
        "    kind: command",
        '    run: node -e "process.stdout.write(process.argv[1])" {version}',
      ].join("\n"),
    );
    const r = correr("run", "simple", "--version", "1.2.3");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Proceso simple");
  });

  it("run acepta varios parámetros de una vez con --set", () => {
    escribirProceso(
      "dos",
      [
        "params:",
        "  version: { type: string, required: true }",
        "  tickets: { type: string, required: true }",
        "steps:",
        "  - id: imprimir",
        "    kind: command",
        "    run: node -e \"process.stdout.write(process.argv.slice(1).join(','))\" {version} {tickets}",
      ].join("\n"),
    );
    const r = correr("run", "dos", "--set", "version=1.2.3;tickets=A,B");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Proceso dos");
  });

  it("run exige un obligatorio antes de ejecutar nada", () => {
    escribirProceso(
      "simple",
      [
        "params:",
        "  version: { type: string, required: true }",
        "steps:",
        "  - id: eco",
        "    kind: command",
        "    run: eco {version}",
      ].join("\n"),
    );
    const r = correr("run", "simple");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/requiere el parámetro "version"/);
  });

  it("un subcomando desconocido no se inventa", () => {
    const r = correr("correr");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/Subcomando de process desconocido/);
  });

  it("sin subcomando dice cuáles hay", () => {
    const r = correr();
    expect(r.exitCode).toBe(2);
    // Y los nombra todos: el ciclo de un gate añadió cuatro subcomandos, y un
    // mensaje que solo dijera los tres primeros dejaría el resto sin descubrir.
    expect(r.stderr).toMatch(/list, show, run, approve, runs, show-run, resume o abandon/);
  });
});

// ── El parser de YAML que esto obligó a completar ───────────────────────────

describe("lo que el YAML tuvo que aprender", () => {
  it("lee un mapa en línea, que es como se declara un parámetro", () => {
    expect(
      parseYamlSubset("p: { type: string, required: true }\n", { fileName: "t.yaml" }),
    ).toEqual({ p: { type: "string", required: "true" } });
  });

  it("lee una lista en línea y ya no la trata como texto", () => {
    expect(parseYamlSubset("g: [a, b]\n", { fileName: "t.yaml" })).toEqual({
      g: ["a", "b"],
    });
    expect(parseYamlSubset("g: []\n", { fileName: "t.yaml" })).toEqual({ g: [] });
  });

  it("no confunde un texto que empieza por corchete con una colección", () => {
    expect(parseYamlSubset("d: [beta] es la version\n", { fileName: "t.yaml" })).toEqual({
      d: "[beta] es la version",
    });
  });

  it("rechaza una colección que quedó abierta en vez de leerla como texto", () => {
    expect(() => parseYamlSubset("g: [a, 'b\n", { fileName: "t.yaml" })).toThrowError(
      /abre una colección y no la cierra/,
    );
  });
});

describe("los pasos de agente", () => {
  /**
   * El harness no es un runtime de agentes: no tiene bucle, ni contexto, ni forma
   * de leer un diff y decidir si el trabajo está hecho. Lo que sabe es qué hay que
   * hacer y con qué instrucciones, y eso es lo que le pasa al runtime que el
   * proceso declara.
   */
  function escribirAgente(instructions: string, runtime: string): void {
    escribirProceso(
      "manuales",
      [
        "params:",
        "  modulo: { type: string, required: true }",
        "steps:",
        "  - id: escribir",
        "    title: Escribir los manuales",
        "    kind: agent",
        `    runtime: ${runtime}`,
        `    instructions: ${instructions}`,
      ].join("\n"),
    );
  }

  it("delega en el runtime con las instrucciones sustituidas", () => {
    escribirAgente("Documenta {modulo} sin inventar.", "mi-runtime --headless");
    const comandos: string[] = [];
    const corrida = runProcess({
      root: lab,
      id: "manuales",
      params: { modulo: "inventario" },
      runCommand: simulador(comandos),
    });

    expect(corrida.ok).toBe(true);
    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toContain("mi-runtime --headless");
    expect(comandos[0]).toContain("Documenta inventario sin inventar.");
  });

  it("protege las instrucciones del shell", () => {
    // Una instrucción lleva comillas dobles —«cita textual del código»— y llegaría
    // partida sin protegerla. Las simples no se interpretan dentro de comillas
    // simples, y por eso se cierran y se reabren al escapar una.
    escribirAgente('Busca la "cita textual" y no la dejes fuera.', "runtime");
    const comandos: string[] = [];
    runProcess({
      root: lab,
      id: "manuales",
      params: { modulo: "x" },
      runCommand: simulador(comandos),
    });

    // Las comillas dobles llegan **dentro** del argumento, no como sintaxis.
    expect(comandos[0]).toContain('"cita textual"');
    expect(comandos[0]?.startsWith("runtime '")).toBe(true);
  });

  it("una instrucción con comilla simple no rompe el comando", () => {
    escribirAgente("No uses 'esto' tal cual.", "runtime");
    const comandos: string[] = [];
    runProcess({
      root: lab,
      id: "manuales",
      params: { modulo: "x" },
      runCommand: simulador(comandos),
    });
    // El escape clásico: cerrar, escapar, reabrir.
    expect(comandos[0]).toContain("'\\''");
  });

  it("un runtime que falla detiene el proceso", () => {
    escribirAgente("haz algo", "runtime-que-falla");
    const corrida = runProcess({
      root: lab,
      id: "manuales",
      params: { modulo: "x" },
      runCommand: (comando) =>
        comando.startsWith("runtime-que-falla")
          ? { status: 1, stdout: "", stderr: "el agente no pudo" }
          : { status: 0, stdout: "", stderr: "" },
    });
    expect(corrida.ok).toBe(false);
    expect(corrida.steps[0]?.stderr).toContain("el agente no pudo");
  });

  it("el detalle dice el runtime, no las instrucciones enteras", () => {
    // El detalle se guarda en el estado de la corrida: un prompt largo lo haría
    // ilegible. Las instrucciones viven en el proceso, que es donde se leen.
    escribirAgente(
      "una instrucción bastante larga que no debería caber aquí",
      "mi-runtime",
    );
    const corrida = runProcess({
      root: lab,
      id: "manuales",
      params: { modulo: "x" },
      runCommand: simulador(),
    });
    expect(corrida.steps[0]?.detail).toBe("mi-runtime");
  });
});

describe("lo que costó un paso de agente", () => {
  /**
   * Un proceso con un paso de agente cuyo runtime escribe el reporte donde se le
   * dice, como hace `hermes -z --usage-file`.
   */
  function procesoConAgente(root: string): void {
    const dir = join(root, ".valmen", "processes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "revisar.yaml"),
      [
        "id: revisar",
        "title: Revisar con un agente",
        "steps:",
        "  - id: revisar",
        "    kind: agent",
        "    title: Revisar",
        "    runtime: escribo-consumo {usage-file}",
        "    instructions: Revisá el cambio.",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  /** Un runner que escribe el reporte en la ruta que el comando declara. */
  function runnerQueReporta(reporte: unknown): {
    run: (
      comando: string,
      cwd: string,
    ) => { status: number; stdout: string; stderr: string };
    rutas: string[];
  } {
    const rutas: string[] = [];
    return {
      rutas,
      run: (comando: string) => {
        const ruta = comando.split(" ")[1] as string;
        rutas.push(ruta);
        writeFileSync(ruta, JSON.stringify(reporte), "utf8");
        return { status: 0, stdout: "listo", stderr: "" };
      },
    };
  }

  it("lee el total que incluye las llamadas auxiliares, no el del bucle principal", () => {
    // Los contadores de arriba cubren solo el bucle principal y dejan fuera los
    // títulos y la compresión de contexto. Un costo por ticket calculado con ellos
    // sería más bajo que el real, y más bajo en la dirección que tranquiliza.
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      procesoConAgente(root);
      const { run, rutas } = runnerQueReporta({
        estimated_cost_usd: 0.1,
        total_tokens: 1000,
        api_calls: 3,
        model: "anthropic/claude-sonnet-4.6",
        total_including_auxiliary: {
          estimated_cost_usd: 0.1234,
          total_tokens: 1500,
          api_calls: 5,
        },
      });

      const corrida = runProcess({ root, id: "revisar", params: {}, runCommand: run });
      const paso = corrida.steps[0];

      expect(paso?.usage?.costUsd).toBe(0.1234);
      expect(paso?.usage?.totalTokens).toBe(1500);
      expect(paso?.usage?.apiCalls).toBe(5);
      expect(paso?.usage?.model).toBe("anthropic/claude-sonnet-4.6");
      // Y la ruta que se le pasó al runtime es la que después se lee.
      expect(paso?.detail).toContain(rutas[0] as string);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sin el bloque auxiliar, usa los contadores de arriba", () => {
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      procesoConAgente(root);
      const { run } = runnerQueReporta({
        estimated_cost_usd: 0.5,
        total_tokens: 20,
        model: "otro",
      });
      const corrida = runProcess({ root, id: "revisar", params: {}, runCommand: run });
      expect(corrida.steps[0]?.usage?.costUsd).toBe(0.5);
      expect(corrida.steps[0]?.usage?.apiCalls).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("un reporte que no se puede leer deja el consumo en `null`, no en cero", () => {
    // Ausente y cero no son lo mismo: uno dice «no gastó» y el otro «no se sabe».
    // Un consumo inventado es peor que uno ausente, porque el ausente se ve.
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      procesoConAgente(root);
      const run = (): { status: number; stdout: string; stderr: string } => ({
        status: 0,
        stdout: "",
        stderr: "",
      });
      const corrida = runProcess({ root, id: "revisar", params: {}, runCommand: run });
      expect(corrida.steps[0]?.usage).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("un runtime que falla igual deja su consumo registrado", () => {
    // Un agente que falló a mitad consumió igual, y no contarlo dejaría ese gasto
    // fuera del costo por ticket, que es el número que existe para no mentir.
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      procesoConAgente(root);
      const run = (comando: string): { status: number; stdout: string; stderr: string } => {
        writeFileSync(
          comando.split(" ")[1] as string,
          JSON.stringify({ estimated_cost_usd: 0.07, total_tokens: 10 }),
          "utf8",
        );
        return { status: 1, stdout: "", stderr: "se cayó" };
      };
      const corrida = runProcess({ root, id: "revisar", params: {}, runCommand: run });
      expect(corrida.steps[0]?.status).toBe("failed");
      expect(corrida.steps[0]?.usage?.costUsd).toBe(0.07);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("la ruta del reporte es una variable, no un parámetro del proceso", () => {
    // La regresión que esto fija: al principio la clave entraba en el mapa de
    // parámetros, que es el que se valida contra lo declarado, y el motor
    // rechazaba la corrida con «El proceso no declara el parámetro usage-file».
    // Una variable de sustitución y un parámetro declarado no son lo mismo, y
    // confundirlos rompía cualquier proceso que usara la ruta.
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      procesoConAgente(root);
      const { run } = runnerQueReporta({ estimated_cost_usd: 0.01, total_tokens: 1 });
      const corrida = runProcess({ root, id: "revisar", params: {}, runCommand: run });

      expect(corrida.params).toEqual({});
      expect(Object.keys(corrida.params)).not.toContain("usage-file");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("una corrida que terminó bien pero gastó deja su estado", () => {
    // Antes solo se persistía lo que había que retomar, y con ese criterio el
    // gasto de un agente desaparecía con el proceso: el costo por ticket quedaba
    // más bajo que el real, y más bajo en la dirección que tranquiliza.
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      procesoConAgente(root);
      const { run } = runnerQueReporta({ estimated_cost_usd: 0.02, total_tokens: 5 });
      const corrida = runProcess({ root, id: "revisar", params: {}, runCommand: run });

      expect(corrida.ok).toBe(true);
      expect(corrida.state).not.toBeNull();
      expect(listRuns(root)).toHaveLength(1);
      expect(listRuns(root)[0]?.steps[0]?.usage?.costUsd).toBe(0.02);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("una corrida de comandos sigue sin dejar estado", () => {
    // El freno a la basura sigue en pie: lo que se persiste es lo que hay que
    // retomar o lo que costó, y un `echo` no es ninguna de las dos.
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      const dir = join(root, ".valmen", "processes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "simple.yaml"),
        [
          "id: simple",
          "title: Simple",
          "steps:",
          "  - id: eco",
          "    kind: command",
          "    title: Eco",
          "    run: echo hola",
          "",
        ].join("\n"),
        "utf8",
      );
      const corrida = runProcess({
        root,
        id: "simple",
        params: {},
        runCommand: () => ({ status: 0, stdout: "hola", stderr: "" }),
      });
      expect(corrida.state).toBeNull();
      expect(listRuns(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("un paso que no es de agente no declara consumo", () => {
    const root = mkdtempSync(join(tmpdir(), "consumo-"));
    try {
      const dir = join(root, ".valmen", "processes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "simple.yaml"),
        [
          "id: simple",
          "title: Simple",
          "steps:",
          "  - id: eco",
          "    kind: command",
          "    title: Eco",
          "    run: echo hola",
          "",
        ].join("\n"),
        "utf8",
      );
      const corrida = runProcess({
        root,
        id: "simple",
        params: {},
        runCommand: () => ({ status: 0, stdout: "hola", stderr: "" }),
      });
      expect(corrida.steps[0]?.usage).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a qué ticket se carga lo que gastó una corrida", () => {
  /**
   * Un proceso con un paso de agente que gasta, y que declara a qué tickets
   * pertenece la corrida.
   */
  function procesoQueGasta(
    root: string,
    ticketParam: string | null,
    tickets: string[],
  ): void {
    const dir = join(root, ".valmen", "processes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "revisar.yaml"),
      [
        "id: revisar",
        "title: Revisar",
        ...(ticketParam === null ? [] : [`ticket_param: ${ticketParam}`]),
        "params:",
        "  tickets: { type: string, required: false }",
        "steps:",
        "  - id: revisar",
        "    kind: agent",
        "    title: Revisar",
        "    runtime: escribo-consumo {usage-file}",
        "    instructions: Revisá.",
        "",
      ].join("\n"),
      "utf8",
    );

    for (const id of tickets) {
      const carpeta = join(root, "tickets", id.slice(-8, -4), id);
      mkdirSync(carpeta, { recursive: true });
      // El tipo tiene que coincidir con el prefijo del identificador: el registro
      // lo valida, y `addAiUsage` —que escribe en el ticket— lo comprueba. Un
      // fixture que no lo respete no prueba la atribución: prueba la validación.
      // El tipo y el módulo tienen que coincidir con los segmentos del
      // identificador, y `addAiUsage` —que escribe en el ticket— lo comprueba
      // antes de tocar nada. Un fixture que no lo respete no prueba la
      // atribución: prueba la validación que la rechaza.
      const [tipo, modulo] = id.split("-") as [string, string];
      writeFileSync(
        join(carpeta, "ticket.md"),
        TICKET_TEMPLATE.replace(/^id:.*$/m, `id: ${id}`)
          .replace(/^type:.*$/m, `type: ${tipo}`)
          .replace(/^module:.*$/m, `module: ${modulo}`)
          .replace(/^(?:created|updated):.*$/gm, (m) => `${m.split(":")[0]}: 2026-09-24`)
          .replace(/^# .*$/m, `# ${id}`),
        "utf8",
      );
    }
  }

  function runnerQueGasta(costUsd: number, totalTokens: number) {
    return (comando: string): { status: number; stdout: string; stderr: string } => {
      writeFileSync(
        comando.split(" ")[1] as string,
        JSON.stringify({ estimated_cost_usd: costUsd, total_tokens: totalTokens }),
        "utf8",
      );
      return { status: 0, stdout: "", stderr: "" };
    };
  }

  /** Las entradas de consumo registradas en un ticket, como dato. */
  function consumoDe(
    root: string,
    id: string,
  ): { estimated_cost_usd: number; notes: string }[] {
    const texto = readFileSync(
      join(root, "tickets", id.slice(-8, -4), id, "ticket.md"),
      "utf8",
    );
    // Se extrae el bloque y se parsea en vez de buscar el número en el texto: un
    // `toContain("0.1")` daría positivo con `0.15`, y el test afirmaría algo que
    // no comprobó. Es el mismo error que el test de `root` del servidor MCP, que
    // se llamaba «declara root» y miraba otra cosa.
    const bloque = /## Consumo de IA\s*```json\s*([\s\S]*?)```/.exec(texto);
    if (bloque === null) return [];
    return JSON.parse(bloque[1] as string) as {
      estimated_cost_usd: number;
      notes: string;
    }[];
  }

  it("reparte el gasto entre los tickets que declara, y lo dice", () => {
    // Repartir y no cargar el total a cada uno: una corrida que cubre dos tickets
    // gastó lo que gastó, no el doble. Cargarlo entero a cada uno inflaría los dos
    // números y la métrica de coste por ticket dejaría de servir para comparar.
    const root = mkdtempSync(join(tmpdir(), "atribuir-"));
    try {
      const a = "FEATURE-INVENTARIO-API-20260924";
      const b = "BUGFIX-POS-FILTRO-20260924";
      procesoQueGasta(root, "tickets", [a, b]);

      const corrida = runProcess({
        root,
        id: "revisar",
        params: { tickets: `${a},${b}` },
        runCommand: runnerQueGasta(0.2, 1000),
      });

      expect(corrida.attribution[0]).toContain("2 ticket(s)");
      expect(corrida.attribution[0]).toContain("$0.1000 cada uno");
      expect(consumoDe(root, a)[0]?.estimated_cost_usd).toBeCloseTo(0.1, 6);
      expect(consumoDe(root, b)[0]?.estimated_cost_usd).toBeCloseTo(0.1, 6);
      // Y el reparto se declara como lo que es: una imputación y no una medición
      // de lo que costó cada ticket.
      expect(consumoDe(root, a)[0]?.notes).toContain("no una medición");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("un proceso que no declara `ticket-param` lo dice, en vez de callarse", () => {
    // Es el modo de fallo que el campo existe para evitar: el proceso corre, el
    // informe sale, y el gasto simplemente no aparece en ningún lado.
    const root = mkdtempSync(join(tmpdir(), "atribuir-"));
    try {
      procesoQueGasta(root, null, []);
      const corrida = runProcess({
        root,
        id: "revisar",
        params: {},
        runCommand: runnerQueGasta(0.3, 10),
      });
      expect(corrida.attribution[0]).toContain("no declara");
      expect(corrida.attribution[0]).toContain("$0.3000");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("un ticket que no está en el registro no se inventa", () => {
    const root = mkdtempSync(join(tmpdir(), "atribuir-"));
    try {
      const real = "FEATURE-INVENTARIO-API-20260924";
      procesoQueGasta(root, "tickets", [real]);

      const corrida = runProcess({
        root,
        id: "revisar",
        params: { tickets: `${real},NO-EXISTE-20260924` },
        runCommand: runnerQueGasta(0.1, 100),
      });

      expect(corrida.attribution.join("\n")).toContain("NO-EXISTE-20260924");
      expect(corrida.attribution[0]).toContain("1 ticket(s)");
      expect(consumoDe(root, real)[0]?.estimated_cost_usd).toBeCloseTo(0.1, 6);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sin consumo no hay nada que atribuir", () => {
    const root = mkdtempSync(join(tmpdir(), "atribuir-"));
    try {
      procesoQueGasta(root, "tickets", ["FEATURE-INVENTARIO-API-20260924"]);
      const corrida = runProcess({
        root,
        id: "revisar",
        params: { tickets: "FEATURE-INVENTARIO-API-20260924" },
        runCommand: () => ({ status: 0, stdout: "", stderr: "" }),
      });
      expect(corrida.attribution).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("declarar un `ticket-param` que no existe detiene el proceso al cargarlo", () => {
    // La mitad del motivo por el que esto es un campo y no una convención de
    // nombre: una atribución que no ocurre no se nota nunca, así que el error
    // tiene que aparecer al cargar y no en la contabilidad tres semanas después.
    const root = mkdtempSync(join(tmpdir(), "atribuir-"));
    try {
      const dir = join(root, ".valmen", "processes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "malo.yaml"),
        [
          "id: malo",
          "title: Malo",
          "ticket_param: tickets",
          "steps:",
          "  - id: eco",
          "    kind: command",
          "    title: Eco",
          "    run: echo hola",
          "",
        ].join("\n"),
        "utf8",
      );

      const cargado = loadProcesses(root)[0];
      expect(cargado?.definition.ticketParam).toBe("tickets");
      expect(() =>
        validateProcess(cargado?.definition as ProcessDefinition, {
          processes: ["malo"],
          gates: [],
        }),
      ).toThrow(/no declara/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
