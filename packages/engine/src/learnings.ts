/**
 * La cola de aprendizajes: lo que el trabajo enseñó, esperando clasificación.
 *
 * La memoria tiene una entrada y una salida. La entrada —`guardar_aprendizaje`—
 * ya existía: el agente anota lo que descubrió cuando lo descubre, que es cuando
 * lo tiene fresco. La salida es esto: **alguien tiene que decidir qué es** cada
 * una de esas notas. Una nota sin clasificar es conocimiento a medias: se guardó,
 * pero nadie dijo si es una regla del proyecto, un caso documentado o una
 * impresión que no vale la pena conservar.
 *
 * Las tres salidas no son la misma cosa con distinto nombre:
 *
 * - **`regla`**: esto es una convención del proyecto. No se aplica sola: se
 *   convierte en una **propuesta de estándar**, y aceptarla sigue siendo la
 *   decisión de una persona, con sus palabras. Clasificar no pone nada en vigor.
 * - **`caso`**: es documentación de algo que pasó —un error con su causa raíz—.
 *   Se queda en la memoria, que es donde ya está, y sigue siendo consultable.
 * - **`descartar`**: no aporta. Se marca y se conserva: borrarla destruiría el
 *   registro de que alguien ya la evaluó, y el próximo agente volvería a
 *   proponer lo mismo.
 *
 * La clasificación **sí** puede hacerla un agente: es triaje, es reversible y no
 * pone nada en vigor. Lo que no puede es aceptar el estándar que sale de una
 * regla, y por eso `regla` termina en la cola de propuestas y no en el archivo de
 * reglas.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type RegistryPaths } from "./discovery.js";
import { parseMemory } from "./memory.js";
import { type AreaEstandar, proposeStandard } from "./standards.js";

/** Las salidas posibles de un aprendizaje. */
export const DECISIONES_APRENDIZAJE = ["regla", "caso", "descartar"] as const;
export type DecisionAprendizaje = (typeof DECISIONES_APRENDIZAJE)[number];

/** En qué estado está un aprendizaje. */
export type EstadoAprendizaje = "pendiente" | "regla" | "caso" | "descartado";

/** Un aprendizaje guardado, con su estado. */
export interface Aprendizaje {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly tickets: readonly string[];
  readonly body: string;
  readonly state: EstadoAprendizaje;
  readonly source: { readonly path: string; readonly line: number };
}

/** La ruta del archivo de aprendizajes, relativa a la raíz. */
export const APRENDIZAJES = ".valmen/memory/aprendizajes.md";

/** La ruta completa del archivo de aprendizajes. */
export function aprendizajesPath(paths: RegistryPaths): string {
  return join(paths.root, APRENDIZAJES);
}

/** Los tickets declarados en un cuerpo. */
function ticketsDe(cuerpo: string): string[] {
  const match = /^[-*]?\s*\*\*Tickets:\*\*\s*(.+)/m.exec(cuerpo);
  if (match === null) return [];
  return (match[1] as string)
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/** Normaliza el estado declarado, que puede faltar en un archivo viejo. */
function estadoDe(valor: string | null): EstadoAprendizaje {
  const limpio = (valor ?? "").trim().toLowerCase();
  if (limpio === "regla" || limpio === "caso" || limpio === "descartado") return limpio;
  return "pendiente";
}

/**
 * Lee los aprendizajes del proyecto.
 *
 * Un archivo que no existe no es un error: es un proyecto que todavía no guardó
 * ninguno, y la cola vacía lo dice sin inventar nada.
 */
export function listLearnings(paths: RegistryPaths): Aprendizaje[] {
  let texto: string;
  try {
    texto = readFileSync(aprendizajesPath(paths), "utf8");
  } catch {
    return [];
  }

  return parseMemory(texto, APRENDIZAJES)
    .filter((entrada) => entrada.id !== null && entrada.id.startsWith("AP-"))
    .map((entrada) => ({
      id: entrada.id as string,
      title: entrada.title,
      date: entrada.date ?? "",
      tickets: ticketsDe(entrada.body),
      body: entrada.body,
      state: estadoDe(entrada.status),
      source: entrada.source,
    }));
}

/** Los que todavía no tienen decisión. */
export function pendingLearnings(paths: RegistryPaths): Aprendizaje[] {
  return listLearnings(paths).filter((aprendizaje) => aprendizaje.state === "pendiente");
}

/** Lo que devuelve clasificar un aprendizaje. */
export interface Clasificado {
  readonly aprendizaje: Aprendizaje;
  /** La propuesta de estándar que salió, si la decisión fue `regla`. */
  readonly propuestaId: string | null;
}

/**
 * Clasifica un aprendizaje.
 *
 * `regla` **no** escribe la regla: crea la propuesta. La diferencia importa —
 * clasificar es triaje y lo puede hacer un agente; poner una regla en vigor es
 * una decisión de la persona y sigue pasando por `decidir_estandar`—.
 */
export function classifyLearning(
  paths: RegistryPaths,
  id: string,
  decision: DecisionAprendizaje,
  opciones: {
    readonly area?: AreaEstandar | undefined;
    readonly now?: (() => Date) | undefined;
  } = {},
): Clasificado {
  const aprendizajes = listLearnings(paths);
  const aprendizaje = aprendizajes.find((candidato) => candidato.id === id);
  if (aprendizaje === undefined) {
    throw new Error(
      `No existe el aprendizaje ${id}. Los que hay: ` +
        `${aprendizajes.map((uno) => uno.id).join(", ") || "(ninguno)"}.`,
    );
  }
  if (aprendizaje.state !== "pendiente") {
    throw new Error(
      `El aprendizaje ${id} ya está ${aprendizaje.state}: una decisión no se toma dos veces.`,
    );
  }

  let propuestaId: string | null = null;
  if (decision === "regla") {
    // La regla es el cuerpo, sin las líneas de etiquetas: lo que el agente
    // escribió como aprendizaje es lo que hay que aplicar, y reescribirlo acá
    // sería cambiarle las palabras a quien lo descubrió.
    const regla = aprendizaje.body
      .split("\n")
      .filter(
        (linea) =>
          !/^[-*]?\s*\*\*(?:Fecha|Tickets|Estado|Clasificado):\*\*/.test(linea.trim()),
      )
      .join("\n")
      .trim()
      .split("\n\n")[0] as string;

    const propuesta = proposeStandard(paths, {
      title: aprendizaje.title,
      rule: regla === "" ? aprendizaje.title : regla,
      why:
        `Sale del aprendizaje ${aprendizaje.id} (${aprendizaje.date})` +
        (aprendizaje.tickets.length === 0
          ? "."
          : `, visto en ${aprendizaje.tickets.join(", ")}.`),
      area: opciones.area ?? "proceso",
      tickets: aprendizaje.tickets,
      ...(opciones.now === undefined ? {} : { now: opciones.now }),
    });
    propuestaId = propuesta.id;
  }

  // El estado se reescribe en la misma entrada, como en las propuestas: el
  // aprendizaje es un documento de trabajo y su clasificación se lee donde se
  // escribió, no en un índice aparte.
  const texto = readFileSync(aprendizajesPath(paths), "utf8");
  const lineas = texto.split("\n");
  const desde = lineas.findIndex((linea) => linea.startsWith(`### [${id}]`));
  const fecha = (opciones.now?.() ?? new Date()).toISOString().slice(0, 10);
  for (let i = desde; i < lineas.length; i += 1) {
    if (i > desde && /^###\s+\[AP-/.test(lineas[i] as string)) break;
    if (/^-\s+\*\*Estado:\*\*/.test(lineas[i] as string)) {
      lineas[i] = `- **Estado:** ${decision === "descartar" ? "descartado" : decision}`;
      break;
    }
    // Un archivo guardado antes de que existiera la cola no tiene la línea de
    // estado: se agrega junto a la fecha, que es donde va.
    if (
      /^-\s+\*\*Fecha:\*\*/.test(lineas[i] as string) &&
      !/Estado/.test(lineas[i] as string)
    ) {
      lineas.splice(
        i + 1,
        0,
        `- **Estado:** ${decision === "descartar" ? "descartado" : decision}`,
      );
      break;
    }
  }
  // La fecha de la clasificación, para que dentro de un mes se sepa cuándo se
  // decidió y no solo cuándo se descubrió.
  const donde = lineas.findIndex((linea) => linea.startsWith(`### [${id}]`));
  for (let i = donde; i < lineas.length; i += 1) {
    if (i > donde && /^###\s+\[AP-/.test(lineas[i] as string)) break;
    if (/^-\s+\*\*Estado:\*\*/.test(lineas[i] as string)) {
      lineas.splice(i + 1, 0, `- **Clasificado:** ${fecha}`);
      break;
    }
  }
  writeFileSync(aprendizajesPath(paths), lineas.join("\n"), "utf8");

  return {
    aprendizaje: {
      ...aprendizaje,
      state: decision === "descartar" ? "descartado" : decision,
    },
    propuestaId,
  };
}

/** El informe de la cola y de lo ya clasificado. */
export function renderLearnings(aprendizajes: readonly Aprendizaje[]): string {
  const pendientes = aprendizajes.filter((uno) => uno.state === "pendiente");
  if (aprendizajes.length === 0) {
    return (
      "Aprendizajes — ninguno todavía.\n\n" +
      "  El agente guarda uno con `guardar_aprendizaje` cuando el trabajo le enseña algo:\n" +
      "  una causa raíz que costó encontrar, un patrón que se repite. Queda acá esperando\n" +
      "  clasificación: si es una regla del proyecto, un caso documentado, o nada.\n"
    );
  }

  const lineas = [
    `Aprendizajes — ${pendientes.length} pendiente(s) de ${aprendizajes.length}`,
    "",
  ];

  for (const aprendizaje of aprendizajes) {
    lineas.push(
      `  [${aprendizaje.state}] ${aprendizaje.id} · ${aprendizaje.date}`,
      `  ${aprendizaje.title}`,
      ...(aprendizaje.tickets.length === 0
        ? []
        : [`  Visto en: ${aprendizaje.tickets.join(", ")}`]),
      `  → ${aprendizaje.source.path}:${aprendizaje.source.line}`,
      "",
    );
  }

  if (pendientes.length > 0) {
    lineas.push(
      "  Clasificar no pone nada en vigor:",
      "    · `regla`      crea una propuesta de estándar, que una persona decide después",
      "    · `caso`       se queda en la memoria como documentación de lo que pasó",
      "    · `descartar`  se marca y se conserva, para no volver a proponer lo mismo",
      "",
      `  Por ejemplo: valmen memory clasificar ${pendientes[0]?.id ?? "AP-001"} --decision caso`,
    );
  }

  return `${lineas.join("\n").trimEnd()}\n`;
}
