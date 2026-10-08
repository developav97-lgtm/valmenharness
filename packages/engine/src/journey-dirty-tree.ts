/**
 * El aviso de árbol sucio de la ola.
 *
 * Antes el despacho desatendido se negaba a arrancar sobre un árbol con archivos ajenos y
 * registraba cada pasada sucia. Con la corrida orquestada cada ticket vive en su worktree, así
 * que un árbol sucio ya no impide nada: se **avisa al consultar** la ola o el brief. El aviso se
 * calcula al momento, no escribe ningún archivo y no deja registro.
 *
 * El registro histórico `.valmen/journeys/arbol-sucio.jsonl` ya no lo escribe nadie ni lo lee
 * nadie; sus líneas quedan como historia (son append-only).
 */
import { esRepositorioGit, estadoDelArbolDeTrabajo, type RutasPropias } from "./integration-commit.js";

const MAX_ARCHIVOS_DEL_AVISO = 10;

/**
 * El texto del aviso si el árbol de trabajo tiene archivos ajenos a la jornada, o `null` si está
 * limpio o la raíz no es un repositorio git. Solo lee: nunca escribe en el registro.
 */
export function advertenciaDeArbolSucio(root: string, propias?: RutasPropias): string | null {
  if (!esRepositorioGit(root)) return null;
  const archivos = estadoDelArbolDeTrabajo(root, undefined, propias);
  if (archivos.length === 0) return null;
  const mostrados = archivos.slice(0, MAX_ARCHIVOS_DEL_AVISO);
  const resto = archivos.length - mostrados.length;
  return [
    `Aviso: el árbol de trabajo tiene ${archivos.length} archivo(s) sin commitear que no son de la jornada. No bloquea la ola; commitéalos o descártalos antes de integrar:`,
    ...mostrados.map((archivo) => `  ${archivo}`),
    ...(resto > 0 ? [`  … y ${resto} más`] : []),
  ].join("\n");
}
