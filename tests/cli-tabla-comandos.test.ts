/**
 * La tabla declarativa de comandos del CLI (FEATURE-CLI-TABLA-COMANDOS-20261010).
 *
 * Dos reglas del sprint S1 de `guardas-verificacion-harness`:
 *
 * - R-MSG-001: el CLI declara sus comandos y banderas en una tabla que usa el
 *   despacho. Hasta ahora los comandos existían solo como ramas de un `switch` y de
 *   una cadena de `if`, y la ayuda era texto suelto que nadie cruzaba con ellas.
 * - R-MSG-003: una bandera que el comando no declara se rechaza con código 2 y el
 *   mensaje lista las válidas. Antes se aceptaba como booleana y nadie la leía.
 *
 * La tabla se importa de forma perezosa a propósito: así cada prueba falla por lo
 * suyo y las de compatibilidad —que describen lo que ya funcionaba— se pueden
 * observar en verde antes de existir el módulo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { USAGE, VALUE_OPTIONS, parseArgs, run } from "../packages/cli/src/main.js";
import { EXIT_SCHEMA } from "../packages/core/src/errors.js";

type Tabla = typeof import("../packages/cli/src/command-table.js");

const RUTA_TABLA = "../packages/cli/src/command-table.js";
const CARPETA_SRC = join(import.meta.dirname, "..", "packages", "cli", "src");
const RAIZ_FIXTURE = join(import.meta.dirname, "fixtures", "saicloud");
const TICKET_DEL_FIXTURE = "BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907";

async function tabla(): Promise<Tabla> {
  return (await import(/* @vite-ignore */ RUTA_TABLA)) as Tabla;
}

function fuente(archivo: string): string {
  return readFileSync(join(CARPETA_SRC, archivo), "utf8");
}

/** Corre el CLI con la salida capturada, sin tocar la terminal. */
async function correr(
  argv: readonly string[],
): Promise<{ codigo: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const espiaOut = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
  const espiaErr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });
  try {
    const codigo = await run(argv);
    return { codigo, stdout, stderr };
  } finally {
    espiaOut.mockRestore();
    espiaErr.mockRestore();
  }
}

/** Los comandos con rama de despacho en `main.ts`: `command === "x"`, `case "x":` y `ESCRITURA`. */
function comandosConRama(): Set<string> {
  const texto = fuente("main.ts");
  const ramas = new Set<string>();
  for (const m of texto.matchAll(/\bcommand === "([a-z][a-z0-9-]*)"/g))
    ramas.add(m[1] as string);
  for (const m of texto.matchAll(/^\s*case "([a-z][a-z0-9-]*)":/gm))
    ramas.add(m[1] as string);
  const escritura = /const ESCRITURA = new Set\(\[([\s\S]*?)\]\)/.exec(texto);
  for (const m of (escritura?.[1] ?? "").matchAll(/"([a-z][a-z0-9-]*)"/g))
    ramas.add(m[1] as string);
  return ramas;
}

/** Dónde vive el despachador de los subcomandos de cada comando. */
const DESPACHADOR: Readonly<Record<string, readonly string[]>> = {
  estandar: ["commands.ts"],
  memory: ["main.ts", "commands.ts"],
  usage: ["main.ts"],
  template: ["commands.ts"],
  execution: ["execution.ts"],
  process: ["process.ts"],
  manuales: ["manuales.ts"],
  corpus: ["corpus.ts"],
  feature: ["features.ts"],
  hermes: ["main.ts"],
  provider: ["setup.ts"],
  routing: ["setup.ts"],
  perfiles: ["setup.ts"],
  onboarding: ["main.ts"],
  delegation: ["delegation.ts"],
  journey: ["main.ts"],
  ux: ["main.ts"],
  skills: ["main.ts"],
  "approval-authorize": ["main.ts", "commands.ts"],
  "qa-authorize": ["commands.ts"],
};

/** Falla nombrando los comandos que `USAGE` cita y la tabla no declara. */
function exigirAyudaEnLaTabla(t: Tabla, usage: string): void {
  const fuera = t
    .comandosCitadosEnAyuda(usage)
    .filter((ruta) => !t.existeComando(ruta.split(" ")));
  if (fuera.length > 0) {
    throw new Error(`USAGE cita comandos que la tabla no declara: ${fuera.join(", ")}.`);
  }
}

describe("R-MSG-001: el CLI declara sus comandos en una tabla", () => {
  it("C1: cada comando de primer nivel que despacha main.ts figura en la tabla", async () => {
    const t = await tabla();
    const ramas = comandosConRama();
    expect(ramas.size).toBeGreaterThan(60);
    expect([...ramas].filter((comando) => !t.existeComando([comando])).sort()).toEqual([]);
  });

  it("C2: cada comando de la tabla tiene una rama de despacho en main.ts", async () => {
    const t = await tabla();
    const ramas = comandosConRama();
    expect(
      Object.keys(t.COMANDOS)
        .filter((comando) => !ramas.has(comando))
        .sort(),
    ).toEqual([]);
  });

  it("C3: cada subcomando de la tabla aparece en el despachador de su comando", async () => {
    const t = await tabla();
    const sinDespachador: string[] = [];
    const sinLiteral: string[] = [];
    for (const [comando, espec] of Object.entries(t.COMANDOS)) {
      if (espec.subcomandos === undefined) continue;
      const archivos = DESPACHADOR[comando];
      if (archivos === undefined) {
        sinDespachador.push(comando);
        continue;
      }
      const texto = archivos.map(fuente).join("\n");
      for (const sub of Object.keys(espec.subcomandos)) {
        if (!texto.includes(`"${sub}"`)) sinLiteral.push(`${comando} ${sub}`);
      }
    }
    expect(sinDespachador).toEqual([]);
    expect(sinLiteral).toEqual([]);
  });

  it("C4: cada comando citado en USAGE, con su subcomando, figura en la tabla", async () => {
    const t = await tabla();
    expect(t.comandosCitadosEnAyuda(USAGE).length).toBeGreaterThan(60);
    expect(() => exigirAyudaEnLaTabla(t, USAGE)).not.toThrow();
  });

  it("C5: un comando agregado a USAGE sin entrada en la tabla hace fallar la comprobación y lo nombra", async () => {
    const t = await tabla();
    const conInventado = `${USAGE}  inventado --x\n`;
    expect(t.comandosCitadosEnAyuda(conInventado)).toContain("inventado");
    expect(() => exigirAyudaEnLaTabla(t, conInventado)).toThrow(/inventado/);
  });

  it("C6: cada bandera que USAGE documenta en la línea de un comando está declarada para él", async () => {
    const t = await tabla();
    const citas = t.citasDeAyuda(USAGE);
    expect(
      citas.reduce((cuantas, cita) => cuantas + cita.banderas.length, 0),
    ).toBeGreaterThan(150);

    // La unión de lo que el comando acepta en cualquiera de sus verbos: una línea
    // de continuación documenta banderas de un comando, no de un verbo concreto.
    const delComando = (comando: string): Set<string> => {
      const espec = t.COMANDOS[comando];
      const banderas = new Set<string>(t.banderasValidas([comando]));
      for (const sub of Object.keys(espec?.subcomandos ?? {})) {
        for (const bandera of t.banderasValidas([comando, sub])) banderas.add(bandera);
      }
      return banderas;
    };

    const sobran: string[] = [];
    for (const cita of citas) {
      const validas: Set<string>[] =
        cita.continuacion || cita.subcomandos.length === 0
          ? [delComando(cita.comando)]
          : cita.subcomandos.map((sub) => new Set(t.banderasValidas([cita.comando, sub])));
      for (const bandera of cita.banderas) {
        if (!validas.every((conjunto) => conjunto.has(bandera))) {
          sobran.push(
            `${cita.comando} ${cita.subcomandos.join("|")} ${bandera}`.replace("  ", " "),
          );
        }
      }
    }
    expect(sobran).toEqual([]);
  });

  it("C7: cada bandera que leen los manejadores de packages/cli/src está declarada en la tabla", async () => {
    const t = await tabla();
    const declaradas = new Set<string>([
      ...t.BANDERAS_GLOBALES.conValor,
      ...t.BANDERAS_GLOBALES.booleanas,
    ]);
    for (const espec of Object.values(t.COMANDOS)) {
      for (const bandera of [...espec.conValor, ...espec.booleanas])
        declaradas.add(bandera);
      for (const sub of Object.values(espec.subcomandos ?? {})) {
        for (const bandera of [...(sub.conValor ?? []), ...(sub.booleanas ?? [])])
          declaradas.add(bandera);
      }
    }

    const lectores = [
      /\b(?:flags|options\.flags)\[\s*"([a-z][a-z0-9-]*)"\s*\]/g,
      /\bflags\.([a-z][a-zA-Z0-9]*)\b/g,
      /\b(?:flag|texto|bandera|value|obligatoria|lista|t)\(\s*(?:[A-Za-z.]+\s*,\s*)?"([a-z][a-z0-9-]*)"/g,
    ];
    const archivos = [
      "main.ts",
      "commands.ts",
      "ceremony.ts",
      "delegation.ts",
      "execution.ts",
      "features.ts",
      "setup.ts",
      "journey-handoff.ts",
      "worktree.ts",
      "run.ts",
      "hermes.ts",
      "process.ts",
      "manuales.ts",
      "corpus.ts",
    ];
    const leidas = new Set<string>();
    for (const archivo of archivos) {
      const texto = fuente(archivo);
      for (const lector of lectores) {
        for (const m of texto.matchAll(lector)) leidas.add(m[1] as string);
      }
    }

    expect(leidas.size).toBeGreaterThan(100);
    expect([...leidas].filter((nombre) => !declaradas.has(`--${nombre}`)).sort()).toEqual(
      [],
    );
  });

  it("C8: VALUE_OPTIONS se deriva de la tabla y no repite entradas", async () => {
    const t = await tabla();
    expect(new Set(VALUE_OPTIONS).size).toBe(VALUE_OPTIONS.length);
    expect([...VALUE_OPTIONS].sort()).toEqual([...t.banderasConValor()].sort());
    // Las que el parser ya trataba con valor siguen siéndolo.
    for (const bandera of [
      "--root",
      "--id",
      "--tickets-dir",
      "--credentials",
      "--version",
      "--limite",
    ]) {
      expect(VALUE_OPTIONS).toContain(bandera);
    }
  });

  it("C16: un comando que no está en la tabla conserva el mensaje «Comando desconocido»", async () => {
    const { codigo, stderr } = await correr(["pepe"]);
    expect(codigo).toBe(EXIT_SCHEMA);
    expect(stderr).toContain(
      "Comando desconocido: pepe. Use --help para ver los disponibles.",
    );
  });

  it("C17: un subcomando desconocido conserva el mensaje de su módulo", async () => {
    const { codigo, stderr } = await correr(["journey", "inventado"]);
    expect(codigo).toBe(EXIT_SCHEMA);
    expect(stderr).toContain("journey admite:");
  });
});

describe("R-MSG-003: una bandera que el comando no declara se rechaza", () => {
  it("C9: `resume --idd X` sale con código 2", async () => {
    const { codigo } = await correr(["resume", "--idd", "FEATURE-X-20261010"]);
    expect(codigo).toBe(EXIT_SCHEMA);
  });

  it("C10: el rechazo dice que --idd no existe para resume", async () => {
    const { stderr } = await correr(["resume", "--idd", "FEATURE-X-20261010"]);
    expect(stderr).toContain("--idd no existe para resume");
  });

  it("C11: el rechazo nombra --id entre las banderas válidas de resume", async () => {
    const { stderr } = await correr(["resume", "--idd", "FEATURE-X-20261010"]);
    const lista = /Las que acepta: ([^(\n]*)/.exec(stderr)?.[1] ?? "";
    expect(lista.split(",").map((bandera) => bandera.trim())).toContain("--id");
  });

  it("C12: `validate --id X --inventada` sale con código 2 sin validar el ticket", async () => {
    const control = await correr([
      "--root",
      RAIZ_FIXTURE,
      "validate",
      "--id",
      TICKET_DEL_FIXTURE,
    ]);
    expect(control.codigo).toBe(0);
    expect(control.stdout).toContain("Ticket válido");

    const { codigo, stdout, stderr } = await correr([
      "--root",
      RAIZ_FIXTURE,
      "validate",
      "--id",
      TICKET_DEL_FIXTURE,
      "--inventada",
    ]);
    expect(codigo).toBe(EXIT_SCHEMA);
    expect(stdout).toBe("");
    expect(stderr).toContain("--inventada no existe para validate");
  });

  it("C13: `valmen --version` imprime la versión con código 0", async () => {
    const { codigo, stdout, stderr } = await correr(["--version"]);
    expect(codigo).toBe(0);
    expect(stdout).toBe("0.0.1\n");
    expect(stderr).toBe("");
  });

  it("C14: `release-publish --version 1.2.3` entrega 1.2.3 como valor de --version", () => {
    const opciones = parseArgs([
      "release-publish",
      "--version",
      "1.2.3",
      "--tickets",
      "A,B",
    ]);
    expect(opciones.flags["version"]).toBe("1.2.3");
    expect(opciones.version).toBe(false);
    expect(opciones.positionals).toEqual(["release-publish"]);
  });

  it("C14 (compatibilidad): deliver-manifest y transition también reciben --version con valor", () => {
    expect(
      parseArgs(["deliver-manifest", "--version", "2.0.0", "--tickets", "A"]).flags[
        "version"
      ],
    ).toBe("2.0.0");
    expect(
      parseArgs([
        "transition",
        "--id",
        "A",
        "--entity",
        "release",
        "--to",
        "published",
        "--version",
        "2.0.0",
      ]).flags["version"],
    ).toBe("2.0.0");
  });

  it("C15: una bandera con valor escrita antes del comando sigue aceptada", () => {
    const opciones = parseArgs(["--id", "FEATURE-X-20261010", "validate"]);
    expect(opciones.positionals).toEqual(["validate"]);
    expect(opciones.flags["id"]).toBe("FEATURE-X-20261010");

    const conRaiz = parseArgs([
      "--root",
      "/proyecto",
      "--tickets-dir",
      "t",
      "validate",
      "--all",
    ]);
    expect(conRaiz.positionals).toEqual(["validate"]);
    expect(conRaiz.ticketsDir).toBe("t");
    expect(conRaiz.flags["all"]).toBe(true);
  });

  it("la forma --bandera=valor y una desconocida con '=' también se rechazan por su nombre", () => {
    expect(parseArgs(["resume", "--id=FEATURE-X-20261010"]).flags["id"]).toBe(
      "FEATURE-X-20261010",
    );
    expect(() => parseArgs(["resume", "--idd=FEATURE-X-20261010"])).toThrow(
      /--idd no existe para resume/,
    );
  });

  it("una bandera global vale en cualquier comando", () => {
    const opciones = parseArgs([
      "validate",
      "--all",
      "--root",
      "/proyecto",
      "--legacy-layout",
      "--credentials",
      "c.yaml",
    ]);
    expect(opciones.legacyLayout).toBe(true);
    expect(opciones.flags["credentials"]).toBe("c.yaml");
  });

  it("una bandera de otro comando se rechaza aunque exista en la ayuda", () => {
    expect(() => parseArgs(["validate", "--id", "X", "--limit", "3"])).toThrow(
      /--limit no existe para validate/,
    );
  });

  it("un subcomando declarado acepta lo suyo y rechaza lo ajeno", () => {
    expect(
      parseArgs(["memory", "search", "consulta", "--limite", "3"]).flags["limite"],
    ).toBe("3");
    expect(() => parseArgs(["memory", "list", "--limite", "3"])).toThrow(
      /--limite no existe para memory list/,
    );
  });

  it("hermes sin verbo se rige por status", () => {
    expect(parseArgs(["hermes", "--dry-run"]).flags["dry-run"]).toBe(true);
    expect(() => parseArgs(["hermes", "--receipt", "GR-1"])).toThrow(
      /--receipt no existe para hermes/,
    );
    expect(parseArgs(["hermes", "notify", "--receipt", "GR-1"]).flags["receipt"]).toBe(
      "GR-1",
    );
  });

  it("con un comando o un subcomando desconocido el parser acepta, para que respondan los mensajes de siempre", () => {
    expect(() => parseArgs(["pepe", "--lo-que-sea", "--otra"])).not.toThrow();
    expect(() => parseArgs(["journey", "inventado", "--lo-que-sea"])).not.toThrow();
    expect(() => parseArgs(["journey", "--project", "p"])).not.toThrow();
  });

  it("`--version` sin valor es la bandera global, también tras un comando", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["validate", "--version"]).version).toBe(true);
  });

  it("C18 (unidad): process run sigue aceptando los parámetros que declara el proceso", () => {
    const declarado = parseArgs(
      ["process", "run", "publicar", "--modulo", "inventario"],
      ["--modulo"],
    );
    expect(declarado.flags["modulo"]).toBe("inventario");

    // Lo que el proceso no declara lo rechaza el motor, con el catálogo delante.
    expect(() =>
      parseArgs(["process", "run", "publicar", "--otra", "--set", "a=1"]),
    ).not.toThrow();
    expect(
      parseArgs(["process", "run", "publicar", "--version", "1.2.3"], ["--version"]).flags[
        "version"
      ],
    ).toBe("1.2.3");
  });

  it("ninguna línea de USAGE es rechazada por el parser con las banderas que documenta", async () => {
    const t = await tabla();
    const rechazadas: string[] = [];
    let probadas = 0;
    for (const cita of t.citasDeAyuda(USAGE)) {
      if (cita.continuacion) continue;
      const subs = cita.subcomandos.length === 0 ? [undefined] : cita.subcomandos;
      for (const sub of subs) {
        const argv = [cita.comando, ...(sub === undefined ? [] : [sub])];
        for (const bandera of cita.banderas) {
          argv.push(bandera);
          if (t.banderasConValor().includes(bandera)) argv.push("valor");
        }
        probadas += 1;
        try {
          parseArgs(argv);
        } catch (caught) {
          rechazadas.push(`${argv.join(" ")} → ${(caught as Error).message}`);
        }
      }
    }
    expect(probadas).toBeGreaterThan(60);
    expect(rechazadas).toEqual([]);
  });
});
