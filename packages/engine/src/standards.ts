/**
 * Los estándares del proyecto y quién los propone.
 *
 * Un estándar es una convención que el proyecto ya decidió: cómo se alinean las
 * columnas, cómo se formatea un monto, qué campo usa autocompletado. Vive en
 * `.valmen/rules/estandares-<área>.md`, así que `valmen sync` lo lleva al
 * `AGENTS.md` y el agente lo tiene **antes** de escribir la primera línea. Eso es
 * lo que hace que un estándar sirva: no depende de que alguien se acuerde de
 * buscar el documento.
 *
 * Lo que faltaba era **cómo crece**. Las convenciones aparecen trabajando —hay que
 * aclarar lo mismo en dos tickets, o una corrección revela que la regla existía
 * solo en la cabeza de alguien— y hasta ahora eso se perdía: el agente lo
 * explicaba, el humano lo aplicaba, y el ticket siguiente volvía a empezar de
 * cero. Un estándar que no se puede agregar sin abrir un editor de texto no se
 * agrega.
 *
 * La propuesta es del agente; **la decisión es de la persona**. Es la misma
 * división del resto del harness: el agente propone con su motivo y sus tickets,
 * y aceptar —que es lo que lo pone en vigor— se hace desde Mission Control.
 *
 * Las propuestas van a un archivo aparte y **no entran al `AGENTS.md`**: una regla
 * sin aprobar no debe comportarse como una aprobada. Lo que no está en vigor no se
 * aplica.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

import { type RegistryPaths, ticketsPath } from "./discovery.js";

/** Las áreas que un estándar puede tocar. */
export const AREAS = ["presentacion", "backend", "datos", "proceso"] as const;
export type AreaEstandar = (typeof AREAS)[number];

/** Un estándar propuesto, con lo que hace falta para decidirlo. */
export interface EstandarPropuesto {
  /** Identificador corto: `EST-001`. */
  readonly id: string;
  readonly title: string;
  readonly area: AreaEstandar;
  /** La regla, en una o dos frases imperativas. */
  readonly rule: string;
  /** Por qué: el caso que la motivó. */
  readonly why: string;
  /** Los tickets donde se vio la necesidad. */
  readonly tickets: readonly string[];
  readonly date: string;
  readonly state: "propuesto" | "aceptado" | "descartado";
  readonly source: { readonly path: string; readonly line: number };
}

/** El archivo de propuestas, relativo a la raíz. */
export const PROPUESTAS = ".valmen/estandares-propuestos.md";

/** La ruta del archivo de propuestas. */
export function proposalsPath(paths: RegistryPaths): string {
  return join(paths.root, PROPUESTAS);
}

/** El archivo de estándares de un área, relativo a la raíz. */
export function standardsFileFor(area: AreaEstandar): string {
  return `.valmen/rules/estandares-${area}.md`;
}

/** El encabezado de un archivo de estándares nuevo. */
function cabeceraDeArea(area: AreaEstandar): string {
  const titulos: Record<AreaEstandar, string> = {
    presentacion: "Estándares de presentación",
    backend: "Estándares de backend",
    datos: "Estándares de datos",
    proceso: "Estándares de proceso",
  };
  return (
    `# ${titulos[area]}\n\n` +
    "Reglas que este proyecto ya decidió. **No son preferencias**: cada una salió de\n" +
    "una corrección que hubo que hacer, y su motivo va escrito para que se pueda\n" +
    "discutir cuando cambie.\n"
  );
}

/** El valor de una etiqueta del cuerpo: `- **Área:** presentacion`. */
function etiqueta(cuerpo: string, nombre: string): string | null {
  const match = new RegExp(`\\*\\*${nombre}:\\*\\*\\s*(.+)`, "i").exec(cuerpo);
  return match === null ? null : (match[1] as string).trim();
}

/** Una entrada de propuesta, con su posición. */
const ENTRADA_RE = /^###\s+\[(EST-\d{3})\]\s+(.+)$/;

/**
 * Lee las propuestas.
 *
 * El formato es el mismo que el de los documentos de conocimiento del proyecto
 * —encabezado con identificador y cuerpo con etiquetas—, así que el índice de
 * memoria las puede leer si algún día hacen falta ahí, y una persona las lee sin
 * aprender nada nuevo.
 */
export function listProposals(paths: RegistryPaths): EstandarPropuesto[] {
  let texto: string;
  try {
    texto = readFileSync(proposalsPath(paths), "utf8");
  } catch {
    return [];
  }

  const propuestas: EstandarPropuesto[] = [];
  let actual: { id: string; title: string; line: number; cuerpo: string[] } | null = null;

  const cerrar = (): void => {
    if (actual === null) return;
    const cuerpo = actual.cuerpo.join("\n").trim();
    const area = (etiqueta(cuerpo, "área") ?? "proceso") as AreaEstandar;
    const estado = (etiqueta(cuerpo, "estado") ?? "propuesto").toLowerCase();
    propuestas.push({
      id: actual.id,
      title: actual.title,
      area: AREAS.includes(area) ? area : "proceso",
      rule: extraerBloque(cuerpo, "Regla"),
      why: extraerBloque(cuerpo, "Por qué"),
      tickets: (etiqueta(cuerpo, "tickets") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== ""),
      date: etiqueta(cuerpo, "propuesto") ?? "",
      state:
        estado === "aceptado"
          ? "aceptado"
          : estado === "descartado"
            ? "descartado"
            : "propuesto",
      source: { path: PROPUESTAS, line: actual.line },
    });
    actual = null;
  };

  for (const [indice, linea] of texto.split("\n").entries()) {
    const match = ENTRADA_RE.exec(linea);
    if (match !== null) {
      cerrar();
      actual = {
        id: match[1] as string,
        title: (match[2] as string).trim(),
        line: indice + 1,
        cuerpo: [],
      };
      continue;
    }
    if (actual !== null) actual.cuerpo.push(linea);
  }

  cerrar();
  return propuestas;
}

/** El texto que sigue a una etiqueta en negrita, hasta la próxima. */
function extraerBloque(cuerpo: string, nombre: string): string {
  const match = new RegExp(
    `\\*\\*${nombre}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`,
    "i",
  ).exec(cuerpo);
  return match === null ? "" : (match[1] as string).trim();
}

/** Lo que hace falta para proponer un estándar. */
export interface NuevaPropuesta {
  readonly title: string;
  readonly rule: string;
  readonly why: string;
  readonly area: AreaEstandar;
  readonly tickets?: readonly string[];
  readonly now?: (() => Date) | undefined;
}

/**
 * Propone un estándar.
 *
 * Se anexa y no se reescribe: una propuesta es un hecho del trabajo —«esto hubo que
 * aclararlo dos veces»— y su historia importa tanto como su contenido. Lo que
 * cambia después es su estado, y ese cambio queda escrito en la misma entrada.
 */
export function proposeStandard(
  paths: RegistryPaths,
  propuesta: NuevaPropuesta,
): EstandarPropuesto {
  const titulo = propuesta.title.trim();
  const regla = propuesta.rule.trim();
  const motivo = propuesta.why.trim();
  if (titulo === "" || regla === "") {
    throw new Error(
      "Una propuesta necesita título y regla: el motivo puede faltar, la regla no.",
    );
  }

  const archivo = proposalsPath(paths);
  mkdirSync(join(paths.root, ".valmen"), { recursive: true });

  if (!existsSync(archivo)) {
    writeFileSync(
      archivo,
      "# Estándares propuestos\n\n" +
        "Reglas que el trabajo enseñó y que **todavía no están en vigor**. Se aceptan o\n" +
        "se descartan desde Mission Control; al aceptarlas pasan a\n" +
        "`.valmen/rules/estandares-<área>.md`, que es lo que llega al `AGENTS.md`.\n",
      "utf8",
    );
  }

  const previas = listProposals(paths).length;
  const id = `EST-${String(previas + 1).padStart(3, "0")}`;
  const fecha = (propuesta.now?.() ?? new Date()).toISOString().slice(0, 10);
  const tickets = propuesta.tickets ?? [];

  appendFileSync(
    archivo,
    [
      "",
      `### [${id}] ${titulo}`,
      "",
      `- **Área:** ${propuesta.area}`,
      `- **Propuesto:** ${fecha}`,
      `- **Estado:** propuesto`,
      ...(tickets.length === 0 ? [] : [`- **Tickets:** ${tickets.join(", ")}`]),
      "",
      `**Regla:** ${regla}`,
      "",
      `**Por qué:** ${motivo === "" ? "(sin motivo escrito)" : motivo}`,
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    id,
    title: titulo,
    area: propuesta.area,
    rule: regla,
    why: motivo,
    tickets,
    date: fecha,
    state: "propuesto",
    source: { path: PROPUESTAS, line: 0 },
  };
}

/** El resultado de decidir sobre una propuesta. */
export interface DecisionDeEstandar {
  readonly propuesta: EstandarPropuesto;
  /** El archivo de estándares donde quedó, si se aceptó. */
  readonly writtenTo: string | null;
}

/**
 * Acepta o descarta una propuesta.
 *
 * Aceptar **escribe la regla** en el archivo del área y la deja en vigor; descartar
 * solo cambia su estado. Las dos cosas quedan escritas en la propuesta: dentro de
 * un mes, «¿por qué no tenemos esta regla?» tiene respuesta.
 */
export function decideProposal(
  paths: RegistryPaths,
  id: string,
  decision: "aceptado" | "descartado",
): DecisionDeEstandar {
  const propuesta = listProposals(paths).find((candidata) => candidata.id === id);
  if (propuesta === undefined) {
    throw new Error(
      `No existe la propuesta ${id}. Las que hay: ` +
        `${
          listProposals(paths)
            .map((p) => p.id)
            .join(", ") || "(ninguna)"
        }.`,
    );
  }
  if (propuesta.state !== "propuesto") {
    throw new Error(
      `La propuesta ${id} ya está ${propuesta.state}: una decisión no se toma dos veces.`,
    );
  }

  let destino: string | null = null;
  if (decision === "aceptado") {
    const relativa = standardsFileFor(propuesta.area);
    const archivo = join(paths.root, relativa);
    if (!existsSync(archivo)) {
      mkdirSync(join(paths.root, ".valmen", "rules"), { recursive: true });
      writeFileSync(archivo, cabeceraDeArea(propuesta.area), "utf8");
    }
    appendFileSync(
      archivo,
      [
        "",
        `## ${propuesta.title}`,
        "",
        propuesta.rule,
        "",
        propuesta.why === "" ? "" : `**Por qué:** ${propuesta.why}`,
        propuesta.tickets.length === 0
          ? ""
          : `**Visto en:** ${propuesta.tickets.join(", ")} (${propuesta.date})`,
        "",
      ]
        .filter((linea) => linea !== "")
        .join("\n") + "\n",
      "utf8",
    );
    destino = relativa;
  }

  // El estado se reescribe en la misma entrada: la propuesta es un documento de
  // trabajo, y su decisión tiene que leerse donde se propuso.
  const texto = readFileSync(proposalsPath(paths), "utf8");
  const lineas = texto.split("\n");
  const desde = lineas.findIndex((linea) => linea.startsWith(`### [${id}]`));
  for (let i = desde; i < lineas.length; i += 1) {
    if (i > desde && /^###\s+\[EST-/.test(lineas[i] as string)) break;
    if (/^-\s+\*\*Estado:\*\*/.test(lineas[i] as string)) {
      lineas[i] = `- **Estado:** ${decision}`;
      break;
    }
  }
  writeFileSync(proposalsPath(paths), lineas.join("\n"), "utf8");

  return { propuesta: { ...propuesta, state: decision }, writtenTo: destino };
}

/** Los archivos de estándares en vigor, con su área. */
export function standardsFiles(root: string): { path: string; area: string }[] {
  let nombres: string[];
  try {
    nombres = readdirSync(join(root, ".valmen", "rules"));
  } catch {
    return [];
  }

  return nombres
    .filter((nombre) => nombre.startsWith("estandares-") && nombre.endsWith(".md"))
    .sort()
    .map((nombre) => ({
      path: relative(root, join(root, ".valmen", "rules", nombre))
        .split("\\")
        .join("/"),
      area: nombre.replace("estandares-", "").replace(".md", ""),
    }));
}

/** El informe de las propuestas, en texto. */
export function renderProposals(propuestas: readonly EstandarPropuesto[]): string {
  if (propuestas.length === 0) {
    return (
      "No hay estándares propuestos.\n\n" +
      "El agente propone uno cuando el trabajo le enseña una convención que no está\n" +
      "escrita: porque hubo que aclararla dos veces, o porque una corrección la reveló.\n"
    );
  }

  const pendientes = propuestas.filter((p) => p.state === "propuesto");
  const lineas = [
    `Estándares propuestos — ${pendientes.length} pendiente(s) de ${propuestas.length}`,
    "",
  ];

  for (const propuesta of propuestas) {
    lineas.push(
      `  [${propuesta.state}] ${propuesta.id} · ${propuesta.area} · ${propuesta.date}`,
      `  ${propuesta.title}`,
      `  Regla: ${propuesta.rule}`,
      ...(propuesta.why === "" ? [] : [`  Por qué: ${propuesta.why}`]),
      ...(propuesta.tickets.length === 0
        ? []
        : [`  Visto en: ${propuesta.tickets.join(", ")}`]),
      `  → ${propuesta.source.path}:${propuesta.source.line}`,
      "",
    );
  }

  if (pendientes.length > 0) {
    lineas.push(
      "  Se aceptan o se descartan desde Mission Control; al aceptar, la regla pasa a",
      "  `.valmen/rules/estandares-<área>.md` y entra al AGENTS.md en el próximo sync.",
    );
  }

  return `${lineas.join("\n").trimEnd()}\n`;
}

/** La ruta del registro, para quien necesite comprobar que el proyecto lo tiene. */
export function tieneRegistro(paths: RegistryPaths): boolean {
  return existsSync(ticketsPath(paths));
}
