/**
 * `tickets.yaml`: el grafo de una feature.
 *
 * Es el artefacto que convierte una spec en trabajo. Y es el único documento del
 * harness que **escribe un modelo** —la descomposición la propone K3, no el
 * código—, así que aquí la validación no es una cortesía: es lo que separa una
 * propuesta de un contrato. Todo lo que entra por aquí se comprueba contra la
 * spec antes de tocar el disco.
 *
 * La forma es la del diseño (`docs/02-MOTOR.md` §5):
 *
 * ```yaml
 * feature: modulo-inventario
 * generated_by:
 *   provider: opencode-go
 *   model: kimi-k3
 * sprints:
 *   - id: S1
 *     goal: "Modelo de datos y API"
 *     tickets:
 *       - id: FEATURE-INVENTARIO-MODELO-20260921
 *         title: Modelo de datos
 *         depends_on: []
 * coverage:
 *   - requirement: R-INV-001
 *     covered_by:
 *       - FEATURE-INVENTARIO-MODELO-20260921
 * gaps: []
 * ```
 *
 * Un ticket sin dependencias ni título puede escribirse como su identificador
 * suelto: `- FEATURE-INVENTARIO-MODELO-20260921`. Las dos formas se normalizan al
 * leer, así que el resto del motor ve una sola.
 */
import { EXIT_SCHEMA, fail } from "./errors.js";
import {
  type CoverageEntry,
  type FeatureDecomposition,
  type FeatureRequirement,
  type FeatureTicket,
  coverageGaps,
} from "./feature.js";
import { type YamlMap, type YamlValue, parseYamlSubset } from "./yaml.js";

/** Quién generó la descomposición, para poder auditar el coste después. */
export interface DecompositionOrigin {
  readonly provider: string;
  readonly model: string;
  readonly costUsd?: string;
}

/** El documento completo, tal como vive en disco. */
export interface TicketsDocument {
  readonly feature: string;
  readonly origin: DecompositionOrigin | null;
  readonly decomposition: FeatureDecomposition;
}

/** Un fallo de forma en el `tickets.yaml`. */
function malo(mensaje: string): never {
  fail(`tickets.yaml: ${mensaje}`, EXIT_SCHEMA);
}

/** Exige que el valor sea un mapa. */
function comoMapa(valor: YamlValue | undefined, donde: string): YamlMap {
  if (valor === undefined) malo(`falta ${donde}.`);
  if (typeof valor === "string" || Array.isArray(valor)) {
    malo(`${donde} debe ser un mapa.`);
  }
  return valor;
}

/** Exige que el valor sea una lista. */
function comoLista(valor: YamlValue | undefined, donde: string): YamlValue[] {
  if (valor === undefined) malo(`falta ${donde}.`);
  if (typeof valor === "string") malo(`${donde} debe ser una lista.`);
  if (!Array.isArray(valor)) malo(`${donde} debe ser una lista.`);
  return valor;
}

/** Exige que el valor sea un texto no vacío. */
function comoTexto(valor: YamlValue | undefined, donde: string): string {
  if (typeof valor !== "string") malo(`${donde} debe ser un texto.`);
  if (valor.trim() === "") malo(`${donde} no puede estar vacío.`);
  return valor;
}

/** Una lista de textos. Cada elemento, obligatorio. */
function comoTextos(valor: YamlValue | undefined, donde: string): string[] {
  return comoLista(valor, donde).map((elemento, indice) =>
    comoTexto(elemento, `${donde}[${indice}]`),
  );
}

/** El identificador de un ticket: `<TIPO>-<MODULO>-<DESC>-<YYYYMMDD>`. */
const TICKET_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d{8}$/;

/**
 * Lee un ticket de un sprint.
 *
 * Acepta la forma corta y la larga. Rechaza un texto que no parezca un
 * identificador de ticket: un `- modelo de datos` suelto es alguien describiendo
 * un ticket en vez de nombrarlo, y aceptarlo produciría un grafo de nodos que no
 * existen.
 */
function leerTicket(valor: YamlValue, donde: string): FeatureTicket {
  if (typeof valor === "string") {
    if (!TICKET_ID_RE.test(valor)) {
      malo(
        `${donde}: "${valor}" no es un identificador de ticket. ` +
          "Se espera <TIPO>-<MODULO>-<DESC>-<YYYYMMDD>.",
      );
    }
    return valor;
  }
  if (Array.isArray(valor)) malo(`${donde} debe ser un texto o un mapa.`);

  const id = comoTexto(valor["id"], `${donde}.id`);
  if (!TICKET_ID_RE.test(id)) {
    malo(`${donde}.id: "${id}" no es un identificador de ticket.`);
  }
  const title = valor["title"];
  const dependsOn = valor["depends_on"];
  return {
    id,
    ...(typeof title === "string" && title.trim() !== "" ? { title } : {}),
    ...(dependsOn === undefined
      ? {}
      : { dependsOn: comoTextos(dependsOn, `${donde}.depends_on`) }),
  };
}

/** Lee quién generó la descomposición. Ausente es válido: puede ser a mano. */
function leerOrigen(valor: YamlValue | undefined): DecompositionOrigin | null {
  if (valor === undefined) return null;
  const mapa = comoMapa(valor, "generated_by");
  const costUsd = mapa["cost_usd"];
  return {
    provider: comoTexto(mapa["provider"], "generated_by.provider"),
    model: comoTexto(mapa["model"], "generated_by.model"),
    ...(typeof costUsd === "string" && costUsd !== "" ? { costUsd } : {}),
  };
}

/**
 * Analiza un `tickets.yaml`.
 *
 * `requirements` no es opcional y ese es el punto: la cobertura se comprueba
 * **contra la spec** en el momento de leer. Un `tickets.yaml` que cubre
 * requisitos que no existen, o que repite un requisito, o que deja uno sin
 * cubrir, no es un documento que se pueda leer «con reservas» — es una
 * descomposición que no responde a lo que se pidió, y decirlo aquí evita que el
 * error aparezca tres sprints después.
 */
export function parseTicketsYaml(
  text: string,
  requirements: readonly FeatureRequirement[],
): TicketsDocument {
  const raiz = parseYamlSubset(text, {
    fileName: "tickets.yaml",
    key: /^[a-z][a-z0-9_]*$/,
    keyMessage: "no es válida (minúsculas, dígitos y guiones bajos).",
  });
  if (typeof raiz === "string" || Array.isArray(raiz)) {
    malo("la raíz debe ser un mapa.");
  }

  const feature = comoTexto(raiz["feature"], "feature");
  const origin = leerOrigen(raiz["generated_by"]);

  // ── Sprints ──────────────────────────────────────────────────────────────
  const sprintsCrudos = comoLista(raiz["sprints"], "sprints");
  if (sprintsCrudos.length === 0) malo("sprints no puede estar vacío.");

  const sprints = sprintsCrudos.map((crudo, indice) => {
    const donde = `sprints[${indice}]`;
    const mapa = comoMapa(crudo, donde);
    const id = comoTexto(mapa["id"], `${donde}.id`);
    const goal = comoTexto(mapa["goal"], `${donde}.goal`);
    const tickets = comoLista(mapa["tickets"], `${donde}.tickets`);
    if (tickets.length === 0) {
      // Un sprint sin tickets no es un sprint vacío: es un tramo del plan que
      // nadie escribió.
      malo(`${donde} (${id}) no tiene tickets.`);
    }
    return {
      id,
      goal,
      tickets: tickets.map((ticket, posicion) =>
        leerTicket(ticket, `${donde}.tickets[${posicion}]`),
      ),
    };
  });

  const idsDeSprint = new Set<string>();
  for (const sprint of sprints) {
    if (idsDeSprint.has(sprint.id)) malo(`el sprint "${sprint.id}" está repetido.`);
    idsDeSprint.add(sprint.id);
  }

  // Un ticket no puede estar en dos sprints: el seguimiento del conjunto se
  // calcula sumando los sprints, y un ticket contado dos veces daría un progreso
  // que no existe.
  const enSprint = new Map<string, string>();
  for (const sprint of sprints) {
    for (const ticket of sprint.tickets) {
      const id = typeof ticket === "string" ? ticket : ticket.id;
      const anterior = enSprint.get(id);
      if (anterior !== undefined) {
        malo(`el ticket "${id}" está en los sprints ${anterior} y ${sprint.id}.`);
      }
      enSprint.set(id, sprint.id);
    }
  }

  // ── Cobertura ────────────────────────────────────────────────────────────
  const coberturaCruda = comoLista(raiz["coverage"], "coverage");
  const conocidos = new Set(requirements.map((requisito) => requisito.id));
  const coverage: CoverageEntry[] = [];
  const yaCubiertos = new Set<string>();

  coberturaCruda.forEach((crudo, indice) => {
    const donde = `coverage[${indice}]`;
    const mapa = comoMapa(crudo, donde);
    const requirement = comoTexto(mapa["requirement"], `${donde}.requirement`);
    if (!conocidos.has(requirement)) {
      const disponibles = requirements.map((r) => r.id).join(", ");
      malo(
        `${donde}.requirement: "${requirement}" no está en la spec. ` +
          `Los requisitos son: ${disponibles || "(ninguno)"}.`,
      );
    }
    if (yaCubiertos.has(requirement)) {
      malo(`${donde}.requirement: "${requirement}" está repetido.`);
    }
    yaCubiertos.add(requirement);
    const coveredBy = comoTextos(mapa["covered_by"], `${donde}.covered_by`);
    for (const ticket of coveredBy) {
      // La cobertura nombra tickets, y un ticket tiene forma. Sin esto, un
      // `covered_by: [modelo de datos]` se leería como un ticket que no está en
      // ningún sprint, y el error diría «requisito sin cubrir» en vez de «eso no
      // es un ticket» —que es lo que hay que arreglar—.
      if (!TICKET_ID_RE.test(ticket)) {
        malo(
          `${donde}.covered_by: "${ticket}" no es un identificador de ticket. ` +
            "Se espera <TIPO>-<MODULO>-<DESC>-<YYYYMMDD>.",
        );
      }
    }
    coverage.push({ requirement, coveredBy });
  });

  const gaps = comoTextos(raiz["gaps"] ?? [], "gaps");

  const decomposition: FeatureDecomposition = { sprints, coverage, gaps };

  // La comprobación que da sentido a todo lo anterior: ¿queda algún requisito
  // sin ticket? Se avisa aquí, con el enunciado, en vez de dejar que aparezca
  // como un `fail` de la compuerta sin contexto.
  const huecos = coverageGaps(requirements, decomposition);
  if (huecos.length > 0) {
    malo(
      `${huecos.length} requisito(s) de la spec sin ticket que los cubra: ` +
        huecos.map((hueco) => `${hueco.requirement} — ${hueco.statement}`).join("; ") +
        ". Añádelos a la cobertura con el ticket que los implementa.",
    );
  }

  return { feature, origin, decomposition };
}

/** Un texto que YAML leería mal si se escribe sin comillas. */
function escalar(valor: string): string {
  if (valor === "") return '""';
  if (/^[\s]|[\s]$|[:#{}[\],&*?|>!%@`"']/.test(valor) || /^[-?]/.test(valor)) {
    return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return valor;
}

/**
 * Escribe un `tickets.yaml`.
 *
 * Se genera desde la estructura y no se copia la respuesta del modelo: un
 * documento escrito por un modelo puede llevar cualquier cosa entre las líneas
 * que el parser lee, y lo que se firma tiene que ser lo que el motor entendió.
 * El orden de las claves es fijo, así que dos ejecuciones con el mismo grafo
 * producen el mismo archivo y un `diff` vacío.
 */
export function renderTicketsYaml(documento: TicketsDocument): string {
  const { feature, origin, decomposition } = documento;
  const lineas: string[] = [`feature: ${escalar(feature)}`];

  if (origin !== null) {
    lineas.push("generated_by:");
    lineas.push(`  provider: ${escalar(origin.provider)}`);
    lineas.push(`  model: ${escalar(origin.model)}`);
    if (origin.costUsd !== undefined) {
      lineas.push(`  cost_usd: ${escalar(origin.costUsd)}`);
    }
  }

  lineas.push("sprints:");
  for (const sprint of decomposition.sprints) {
    lineas.push(`  - id: ${escalar(sprint.id)}`);
    lineas.push(`    goal: ${escalar(sprint.goal)}`);
    lineas.push("    tickets:");
    for (const ticket of sprint.tickets) {
      if (typeof ticket === "string") {
        lineas.push(`      - ${ticket}`);
        continue;
      }
      lineas.push(`      - id: ${ticket.id}`);
      if (ticket.title !== undefined && ticket.title !== "") {
        lineas.push(`        title: ${escalar(ticket.title)}`);
      }
      const dependencias = ticket.dependsOn ?? [];
      if (dependencias.length === 0) {
        lineas.push("        depends_on: []");
      } else {
        lineas.push("        depends_on:");
        for (const dependencia of dependencias) {
          lineas.push(`          - ${dependencia}`);
        }
      }
    }
  }

  lineas.push("coverage:");
  for (const entrada of decomposition.coverage) {
    lineas.push(`  - requirement: ${escalar(entrada.requirement)}`);
    lineas.push("    covered_by:");
    for (const ticket of entrada.coveredBy) lineas.push(`      - ${ticket}`);
  }

  if (decomposition.gaps.length === 0) {
    lineas.push("gaps: []");
  } else {
    lineas.push("gaps:");
    for (const hueco of decomposition.gaps) {
      lineas.push(`  - ${escalar(hueco)}`);
    }
  }

  return lineas.join("\n") + "\n";
}
