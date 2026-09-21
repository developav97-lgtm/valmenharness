/**
 * Edición del frontmatter y de los bloques estructurados.
 *
 * El frontmatter usa un formato restringido —una línea `clave: valor` por
 * campo, sin mapas ni multilínea— precisamente para que editarlo sea una
 * operación textual predecible, sin un parser YAML completo.
 */
import { fail } from "./errors.js";
import { FRONTMATTER_BLOCK_RE, FRONTMATTER_LINE_RE } from "./contract.js";
import { isSafePlainScalar } from "./parser.js";
import { formatJsonBlock } from "./json.js";
/**
 * Escapa un valor para usarlo como reemplazo literal.
 *
 * `String.prototype.replace` interpreta `$&`, `$1` y `$$` en el reemplazo. Un
 * valor con un `$` —una ruta, un identificador, un importe— se corrompería en
 * silencio, que es exactamente el fallo que este proyecto existe para evitar.
 * La forma segura de insertar texto literal es una función de reemplazo, que
 * no interpreta patrones.
 */
function literal(value) {
    return () => value;
}
/**
 * Reemplaza el valor de una clave del frontmatter.
 *
 * Solo actúa dentro del bloque de frontmatter, no en el cuerpo: una sección de
 * Markdown puede contener legítimamente una línea que empiece por `updated: `.
 */
export function replaceFrontmatterField(text, key, value) {
    if (!isSafePlainScalar(value)) {
        fail(`El valor de ${key} no es un escalar plain seguro.`);
    }
    const block = FRONTMATTER_BLOCK_RE.exec(text);
    if (block === null) {
        fail("No se encontró el frontmatter; el documento no es canónico.");
    }
    let replaced = false;
    const lines = (block[1] ?? "").split("\n").map((line) => {
        const match = FRONTMATTER_LINE_RE.exec(line);
        if (match === null || match[1] !== key)
            return line;
        replaced = true;
        return `${key}: ${value}`;
    });
    if (!replaced) {
        fail(`No se pudo actualizar ${key}; el documento no es canónico.`);
    }
    const body = text.slice(block[0].length);
    return `---\n${lines.join("\n")}\n---\n${body}`;
}
/**
 * Reemplaza varios campos del frontmatter en una sola pasada.
 *
 * Aplicar los reemplazos de uno en uno exige reanalizar el bloque en cada paso
 * y deja el documento en un estado intermedio si alguno falla. En una pasada,
 * o se aplican todos o no se cambia nada.
 */
export function replaceFrontmatterFields(text, updates) {
    for (const [key, value] of Object.entries(updates)) {
        if (!isSafePlainScalar(value)) {
            fail(`El valor de ${key} no es un escalar plain seguro.`);
        }
    }
    const block = FRONTMATTER_BLOCK_RE.exec(text);
    if (block === null) {
        fail("No se encontró el frontmatter; el documento no es canónico.");
    }
    const remaining = new Set(Object.keys(updates));
    const lines = (block[1] ?? "").split("\n").map((line) => {
        const match = FRONTMATTER_LINE_RE.exec(line);
        if (match === null)
            return line;
        const key = match[1];
        const value = updates[key];
        if (value === undefined)
            return line;
        remaining.delete(key);
        return `${key}: ${value}`;
    });
    if (remaining.size > 0) {
        const missing = [...remaining].join(", ");
        fail(`No se pudieron actualizar ${missing}; el documento no es canónico.`);
    }
    const body = text.slice(block[0].length);
    return `---\n${lines.join("\n")}\n---\n${body}`;
}
/**
 * Reemplaza el bloque JSON de una sección estructurada.
 *
 * La sustitución es textual y el resultado **no se valida aquí**: quien muta
 * revalida el documento completo antes de escribirlo. Así una mutación que
 * produciría un estado inválido nunca llega al disco.
 */
export function replaceBlock(text, section, entries) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^## ${escaped}\\n[\\s\\S]*?^\`\`\`json\\n)([\\s\\S]*?)(\\n\`\`\`[ \\t]*$)`, "m");
    if (!pattern.test(text)) {
        fail(`No se pudo actualizar el bloque ${section}; el documento no es canónico.`);
    }
    // La serialización replica `json.dumps(ensure_ascii=False, indent=2)` de la
    // implementación de referencia, incluidas las reglas de los flotantes: el
    // bloque se reescribe entero, así que una diferencia de formato no cambiaría
    // una entrada, reformatearía todas las demás.
    //
    // El reemplazo por función evita además que un `$` en el contenido se
    // interprete como patrón.
    const rendered = formatJsonBlock(entries);
    return text.replace(pattern, (_match, head, _body, tail) => `${head}${rendered}${tail}`);
}
/** Siguiente identificador monótono de una sección: `POINT-001`, `EVENT-002`. */
export function nextId(entries, prefix) {
    return `${prefix}-${String(entries.length + 1).padStart(3, "0")}`;
}
/**
 * Construye un evento del registro.
 *
 * El registro de eventos es append-only: cada mutación añade exactamente uno.
 * Es la razón por la que un ticket se puede auditar sin depender de que alguien
 * haya documentado lo que hizo.
 */
export function newEvent(entries, action, details, actor, today) {
    return {
        kind: "ticket-event",
        id: nextId(entries, "EVENT"),
        date: today,
        action,
        actor,
        details,
    };
}
/** Fecha local en `YYYY-MM-DD`, el formato que exige el contrato. */
export function today(now = new Date()) {
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
//# sourceMappingURL=edit.js.map