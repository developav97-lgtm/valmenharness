/**
 * El estado de las skills de terceros que un proyecto declara (R-SKILL-001 y R-SKILL-002).
 *
 * Declarar una skill no la descarga, no la instala y no la habilita: el contenido lo coloca una
 * persona en `.valmen/external-skills/<id>/`. Una skill solo queda **habilitada** si una persona
 * registró su revisión sobre el hash exacto de ese contenido; si el contenido cambia después, la
 * revisión deja de valer sin que nadie tenga que acordarse. El registro de revisiones es
 * append-only y solo lo escribe una sesión atendida.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { type ExternalSkill, parseConfig, readExternalSkills } from "@valmen/adapter";
import { EXIT_INVARIANT, EXIT_SCHEMA, fail } from "@valmen/core";

import { assertSesionAtendida } from "./plan-approval.js";

export type EstadoDeSkillExterna = "declarada" | "sin-revisión" | "habilitada" | "deshabilitada";

export interface SkillExternaConEstado extends ExternalSkill {
  readonly estado: EstadoDeSkillExterna;
  /** Por qué está en ese estado. */
  readonly motivo: string;
}

export interface RevisionDeSkill {
  readonly kind: "external-skill-review";
  readonly version: 1;
  readonly id: string;
  /** La versión declarada que se revisó. */
  readonly skillVersion: string;
  /** El hash del contenido que se revisó. */
  readonly sha256: string;
  readonly actor: string;
  /** La frase literal de quien revisó. */
  readonly quote: string;
  /** Los permisos que la skill usa, tal como los declaró quien revisó. */
  readonly permissions: string;
  readonly reviewedAt: string;
}

export function externalSkillsDir(root: string): string {
  return join(root, ".valmen", "external-skills");
}

export function externalSkillReviewsPath(root: string): string {
  return join(externalSkillsDir(root), "reviews.jsonl");
}

/**
 * El hash del contenido de una skill: sobre las rutas relativas ordenadas (separador POSIX) y los
 * bytes de cada archivo regular. No sigue enlaces simbólicos ni cuenta `.git`, y no depende de la
 * metadata del sistema de archivos. `null` si el directorio no existe o no tiene archivos.
 */
export function hashDeContenidoDeSkill(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const archivos: string[] = [];
  const recorrer = (actual: string, prefijo: string): void => {
    for (const nombre of readdirSync(actual).sort()) {
      if (nombre === ".git") continue;
      const ruta = join(actual, nombre);
      const rel = prefijo === "" ? nombre : `${prefijo}/${nombre}`;
      const info = lstatSync(ruta);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) recorrer(ruta, rel);
      else if (info.isFile()) archivos.push(rel);
    }
  };
  recorrer(dir, "");
  if (archivos.length === 0) return null;
  const global = createHash("sha256");
  for (const rel of archivos.sort()) {
    const contenido = createHash("sha256").update(readFileSync(join(dir, ...rel.split("/")))).digest("hex");
    global.update(`${rel}\0${contenido}\n`, "utf8");
  }
  return global.digest("hex");
}

/** Las revisiones registradas, de la más antigua a la más reciente. */
export function leerRevisionesDeSkills(root: string): RevisionDeSkill[] {
  const ruta = externalSkillReviewsPath(root);
  if (!existsSync(ruta)) return [];
  const lista: RevisionDeSkill[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const v = JSON.parse(linea) as RevisionDeSkill;
      if (v.kind === "external-skill-review") lista.push(v);
    } catch {
      // Un renglón truncado no borra los anteriores.
    }
  }
  return lista;
}

function declaradas(root: string): readonly ExternalSkill[] {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return [];
  }
  return readExternalSkills(parseConfig(texto));
}

/**
 * El estado de cada skill declarada. Lanza con el nombre de la skill si una declaración no vale.
 *
 * `habilitada` exige contenido presente, una revisión de una persona sobre esa versión y ese hash, y
 * que el contenido siga siendo el revisado y el declarado.
 */
export function estadoDeSkillsExternas(root: string): SkillExternaConEstado[] {
  const revisiones = leerRevisionesDeSkills(root);
  return declaradas(root).map((skill): SkillExternaConEstado => {
    const hash = hashDeContenidoDeSkill(join(externalSkillsDir(root), skill.id));
    if (hash === null) {
      return { ...skill, estado: "declarada", motivo: `no hay contenido en .valmen/external-skills/${skill.id}/` };
    }
    const ultima = [...revisiones].reverse().find((r) => r.id === skill.id);
    if (ultima !== undefined && ultima.sha256 !== hash) {
      return {
        ...skill,
        estado: "deshabilitada",
        motivo: `el contenido cambió después de la revisión de ${ultima.actor} (revisado ${ultima.sha256.slice(0, 12)}…, ahora ${hash.slice(0, 12)}…)`,
      };
    }
    if (hash !== skill.sha256) {
      return {
        ...skill,
        estado: "deshabilitada",
        motivo: `el contenido (${hash.slice(0, 12)}…) no coincide con el sha256 declarado (${skill.sha256.slice(0, 12)}…)`,
      };
    }
    if (ultima === undefined) {
      return { ...skill, estado: "sin-revisión", motivo: "el contenido coincide con lo declarado y aún no lo revisó una persona" };
    }
    if (ultima.skillVersion !== skill.version) {
      return { ...skill, estado: "sin-revisión", motivo: `la revisión es de la versión ${ultima.skillVersion} y la declarada es ${skill.version}` };
    }
    return { ...skill, estado: "habilitada", motivo: `revisada por ${ultima.actor} el ${ultima.reviewedAt.slice(0, 10)}` };
  });
}

export interface RegistrarRevisionRequest {
  readonly root: string;
  readonly id: string;
  readonly actor: string;
  readonly quote: string;
  readonly permissions: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Registra la revisión de una persona sobre el contenido actual de una skill. Solo se puede
 * revisar contenido que ya está en el disco y coincide con el hash declarado.
 */
export function registrarRevisionDeSkill(request: RegistrarRevisionRequest): RevisionDeSkill {
  assertSesionAtendida("registrar la revisión de una skill de terceros", request.env ?? process.env);
  const actor = request.actor.trim();
  const quote = request.quote.trim();
  const permissions = request.permissions.trim();
  if (actor === "") fail("Revisar una skill necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (quote === "") fail("Revisar una skill necesita la frase literal de quien revisa: falta --quote.", EXIT_SCHEMA);
  if (permissions === "") {
    fail("Revisar una skill necesita los permisos que usa: falta --permissions (escribe «ninguno» si no usa ninguno).", EXIT_SCHEMA);
  }
  const skill = declaradas(request.root).find((s) => s.id === request.id);
  if (skill === undefined) fail(`La skill ${request.id} no está declarada en external-skills.`, EXIT_SCHEMA);
  const hash = hashDeContenidoDeSkill(join(externalSkillsDir(request.root), request.id));
  if (hash === null) {
    fail(`La skill ${request.id} no tiene contenido en .valmen/external-skills/${request.id}/: no hay nada que revisar.`, EXIT_INVARIANT);
  }
  if (hash !== skill.sha256) {
    fail(
      `La skill ${request.id}: el contenido (${hash.slice(0, 12)}…) no coincide con el sha256 declarado (${skill.sha256.slice(0, 12)}…); ` +
        "no se revisa algo distinto de lo declarado.",
      EXIT_INVARIANT,
    );
  }
  const revision: RevisionDeSkill = {
    kind: "external-skill-review",
    version: 1,
    id: skill.id,
    skillVersion: skill.version,
    sha256: hash,
    actor,
    quote,
    permissions,
    reviewedAt: (request.ahora ?? new Date()).toISOString(),
  };
  const ruta = externalSkillReviewsPath(request.root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(revision)}\n`, "utf8");
  return revision;
}
