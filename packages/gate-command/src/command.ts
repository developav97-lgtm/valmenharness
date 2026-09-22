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
import { execFileSync } from "node:child_process";

import type { Proposition, PropositionAnswer } from "@valmen/gate";
import { GateDefinitionError } from "@valmen/gate";

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
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
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

/** Límite de salida que se guarda en el recibo, por flujo. */
export const MAX_CAPTURED_OUTPUT = 2000;

/** Ejecuta un check y devuelve su resultado, sin lanzar por un fallo del check. */
export function runCommandCheck(
  check: CommandCheck,
  options: { readonly root: string },
): CommandCheckResult {
  const expected = check.expectExitCode ?? 0;
  const started = Date.now();
  let exitCode: number;
  let stdout = "";
  let stderr = "";

  try {
    stdout = execFileSync(check.command, [...(check.args ?? [])], {
      cwd: check.cwd === undefined ? options.root : `${options.root}/${check.cwd}`,
      encoding: "utf8",
      timeout: check.timeoutMs ?? 30_000,
      // La salida puede ser grande: se acota lo que se guarda.
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    exitCode = 0;
  } catch (caught) {
    const error = caught as {
      status?: number | null;
      stdout?: string;
      stderr?: string;
      signal?: string;
      code?: string;
    };

    // Un fallo de arranque no es un check que falla: es un check que no se pudo
    // ejecutar. Distinguirlos importa, porque un comando mal escrito no debe
    // contarse como una proposición falsa.
    if (error.code === "ENOENT") {
      throw new CommandError(
        `No se encontró el comando "${check.command}". Un check que no se puede ` +
          "ejecutar no es un check fallido.",
        "COMMAND_NOT_FOUND",
      );
    }
    if (error.signal === "SIGTERM" || error.code === "ETIMEDOUT") {
      throw new CommandError(
        `El comando "${check.command}" superó el tiempo máximo de ` +
          `${check.timeoutMs ?? 30_000} ms.`,
        "COMMAND_TIMEOUT",
      );
    }

    exitCode = error.status ?? 1;
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
  }

  return {
    propositionId: check.propositionId,
    description: check.description,
    invocation: [check.command, ...(check.args ?? [])].join(" "),
    exitCode,
    expectedExitCode: expected,
    passed: exitCode === expected,
    stdout: stdout.slice(0, MAX_CAPTURED_OUTPUT),
    stderr: stderr.slice(0, MAX_CAPTURED_OUTPUT),
    durationMs: Date.now() - started,
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
      failures.push({
        propositionId: check.propositionId,
        message: error.message,
      });
      continue;
    }

    results.push(result);
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
