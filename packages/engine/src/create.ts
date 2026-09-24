/**
 * `create`: el alta de un ticket.
 *
 * Es el único comando que no anexa a un ticket existente, así que no pasa por
 * `finalizeMutation`. Pero conserva las dos garantías que sí importan:
 *
 * 1. **El texto se valida entero antes de escribir.** Si la plantilla del
 *    proyecto produjera un ticket inválido, el comando falla y no deja un archivo
 *    roto en el registro.
 * 2. **Se comprueba el registro completo antes de escribir**, para no añadir un
 *    ticket a una colección de la que no se podría generar el índice.
 *
 * La plantilla se busca primero en `.valmen/templates/ticket.md` y, si no está,
 * se usa la del harness. Esa precedencia es la que permite que un proyecto
 * adapte la prosa sin tocar el harness, y que el harness siga funcionando en un
 * proyecto que no la haya copiado.
 *
 * Transcrito de `ticket.py` L1257-1325, con la plantilla como divergencia
 * declarada: la referencia la lee de `docs/agentic/templates/`.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  EXIT_HISTORY,
  EXIT_SCHEMA,
  ID_RE,
  MutationLock,
  SCHEMA_VERSION,
  TEMPLATE_REQUEST_MARKER,
  TEMPLATE_TITLE_MARKER,
  TICKET_TEMPLATE,
  TICKET_TYPES,
  atomicWrite,
  ensureSecurePath,
  fail,
  newEvent,
  parseTicket,
  replaceBlock,
  replaceFrontmatterField,
  today,
  validateDocument,
  validateRequest,
  validateText,
  validateTitle,
} from "@valmen/core";

import { type RegistryPaths, ticketsPath } from "./discovery.js";
import { allDocuments, refreshIndex } from "./mutate.js";

/** Lo que hace falta para crear un ticket. */
export interface CreateRequest {
  readonly paths: RegistryPaths;
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly module: string;
  readonly request: string;
  readonly now?: (() => Date) | undefined;
}

/** La ruta de la plantilla del proyecto. */
export function projectTemplatePath(root: string): string {
  return join(root, ".valmen", "templates", "ticket.md");
}

/**
 * La plantilla que se usará.
 *
 * La del proyecto gana. Si existe pero no se puede leer, se falla en vez de caer
 * a la del harness en silencio: quien la editó esperaría que su versión fuera la
 * que se usa, y escribir otra cosa sería peor que no escribir.
 */
export function ticketTemplate(root: string): string {
  const propia = projectTemplatePath(root);
  if (!existsSync(propia)) return TICKET_TEMPLATE;
  try {
    return readFileSync(propia, "utf8");
  } catch {
    fail("No se pudo leer la plantilla del proyecto.", EXIT_SCHEMA);
  }
}

/** Las partes del identificador, ya validadas. */
export function components(id: string): {
  type: string;
  module: string;
  year: string;
} {
  const match = ID_RE.exec(id);
  if (match === null) {
    fail(
      "El ID no cumple <TIPO>-<MODULO>-<DESCRIPCION>-<YYYYMMDD> con segmentos seguros.",
      EXIT_SCHEMA,
    );
  }
  const [, type, module, , compact] = match as unknown as string[];
  const anio = (compact as string).slice(0, 4);
  const mes = Number.parseInt((compact as string).slice(4, 6), 10);
  const dia = Number.parseInt((compact as string).slice(6, 8), 10);
  const fecha = new Date(
    `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T00:00:00Z`,
  );
  if (
    Number.isNaN(fecha.getTime()) ||
    fecha.getUTCFullYear() !== Number(anio) ||
    fecha.getUTCMonth() + 1 !== mes ||
    fecha.getUTCDate() !== dia
  ) {
    fail("La fecha incluida en el ID no es válida.", EXIT_SCHEMA);
  }
  return { type: type as string, module: module as string, year: anio };
}

/** La ruta canónica de un ticket. */
export function ticketPathFor(paths: RegistryPaths, id: string): string {
  return join(ticketsPath(paths), components(id).year, id, "ticket.md");
}

/**
 * Crea un ticket.
 *
 * Devuelve la línea que informa del alta.
 */
export function createTicket(request: CreateRequest): string {
  const { paths, id } = request;

  const { type, module: moduleFromId, year } = components(id);
  const title = validateTitle(request.title);
  const module = validateText(request.module, "module");
  const solicitud = validateRequest(request.request);

  if (
    !TICKET_TYPES.includes(request.type as (typeof TICKET_TYPES)[number]) ||
    request.type !== type
  ) {
    fail("--type no es permitido o no coincide con el ID.", EXIT_SCHEMA);
  }
  if (!/^[A-Z0-9]+$/.test(module) || module !== moduleFromId) {
    fail("--module debe ser un segmento seguro y coincidir con el ID.", EXIT_SCHEMA);
  }

  const plantilla = ticketTemplate(paths.root);
  const date = today(request.now?.() ?? new Date());

  // El texto se monta entero en memoria y se valida antes del lock: si la
  // plantilla no produce un ticket válido, no se toma el lock siquiera.
  let texto = plantilla;
  const campos: readonly [string, string][] = [
    ["schema_version", SCHEMA_VERSION],
    ["id", id],
    ["title", title],
    ["type", request.type],
    ["module", module],
    ["workflow_status", "intake"],
    ["qa_status", "pending"],
    ["release_status", "unreleased"],
    ["user_visible", "false"],
    ["sync_impact", "false"],
    ["migration_impact", "false"],
    ["docker_impact", "false"],
    ["risk_level", "normal"],
    ["created", date],
    ["updated", date],
    ["related_ticket", "null"],
    ["target_release", "null"],
    ["released_in", "null"],
  ];
  for (const [clave, valor] of campos) {
    texto = replaceFrontmatterField(texto, clave, valor);
  }

  texto = texto.replace(TEMPLATE_TITLE_MARKER, `# ${id}`);
  if (!plantilla.includes(TEMPLATE_REQUEST_MARKER)) {
    fail("La plantilla no contiene el marcador de solicitud original.", EXIT_SCHEMA);
  }
  texto = texto.replace(TEMPLATE_REQUEST_MARKER, solicitud);
  texto = replaceBlock(texto, "Eventos", [
    newEvent([], "created", "Ticket creado sin sobrescribir historial.", "cli", date),
  ]);

  const destino = ticketPathFor(paths, id);
  const documento = parseTicket(texto);
  validateDocument(documento, { expectedId: id });

  return MutationLock.run(paths.root, () => {
    // El registro puede no existir todavía: es el primer ticket de un proyecto
    // recién adoptado, que es exactamente el caso normal. Se crea antes de
    // comprobarlo, porque la comprobación de ruta exige que exista y el
    // inventario del registro (`allDocuments`) también.
    mkdirSync(ticketsPath(paths), { recursive: true });
    ensureSecurePath(paths.root, ticketsPath(paths));
    // Un ticket hermano roto impediría generar el índice, así que se comprueba
    // antes de añadir uno nuevo.
    allDocuments(paths);
    ensureSecurePath(paths.root, destino, { allowMissing: true });

    if (existsSync(destino)) {
      fail("El ticket ya existe y no puede sobrescribirse.", EXIT_HISTORY);
    }
    mkdirSync(dirname(destino), { recursive: true });
    ensureSecurePath(paths.root, dirname(destino));
    atomicWrite(destino, texto);
    refreshIndex(paths);
    void year;

    return `Ticket creado: ${id}`;
  });
}
