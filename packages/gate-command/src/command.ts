/**
 * Evaluador de gates por comando.
 *
 * **Es el evaluador que hay que intentar primero.** Un gate que se puede decidir
 * con un script no debe gastar una llamada a un modelo: es más barato, más
 * rápido y determinista. El diseño lo dice como regla dura —
 *
 *   > Lo decidible en código se decide en código. Un modelo solo evalúa
 *   > proposiciones semánticas que el código no puede computar.
 *
 * — y este evaluador es lo que hace que esa regla sea aplicable en vez de un
 * buen deseo.
 *
 * Cada proposición declara el comando que la responde. La proposición es cierta
 * si el comando sale con el código esperado, y falsa si no. La salida del
 * comando se captura para el recibo: es la evidencia de por qué se decidió.
 *
 * No tiene coste, no tiene latencia de red y no puede alucinar.
 *
 * Ver docs/03-GATES.md §4.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type { Proposition, PropositionAnswer } from "@valmen/gate";
import { GateDefinitionError } from "@valmen/gate";

/**
 * Un archivo que la corrida de un comando dejó en un directorio de evidencia.
 *
 * `path` es relativo a la raíz del proyecto y con separadores POSIX, para que el
 * recibo sea legible y comparable entre sistemas.
 */
export interface CommandArtifact {
  readonly path: string;
  readonly bytes: number;
}

/** Declaración de un comando asociado a una proposición. */
export interface CommandCheck {
  /** Identificador de la proposición que este comando responde. */
  readonly propositionId: string;
  /** Programa a ejecutar. */
  readonly command: string;
  readonly args?: readonly string[];
  /** Directorio de ejecución, relativo a la raíz del proyecto. */
  readonly cwd?: string;
  /**
   * Código de salida que hace verdadera la proposición.
   *
   * Por defecto `0`. Un check del tipo "el archivo NO existe" espera otro
   * código, así que se declara explícitamente en vez de envolver el comando en
   * un shell con `!`.
   */
  readonly expectExitCode?: number;
  /** Tiempo máximo en milisegundos. Por defecto 30 segundos. */
  readonly timeoutMs?: number;
  /** Qué se está comprobando, para el recibo. */
  readonly description: string;
  /**
   * Directorios donde el comando deja su evidencia, relativos a la raíz.
   *
   * Después de correr —también cuando falla, que es cuando más importa— se
   * recorren y sus archivos posteriores al arranque viajan en el resultado. Sin
   * este campo no se recolecta nada.
   */
  readonly artifactDirs?: readonly string[];
  /**
   * Cómo se traduce el resultado del comando a la respuesta de la proposición.
   *
   * Por defecto `noul`: el comando sale con el código esperado y la proposición
   * se cumple. Para una proposición de **elección** hay que declarar qué opción
   * corresponde a cada desenlace, porque una elección no se responde con una
   * probabilidad y el motor rechaza una respuesta del tipo equivocado.
   */
  readonly as?: "noul" | "choice";
  /** Opción que se devuelve si el comando sale con el código esperado. */
  readonly onSuccess?: string;
  /** Opción que se devuelve si el comando sale con otro código. */
  readonly onFailure?: string;
}

/** Resultado de ejecutar un check, con su evidencia. */
export interface CommandCheckResult {
  readonly propositionId: string;
  readonly description: string;
  /** Línea de comando tal como se ejecutó, para reproducirla. */
  readonly invocation: string;
  readonly exitCode: number;
  readonly expectedExitCode: number;
  readonly passed: boolean;
  /** La **cola** de la salida: ahí está el resumen del runner, no al comienzo. */
  readonly stdout: string;
  readonly stderr: string;
  /** El sha256 de la salida completa, para poder comprobar la cola contra ella. */
  readonly stdoutSha256?: string;
  readonly stderrSha256?: string;
  /** Bytes de la salida completa, antes de recortar. */
  readonly stdoutBytes?: number;
  readonly stderrBytes?: number;
  /**
   * Por qué el comando no llegó a probar nada, si ese fue el caso.
   *
   * Una falla del entorno no es una prueba fallida: la base de datos de pruebas ya
   * existía, la conexión se rechazó, el comando no existe o se agotó el tiempo, o la
   * salida no trae el resumen del runner. Quien decide la trata como revisión.
   */
  readonly environmentFailure?: string;
  readonly durationMs: number;
  /**
   * La evidencia que la corrida dejó en los directorios que el check declara.
   *
   * Solo aparece cuando el check declara `artifactDirs`: un comando que no las
   * declara no tiene evidencia que recolectar.
   */
  readonly artifacts?: readonly CommandArtifact[];
}

/** Error de un comando que no se pudo ejecutar. */
export class CommandError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

/** Límite de salida que se guarda en el recibo, por flujo: los **últimos** caracteres. */
export const MAX_CAPTURED_OUTPUT = 2000;

/** La cola de un texto: el resumen de una suite está al final, no al comienzo. */
export function tailOf(texto: string, max: number = MAX_CAPTURED_OUTPUT): string {
  return texto.length <= max ? texto : texto.slice(texto.length - max);
}

function sha256De(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Los runners de pruebas que se reconocen, con la línea que imprimen al terminar.
 *
 * Un comando de uno de ellos que termina **sin** su resumen no llegó a ejecutar la
 * suite, aunque haya salido con cualquier código. Un programa que no está en la tabla
 * no se clasifica por resumen: no hay forma de saber qué imprime al probar.
 */
const RUNNERS: readonly {
  readonly id: string;
  readonly detecta: RegExp;
  readonly resumen: RegExp;
}[] = [
  { id: "vitest", detecta: /\bvitest\b/, resumen: /\bTest Files\s+\d+|\bTests\s+\d+\s+(?:passed|failed)/ },
  { id: "jest", detecta: /\bjest\b/, resumen: /\bTests:\s+\d+/ },
  { id: "Django", detecta: /manage\.py\s+test/, resumen: /\bRan\s+\d+\s+tests?\b/ },
  { id: "pytest", detecta: /\bpytest\b/, resumen: /\b\d+\s+(?:passed|failed|errors?)\b|no tests ran/ },
  { id: "Karma", detecta: /\bkarma\b|\bng\s+test\b/, resumen: /Executed\s+\d+\s+of\s+\d+/ },
];

/** Mensajes de una falla del entorno, cuando el comando salió con error. */
const MENSAJES_DE_ENTORNO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  {
    patron: /(?:database|base de datos)[^\n]*(?:already exists|ya existe)/i,
    motivo: "la base de datos de pruebas ya existía",
  },
  {
    patron: /ECONNREFUSED|connection refused|could not connect to server|conexi[oó]n rechazada/i,
    motivo: "conexión rechazada",
  },
  { patron: /command not found|ENOENT/i, motivo: "comando no encontrado" },
];

/**
 * ¿Terminó el comando sin haber probado nada?
 *
 * Devuelve el motivo de la falla del entorno, o `null` si el comando probó (haya
 * pasado o no). El orden importa: si el resumen de un runner conocido está en la
 * salida, la suite corrió y un fallo es una prueba fallida, aunque el texto mencione
 * una conexión o una base de datos.
 */
export function classifyEnvironmentFailure(input: {
  readonly line: string;
  readonly exitCode: number;
  readonly expectedExitCode: number;
  readonly output: string;
}): string | null {
  const runner = RUNNERS.find((candidato) => candidato.detecta.test(input.line));
  if (runner !== undefined && runner.resumen.test(input.output)) return null;

  if (input.exitCode !== input.expectedExitCode) {
    for (const { patron, motivo } of MENSAJES_DE_ENTORNO) {
      if (patron.test(input.output)) return `${motivo}; el comando no llegó a ejecutar pruebas`;
    }
  }
  if (runner !== undefined) {
    return `la salida no trae el resumen de pruebas de ${runner.id}; el comando no llegó a ejecutar la suite`;
  }
  return null;
}

/** Profundidad máxima del recorrido de un directorio de evidencia. */
const MAX_PROFUNDIDAD_DE_EVIDENCIA = 3;

/** Cuántos archivos de evidencia se guardan como máximo. */
const MAX_ARCHIVOS_DE_EVIDENCIA = 10;

/**
 * Lista la evidencia que un comando dejó en los directorios declarados.
 *
 * Es pura y no ejecuta nada, así que se prueba sin correr un comando. Recorre
 * cada directorio de forma recursiva hasta una profundidad acotada y se queda con
 * los archivos **posteriores al arranque del comando** —con un segundo de margen
 * por la resolución del sistema de archivos—: listar el directorio entero
 * atribuiría al recibo la traza de una corrida anterior, que es una afirmación
 * falsa con forma de prueba. Los archivos salen ordenados por ruta y acotados.
 *
 * Un directorio que no existe no es un error: significa que esta corrida no dejó
 * evidencia ahí.
 */
export function listArtifacts(
  root: string,
  dirs: readonly string[],
  sinceMs: number,
): CommandArtifact[] {
  const limite = sinceMs - 1000;
  const encontrados: CommandArtifact[] = [];

  const recorrer = (dirAbs: string, profundidad: number): void => {
    if (profundidad > MAX_PROFUNDIDAD_DE_EVIDENCIA) return;

    let entradas;
    try {
      entradas = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entrada of entradas) {
      const abs = join(dirAbs, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(abs, profundidad + 1);
        continue;
      }
      if (!entrada.isFile()) continue;

      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      if (stat.mtimeMs < limite) continue;

      encontrados.push({
        path: relative(root, abs).split(sep).join("/"),
        bytes: stat.size,
      });
    }
  };

  for (const dir of dirs) recorrer(resolve(root, dir), 0);

  return encontrados
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, MAX_ARCHIVOS_DE_EVIDENCIA);
}

/** El valor que deja una proposición en la banda de revisión: ni aprueba ni bloquea. */
const VALOR_DE_REVISION = 0.5;

/** Los checks de criterios de un ticket llevan el id `criterio_NN`. */
function esCriterio(propositionId: string): boolean {
  return propositionId.startsWith("criterio_");
}

/** Ejecuta un check y devuelve su resultado, sin lanzar por un fallo del check. */
export function runCommandCheck(
  check: CommandCheck,
  options: { readonly root: string },
): CommandCheckResult {
  const expected = check.expectExitCode ?? 0;
  const started = Date.now();
  // `spawnSync` devuelve stdout y stderr también con salida 0: unittest (Django)
  // imprime su resumen por stderr, y con `execFileSync` esa rama lo descartaba.
  const result = spawnSync(check.command, [...(check.args ?? [])], {
    cwd: check.cwd === undefined ? options.root : `${options.root}/${check.cwd}`,
    encoding: "utf8",
    timeout: check.timeoutMs ?? 30_000,
    // La salida puede ser grande: se acota lo que se guarda.
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const spawnError = result.error as (Error & { code?: string }) | undefined;

  // Un fallo de arranque no es un check que falla: es un check que no se pudo
  // ejecutar. Distinguirlos importa, porque un comando mal escrito no debe
  // contarse como una proposición falsa.
  if (spawnError?.code === "ENOENT") {
    throw new CommandError(
      `No se encontró el comando "${check.command}". Un check que no se puede ` +
        "ejecutar no es un check fallido.",
      "COMMAND_NOT_FOUND",
    );
  }
  if (result.signal === "SIGTERM" || spawnError?.code === "ETIMEDOUT") {
    throw new CommandError(
      `El comando "${check.command}" superó el tiempo máximo de ` +
        `${check.timeoutMs ?? 30_000} ms.`,
      "COMMAND_TIMEOUT",
    );
  }

  const exitCode: number = result.status ?? 1;
  const stdout: string = result.stdout ?? "";
  const stderr: string = result.stderr ?? "";

  // La evidencia se recolecta después de correr —también cuando el comando
  // falla, que es cuando más importa— y se filtra por marca de tiempo posterior
  // al arranque: una traza vieja no es prueba de esta corrida.
  const artifacts =
    check.artifactDirs === undefined
      ? undefined
      : listArtifacts(options.root, check.artifactDirs, started);

  const invocation = [check.command, ...(check.args ?? [])].join(" ");
  // La clasificación mira la salida **completa**: el resumen está al final y un
  // recorte antes de mirar lo perdería.
  const environmentFailure = classifyEnvironmentFailure({
    line: invocation,
    exitCode,
    expectedExitCode: expected,
    output: `${stdout}\n${stderr}`,
  });

  return {
    propositionId: check.propositionId,
    description: check.description,
    invocation,
    exitCode,
    expectedExitCode: expected,
    passed: exitCode === expected,
    stdout: tailOf(stdout),
    stderr: tailOf(stderr),
    stdoutSha256: sha256De(stdout),
    stderrSha256: sha256De(stderr),
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stderrBytes: Buffer.byteLength(stderr, "utf8"),
    ...(environmentFailure === null ? {} : { environmentFailure }),
    durationMs: Date.now() - started,
    ...(artifacts === undefined ? {} : { artifacts }),
  };
}

/**
 * Evalúa las proposiciones resolubles por comando.
 *
 * Devuelve las respuestas en el formato que espera el motor de decisión, así
 * que este evaluador es intercambiable con cualquier otro detrás del mismo
 * contrato.
 *
 * Los checks que no se pudieron ejecutar **no** producen respuesta: se informan
 * aparte para que el motor falle en vez de tratar un comando roto como una
 * proposición falsa.
 */
export function evaluateWithCommands(
  propositions: readonly Proposition[],
  checks: readonly CommandCheck[],
  options: { readonly root: string },
): {
  readonly answers: readonly PropositionAnswer[];
  readonly results: readonly CommandCheckResult[];
  readonly failures: readonly { propositionId: string; message: string }[];
} {
  const aplicables = new Set(propositions.map((proposition) => proposition.id));
  const answers: PropositionAnswer[] = [];
  const results: CommandCheckResult[] = [];
  const failures: { propositionId: string; message: string }[] = [];

  for (const check of checks) {
    if (!aplicables.has(check.propositionId)) {
      // Un check sobre una proposición que el gate no declara es un error de
      // configuración silencioso: el check nunca correría y nadie lo notaría.
      throw new GateDefinitionError(
        `El check por comando apunta a la proposición "${check.propositionId}", ` +
          `que el gate no declara.`,
      );
    }

    let result: CommandCheckResult;
    try {
      result = runCommandCheck(check, options);
    } catch (caught) {
      const error = caught as Error;
      // Un comando de criterio que no existe o se agotó no probó nada: es una falla
      // del entorno y se revisa, no un error que detiene toda la compuerta. Los checks
      // fijos de otras compuertas conservan el comportamiento de siempre.
      if (caught instanceof CommandError && esCriterio(check.propositionId)) {
        results.push({
          propositionId: check.propositionId,
          description: check.description,
          invocation: [check.command, ...(check.args ?? [])].join(" "),
          exitCode: -1,
          expectedExitCode: check.expectExitCode ?? 0,
          passed: false,
          stdout: "",
          stderr: tailOf(error.message),
          environmentFailure: error.message,
          durationMs: 0,
        });
        answers.push({ id: check.propositionId, kind: "noul", value: VALOR_DE_REVISION });
        continue;
      }
      failures.push({
        propositionId: check.propositionId,
        message: error.message,
      });
      continue;
    }

    results.push(result);
    if (result.environmentFailure !== undefined && esCriterio(check.propositionId)) {
      answers.push({ id: check.propositionId, kind: "noul", value: VALOR_DE_REVISION });
      continue;
    }
    // Un comando produce una certeza binaria, no una probabilidad. Se traduce a
    // los extremos del rango para que el motor lo trate como una proposición
    // clara: 1 aprueba, 0 bloquea, y no hay banda media porque no hay duda.
    if (check.as === "choice") {
      const opcion = result.passed ? check.onSuccess : check.onFailure;
      if (typeof opcion !== "string" || opcion === "") {
        throw new GateDefinitionError(
          `El check de "${check.propositionId}" es una elección y no declara ` +
            "`onSuccess` u `onFailure`. Una elección no se puede responder con " +
            "una probabilidad.",
        );
      }
      answers.push({ id: check.propositionId, kind: "choice", choice: opcion });
      continue;
    }

    answers.push({
      id: check.propositionId,
      kind: "noul",
      value: result.passed ? 1 : 0,
    });
  }

  return { answers, results, failures };
}

/**
 * Comprueba que un gate sea evaluable solo con comandos.
 *
 * Sirve para elegir el evaluador automáticamente: si todas las proposiciones
 * tienen un comando asociado, no hace falta llamar a ningún modelo.
 */
export function isFullyMechanical(
  propositions: readonly Proposition[],
  checks: readonly CommandCheck[],
): boolean {
  const cubiertas = new Set(checks.map((check) => check.propositionId));
  return propositions.every(
    (proposition) => !proposition.when && cubiertas.has(proposition.id),
  );
}
