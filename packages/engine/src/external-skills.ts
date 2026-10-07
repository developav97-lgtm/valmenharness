/**
 * El estado de las skills de terceros que un proyecto declara (R-SKILL-001).
 *
 * Solo lee la configuración: declarar una skill no la descarga, no la instala y no la habilita. La
 * habilitación exige una revisión de una persona, que es de otro ticket; mientras no exista, toda
 * skill declarada queda «declarada».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type ExternalSkill, parseConfig, readExternalSkills } from "@valmen/adapter";

export type EstadoDeSkillExterna = "declarada";

export interface SkillExternaConEstado extends ExternalSkill {
  readonly estado: EstadoDeSkillExterna;
}

/** Las skills externas declaradas, con su estado. Lanza con el nombre de la skill si una declaración no vale. */
export function estadoDeSkillsExternas(root: string): SkillExternaConEstado[] {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return [];
  }
  return readExternalSkills(parseConfig(texto)).map((skill) => ({ ...skill, estado: "declarada" as const }));
}
