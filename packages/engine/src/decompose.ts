/**
 * Descomponer una feature en tickets.
 *
 * Es el único paso del harness donde **un modelo escribe un artefacto del
 * registro**. Todo lo demás lo escribe el código o una persona. Por eso este
 * archivo se lee como una lista de lo que se comprueba antes de aceptar la
 * propuesta:
 *
 * 1. La feature existe y está en un estado del que se puede descomponer.
 * 2. Hay requisitos, y son los que se le pasan al modelo —no los que él invente—.
 * 3. La respuesta se parsea contra la spec: un requisito sin cubrir, uno
 *    inventado, un ticket que no está en ningún sprint, o un ciclo, no entran.
 * 4. El archivo se **regenera** desde la estructura validada, no se copia.
 *
 * Lo último importa más de lo que parece. Un modelo puede escribir algo entre las
 * líneas que el parser lee sin problema y que después nadie mira —un comentario
 * con una instrucción, un campo que el esquema no declara—. Lo que se firma es lo
 * que el motor entendió, y eso se escribe desde el objeto, no desde el texto.
 *
 * La red no vive aquí: `callModel` entra como parámetro. El motor no habla con
 * proveedores, y esa frontera es la que permite probar todo esto sin gastar un
 * token y sin una clave.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type FeatureRequirement,
  type TicketsDocument,
  EXIT_INVARIANT,
  assertDecomposable,
  atomicWrite,
  fail,
  parseTicketsYaml,
  renderTicketsYaml,
} from "@valmen/core";

import { type FeatureRow, readFeature } from "./features.js";
import { readRequirements } from "./spec.js";

/** El estado del que se puede descomponer. */
const ESTADOS_DESCOMPONIBLES = ["specified", "planned"];

/** Lo que el modelo tiene que devolver, en la forma que valida el motor. */
export interface DecompositionProposal {
  readonly sprints: readonly {
    readonly id: string;
    readonly goal: string;
    readonly tickets: readonly {
      readonly id: string;
      readonly title: string;
      readonly depends_on?: readonly string[];
    }[];
  }[];
  readonly coverage: readonly {
    readonly requirement: string;
    readonly covered_by: readonly string[];
  }[];
}

/** Quién respondió, para dejarlo escrito en el artefacto. */
export interface Decomposer {
  readonly provider: string;
  readonly model: string;
  readonly costUsd?: number | undefined;
}

/** Lo que hace falta para descomponer. */
export interface DecomposeRequest {
  readonly root: string;
  readonly slug: string;
  /**
   * Quien propone la descomposición.
   *
   * Recibe el brief, los requisitos y el diseño, y devuelve la propuesta. Puede
   * fallar: un proveedor sin saldo, un modelo que no respeta el esquema. El motor
   * no lo reintenta —un reintento automático sobre un modelo que ya falló el
   * formato gasta dinero sin cambiar el resultado— pero sí distingue el fallo del
   * de validación.
   */
  readonly callModel: (entrada: DecomposeInput) => Promise<{
    readonly proposal: unknown;
    readonly decomposer: Decomposer;
  }>;
  /** Escribe el archivo. `false` deja el resultado en memoria para revisarlo. */
  readonly write?: boolean;
}

/** Lo que ve el modelo. */
export interface DecomposeInput {
  readonly feature: string;
  readonly title: string;
  readonly brief: string;
  readonly design: string;
  readonly requirements: readonly FeatureRequirement[];
}

/** El resultado de descomponer. */
export interface DecomposeResult {
  readonly document: TicketsDocument;
  readonly yaml: string;
  readonly path: string;
  readonly written: boolean;
  readonly decomposer: Decomposer;
}

/** Lee el brief de la feature, o falla diciendo por qué no se puede. */
function leerFeature(root: string, slug: string): { row: FeatureRow; text: string } {
  const leida = readFeature(root, slug);
  if (leida === null) {
    fail(`No existe la feature "${slug}" en .valmen/features/.`);
  }
  if (leida.row.invalid !== null) {
    fail(`La feature "${slug}" no es válida: ${leida.row.invalid}`);
  }
  if (!ESTADOS_DESCOMPONIBLES.includes(leida.row.state)) {
    // El mensaje nombra el archivo y no un comando, porque el comando que
    // escribiría la spec todavía no existe: `valmen feature spec` está en la fase
    // siguiente. Un error que manda a ejecutar algo inexistente es peor que uno
    // que dice qué falta.
    fail(
      `La feature "${slug}" está en ${leida.row.state} y no se puede descomponer ` +
        "desde ahí. Hace falta la spec: escribe " +
        `.valmen/features/${slug}/spec/<dominio>/spec.md con sus requisitos en ` +
        `RFC 2119, y pasa la feature a ${ESTADOS_DESCOMPONIBLES.join(" o ")}.`,
      EXIT_INVARIANT,
    );
  }
  return { row: leida.row, text: leida.text };
}

/** El diseño técnico, si existe. */
function leerDiseno(root: string, slug: string): string {
  try {
    return readFileSync(join(root, ".valmen", "features", slug, "design.md"), "utf8");
  } catch {
    // Sin diseño se descompone igual: el diseño mejora la propuesta, no la hace
    // posible. Un estado `planned` sin `design.md` es una inconsistencia del
    // registro, y de eso ya se queja el seguimiento, no la descomposición.
    return "";
  }
}

/**
 * Traduce la propuesta del modelo a la estructura del contrato.
 *
 * Traduce, no valida: `parseTicketsYaml` es quien decide si el resultado sirve.
 * Se hace pasando por el texto YAML a propósito —se genera el archivo con la
 * propuesta y se vuelve a leer—, porque así el camino que sigue una propuesta es
 * **exactamente** el mismo que sigue un `tickets.yaml` escrito a mano. Un atajo
 * aquí sería la forma más fácil de que el validador no viera lo que se guarda.
 */
export function proposalToYaml(
  slug: string,
  proposal: DecompositionProposal,
  decomposer: Decomposer,
): string {
  const document: TicketsDocument = {
    feature: slug,
    origin: {
      provider: decomposer.provider,
      model: decomposer.model,
      ...(decomposer.costUsd === undefined
        ? {}
        : { costUsd: decomposer.costUsd.toFixed(6) }),
    },
    decomposition: {
      sprints: proposal.sprints.map((sprint) => ({
        id: sprint.id,
        goal: sprint.goal,
        tickets: sprint.tickets.map((ticket) => ({
          id: ticket.id,
          ...(ticket.title === undefined || ticket.title === ""
            ? {}
            : { title: ticket.title }),
          dependsOn: [...(ticket.depends_on ?? [])],
        })),
      })),
      coverage: proposal.coverage.map((entrada) => ({
        requirement: entrada.requirement,
        coveredBy: [...entrada.covered_by],
      })),
      gaps: [],
    },
  };
  return renderTicketsYaml(document);
}

/**
 * Comprueba la forma de la propuesta antes de intentar leerla como YAML.
 *
 * Sin esto, una propuesta con `sprints` como texto falla dentro del parser con un
 * mensaje sobre YAML, que no le dice nada a quien tiene que arreglar el prompt.
 */
function exigirPropuesta(valor: unknown): DecompositionProposal {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    fail(
      "El modelo no devolvió un objeto: se esperaba un grafo con `sprints` y " +
        `\`coverage\`. Devolvió ${JSON.stringify(valor)?.slice(0, 200) ?? "nada"}.`,
    );
  }
  const propuesta = valor as Record<string, unknown>;
  if (!Array.isArray(propuesta["sprints"]) || propuesta["sprints"].length === 0) {
    fail("El modelo no devolvió sprints.");
  }
  if (!Array.isArray(propuesta["coverage"])) {
    fail("El modelo no devolvió cobertura.");
  }
  return valor as DecompositionProposal;
}

/**
 * Descompone una feature.
 *
 * El orden es el de la lista de arriba, y no es casual: se comprueba todo lo que
 * se puede comprobar **sin gastar** antes de llamar al modelo. Un slug mal
 * escrito o una feature en `draft` no deberían costar una llamada.
 */
export async function decomposeFeature(
  request: DecomposeRequest,
): Promise<DecomposeResult> {
  const { root, slug } = request;
  const escribir = request.write ?? true;

  const { row, text: brief } = leerFeature(root, slug);

  const specDir = join(root, ".valmen", "features", slug, "spec");
  const requisitos = readRequirements(specDir, `.valmen/features/${slug}`);
  if (requisitos.length === 0) {
    fail(
      `La feature "${slug}" no tiene requisitos en spec/. La descomposición se ` +
        "comprueba contra la spec, así que sin requisitos no hay nada que " +
        "repartir: escribe `spec/<dominio>/spec.md` primero.",
      EXIT_INVARIANT,
    );
  }

  const { proposal, decomposer } = await request.callModel({
    feature: slug,
    title: row.title,
    brief,
    design: leerDiseno(root, slug),
    requirements: requisitos,
  });

  const yaml = proposalToYaml(slug, exigirPropuesta(proposal), decomposer);

  // Se relee el YAML generado con el mismo parser que leería el archivo. Es el
  // paso que convierte una propuesta en un contrato: si el modelo propuso un
  // requisito que no existe, un ticket en dos sprints o uno sin cobertura, falla
  // aquí y no tres sprints después.
  const document = parseTicketsYaml(yaml, requisitos);
  if (document.feature !== slug) {
    fail(`El grafo dice pertenecer a "${document.feature}" y no a "${slug}".`);
  }
  assertDecomposable(requisitos, document.decomposition);

  const ruta = join(root, ".valmen", "features", slug, "tickets.yaml");
  if (escribir) {
    mkdirSync(join(root, ".valmen", "features", slug), { recursive: true });
    atomicWrite(ruta, yaml);
  }

  return {
    document,
    yaml,
    path: `.valmen/features/${slug}/tickets.yaml`,
    written: escribir,
    decomposer,
  };
}

/** El resumen de un grafo, para imprimirlo tras descomponer. */
export function renderDecomposition(result: DecomposeResult): string {
  const { document, decomposer } = result;
  const tickets = document.decomposition.sprints.reduce(
    (total, sprint) => total + sprint.tickets.length,
    0,
  );
  const lineas = [
    `Descomposición de ${document.feature}: ${tickets} ticket(s) en ` +
      `${document.decomposition.sprints.length} sprint(s).`,
    ...document.decomposition.sprints.map((sprint) => {
      const ids = sprint.tickets.map((ticket) =>
        typeof ticket === "string" ? ticket : ticket.id,
      );
      return `  ${sprint.id} — ${sprint.goal} (${ids.length}): ${ids.join(", ")}`;
    }),
    `${document.decomposition.coverage.length} requisito(s) cubierto(s).`,
    `Modelo: ${decomposer.provider}/${decomposer.model}` +
      (decomposer.costUsd === undefined ? "" : ` · $${decomposer.costUsd.toFixed(6)}`),
    result.written
      ? `Escrito en ${result.path}.`
      : `Sin escribir (--dry-run). Habría quedado en ${result.path}.`,
  ];
  return lineas.join("\n") + "\n";
}

/** Lo que el prompt le pide al modelo, en texto. Se exporta para poder verlo. */
export function decompositionPrompt(entrada: DecomposeInput): string {
  const requisitos = entrada.requirements
    .map((requisito) => `- ${requisito.id}: ${requisito.statement}`)
    .join("\n");

  return [
    `Descompón la feature "${entrada.feature}" —${entrada.title}— en tickets.`,
    "",
    "REQUISITOS DE LA SPEC:",
    requisitos,
    "",
    entrada.design === ""
      ? "No hay diseño técnico todavía."
      : `DISEÑO TÉCNICO:\n${entrada.design}`,
    "",
    "BRIEF:",
    entrada.brief,
    "",
    "Reglas:",
    "1. Agrupa los tickets en sprints. Cada sprint es un tramo que se puede",
    "   entregar y verificar por separado.",
    "2. **Cada requisito necesita al menos un ticket que lo cubra.** Es la regla",
    "   dura: si un requisito no lo cubre ninguno, la descomposición no se acepta.",
    "3. Un identificador de ticket es `<TIPO>-<MODULO>-<DESC>-<YYYYMMDD>`,",
    "   en mayúsculas. El tipo es FEATURE, BUGFIX, IMPROVEMENT, SYNC,",
    "   INTEGRATION, AGENT, SECURITY, CHORE o DOCS.",
    "4. El mismo ticket no puede estar en dos sprints.",
    "5. `depends_on` solo puede mencionar tickets que estén en la lista. Un grafo",
    "   con ciclos no se acepta.",
    "6. No inventes requisitos: la cobertura usa exactamente los identificadores",
    "   de arriba.",
  ].join("\n");
}

/** El mensaje de sistema del descomponedor. */
export const SISTEMA_DESCOMPOSICION = [
  "Eres un arquitecto de software que descompone una especificación en tickets",
  "de implementación.",
  "",
  "Reglas:",
  "1. Cada requisito de la spec tiene que quedar cubierto por al menos un ticket.",
  "   Es la regla dura: un requisito sin cobertura invalida la descomposición.",
  "2. No inventes requisitos. La cobertura usa exactamente los identificadores que",
  "   se te dan.",
  "3. Un ticket no puede estar en dos sprints, y `depends_on` solo puede mencionar",
  "   tickets que existan en el grafo. Sin ciclos.",
  "4. Un ticket es una unidad revisable: si toca más de un módulo o excede unas",
  "   pocas horas de trabajo, divídelo.",
  "5. El identificador es `<TIPO>-<MODULO>-<DESC>-<YYYYMMDD>`, en mayúsculas.",
  "",
  "Responde solo con el grafo, en la forma que se te pide.",
].join("\n");

/** La forma exacta de la respuesta, para los proveedores que no la imponen. */
export const ESQUEMA_DESCOMPOSICION = {
  type: "object",
  properties: {
    sprints: {
      type: "array",
      description: "Los tramos entregables, en orden.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "S1, S2…" },
          goal: { type: "string", description: "Qué se entrega en este tramo." },
          tickets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                depends_on: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["id", "title", "depends_on"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "goal", "tickets"],
        additionalProperties: false,
      },
    },
    coverage: {
      type: "array",
      description: "Qué ticket cubre qué requisito. Uno por requisito.",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string", description: "R-XXX-NNN de la spec." },
          covered_by: { type: "array", items: { type: "string" } },
        },
        required: ["requirement", "covered_by"],
        additionalProperties: false,
      },
    },
  },
  required: ["sprints", "coverage"],
  additionalProperties: false,
} as const;

