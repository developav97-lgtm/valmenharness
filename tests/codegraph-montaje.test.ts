/**
 * CodeGraph se ofrece al adoptar un proyecto, y solo se indexa con confirmación.
 *
 * Lo que se protege:
 *
 * 1. **Ofrecer no es hacer.** Sin `--codegraph`, `valmen adopt` solo sondea
 *    (`codegraph status`); nunca lanza `init` ni `sync`, y no aparece `.codegraph/`.
 * 2. **La confirmación es una bandera explícita** y la simulación no ejecuta nada.
 * 3. **Instalar el binario no es del harness**: se imprime el comando del paquete.
 * 4. **CodeGraph es opcional**: un `init` que falla se informa y `adopt` sigue en 0.
 *
 * Ninguna prueba instala ni descarga nada ni depende del binario de la máquina: la
 * sonda y el ejecutor se inyectan, y el lanzamiento real se prueba contra un
 * `codegraph` falso que se antepone al `PATH` y que solo anota lo que le piden.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type CodegraphIndexResult,
  type CodegraphState,
  codegraphIndexCommand,
  runCodegraphIndex,
} from "../packages/cli/src/codegraph.js";
import { adoptProject } from "../packages/cli/src/commands.js";
import { USAGE, VALUE_OPTIONS, dispatch, parseArgs } from "../packages/cli/src/main.js";

let lab: string;
let pathAnterior: string | undefined;
let homeAnterior: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-codegraph-montaje-"));
  pathAnterior = process.env["PATH"];
  homeAnterior = process.env["HOME"];
  // Si algún camino resolviera `homedir()`, que no toque el de la persona.
  process.env["HOME"] = join(lab, "home");
  mkdirSync(process.env["HOME"], { recursive: true });
});

afterEach(() => {
  if (pathAnterior === undefined) delete process.env["PATH"];
  else process.env["PATH"] = pathAnterior;
  if (homeAnterior === undefined) delete process.env["HOME"];
  else process.env["HOME"] = homeAnterior;
  rmSync(lab, { recursive: true, force: true });
});

const NO_INSTALADO: CodegraphState = { estado: "no-instalado" };
const SIN_INDICE: CodegraphState = { estado: "sin-indice" };
const AL_DIA: CodegraphState = { estado: "al-dia" };
const DESACTUALIZADO: CodegraphState = {
  estado: "desactualizado",
  added: 2,
  modified: 4,
  removed: 1,
};
const ILEGIBLE: CodegraphState = {
  estado: "ilegible",
  motivo: "la salida de codegraph status no es JSON",
};

const TODOS: readonly CodegraphState[] = [
  NO_INSTALADO,
  SIN_INDICE,
  AL_DIA,
  DESACTUALIZADO,
  ILEGIBLE,
];

/** Un proyecto mínimo, con la forma que `onboarding verify` también usa. */
function proyecto(): void {
  writeFileSync(join(lab, "package.json"), '{"name":"demo"}\n', "utf8");
}

/** Anota cada sondeo y cada indexación; el ejecutor simula crear `.codegraph/`. */
function escenario(
  estado: CodegraphState,
  resultado?: (comando: string) => CodegraphIndexResult,
) {
  const sondeos: number[] = [];
  const indexaciones: { root: string; estado: string }[] = [];
  return {
    sondeos,
    indexaciones,
    opciones: {
      home: join(lab, "home"),
      probeCodegraph: () => {
        sondeos.push(1);
        return estado;
      },
      runCodegraph: (root: string, actual: CodegraphState) => {
        indexaciones.push({ root, estado: actual.estado });
        const comando = codegraphIndexCommand(root, actual) ?? "codegraph";
        const r = resultado?.(comando) ?? { comando, exitCode: 0, error: null };
        if (r.error === null) mkdirSync(join(root, ".codegraph"), { recursive: true });
        return r;
      },
    },
  };
}

describe("la oferta de CodeGraph al adoptar (sin --codegraph)", () => {
  it("C1: sin el binario la sección CodeGraph dice que no está instalado", () => {
    proyecto();
    const { opciones } = escenario(NO_INSTALADO);

    const r = adoptProject(lab, "Demo", opciones);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("CodeGraph (opcional)");
    expect(r.stdout).toMatch(/estado\s+no instalado/);
  });

  it("C2: sin el binario ofrece el comando del paquete y después valmen adopt --codegraph", () => {
    proyecto();
    const { opciones } = escenario(NO_INSTALADO);

    const { stdout } = adoptProject(lab, "Demo", opciones);

    const instalar = stdout.indexOf("npm install -g @colbymchenry/codegraph");
    const indexar = stdout.indexOf("valmen adopt --codegraph");
    expect(instalar).toBeGreaterThan(-1);
    expect(indexar).toBeGreaterThan(instalar);
    // Instalar lo hace la persona: el harness lo dice, no lo ejecuta.
    expect(stdout).toContain("instálelo usted");
  });

  it("C3: instalado y sin índice ofrece valmen adopt --codegraph, sin pedir instalar", () => {
    proyecto();
    const { opciones } = escenario(SIN_INDICE);

    const { stdout } = adoptProject(lab, "Demo", opciones);

    expect(stdout).toMatch(/estado\s+instalado, sin índice/);
    expect(stdout).toContain("valmen adopt --codegraph");
    expect(stdout).toContain("codegraph init");
    expect(stdout).not.toContain("npm install");
  });

  it("desactualizado dice cuánto falta y ofrece sincronizar", () => {
    proyecto();
    const { opciones } = escenario(DESACTUALIZADO);

    const { stdout } = adoptProject(lab, "Demo", opciones);

    expect(stdout).toContain("índice desactualizado (2 nuevos, 4 modificados, 1 borrados)");
    expect(stdout).toContain("valmen adopt --codegraph");
    expect(stdout).toContain("codegraph sync");
  });

  it("C4: con el índice al día dice que no hay nada que hacer y no ofrece nada", () => {
    proyecto();
    const { opciones } = escenario(AL_DIA);

    const { stdout } = adoptProject(lab, "Demo", opciones);

    expect(stdout).toMatch(/estado\s+instalado, indexado y al día/);
    expect(stdout).toContain("Nada que hacer");
    expect(stdout).not.toContain("valmen adopt --codegraph");
    expect(stdout).not.toContain("npm install");
  });

  it("ilegible dice el motivo y manda a revisarlo a mano, sin ofrecer indexar", () => {
    proyecto();
    const { opciones } = escenario(ILEGIBLE);

    const { stdout } = adoptProject(lab, "Demo", opciones);

    expect(stdout).toContain("no se pudo leer (la salida de codegraph status no es JSON)");
    expect(stdout).toContain("codegraph status");
    expect(stdout).not.toContain("valmen adopt --codegraph");
    expect(stdout).not.toMatch(/al día/);
  });

  it("C5: en ningún estado se lanza algo que no sea el sondeo, ni aparece .codegraph/", () => {
    for (const estado of TODOS) {
      rmSync(lab, { recursive: true, force: true });
      mkdirSync(lab, { recursive: true });
      proyecto();
      const { opciones, sondeos, indexaciones } = escenario(estado);

      // Normal y simulada, y sobre un proyecto ya adoptado.
      adoptProject(lab, "Demo", opciones);
      adoptProject(lab, "Demo", { ...opciones, dryRun: true });
      adoptProject(lab, "Demo", opciones);

      expect(indexaciones, estado.estado).toEqual([]);
      expect(sondeos, estado.estado).toHaveLength(3);
      expect(existsSync(join(lab, ".codegraph")), estado.estado).toBe(false);
    }
  });

  it("la oferta aparece también en la simulación, sin escribir nada", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(SIN_INDICE);

    const r = adoptProject(lab, "Demo", { ...opciones, dryRun: true });

    expect(r.stdout).toContain("Adopción (simulación)");
    expect(r.stdout).toContain("CodeGraph (opcional)");
    expect(r.stdout).toContain("valmen adopt --codegraph");
    expect(indexaciones).toEqual([]);
    expect(existsSync(join(lab, ".valmen"))).toBe(false);
  });
});

describe("la confirmación con --codegraph", () => {
  it("C6: sin índice lanza codegraph init sobre la raíz, una sola vez, y recuerda el MCP", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(SIN_INDICE);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(r.exitCode).toBe(0);
    expect(indexaciones).toEqual([{ root: lab, estado: "sin-indice" }]);
    expect(r.stdout).toContain(`Indexado: codegraph init ${lab}`);
    expect(r.stdout).toContain("valmen mcp --install");
    expect(existsSync(join(lab, ".codegraph"))).toBe(true);
    // Indexar no reemplaza la adopción: se escribió igual.
    expect(existsSync(join(lab, ".valmen", "config.yaml"))).toBe(true);
  });

  it("indexa después de escribir la adopción, no antes", () => {
    proyecto();
    const visto: boolean[] = [];
    const { opciones } = escenario(SIN_INDICE);
    const runCodegraph = opciones.runCodegraph;
    adoptProject(lab, "Demo", {
      ...opciones,
      codegraph: true,
      runCodegraph: (root, estado) => {
        visto.push(existsSync(join(root, ".valmen", "config.yaml")));
        return runCodegraph(root, estado);
      },
    });

    expect(visto).toEqual([true]);
  });

  it("C7: con el índice desactualizado lanza codegraph sync sobre la raíz", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(DESACTUALIZADO);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(indexaciones).toEqual([{ root: lab, estado: "desactualizado" }]);
    expect(r.stdout).toContain(`Indexado: codegraph sync ${lab}`);
  });

  it("al día no relanza nada aunque se confirme", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(AL_DIA);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(indexaciones).toEqual([]);
    expect(r.stdout).toContain("Nada que hacer");
    expect(existsSync(join(lab, ".codegraph"))).toBe(false);
  });

  it("C8: con --dry-run dice qué ejecutaría y no lo lanza ni escribe nada", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(SIN_INDICE);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true, dryRun: true });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(`Se ejecutaría: codegraph init ${lab}`);
    expect(r.stdout).toContain("no se lanzó nada");
    expect(indexaciones).toEqual([]);
    expect(existsSync(join(lab, ".codegraph"))).toBe(false);
    expect(existsSync(join(lab, ".valmen"))).toBe(false);
  });

  it("C8: con --dry-run y el índice desactualizado dice que ejecutaría sync", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(DESACTUALIZADO);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true, dryRun: true });

    expect(r.stdout).toContain(`Se ejecutaría: codegraph sync ${lab}`);
    expect(indexaciones).toEqual([]);
  });

  it("C9: con CodeGraph no instalado no lanza ninguna indexación y lo dice", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(NO_INSTALADO);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(r.exitCode).toBe(0);
    expect(indexaciones).toEqual([]);
    expect(r.stdout).toContain("CodeGraph no está instalado: no se indexó nada");
    expect(r.stdout).toContain("npm install -g @colbymchenry/codegraph");
  });

  it("C9: con el estado ilegible no lanza ninguna indexación y lo dice", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(ILEGIBLE);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(r.exitCode).toBe(0);
    expect(indexaciones).toEqual([]);
    expect(r.stdout).toContain("sin saber el estado no se indexó nada");
  });

  it("C10: en un proyecto ya adoptado indexa sin sobrescribir .valmen/config.yaml", () => {
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Original\n", "utf8");
    const { opciones, indexaciones } = escenario(SIN_INDICE);

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Ya existe una configuración");
    expect(r.stdout).toContain(`Indexado: codegraph init ${lab}`);
    expect(indexaciones).toEqual([{ root: lab, estado: "sin-indice" }]);
    expect(readFileSync(join(lab, ".valmen", "config.yaml"), "utf8")).toBe(
      "name: Original\n",
    );
    expect(existsSync(join(lab, ".codegraph"))).toBe(true);
  });

  it("C10: un proyecto ya adoptado también recibe la oferta, sin indexar", () => {
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Original\n", "utf8");
    const { opciones, indexaciones } = escenario(SIN_INDICE);

    const r = adoptProject(lab, "Demo", opciones);

    expect(r.stdout).toContain("Ya existe una configuración");
    expect(r.stdout).toContain("CodeGraph (opcional)");
    expect(r.stdout).toContain("valmen adopt --codegraph");
    expect(indexaciones).toEqual([]);
    expect(existsSync(join(lab, ".codegraph"))).toBe(false);
  });

  it("C11: un init que falla se informa con su código y adopt sigue saliendo con 0", () => {
    proyecto();
    const { opciones, indexaciones } = escenario(SIN_INDICE, (comando) => ({
      comando,
      exitCode: 3,
      error: "no se pudo abrir la base",
    }));

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
    expect(indexaciones).toHaveLength(1);
    expect(r.stdout).toContain(
      `Falló \`codegraph init ${lab}\` con código 3: no se pudo abrir la base`,
    );
    expect(r.stdout).not.toContain("valmen mcp --install");
    // Lo que la adopción ya escribió no se deshace.
    expect(existsSync(join(lab, ".valmen", "config.yaml"))).toBe(true);
  });

  it("C11: un init que vence el tope se informa como fallo, sin código, y adopt sigue en 0", () => {
    proyecto();
    const { opciones } = escenario(SIN_INDICE, (comando) => ({
      comando,
      exitCode: null,
      error: "no terminó en 600 s y se detuvo",
    }));

    const r = adoptProject(lab, "Demo", { ...opciones, codegraph: true });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("no terminó en 600 s y se detuvo");
    expect(r.stdout).not.toMatch(/con código/);
  });
});

/** Un `codegraph` falso: anota lo que le piden y responde como el real, sin descargar nada. */
function codegraphFalso(opciones: { falla?: number } = {}): { dir: string; log: string } {
  const dir = join(lab, "bin");
  const log = join(lab, "codegraph.log");
  mkdirSync(dir, { recursive: true });
  const guion = [
    "#!/bin/sh",
    `echo "$1 $2 cwd=$(pwd)" >> "${log}"`,
    'case "$1" in',
    "  status)",
    '    if [ -d ".codegraph" ]; then',
    '      echo \'{"initialized":true,"pendingChanges":{"added":0,"modified":0,"removed":0}}\'',
    "    else",
    "      echo '{\"initialized\":false}'",
    "    fi ;;",
    "  init|sync)",
    ...(opciones.falla === undefined
      ? ['    mkdir -p "$2/.codegraph" ;;']
      : ['    echo "no se pudo abrir la base" >&2', `    exit ${opciones.falla} ;;`]),
    "esac",
    "",
  ].join("\n");
  const binario = join(dir, "codegraph");
  writeFileSync(binario, guion, "utf8");
  chmodSync(binario, 0o755);
  return { dir, log };
}

/** El `PATH` del falso: su carpeta primero (tapa a cualquier `codegraph` real) y lo básico de POSIX. */
function pathConFalso(dir: string): string {
  return [dir, "/usr/bin", "/bin"].join(delimiter);
}

/** Las líneas que el `codegraph` falso anotó, o ninguna si nunca se lanzó. */
function llamadas(log: string): string[] {
  return existsSync(log)
    ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean)
    : [];
}

describe("runCodegraphIndex lanza el binario solo cuando el estado lo pide", () => {
  it("sin índice lanza init con la raíz como argumento y como directorio de trabajo", () => {
    const { dir, log } = codegraphFalso();
    const raiz = join(lab, "proyecto");
    mkdirSync(raiz);

    const r = runCodegraphIndex(raiz, SIN_INDICE, { PATH: pathConFalso(dir) });

    expect(r).toEqual({ comando: `codegraph init ${raiz}`, exitCode: 0, error: null });
    expect(llamadas(log)).toHaveLength(1);
    expect(llamadas(log)[0]).toMatch(new RegExp(`^init ${raiz} cwd=.*/proyecto$`));
    expect(existsSync(join(raiz, ".codegraph"))).toBe(true);
  });

  it("desactualizado lanza sync", () => {
    const { dir, log } = codegraphFalso();
    const raiz = join(lab, "proyecto");
    mkdirSync(raiz);

    const r = runCodegraphIndex(raiz, DESACTUALIZADO, { PATH: pathConFalso(dir) });

    expect(r?.comando).toBe(`codegraph sync ${raiz}`);
    expect(llamadas(log)[0]).toMatch(/^sync /);
  });

  it("al día, no instalado e ilegible no lanzan nada", () => {
    const { dir, log } = codegraphFalso();
    for (const estado of [AL_DIA, NO_INSTALADO, ILEGIBLE]) {
      expect(
        runCodegraphIndex(lab, estado, { PATH: pathConFalso(dir) }),
        estado.estado,
      ).toBeNull();
    }
    expect(llamadas(log)).toEqual([]);
  });

  it("una salida distinta de 0 devuelve su código y su motivo, sin lanzar", () => {
    const { dir } = codegraphFalso({ falla: 3 });

    const r = runCodegraphIndex(lab, SIN_INDICE, { PATH: pathConFalso(dir) });

    expect(r).toEqual({
      comando: `codegraph init ${lab}`,
      exitCode: 3,
      error: "no se pudo abrir la base",
    });
  });

  it("sin el binario en el PATH devuelve el error en vez de lanzar", () => {
    const vacio = join(lab, "vacio");
    mkdirSync(vacio);

    const r = runCodegraphIndex(lab, SIN_INDICE, { PATH: vacio });

    expect(r?.exitCode).toBeNull();
    expect(r?.error).toContain("ENOENT");
  });

  it("una raíz con espacios se muestra entre comillas pero se pasa entera", () => {
    const { dir, log } = codegraphFalso();
    const raiz = join(lab, "mi proyecto");
    mkdirSync(raiz);

    const r = runCodegraphIndex(raiz, SIN_INDICE, { PATH: pathConFalso(dir) });

    expect(r?.comando).toBe(`codegraph init ${JSON.stringify(raiz)}`);
    expect(llamadas(log)[0]).toContain(`init ${raiz} `);
    expect(r?.error).toBeNull();
  });
});

describe("de la bandera al binario, con un codegraph falso en el PATH", () => {
  it("C15: --codegraph crea .codegraph/ y una segunda corrida informa al día sin relanzar init", () => {
    proyecto();
    const { dir, log } = codegraphFalso();
    process.env["PATH"] = `${dir}${delimiter}${pathAnterior ?? ""}`;
    const argv = ["adopt", "--root", lab];

    // Sin la bandera: ofrece, solo sondea y no crea nada.
    const oferta = dispatch(parseArgs(argv));
    expect(oferta.exitCode).toBe(0);
    expect(oferta.stdout).toContain("valmen adopt --codegraph");
    expect(existsSync(join(lab, ".codegraph"))).toBe(false);
    expect(llamadas(log).every((linea) => linea.startsWith("status "))).toBe(true);

    // Con la bandera: indexa, y es un proyecto que la corrida anterior ya adoptó.
    const indexada = dispatch(parseArgs([...argv, "--codegraph"]));
    expect(indexada.exitCode).toBe(0);
    expect(indexada.stdout).toContain(`Indexado: codegraph init ${lab}`);
    expect(existsSync(join(lab, ".codegraph"))).toBe(true);

    // Repetirlo: al día, sin relanzar init.
    const repetida = dispatch(parseArgs([...argv, "--codegraph"]));
    expect(repetida.exitCode).toBe(0);
    expect(repetida.stdout).toContain("Nada que hacer");
    expect(llamadas(log).filter((linea) => linea.startsWith("init "))).toHaveLength(1);
  });

  it("C11: si el codegraph real falla, adopt informa el código y sale con 0", () => {
    proyecto();
    const { dir } = codegraphFalso({ falla: 7 });
    process.env["PATH"] = `${dir}${delimiter}${pathAnterior ?? ""}`;

    const r = dispatch(parseArgs(["adopt", "--root", lab, "--codegraph"]));

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("con código 7: no se pudo abrir la base");
  });
});

describe("la ayuda y la guía de puesta en marcha", () => {
  it("C12: valmen --help lista --codegraph en la línea de adopt", () => {
    const linea = USAGE.split("\n").find((l) => l.trimStart().startsWith("adopt "));

    expect(linea).toContain("[--codegraph]");
    expect(USAGE).toContain("sin la bandera nunca se ejecuta");
  });

  it("--codegraph es una bandera booleana: no consume el argumento que sigue", () => {
    expect(VALUE_OPTIONS as readonly string[]).not.toContain("--codegraph");
    const opciones = parseArgs(["adopt", "--codegraph", "--dry-run"]);
    expect(opciones.flags["codegraph"]).toBe(true);
    expect(opciones.flags["dry-run"]).toBe(true);
    expect(opciones.positionals).toEqual(["adopt"]);
  });

  it("C13: el texto para el agente pide preguntar antes de correr valmen adopt --codegraph", () => {
    const guia = readFileSync(
      join(process.cwd(), "docs", "15-PUESTA-EN-MARCHA.md"),
      "utf8",
    );
    const texto = guia.slice(guia.indexOf("## Para el agente: el texto que se le pega"));
    const paso = texto
      .split("\n")
      .findIndex((l) => l.includes("Preguntame si querés CodeGraph"));
    expect(paso).toBeGreaterThan(-1);

    // El párrafo se parte en renglones en la guía: se compara sin esos saltos.
    const bloque = texto
      .split("\n")
      .slice(paso, paso + 4)
      .join(" ")
      .replace(/\s+/g, " ");
    expect(bloque).toContain("Sólo si lo autorizás");
    expect(bloque).toContain("valmen adopt --codegraph");
    expect(bloque).toContain("no instales nada global sin que te lo diga");
  });

  it("la guía documenta los tres pasos de CodeGraph como opcionales", () => {
    const guia = readFileSync(
      join(process.cwd(), "docs", "15-PUESTA-EN-MARCHA.md"),
      "utf8",
    );
    const inicio = guia.indexOf("### CodeGraph (opcional)");
    expect(inicio).toBeGreaterThan(-1);
    const seccion = guia.slice(inicio, guia.indexOf("\n---", inicio));

    const instalar = seccion.indexOf("npm install -g @colbymchenry/codegraph");
    const indexar = seccion.indexOf("valmen adopt --codegraph");
    const mcp = seccion.indexOf("valmen mcp --install");
    expect(instalar).toBeGreaterThan(-1);
    expect(indexar).toBeGreaterThan(instalar);
    expect(mcp).toBeGreaterThan(indexar);
  });
});
