/**
 * La rama base del proyecto: de ella nacen los worktrees de ticket, contra ella se integran y se
 * quitan, y contra ella se mide lo que la rama de un ticket cambió (hash de QA).
 *
 * Sale de `execution.base-branch` de `.valmen/config.yaml`; sin el archivo o sin la clave es `main`,
 * así que un proyecto que ya trabaja sobre `main` no declara nada. La jornada autónoma no la usa:
 * su rama de trabajo sigue naciendo de `RAMA_BASE` (`integration-commit.ts`).
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
