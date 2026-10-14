/**
 * La rama base del proyecto: de ella nacen los worktrees de ticket y la rama de trabajo de la
 * jornada autónoma, contra ella se integran y se quitan, contra ella mide la limpieza qué está
 * integrado y code-review su diff por defecto, y contra ella se mide lo que la rama de un ticket
 * cambió (hash de QA).
 *
 * Sale de `execution.base-branch` de `.valmen/config.yaml`; sin el archivo o sin la clave es `main`,
 * así que un proyecto que ya trabaja sobre `main` no declara nada.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_BASE_BRANCH, parseConfig, readBaseBranch } from "@valmen/adapter";
import { EXIT_INVARIANT, fail, toFailure } from "@valmen/core";

export function ramaBaseDelProyecto(root: string): string {
  const ruta = join(root, ".valmen", "config.yaml");
  if (!existsSync(ruta)) return DEFAULT_BASE_BRANCH;
  try {
    return readBaseBranch(parseConfig(readFileSync(ruta, "utf8")));
  } catch (caught) {
    return fail(toFailure(caught).message, EXIT_INVARIANT);
  }
}
