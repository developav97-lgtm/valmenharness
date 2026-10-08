/**
 * Integrar la rama del worktree de un ticket al checkout principal (corrida orquestada).
 *
 * `integrarWorktree` lleva `valmen/ticket-<slug>` a `main` con avance directo si `main` no se
 * movió, o con `merge --no-ff` si avanzó, tras una comprobación previa por `merge-tree`. Une los
 * registros append-only (`worktree-registros.ts`), regenera `tickets/index.md` y recompila. Un
 * conflicto de código no se resuelve: se lista y no se toca nada. Nunca hace push ni fuerza, y todo
 * el git y los procesos salen de las listas cerradas del módulo.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { EXIT_INVARIANT, atomicWrite, fail } from "@valmen/core";

import { findAllTickets, indexPath, toRelative, type RegistryPaths } from "./discovery.js";
import { renderIndex } from "./index-file.js";
import { RAMA_BASE, estadoDelArbolDeTrabajo, ramaActual } from "./integration-commit.js";
import { type EjecutorDeGit, motivoDeArchivoProhibido } from "./integration-rules.js";
import { ejecutarGitDeIntegracion } from "./worktree-integracion-git.js";
import { type EjecutorDeProceso, ejecutarProcesoDeWorktree, exigirCheckoutPrincipal, nombresDeWorktree } from "./worktree-git.js";
import { esRegistroUnible, unirRegistro } from "./worktree-registros.js";

export interface IntegrarRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly home?: string | undefined;
  readonly git?: EjecutorDeGit | undefined;
  readonly proceso?: EjecutorDeProceso | undefined;
}

export interface WorktreeIntegrado {
  readonly rama: string;
  readonly modo: "nada-que-integrar" | "avance-directo" | "merge";
  /** El commit de `main` tras integrar. */
  readonly commit: string;
  readonly registrosUnidos: readonly string[];
  readonly indiceRegenerado: boolean;
}

/** Las rutas del `status --porcelain` crudo: sin quitar el estado del harness. */
function rutasConCambios(salida: string): string[] {
  return salida
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .map((linea) => linea.slice(3).trim())
    .map((ruta) => (ruta.includes(" -> ") ? (ruta.split(" -> ")[1] as string) : ruta))
    .map((ruta) => ruta.replace(/^"|"$/g, ""));
}

export function integrarWorktree(request: IntegrarRequest): WorktreeIntegrado {
  const { paths, git } = request;
  const root = paths.root;
  const { carpeta, rama } = nombresDeWorktree(request.ticketId);
  const absoluta = join(root, carpeta);
  const ejecutor: EjecutorDeGit = (argumentos, cwd) => ejecutarGitDeIntegracion(cwd, argumentos, git);
  const g = (cwd: string, ...argumentos: string[]) => ejecutarGitDeIntegracion(cwd, argumentos, git);
  const indiceRelativo = toRelative(paths, indexPath(paths));

  exigirCheckoutPrincipal(root, git);

  const listada = g(root, "branch", "--list", rama);
  if (listada.status !== 0) fail(`git branch falló: ${listada.stderr.trim()}`, EXIT_INVARIANT);
  if (listada.stdout.trim() === "") fail(`La rama ${rama} no existe: no hay nada que integrar (¿se creó el worktree con \`journey worktree create\`?).`, EXIT_INVARIANT);
  if (!existsSync(absoluta)) fail(`El worktree ${carpeta} no existe: no hay nada que integrar.`, EXIT_INVARIANT);

  const actual = ramaActual(root, ejecutor);
  if (actual !== RAMA_BASE) {
    fail(`El checkout principal está en "${actual}", no en ${RAMA_BASE}: integrar solo avanza ${RAMA_BASE}.`, EXIT_INVARIANT);
  }

  const cabeza = (): string => g(root, "rev-parse", "HEAD").stdout.trim();

  if (g(root, "merge-base", "--is-ancestor", rama, RAMA_BASE).status === 0) {
    return Object.freeze({ rama, modo: "nada-que-integrar" as const, commit: cabeza(), registrosUnidos: Object.freeze([]), indiceRegenerado: false });
  }

  const sucioElWorktree = estadoDelArbolDeTrabajo(absoluta, ejecutor);
  if (sucioElWorktree.length > 0) {
    fail(`El worktree ${carpeta} tiene cambios sin commit (${sucioElWorktree.slice(0, 5).join(", ")}): commitéalos antes de integrar.`, EXIT_INVARIANT);
  }

  const diferencia = g(root, "diff", "--name-only", "-z", `${RAMA_BASE}...${rama}`);
  if (diferencia.status !== 0) fail(`git diff falló: ${diferencia.stderr.trim()}`, EXIT_INVARIANT);
  const archivosDeLaRama = diferencia.stdout.split("\0").filter((a) => a !== "");
  const prohibidos = archivosDeLaRama.map(motivoDeArchivoProhibido).filter((m): m is string => m !== null);
  if (prohibidos.length > 0) fail(`La rama ${rama} cambia archivos que no se integran: ${prohibidos.join("; ")}.`, EXIT_INVARIANT);

  const sucioElPrincipal = estadoDelArbolDeTrabajo(root, ejecutor);
  if (sucioElPrincipal.length > 0) {
    fail(`El checkout principal tiene cambios sin commit (${sucioElPrincipal.slice(0, 5).join(", ")}): limpia antes de integrar.`, EXIT_INVARIANT);
  }
  const crudo = g(root, "status", "--porcelain", "-uall");
  if (crudo.status !== 0) fail(`git status falló: ${crudo.stderr.trim()}`, EXIT_INVARIANT);
  const delRama = new Set(archivosDeLaRama);
  const solape = rutasConCambios(crudo.stdout).filter((ruta) => delRama.has(ruta));
  if (solape.length > 0) {
    fail(`El checkout principal tiene cambios sin commit en archivos que también cambia la rama (${solape.slice(0, 5).join(", ")}): no se integra.`, EXIT_INVARIANT);
  }

  const regenerarIndice = (): boolean => {
    const destino = indexPath(paths);
    const contenido = renderIndex(paths, findAllTickets(paths));
    if (existsSync(destino) && readFileSync(destino, "utf8") === contenido) return false;
    atomicWrite(destino, contenido);
    return true;
  };

  let modo: "avance-directo" | "merge";
  const registrosUnidos: string[] = [];
  let indiceRegenerado = false;

  if (g(root, "merge-base", "--is-ancestor", RAMA_BASE, rama).status === 0) {
    modo = "avance-directo";
    const ff = g(root, "merge", "--ff-only", rama);
    if (ff.status !== 0) fail(`merge --ff-only falló: ${ff.stderr.trim()}`, EXIT_INVARIANT);
    if (regenerarIndice()) {
      indiceRegenerado = true;
      const a = g(root, "add", "--", indiceRelativo);
      if (a.status !== 0) fail(`git add falló: ${a.stderr.trim()}`, EXIT_INVARIANT);
      const c = g(root, "commit", "-m", `Regenera tickets/index.md tras integrar ${request.ticketId}`);
      if (c.status !== 0) fail(`git commit falló: ${c.stderr.trim()}`, EXIT_INVARIANT);
    }
  } else {
    modo = "merge";
    const previa = g(root, "merge-tree", "--write-tree", "--name-only", "--no-messages", RAMA_BASE, rama);
    if (previa.status !== 0 && previa.status !== 1) fail(`git merge-tree falló: ${previa.stderr.trim()}`, EXIT_INVARIANT);
    const conflictos = previa.status === 0 ? [] : previa.stdout.split("\n").slice(1).map((l) => l.trim()).filter((l) => l !== "");
    const sinResolver = conflictos.filter((ruta) => !esRegistroUnible(ruta) && ruta !== indiceRelativo);
    if (sinResolver.length > 0) {
      fail(`Conflicto de código entre ${RAMA_BASE} y ${rama} en: ${sinResolver.join(", ")}. No se tocó ${RAMA_BASE}: resuélvelo en el worktree y vuelve a integrar.`, EXIT_INVARIANT);
    }

    const base = g(root, "merge-base", RAMA_BASE, rama).stdout.trim();
    const m = g(root, "merge", "--no-ff", "--no-commit", rama);
    const abortar = (motivo: string): never => {
      const a = g(root, "merge", "--abort");
      return fail(
        a.status === 0
          ? `${motivo} Se ejecutó merge --abort: ${RAMA_BASE} quedó como estaba.`
          : `${motivo} Además \`merge --abort\` falló (${a.stderr.trim()}): revisa el checkout principal a mano.`,
        EXIT_INVARIANT,
      );
    };
    try {
      if (m.status !== 0 && conflictos.length === 0) abortar(`merge --no-ff falló: ${m.stderr.trim() || m.stdout.trim()}`);
      for (const ruta of conflictos.filter(esRegistroUnible)) {
        const leerVersion = (revision: string): string | null => {
          const r = g(root, "show", `${revision}:${ruta}`);
          return r.status === 0 ? r.stdout : null;
        };
        const ours = leerVersion(RAMA_BASE);
        const theirs = leerVersion(rama);
        if (ours === null || theirs === null) abortar(`No se puede unir ${ruta}: falta en ${ours === null ? RAMA_BASE : rama}.`);
        const union = unirRegistro({ ruta, base: leerVersion(base) ?? "", ours: ours as string, theirs: theirs as string });
        if (!union.ok) abortar(`No se puede unir el registro: ${union.motivo}`);
        else {
          atomicWrite(join(root, ...ruta.split("/")), union.contenido);
          const a = g(root, "add", "--", ruta);
          if (a.status !== 0) abortar(`git add ${ruta} falló: ${a.stderr.trim()}`);
          registrosUnidos.push(ruta);
        }
      }
      if (regenerarIndice() || conflictos.includes(indiceRelativo)) {
        indiceRegenerado = true;
        const a = g(root, "add", "--", indiceRelativo);
        if (a.status !== 0) abortar(`git add ${indiceRelativo} falló: ${a.stderr.trim()}`);
      }
      const c = g(root, "commit", "-m", `Integra ${request.ticketId} desde su worktree`);
      if (c.status !== 0) abortar(`git commit falló: ${c.stderr.trim() || c.stdout.trim()}`);
    } catch (caught) {
      // Un fallo inesperado a mitad del merge también deja `main` como estaba.
      if (existsSync(join(root, ".git", "MERGE_HEAD"))) g(root, "merge", "--abort");
      throw caught;
    }
  }

  const commit = cabeza();
  for (const [comando, argumentos] of [
    ["npx", ["tsc", "--build", "tsconfig.build.json"]],
    ["node", ["scripts/copy-web.mjs"]],
  ] as const) {
    const r = ejecutarProcesoDeWorktree(comando, argumentos, root, request.proceso);
    if (r.status !== 0) {
      fail(
        `La rama ${rama} quedó integrada en ${RAMA_BASE} (${commit.slice(0, 12)}), pero la recompilación falló (${comando} ${argumentos.join(" ")}): ${(r.stderr || r.stdout).trim().slice(0, 500)}. La integración se conserva: recompila a mano con \`npm run build\`.`,
        EXIT_INVARIANT,
      );
    }
  }
  return Object.freeze({ rama, modo, commit, registrosUnidos: Object.freeze(registrosUnidos), indiceRegenerado });
}
