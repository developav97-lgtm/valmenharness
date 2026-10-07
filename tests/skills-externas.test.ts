/**
 * Skills de terceros declaradas por proyecto (R-SKILL-001).
 *
 * Una skill ajena corre con los permisos del agente, así que la declaración exige procedencia y una
 * versión fijada. Declarar no instala, no descarga y no habilita nada: lo que se afirma aquí es lo que
 * se rechaza y que lista y lectura no tocan el disco más que para leer la configuración.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readExternalSkills } from "../packages/adapter/src/index.js";
import { skillsExternalCommand } from "../packages/cli/src/commands.js";
import { estadoDeSkillsExternas } from "../packages/engine/src/index.js";

const HASH = "a".repeat(64);
let root: string;

const yaml = (items: string[]): string => ["name: Demo", "external-skills:", ...items, ""].join("\n");
const item = (campos: Record<string, string | undefined>): string[] => {
  const entradas = Object.entries(campos).filter(([, v]) => v !== undefined);
  return entradas.map(([k, v], i) => `  ${i === 0 ? "- " : "  "}${k}: ${v}`);
};
const leer = (items: string[]) => readExternalSkills(parseConfig(yaml(items)));
const buena = { id: "ponytail", source: "https://github.com/mikrammullah/PonyTail", version: "v1.2.0", sha256: HASH };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-skills-ext-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("una declaración válida", () => {
  it("se lee con su fuente, versión y hash, y acepta un commit o un tag", () => {
    const [skill] = leer(item(buena));
    expect(skill).toEqual({ id: "ponytail", source: "https://github.com/mikrammullah/PonyTail", version: "v1.2.0", sha256: HASH });
    expect(leer(item({ ...buena, version: "3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39" }))[0]!.version).toHaveLength(40);
    expect(leer(item({ ...buena, sha256: `sha256:${HASH.toUpperCase()}` }))[0]!.sha256).toBe(HASH);
  });

  it("un proyecto sin la clave queda sin skills externas", () => {
    expect(readExternalSkills(parseConfig("name: Demo\n"))).toEqual([]);
    expect(estadoDeSkillsExternas(root)).toEqual([]);
  });
});

describe("lo que se rechaza, con el nombre de la skill", () => {
  it.each(["main", "master", "latest", "HEAD", "develop", "^1.2.0", "~1.2", "1.*", ">=1.0.0"])("la versión «%s» no está fijada", (version) => {
    expect(() => leer(item({ ...buena, version }))).toThrow(new RegExp(`skill ponytail:.*«${version.replace(/[.*+^$()|[\]\\]/g, "\\$&")}».*no está fijada`));
  });

  it("sin versión, sin fuente o sin un hash válido", () => {
    expect(() => leer(item({ ...buena, version: undefined }))).toThrow(/skill ponytail: falta la versión fijada/);
    expect(() => leer(item({ ...buena, source: undefined }))).toThrow(/skill ponytail: falta la fuente/);
    expect(() => leer(item({ ...buena, sha256: undefined }))).toThrow(/skill ponytail: falta el hash/);
    expect(() => leer(item({ ...buena, sha256: "abc123" }))).toThrow(/skill ponytail: falta el hash/);
  });

  it("un identificador duplicado o inválido", () => {
    expect(() => leer([...item(buena), ...item(buena)])).toThrow(/skill ponytail: el id está duplicado/);
    expect(() => leer(item({ ...buena, id: "Con Espacios" }))).toThrow(/identificador en minúsculas/);
  });

  it("algo que no es una lista de mapas", () => {
    expect(() => readExternalSkills(parseConfig("external-skills: uno\n"))).toThrow(/debe ser una lista/);
    expect(() => readExternalSkills(parseConfig("external-skills:\n  - uno\n"))).toThrow(/debe ser un mapa/);
  });
});

describe("declarar no instala nada", () => {
  it("el estado y el comando solo leen: toda skill queda «declarada» y el disco no cambia", () => {
    writeFileSync(join(root, ".valmen", "config.yaml"), yaml(item(buena)), "utf8");
    const antes = readdirSync(root, { recursive: true }).sort();
    const estado = estadoDeSkillsExternas(root);
    expect(estado).toEqual([{ ...buena, estado: "declarada" }]);
    const r = skillsExternalCommand(root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ponytail · declarada · versión v1.2.0");
    expect(r.stdout).toContain("no instala ni habilita nada");
    expect(readdirSync(root, { recursive: true }).sort()).toEqual(antes);
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, ".valmen", "skills"))).toBe(false);
  });

  it("el comando dice el nombre de la skill cuando la declaración no vale y avisa si no hay ninguna", () => {
    expect(skillsExternalCommand(root).stdout).toContain("No hay skills de terceros declaradas");
    writeFileSync(join(root, ".valmen", "config.yaml"), yaml(item({ ...buena, version: "latest" })), "utf8");
    const r = skillsExternalCommand(root);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("skill ponytail");
  });
});
