/**
 * Comprueba que una ruta es segura antes de leerla o escribirla.
 *
 * Rechaza dos cosas, y las dos importan en un registro auditable:
 *
 * 1. **Escapes de la raíz.** Una ruta que se sale del proyecto escribiría fuera
 *    del repositorio, y el historial dejaría de ser verificable.
 * 2. **Enlaces simbólicos en cualquier componente.** Un enlace permitiría que un
 *    ticket apunte a un archivo de fuera y rompería la misma garantía por otra
 *    vía, incluido un enlace roto —que es justo el caso que una comprobación de
 *    existencia se salta—.
 *
 * `allowMissing` existe para el caso de crear: la ruta del destino todavía no
 * existe, y comprobar su existencia impediría escribir. En ese caso se detiene
 * en el primer componente ausente, **y eso es una limitación conocida**: los
 * componentes más profundos no se comprueban contra enlaces simbólicos porque no
 * se pueden inspeccionar sin que existan.
 */
export declare function ensureSecurePath(root: string, path: string, options?: {
    readonly allowMissing?: boolean;
}): void;
/**
 * Escribe un archivo de forma atómica.
 *
 * El temporal se crea en el **mismo directorio** que el destino: un `rename`
 * entre sistemas de archivos distintos no es atómico, así que usar el
 * directorio temporal del sistema rompería la garantía.
 */
export declare function atomicWrite(path: string, content: string): void;
/** Lee un archivo, o devuelve `null` si no existe. */
export declare function readIfExists(path: string): string | null;
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
export declare class MutationLock {
    #private;
    private constructor();
    /** Ruta del archivo de lock, expuesta para el mensaje de error. */
    get path(): string;
    /**
     * Adquiere el lock, reintentando durante aproximadamente un segundo.
     *
     * El reintento existe porque dos comandos pueden solaparse legítimamente
     * (un hook y una ejecución manual). Rendirse de inmediato daría un error
     * espurio en el caso normal.
     */
    static acquire(ticketsDir: string): MutationLock;
    /** Libera el lock. Es idempotente. */
    release(): void;
    /** Ejecuta una función con el lock tomado, liberándolo siempre. */
    static run<T>(ticketsDir: string, action: () => T): T;
}
//# sourceMappingURL=fs.d.ts.map