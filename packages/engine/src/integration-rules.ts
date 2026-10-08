/**
 * Las reglas de integración de la jornada (R-JORN-009, mitad de reglas).
 *
 * Que cada ticket quede en su propio commit sobre una rama de trabajo es una capacidad nueva, y
 * lo que la hace segura no es pedirle al agente que se porte bien: son **reglas en código** y una
 * **lista cerrada** de operaciones de git. Este módulo decide si se puede commitear y expone el
 * único ejecutor de git que la jornada puede usar; no ejecuta el commit ni toca ningún remoto.
 */
import { spawnSync } from "node:child_process";

import { EXIT_INVARIANT, fail } from "@valmen/core";

/** Lo que las reglas necesitan saber del momento de commitear. */
export interface IntegrationState {
  /** La rama en la que está el árbol ahora. */
  readonly ramaActual: string;
  /** La rama de trabajo ya resuelta (con la fecha). */
  readonly ramaDeTrabajo: string;
  /** Las ramas que nunca se aceptan. */
  readonly ramasProtegidas: readonly string[];
  /** `true` si el árbol estaba limpio **antes** de empezar el ticket. */
  readonly arbolLimpioAlEmpezar: boolean;
  /** Los archivos que cambió el ticket, relativos a la raíz. */
  readonly archivosCambiados: readonly string[];
  /** Cuántos secretos halló el escáner en el cambio. */
  readonly hallazgosDeSecretos: number;
}

export interface IntegrationVerdict {
  readonly permitido: boolean;
  readonly violaciones: readonly string[];
}

/** Archivos que una jornada nunca commitea: credenciales y la configuración del propio harness. */
const PROHIBIDOS: readonly RegExp[] = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.credentials(\.|$)/,
  /(^|\/)(id_rsa|id_ed25519)(\.pub)?$/,
  /\.(pem|key|p12)$/,
  /^\.valmen\/config\.yaml$/,
  /^\.valmen\/routing\.yaml$/,
  /^\.valmen\/delegations\//,
];

/** ¿Está este archivo fuera del proyecto o es una ruta que no se commitea? */
export function motivoDeArchivoProhibido(archivo: string): string | null {
  if (archivo.startsWith("/") || archivo.split("/").includes("..")) {
    return `${archivo} está fuera del proyecto`;
  }
  if (PROHIBIDOS.some((patron) => patron.test(archivo))) {
    return `${archivo} es un archivo que una jornada no commitea (credenciales o configuración del harness)`;
  }
  return null;
}

/** Decide si un ticket terminado se puede commitear; lista cada violación. */
export function reglasDeIntegracion(estado: IntegrationState): IntegrationVerdict {
  const violaciones: string[] = [];
  if (estado.ramasProtegidas.includes(estado.ramaActual)) {
    violaciones.push(`La rama actual (${estado.ramaActual}) es una rama protegida: la jornada no commitea ahí.`);
  } else if (estado.ramaActual !== estado.ramaDeTrabajo) {
    violaciones.push(
      `La rama actual (${estado.ramaActual}) no es la rama de trabajo (${estado.ramaDeTrabajo}).`,
    );
  }
  if (!estado.arbolLimpioAlEmpezar) {
    violaciones.push(
      "El árbol no estaba limpio al empezar el ticket: no se puede atribuir el cambio a un solo ticket.",
    );
  }
  if (estado.archivosCambiados.length === 0) {
    violaciones.push("El ticket no cambió ningún archivo: no hay nada que commitear.");
  }
  for (const archivo of estado.archivosCambiados) {
    const motivo = motivoDeArchivoProhibido(archivo);
    if (motivo !== null) violaciones.push(motivo);
  }
  if (estado.hallazgosDeSecretos > 0) {
    violaciones.push(
      `Se detectaron ${estado.hallazgosDeSecretos} posible(s) secreto(s) en el cambio; el valor no se registra.`,
    );
  }
  return { permitido: violaciones.length === 0, violaciones };
}

/** Las operaciones de git que la jornada puede pedir. Todo lo demás se rechaza. */
const OPERACIONES_PERMITIDAS = [
  "status",
  "rev-parse",
  "diff",
  "add",
  "commit",
  "switch",
  "checkout",
  "merge",
  "merge-base",
] as const;

/** Banderas que no se admiten en ninguna operación. */
const BANDERAS_PROHIBIDAS = new Set(["--force", "-f", "--force-with-lease", "--hard", "--no-verify", "--amend"]);

/** Por qué una invocación de git no se admite, o `null` si se admite. */
export function motivoDeGitProhibido(argumentos: readonly string[]): string | null {
  const [operacion, ...resto] = argumentos;
  if (operacion === undefined) return "No se indicó ninguna operación de git.";
  if (!(OPERACIONES_PERMITIDAS as readonly string[]).includes(operacion)) {
    return `La operación git ${operacion} no está permitida a una jornada (solo ${OPERACIONES_PERMITIDAS.join(", ")}).`;
  }
  const prohibida = resto.find((argumento) => BANDERAS_PROHIBIDAS.has(argumento));
  if (prohibida !== undefined) return `La bandera ${prohibida} no está permitida a una jornada.`;
  if (operacion === "add") {
    if (resto.includes("-A") || resto.includes("--all") || resto.includes(".") || resto.includes("-u")) {
      return "git add exige archivos explícitos tras `--`: nada de -A, --all, `.` ni -u.";
    }
    if (resto[0] !== "--" || resto.length < 2) return "git add exige archivos explícitos tras `--`.";
  }
  if (operacion === "checkout" && !(resto[0] === "-b" && resto.length === 2)) {
    return "git checkout solo se admite como `checkout -b <rama>`.";
  }
  if (operacion === "switch" && resto.length !== 1 && !(resto[0] === "-c" && (resto.length === 2 || resto.length === 3))) {
    return "git switch solo se admite como `switch <rama>` o `switch -c <rama> [<base>]`.";
  }
  if (operacion === "merge" && !(resto[0] === "--ff-only" && resto.length === 2 && !resto[1]?.startsWith("-"))) {
    return "git merge solo se admite como `merge --ff-only <rama>`.";
  }
  if (operacion === "merge-base" && !(resto[0] === "--is-ancestor" && resto.length === 3)) {
    return "git merge-base solo se admite como `merge-base --is-ancestor <a> <b>`.";
  }
  return null;
}

export type EjecutorDeGit = (
  argumentos: readonly string[],
  cwd: string,
) => { readonly status: number; readonly stdout: string; readonly stderr: string };

const ejecutarGitDeVerdad: EjecutorDeGit = (argumentos, cwd) => {
  const r = spawnSync("git", [...argumentos], { cwd, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/**
 * El único git que una jornada puede ejecutar: lista cerrada, sin remotos, sin force y sin
 * tags. Rechaza antes de lanzar nada y dice el motivo.
 */
export function ejecutarGitPermitido(
  root: string,
  argumentos: readonly string[],
  ejecutor: EjecutorDeGit = ejecutarGitDeVerdad,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const motivo = motivoDeGitProhibido(argumentos);
  if (motivo !== null) fail(motivo, EXIT_INVARIANT);
  return ejecutor(argumentos, root);
}
