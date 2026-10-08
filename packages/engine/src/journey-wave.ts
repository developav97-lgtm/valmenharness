/**
 * La ola de una jornada: qué tickets se pueden despachar ahora a subagentes en paralelo.
 *
 * Es una consulta de solo lectura. Clasifica cada ticket de la jornada en listo, en curso, en
 * espera o entregado, y recorta los listos al tope de simultáneos contando los que ya están en
 * curso. No lanza subagentes, no crea worktrees y no escribe en el registro.
 *
 * «En curso» se prueba con tres hechos, porque con un worktree por ticket el checkout principal
 * sigue viendo el ticket en `intake` hasta que se integra la rama: el estado `in_progress`, un
 * worktree de git de la rama del ticket y una actividad de ejecución abierta.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { readExecutionEvents } from "./execution-events.js";
import { paradasActivas } from "./autonomous-stops.js";
import { jornadaVigente } from "./journey-advance.js";
import { faseDelTicket } from "./journey-roadmap.js";
import { compareTicket, razonesDeVentana } from "./journey-selection.js";
import { readJourneys, type JourneyTicketInput } from "./journeys.js";
import { dependenciasEnGrafos } from "./materialize.js";
import { allDocuments } from "./mutate.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** Cuántos subagentes trabajan a la vez si la persona no pide otro número. */
export const OLA_CONCURRENCIA_POR_DEFECTO = 3;

/** Estados que cuentan como entregados: el trabajo ya salió del implementador. */
export const ESTADOS_ENTREGADOS = ["awaiting_user_tests", "in_qa", "qa_approved", "closed"] as const;

/** Un worktree de git, tal como lo lista `git worktree list --porcelain`. */
export interface WorktreeDeGit {
  readonly path: string;
  /** La rama sin `refs/heads/`, o `null` si la cabeza está suelta. */
  readonly branch: string | null;
}

export interface WorktreeSugerido {
  readonly nombre: string;
  readonly rama: string;
  readonly ruta: string;
}

export type SenalDeCurso = "estado" | "worktree" | "actividad";

export interface OlaSenal {
  readonly senal: SenalDeCurso;
  /** Qué la prueba: el estado, la ruta del worktree o la fuente de la actividad. */
  readonly fuente: string;
  /** Cuándo ocurrió, si el hecho lo dice. */
  readonly hora: string | null;
}

export interface OlaListo {
  readonly ticketId: string;
  readonly estado: string;
  readonly priority: number;
  readonly order: number;
  readonly worktree: WorktreeSugerido;
}

export interface OlaEnCurso {
  readonly ticketId: string;
  readonly estado: string;
  readonly senales: readonly OlaSenal[];
}

export type MotivoDeEspera =
  | "ausente"
  | "dependencia"
  | "aprobacion-del-plan"
  | "parada"
  | "ventana"
  | "cupo";

export interface OlaDependencia {
  readonly ticketId: string;
  /** El estado en el registro, o `ausente` si el ticket no existe. */
  readonly estado: string;
}

export interface OlaEnEspera {
  readonly ticketId: string;
  readonly estado: string | null;
  readonly motivo: MotivoDeEspera;
  readonly detalle: string;
  readonly dependencias: readonly OlaDependencia[];
}

export interface OlaEntregado {
  readonly ticketId: string;
  readonly estado: string;
}

export interface OlaDeJornada {
  readonly projectId: string;
  readonly journeyId: string;
  readonly concurrency: number;
  readonly listos: readonly OlaListo[];
  readonly enCurso: readonly OlaEnCurso[];
  readonly enEspera: readonly OlaEnEspera[];
  readonly entregados: readonly OlaEntregado[];
  readonly avisos: readonly string[];
}

export interface CalcularOlaRequest {
  readonly project: AuthorizedProject;
  readonly journeyId?: string | undefined;
  readonly concurrency?: number | undefined;
  readonly ahora?: (() => Date) | undefined;
  /** Worktrees ya leídos; sin ellos se pregunta a git. */
  readonly worktrees?: readonly WorktreeDeGit[] | undefined;
}

/**
 * El nombre corto de un ticket: el id sin el tipo, el módulo ni la fecha final.
 * `FEATURE-ENGINE-JORNADA-OLA-20261008` da `jornada-ola`. Un id que no tiene esa forma se usa entero.
 */
export function slugDeTicket(ticketId: string): string {
  const coincide = /^[A-Z]+-[A-Z0-9]+-(.+)-\d{8}$/.exec(ticketId);
  return (coincide?.[1] ?? ticketId).toLowerCase();
}

/** La rama y la ruta de worktree que se sugieren para un ticket. */
export function worktreeDelTicket(raiz: string, ticketId: string): WorktreeSugerido {
  const nombre = `ticket-${slugDeTicket(ticketId)}`;
  return Object.freeze({
    nombre,
    rama: `valmen/${nombre}`,
    ruta: join(raiz, ".claude", "worktrees", nombre),
  });
}

/**
 * ¿Este worktree es del ticket? Reconoce la rama y la carpeta con el nombre corto y con el id
 * completo, y nunca el checkout principal. Un nombre parecido (`ticket-jornada` frente a
 * `ticket-jornada-ola`) no coincide: la comparación es exacta.
 */
export function esWorktreeDelTicket(worktree: WorktreeDeGit, raiz: string, ticketId: string): boolean {
  if (mismaRuta(worktree.path, raiz)) return false;
  const nombres = new Set([
    `ticket-${slugDeTicket(ticketId)}`,
    `ticket-${ticketId}`.toLowerCase(),
  ]);
  const carpeta = (worktree.path.split(/[\\/]/).filter((parte) => parte !== "").at(-1) ?? "").toLowerCase();
  const rama = (worktree.branch ?? "").toLowerCase();
  return [...nombres].some((nombre) => rama === `valmen/${nombre}` || carpeta === nombre);
}

/** Lee la salida de `git worktree list --porcelain`. */
export function parsearWorktrees(texto: string): WorktreeDeGit[] {
  const worktrees: WorktreeDeGit[] = [];
  for (const bloque of texto.split(/\r?\n\r?\n/)) {
    let path: string | null = null;
    let branch: string | null = null;
    for (const linea of bloque.split(/\r?\n/)) {
      if (linea.startsWith("worktree ")) path = linea.slice("worktree ".length);
      else if (linea.startsWith("branch ")) branch = linea.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
    if (path !== null) worktrees.push(Object.freeze({ path, branch }));
  }
  return worktrees;
}

/** Los worktrees del repositorio de la raíz; si git falla, lista vacía y el motivo en `aviso`. */
export function listarWorktreesDeGit(raiz: string): { readonly worktrees: WorktreeDeGit[]; readonly aviso: string | null } {
  try {
    const salida = execFileSync("git", ["-C", raiz, "worktree", "list", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { worktrees: parsearWorktrees(salida), aviso: null };
  } catch (cause) {
    const motivo = cause instanceof Error ? cause.message.split("\n")[0] : String(cause);
    return {
      worktrees: [],
      aviso: `No se pudieron leer los worktrees de git (${motivo}): la señal del worktree se omite.`,
    };
  }
}

/** Clasifica los tickets de la jornada vigente (o de `journeyId`) y recorta los listos al tope. */
export function calcularOlaDeJornada(request: CalcularOlaRequest): OlaDeJornada {
  const { project } = request;
  const concurrency = request.concurrency ?? OLA_CONCURRENCIA_POR_DEFECTO;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency debe ser un entero de al menos 1.");
  }
  const ahora = request.ahora?.() ?? new Date();

  const jornadas = readJourneys(project);
  const journeyId = request.journeyId ?? jornadaVigente(project, ahora);
  const journey = journeyId === null ? undefined : jornadas.find((item) => item.journeyId === journeyId);
  if (journey === undefined) {
    throw new Error(
      journeyId === null
        ? `No hay una jornada vigente en el proyecto ${project.projectId}: se arma con \`valmen journey plan\`.`
        : `No hay una jornada ${journeyId} en el proyecto ${project.projectId}: se arma con \`valmen journey plan\`.`,
    );
  }

  const avisos: string[] = [];
  let worktrees: readonly WorktreeDeGit[];
  if (request.worktrees !== undefined) {
    worktrees = request.worktrees;
  } else {
    const leidos = listarWorktreesDeGit(project.root);
    worktrees = leidos.worktrees;
    if (leidos.aviso !== null) avisos.push(leidos.aviso);
  }

  const estados = new Map(
    allDocuments(project.paths).map(({ ticket, document }) => [ticket.id, document.fields.workflow_status as string]),
  );
  const paradas = paradasActivas(project.paths);
  const actividades = ultimaActividadPorTicket(project);
  const at = ahora.toISOString();

  const listos: JourneyTicketInput[] = [];
  const enCurso: OlaEnCurso[] = [];
  const enEspera: OlaEnEspera[] = [];
  const entregados: OlaEntregado[] = [];
  const espera = (
    ticketId: string,
    estado: string | null,
    motivo: MotivoDeEspera,
    detalle: string,
    dependencias: readonly OlaDependencia[] = [],
  ): void => {
    enEspera.push(Object.freeze({ ticketId, estado, motivo, detalle, dependencias: Object.freeze(dependencias) }));
  };

  for (const ticket of [...journey.tickets].sort((left, right) => left.order - right.order)) {
    const estado = estados.get(ticket.ticketId);
    if (estado === undefined) {
      espera(ticket.ticketId, null, "ausente", "El ticket no existe en el registro.");
      continue;
    }
    if ((ESTADOS_ENTREGADOS as readonly string[]).includes(estado)) {
      entregados.push(Object.freeze({ ticketId: ticket.ticketId, estado }));
      continue;
    }

    const parada = paradas.filter((entry) => entry.ticketId === ticket.ticketId).at(-1) ?? null;
    const fase = faseDelTicket(estado, null, parada);
    if (fase.phase === "stopped") {
      espera(ticket.ticketId, estado, "parada", fase.stopReason ?? "El ticket está detenido.");
      continue;
    }

    // Con worktree por ticket, el plan que espera a una persona vive en el registro del worktree
    // mientras el checkout principal sigue en `intake`: se lee ahí, para que un plan parado no
    // ocupe un cupo de la ola.
    const worktreeDelTicket = worktrees.find((item) => esWorktreeDelTicket(item, project.root, ticket.ticketId));
    const estadoEnWorktree =
      worktreeDelTicket === undefined
        ? null
        : estadoDelTicketEnWorktree(worktreeDelTicket.path, project.paths.ticketsDir, ticket.ticketId);

    // Un plan sin aprobar no se ofrece ni cuenta como en curso, tenga o no worktree o actividad.
    if (estado === "planned" || estadoEnWorktree === "planned") {
      espera(ticket.ticketId, estado, "aprobacion-del-plan", "El plan espera la aprobación de una persona.");
      continue;
    }

    const senales = senalesDeCurso(project.root, ticket.ticketId, estado, worktrees, actividades.get(ticket.ticketId));
    if (senales.length > 0) {
      enCurso.push(Object.freeze({ ticketId: ticket.ticketId, estado, senales: Object.freeze(senales) }));
      continue;
    }

    const dependencias = new Set([...ticket.dependsOn, ...dependenciasEnGrafos(project.paths, ticket.ticketId)]);
    const sinEntregar = [...dependencias]
      .map((dependencia): OlaDependencia => ({ ticketId: dependencia, estado: estados.get(dependencia) ?? "ausente" }))
      .filter((dependencia) => !(ESTADOS_ENTREGADOS as readonly string[]).includes(dependencia.estado));
    if (sinEntregar.length > 0) {
      espera(
        ticket.ticketId,
        estado,
        "dependencia",
        `Espera a ${sinEntregar.map((dependencia) => `${dependencia.ticketId} (${dependencia.estado})`).join(", ")}.`,
        sinEntregar,
      );
      continue;
    }

    if (razonesDeVentana(ticket, journey.windows ?? [], at).length > 0) {
      espera(ticket.ticketId, estado, "ventana", "La ventana de la jornada no permite despachar ahora.");
      continue;
    }

    listos.push(ticket);
  }

  const cupo = Math.max(0, concurrency - enCurso.length);
  const ordenados = [...listos].sort(compareTicket);
  for (const ticket of ordenados.slice(cupo)) {
    espera(
      ticket.ticketId,
      estados.get(ticket.ticketId) ?? null,
      "cupo",
      `El tope de ${concurrency} simultáneos ya está ocupado (${enCurso.length} en curso).`,
    );
  }

  return Object.freeze({
    projectId: project.projectId,
    journeyId: journey.journeyId,
    concurrency,
    listos: Object.freeze(
      ordenados.slice(0, cupo).map((ticket) =>
        Object.freeze({
          ticketId: ticket.ticketId,
          estado: estados.get(ticket.ticketId) ?? "",
          priority: ticket.priority,
          order: ticket.order,
          worktree: worktreeDelTicket(project.root, ticket.ticketId),
        }),
      ),
    ),
    enCurso: Object.freeze(enCurso),
    enEspera: Object.freeze(enEspera),
    entregados: Object.freeze(entregados),
    avisos: Object.freeze(avisos),
  });
}

/** La ola en texto, en orden estable: listos, en curso, en espera y entregados. */
export function renderOlaDeJornada(ola: OlaDeJornada): string {
  const lineas = [
    `Ola de la jornada ${ola.journeyId} (proyecto ${ola.projectId}): tope de ${ola.concurrency} simultáneos, ` +
      `${ola.enCurso.length} en curso, ${ola.listos.length} para despachar ahora.`,
  ];
  for (const aviso of ola.avisos) lineas.push(`Aviso: ${aviso}`);

  lineas.push("Listos para despachar:");
  if (ola.listos.length === 0) lineas.push("- Ninguno.");
  for (const listo of ola.listos) {
    lineas.push(
      `- ${listo.ticketId} [${listo.estado}] prioridad ${listo.priority}, posición ${listo.order} — ` +
        `rama ${listo.worktree.rama}, worktree ${listo.worktree.ruta}`,
    );
  }

  lineas.push("En curso:");
  if (ola.enCurso.length === 0) lineas.push("- Ninguno.");
  for (const curso of ola.enCurso) {
    const senales = curso.senales
      .map((senal) => `${senal.senal}: ${senal.fuente}${senal.hora === null ? "" : ` (${senal.hora})`}`)
      .join("; ");
    lineas.push(`- ${curso.ticketId} [${curso.estado}] — ${senales}`);
  }

  lineas.push("En espera:");
  if (ola.enEspera.length === 0) lineas.push("- Ninguno.");
  for (const espera of ola.enEspera) {
    lineas.push(`- ${espera.ticketId} [${espera.estado ?? "ausente"}] ${espera.motivo} — ${espera.detalle}`);
  }

  lineas.push("Entregados:");
  if (ola.entregados.length === 0) lineas.push("- Ninguno.");
  for (const entregado of ola.entregados) lineas.push(`- ${entregado.ticketId} [${entregado.estado}]`);

  return `${lineas.join("\n")}\n`;
}

interface ActividadAbierta {
  readonly fuente: string;
  readonly hora: string;
}

/** La última actividad de cada ticket, solo si sigue abierta (`started`, `active` o `waiting`). */
function ultimaActividadPorTicket(project: AuthorizedProject): Map<string, ActividadAbierta | null> {
  const ultimas = new Map<string, ActividadAbierta | null>();
  for (const evento of readExecutionEvents(project)) {
    if (!evento.kind.startsWith("activity.")) continue;
    const estado = evento.kind.slice("activity.".length);
    const abierta = estado === "started" || estado === "active" || estado === "waiting";
    ultimas.set(evento.identity.ticketId, abierta ? { fuente: evento.source, hora: evento.occurredAt } : null);
  }
  return ultimas;
}

function senalesDeCurso(
  raiz: string,
  ticketId: string,
  estado: string,
  worktrees: readonly WorktreeDeGit[],
  actividad: ActividadAbierta | null | undefined,
): OlaSenal[] {
  const senales: OlaSenal[] = [];
  if (estado === "in_progress") senales.push({ senal: "estado", fuente: "in_progress", hora: null });
  const worktree = worktrees.find((item) => esWorktreeDelTicket(item, raiz, ticketId));
  if (worktree !== undefined) senales.push({ senal: "worktree", fuente: worktree.path, hora: null });
  if (actividad !== null && actividad !== undefined) {
    senales.push({ senal: "actividad", fuente: actividad.fuente, hora: actividad.hora });
  }
  return senales;
}

/**
 * El `workflow_status` del ticket en el registro de su worktree, o `null` si no se puede leer.
 * Solo lectura: busca `<tickets>/<año>/<id>/ticket.md` y lee la línea del encabezado.
 */
export function estadoDelTicketEnWorktree(rutaDelWorktree: string, ticketsDir: string, ticketId: string): string | null {
  const base = join(rutaDelWorktree, ticketsDir);
  try {
    for (const anio of readdirSync(base)) {
      try {
        const texto = readFileSync(join(base, anio, ticketId, "ticket.md"), "utf8");
        const encabezado = texto.split(/\r?\n---\r?\n/)[0] ?? "";
        const coincidencia = /^workflow_status:\s*(\S+)/m.exec(encabezado);
        if (coincidencia !== null) return coincidencia[1] ?? null;
      } catch {
        // Ese año no tiene el ticket.
      }
    }
  } catch {
    return null;
  }
  return null;
}

function mismaRuta(izquierda: string, derecha: string): boolean {
  return normalizar(izquierda) === normalizar(derecha);
}

function normalizar(ruta: string): string {
  try {
    return realpathSync(ruta);
  } catch {
    return resolve(ruta);
  }
}
