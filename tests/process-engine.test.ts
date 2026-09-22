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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ProcessDefinition,
  parseProcess,
  parseYamlSubset,
  processCycle,
  validateProcess,
} from "@valmen/core";
import {
  evaluateWhen,
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
    const texto = ["id: x", "steps:", "  - id: uno", "    kind: magia", "    run: a"].join("\n");
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
    expect(() => parseProcess(texto)).toThrowError(/Los parámetros son para los sub-procesos/);
  });

  it("lee `on_success` en sus dos formas", () => {
    const base = ["steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n");
    expect(parseProcess(`id: x\non_success: [a, b]\n${base}`).onSuccess).toEqual(["a", "b"]);
    expect(parseProcess(`id: x\non_success:\n  run_process: [c]\n${base}`).onSuccess).toEqual([
      "c",
    ]);
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

  it("rechaza un tipo que el motor todavía no ejecuta", () => {
    // Declararlo y no ejecutarlo es honesto mientras el error lo diga;
    // saltárselo en silencio reportaría éxito sin hacer el trabajo.
    const proceso = parseProcess(
      ["id: padre", "steps:", "  - id: uno", "    kind: agent", "    agent: escritor"].join("\n"),
    );
    expect(() => validateProcess(proceso, catalogo(["padre"]))).toThrowError(
      /todavía no ejecuta ese tipo/,
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
      ["id: padre", "steps:", "  - id: uno", "    kind: process", "    process: hijo"].join("\n"),
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
        ? ["id: " + id, "steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n")
        : ["id: " + id, "steps:", "  - id: uno", "    kind: process", `    process: ${target}`].join("\n"),
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
    expect(evaluateWhen("modulo == {esperado}", { ...valores, esperado: "inventario" })).toBe(
      true,
    );
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
    expect(() => resolveParams(definicion, {})).toThrowError(/requiere el parámetro "version"/);
  });

  it("rechaza un valor que no cumple el patrón", () => {
    expect(() => resolveParams(definicion, { version: "1.2" })).toThrowError(/no cumple su patrón/);
  });

  it("rechaza un número que no lo es", () => {
    expect(() =>
      resolveParams(definicion, { version: "1.2.3", cantidad: "muchas" }),
    ).toThrowError(/debe ser un número/);
  });

  it("rechaza un booleano que no lo es", () => {
    expect(() =>
      resolveParams(definicion, { version: "1.2.3", migra: "si" }),
    ).toThrowError(/debe ser true o false/);
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
    runProcess({ root: lab, id: "condicional", params: {}, runCommand: simulador(comandos) });
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
      ["steps:", "  - id: manual", "    kind: command", "    run: falla el manual"].join("\n"),
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
    escribirProceso("otro", ["steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n"));
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
        '    run: node -e "process.stdout.write(\'hola desde el shell\')"',
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
    escribirProceso("bueno", ["steps:", "  - id: uno", "    kind: command", "    run: a"].join("\n"));
    escribirProceso("roto", "steps:\n  - id: uno\n    kind: magia\n");
    expect(() => requireProcess(lab, "bueno")).toThrowError(/roto\.yaml no se puede leer/);
  });
});

// ── La superficie del CLI ───────────────────────────────────────────────────

describe("valmen process", () => {
  const correr = (...args: string[]) =>
    dispatch(
      parseArgs(["--root", lab, "--tickets-dir", "tickets", "process", ...args]),
    );

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
        '    run: node -e "process.stderr.write(\'no se pudo\'); process.exit(3)"',
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
        '    run: node -e "process.stdout.write(process.argv.slice(1).join(\',\'))" {version} {tickets}',
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
    expect(r.stderr).toMatch(/list, show o run/);
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
    expect(parseYamlSubset("g: [a, b]\n", { fileName: "t.yaml" })).toEqual({ g: ["a", "b"] });
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
