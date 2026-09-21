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
export declare function formatPythonNumber(value: number): string;
/**
 * Serializa el contenido de un bloque JSON.
 *
 * `undefined` no existe en JSON: una clave con ese valor se omite, igual que
 * haría `json.dumps` con un diccionario que no la tuviera.
 */
export declare function formatJsonBlock(value: unknown, indent?: number): string;
//# sourceMappingURL=json.d.ts.map