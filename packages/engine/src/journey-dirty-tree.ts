/**
 * El registro de las pasadas que no despacharon por árbol sucio.
 *
 * El despacho anexa una línea por pasada —los archivos que lo ensucian, o `limpio`— y el
 * vigilante la lee para avisar cuando la parada dura más de una pasada. Es estado del harness,
 * append-only: nadie reescribe una línea, y el episodio se identifica por su primera pasada.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface PasadaSucia {
  readonly journeyId: string;
  readonly at: string;
  readonly archivos: readonly string[];
}

export interface PasadaLimpia {
  readonly journeyId: string;
  readonly at: string;
  readonly limpio: true;
}

export type PasadaDeArbol = PasadaSucia | PasadaLimpia;

/** Ruta del registro, bajo el estado del harness (`.valmen/journeys/`). */
export function arbolSucioPath(root: string): string {
  return join(root, ".valmen", "journeys", "arbol-sucio.jsonl");
}

/** Anexa una pasada. */
export function registrarPasadaDeArbol(root: string, pasada: PasadaDeArbol): void {
  const path = arbolSucioPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(pasada)}\n`, "utf8");
}

/** Las pasadas registradas, en orden; una línea ilegible no impide leer el resto. */
export function leerPasadasDeArbol(root: string): PasadaDeArbol[] {
  const path = arbolSucioPath(root);
  if (!existsSync(path)) return [];
  const salida: PasadaDeArbol[] = [];
  for (const linea of readFileSync(path, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor = JSON.parse(linea) as Record<string, unknown>;
      if (typeof valor["journeyId"] !== "string" || typeof valor["at"] !== "string") continue;
      if (valor["limpio"] === true) {
        salida.push({ journeyId: valor["journeyId"], at: valor["at"], limpio: true });
      } else if (Array.isArray(valor["archivos"])) {
        salida.push({
          journeyId: valor["journeyId"],
          at: valor["at"],
          archivos: valor["archivos"].filter((a): a is string => typeof a === "string"),
        });
      }
    } catch {
      // Una línea a medio escribir no borra las anteriores.
    }
  }
  return salida;
}

/**
 * El episodio de árbol sucio en curso de una jornada: la racha final de pasadas sucias.
 * Devuelve `null` si la última pasada fue limpia o no hay pasadas.
 */
export function episodioDeArbolSucio(
  pasadas: readonly PasadaDeArbol[],
  journeyId: string,
): { readonly episodio: string; readonly pasadas: number; readonly archivos: readonly string[] } | null {
  const propias = pasadas.filter((p) => p.journeyId === journeyId);
  let primera: PasadaSucia | undefined;
  let cuenta = 0;
  let ultima: PasadaSucia | undefined;
  for (let i = propias.length - 1; i >= 0; i--) {
    const p = propias[i] as PasadaDeArbol;
    if ("limpio" in p) break;
    primera = p;
    ultima ??= p;
    cuenta++;
  }
  if (primera === undefined || ultima === undefined) return null;
  return { episodio: primera.at, pasadas: cuenta, archivos: ultima.archivos };
}
