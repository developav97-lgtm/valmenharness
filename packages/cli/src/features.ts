/**
 * Los comandos de features.
 *
 * Viven aparte de `commands.ts` porque son un registro distinto del de tickets:
 * otro directorio, otro frontmatter, otra máquina de estados. Mezclarlos en el
 * mismo archivo haría que cada uno leyera las constantes del otro.
 *
 * `valmen feature new|show|list` es la mitad barata de la fase 5: el registro en
 * disco. La descomposición —`tickets.yaml`, la compuerta de cobertura— es un
 * comando aparte, porque cuesta una llamada a un modelo y este no.
 */
import { EXIT_SCHEMA, toFailure } from "@valmen/core";
import {
  type FeatureRow,
  createFeature,
  listFeatures,
  readFeature,
} from "@valmen/engine";

import type { CommandResult } from "./commands.js";

/** Escribe en stdout y termina con éxito. */
function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** Falla con el mensaje y el código que corresponde. */
function error(stderr: string, exitCode: number): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/** Los artefactos presentes, en una palabra, para la columna de la lista. */
function progreso(row: FeatureRow): string {
  const marcas = [
    ["spec", row.artifacts.hasSpec],
    ["diseño", row.artifacts.hasDesign],
    ["tickets", row.artifacts.hasDecomposition],
    ["verificación", row.artifacts.hasVerify],
  ] as const;
  const hechos = marcas.filter(([, hecho]) => hecho).map(([nombre]) => nombre);
  return hechos.length === 0 ? "—" : hechos.join(", ");
}

/**
 * `feature list`: las features del proyecto.
 *
 * Una feature que no valida **no se esconde**: se lista con su error. Ocultarla
 * dejaría un proyecto con una carpeta que nadie ve y un comando que dice que no
 * hay nada, que es la peor combinación posible.
 */
export function featureList(root: string): CommandResult {
  let filas: FeatureRow[];
  try {
    filas = listFeatures(root);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  if (filas.length === 0) {
    return ok("No hay features. Creá una con: valmen feature new <slug> --title <t>\n");
  }

  const ancho = Math.max(...filas.map((fila) => fila.id.length), 2);
  const lineas: string[] = [];
  for (const fila of filas) {
    if (fila.invalid !== null) {
      lineas.push(`${fila.id.padEnd(ancho)} | inválida | ${fila.invalid}`);
      continue;
    }
    lineas.push(
      `${fila.id.padEnd(ancho)} | ${fila.state} | ${progreso(fila)} | ${fila.title}`,
    );
  }
  return ok(lineas.join("\n") + "\n");
}

/** `feature show`: el brief y dónde vive cada artefacto. */
export function featureShow(root: string, slug: string | undefined): CommandResult {
  if (slug === undefined) {
    return error("feature show requiere un slug.", EXIT_SCHEMA);
  }

  let leida;
  try {
    leida = readFeature(root, slug);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  if (leida === null) {
    return error(
      `No existe la feature "${slug}" en .valmen/features/.`,
      EXIT_SCHEMA,
    );
  }

  const { row, text } = leida;
  if (row.invalid !== null) {
    // El texto se imprime igual: quien va a arreglarlo necesita verlo, y el
    // error dice qué está mal.
    return error(`${row.invalid}\n`, EXIT_SCHEMA);
  }

  const carpeta = `.valmen/features/${slug}`;
  // El brief siempre está: es el archivo que se acaba de leer. Los demás pueden
  // faltar, y decir cuáles faltan es la mitad del valor de `show`.
  const rutas = [
    ["brief", `${carpeta}/feature.md`, true],
    ["spec", `${carpeta}/spec/<dominio>/spec.md`, row.artifacts.hasSpec],
    ["diseño", `${carpeta}/design.md`, row.artifacts.hasDesign],
    ["tickets", `${carpeta}/tickets.yaml`, row.artifacts.hasDecomposition],
    ["verificación", `${carpeta}/verify.md`, row.artifacts.hasVerify],
  ] as const;

  const cabecera = [
    `${row.id} — ${row.title}`,
    `estado: ${row.state}`,
    `creada: ${row.created} · actualizada: ${row.updated}`,
    "artefactos:",
    ...rutas.map(
      ([nombre, ruta, hecho]) => `  ${hecho ? "✓" : "·"} ${ruta}  (${nombre})`,
    ),
  ].join("\n");

  return ok(`${cabecera}\n\n${text.trimEnd()}\n`);
}

/**
 * `feature new`: crea el brief en `draft`.
 *
 * El título es obligatorio y se pide explícito: derivarlo del slug produce
 * títulos como «Modulo inventario» que después nadie corrige.
 */
export function featureNew(
  root: string,
  slug: string | undefined,
  title: string | undefined,
): CommandResult {
  if (slug === undefined) {
    return error("feature new requiere un slug.", EXIT_SCHEMA);
  }
  if (title === undefined || title.trim() === "") {
    return error("feature new requiere --title.", EXIT_SCHEMA);
  }

  try {
    return ok(createFeature({ root, id: slug, title }) + "\n");
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `feature <subcomando>`: el despachador.
 *
 * Se despacha aquí y no en el `switch` de `main.ts` porque la forma es
 * `feature <sub> [args]`, y meterlo en el switch obligaría a que `main.ts`
 * supiera de features.
 */
export function runFeature(
  root: string,
  args: readonly string[],
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const [sub, ...resto] = args;
  const rawTitle = flags["title"];
  const title = typeof rawTitle === "string" ? rawTitle : undefined;

  switch (sub) {
    case "list":
      return featureList(root);
    case "show":
      return featureShow(root, resto[0]);
    case "new":
      return featureNew(root, resto[0], title);
    case undefined:
      return error(
        "feature requiere un subcomando: new, show o list.",
        EXIT_SCHEMA,
      );
    default:
      return error(
        `Subcomando de feature desconocido: ${sub}. Use new, show o list.`,
        EXIT_SCHEMA,
      );
  }
}
