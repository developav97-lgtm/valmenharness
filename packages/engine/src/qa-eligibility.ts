/**
 * La elegibilidad para QA por agente, decidida en código (R-QAAG-002).
 *
 * Cerrar un ticket sin una persona delante solo es seguro si cada condición se **comprueba** y es
 * auditable, no si el agente promete portarse bien. Esta función reúne las seis condiciones en una
 * sola decisión: no consulta a ningún modelo, devuelve **todas** las reglas que no se cumplen con
 * su motivo —no solo la primera— y, si el ticket es elegible, cita la autorización que lo respalda.
 * Decidir que un ticket es elegible no lo cierra ni aprueba nada: solo dice que se puede intentar.
 */
import { parseConfig, readList } from "@valmen/adapter";
import { BLOCKING_POINT_STATES, declaredImpactIds, parseTicket } from "@valmen/core";
import { criterioDeclarado, extractCriteriaSpecs } from "@valmen/gate";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { scanDrift } from "./drift.js";
import { type EjecutorDeGit, ejecutarGitPermitido } from "./integration-rules.js";
import { autorizacionQueCubre, cupoRestante } from "./qa-authorization.js";
import { scanPendingChanges } from "./secrets.js";

/** Los tipos que nunca son elegibles, aunque una autorización los listara. */
export const TIPOS_NUNCA_ELEGIBLES = ["SECURITY", "SYNC", "INTEGRATION", "AGENT"] as const;

/** Las categorías de ruta que el diff de un ticket elegible no puede tocar. */
const CATEGORIAS_DE_RUTA: readonly { readonly nombre: string; readonly patron: RegExp }[] = [
  { nombre: "pantallas", patron: /(^|\/)(templates|FrontEnd|frontend|web|static)\/|\.(html|tsx|jsx|vue|svelte|css|scss)$/i },
  { nombre: "migraciones", patron: /(^|\/)migrations?\/|\.sql$/i },
  { nombre: "configuración de despliegue", patron: /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.dockerignore|nginx[^/]*|k8s|helm|terraform|deploy)(\/|$)/i },
  { nombre: "autenticación", patron: /(^|\/)(auth[^/]*|login[^/]*|permissions?[^/]*|passwords?[^/]*|jwt[^/]*|oauth[^/]*|credentials?[^/]*)(\/|\.|$)/i },
  { nombre: "CI", patron: /(^|\/)(\.github\/workflows|\.gitlab-ci\.ya?ml|\.circleci|azure-pipelines[^/]*|Jenkinsfile)(\/|$)/i },
  { nombre: "el registro y la configuración del harness (.valmen/)", patron: /^\.valmen\// },
];

/** La categoría de una ruta prohibida, o `null` si el diff puede tocarla. */
export function rutaProhibidaParaQaAgente(ruta: string, scriptsDePrueba: readonly string[] = []): string | null {
  const normal = ruta.replace(/^\.\//, "");
  if (scriptsDePrueba.includes(normal)) return "los scripts que corren las pruebas";
  for (const { nombre, patron } of CATEGORIAS_DE_RUTA) if (patron.test(normal)) return nombre;
  return null;
}

/** Los archivos que cambió el commit entregado respecto de la base, por la lista cerrada de git. */
export function archivosDelDiff(root: string, base: string, ejecutor?: EjecutorDeGit): string[] {
  const salida = ejecutarGitPermitido(root, ["diff", "--name-only", `${base}..HEAD`], ejecutor);
  if (salida.status !== 0) throw new Error(`git diff falló: ${salida.stderr.trim()}`);
  return salida.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
}

/** Los scripts que corren las pruebas del proyecto, según `test-commands`. */
function scriptsDePruebaDe(root: string): string[] {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return [];
  }
  const comandos = readList(parseConfig(texto), "test-commands", []);
  const scripts = new Set<string>();
  for (const comando of comandos) {
    for (const palabra of comando.split(/\s+/)) {
      if (/^(\.\/)?[\w./-]+\.(sh|mjs|cjs|js|py|ts)$/.test(palabra)) scripts.add(palabra.replace(/^\.\//, ""));
    }
  }
  return [...scripts];
}

export interface ReglaDeElegibilidad {
  readonly regla: string;
  readonly cumple: boolean;
  readonly detalle: string;
}

export interface ResultadoDeElegibilidad {
  readonly ticketId: string;
  readonly elegible: boolean;
  readonly reglas: readonly ReglaDeElegibilidad[];
  /** La autorización que respalda al ticket, si es elegible. */
  readonly autorizacion: { readonly id: string; readonly hash: string } | null;
}

export interface ElegibilidadRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly ahora?: Date;
  /** Los archivos del diff entregado; lo calcula quien llama (`archivosDelDiff`). */
  readonly archivosDelDiff: readonly string[];
  /** Cuántos secretos hay en el cambio y cuántos hallazgos de drift tiene el ticket; inyectables. */
  readonly secretos?: () => number;
  readonly drift?: () => number;
}

/** Decide si un ticket es elegible para QA por agente. No consulta a ningún modelo. */
export function elegibilidadQa(request: ElegibilidadRequest): ResultadoDeElegibilidad {
  const { paths, ticketId } = request;
  const ahora = request.ahora ?? new Date();
  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) throw new Error(`No existe el ticket ${ticketId}.`);
  const ticket = parseTicket(ubicado.text);
  const { type, module, risk_level: riesgo } = ticket.fields;
  const reglas: ReglaDeElegibilidad[] = [];
  const regla = (nombre: string, cumple: boolean, detalle: string): void => {
    reglas.push({ regla: nombre, cumple, detalle });
  };

  // 1. Una autorización vigente cubre su tipo y su módulo, y queda cupo.
  const autorizacion = autorizacionQueCubre(paths.root, { type, module, riskLevel: "low" }, ahora);
  if (autorizacion === null) {
    regla("autorizacion", false, `ninguna autorización vigente cubre el tipo ${type} y el módulo ${module}`);
  } else {
    const cupo = cupoRestante(paths.root, autorizacion, ahora);
    regla(
      "autorizacion",
      cupo > 0,
      cupo > 0
        ? `la autorización ${autorizacion.id} cubre ${type}/${module} y quedan ${cupo} cupo(s) hoy`
        : `la autorización ${autorizacion.id} agotó su cupo diario (${autorizacion.dailyQuota})`,
    );
  }

  // 2. El tipo nunca es SECURITY, SYNC, INTEGRATION ni AGENT.
  const prohibido = (TIPOS_NUNCA_ELEGIBLES as readonly string[]).includes(type);
  regla("tipo", !prohibido, prohibido ? `el tipo ${type} nunca es elegible, aunque una autorización lo listara` : `el tipo ${type} es elegible`);

  // 3. Riesgo normal o menor, sin impactos de sincronización, migración ni contenedores.
  const impactos = declaredImpactIds(ticket);
  const riesgoOk = riesgo === "low" || riesgo === "normal";
  regla(
    "riesgo-e-impactos",
    riesgoOk && impactos.length === 0,
    !riesgoOk
      ? `el riesgo es ${riesgo} y el máximo elegible es normal`
      : impactos.length > 0
        ? `declara impactos de ${impactos.join(", ")}`
        : `riesgo ${riesgo} y sin impactos`,
  );

  // 4. Todos los criterios se verifican por comando o por petición.
  const criterios = extractCriteriaSpecs(ticket.sections["Criterios de aceptación"] ?? "");
  const noAutomaticos = criterios.filter(
    (c) => !criterioDeclarado(c) || c.manual || c.dev === true || (c.command === null && (c.http === undefined || c.http === "")),
  );
  regla(
    "criterios",
    criterios.length > 0 && noAutomaticos.length === 0,
    criterios.length === 0
      ? "el ticket no declara criterios"
      : noAutomaticos.length > 0
        ? `no se verifican por comando ni por petición: ${noAutomaticos.map((c) => `«${c.text}»`).join("; ")}`
        : `los ${criterios.length} criterio(s) se verifican por comando o petición`,
  );

  // 5. El diff no toca lo que un agente no debe poder cambiar para aprobarse a sí mismo.
  const scripts = scriptsDePruebaDe(paths.root);
  const tocados = request.archivosDelDiff
    .map((archivo) => ({ archivo, categoria: rutaProhibidaParaQaAgente(archivo, scripts) }))
    .filter((t): t is { archivo: string; categoria: string } => t.categoria !== null);
  regla(
    "diff",
    tocados.length === 0,
    tocados.length > 0
      ? `el diff toca ${tocados.map((t) => `${t.archivo} (${t.categoria})`).join(", ")}`
      : `el diff (${request.archivosDelDiff.length} archivo(s)) no toca nada prohibido`,
  );

  // 6. Sin puntos abiertos ni reapertura previa, con secretos y drift limpios.
  const abiertos = (ticket.blocks.Puntos ?? []).filter((p) =>
    (BLOCKING_POINT_STATES as readonly string[]).includes(String(p["status"])),
  );
  regla("puntos", abiertos.length === 0, abiertos.length > 0 ? `tiene puntos abiertos: ${abiertos.map((p) => String(p["id"])).join(", ")}` : "sin puntos abiertos");
  const reabierto =
    (ticket.blocks.QA ?? []).some((q) => q["result"] === "changes_requested" || q["result"] === "failed") ||
    (ticket.blocks.Eventos ?? []).some((e) => /reapertura|changes_requested/i.test(String(e["details"])));
  regla("reapertura", !reabierto, reabierto ? "el ticket ya se reabrió o tuvo cambios solicitados" : "sin reapertura previa");

  let secretos: number | null;
  try {
    secretos = (request.secretos ?? (() => scanPendingChanges(paths.root).findings.length))();
  } catch {
    secretos = null;
  }
  regla(
    "secretos",
    secretos === 0,
    secretos === null ? "no se pudo comprobar `valmen secrets`: se trata como no limpio" : secretos > 0 ? `valmen secrets halla ${secretos} posible(s) secreto(s)` : "valmen secrets limpio",
  );
  let drift: number | null;
  try {
    drift = (request.drift ?? (() => scanDrift(paths, { ticketId }).findings.length))();
  } catch {
    drift = null;
  }
  regla(
    "drift",
    drift === 0,
    drift === null ? "no se pudo comprobar `valmen drift`: se trata como no limpio" : drift > 0 ? `valmen drift halla ${drift} cita(s) que no existen` : "valmen drift limpio",
  );

  const elegible = reglas.every((r) => r.cumple);
  return {
    ticketId,
    elegible,
    reglas,
    autorizacion: elegible && autorizacion !== null ? { id: autorizacion.id, hash: autorizacion.hash } : null,
  };
}
