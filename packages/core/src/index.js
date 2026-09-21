/**
 * @valmen/core — dominio puro del harness.
 *
 * Sin I/O de red y sin dependencias externas. Lo único que toca el sistema de
 * archivos es `fs.ts`, y lo hace con las dos garantías que exige el registro:
 * escritura atómica y un solo escritor.
 */
export * from "./contract.js";
export * from "./transitions.js";
export * from "./template.js";
export * from "./errors.js";
export * from "./parser.js";
export * from "./validators.js";
export * from "./blocks.js";
export * from "./validate.js";
export * from "./json.js";
export * from "./edit.js";
export * from "./migrate.js";
export * from "./fs.js";
//# sourceMappingURL=index.js.map