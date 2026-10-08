/**
 * La unión de los registros append-only al integrar la rama de un worktree.
 *
 * Dos ramas que añaden eventos al mismo registro lo dejan en conflicto de git, y los cursores de
 * `.valmen/executions/events.jsonl` deben ser consecutivos (`readExecutionEvents`). Aquí se une
 * solo lo que es seguro: la base común debe ser prefijo de las dos versiones; los entrantes se
 * deduplican por `eventId` («mismo hecho» de `sameEvent`: sin `cursor` ni `receivedAt`) y solo se
 * renumera su cursor como `history.length + 1`. Un `eventId` con contenido distinto o una línea
 * previa editada no se une: se informa y la integración se aborta.
 */

const REGISTROS_FIJOS: readonly string[] = [".valmen/executions/events.jsonl", ".valmen/autonomous-stops.jsonl"];
const REGISTROS_POR_CARPETA: readonly RegExp[] = [/^\.valmen\/receipts\/[^/]+\.jsonl$/, /^\.valmen\/journeys\/[^/]+\.jsonl$/];

/** ¿Es esta ruta uno de los registros append-only que se pueden unir? Lista cerrada. */
export function esRegistroUnible(ruta: string): boolean {
  if (ruta.split("/").includes("..")) return false;
  return REGISTROS_FIJOS.includes(ruta) || REGISTROS_POR_CARPETA.some((patron) => patron.test(ruta));
}

export type UnionDeRegistro =
  | { readonly ok: true; readonly contenido: string; readonly incorporadas: number }
  | { readonly ok: false; readonly motivo: string };

const CAMPOS_QUE_NO_SON_EL_HECHO = ["cursor", "receivedAt"];

const lineasDe = (texto: string): string[] => texto.split("\n").filter((linea) => linea.trim() !== "");

function objetoDe(linea: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(linea);
    return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const eventIdDe = (objeto: Record<string, unknown> | null): string | null =>
  objeto !== null && typeof objeto["eventId"] === "string" ? objeto["eventId"] : null;

/** El hecho de un evento: todo menos el cursor y el instante de recepción, con las claves en orden. */
function hechoDe(objeto: Record<string, unknown>): string {
  const ordenar = (valor: unknown): unknown =>
    Array.isArray(valor)
      ? valor.map(ordenar)
      : valor !== null && typeof valor === "object"
        ? Object.fromEntries(
            Object.entries(valor as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([clave, v]) => [clave, ordenar(v)]),
          )
        : valor;
  return JSON.stringify(ordenar(Object.fromEntries(Object.entries(objeto).filter(([clave]) => !CAMPOS_QUE_NO_SON_EL_HECHO.includes(clave)))));
}

function esPrefijo(base: readonly string[], version: readonly string[]): boolean {
  return base.length <= version.length && base.every((linea, i) => linea === version[i]);
}

/**
 * Une las dos versiones de un registro a partir de su base común (cadena vacía si el archivo no
 * existía). Devuelve el contenido completo o el motivo por el que no se puede unir.
 */
export function unirRegistro(entrada: {
  readonly ruta: string;
  readonly base: string;
  readonly ours: string;
  readonly theirs: string;
}): UnionDeRegistro {
  const base = lineasDe(entrada.base);
  const ours = lineasDe(entrada.ours);
  const theirs = lineasDe(entrada.theirs);
  if (!esPrefijo(base, ours)) {
    return { ok: false, motivo: `${entrada.ruta}: main editó o borró una línea previa del registro (la base no es prefijo de su versión).` };
  }
  if (!esPrefijo(base, theirs)) {
    return { ok: false, motivo: `${entrada.ruta}: la rama editó o borró una línea previa del registro (la base no es prefijo de su versión).` };
  }

  const resultado = [...ours];
  const porEventId = new Map<string, Record<string, unknown>>();
  for (const linea of ours) {
    const objeto = objetoDe(linea);
    const id = eventIdDe(objeto);
    if (id !== null && objeto !== null) porEventId.set(id, objeto);
  }
  const lineasPropias = new Set(ours);

  let incorporadas = 0;
  for (const linea of theirs.slice(base.length)) {
    const objeto = objetoDe(linea);
    const id = eventIdDe(objeto);
    if (id === null || objeto === null) {
      if (lineasPropias.has(linea)) continue;
      resultado.push(linea);
      lineasPropias.add(linea);
      incorporadas += 1;
      continue;
    }
    const previo = porEventId.get(id);
    if (previo !== undefined) {
      if (hechoDe(previo) === hechoDe(objeto)) continue;
      return { ok: false, motivo: `${entrada.ruta}: el eventId ${id} tiene contenido distinto en las dos versiones.` };
    }
    const cursor = resultado.length + 1;
    const final = "cursor" in objeto && objeto["cursor"] !== cursor ? JSON.stringify({ ...objeto, cursor }) : linea;
    const objetoFinal = objetoDe(final) as Record<string, unknown>;
    resultado.push(final);
    lineasPropias.add(final);
    porEventId.set(id, objetoFinal);
    incorporadas += 1;
  }
  return { ok: true, contenido: resultado.length === 0 ? "" : `${resultado.join("\n")}\n`, incorporadas };
}
