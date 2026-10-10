/**
 * Coherencia de los mensajes con lo que el CLI y el MCP aceptan
 * (FEATURE-CLI-PRUEBA-MENSAJES-20261010).
 *
 * Dos reglas del sprint S1 de `guardas-verificacion-harness`:
 *
 * - R-MSG-002: cada comando, bandera y herramienta MCP que un texto cita existe. Un
 *   rechazo que manda correr `valmen qa-agent --forzar` cuando la bandera no existe
 *   deja a quien lo lee —una persona o un agente— con una orden que sale con código 2.
 *   Hasta ahora nada cruzaba los mensajes con la tabla de comandos
 *   (`packages/cli/src/command-table.ts`) ni con el catálogo `TOOLS` del MCP.
 * - R-MSG-004, la parte estática: la salida que nombra un mensaje de bloqueo es un
 *   comando que el CLI acepta. Que correrla saque del bloqueo se mide aparte
 *   (FEATURE-BENCH-FRICCION-CORPUS-20261010).
 *
 * Qué se lee:
 *
 * - Los literales de cadena de `packages/*\/src/**\/*.ts`, con el compilador de
 *   TypeScript y no con expresiones regulares por línea: así los comentarios no se leen
 *   y una cita partida en dos literales unidos con `+` se lee entera.
 * - El texto de instrucciones que un agente obedece: `.valmen/skills/`, `skills/`,
 *   `AGENTS.md`, `README.md`, `templates/**\/*.md` y `.valmen/rules/`.
 *
 * Qué cuenta como cita: `` `valmen …` `` entre comillas invertidas; en Markdown, además,
 * las líneas de un bloque de código que empiezan por `valmen`; en un literal del código,
 * además, `valmen <comando>` sin comillas, que es como están escritos los defectos que
 * motivaron la prueba. En Markdown la forma sin comillas no cuenta: en prosa es ruido.
 *
 * Lo que no se comprueba, a sabiendas: los argumentos posicionales y su orden
 * (`valmen gate --id X`, sin compuerta, pasa) y una cita armada en tiempo de ejecución
 * (`valmen ${comando}`).
 *
 * Los ayudantes viven en este archivo: ningún código de producción los consume.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_POLICY, buildReceipt, decide } from "../packages/gate/src/index.js";
import type { GateReceipt, Proposition } from "../packages/gate/src/index.js";
import {
  appendReceipt,
  buildGateState,
  pendingApprovals,
} from "../packages/engine/src/index.js";
import type { CommandRunner, RegistryPaths } from "../packages/engine/src/index.js";
import { decideByCode, hermesNotify } from "../packages/cli/src/hermes.js";
import {
  banderasValidas,
  especDe,
  existeComando,
  parseArgs,
} from "../packages/cli/src/index.js";
import type { EspecComando } from "../packages/cli/src/index.js";
import { TOOLS } from "../packages/mcp/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const REPO = join(import.meta.dirname, "..");

/**
 * Lo que el recorrido no lee, y por qué. Una ruta que empieza por una de estas no se
 * recorre: el motivo está escrito para poder discutirlo cuando cambie.
 */
const EXCLUIDOS: Readonly<Record<string, string>> = {
  "docs/":
    "visión, diseño, hoja de ruta, propuestas, migración, partes diarios y evidencia: " +
    "citan a propósito comandos propuestos, futuros o retirados, y corregirlos " +
    "reescribiría el registro; R-MSG-002 acota el recorrido al código y a las skills",
  "packages/server/web/":
    "está fuera de packages/*/src: es la interfaz web, que hoy cita 5 comandos y todos existen",
  "tests/": "pruebas que citan comandos inventados a propósito, como esta",
  "tickets/": "historial append-only: lo escrito allí no se reescribe",
  ".valmen/features/": "specs que citan los escenarios, entre ellos el comando inventado",
};

function excluida(ruta: string): boolean {
  return Object.keys(EXCLUIDOS).some((prefijo) => ruta.startsWith(prefijo));
}

// --- Leer los literales del código --------------------------------------------------

/** Lo que ocupa una interpolación (`${…}`) o un operando que no es un literal. */
const MARCADOR = "<expr>";

/** Un trozo de un fragmento: un literal tal como está escrito, o un marcador. */
interface Pieza {
  /** Dónde empieza en el texto unido del fragmento. */
  readonly inicio: number;
  /** El texto ya interpretado: un `\n` escrito es un salto de línea. */
  readonly texto: string;
  /** El literal tal como está en el fuente, con sus comillas; `null` si es un marcador. */
  readonly crudo: string | null;
  /** La línea del fuente donde empieza el literal. */
  readonly linea: number;
}

/** Un texto del código: un literal, o varios unidos con `+`, con interpolaciones. */
interface Fragmento {
  readonly texto: string;
  readonly piezas: readonly Pieza[];
}

/**
 * Los textos que el código escribe: literales de cadena y plantillas, con cada `${…}`
 * vuelto `<expr>`, y las cadenas unidas con `+` en un solo texto (un operando que no es
 * un literal también se vuelve `<expr>`). Los comentarios no son literales: no se leen.
 */
function literalesDe(ruta: string, fuente: string): Fragmento[] {
  const archivo = ts.createSourceFile(
    ruta,
    fuente,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const fragmentos: Fragmento[] = [];

  const esSuma = (nodo: ts.Node): nodo is ts.BinaryExpression =>
    ts.isBinaryExpression(nodo) && nodo.operatorToken.kind === ts.SyntaxKind.PlusToken;

  const esTexto = (nodo: ts.Node): boolean =>
    ts.isStringLiteral(nodo) ||
    ts.isNoSubstitutionTemplateLiteral(nodo) ||
    ts.isTemplateExpression(nodo);

  /** Los operandos de una cadena de `+`, de izquierda a derecha. */
  const aplanar = (expresion: ts.Expression): ts.Expression[] => {
    if (esSuma(expresion)) return [...aplanar(expresion.left), ...aplanar(expresion.right)];
    if (ts.isParenthesizedExpression(expresion) && esSuma(expresion.expression)) {
      return aplanar(expresion.expression);
    }
    return [expresion];
  };

  const unir = (operandos: readonly ts.Expression[]): void => {
    let texto = "";
    const piezas: Pieza[] = [];
    const agregar = (parte: string, nodo: ts.Node | null): void => {
      piezas.push({
        inicio: texto.length,
        texto: parte,
        crudo: nodo === null ? null : nodo.getText(archivo),
        linea:
          nodo === null
            ? 0
            : archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1,
      });
      texto += parte;
    };

    for (const operando of operandos) {
      if (ts.isStringLiteral(operando) || ts.isNoSubstitutionTemplateLiteral(operando)) {
        agregar(operando.text, operando);
      } else if (ts.isTemplateExpression(operando)) {
        agregar(operando.head.text, operando.head);
        for (const tramo of operando.templateSpans) {
          agregar(MARCADOR, null);
          visitar(tramo.expression);
          agregar(tramo.literal.text, tramo.literal);
        }
      } else {
        agregar(MARCADOR, null);
        visitar(operando);
      }
    }
    fragmentos.push({ texto, piezas });
  };

  function visitar(nodo: ts.Node): void {
    if (esSuma(nodo)) {
      const operandos = aplanar(nodo);
      if (operandos.some(esTexto)) {
        unir(operandos);
        return;
      }
    }
    if (ts.isExpression(nodo) && esTexto(nodo)) {
      unir([nodo]);
      return;
    }
    ts.forEachChild(nodo, visitar);
  }

  visitar(archivo);
  return fragmentos;
}

/**
 * La línea del fuente donde está `aguja` en `offset` del texto unido del fragmento.
 *
 * Un literal de plantilla puede ocupar varias líneas: se busca la misma aparición de
 * `aguja` en lo escrito (la que lleva el mismo orden dentro de la pieza) y se cuentan
 * los saltos de línea reales hasta ella.
 */
function lineaEnFragmento(fragmento: Fragmento, offset: number, aguja: string): number {
  const pieza = fragmento.piezas.find(
    (p) => p.crudo !== null && offset >= p.inicio && offset < p.inicio + p.texto.length,
  );
  if (pieza === undefined || pieza.crudo === null) {
    return fragmento.piezas.find((p) => p.crudo !== null)?.linea ?? 0;
  }
  const antes = pieza.texto.slice(0, offset - pieza.inicio);
  let orden = 0;
  for (let i = antes.indexOf(aguja); i !== -1; i = antes.indexOf(aguja, i + aguja.length)) {
    orden += 1;
  }
  let posicion = -1;
  for (let n = 0; n <= orden; n += 1) {
    posicion = pieza.crudo.indexOf(aguja, posicion + 1);
    if (posicion === -1) break;
  }
  const saltos =
    posicion === -1 ? 0 : pieza.crudo.slice(0, posicion).split("\n").length - 1;
  return pieza.linea + saltos;
}

/** La línea de un texto plano (Markdown) en la que cae `offset`. */
function lineaEnTexto(texto: string, offset: number): number {
  return texto.slice(0, offset).split("\n").length;
}

// --- Encontrar las citas ------------------------------------------------------------

type Origen = "codigo" | "markdown";

/** Algo que un texto cita: dónde empieza y lo citado. */
interface Encontrada {
  readonly offset: number;
  readonly texto: string;
}

/** Dónde acaba una cita sin comillas dentro de un literal del código. */
const FIN_SIN_COMILLAS = /\n|  |\(| — |»|"|#|\)|[.;,](?=\s|$)/;

/** Lo que sobra al final de una cita: puntuación y comillas de la frase que la rodea. */
const COLA_DE_CITA = /[\s.,;:!?'`]+$/;

/**
 * Las citas `valmen …` de un texto, sin el `valmen ` del principio.
 *
 * Entre comillas invertidas, en los dos orígenes. En Markdown, además, las líneas de un
 * bloque de código que empiezan por `valmen` (cortadas en el comentario `#` y partidas
 * en `&&`). En un literal del código, además, `valmen <comando>` sin comillas cuando
 * va al inicio o tras un espacio, `:`, `(`, `«` o una comilla.
 */
function citasDe(texto: string, origen: Origen): Encontrada[] {
  const citas: Encontrada[] = [];
  const agregar = (offset: number, cruda: string): void => {
    const limpia = cruda.replace(COLA_DE_CITA, "").trim();
    if (limpia !== "") citas.push({ offset, texto: limpia });
  };

  for (const m of texto.matchAll(/`valmen ([^`\n]+)`/g)) {
    agregar(m.index + 1, m[1] ?? "");
  }

  if (origen === "markdown") {
    let enBloque = false;
    let desplazamiento = 0;
    for (const linea of texto.split("\n")) {
      if (/^\s*```/.test(linea)) {
        enBloque = !enBloque;
      } else if (enBloque) {
        const sinComentario = linea.split(/\s#/)[0] ?? "";
        for (const tramo of sinComentario.split("&&")) {
          const m = /^\s*(?:\$\s+)?valmen\s+(\S.*)$/.exec(tramo);
          if (m !== null) agregar(desplazamiento, m[1] ?? "");
        }
      }
      desplazamiento += linea.length + 1;
    }
  } else {
    for (const m of texto.matchAll(/(?<=^|[\s:(«"'])valmen (?=\S)/g)) {
      const resto = texto.slice(m.index + "valmen ".length);
      const fin = resto.search(FIN_SIN_COMILLAS);
      agregar(m.index, fin === -1 ? resto : resto.slice(0, fin));
    }
  }
  return citas;
}

// --- Comprobar una cita contra la tabla y el catálogo ---------------------------------

/** Una pieza de una cita que no existe: comando, verbo, bandera o herramienta. */
interface Falla {
  readonly tipo: "comando" | "verbo" | "bandera" | "herramienta";
  readonly pieza: string;
}

const PALABRA = /^[a-z][a-z0-9-]*$/;
const VERBOS = /^[a-z][a-z0-9-]*(\|[a-z][a-z0-9-]*)*$/;

/**
 * Lo que una cita —sin el `valmen ` del principio— nombra y no existe.
 *
 * Quita `[` y `]`; el primer token es el comando, y si no tiene forma de palabra
 * (`<expr>`, `…`) o es el marcador de versión (`v0.0.1`) la cita no se comprueba. Con un
 * comando que tiene verbos y un segundo token que es una palabra, cada alternativa de
 * `a|b` tiene que ser un verbo; sin verbo, las banderas se comparan con la unión de las
 * del comando y las de todos sus verbos. Una ruta con banderas libres (`process run`)
 * no rechaza ninguna.
 */
function revisarCita(cita: string): Falla[] {
  const fichas = cita.replace(/[[\]]/g, "").trim().split(/\s+/);
  const comando = fichas[0] ?? "";
  if (!PALABRA.test(comando) || /^v\d/.test(comando)) return [];
  if (!existeComando([comando])) return [{ tipo: "comando", pieza: comando }];

  const espec = especDe([comando]) as EspecComando;
  const verbosDeclarados = Object.keys(espec.subcomandos ?? {});
  const segundo = fichas[1];
  const verbos =
    verbosDeclarados.length > 0 && segundo !== undefined && VERBOS.test(segundo)
      ? segundo.split("|")
      : [];

  const fallas: Falla[] = verbos
    .filter((verbo) => !existeComando([comando, verbo]))
    .map((verbo) => ({ tipo: "verbo", pieza: verbo }));
  if (fallas.length > 0) return fallas;

  const rutas: string[][] =
    verbos.length > 0
      ? verbos.map((verbo) => [comando, verbo])
      : [[comando], ...verbosDeclarados.map((verbo) => [comando, verbo])];
  if (rutas.some((ruta) => especDe(ruta)?.banderasLibres === true)) return [];

  const validas = new Set(rutas.flatMap((ruta) => banderasValidas(ruta)));
  const citadas = new Set(
    [
      ...fichas
        .slice(1)
        .join(" ")
        .matchAll(/(?<![\w-])--[a-z][a-z0-9-]*/g),
    ].map((m) => m[0]),
  );
  for (const bandera of citadas) {
    if (!validas.has(bandera)) fallas.push({ tipo: "bandera", pieza: bandera });
  }
  return fallas;
}

const NOMBRES_DE_HERRAMIENTAS: ReadonlySet<string> = new Set(TOOLS.map((t) => t.name));
const PREFIJOS_DE_HERRAMIENTAS: ReadonlySet<string> = new Set(
  TOOLS.map((t) => t.name.split("_")[0] ?? t.name),
);

/**
 * Los identificadores entre comillas invertidas que se leen como una herramienta MCP:
 * los que llevan guion bajo y cuyo primer segmento es el de alguna herramienta real
 * (`reanudar_`, `ver_`, `mover_`…). Un identificador con otro prefijo
 * (`workflow_status`, un campo) no se comprueba.
 */
function herramientasCitadas(texto: string): Encontrada[] {
  const citadas: Encontrada[] = [];
  for (const m of texto.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
    const nombre = m[1] ?? "";
    if (PREFIJOS_DE_HERRAMIENTAS.has(nombre.split("_")[0] ?? "")) {
      citadas.push({ offset: m.index + 1, texto: nombre });
    }
  }
  return citadas;
}

// --- Lo leído, y los hallazgos ---------------------------------------------------------

/** Una cita leída de un archivo, con lo que de ella no existe. */
interface Leida {
  readonly ruta: string;
  readonly linea: number;
  readonly cita: string;
  readonly fallas: readonly Falla[];
}

interface Lectura {
  /** Cuántos archivos se leyeron. */
  archivos: number;
  /** Las citas `valmen …`. */
  readonly citas: Leida[];
  /** Los identificadores que se leen como herramienta MCP. */
  readonly herramientas: Leida[];
}

function lecturaVacia(): Lectura {
  return { archivos: 0, citas: [], herramientas: [] };
}

function leer(
  ruta: string,
  texto: string,
  origen: Origen,
  lineaEn: (offset: number, aguja: string) => number,
  lectura: Lectura,
): void {
  for (const c of citasDe(texto, origen)) {
    lectura.citas.push({
      ruta,
      linea: lineaEn(c.offset, "valmen"),
      cita: `valmen ${c.texto}`,
      fallas: revisarCita(c.texto),
    });
  }
  for (const h of herramientasCitadas(texto)) {
    lectura.herramientas.push({
      ruta,
      linea: lineaEn(h.offset, h.texto),
      cita: h.texto,
      fallas: NOMBRES_DE_HERRAMIENTAS.has(h.texto)
        ? []
        : [{ tipo: "herramienta", pieza: h.texto }],
    });
  }
}

/** Lo que citan los literales de un archivo de código. */
function lecturaDeCodigo(ruta: string, fuente: string): Lectura {
  const lectura = lecturaVacia();
  lectura.archivos = 1;
  for (const fragmento of literalesDe(ruta, fuente)) {
    leer(
      ruta,
      fragmento.texto,
      "codigo",
      (offset, aguja) => lineaEnFragmento(fragmento, offset, aguja),
      lectura,
    );
  }
  return lectura;
}

/** Lo que cita un texto de instrucciones (Markdown). */
function lecturaDeTexto(ruta: string, texto: string): Lectura {
  const lectura = lecturaVacia();
  lectura.archivos = 1;
  leer(ruta, texto, "markdown", (offset) => lineaEnTexto(texto, offset), lectura);
  return lectura;
}

function juntar(lecturas: readonly Lectura[]): Lectura {
  const total = lecturaVacia();
  for (const lectura of lecturas) {
    total.archivos += lectura.archivos;
    total.citas.push(...lectura.citas);
    total.herramientas.push(...lectura.herramientas);
  }
  return total;
}

/** Un hallazgo por cada pieza inexistente: `ruta:línea — <pieza> en «<cita>»`. */
function hallazgosDe(leidas: readonly Leida[]): string[] {
  return leidas.flatMap((l) =>
    l.fallas.map((f) => `${l.ruta}:${l.linea} — ${f.tipo} ${f.pieza} en «${l.cita}»`),
  );
}

// --- Recorrer el repositorio ------------------------------------------------------------

function relativa(ruta: string): string {
  return relative(REPO, ruta).split(sep).join("/");
}

/** Los archivos con `extension` bajo `base` (una carpeta o un archivo), sin los excluidos. */
function archivosDe(base: string, extension: string): string[] {
  const salida: string[] = [];
  const recorrer = (ruta: string): void => {
    if (!existsSync(ruta)) return;
    const entradas = readdirSync(ruta, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    );
    for (const entrada of entradas) {
      const hija = join(ruta, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== "node_modules" && entrada.name !== "dist") recorrer(hija);
      } else if (entrada.name.endsWith(extension) && !entrada.name.endsWith(".d.ts")) {
        salida.push(relativa(hija));
      }
    }
  };
  recorrer(join(REPO, base));
  return salida.filter((ruta) => !excluida(ruta));
}

function leerArchivos(rutas: readonly string[], origen: Origen): Lectura {
  return juntar(
    rutas.map((ruta) => {
      const contenido = readFileSync(join(REPO, ruta), "utf8");
      return origen === "codigo"
        ? lecturaDeCodigo(ruta, contenido)
        : lecturaDeTexto(ruta, contenido);
    }),
  );
}

const memo = <T>(calcular: () => T): (() => T) => {
  let valor: { readonly v: T } | undefined;
  return () => (valor ??= { v: calcular() }).v;
};

/** Los literales de `packages/*\/src/**\/*.ts`. */
const delCodigo = memo(() =>
  leerArchivos(
    readdirSync(join(REPO, "packages"))
      .sort()
      .flatMap((paquete) => archivosDe(`packages/${paquete}/src`, ".ts")),
    "codigo",
  ),
);

const deLasSkillsDelRegistro = memo(() =>
  leerArchivos(archivosDe(".valmen/skills", ".md"), "markdown"),
);
const deLasSkillsDelCatalogo = memo(() =>
  leerArchivos(archivosDe("skills", ".md"), "markdown"),
);
const deLasReglasYGuias = memo(() =>
  leerArchivos(
    [
      ...["AGENTS.md", "README.md"].filter((ruta) => existsSync(join(REPO, ruta))),
      ...archivosDe("templates", ".md"),
      ...archivosDe(".valmen/rules", ".md"),
    ],
    "markdown",
  ),
);
const deLasInstrucciones = memo(() =>
  juntar([deLasSkillsDelRegistro(), deLasSkillsDelCatalogo(), deLasReglasYGuias()]),
);

/** Afirma que el recorrido leyó algo —una lectura vacía pasaría sin probar nada— y no halló nada. */
function sinHallazgos(lectura: Lectura, que: "citas" | "herramientas"): void {
  expect(lectura.archivos, "el recorrido no encontró archivos que leer").toBeGreaterThan(0);
  expect(lectura[que].length, "el recorrido no leyó ninguna cita").toBeGreaterThan(0);
  const hallazgos = hallazgosDe(lectura[que]);
  expect(
    hallazgos,
    `${hallazgos.length} pieza(s) citada(s) que no existen:\n${hallazgos.join("\n")}`,
  ).toEqual([]);
}

// --- Los textos sintéticos de los casos de control -----------------------------------------

const RUTA_FALSA = "packages/falso/src/cierre.ts";

/** Un `fail()` que manda correr una bandera que no existe, con un comentario que no se lee. */
const FUENTE_CON_BANDERA_INVENTADA = [
  'import { fail } from "@valmen/core";',
  "// Corre `valmen inventado-en-un-comentario` para pasar.",
  "export function cerrar(): never {",
  '  return fail("Falta la autorización: corre `valmen qa-agent --forzar` para saltarla.");',
  "}",
  'export const AYUDA = "Para ver el estado corre `valmen gate plan --id X`.";',
].join("\n");

/** Una cita sin comillas invertidas, con la bandera `--gate` que `gate` no tiene. */
const FUENTE_SIN_COMILLAS = [
  "export const MENSAJE =",
  '  "Volvé a evaluar la compuerta:\\n" +',
  '  "  valmen gate --id X --gate plan\\n";',
].join("\n");

/** Una cita partida en dos literales unidos con `+`, con un identificador en medio. */
const FUENTE_PARTIDA = [
  "export function aviso(id: string): string {",
  '  return "Acepta la regla con `valmen estandar aceptar " + id + " --inventada` y sigue.";',
  "}",
].join("\n");

/** Un comando interpolado: no se puede comprobar y no se rechaza. */
const FUENTE_INTERPOLADA = [
  "export function aviso(comando: string): string {",
  "  return `Repetí \\`valmen ${comando}\\`: retoma desde ahí.`;",
  "}",
].join("\n");

// --- Las pruebas ---------------------------------------------------------------------------

describe("lo que citan los literales del código existe (R-MSG-002)", () => {
  it("C1: cada cita `valmen …` de los literales de packages/*/src es válida contra la tabla", () => {
    sinHallazgos(delCodigo(), "citas");
  });

  it("C5: cada herramienta MCP citada en los literales de packages/*/src está en TOOLS", () => {
    sinHallazgos(delCodigo(), "herramientas");
  });
});

describe("lo que citan las instrucciones existe (R-MSG-002)", () => {
  it("C2: cada cita `valmen …` de .valmen/skills es válida contra la tabla", () => {
    sinHallazgos(deLasSkillsDelRegistro(), "citas");
  });

  it("C3: cada cita `valmen …` de skills es válida contra la tabla", () => {
    sinHallazgos(deLasSkillsDelCatalogo(), "citas");
  });

  it("C4: cada cita `valmen …` de AGENTS.md, README.md, templates y .valmen/rules es válida", () => {
    sinHallazgos(deLasReglasYGuias(), "citas");
  });

  it("C6: cada herramienta MCP citada en las instrucciones recorridas está en TOOLS", () => {
    sinHallazgos(deLasInstrucciones(), "herramientas");
  });
});

describe("la prueba detecta lo que no existe (R-MSG-002)", () => {
  it("C7: un fail() que dice «corre `valmen qa-agent --forzar`» da un hallazgo con ruta:línea", () => {
    const lectura = lecturaDeCodigo(RUTA_FALSA, FUENTE_CON_BANDERA_INVENTADA);
    const hallazgos = hallazgosDe(lectura.citas);

    // Un solo hallazgo: la cita válida de la línea 6 pasa y el comentario de la línea 2 no se lee.
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatch(new RegExp(`^${RUTA_FALSA.replace(/\./g, "\\.")}:4 — `));
  });

  it("C8: el hallazgo de `valmen qa-agent --forzar` nombra la bandera --forzar", () => {
    const hallazgos = hallazgosDe(
      lecturaDeCodigo(RUTA_FALSA, FUENTE_CON_BANDERA_INVENTADA).citas,
    );
    expect(hallazgos[0]).toContain("bandera --forzar en «valmen qa-agent --forzar»");
  });

  it("C9: una skill que cita `reanudar_tiket` da un hallazgo que nombra la skill", () => {
    const skill = "skills/falsa/SKILL.md";
    const texto =
      "# Falsa\n\nRetoma con `reanudar_tiket`, mira `ver_ticket` y el campo `workflow_status`.\n";
    const hallazgos = hallazgosDe(lecturaDeTexto(skill, texto).herramientas);

    // `ver_ticket` existe y `workflow_status` es un campo, no una herramienta: ninguno da hallazgo.
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatch(/^skills\/falsa\/SKILL\.md:3 — /);
  });

  it("C10: el hallazgo de esa skill nombra la herramienta reanudar_tiket", () => {
    const texto = "# Falsa\n\nRetoma con `reanudar_tiket`.\n";
    const hallazgos = hallazgosDe(
      lecturaDeTexto("skills/falsa/SKILL.md", texto).herramientas,
    );
    expect(hallazgos).toEqual([
      "skills/falsa/SKILL.md:3 — herramienta reanudar_tiket en «reanudar_tiket»",
    ]);
  });

  it("C11: la cita `valmen journey inventado` da un hallazgo que nombra el verbo inventado", () => {
    const hallazgos = hallazgosDe(
      lecturaDeTexto("skills/falsa/SKILL.md", "Corre `valmen journey inventado`.\n").citas,
    );
    expect(hallazgos).toEqual([
      "skills/falsa/SKILL.md:1 — verbo inventado en «valmen journey inventado»",
    ]);
  });

  it("C12: la cita `valmen inventado` da un hallazgo que nombra el comando inventado", () => {
    const hallazgos = hallazgosDe(
      lecturaDeTexto("skills/falsa/SKILL.md", "Corre `valmen inventado`.\n").citas,
    );
    expect(hallazgos).toEqual([
      "skills/falsa/SKILL.md:1 — comando inventado en «valmen inventado»",
    ]);
  });

  it("C13: una cita sin comillas invertidas dentro de un literal da el hallazgo de --gate", () => {
    const hallazgos = hallazgosDe(lecturaDeCodigo(RUTA_FALSA, FUENTE_SIN_COMILLAS).citas);
    expect(hallazgos).toEqual([
      `${RUTA_FALSA}:3 — bandera --gate en «valmen gate --id X --gate plan»`,
    ]);
  });

  it("C14: una cita partida en dos literales unidos con + da el hallazgo de su bandera", () => {
    const hallazgos = hallazgosDe(lecturaDeCodigo(RUTA_FALSA, FUENTE_PARTIDA).citas);
    expect(hallazgos).toEqual([
      `${RUTA_FALSA}:2 — bandera --inventada en «valmen estandar aceptar <expr> --inventada»`,
    ]);
  });

  it("C15: una cita cuyo comando es una interpolación no da hallazgo", () => {
    const lectura = lecturaDeCodigo(RUTA_FALSA, FUENTE_INTERPOLADA);
    // La cita se leyó —no es que la prueba no la viera— y no se rechaza.
    expect(lectura.citas.map((c) => c.cita)).toEqual(["valmen <expr>"]);
    expect(hallazgosDe(lectura.citas)).toEqual([]);
  });

  it("C16: de skills/corrida-orquestada/SKILL.md se extraen al menos 8 citas", () => {
    const ruta = "skills/corrida-orquestada/SKILL.md";
    const lectura = lecturaDeTexto(ruta, readFileSync(join(REPO, ruta), "utf8"));
    const comandos = lectura.citas.map((c) => c.cita.split(/\s+/).slice(1, 3).join(" "));

    expect(lectura.citas.length).toBeGreaterThanOrEqual(8);
    expect(comandos).toContain("journey next");
    expect(comandos).toContain("approval-eligibility");
    expect(hallazgosDe(lectura.citas)).toEqual([]);
  });
});

describe("la salida que nombra un rechazo la acepta el CLI (R-MSG-004, parte estática)", () => {
  const SECRETO = "secreto-de-prueba-para-la-firma";
  const AHORA = new Date("2026-09-23T12:00:00.000Z");
  const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
  const RECIBO = "GR-20260923-0001";
  const PROPOSICIONES: Proposition[] = [
    {
      id: "cubre_todos_los_criterios",
      kind: "noul",
      instructions: "¿cubre los criterios?",
    },
  ];

  let raiz: string;
  let paths: RegistryPaths;

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), "mensajes-coherencia-"));
    mkdirSync(join(raiz, ".valmen"), { recursive: true });
    paths = { root: raiz, ticketsDir: "tickets" };
  });

  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true });
  });

  function rutaTicket(): string {
    return join(raiz, "tickets", "2026", TICKET, "ticket.md");
  }

  /** Un recibo en banda de revisión, construido con el estado real del ticket. */
  function reciboEscalado(): GateReceipt {
    const respuestas = [
      { id: "cubre_todos_los_criterios", kind: "noul", value: 0.72 },
    ] as const;
    return buildReceipt({
      id: RECIBO,
      gate: "plan",
      propositions: PROPOSICIONES,
      policy: DEFAULT_POLICY,
      subject: { type: "ticket", id: TICKET, revision: "1" },
      decision: decide(PROPOSICIONES, [...respuestas], DEFAULT_POLICY),
      state: buildGateState(readFileSync(rutaTicket(), "utf8")),
      answers: [...respuestas],
      mechanicalChecks: [
        { id: "criterios_presentes", description: "hay criterios", result: "pass" },
      ],
      model: null,
      usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.00042 },
      latencyMs: 500,
      decidedAt: "2026-09-23T11:00:00Z",
    });
  }

  /**
   * El rechazo de `decideByCode` cuando el ticket cambió después de notificar el gate:
   * se notifica, se toca el ticket y se decide con el código que llegó al celular.
   */
  function rechazoPorTicketCambiado(): { stderr: string; exitCode: number } {
    writeFixtureTicket(raiz, {
      id: TICKET,
      riskLevel: "normal",
      workflowStatus: "planned",
    });
    appendReceipt(paths, TICKET, reciboEscalado());

    const runner: CommandRunner = () => ({
      status: 0,
      stdout: "{}",
      stderr: "",
      failed: false,
    });
    const aviso = hermesNotify({
      paths,
      ticketId: TICKET,
      receiptId: RECIBO,
      to: "telegram",
      secret: SECRETO,
      now: AHORA,
      runner,
    });
    if (aviso.exitCode !== 0) throw new Error(`no se pudo notificar: ${aviso.stderr}`);
    const code = pendingApprovals(paths, AHORA)[0]?.code ?? "";

    writeFileSync(
      rutaTicket(),
      readFileSync(rutaTicket(), "utf8").replace("## Plan", "## Plan\n\nUn paso más."),
      "utf8",
    );
    return decideByCode({
      paths,
      code,
      decision: "approve",
      actor: "juan",
      reason: "lo revisé en el celular",
      secret: SECRETO,
      now: AHORA,
    });
  }

  /** La línea `valmen gate …` que el rechazo manda correr. */
  function salidaNombrada(stderr: string): string {
    return /^\s*(valmen gate .*)$/m.exec(stderr)?.[1]?.trim() ?? "";
  }

  it("C17: el rechazo por ticket cambiado nombra la salida `valmen gate <compuerta> --id <ticket>`", () => {
    const rechazo = rechazoPorTicketCambiado();

    expect(rechazo.exitCode).not.toBe(0);
    expect(salidaNombrada(rechazo.stderr)).toBe(`valmen gate plan --id ${TICKET}`);
  });

  it("C18: parseArgs acepta sin error la salida que nombra ese rechazo", () => {
    const salida = salidaNombrada(rechazoPorTicketCambiado().stderr);

    expect(salida, "el rechazo no nombra ninguna salida `valmen gate …`").not.toBe("");
    const argv = salida.split(/\s+/).slice(1);
    expect(() => parseArgs(argv)).not.toThrow();
    expect(parseArgs(argv).positionals[0]).toBe("gate");
  });
});
