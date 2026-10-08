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
 * 1. **Un ticket que ya existe no se toca**, con una sola excepción: el bloque
 *    `### Referencias de diseño`, que el motor escribe y refresca mientras el ticket
 *    no empezó la implementación (`refreshDesignReferences`). Volver a correrlo
 *    después de trabajar un rato no puede pisar lo trabajado.
 * 2. **Un grafo con huecos no se escribe.** Si hay requisitos sin ticket que los
 *    cubra, la descomposición todavía no está terminada y escribirla dejaría
 *    tickets que nacen con la cobertura a medias.
 * 3. **No se crea nada si algún identificador está mal formado.** Se comprueban
 *    todos antes de escribir el primero: crear los primeros y fallar en el quinto
 *    deja un registro a medio hacer que hay que deshacer a mano.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  type CoverageEntry,
  type NormalizedTicket,
  EXIT_INVARIANT,
  TEMPLATE_CRITERIOS_VACIOS,
  atomicWrite,
  decompositionTickets,
  fail,
  isSafePlainScalar,
  previewTicketsYaml,
} from "@valmen/core";

import { components, createTicket, ticketPathFor } from "./create.js";
import { finalizeMutation, readAndValidate } from "./mutate.js";
import { type RegistryPaths, findTicket } from "./discovery.js";
import {
  assetsForRequirements,
  externalLinkWarnings,
  listFeatureAssets,
} from "./feature-assets.js";
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
  /** Enlaces externos sin copia local; solo llegan aquí con permiso explícito o en seco. */
  readonly warnings?: readonly string[];
  /** Los tickets existentes cuyas referencias de diseño se actualizaron. */
  readonly refreshed?: readonly string[];
}

/** Los estados en que un ticket todavía no empezó la implementación. */
const ESTADOS_REFRESCABLES: ReadonlySet<string> = new Set([
  "intake",
  "analyzed",
  "planned",
  "blocked",
]);

/** Lo que dejó un refresco de referencias de diseño. */
export interface DesignReferencesRefresh {
  /** Tickets cuya sección se escribió (o se escribiría en seco). */
  readonly updated: readonly string[];
  /** Tickets elegibles que ya tenían exactamente esa sección. */
  readonly unchanged: readonly string[];
  /** Tickets que no se tocaron, con su estado. */
  readonly skipped: readonly { readonly id: string; readonly state: string }[];
}

const ENCABEZADO_REFERENCIAS = /^### Referencias de diseño[ \t]*$/m;

/** Reemplaza (o inserta) el bloque de referencias dentro de `## Solicitud original`. */
function conReferencias(texto: string, bloque: string): string {
  if (bloque === "") return texto;
  const inicio = /^## Solicitud original[ \t]*$/m.exec(texto);
  if (inicio === null) return texto;
  const desdeSeccion = inicio.index + inicio[0].length;
  const siguiente = /^## /m.exec(texto.slice(desdeSeccion));
  const finSeccion = siguiente === null ? texto.length : desdeSeccion + siguiente.index;
  const cuerpo = texto.slice(desdeSeccion, finSeccion);

  const existente = ENCABEZADO_REFERENCIAS.exec(cuerpo);
  if (existente !== null) {
    const desde = desdeSeccion + existente.index;
    const resto = texto.slice(desde + existente[0].length, finSeccion);
    const fin = /^###? /m.exec(resto);
    const hasta = fin === null ? finSeccion : desde + existente[0].length + fin.index;
    return `${texto.slice(0, desde)}${bloque}\n\n${texto.slice(hasta)}`;
  }
  const supuestos = /^### Supuestos y decisiones pendientes/m.exec(cuerpo);
  const punto = supuestos === null ? finSeccion : desdeSeccion + supuestos.index;
  return `${texto.slice(0, punto).replace(/\s*$/, "")}\n\n${bloque}\n\n${texto.slice(punto)}`;
}

/**
 * Actualiza `### Referencias de diseño` en los tickets ya escritos de una feature.
 *
 * Un adjunto anexado después de materializar no llega solo a los tickets: esto lo
 * lleva, de forma determinista y sin que un agente edite a mano. Solo toca tickets
 * que no empezaron la implementación (`intake`, `analyzed`, `planned`, `blocked`):
 * un plan aprobado contra otras referencias cambiaría materialmente. Reemplaza solo
 * el bloque que el motor genera, deja un evento `design-references-updated` y no
 * escribe nada si el bloque ya es el que corresponde.
 */
export function refreshDesignReferences(
  paths: RegistryPaths,
  slug: string,
  opciones: { readonly write?: boolean; readonly now?: (() => Date) | undefined } = {},
): DesignReferencesRefresh {
  const { tickets, coverage, requirements } = readDecomposition(paths, slug);
  const updated: string[] = [];
  const unchanged: string[] = [];
  const skipped: { id: string; state: string }[] = [];
  for (const ticket of tickets) {
    if (!ticket.exists) continue;
    const located = findTicket(paths, ticket.id);
    if (located === undefined) continue;
    const document = readAndValidate(paths, located);
    const estado = String(document.fields.workflow_status);
    if (!ESTADOS_REFRESCABLES.has(estado)) {
      skipped.push({ id: ticket.id, state: estado });
      continue;
    }
    const { texto, rutas } = referenciasDe(paths.root, slug, requirements, coverage.get(ticket.id) ?? []);
    const nuevo = conReferencias(document.text, texto);
    if (nuevo === document.text) {
      unchanged.push(ticket.id);
      continue;
    }
    updated.push(ticket.id);
    if (opciones.write === false) continue;
    finalizeMutation({
      paths,
      located,
      document,
      text: nuevo,
      action: "design-references-updated",
      details: `Referencias de diseño actualizadas: ${rutas.join(", ")}.`,
      ...(opciones.now === undefined ? {} : { now: opciones.now }),
    });
  }
  return { updated, unchanged, skipped };
}

/**
 * El refresco que sigue a anexar un adjunto: `null` si la feature todavía no se
 * descompuso (no hay tickets que actualizar) y el refresco en otro caso.
 */
export function refreshAfterAttach(
  paths: RegistryPaths,
  slug: string,
): DesignReferencesRefresh | null {
  if (!existsSync(decompositionPath(paths.root, slug))) return null;
  return refreshDesignReferences(paths, slug);
}

/** El informe de un refresco, en texto. */
export function renderDesignReferencesRefresh(
  slug: string,
  r: DesignReferencesRefresh,
  opciones: { readonly dryRun?: boolean } = {},
): string {
  const lineas = [
    opciones.dryRun === true
      ? `Se actualizarían las referencias de diseño de ${r.updated.length} ticket(s) de ${slug}:`
      : `Referencias de diseño actualizadas en ${r.updated.length} ticket(s) de ${slug}:`,
    ...r.updated.map((id) => `  · ${id}`),
  ];
  if (r.unchanged.length > 0) lineas.push(`${r.unchanged.length} ya estaban al día.`);
  if (r.skipped.length > 0) {
    lineas.push(
      `${r.skipped.length} no se tocaron porque ya empezaron la implementación:`,
      ...r.skipped.map((t) => `  · ${t.id} (${t.state})`),
    );
  }
  return `${lineas.join("\n")}\n`;
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
  /** La cobertura tal como el grafo la declara, con las porciones opcionales. */
  entries: readonly CoverageEntry[];
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
    entries: vista.document.decomposition.coverage,
  };
}

/**
 * Las dependencias que el grafo de **cualquier** feature declara para un ticket.
 *
 * Es el lector de la selección de la jornada, así que tolera lo que `readDecomposition` no:
 * una feature sin `tickets.yaml`, ilegible o con huecos de cobertura no hace caer la selección,
 * solo aporta lo que sí se puede leer.
 */
export function dependenciasEnGrafos(paths: RegistryPaths, ticketId: string): string[] {
  let features: string[];
  try {
    features = readdirSync(featuresDir(paths.root));
  } catch {
    return [];
  }
  const dependencias = new Set<string>();
  for (const slug of features) {
    let texto: string;
    try {
      texto = readFileSync(decompositionPath(paths.root, slug), "utf8");
    } catch {
      continue;
    }
    try {
      const vista = previewTicketsYaml(texto, []);
      if (vista === null) continue;
      for (const ticket of decompositionTickets(vista.document.decomposition)) {
        if (ticket.id === ticketId) ticket.dependsOn.forEach((dependencia) => dependencias.add(dependencia));
      }
    } catch {
      continue;
    }
  }
  return [...dependencias];
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
  referencias = "",
  alcance: Alcance = SIN_ALCANCE,
): string {
  // Los requisitos que este ticket cubre salen del **grafo**, no de parecidos de
  // texto: es lo que una persona revisó al aprobar la descomposición.
  const suyos = cubre
    .map((id) => requisitos.find((r) => r.id === id))
    .filter((r): r is LocatedRequirement => r !== undefined);
  // El objetivo del sprint ya termina en punto casi siempre: agregar otro dejaba
  // «documentos..» en la solicitud de cada ticket.
  const lineaObjetivo =
    objetivo === ""
      ? ""
      : `Parte del sprint: ${objetivo}${objetivo.endsWith(".") ? "" : "."}`;

  const lineas = [
    lineaObjetivo,
    ...suyos.map((r) => `- ${r.id}: ${r.statement}`),
    ticket.dependsOn.length === 0 ? "" : `Depende de: ${ticket.dependsOn.join(", ")}.`,
    "Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.",
  ].filter((linea) => linea !== "");
  const comportamiento = comportamientoDe(ticket, suyos, alcance);
  const fuera = fueraDeAlcanceDe(ticket, cubre, alcance);
  // Sin adjuntos ni requisitos repartidos la solicitud lleva solo el comportamiento
  // esperado y el actual, además de lo de siempre.
  return (
    lineas.join("\n") +
    (comportamiento === "" ? "" : `\n\n${comportamiento}`) +
    (fuera === "" ? "" : `\n\n${fuera}`) +
    (referencias === "" ? "" : `\n\n${referencias}`)
  );
}

/** Lo que `materialize` necesita saber de otros tickets para acotar el de uno. */
interface Alcance {
  readonly entries: readonly CoverageEntry[];
  readonly titles: ReadonlyMap<string, string>;
}

const SIN_ALCANCE: Alcance = { entries: [], titles: new Map() };

/** La porción de un requisito que el grafo declara para un ticket, si la declara. */
function porcionDe(entry: CoverageEntry | undefined, ticketId: string): string | undefined {
  return entry?.portions?.find((p) => p.ticket === ticketId)?.text;
}

/** Los otros tickets que cubren un requisito. */
function otrosQueCubren(entry: CoverageEntry | undefined, ticketId: string): string[] {
  return (entry?.coveredBy ?? []).filter((id) => id !== ticketId);
}

/** «ID (título)», o solo el id si el grafo no le dio título. */
function nombreDe(id: string, alcance: Alcance): string {
  const titulo = alcance.titles.get(id);
  return titulo === undefined || titulo === "" ? id : `${id} (${titulo})`;
}

/**
 * El comportamiento esperado y el actual de un ticket (R-CPRE-007).
 *
 * El esperado es el de su porción de cada requisito. El actual solo se escribe si la spec
 * lo declara —una línea «Comportamiento actual:» en el cuerpo del requisito—: inventarlo
 * sería escribir lo que nadie dijo, y el análisis lo establece leyendo el código.
 */
function comportamientoDe(
  ticket: TicketDelGrafo,
  requisitos: readonly LocatedRequirement[],
  alcance: Alcance,
): string {
  if (requisitos.length === 0) return "";
  const esperado = requisitos.map((r) => {
    const entry = alcance.entries.find((e) => e.requirement === r.id);
    return porcionDe(entry, ticket.id) ?? r.statement;
  });
  const actuales = requisitos
    .map((r) => /^Comportamiento actual:\s*(.+)$/im.exec(r.body ?? "")?.[1]?.trim())
    .filter((texto): texto is string => texto !== undefined && texto !== "");
  return [
    `Comportamiento esperado: ${esperado.join(" ")}`,
    actuales.length > 0
      ? `Comportamiento actual: ${actuales.join(" ")}`
      : "Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.",
  ].join("\n");
}

/**
 * La sección «Fuera de alcance»: lo que el grafo asignó a otros tickets.
 *
 * Solo para requisitos que cubre más de un ticket. Es lo que le dice al agente de este
 * ticket dónde termina su porción, para que no la exceda ni la deje a medias.
 */
function fueraDeAlcanceDe(
  ticket: TicketDelGrafo,
  cubre: readonly string[],
  alcance: Alcance,
): string {
  const lineas: string[] = [];
  for (const id of cubre) {
    const entry = alcance.entries.find((e) => e.requirement === id);
    for (const otro of otrosQueCubren(entry, ticket.id)) {
      const porcion = porcionDe(entry, otro);
      lineas.push(
        `- ${id}: lo cubre ${nombreDe(otro, alcance)}${porcion === undefined ? "" : ` — ${porcion}`}`,
      );
    }
  }
  if (lineas.length === 0) return "";
  return [
    "### Fuera de alcance",
    "",
    "Lo que el grafo asignó a otros tickets y este no hace:",
    ...lineas,
  ].join("\n");
}

/**
 * La sección de referencias de un ticket: los adjuntos de la feature que tiene que
 * mirar quien implementa y quien valida la pantalla.
 *
 * Es cadena vacía cuando la feature no tiene adjuntos, y por eso materializar una
 * feature sin `assets/` no cambia nada de lo que ya escribía.
 */
function referenciasDe(
  root: string,
  slug: string,
  requisitos: readonly LocatedRequirement[],
  cubre: readonly string[],
): { texto: string; rutas: string[] } {
  const adjuntos = listFeatureAssets(root, slug);
  if (adjuntos.length === 0) return { texto: "", rutas: [] };
  const suyos = cubre
    .map((id) => requisitos.find((r) => r.id === id))
    .filter((r): r is LocatedRequirement => r !== undefined);
  const { assets, level } = assetsForRequirements(root, adjuntos, suyos);
  const base = `.valmen/features/${slug}`;
  const intro = {
    requisito:
      "Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:",
    archivo:
      "Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:",
    todos:
      "Adjuntos de la feature (ningún requisito de este ticket cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:",
  }[level];
  return {
    texto: [
      "### Referencias de diseño",
      "",
      intro,
      ...assets.map(
        (a) => `- \`${base}/${a.path}\` — ${a.description} (sha256 ${a.sha256.slice(0, 12)}…)`,
      ),
    ].join("\n"),
    rutas: assets.map((a) => `${base}/${a.path}`),
  };
}

/**
 * Los criterios de aceptación de un ticket, escritos desde la spec.
 *
 * El alta deja la sección con una casilla vacía, y quien la llena suele ser el
 * agente al planificar: los criterios de un ticket de feature **ya están
 * escritos** —son los requisitos de la spec que el grafo dice que cubre—, así que
 * pedírselos de nuevo es invitar a que los invente. Se escriben con su
 * identificador delante para que la trazabilidad se lea en el ticket.
 *
 * **Sin anotación de verificación, a propósito**: si un criterio se comprueba con
 * un comando o a mano lo decide quien planifica, y la compuerta mecánica detiene
 * el gate hasta que lo declare. Poner `verify: manual` por defecto convertiría
 * todos los criterios en manuales y el gate no comprobaría nada.
 */
function criteriosDe(
  requisitos: readonly { readonly id: string; readonly statement: string }[],
  cubre: readonly string[],
  ticket?: TicketDelGrafo,
  alcance: Alcance = SIN_ALCANCE,
): string {
  return cubre
    .map((id) => requisitos.find((requisito) => requisito.id === id))
    .filter(
      (requisito): requisito is { id: string; statement: string } =>
        requisito !== undefined,
    )
    .map((requisito) => {
      const entry = alcance.entries.find((e) => e.requirement === requisito.id);
      const otros = ticket === undefined ? [] : otrosQueCubren(entry, ticket.id);
      // Un requisito que cubre un solo ticket se escribe como siempre. Uno repartido se
      // acota a la porción de este ticket: la que el grafo declara, o el enunciado anotado
      // como parte de él, para que el criterio no exija lo que otro ticket cubre.
      if (ticket === undefined || otros.length === 0) {
        return `- [ ] ${requisito.id}: ${requisito.statement}`;
      }
      const porcion = porcionDe(entry, ticket.id);
      return porcion !== undefined
        ? `- [ ] ${requisito.id}: ${porcion}`
        : `- [ ] ${requisito.id}: ${requisito.statement} (solo la parte de «${ticket.title || ticket.id}»; ` +
            `el resto lo cubre ${otros.join(", ")})`;
    })
    .join("\n");
}

/**
 * Rellena los criterios de un ticket recién creado.
 *
 * Solo cuando la sección está **vacía** —una casilla sin texto—: si el proyecto
 * tiene su propia plantilla con texto ahí, se respeta. La sustitución es sobre el
 * archivo que se acaba de escribir, así que no hay riesgo de pisar trabajo.
 */
function escribirCriterios(ruta: string, criterios: string): boolean {
  if (criterios === "") return false;
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    return false;
  }
  // El patrón lo define la plantilla: la sección vacía lleva delante la guía de cómo
  // se escribe un criterio, y un literal acá se rompe en silencio cuando eso cambia
  // —el ticket materializado se queda sin los criterios de la spec, que es quedarse
  // sin lo que el gate evalúa—. El comentario se consume con el resto: su trabajo es
  // el andamio, no el ticket.
  const vacia = TEMPLATE_CRITERIOS_VACIOS;
  if (!vacia.test(texto)) return false;
  atomicWrite(ruta, texto.replace(vacia, `## Criterios de aceptación\n\n${criterios}\n`));
  return true;
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
  opciones: {
    readonly write?: boolean;
    readonly now?: (() => Date) | undefined;
    /** Crear los tickets aunque la feature cite enlaces externos sin copia local. */
    readonly allowExternalLinks?: boolean;
  } = {},
): Materialization {
  const { tickets, coverage, requirements, entries } = readDecomposition(paths, slug);
  const alcance: Alcance = {
    entries,
    titles: new Map(tickets.map((t) => [t.id, t.title])),
  };
  const escribir = opciones.write !== false;

  // Un enlace de diseño sin copia local no pasa en silencio: los agentes no lo pueden
  // abrir y construirían las pantallas desde el texto. Se detiene antes de escribir
  // el primero; `--dry-run` solo informa, y la bandera explícita deja seguir.
  const avisos = externalLinkWarnings(paths.root, slug);
  if (escribir && avisos.length > 0 && opciones.allowExternalLinks !== true) {
    fail(
      `La feature ${slug} cita ${avisos.length} enlace(s) externo(s) sin copia local y por eso ` +
        "**no se creó ningún ticket**:\n" +
        avisos.map((aviso) => `  · ${aviso}`).join("\n") +
        "\nAnexá el archivo del diseño con «valmen feature asset add», o, si el enlace es solo " +
        "bibliografía, materializá con --allow-external-links.",
      EXIT_INVARIANT,
    );
  }

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
          referenciasDe(paths.root, slug, requirements, coverage.get(ticket.id) ?? []).texto,
          alcance,
        ),
        ...(opciones.now === undefined ? {} : { now: opciones.now }),
      });
      // Y sus criterios, que ya están escritos en la spec.
      escribirCriterios(
        ticketPathFor(paths, ticket.id),
        criteriosDe(requirements, coverage.get(ticket.id) ?? [], ticket, alcance),
      );
    }
  }

  const porTicket: Record<string, readonly string[]> = {};
  for (const [id, suyos] of coverage) porTicket[id] = suyos;

  // Los que ya existían reciben las referencias que les falten, si no empezaron.
  const refreshed =
    escribir && skipped.length > 0
      ? refreshDesignReferences(paths, slug, {
          ...(opciones.now === undefined ? {} : { now: opciones.now }),
        }).updated
      : [];

  return {
    created,
    skipped,
    coverage: porTicket,
    warnings: avisos,
    refreshed,
  };
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
  if ((resultado.refreshed ?? []).length > 0) {
    lineas.push(
      "",
      `Referencias de diseño actualizadas en ${(resultado.refreshed ?? []).length} de ellos:`,
      ...(resultado.refreshed ?? []).map((id) => `  · ${id}`),
    );
  }
  if ((resultado.warnings ?? []).length > 0) {
    lineas.push("", "Avisos:", ...(resultado.warnings ?? []).map((aviso) => `  ! ${aviso}`));
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
