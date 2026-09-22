/**
 * Validadores de campo elementales.
 *
 * Cada función espeja una del CLI de referencia, **incluido el mensaje de error
 * literal y su código de salida**. Los mensajes son parte del contrato: un test
 * de equivalencia que los compare falla si se "mejoran".
 */
import { BUILD_REFERENCE_RE, DATE_RE } from "./contract.js";
import { EXIT_REFERENCE, EXIT_SCHEMA, fail } from "./errors.js";

/**
 * Texto de una sola línea, seguro y no vacío.
 *
 * Espeja `validate_text`. Devuelve el valor recortado.
 */
export function validateText(
  value: string | null | undefined,
  label: string,
  options: { allowEmpty?: boolean } = {},
): string {
  if (value === null || value === undefined) {
    fail(`Falta ${label}.`);
  }
  if (value.includes("\n") || value.includes("\r") || value.includes("\0")) {
    fail(`${label} debe ocupar una sola línea segura.`);
  }
  if (options.allowEmpty !== true && value.trim() === "") {
    fail(`${label} no puede estar vacío.`);
  }
  return value.trim();
}

/**
 * Caracteres no imprimibles **distintos del espacio ASCII**.
 *
 * `str.isprintable()` de Python devuelve `False` para las categorías Cc, Cf,
 * Cs, Co, Cn, Zl y Zp, y para los separadores Zs **salvo el espacio ASCII**,
 * que sí considera imprimible.
 *
 * En lugar de una resta de conjuntos —que exige el flag `v` y complica la
 * expresión— el espacio se excluye en la función. Un `\p{Zs}` a secas rechaza
 * cualquier título con espacios: ese fue el error que esta corrección
 * documenta, y hacía fallar los 57 tickets.
 */
const NON_PRINTABLE_RE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** El espacio ASCII, el único separador de espacio que Python sí imprime. */
const ASCII_SPACE = " ";

/**
 * `true` si todos los caracteres son imprimibles, como `str.isprintable()`.
 *
 * La cadena vacía es imprimible, igual que en Python.
 */
export function isPrintable(value: string): boolean {
  for (const character of value) {
    if (character === ASCII_SPACE) continue;
    if (NON_PRINTABLE_RE.test(character)) return false;
  }
  return true;
}

/**
 * Título del ticket: una línea, sin `|` (rompe las tablas Markdown del CLI) y
 * como escalar plain seguro.
 */
export function validateTitle(value: string | null | undefined): string {
  const title = validateText(value, "title");
  if (title.includes("|") || !isPrintable(title)) {
    fail("title contiene caracteres no seguros para las salidas del CLI.");
  }
  if (!isSafePlainScalarFromParser(title)) {
    fail("title debe ser un escalar plain seguro de una sola línea.");
  }
  return title;
}

/**
 * Solicitud original: se conserva **literalmente**, con sus saltos y espacios.
 *
 * Es el único campo de texto que no se recorta: la solicitud es evidencia y
 * reescribirla rompería la trazabilidad.
 */
export function validateRequest(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") {
    fail("request no puede estar vacío.");
  }
  if (value.includes("\0")) {
    fail("request contiene un carácter nulo no permitido.");
  }
  return value;
}

/** Fecha ISO `YYYY-MM-DD` que además debe existir en el calendario. */
export function validateIsoDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    fail(`${label} debe usar YYYY-MM-DD.`);
  }
  const [yearText, monthText, dayText] = value.split("-") as [string, string, string];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  // `Date.UTC` normaliza los desbordamientos (2024-02-30 → 2024-03-01), así que
  // se comprueba que la fecha reconstruida coincida con la declarada.
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!exists) {
    fail(`${label} contiene una fecha inexistente.`);
  }
}

/** `null` o texto no vacío. */
export function validateNullableText(value: unknown, label: string): void {
  if (value === null) return;
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} debe ser null o texto no vacío.`);
  }
}

/** `null` o entero no negativo. Rechaza booleanos y flotantes. */
export function validateNullableNonNegativeInteger(value: unknown, label: string): void {
  if (value === null) return;
  if (
    typeof value === "boolean" ||
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    fail(`${label} debe ser null o un entero no negativo.`);
  }
}

/** `null` o número no negativo y finito. */
export function validateNullableNonNegativeNumber(value: unknown, label: string): void {
  if (value === null) return;
  if (
    typeof value === "boolean" ||
    typeof value !== "number" ||
    value < 0 ||
    !Number.isFinite(value)
  ) {
    fail(`${label} debe ser null o un número no negativo finito.`);
  }
}

/**
 * Referencia inmutable a un artefacto probado.
 *
 * Solo admite `commit:<sha40>` o `worktree:sha256:<sha256>`, ambos en
 * minúsculas. La cadena literal `worktree` no es válida aquí: la expande antes
 * `resolveReference`.
 */
export function validateReference(
  value: string | null | undefined,
  label = "La referencia",
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !BUILD_REFERENCE_RE.test(value)) {
    fail(
      `${label} debe ser commit:<sha40> o worktree:sha256:<sha256> en minúsculas.`,
      EXIT_REFERENCE,
    );
  }
}

/**
 * Igualdad exacta de las claves de un objeto JSON contra el conjunto del
 * esquema: ni una de menos, ni una de más.
 */
export function requireExactKeys(
  item: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const actual = Object.keys(item);
  if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
    fail(`${label} no contiene las claves exactas del esquema.`);
  }
}

/** El valor debe ser un arreglo JSON. */
export function requireList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(`${label} debe ser un arreglo JSON.`);
  }
  return value;
}

/**
 * Identificadores monótonos, únicos y en orden.
 *
 * La comparación es lista contra lista: exige el valor **y la posición**
 * exactos. `POINT-002` seguido de `POINT-001` falla aunque ambos existan.
 */
export function validateSequential(
  entries: readonly Record<string, unknown>[],
  prefix: string,
  label: string,
): void {
  const actual = entries.map((entry) => entry["id"]);
  const expected = entries.map(
    (_entry, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
  );
  const matches =
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index]);
  if (!matches) {
    fail(`Los IDs de ${label} deben ser únicos, monótonos y conservar su orden.`);
  }
}

/**
 * Recorta al final cualquier combinación de los caracteres dados.
 *
 * Espeja `str.rstrip(". ;:")` de Python, que elimina **cualquier** combinación
 * final de esos caracteres, no la subcadena completa.
 */
export function rstripChars(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value[end - 1] as string)) {
    end -= 1;
  }
  return value.slice(0, end);
}

/** Marcadores de que un campo está sin completar. */
export const PLACEHOLDERS_WITH_DASH = [
  "-",
  "tbd",
  "todo",
  "pendiente",
  "por definir",
  "a definir",
  "por completar",
  "n/a",
  "na",
  "no aplica",
  "placeholder",
] as const;

/** Igual que `PLACEHOLDERS_WITH_DASH` pero sin el guion suelto. */
export const PLACEHOLDERS = [
  "tbd",
  "todo",
  "pendiente",
  "por definir",
  "a definir",
  "por completar",
  "n/a",
  "na",
  "no aplica",
  "placeholder",
] as const;

/** Prefijos que indican que el contenido sigue pendiente. */
export const PENDING_PREFIXES = [
  "pendiente",
  "por definir",
  "a definir",
  "por completar",
] as const;

/** `true` si el texto normalizado es un marcador de pendiente. */
export function isPlaceholder(
  normalized: string,
  placeholders: readonly string[],
): boolean {
  if (placeholders.includes(normalized)) return true;
  return PENDING_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Reexport del parser: `isSafePlainScalar` vive allí porque el frontmatter lo usa.
import { isSafePlainScalar as isSafePlainScalarFromParser } from "./parser.js";

export { EXIT_SCHEMA };
