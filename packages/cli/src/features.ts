/**
 * Los comandos de features.
 *
 * Viven aparte de `commands.ts` porque son un registro distinto del de tickets:
 * otro directorio, otro frontmatter, otra máquina de estados. Mezclarlos en el
 * mismo archivo haría que cada uno leyera las constantes del otro.
 *
 * `valmen feature new|show|list` es la mitad barata de la fase 5: el registro en
 * disco. La descomposición —`tickets.yaml`, la compuerta de cobertura— es un
 * comando aparte, porque cuesta una llamada a un modelo y este no.
 */
import { EXIT_SCHEMA, toFailure } from "@valmen/core";
import { architectRoutingFor } from "@valmen/adapter";
import { callChat } from "@valmen/credentials";
import {
  type FeatureRow,
  ESQUEMA_DESCOMPOSICION,
  SISTEMA_DESCOMPOSICION,
  advanceFeature,
  attachFeatureAsset,
  attachTicketToFeature,
  completeFeature,
  externalLinkWarnings,
  listFeatureAssets,
  choosePaths,
  createFeature,
  decomposeFeature,
  decompositionPrompt,
  detachTicketFromFeature,
  listFeatures,
  readFeature,
  renderAttachedTicket,
  renderDecomposition,
  writeFeatureVerify,
} from "@valmen/engine";

import { type CommandResult, materializeCommand } from "./commands.js";

/** Escribe en stdout y termina con éxito. */
function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** Falla con el mensaje y el código que corresponde. */
function error(stderr: string, exitCode: number): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/** Los artefactos presentes, en una palabra, para la columna de la lista. */
function progreso(row: FeatureRow): string {
  const marcas = [
    ["spec", row.artifacts.hasSpec],
    ["diseño", row.artifacts.hasDesign],
    ["tickets", row.artifacts.hasDecomposition],
    ["verificación", row.artifacts.hasVerify],
    ["adjuntos", row.artifacts.hasAssets],
  ] as const;
  const hechos = marcas.filter(([, hecho]) => hecho).map(([nombre]) => nombre);
  return hechos.length === 0 ? "—" : hechos.join(", ");
}

/**
 * `feature list`: las features del proyecto.
 *
 * Una feature que no valida **no se esconde**: se lista con su error. Ocultarla
 * dejaría un proyecto con una carpeta que nadie ve y un comando que dice que no
 * hay nada, que es la peor combinación posible.
 */
export function featureList(root: string): CommandResult {
  let filas: FeatureRow[];
  try {
    filas = listFeatures(root);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  if (filas.length === 0) {
    return ok("No hay features. Creá una con: valmen feature new <slug> --title <t>\n");
  }

  const ancho = Math.max(...filas.map((fila) => fila.id.length), 2);
  const lineas: string[] = [];
  for (const fila of filas) {
    if (fila.invalid !== null) {
      lineas.push(`${fila.id.padEnd(ancho)} | inválida | ${fila.invalid}`);
      continue;
    }
    lineas.push(
      `${fila.id.padEnd(ancho)} | ${fila.state} | ${progreso(fila)} | ${fila.title}`,
    );
  }
  return ok(lineas.join("\n") + "\n");
}

/** `feature show`: el brief y dónde vive cada artefacto. */
export function featureShow(root: string, slug: string | undefined): CommandResult {
  if (slug === undefined) {
    return error("feature show requiere un slug.", EXIT_SCHEMA);
  }

  let leida;
  try {
    leida = readFeature(root, slug);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  if (leida === null) {
    return error(`No existe la feature "${slug}" en .valmen/features/.`, EXIT_SCHEMA);
  }

  const { row, text } = leida;
  if (row.invalid !== null) {
    // El texto se imprime igual: quien va a arreglarlo necesita verlo, y el
    // error dice qué está mal.
    return error(`${row.invalid}\n`, EXIT_SCHEMA);
  }

  const carpeta = `.valmen/features/${slug}`;
  // El brief siempre está: es el archivo que se acaba de leer. Los demás pueden
  // faltar, y decir cuáles faltan es la mitad del valor de `show`.
  const rutas = [
    ["brief", `${carpeta}/feature.md`, true],
    ["spec", `${carpeta}/spec/<dominio>/spec.md`, row.artifacts.hasSpec],
    ["diseño", `${carpeta}/design.md`, row.artifacts.hasDesign],
    ["tickets", `${carpeta}/tickets.yaml`, row.artifacts.hasDecomposition],
    ["verificación", `${carpeta}/verify.md`, row.artifacts.hasVerify],
    ["adjuntos", `${carpeta}/assets/manifest.json`, row.artifacts.hasAssets],
  ] as const;

  const cabecera = [
    `${row.id} — ${row.title}`,
    `estado: ${row.state}`,
    `creada: ${row.created} · actualizada: ${row.updated}`,
    "artefactos:",
    ...rutas.map(([nombre, ruta, hecho]) => `  ${hecho ? "✓" : "·"} ${ruta}  (${nombre})`),
  ].join("\n");

  let avisos = "";
  try {
    const lista = externalLinkWarnings(root, slug);
    if (lista.length > 0) avisos = `\nAvisos:\n${lista.map((a) => `  ! ${a}`).join("\n")}\n`;
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  return ok(`${cabecera}\n\n${text.trimEnd()}\n${avisos}`);
}

/**
 * `feature advance <slug> --to <estado>`: mueve el estado de la feature.
 *
 * Existía `advanceFeature` en el motor y nada lo exponía: la corrida de
 * precarga-catalogos lo llamó con un script de node. `--to complete` pasa por la
 * comprobación de cierre (verify.md y tickets cerrados), no por el avance a secas.
 */
function featureAdvance(
  root: string,
  slug: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (slug === undefined || slug === "") {
    return error("feature advance requiere la feature: valmen feature advance <slug> --to <estado>.", EXIT_SCHEMA);
  }
  const destino = flags["to"];
  if (typeof destino !== "string" || destino.trim() === "") {
    return error("feature advance requiere --to <estado>.", EXIT_SCHEMA);
  }
  try {
    const paths = choosePaths(root);
    const fila =
      destino.trim() === "complete"
        ? completeFeature({ paths, slug, allowPendingPo: flags["pendientes-del-po"] === true })
        : advanceFeature({ root, slug, to: destino.trim() });
    const via = fila.via === undefined || fila.via.length === 0 ? "" : ` (pasó por ${fila.via.join(", ")})`;
    return ok(`Feature ${slug}: ${fila.state}${via}.\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `feature verify <slug> [--rewrite]`: escribe verify.md desde el registro de tickets. */
function featureVerify(
  root: string,
  slug: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (slug === undefined || slug === "") {
    return error("feature verify requiere la feature: valmen feature verify <slug>.", EXIT_SCHEMA);
  }
  try {
    const ruta = writeFeatureVerify({
      paths: choosePaths(root),
      slug,
      rewrite: flags["rewrite"] === true,
    });
    return ok(`verify.md escrito: ${ruta}\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `feature asset add|list <slug>`: los adjuntos de una feature.
 *
 * `add` copia el archivo que se le da; nunca baja un enlace. Un diseño que solo
 * existe en un artefacto privado se exporta primero y se anexa el archivo, con
 * `--origin-url` para dejar de dónde salió.
 */
function featureAsset(
  root: string,
  accion: string | undefined,
  slug: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (slug === undefined || slug === "") {
    return error(
      "feature asset requiere la feature: valmen feature asset add|list <slug>.",
      EXIT_SCHEMA,
    );
  }
  const texto = (nombre: string): string | undefined => {
    const valor = flags[nombre];
    return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
  };
  try {
    if (accion === "list") {
      const lista = listFeatureAssets(root, slug);
      const avisos = externalLinkWarnings(root, slug);
      const cuerpo =
        lista.length === 0
          ? `La feature ${slug} no tiene adjuntos.\n`
          : lista
              .map(
                (a) =>
                  `${a.path} | ${a.kind} | ${a.bytes} bytes | sha256 ${a.sha256.slice(0, 12)}… | ` +
                  `${a.description}${a.originUrl === null ? "" : ` | origen ${a.originUrl}`}`,
              )
              .join("\n") + "\n";
      return ok(cuerpo + avisos.map((a) => `! ${a}\n`).join(""));
    }
    if (accion === "add") {
      const archivo = texto("file");
      if (archivo === undefined) return error("feature asset add requiere --file <ruta>.", EXIT_SCHEMA);
      const resultado = attachFeatureAsset({
        root,
        slug,
        source: archivo,
        name: texto("name"),
        description: texto("description") ?? "",
        originUrl: texto("origin-url"),
      });
      const { asset } = resultado;
      return ok(
        resultado.alreadyPresent
          ? `${asset.path} ya estaba en ${slug} con el mismo contenido: no se escribió nada.\n`
          : `Adjunto anexado: .valmen/features/${slug}/${asset.path} (${asset.kind}, ` +
              `${asset.bytes} bytes, sha256 ${asset.sha256}).\n`,
      );
    }
    return error("feature asset requiere add o list.", EXIT_SCHEMA);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `feature new`: crea el brief en `draft`.
 *
 * El título es obligatorio y se pide explícito: derivarlo del slug produce
 * títulos como «Modulo inventario» que después nadie corrige.
 */
export function featureNew(
  root: string,
  slug: string | undefined,
  title: string | undefined,
): CommandResult {
  if (slug === undefined) {
    return error("feature new requiere un slug.", EXIT_SCHEMA);
  }
  if (title === undefined || title.trim() === "") {
    return error("feature new requiere --title.", EXIT_SCHEMA);
  }

  try {
    return ok(createFeature({ root, id: slug, title }) + "\n");
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `feature decompose`: el grafo de tickets, propuesto por el modelo `architect`.
 *
 * Es el único comando del CLI que le pide a un modelo que **escriba** un artefacto
 * del registro, así que es el que más comprueba: los requisitos salen de la spec
 * y no del modelo, la respuesta se reescribe desde la estructura validada, y el
 * `tickets.yaml` resultante se relee con el mismo parser que leería un archivo
 * escrito a mano. Si algo no cuadra, no se escribe nada.
 *
 * El modelo es el del rol `architect` del routing, y es **a propósito** distinto
 * del que evalúa los gates: un modelo revisándose a sí mismo no revisa nada.
 */
export async function featureDecompose(
  root: string,
  slug: string | undefined,
  flags: Readonly<Record<string, string | true>>,
  apiKey?: string | undefined,
): Promise<CommandResult> {
  if (slug === undefined) {
    return error("feature decompose requiere un slug.", EXIT_SCHEMA);
  }

  const routing = architectRoutingFor(root);
  if (routing.model === "") {
    return error(
      "No hay modelo para el rol architect. Configúralo en Mission Control " +
        "(Routing de modelos) o en .valmen/routing.yaml.",
      EXIT_SCHEMA,
    );
  }

  const dryRun = flags["dry-run"] === true;
  const rawModel = flags["model"];
  const modelo = typeof rawModel === "string" ? rawModel : routing.model;
  const rawProvider = flags["provider"];
  const proveedor = typeof rawProvider === "string" ? rawProvider : routing.provider;

  try {
    const resultado = await decomposeFeature({
      root,
      slug,
      write: !dryRun,
      callModel: async (entrada) => {
        const respuesta = await callChat({
          provider: proveedor,
          model: modelo,
          // La clave llega resuelta desde quien arrancó el proceso —el CLI o el
          // servidor MCP—, que es el único que sabe con qué archivo de
          // credenciales se lanzó. Sin ella, `callChat` resuelve por su cuenta.
          ...(apiKey === undefined ? {} : { apiKey }),
          // El presupuesto de salida es generoso a propósito: un modelo que
          // razona gasta tokens pensando **antes** de escribir, y con un límite
          // bajo devuelve contenido vacío con HTTP 200. Medido con K3.
          maxTokens: 16_000,
          // Y el de tiempo también: el tope por defecto de una llamada son 90
          // segundos, que alcanzan para una pregunta y no para esto —un grafo con
          // sus sprints, sus dependencias y su cobertura, razonado a esfuerzo
          // alto—. Se corta a los cinco minutos en vez de a los noventa.
          timeoutMs: TIMEOUT_DESCOMPOSICION_MS,
          effort: routing.effort,
          messages: [
            { role: "system", content: SISTEMA_DESCOMPOSICION },
            { role: "user", content: decompositionPrompt(entrada) },
          ],
          structured: {
            name: "feature_decomposition",
            description: "El grafo de tickets de la feature.",
            schema: ESQUEMA_DESCOMPOSICION,
          },
        });
        return {
          proposal: JSON.parse(respuesta.content) as unknown,
          decomposer: {
            provider: proveedor,
            model: respuesta.model,
            ...(respuesta.usage.costUsd === null
              ? {}
              : { costUsd: respuesta.usage.costUsd }),
          },
        };
      },
    });

    if (!dryRun) {
      advanceFeature({ root, slug, to: "decomposed" });
    }
    return ok(renderDecomposition(resultado));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `feature attach <slug> --ticket <ID> [--sprint S6] [--goal "…"]`.
 *
 * Mete en el grafo de la feature un ticket que ya existe. Es lo que permite que
 * los hallazgos que desbordan un ticket sigan siendo parte del conjunto en vez de
 * quedar en un ticket suelto que no aparece en el tablero ni conoce la spec.
 */
function attachCommand(
  paths: ReturnType<typeof choosePaths>,
  slug: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (slug === "") {
    return error(
      "feature attach requiere la feature: valmen feature attach <slug> --ticket <ID>.",
      EXIT_SCHEMA,
    );
  }
  const ticket = flags["ticket"];
  if (typeof ticket !== "string" || ticket.trim() === "") {
    return error("feature attach requiere --ticket <ID>.", EXIT_SCHEMA);
  }

  const texto = (nombre: string): string | undefined => {
    const valor = flags[nombre];
    return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
  };
  const dependencias = texto("depends-on");

  try {
    const resultado = attachTicketToFeature({
      paths,
      slug,
      ticketId: ticket.trim(),
      sprint: texto("sprint"),
      goal: texto("goal"),
      title: texto("title"),
      ...(dependencias === undefined
        ? {}
        : {
            dependsOn: dependencias
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id !== ""),
          }),
    });
    return ok(renderAttachedTicket(resultado));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `feature detach <slug> --ticket <ID>`: lo saca del grafo, sin tocarlo. */
function detachCommand(
  paths: ReturnType<typeof choosePaths>,
  slug: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (slug === "") {
    return error(
      "feature detach requiere la feature: valmen feature detach <slug> --ticket <ID>.",
      EXIT_SCHEMA,
    );
  }
  const ticket = flags["ticket"];
  if (typeof ticket !== "string" || ticket.trim() === "") {
    return error("feature detach requiere --ticket <ID>.", EXIT_SCHEMA);
  }
  try {
    const resultado = detachTicketFromFeature({ paths, slug, ticketId: ticket.trim() });
    return ok(
      `${resultado.ticketId} salió del grafo de ${resultado.slug} (estaba en ` +
        `${resultado.sprint}). El ticket sigue en el registro: esto no lo toca.\n`,
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `feature <subcomando>`: el despachador.
 *
 * Se despacha aquí y no en el `switch` de `main.ts` porque la forma es
 * `feature <sub> [args]`, y meterlo en el switch obligaría a que `main.ts`
 * supiera de features. Es asíncrono porque `decompose` habla con un proveedor.
 */
/**
 * Cuánto se espera a que el arquitecto escriba el grafo.
 *
 * Una descomposición no es una pregunta: el modelo razona, reparte requisitos en
 * tickets, decide dependencias y escribe la cobertura. El tope por defecto de una
 * llamada —90 segundos— se queda corto con un modelo que piensa a esfuerzo alto, y
 * el fallo se ve como un timeout que parece un problema del proveedor.
 */
const TIMEOUT_DESCOMPOSICION_MS = 300_000;

export async function runFeature(
  root: string,
  args: readonly string[],
  flags: Readonly<Record<string, string | true>>,
): Promise<CommandResult> {
  const [sub, ...resto] = args;
  const rawTitle = flags["title"];
  const title = typeof rawTitle === "string" ? rawTitle : undefined;

  switch (sub) {
    case "list":
      return featureList(root);
    case "show":
      return featureShow(root, resto[0]);
    case "new":
      return featureNew(root, resto[0], title);
    case "decompose":
      return featureDecompose(root, resto[0], flags);
    case "materialize":
    case "materializar":
      return materializeCommand(choosePaths(root), resto[0] ?? "", flags);
    case "attach":
    case "anexar":
      return attachCommand(choosePaths(root), resto[0] ?? "", flags);
    case "detach":
    case "desanexar":
      return detachCommand(choosePaths(root), resto[0] ?? "", flags);
    case "advance":
    case "avanzar":
      return featureAdvance(root, resto[0], flags);
    case "verify":
    case "verificar":
      return featureVerify(root, resto[0], flags);
    case "asset":
    case "adjunto":
      return featureAsset(root, resto[0], resto[1], flags);
    case undefined:
      return error(
        "feature requiere un subcomando: new, show, list, decompose, materialize, " +
          "attach, detach, asset, advance o verify.",
        EXIT_SCHEMA,
      );
    default:
      return error(
        `Subcomando de feature desconocido: ${sub}. Use new, show, list, decompose, ` +
          "materialize, attach, detach, asset, advance o verify.",
        EXIT_SCHEMA,
      );
  }
}
