/**
 * El presupuesto de cada skill proyectada (R-SKL-001).
 *
 * Una skill se carga entera cuando el agente la invoca. `skill-budget` fija cuánto pesa
 * como máximo el archivo proyectado y `sync` avisa de la que se pasa; el aviso no bloquea.
 * Una prueba por regla, con su tabla de casos: la medida, el aviso, la proyección y el
 * comando, más la regresión de lo que ya existía sin la clave.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SKILL_BUDGET_MIN,
  measureSkill,
  parseConfig,
  projectFiles,
  readSkillBudget,
  skillWarning,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";

let lab: string;

function escribir(ruta: string, contenido: string): void {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, contenido, "utf8");
}

function scaffold(config: string): void {
  escribir(join(lab, ".valmen", "config.yaml"), config);
}

/** Una skill propia con `relleno` bytes de cuerpo y, si se pide, un `local.md`. */
function skill(id: string, relleno: number, local?: string): void {
  escribir(
    join(lab, ".valmen", "skills", id, "SKILL.md"),
    `---\nname: ${id}\ndescription: Skill de ${id}\n---\n\n# ${id}\n\n${"x".repeat(relleno)}\n`,
  );
  if (local !== undefined) escribir(join(lab, ".valmen", "skills", id, "local.md"), local);
}

function pesoProyectado(id: string): number {
  return Buffer.byteLength(
    readFileSync(join(lab, ".claude", "skills", id, "SKILL.md"), "utf8"),
    "utf8",
  );
}

function fallo(accion: () => unknown): string {
  try {
    accion();
  } catch (caught) {
    return (caught as { message?: string }).message ?? String(caught);
  }
  return "";
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-skill-presupuesto-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("skill-budget: lectura y validación de la clave", () => {
  const casos: Array<[string, string, number | null | "falla"]> = [
    ["sin la clave", "name: Demo\n", null],
    ["el mínimo", "skill-budget: 1000\n", 1000],
    ["un valor corriente", "skill-budget: 6500\n", 6500],
    ["bajo el mínimo", "skill-budget: 999\n", "falla"],
    ["texto", "skill-budget: mucho\n", "falla"],
    ["decimal", "skill-budget: 6500.5\n", "falla"],
    ["negativo", "skill-budget: -1\n", "falla"],
  ];

  it.each(casos)("%s", (_nombre, yaml, esperado) => {
    const config = parseConfig(yaml);
    if (esperado === "falla") {
      const mensaje = fallo(() => readSkillBudget(config));
      expect(mensaje).toContain('"skill-budget"');
      expect(mensaje).toContain(String(SKILL_BUDGET_MIN));
    } else {
      expect(readSkillBudget(config)).toBe(esperado);
    }
  });
});

describe("skill-budget: la medida y el aviso de una skill", () => {
  const casos: Array<{
    nombre: string;
    bytes: number;
    publicada: boolean;
    tope: number | null;
    aviso: boolean;
    contiene: string[];
    no: string[];
  }> = [
    {
      nombre: "sin tope",
      bytes: 99999,
      publicada: false,
      tope: null,
      aviso: false,
      contiene: [],
      no: [],
    },
    {
      nombre: "cabe",
      bytes: 6000,
      publicada: false,
      tope: 6500,
      aviso: false,
      contiene: [],
      no: [],
    },
    {
      nombre: "justo en el tope",
      bytes: 6500,
      publicada: true,
      tope: 6500,
      aviso: false,
      contiene: [],
      no: [],
    },
    {
      nombre: "propia que se pasa",
      bytes: 10584,
      publicada: false,
      tope: 6500,
      aviso: true,
      contiene: [
        "La skill `demo` pasa del presupuesto",
        "10 584 B",
        "~2 646 tokens",
        "6 500 B",
        "4 084 B de más",
        ".valmen/skills/demo/SKILL.md",
        "local.md",
      ],
      no: ["catálogo del harness"],
    },
    {
      nombre: "publicada que se pasa",
      bytes: 6501,
      publicada: true,
      tope: 6500,
      aviso: true,
      contiene: [
        "La skill `demo` pasa del presupuesto",
        "6 501 B",
        "~1 626 tokens",
        "1 B de más",
        "catálogo del harness",
        "skills/demo/SKILL.md",
        "local.md",
      ],
      no: [],
    },
  ];

  it.each(casos)("$nombre", ({ bytes, publicada, tope, aviso, contiene, no }) => {
    const medida = measureSkill("demo", "a".repeat(bytes), publicada, tope);
    expect(medida.bytes).toBe(bytes);
    expect(medida.estimatedTokens).toBe(Math.ceil(bytes / 4));
    expect(medida.id).toBe("demo");
    expect(medida.publicada).toBe(publicada);
    const texto = skillWarning(medida);
    expect(texto === null).toBe(!aviso);
    for (const parte of contiene) expect(texto).toContain(parte);
    for (const parte of no) expect(texto).not.toContain(parte);
  });
});

describe("skill-budget: la proyección avisa por skill, sin cambiar los archivos", () => {
  const casos: Array<{
    nombre: string;
    config: string;
    skills: Array<[string, number, string?]>;
    pasadas: string[];
  }> = [
    {
      nombre: "sin la clave no hay avisos",
      config: "name: Demo\n",
      skills: [["grande", 9000]],
      pasadas: [],
    },
    {
      nombre: "una skill que cabe no avisa",
      config: "skill-budget: 6500\n",
      skills: [["chica", 100]],
      pasadas: [],
    },
    {
      nombre: "solo avisa la que se pasa, en orden de id",
      config: "skill-budget: 2000\n",
      skills: [
        ["zeta", 3000],
        ["alfa", 3000],
        ["media", 100],
      ],
      pasadas: ["alfa", "zeta"],
    },
    {
      nombre: "el local.md suma a la medida",
      config: "skill-budget: 2000\n",
      skills: [
        ["conlocal", 1000, "y".repeat(1500)],
        ["sinlocal", 1000],
      ],
      pasadas: ["conlocal"],
    },
  ];

  it.each(casos)("$nombre", ({ config, skills, pasadas }) => {
    scaffold(config);
    for (const [id, relleno, local] of skills) skill(id, relleno, local);

    const proyeccion = projectFiles(lab, "Demo");
    const avisos = proyeccion.warnings.filter((w) => w.startsWith("La skill "));

    expect(avisos.map((w) => /`([^`]+)`/.exec(w)?.[1])).toEqual(pasadas);
    for (const aviso of avisos) {
      const id = /`([^`]+)`/.exec(aviso)?.[1] as string;
      const archivo = proyeccion.files.find(
        (f) => f.path === `.claude/skills/${id}/SKILL.md`,
      );
      const bytes = Buffer.byteLength(archivo?.content ?? "", "utf8");
      expect(aviso).toContain(`${String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} B`);
    }
  });

  it("la clave no cambia los archivos proyectados", () => {
    scaffold("name: Demo\n");
    skill("grande", 9000);
    const sin = projectFiles(lab, "Demo").files.map((f) => [f.path, f.content]);
    scaffold("name: Demo\nskill-budget: 1000\n");
    const con = projectFiles(lab, "Demo").files.map((f) => [f.path, f.content]);
    expect(con).toEqual(sin);
  });
});

describe("skill-budget: valmen sync y sync --check", () => {
  const CON_CLAVE = "name: Demo\nskill-budget: 2000\n";

  function lab_con_skill_pasada(config: string): void {
    scaffold(config);
    skill("pesada", 3000, "z".repeat(200));
  }

  it("sync escribe, imprime el aviso y sale en 0", () => {
    lab_con_skill_pasada(CON_CLAVE);

    const r = syncProject(lab, "Demo", false);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Aviso: La skill `pesada` pasa del presupuesto");
    expect(pesoProyectado("pesada")).toBeGreaterThan(3000);
    expect(r.stdout).toContain(
      `${String(pesoProyectado("pesada")).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} B`,
    );
  });

  it("sync --check al día repite el aviso y sale en 0", () => {
    lab_con_skill_pasada(CON_CLAVE);
    syncProject(lab, "Demo", false);

    const r = syncProject(lab, "Demo", true);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Aviso: La skill `pesada` pasa del presupuesto");
  });

  it("sync --check desactualizado lleva el aviso junto al error", () => {
    lab_con_skill_pasada(CON_CLAVE);

    const r = syncProject(lab, "Demo", true);

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("Aviso: La skill `pesada` pasa del presupuesto");
  });

  it("una clave inválida hace fallar el comando y nombra la clave", () => {
    lab_con_skill_pasada("name: Demo\nskill-budget: poco\n");

    const r = syncProject(lab, "Demo", false);

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('"skill-budget"');
  });

  it("regresión: sin la clave, sync y sync --check no avisan de ninguna skill", () => {
    lab_con_skill_pasada("name: Demo\n");

    const escribe = syncProject(lab, "Demo", false);
    const verifica = syncProject(lab, "Demo", true);

    expect(escribe.exitCode).toBe(0);
    expect(verifica.exitCode).toBe(0);
    expect(escribe.stdout).not.toContain("La skill");
    expect(verifica.stdout).not.toContain("La skill");
  });
});
