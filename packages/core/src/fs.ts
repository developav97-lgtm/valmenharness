/**
 * Escritura atómica y bloqueo de mutaciones.
 *
 * Todo lo que escribe el harness pasa por aquí. Dos garantías, y ninguna es
 * opcional:
 *
 * 1. **Atomicidad.** Un ticket nunca queda a medio escribir. Si el proceso
 *    muere en cualquier punto, el archivo anterior sigue intacto: se escribe en
 *    un temporal del mismo directorio y se reemplaza con `rename`, que es
 *    atómico dentro del mismo sistema de archivos.
 * 2. **Un solo escritor.** Dos procesos que mutan el registro a la vez se
 *    pisarían. El lock es un archivo creado con `O_EXCL`, que es la única
 *    primitiva de "crear si no existe" que ofrecen los sistemas de archivos
 *    sin depender de un demonio.
 *
 * Ver docs/01-ARQUITECTURA.md §2.3 y docs/08-ADOPCION.md.
 */
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  constants,
} from "node:fs";
import { dirname, join } from "node:path";

import { EXIT_HISTORY, fail } from "@valmen/core";

/** Permisos con los que se crean los artefactos del registro. */
const FILE_MODE = 0o644;

/** Intentos de adquisición del lock antes de rendirse. */
const LOCK_ATTEMPTS = 100;

/** Espera entre intentos, en milisegundos. */
const LOCK_RETRY_MS = 10;

/**
 * Escribe un archivo de forma atómica.
 *
 * El temporal se crea en el **mismo directorio** que el destino: un `rename`
 * entre sistemas de archivos distintos no es atómico, así que usar el
 * directorio temporal del sistema rompería la garantía.
 */
export function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${path.split("/").pop() ?? "tmp"}.${process.pid}.tmp`,
  );

  try {
    const descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      FILE_MODE,
    );
    try {
      writeSync(descriptor, content);
      // `fsync` antes del rename: sin él, un corte de energía puede dejar el
      // rename aplicado y el contenido todavía en la caché del sistema.
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // El temporal ya no existe: nada que limpiar.
    }
    throw error;
  }
}

/** Lee un archivo, o devuelve `null` si no existe. */
export function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Bloqueo exclusivo del registro de tickets.
 *
 * El lock vive junto al registro, no dentro del directorio Git: así el harness
 * no depende de que el proyecto sea un repositorio Git para poder mutar su
 * propio registro.
 *
 * Un lock huérfano —dejado por un proceso que murió— bloquearía el registro
 * para siempre. Por eso el mensaje de error dice qué archivo hay que borrar.
 */
export class MutationLock {
  readonly #path: string;
  #descriptor: number | null = null;

  private constructor(path: string, descriptor: number) {
    this.#path = path;
    this.#descriptor = descriptor;
  }

  /** Ruta del archivo de lock, expuesta para el mensaje de error. */
  get path(): string {
    return this.#path;
  }

  /**
   * Adquiere el lock, reintentando durante aproximadamente un segundo.
   *
   * El reintento existe porque dos comandos pueden solaparse legítimamente
   * (un hook y una ejecución manual). Rendirse de inmediato daría un error
   * espurio en el caso normal.
   */
  static acquire(ticketsDir: string): MutationLock {
    mkdirSync(ticketsDir, { recursive: true });
    const path = join(ticketsDir, ".valmen.lock");

    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      try {
        const descriptor = openSync(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        );
        writeSync(descriptor, `${process.pid}\n`);
        return new MutationLock(path, descriptor);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        // Espera activa: es más simple que un temporizador y el intervalo es
        // de milisegundos, así que el coste es despreciable.
        const until = Date.now() + LOCK_RETRY_MS;
        while (Date.now() < until) {
          /* espera */
        }
      }
    }

    fail(
      `Otro proceso mantiene el lock del registro (${path}); ` +
        "si ningún proceso lo está usando, borre ese archivo y reintente.",
      EXIT_HISTORY,
    );
  }

  /** Libera el lock. Es idempotente. */
  release(): void {
    if (this.#descriptor === null) return;
    try {
      closeSync(this.#descriptor);
    } catch {
      // Ya estaba cerrado.
    }
    this.#descriptor = null;
    try {
      unlinkSync(this.#path);
    } catch {
      // Otro proceso lo borró: el lock ya no está.
    }
  }

  /** Ejecuta una función con el lock tomado, liberándolo siempre. */
  static run<T>(ticketsDir: string, action: () => T): T {
    const lock = MutationLock.acquire(ticketsDir);
    try {
      return action();
    } finally {
      lock.release();
    }
  }
}
