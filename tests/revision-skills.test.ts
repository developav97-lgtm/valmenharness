/**
 * La revisión de una skill de terceros y su habilitación (R-SKILL-002).
 *
 * Una skill solo queda habilitada si una persona revisó el hash exacto del contenido que está en el
 * disco; si ese contenido cambia después, se deshabilita sola y el estado dice por qué. Se afirma
 * también lo que la revisión no puede ser: de una sesión desatendida, sin frase o sin permisos,
 * ni sobre algo distinto de lo declarado.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { skillsExternalCommand, skillsReviewCommand } from "../packages/cli/src/commands.js";
import {
  estadoDeSkillsExternas,
  externalSkillReviewsPath,
  hashDeContenidoDeSkill,
  leerRevisionesDeSkills,
  registrarRevisionDeSkill,
} from "../packages/engine/src/index.js";

const AHORA = new Date("2026-10-07T08:00:00.000Z");
let root: string;
let dir: string;

/** El hash que declara el proyecto para el contenido que se coloca en el disco. */
function declarar(contenido: Record<string, string>, extra: { version?: string } = {}): string {
  mkdirSync(dir, { recursive: true });
  for (const [ruta, texto] of Object.entries(contenido)) {
    mkdirSync(join(dir, ...ruta.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, ...ruta.split("/")), texto, "utf8");
  }
  const hash = hashDeContenidoDeSkill(dir)!;
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    ["name: Demo", "external-skills:", "  - id: ponytail", "    source: https://github.com/mikrammullah/PonyTail", `    version: ${extra.version ?? "v1.2.0"}`, `    sha256: ${hash}`, ""].join("\n"),
    "utf8",
  );
  return hash;
}

const revisar = (extra: Partial<Parameters<typeof registrarRevisionDeSkill>[0]> = {}) =>
  registrarRevisionDeSkill({ root, id: "ponytail", actor: "Juan Andrade", quote: "Revisé el contenido y no usa red", permissions: "ninguno", ahora: AHORA, env: {}, ...extra });
const estado = () => estadoDeSkillsExternas(root)[0]!;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-rev-skills-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  dir = join(root, ".valmen", "external-skills", "ponytail");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("el estado de una skill", () => {
  it("sin contenido está solo declarada y no se puede revisar", () => {
    writeFileSync(join(root, ".valmen", "config.yaml"), ["name: Demo", "external-skills:", "  - id: ponytail", "    source: x", "    version: v1", `    sha256: ${"a".repeat(64)}`, ""].join("\n"), "utf8");
    expect(estado()).toMatchObject({ estado: "declarada" });
    expect(estado().motivo).toContain("no hay contenido");
    expect(() => revisar()).toThrow(/no hay nada que revisar/);
  });

  it("con contenido y sin revisión no queda habilitada", () => {
    declarar({ "SKILL.md": "# ponytail\n" });
    expect(estado()).toMatchObject({ estado: "sin-revisión" });
  });

  it("una revisión de una persona sobre el hash declarado la habilita", () => {
    const hash = declarar({ "SKILL.md": "# ponytail\n", "reglas/min.md": "menos código\n" });
    const r = revisar();
    expect(r).toMatchObject({ id: "ponytail", skillVersion: "v1.2.0", sha256: hash, actor: "Juan Andrade", quote: "Revisé el contenido y no usa red", permissions: "ninguno" });
    expect(estado()).toMatchObject({ estado: "habilitada" });
    expect(estado().motivo).toContain("Juan Andrade");
    expect(leerRevisionesDeSkills(root)).toHaveLength(1);
  });

  it("si el contenido cambia después de la revisión, se deshabilita y dice por qué", () => {
    declarar({ "SKILL.md": "# ponytail\n" });
    revisar();
    writeFileSync(join(dir, "SKILL.md"), "# ponytail\nahora hace otra cosa\n", "utf8");
    expect(estado()).toMatchObject({ estado: "deshabilitada" });
    expect(estado().motivo).toMatch(/cambió después de la revisión de Juan Andrade/);
    // Un archivo agregado también cuenta.
    writeFileSync(join(dir, "SKILL.md"), "# ponytail\n", "utf8");
    expect(estado().estado).toBe("habilitada");
    writeFileSync(join(dir, "extra.sh"), "curl http://malo\n", "utf8");
    expect(estado().estado).toBe("deshabilitada");
  });

  it("si cambia la versión declarada, la revisión no alcanza", () => {
    declarar({ "SKILL.md": "# ponytail\n" });
    revisar();
    declarar({ "SKILL.md": "# ponytail\n" }, { version: "v1.3.0" });
    expect(estado()).toMatchObject({ estado: "sin-revisión" });
    expect(estado().motivo).toContain("v1.2.0");
  });

  it("contenido distinto del hash declarado queda deshabilitado y no se revisa", () => {
    declarar({ "SKILL.md": "# ponytail\n" });
    writeFileSync(join(dir, "SKILL.md"), "otra cosa\n", "utf8");
    expect(estado()).toMatchObject({ estado: "deshabilitada" });
    expect(estado().motivo).toMatch(/no coincide con el sha256 declarado/);
    expect(() => revisar()).toThrow(/no se revisa algo distinto de lo declarado/);
    expect(leerRevisionesDeSkills(root)).toHaveLength(0);
  });
});

describe("quién puede revisar", () => {
  beforeEach(() => declarar({ "SKILL.md": "# ponytail\n" }));

  it("una sesión desatendida no puede", () => {
    expect(() => revisar({ env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    expect(leerRevisionesDeSkills(root)).toHaveLength(0);
  });

  it("sin responsable, sin frase o sin permisos se rechaza", () => {
    expect(() => revisar({ actor: " " })).toThrow(/responsable/);
    expect(() => revisar({ quote: "" })).toThrow(/frase literal/);
    expect(() => revisar({ permissions: "  " })).toThrow(/permisos/);
    expect(() => revisar({ id: "otra" })).toThrow(/no está declarada/);
    expect(leerRevisionesDeSkills(root)).toHaveLength(0);
  });

  it("el CLI lo hace y un renglón truncado del registro no borra las revisiones", () => {
    const r = skillsReviewCommand(root, "ponytail", { actor: "Juan Andrade", quote: "Revisado", permissions: "lee archivos del proyecto" }, { ahora: AHORA, env: {} });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Permisos: lee archivos del proyecto");
    appendFileSync(externalSkillReviewsPath(root), '{"kind":"external-skill-rev', "utf8");
    expect(leerRevisionesDeSkills(root)).toHaveLength(1);
    const lista = skillsExternalCommand(root);
    expect(lista.stdout).toContain("ponytail · habilitada");
    expect(skillsReviewCommand(root, undefined, {}).exitCode).not.toBe(0);
    expect(skillsReviewCommand(root, "ponytail", { actor: "x", quote: "y", permissions: "z" }, { env: { VALMEN_UNATTENDED: "1" } }).exitCode).not.toBe(0);
  });
});

describe("el hash del directorio", () => {
  const nuevo = (): string => mkdtempSync(join(tmpdir(), "valmen-hash-"));

  it("es estable y cubre rutas y bytes, sin contar .git ni seguir enlaces", () => {
    const a = nuevo();
    const b = nuevo();
    try {
      for (const d of [a, b]) {
        mkdirSync(join(d, "sub"), { recursive: true });
        writeFileSync(join(d, "x.md"), "uno\n");
        writeFileSync(join(d, "sub", "y.md"), "dos\n");
      }
      const base = hashDeContenidoDeSkill(a)!;
      expect(hashDeContenidoDeSkill(b)).toBe(base);
      expect(base).toMatch(/^[0-9a-f]{64}$/);
      // Los bytes cuentan.
      writeFileSync(join(b, "x.md"), "uno!\n");
      expect(hashDeContenidoDeSkill(b)).not.toBe(base);
      writeFileSync(join(b, "x.md"), "uno\n");
      // La ruta cuenta: el mismo contenido en otro archivo cambia el hash.
      writeFileSync(join(b, "z.md"), "dos\n");
      expect(hashDeContenidoDeSkill(b)).not.toBe(base);
      rmSync(join(b, "z.md"));
      // .git y los enlaces simbólicos no cuentan.
      mkdirSync(join(b, ".git"));
      writeFileSync(join(b, ".git", "HEAD"), "ref\n");
      symlinkSync("/etc/hosts", join(b, "enlace"));
      expect(hashDeContenidoDeSkill(b)).toBe(base);
      expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64);
      expect(hashDeContenidoDeSkill(join(a, "no-existe"))).toBeNull();
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
