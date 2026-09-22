/**
 * Las skills del proyecto: lectura, proyección y las trampas del estándar.
 *
 * Una skill no es documentación decorativa: el agente la carga cuando la
 * necesita y actúa según lo que diga. Eso hace que los fallos de este archivo
 * sean de dos tipos, y los dos importan:
 *
 * 1. **La skill no se carga y nadie lo sabe.** Los tres clientes exigen que el
 *    `name` del frontmatter coincida con el nombre del directorio; si no coincide,
 *    la descartan en silencio. Se comprueba al proyectar, que es donde el error
 *    se puede explicar, y no al usarla, que es donde no.
 * 2. **La skill contradice al proyecto.** Por eso las skills no llevan el stack
 *    dentro: sale de `.valmen/rules/stack.md`. Un test afirma que las que se
 *    publican con el harness no nombran tecnologías concretas, porque una skill
 *    que dice «Django» es una skill que miente en el siguiente proyecto.
 *
 * Lo tercero que se prueba es que la proyección sea **determinista y completa**:
 * el mismo `.valmen/skills/` produce los mismos bytes, y las tres rutas que los
 * clientes leen de verdad reciben el archivo.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SKILL_RUNTIMES,
  SKILL_RUNTIME_IDS,
  parseSkill,
  readSkills,
  renderAllSkills,
} from "../packages/adapter/src/skills.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-skills-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Escribe una skill en el proyecto de prueba. */
function escribirSkill(id: string, frontmatter: string, cuerpo: string): void {
  const directorio = join(lab, ".valmen", "skills", id);
  mkdirSync(directorio, { recursive: true });
  writeFileSync(
    join(directorio, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n${cuerpo}\n`,
    "utf8",
  );
}

describe("interpretar una skill", () => {
  it("lee el nombre, la descripción y las instrucciones", () => {
    const skill = parseSkill(
      "mi-skill",
      "---\nname: mi-skill\ndescription: Sirve para algo concreto.\n---\n\nHaz esto.\n",
    );
    expect(skill.id).toBe("mi-skill");
    expect(skill.description).toBe("Sirve para algo concreto.");
    expect(skill.instructions).toBe("Haz esto.");
  });

  it("rechaza una skill cuyo nombre no coincide con su directorio", () => {
    // Es el fallo silencioso que esta validación existe para evitar: los
    // clientes cargan por el directorio y descartan la que no coincide, sin
    // error. Sin esta comprobación, la skill simplemente no existe para el
    // agente y nadie sabe por qué.
    expect(() =>
      parseSkill("planificacion", "---\nname: otra-cosa\ndescription: x\n---\n\nCuerpo.\n"),
    ).toThrow(/Tienen que coincidir/);
  });

  it("rechaza un nombre que incumple el formato del estándar", () => {
    // Mayúsculas, guiones dobles o guion final: el cliente no la carga.
    for (const invalido of ["Mi-Skill", "con--doble", "termina-", "-empieza"]) {
      expect(() =>
        parseSkill(invalido, `---\nname: ${invalido}\ndescription: x\n---\n\nCuerpo.\n`),
      ).toThrow(/formato/);
    }
  });

  it("exige descripción, porque es lo que el agente lee para elegirla", () => {
    expect(() =>
      parseSkill("sin-descripcion", "---\nname: sin-descripcion\n---\n\nCuerpo.\n"),
    ).toThrow(/description/);
  });

  it("exige instrucciones: una skill vacía no aporta nada", () => {
    expect(() => parseSkill("vacia", "---\nname: vacia\ndescription: x\n---\n\n")).toThrow(
      /instrucciones/,
    );
  });

  it("exige frontmatter, que es lo que el cliente busca", () => {
    expect(() => parseSkill("sin-frontmatter", "# Solo un título\n")).toThrow(
      /frontmatter/,
    );
  });
});

describe("leer las skills del proyecto", () => {
  it("devuelve vacío si no hay directorio, sin fallar", () => {
    // Un proyecto adoptado puede no tener skills todavía: eso no es un error.
    expect(readSkills(lab)).toEqual([]);
  });

  it("las ordena por identificador, para que la proyección sea estable", () => {
    escribirSkill("zeta", "name: zeta\ndescription: z", "Z.");
    escribirSkill("alfa", "name: alfa\ndescription: a", "A.");
    expect(readSkills(lab).map((skill) => skill.id)).toEqual(["alfa", "zeta"]);
  });

  it("ignora los archivos sueltos: una skill es un directorio", () => {
    mkdirSync(join(lab, ".valmen", "skills"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "skills", "notas.md"), "no es una skill", "utf8");
    escribirSkill("valida", "name: valida\ndescription: v", "V.");
    expect(readSkills(lab).map((skill) => skill.id)).toEqual(["valida"]);
  });

  it("falla si el directorio existe pero no tiene SKILL.md", () => {
    mkdirSync(join(lab, ".valmen", "skills", "a-medias"), { recursive: true });
    expect(() => readSkills(lab)).toThrow(/no tiene SKILL.md/);
  });
});

describe("proyectar a los runtimes", () => {
  it("escribe en las tres rutas que los clientes leen", () => {
    escribirSkill(
      "planificacion",
      "name: planificacion\ndescription: Planifica.",
      "Pasos.",
    );
    const archivos = renderAllSkills(readSkills(lab));
    const rutas = archivos.map((archivo) => archivo.path).sort();

    expect(rutas).toEqual([
      ".claude/skills/planificacion/SKILL.md",
      ".codex/skills/planificacion/SKILL.md",
      ".opencode/skills/planificacion/SKILL.md",
    ]);
    // Los tres runtimes están declarados en un solo sitio, y ninguna ruta se
    // escribe a mano en el renderizador.
    expect(Object.values(SKILL_RUNTIMES)).toEqual([
      ".opencode/skills",
      ".claude/skills",
      ".codex/skills",
    ]);
    expect(SKILL_RUNTIME_IDS).toHaveLength(3);
  });

  it("mantiene el frontmatter **al principio**, que es lo que el cliente exige", () => {
    // Un encabezado de «generado» delante del frontmatter rompería el archivo:
    // la skill dejaría de cargarse y el motivo estaría en el generador.
    escribirSkill("revision", "name: revision\ndescription: Revisa.", "Revisa esto.");
    const [archivo] = renderAllSkills(readSkills(lab));
    const texto = archivo?.content ?? "";

    expect(texto.startsWith("---\nname: revision\n")).toBe(true);
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(texto);
    expect(frontmatter).not.toBeNull();
    expect((frontmatter as RegExpExecArray)[1]).toContain("description: Revisa.");
  });

  it("deja la marca de generado al final, donde no rompe nada", () => {
    escribirSkill("marca", "name: marca\ndescription: M.", "Cuerpo.");
    const texto = renderAllSkills(readSkills(lab))[0]?.content ?? "";
    expect(texto).toContain("NO EDITAR A MANO");
    expect(texto).toContain(".valmen/skills/marca/SKILL.md");
    // Y el cuerpo está antes de la marca, no después.
    expect(texto.indexOf("Cuerpo.")).toBeLessThan(texto.indexOf("NO EDITAR A MANO"));
  });

  it("es determinista: la misma entrada produce los mismos bytes", () => {
    // Es lo que permite que `sync --check` detecte una edición a mano sin
    // falsos positivos.
    escribirSkill("estable", "name: estable\ndescription: E.", "Igual.");
    const primera = renderAllSkills(readSkills(lab));
    const segunda = renderAllSkills(readSkills(lab));
    expect(JSON.stringify(primera)).toBe(JSON.stringify(segunda));
  });
});

describe("las skills que se publican con el harness", () => {
  const raiz = join(import.meta.dirname, "..");

  it("todas se interpretan sin errores", () => {
    const skills = readSkills(raiz);
    expect(skills.length).toBeGreaterThanOrEqual(6);
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(30);
      expect(skill.instructions.length).toBeGreaterThan(200);
    }
  });

  it("no nombran el stack de un proyecto concreto", () => {
    // La regla que hace que estas skills sirvan en el siguiente proyecto: el
    // stack sale de `.valmen/rules/stack.md`. Una skill que dijera «Django» o
    // «Angular» obligaría a copiarla y editarla en cada adopción, que es
    // exactamente lo que este paquete existe para evitar.
    const tecnologias = [
      "django",
      "angular",
      "postgres",
      "react",
      "spring",
      "rails",
      "laravel",
      "kubernetes",
    ];
    for (const skill of readSkills(raiz)) {
      const texto =
        `${skill.id}\n${skill.description}\n${skill.instructions}`.toLowerCase();
      for (const tecnologia of tecnologias) {
        expect(texto).not.toContain(tecnologia);
      }
    }
  });

  it("mandan leer las reglas del proyecto en vez de suponer el stack", () => {
    const conReglas = readSkills(raiz).filter((skill) =>
      skill.instructions.includes(".valmen/rules/stack.md"),
    );
    // Las de proceso y las de desarrollo sí; una skill que no depende del stack
    // no tiene por qué citarlo, pero el conjunto tiene que hacerlo.
    expect(conReglas.length).toBeGreaterThanOrEqual(6);
  });
});
