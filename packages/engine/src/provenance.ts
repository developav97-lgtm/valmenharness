/**
 * De dónde viene un ticket.
 *
 * El vínculo va en un solo sentido, y está bien: el `tickets.yaml` de una feature
 * declara sus tickets —con su sprint y sus dependencias— y el ticket no repite
 * esa información. Pero quien trabaja un ticket necesita saber de dónde salió: la
 * spec que le da los requisitos, el sprint del que forma parte, y qué tiene que
 * estar cerrado antes.
 *
 * Sin esto, un agente que recibe «seguí con FEATURE-UTILIDADES-MENU-ACCESO» ve un
 * ticket con su solicitud y nada más, y la spec queda a un `valmen feature show`
 * de distancia que solo encuentra quien sabe que existe. Buscarlo en los grafos
 * del proyecto es trabajo del motor, y se hace una vez por consulta.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { decompositionTickets, previewTicketsYaml } from "@valmen/core";

import { featuresDir } from "./features.js";
import { readSpecs } from "./spec.js";

/** La feature de la que sale un ticket. */
export interface Procedencia {
  readonly slug: string;
  readonly title: string;
  /** El sprint al que pertenece el ticket en el grafo. */
  readonly sprint: string;
  /** El objetivo de ese sprint: el tramo entregable del que forma parte. */
  readonly sprintGoal: string;
  /** Los tickets que tienen que estar cerrados antes de empezar este. */
  readonly dependsOn: readonly string[];
  /** La carpeta de la spec, y los dominios que declara. */
  readonly specDir: string;
  readonly domains: readonly string[];
}

/** Las features del proyecto, por carpeta. */
function slugs(root: string): string[] {
  try {
    return readdirSync(featuresDir(root)).sort();
  } catch {
    return [];
  }
}

/**
 * Busca el ticket en los grafos de las features del proyecto.
 *
 * Devuelve `null` si el ticket no viene de ninguna feature, que es el caso de
 * todos los tickets que no nacieron de una descomposición. Un ticket puede estar
 * en un solo grafo; si por un error de registro apareciera en dos, gana el
 * primero por orden alfabético y el llamador informa de lo que encontró.
 */
export function procedenciaDeTicket(root: string, ticketId: string): Procedencia | null {
  for (const slug of slugs(root)) {
    const carpeta = join(featuresDir(root), slug);
    let texto: string;
    try {
      texto = readFileSync(join(carpeta, "tickets.yaml"), "utf8");
    } catch {
      continue;
    }

    const vista = previewTicketsYaml(texto, []);
    if (vista === null) continue;
    const tickets = decompositionTickets(vista.document.decomposition);
    const suyo = tickets.find((ticket) => ticket.id === ticketId);
    if (suyo === undefined) continue;

    const sprint = vista.document.decomposition.sprints.find(
      (candidato) => candidato.id === suyo.sprint,
    );

    return {
      slug,
      title: tituloDeFeature(carpeta) ?? slug,
      sprint: suyo.sprint,
      sprintGoal: sprint?.goal ?? "",
      dependsOn: suyo.dependsOn,
      specDir: `.valmen/features/${slug}/spec/`,
      domains: readSpecs(join(carpeta, "spec"), `.valmen/features/${slug}`).map(
        (spec) => spec.domain,
      ),
    };
  }
  return null;
}

/** El título de la feature, leído de su brief. */
function tituloDeFeature(carpeta: string): string | null {
  try {
    const texto = readFileSync(join(carpeta, "feature.md"), "utf8");
    const match = /^title:\s*(.+)$/m.exec(texto);
    return match === null ? null : (match[1] as string).trim();
  } catch {
    return null;
  }
}

/** La procedencia en texto, para el `resume` y para la herramienta del MCP. */
export function renderProcedencia(procedencia: Procedencia): string {
  const lineas = [
    `Feature: ${procedencia.slug} — ${procedencia.title}`,
    `Sprint: ${procedencia.sprint}` +
      (procedencia.sprintGoal === "" ? "" : ` — ${procedencia.sprintGoal}`),
  ];
  if (procedencia.dependsOn.length > 0) {
    lineas.push(`Depende de: ${procedencia.dependsOn.join(", ")}`);
  }
  if (procedencia.domains.length > 0) {
    lineas.push(
      `Spec: ${procedencia.specDir} — ${procedencia.domains.join(", ")} ` +
        "(los requisitos que este ticket cubre están en su Solicitud original)",
    );
  }
  return lineas.join("\n");
}
