/**
 * Respaldo de lo que `valmen sync` sobrescribe, y el resumen de cambios de la
 * vista previa (`--dry-run`).
 *
 * Una sola carpeta por corrida, `.valmen/backups/sync/<AAAAMMDDTHHMMSSZ>/`, que se
 * crea al guardar el primer archivo: una corrida sin cambios no deja nada. Dentro,
 * cada archivo en su ruta relativa y un `manifiesto.json` con su sha256. La carpeta
 * lleva su propio `.gitignore` con `*`: lo respaldado puede ser lo que una persona
 * editó y no quiso commitear, y así no se versiona en ningún proyecto.
 *
 * Todo se escribe con `atomicWrite`: en modo pregunta el respaldo se niega igual
 * que la proyección, antes de pisar nada.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { atomicWrite } from "@valmen/core";

/** Dónde caen los respaldos de `sync`, relativo a la raíz del proyecto. */
const SYNC_BACKUP_DIR = ".valmen/backups/sync";

/** Cómo cambiaría un archivo: no existe, difiere o ya coincide. */
export interface ResumenDeCambios {
  readonly estado: "nuevo" | "cambia" | "igual";
  readonly anadidas: number;
  readonly quitadas: number;
}

function conteoDeLineas(texto: string): Map<string, number> {
  const conteo = new Map<string, number>();
  if (texto === "") return conteo;
  for (const linea of texto.split("\n")) conteo.set(linea, (conteo.get(linea) ?? 0) + 1);
  return conteo;
}

/**
 * El resumen `+N −M` de lo que cambiaría un archivo.
 *
 * Se cuenta como diferencia de multiconjuntos de líneas: no es un diff unificado
 * (no dice dónde), pero dice cuánto, no necesita dependencias y es determinista.
 */
export function resumenDeCambios(anterior: string | null, nuevo: string): ResumenDeCambios {
  const despues = conteoDeLineas(nuevo);
  if (anterior === null) {
    let total = 0;
    for (const cantidad of despues.values()) total += cantidad;
    return { estado: "nuevo", anadidas: total, quitadas: 0 };
  }
  if (anterior === nuevo) return { estado: "igual", anadidas: 0, quitadas: 0 };

  const antes = conteoDeLineas(anterior);
  let anadidas = 0;
  let quitadas = 0;
  for (const [linea, cantidad] of despues) {
    anadidas += Math.max(0, cantidad - (antes.get(linea) ?? 0));
  }
  for (const [linea, cantidad] of antes) {
    quitadas += Math.max(0, cantidad - (despues.get(linea) ?? 0));
  }
  return { estado: "cambia", anadidas, quitadas };
}

/** Un respaldo en curso. */
export interface Respaldo {
  /** Guarda la versión que está por pisarse, en su ruta relativa. */
  guardar(rutaRelativa: string, contenido: string): void;
  /** Cierra el manifiesto y devuelve la carpeta (relativa), o `null` si no se guardó nada. */
  cerrar(): string | null;
}

/** El instante como marca de carpeta: `20261011T123045Z`. */
function marcaDe(ahora: Date): string {
  return ahora
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

export function crearRespaldo(
  root: string,
  opciones: {
    readonly origen: "cli" | "mission-control";
    readonly ahora?: Date | undefined;
  },
): Respaldo {
  const ahora = opciones.ahora ?? new Date();
  const archivos: { ruta: string; sha256: string; bytes: number }[] = [];
  let carpeta: string | null = null;

  function abrir(): string {
    const marca = marcaDe(ahora);
    let nombre = marca;
    for (let n = 2; existsSync(join(root, SYNC_BACKUP_DIR, nombre)); n += 1) {
      nombre = `${marca}-${n}`;
    }
    atomicWrite(join(root, ".valmen", "backups", ".gitignore"), "*\n");
    return `${SYNC_BACKUP_DIR}/${nombre}`;
  }

  return {
    guardar(rutaRelativa, contenido) {
      carpeta ??= abrir();
      atomicWrite(join(root, carpeta, rutaRelativa), contenido);
      archivos.push({
        ruta: rutaRelativa,
        sha256: createHash("sha256").update(contenido).digest("hex"),
        bytes: Buffer.byteLength(contenido),
      });
    },
    cerrar() {
      if (carpeta === null) return null;
      const manifiesto = {
        creado: ahora.toISOString(),
        origen: opciones.origen,
        archivos,
      };
      atomicWrite(
        join(root, carpeta, "manifiesto.json"),
        `${JSON.stringify(manifiesto, null, 2)}\n`,
      );
      return carpeta;
    },
  };
}
