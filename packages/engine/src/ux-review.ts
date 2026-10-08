/**
 * La revisión de UX de un cambio con pantallas, como evidencia del ticket.
 *
 * El diseño se apoya en UI UX Pro Max y la revisión en Impeccable, pero solo si una persona dejó
 * habilitada la skill (R-SKILL-002): esta revisión no descarga, no instala ni habilita nada, y dice
 * en qué estado está cada una. Es evidencia, no un gate: ningún hallazgo hace fallar la revisión.
 *
 * La referencia de una evidencia solo admite `commit:` o `worktree:sha256:`, así que la ruta del
 * informe de Impeccable va en la descripción y no en la referencia.
 */
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { EXIT_REFERENCE, fail } from "@valmen/core";

import { addEvidence } from "./append.js";
import type { RegistryPaths } from "./discovery.js";
import { pendingChanges } from "./diff.js";
import { estadoDeSkillsExternas } from "./external-skills.js";
import { isUiFile, scanPendingColors } from "./presentation.js";

/** Las skills de terceros que apoyan la UX: una para diseñar y otra para revisar. */
export const SKILLS_DE_UX = {
  diseno: "ui-ux-pro-max",
  revision: "impeccable",
} as const;

export interface RevisarUxRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  /** El informe de Impeccable, ya guardado junto al ticket. */
  readonly informe?: string | undefined;
  readonly staged?: boolean | undefined;
  readonly now?: (() => Date) | undefined;
}

export interface RevisionUx {
  /** `false` cuando el cambio no toca pantallas: no se escribe nada. */
  readonly conPantallas: boolean;
  readonly archivos: readonly string[];
  readonly colores: number;
  readonly skills: readonly { readonly id: string; readonly estado: string; readonly motivo: string }[];
  readonly descripcion: string;
  readonly evidencia: string | null;
}

export function revisarUx(request: RevisarUxRequest): RevisionUx {
  const { paths } = request;
  if (request.informe !== undefined) {
    const ruta = isAbsolute(request.informe) ? request.informe : join(paths.root, request.informe);
    if (!existsSync(ruta)) fail(`El informe de Impeccable no existe: ${request.informe}.`, EXIT_REFERENCE);
  }
  const staged = request.staged === true;
  const archivos = pendingChanges(paths.root, staged).files.filter(isUiFile);
  if (archivos.length === 0) {
    return {
      conPantallas: false,
      archivos: [],
      colores: 0,
      skills: [],
      descripcion: "El cambio no toca archivos de interfaz: no hay pantallas que revisar.",
      evidencia: null,
    };
  }

  const colores = scanPendingColors(paths.root, staged).findings.length;
  const estados = estadoDeSkillsExternas(paths.root);
  const skills = Object.values(SKILLS_DE_UX).map((id) => {
    const skill = estados.find((candidata) => candidata.id === id);
    return skill === undefined
      ? { id, estado: "no declarada", motivo: "el proyecto no la declara en external-skills" }
      : { id, estado: skill.estado, motivo: skill.motivo };
  });

  const descripcion =
    `Revisión de UX de ${archivos.length} archivo(s) de interfaz (${archivos.join(", ")}); ` +
    `${colores} color(es) fijo(s). Skills: ` +
    skills.map((s) => `${s.id} ${s.estado} (${s.motivo})`).join("; ") +
    `. ${request.informe === undefined ? "Sin informe de Impeccable." : `Informe de Impeccable: ${request.informe}.`}`;

  const evidencia = addEvidence({
    paths,
    ticketId: request.ticketId,
    kind: "ux-review",
    description: descripcion,
    now: request.now,
  });

  return { conPantallas: true, archivos, colores, skills, descripcion, evidencia };
}
