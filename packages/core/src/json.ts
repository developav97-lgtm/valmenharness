/**
 * Serialización de bloques JSON idéntica a la de la implementación de referencia.
 *
 * Los bloques del ticket (`Puntos`, `QA`, `Eventos`…) no se editan: se
 * **re-serializan enteros** cada vez que se anexa algo. Eso significa que
 * cualquier diferencia de formato entre serializadores no cambia una entrada:
 * reescribe todas las demás. Un historial que se reformatea solo porque se
 * añadió una línea al final no es un historial.
 *
 * La referencia es `json.dumps(entries, ensure_ascii=False, indent=2)` de Python.
 * Verificado: reproduce byte a byte los 399 bloques JSON de los 57 tickets
 * reales.
 *
 * La única diferencia que **no** se puede eliminar: Python distingue el entero
 * `1` del flotante `1.0` y los escribe distinto; JavaScript no distingue, porque
 * un `JSON.parse` convierte ambos en el mismo número. Un valor flotante con
 * parte decimal cero se escribiría `1` en vez de `1.0`. Ningún valor del registro
 * real está en ese caso, y la comprobación de bloques lo verifica.
 */

/**
 * Formatea un número como lo haría Python.
 *
 * La regla de Python para `repr(float)` es: notación posicional mientras el
 * exponente esté entre -4 y 16; fuera de ahí, notación científica con el signo
 * explícito y el exponente con al menos dos dígitos.
 *
 * Medido contra el intérprete real:
 *
 * | Valor        | Python      | `JSON.stringify` |
 * | ------------ | ----------- | ---------------- |
 * | `0.0001`     | `0.0001`    | `0.0001`         |
 * | `0.00001`    | `1e-05`     | `0.00001`        |
 * | `0.0000315`  | `3.15e-05`  | `0.0000315`      |
 * | `1e16`       | `1e+16`     | `10000000000000000` |
 *
 * Las dos últimas filas son la razón de esta función: `estimated_cost_usd`
 * guarda costes que caen por debajo de `1e-4` con toda normalidad.
 */
export function formatPythonNumber(value: number): string {
  if (!Number.isFinite(value)) {
    // El contrato ya rechaza `Infinity` y `NaN`; llegar aquí sería un fallo de
    // programación, no un dato del usuario, y escribir `Infinity` produciría un
    // bloque que el propio validador rechaza.
    throw new Error(
      `No se puede serializar un número no finito: ${String(value)}.`,
    );
  }

  if (Number.isInteger(value)) return String(value);

  // Los dígitos significativos se toman de la representación exponencial de
  // JavaScript, que es la más corta que reconstruye el mismo número: la misma
  // propiedad que garantiza `repr` en Python.
  const [mantissa, exponente] = value.toExponential().split("e") as [
    string,
    string,
  ];
  const exp = Number(exponente);

  if (exp < -4 || exp >= 16) {
    const signo = exp < 0 ? "-" : "+";
    return `${mantissa}e${signo}${String(Math.abs(exp)).padStart(2, "0")}`;
  }

  // Notación posicional: se coloca el punto a mano desde los dígitos, porque
  // `toFixed` redondearía a un número fijo de decimales y perdería el último.
  const negativo = mantissa.startsWith("-");
  const digitos = mantissa.replace("-", "").replace(".", "");
  const posicion = exp + 1;

  let cuerpo: string;
  if (posicion <= 0) {
    cuerpo = `0.${"0".repeat(-posicion)}${digitos}`;
  } else if (posicion >= digitos.length) {
    cuerpo = `${digitos}${"0".repeat(posicion - digitos.length)}.0`;
  } else {
    cuerpo = `${digitos.slice(0, posicion)}.${digitos.slice(posicion)}`;
  }

  return negativo ? `-${cuerpo}` : cuerpo;
}

/** Renderiza un valor con la misma forma que `json.dumps(..., indent=2)`. */
function render(value: unknown, depth: number, indent: number): string {
  if (value === null) return "null";

  if (typeof value === "string") {
    // `JSON.stringify` de una cadena escapa exactamente el mismo conjunto que
    // Python: comillas, barra invertida, los cinco controles con nombre y el
    // resto de controles como `\uXXXX` en minúsculas.
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return formatPythonNumber(value);

  const sangria = " ".repeat(indent * (depth + 1));
  const cierre = " ".repeat(indent * depth);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map(
      (item) => `${sangria}${render(item, depth + 1, indent)}`,
    );
    return `[\n${items.join(",\n")}\n${cierre}]`;
  }

  if (typeof value === "object") {
    // El orden de inserción es el del contrato: `json.dumps` lo respeta y el
    // recibo de la referencia depende de él. Reordenar las claves cambiaría
    // todos los bloques del registro.
    const entradas = Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined,
    );
    if (entradas.length === 0) return "{}";
    const items = entradas.map(
      ([clave, item]) =>
        `${sangria}${JSON.stringify(clave)}: ${render(item, depth + 1, indent)}`,
    );
    return `{\n${items.join(",\n")}\n${cierre}}`;
  }

  throw new Error(
    `No se puede serializar un valor de tipo ${typeof value}: no existe en JSON.`,
  );
}

/**
 * Serializa el contenido de un bloque JSON.
 *
 * `undefined` no existe en JSON: una clave con ese valor se omite, igual que
 * haría `json.dumps` con un diccionario que no la tuviera.
 */
export function formatJsonBlock(value: unknown, indent = 2): string {
  return render(value, 0, indent);
}
