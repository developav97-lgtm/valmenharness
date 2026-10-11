/**
 * El escenario aislado donde corre el binario medido, sin modelo.
 *
 * «Sin modelo» y «aislada» se garantizan por construcción y no por confianza:
 *
 * - El entorno de cada subproceso se arma **desde cero**, sin copiar `process.env`.
 *   Lo único que lleva es lo que el escenario define, así que ninguna `<PROVEEDOR>_API_KEY`
 *   ni ninguna otra variable del proceso que mide llega al binario.
 * - El `HOME` es una carpeta temporal vacía: no hay credenciales ni `.valmen/` que leer.
 * - `VALMEN_CLAUDE_BIN` y una carpeta al frente del `PATH` apuntan a **trampas**: scripts
 *   `claude`, `codex`, `opencode` y `hermes` que anotan la llamada y salen con 97. Quien
 *   mide mira esa anotación; una llamada a un CLI de modelo deja el recorrido fallido.
 *
 * - `npm_config_offline=true`: `npx` no descarga nada. Es lo que impide que un recorrido
 *   que recompile (`journey worktree integrate`) toque el registro de npm.
 *
 * Lo que no se hace es aislar la red del sistema operativo: un binario que abra la red sin
 * credenciales no se detecta. La ayuda de `run` lo dice.
 */
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

/** Los CLI de modelo que el binario podría invocar: cada uno tiene su trampa. */
const CLI_DE_MODELO = ["claude", "codex", "opencode", "hermes"] as const;

/** Código con el que sale una trampa: ningún comando del producto lo usa. */
const CODIGO_DE_TRAMPA = 97;

const TIEMPO_MAXIMO_DE_GIT_MS = 30_000;

export interface Escenario {
  /** Carpeta temporal que contiene todo lo demás. Ruta real, sin enlaces simbólicos. */
  raiz: string;
  home: string;
  /** El repositorio git donde corre el binario: su `cwd`. */
  proyecto: string;
  tmp: string;
  trampa: string;
  /** Archivo donde las trampas anotan cada llamada a un CLI de modelo. */
  registroDeModelo: string;
}

export interface Salida {
  /** `null` si el proceso no terminó con un código: tiempo agotado, señal o no se pudo lanzar. */
  status: number | null;
  stdout: string;
  stderr: string;
  agotado: boolean;
  /** El error del sistema al lanzar el proceso, si lo hubo y no fue por el tiempo. */
  error: string | null;
}

let carpetaDeGitEncontrada: string | undefined;

/**
 * La carpeta donde está `git`. Se busca en el `PATH` del proceso que mide, y solo para
 * saber dónde está: el entorno del subproceso no hereda ese `PATH`.
 */
function carpetaDeGit(): string {
  if (carpetaDeGitEncontrada !== undefined) return carpetaDeGitEncontrada;
  for (const carpeta of (process.env["PATH"] ?? "").split(delimiter)) {
    if (carpeta === "") continue;
    try {
      accessSync(join(carpeta, "git"), constants.X_OK);
      carpetaDeGitEncontrada = carpeta;
      return carpeta;
    } catch {
      // no está en esta carpeta
    }
  }
  carpetaDeGitEncontrada = "/usr/bin";
  return carpetaDeGitEncontrada;
}

function entre(texto: string): string {
  return `'${texto.replaceAll("'", "'\\''")}'`;
}

function escribirTrampas(escenario: Escenario): void {
  for (const nombre of CLI_DE_MODELO) {
    const ruta = join(escenario.trampa, nombre);
    writeFileSync(
      ruta,
      `#!/bin/sh\necho "${nombre} $*" >> ${entre(escenario.registroDeModelo)}\nexit ${CODIGO_DE_TRAMPA}\n`,
    );
    chmodSync(ruta, 0o755);
  }
}

/** El entorno de un subproceso del escenario, armado desde cero. */
export function entornoAislado(escenario: Escenario): Record<string, string> {
  const carpetas = [escenario.trampa, dirname(process.execPath), carpetaDeGit()];
  return {
    HOME: escenario.home,
    TMPDIR: escenario.tmp,
    PATH: [...new Set(carpetas)].join(delimiter),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "friccion",
    GIT_AUTHOR_EMAIL: "friccion@example.test",
    GIT_COMMITTER_NAME: "friccion",
    GIT_COMMITTER_EMAIL: "friccion@example.test",
    VALMEN_CLAUDE_BIN: join(escenario.trampa, "claude"),
    // `npx` no descarga nada: falla con ENOTCACHED en vez de tocar el registro de npm.
    npm_config_offline: "true",
  };
}

function ejecutar(
  comando: string,
  argumentos: string[],
  escenario: Escenario,
  timeoutMs: number,
): Salida {
  const resultado = spawnSync(comando, argumentos, {
    cwd: escenario.proyecto,
    env: entornoAislado(escenario),
    input: "",
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 32 * 1024 * 1024,
  });
  const codigoDelError = (resultado.error as NodeJS.ErrnoException | undefined)?.code;
  const agotado = codigoDelError === "ETIMEDOUT";
  return {
    status: resultado.status,
    stdout: resultado.stdout ?? "",
    stderr: resultado.stderr ?? "",
    agotado,
    error: resultado.error !== undefined && !agotado ? resultado.error.message : null,
  };
}

/** Corre `git` dentro del repositorio del escenario, con su entorno aislado. */
export function correrGit(
  escenario: Escenario,
  argumentos: string[],
  timeoutMs: number = TIEMPO_MAXIMO_DE_GIT_MS,
): Salida {
  return ejecutar(join(carpetaDeGit(), "git"), argumentos, escenario, timeoutMs);
}

/**
 * Corre el binario medido dentro del escenario. Un archivo `.js`, `.mjs` o `.cjs` se lanza
 * con el `node` que corre la medición; cualquier otro, directamente.
 */
export function correrBinario(
  escenario: Escenario,
  binario: string,
  argumentos: string[],
  timeoutMs: number,
): Salida {
  return /\.(?:c|m)?js$/.test(binario)
    ? ejecutar(process.execPath, [binario, ...argumentos], escenario, timeoutMs)
    : ejecutar(binario, argumentos, escenario, timeoutMs);
}

/**
 * Arma un escenario: sus carpetas, las trampas y un repositorio git con un commit base.
 *
 * Sin `raizExistente` crea una carpeta temporal nueva. Con ella reconstruye el escenario
 * en la misma ruta, que es lo que permite probar cada salida en un escenario limpio sin
 * que cambien las rutas absolutas que cite el mensaje de un bloqueo.
 */
export function crearEscenario(raizExistente?: string): Escenario {
  const raiz =
    raizExistente ?? realpathSync(mkdtempSync(join(tmpdir(), "valmen-friccion-")));
  const escenario: Escenario = {
    raiz,
    home: join(raiz, "home"),
    proyecto: join(raiz, "proyecto"),
    tmp: join(raiz, "tmp"),
    trampa: join(raiz, "trampa"),
    registroDeModelo: join(raiz, "llamadas-a-modelo.log"),
  };
  for (const carpeta of [
    escenario.home,
    escenario.proyecto,
    escenario.tmp,
    escenario.trampa,
  ]) {
    mkdirSync(carpeta, { recursive: true });
  }
  escribirTrampas(escenario);

  const pasos: string[][] = [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "friccion"],
    ["config", "user.email", "friccion@example.test"],
    ["config", "commit.gpgsign", "false"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
  ];
  for (const paso of pasos) {
    const salida = correrGit(escenario, paso);
    if (salida.status !== 0) {
      // Un escenario a medias no lo limpia nadie más: quien lo pidió no llegó a recibirlo.
      limpiarEscenario(escenario);
      throw new Error(
        `no se pudo armar el repositorio del escenario (git ${paso.join(" ")}): ${
          salida.error ?? salida.stderr.trim()
        }`,
      );
    }
  }
  return escenario;
}

/** Las llamadas a un CLI de modelo que anotaron las trampas, una por línea. */
export function llamadasAModelo(escenario: Escenario): string[] {
  if (!existsSync(escenario.registroDeModelo)) return [];
  return readFileSync(escenario.registroDeModelo, "utf8")
    .split("\n")
    .filter((linea) => linea.trim() !== "");
}

export function limpiarEscenario(escenario: Escenario): void {
  rmSync(escenario.raiz, { recursive: true, force: true });
}
