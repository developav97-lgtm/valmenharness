/**
 * Escribir los tickets de una feature en el registro.
 *
 * Descomponer deja un **plan**: un `tickets.yaml` con sprints, identificadores,
 * dependencias y qué requisito cubre cada uno. Ese plan no es trabajo: un ticket
 * del grafo no existe para el registro, no tiene `ticket.md`, no está en `intake`
 * y ninguna compuerta lo mira. Es la diferencia entre «planeado» y «escrito», y
 * hasta ahora el paso de uno al otro se hacía a mano, ticket por ticket, con el
 * `crear_ticket` que ya existía.
 *
 * Esto lo hace de una vez y **sin inventar**: el identificador, el título y los
 * requisitos que cubre salen del grafo, que es lo que una persona revisó y
 * aprobó al descomponer. Lo único que se redacta acá es la solicitud original del
 * ticket, y se arma con las palabras de la spec —los requisitos que el grafo dice
 * que cubre— más el objetivo del sprint, porque un ticket creado sin su pedido
 * obliga a reconstruirlo después mirando el brief.
 *
 * Tres reglas que lo hacen seguro de correr dos veces:
 *
 * 1. **Un ticket que ya existe no se toca.** Se informa y se sigue. Volver a
 *    correrlo después de trabajar un rato no puede pisar lo trabajado.
 * 2. **Un grafo con huecos no se escribe.** Si hay requisitos sin ticket que los
 *    cubra, la descomposición todavía no está terminada y escribirla dejaría
 *    tickets que nacen con la cobertura a medias.
 * 3. **No se crea nada si algún identificador está mal formado.** Se comprueban
 *    todos antes de escribir el primero: crear los primeros y fallar en el quinto
 *    deja un registro a medio hacer que hay que deshacer a mano.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type NormalizedTicket,
  EXIT_INVARIANT,
  decompositionTickets,
  fail,
  isSafePlainScalar,
  previewTicketsYaml,
} from "@valmen/core";

import { components, createTicket, ticketPathFor } from "./create.js";
import { type RegistryPaths } from "./discovery.js";
import { featuresDir } from "./features.js";
import { type LocatedRequirement, readSpecs } from "./spec.js";

/** Un ticket del grafo, con lo que hace falta para escribirlo. */
export interface TicketDelGrafo extends NormalizedTicket {
  /** `true` si ya está en el registro. */
  readonly exists: boolean;
}

/** Lo que pasó al escribirlos. */
export interface Materialization {
  /** Los identificadores que se escribieron, o que se escribirían sin `--dry-run`. */
  readonly created: readonly string[];
  /** Los que ya estaban y no se tocaron. */
  readonly skipped: readonly string[];
  /** Cuántos requisitos cubre cada uno, para poder informarlo. */
  readonly coverage: Readonly<Record<string, readonly string[]>>;
}

/** La ruta del `tickets.yaml` de una feature. */
export function decompositionPath(root: string, slug: string): string {
  return join(featuresDir(root), slug, "tickets.yaml");
}

/**
 * Lee el grafo de una feature.
 *
 * Devuelve los tickets en el orden en que se declararon —el de los sprints, que
 * es el orden en que se piensa trabajarlos— y falla con el motivo cuando el
 * archivo no está, no se puede leer o tiene huecos.
 */
export function readDecomposition(
  paths: RegistryPaths,
  slug: string,
): {
  tickets: TicketDelGrafo[];
  coverage: Map<string, string[]>;
  requirements: LocatedRequirement[];
} {
  const ruta = decompositionPath(paths.root, slug);
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    fail(
      `La feature ${slug} no tiene tickets.yaml: hay que descomponerla antes de ` +
        "escribir sus tickets.",
      EXIT_INVARIANT,
    );
  }

  const requisitos = readSpecs(
    join(featuresDir(paths.root), slug, "spec"),
    `.valmen/features/${slug}`,
  ).flatMap((spec) => spec.requirements);
  const vista = previewTicketsYaml(texto, requisitos);
  if (vista === null) {
    fail(`El tickets.yaml de ${slug} no se puede leer.`, EXIT_INVARIANT);
  }
  // Dos clases de hueco: el que el grafo **declara** y el que resulta de comparar
  // la cobertura con la spec. Los dos dicen lo mismo —falta un ticket— y los dos
  // detienen la escritura.
  const huecos = [
    ...vista.document.decomposition.gaps,
    ...vista.gaps.map((h) => h.requirement),
  ];
  if (huecos.length > 0) {
    fail(
      `El grafo de ${slug} tiene ${huecos.length} hueco(s): ${huecos.join(", ")}. La ` +
        "descomposición todavía no está terminada y escribirla dejaría tickets con la " +
        "cobertura a medias.",
      EXIT_INVARIANT,
    );
  }

  const cobertura = new Map<string, string[]>();
  for (const entrada of vista.document.decomposition.coverage) {
    for (const ticket of entrada.coveredBy) {
      cobertura.set(ticket, [...(cobertura.get(ticket) ?? []), entrada.requirement]);
    }
  }

  return {
    tickets: decompositionTickets(vista.document.decomposition).map((ticket) => ({
      ...ticket,
      exists: existsSync(ticketPathFor(paths, ticket.id)),
    })),
    coverage: cobertura,
    requirements: requisitos,
  };
}

/**
 * La solicitud original de un ticket del grafo.
 *
 * Se arma con lo que el grafo ya dice: los requisitos que cubre, con su texto, y
 * el objetivo de su sprint. No es una invención —son las palabras de la spec— y
 * es lo que el ticket necesita para que su diagnóstico tenga de dónde partir.
 */
function solicitudDe(
  ticket: TicketDelGrafo,
  requisitos: readonly LocatedRequirement[],
  cubre: readonly string[],
  objetivo: string,
): string {
  // Los requisitos que este ticket cubre salen del **grafo**, no de parecidos de
  // texto: es lo que una persona revisó al aprobar la descomposición.
  const suyos = cubre
    .map((id) => requisitos.find((r) => r.id === id))
    .filter((r): r is LocatedRequirement => r !== undefined);
  const lineas = [
    objetivo === "" ? "" : `Parte del sprint: ${objetivo}.`,
    ...suyos.map((r) => `- ${r.id}: ${r.statement}`),
    ticket.dependsOn.length === 0 ? "" : `Depende de: ${ticket.dependsOn.join(", ")}.`,
    "Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.",
  ].filter((linea) => linea !== "");
  return lineas.join("\n");
}

/**
 * Escribe en el registro los tickets del grafo que falten.
 *
 * `write: false` devuelve lo que haría sin escribir nada, que es lo que necesita
 * una pantalla para decir «se van a crear cinco tickets» antes de crearlos.
 */
export function materializeFeature(
  paths: RegistryPaths,
  slug: string,
  opciones: { readonly write?: boolean; readonly now?: (() => Date) | undefined } = {},
): Materialization {
  const { tickets, coverage, requirements } = readDecomposition(paths, slug);
  const escribir = opciones.write !== false;

  // Se comprueba **todo** antes de escribir el primero: crear tres y fallar en el
  // cuarto deja el registro a medio hacer y el trabajo de deshacerlo a mano.
  const faltantes = tickets.filter((ticket) => !ticket.exists);
  // El objetivo de cada sprint, para que la solicitud diga de dónde viene el
  // ticket sin obligar a abrir el brief.
  const objetivos = new Map(
    sprintsDe(paths.root, slug).map((sprint) => [sprint.id, sprint.goal]),
  );

  // Se comprueba **todo** lo que el alta va a comprobar, y se informan todos los
  // problemas de una vez. La primera versión solo miraba que el título no
  // estuviera vacío, y un título con «: » —que el frontmatter de un ticket no
  // acepta— dejaba el registro a medio hacer: los anteriores ya escritos, el
  // resto no. Pasó con el primer feature real.
  if (escribir) {
    const problemas: string[] = [];
    for (const ticket of faltantes) {
      const titulo = ticket.title.trim();
      if (titulo === "") {
        problemas.push(`${ticket.id}: no tiene título en el grafo.`);
      } else if (!isSafePlainScalar(titulo)) {
        problemas.push(
          `${ticket.id}: el título «${titulo.slice(0, 80)}» no se puede escribir en un ` +
            "ticket. El frontmatter se lee sin una librería YAML, así que el título no " +
            "puede llevar «: », « #», saltos de línea, ni empezar por un carácter " +
            "reservado (- ? : , [ ] { } # & * ! | > ' \" % @ `).",
        );
      }
      try {
        components(ticket.id);
      } catch (caught) {
        problemas.push(
          `${ticket.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }

    if (problemas.length > 0) {
      fail(
        `El grafo tiene ${problemas.length} problema(s) y por eso **no se creó ninguno**:\n` +
          problemas.map((problema) => `  · ${problema}`).join("\n") +
          "\nCorregí el tickets.yaml —o volvé a descomponer— y corré esto otra vez.",
        EXIT_INVARIANT,
      );
    }
  }

  // `created` se llena también en el `--dry-run`: lo que informa es **qué
  // escribiría**, y sin esto el informe decía «no tiene tickets en el grafo»
  // cuando lo que pasaba era que no se había escrito nada todavía.
  const created = faltantes.map((ticket) => ticket.id);
  const skipped = tickets.filter((t) => t.exists).map((t) => t.id);

  if (escribir) {
    for (const ticket of faltantes) {
      const [tipo, modulo] = ticket.id.split("-");
      createTicket({
        paths,
        id: ticket.id,
        title: ticket.title,
        type: tipo as string,
        module: modulo as string,
        request: solicitudDe(
          ticket,
          requirements,
          coverage.get(ticket.id) ?? [],
          objetivos.get(ticket.sprint) ?? "",
        ),
        ...(opciones.now === undefined ? {} : { now: opciones.now }),
      });
    }
  }

  const porTicket: Record<string, readonly string[]> = {};
  for (const [id, suyos] of coverage) porTicket[id] = suyos;

  return { created, skipped, coverage: porTicket };
}

/** Los sprints del grafo, tal como se declararon. */
function sprintsDe(
  root: string,
  slug: string,
): readonly { readonly id: string; readonly goal: string }[] {
  try {
    const texto = readFileSync(decompositionPath(root, slug), "utf8");
    const vista = previewTicketsYaml(texto, []);
    return vista?.document.decomposition.sprints ?? [];
  } catch {
    return [];
  }
}

/** El informe, en texto. */
export function renderMaterialization(
  slug: string,
  resultado: Materialization,
  opciones: { readonly dryRun?: boolean } = {},
): string {
  const dryRun = opciones.dryRun === true;
  if (resultado.created.length === 0 && resultado.skipped.length === 0) {
    return `La feature ${slug} no tiene tickets en el grafo.\n`;
  }

  const lineas = [
    dryRun
      ? `Se crearían ${resultado.created.length} ticket(s) de ${slug} en intake:`
      : `${resultado.created.length} ticket(s) de ${slug} creados en intake:`,
  ];
  for (const id of resultado.created) {
    const cubre = resultado.coverage[id] ?? [];
    lineas.push(`  · ${id}` + (cubre.length === 0 ? "" : `  (cubre ${cubre.join(", ")})`));
  }
  if (resultado.skipped.length > 0) {
    lineas.push(
      "",
      `${resultado.skipped.length} ya estaban en el registro y no se tocaron:`,
      ...resultado.skipped.map((id) => `  · ${id}`),
    );
  }
  if (!dryRun && resultado.created.length > 0) {
    lineas.push(
      "",
      "Cada uno nace en `intake`: le toca su análisis, su plan y la aprobación de una",
      "persona antes de tocar código. Los que declaran dependencias conviene no",
      "empezarlos hasta que el anterior esté cerrado.",
    );
  }
  return `${lineas.join("\n")}\n`;
}
