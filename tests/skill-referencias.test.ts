/**
 * Las referencias de una skill (`.valmen/skills/<id>/referencias/*.md`) se proyectan junto
 * al `SKILL.md`, se comparan en `sync --check` y viajan con las skills publicadas.
 *
 * Una prueba por regla, con una tabla de casos. Los catálogos de prueba son directorios
 * temporales: no se toca `skills/` real.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { instalarPublicadasEnHermes } from "../packages/adapter/src/mcp.js";
import { projectFiles } from "../packages/adapter/src/projection.js";
import {
  derivaPublicada,
  descripcionDeDeriva,
  instalarPublicadas,
} from "../packages/adapter/src/skills.js";
import { syncProject } from "../packages/cli/src/commands.js";

let lab: string;
let catalogo: string;
let home: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-refs-"));
  catalogo = mkdtempSync(join(tmpdir(), "valmen-refs-cat-"));
  home = mkdtempSync(join(tmpdir(), "valmen-refs-home-"));
  delete process.env["HERMES_HOME"];
});

afterEach(() => {
  for (const dir of [lab, catalogo, home]) rmSync(dir, { recursive: true, force: true });
});

function escribir(ruta: string, contenido: string): void {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, contenido, "utf8");
}

const CONFIG_TODOS = "name: Demo\n";

/** Un proyecto con una skill propia `demo` y las referencias que se pidan. */
function proyecto(
  config: string,
  archivos: Readonly<Record<string, string>>,
  cuerpo = "Cuerpo de la skill.",
): void {
  escribir(join(lab, ".valmen", "config.yaml"), config);
  escribir(
    join(lab, ".valmen", "skills", "demo", "SKILL.md"),
    `---\nname: demo\ndescription: Skill de prueba\n---\n\n${cuerpo}\n`,
  );
  for (const [ruta, contenido] of Object.entries(archivos)) {
    escribir(join(lab, ".valmen", "skills", "demo", "referencias", ruta), contenido);
  }
}

/** Una skill publicada en el catálogo temporal, con referencias. */
function publicar(archivos: Readonly<Record<string, string>>): void {
  escribir(
    join(catalogo, "demo", "SKILL.md"),
    "---\nname: demo\ndescription: Publicada\nversion: 1.0.0\norigen: valmen\n---\n\nCuerpo.\n",
  );
  for (const [ruta, contenido] of Object.entries(archivos)) {
    escribir(join(catalogo, "demo", "referencias", ruta), contenido);
  }
}

/** Las rutas proyectadas que son referencias, en el orden de la proyección. */
function rutasDeReferencias(): string[] {
  return projectFiles(lab, "Demo")
    .files.map((f) => f.path)
    .filter((p) => p.includes("/referencias/"));
}

const RUNTIMES = [".opencode/skills", ".claude/skills", ".codex/skills", ".agents/skills"];
const en = (runtimes: readonly string[], ...nombres: string[]): string[] =>
  runtimes.flatMap((r) => nombres.map((n) => `${r}/demo/referencias/${n}`));

describe("proyección de las referencias de una skill", () => {
  const casos: {
    nombre: string;
    config: string;
    archivos: Record<string, string>;
    esperado: string[];
  }[] = [
    {
      nombre: "se proyecta en los cuatro runtimes (C1)",
      config: CONFIG_TODOS,
      archivos: { "a.md": "# A\n" },
      esperado: en(RUNTIMES, "a.md"),
    },
    {
      nombre: "un runtime fuera de la configuración no la recibe (C2)",
      config: "name: Demo\nruntimes: [claude]\n",
      archivos: { "a.md": "# A\n" },
      esperado: en([".claude/skills"], "a.md"),
    },
    {
      nombre: "sin carpeta de referencias no se proyecta nada (C3)",
      config: CONFIG_TODOS,
      archivos: {},
      esperado: [],
    },
    {
      nombre: "un archivo que no es .md no se proyecta (C4)",
      config: "name: Demo\nruntimes: [claude]\n",
      archivos: { "a.md": "# A\n", "notas.txt": "texto\n" },
      esperado: en([".claude/skills"], "a.md"),
    },
    {
      nombre: "una subcarpeta no se proyecta (C5)",
      config: "name: Demo\nruntimes: [claude]\n",
      archivos: { "a.md": "# A\n", "sub/b.md": "# B\n" },
      esperado: en([".claude/skills"], "a.md"),
    },
    {
      nombre: "van en orden por nombre (C6)",
      config: "name: Demo\nruntimes: [claude]\n",
      archivos: { "c.md": "c", "a.md": "a", "b.md": "b" },
      esperado: en([".claude/skills"], "a.md", "b.md", "c.md"),
    },
  ];

  it.each(casos)("$nombre", ({ config, archivos, esperado }) => {
    proyecto(config, archivos);

    expect(rutasDeReferencias()).toEqual(esperado);

    // Byte a byte, y la fuente figura entre las fuentes de la proyección.
    const proy = projectFiles(lab, "Demo");
    for (const f of proy.files.filter((x) => x.path.includes("/referencias/"))) {
      const nombre = f.path.split("/").pop() as string;
      expect(f.content).toBe(archivos[nombre]);
      expect(proy.sources).toContain(`.valmen/skills/demo/referencias/${nombre}`);
    }
  });
});

describe("sync --check con referencias proyectadas", () => {
  const ref = ".claude/skills/demo/referencias/a.md";
  const casos: {
    nombre: string;
    tocar: (() => void) | null;
    resultado: "al día" | "falla";
    menciona?: string;
  }[] = [
    { nombre: "al día (C9)", tocar: null, resultado: "al día" },
    {
      nombre: "nombra la que falta (C7)",
      tocar: () => rmSync(join(lab, ref)),
      resultado: "falla",
      menciona: `${ref} (falta)`,
    },
    {
      nombre: "nombra la editada a mano (C8)",
      tocar: () => writeFileSync(join(lab, ref), "editada\n", "utf8"),
      resultado: "falla",
      menciona: ref,
    },
  ];

  it.each(casos)("$nombre", ({ tocar, resultado, menciona }) => {
    proyecto("name: Demo\nruntimes: [claude]\n", { "a.md": "# A\n" });
    expect(syncProject(lab, "Demo", false).exitCode).toBe(0);
    tocar?.();

    const salida = syncProject(lab, "Demo", true);

    if (resultado === "al día") {
      expect(salida.exitCode).toBe(0);
      expect(salida.stdout).toContain("Archivos generados al día.");
    } else {
      expect(salida.exitCode).not.toBe(0);
      expect(salida.stderr).toContain(menciona as string);
    }
  });
});

describe("el presupuesto de skill-budget", () => {
  it("no suma las referencias (C10)", () => {
    proyecto("name: Demo\nskill-budget: 1000\n", { "grande.md": "x".repeat(20000) });

    const avisos = projectFiles(lab, "Demo").warnings.filter((w) =>
      w.startsWith("La skill "),
    );

    expect(avisos).toEqual([]);
  });
});

describe("referencias de las skills publicadas", () => {
  const dest = (...p: string[]): string => join(lab, ".valmen", "skills", "demo", ...p);

  const casos: {
    nombre: string;
    preparar: () => void;
    deriva: { detalle: string; ref: string }[];
  }[] = [
    {
      nombre:
        "falta en el proyecto: la deriva la nombra y la instalación la copia (C11, C12)",
      preparar: () => {
        instalarPublicadas(lab, catalogo);
        rmSync(dest("referencias", "a.md"));
      },
      deriva: [{ detalle: "falta", ref: "a.md" }],
    },
    {
      nombre: "editada a mano: la deriva la nombra (C13)",
      preparar: () => {
        instalarPublicadas(lab, catalogo);
        writeFileSync(dest("referencias", "a.md"), "editada\n", "utf8");
      },
      deriva: [{ detalle: "editada", ref: "a.md" }],
    },
    {
      nombre: "al día: sin deriva",
      preparar: () => {
        instalarPublicadas(lab, catalogo);
      },
      deriva: [],
    },
  ];

  it.each(casos)("$nombre", ({ preparar, deriva }) => {
    publicar({ "a.md": "# A\n" });
    preparar();

    const encontrada = derivaPublicada(lab, catalogo);

    expect(
      encontrada.map((d) => ({ detalle: d.detalle ?? "", ref: d.referencia ?? "" })),
    ).toEqual(deriva);
    for (const d of encontrada) {
      expect(d.motivo).toBe("referencia");
      expect(descripcionDeDeriva(encontrada)).toContain(`demo/referencias/${d.referencia}`);
    }

    // La instalación (lo que hace `sync`) la repone, y es idempotente.
    instalarPublicadas(lab, catalogo);
    expect(readFileSync(dest("referencias", "a.md"), "utf8")).toBe("# A\n");
    expect(derivaPublicada(lab, catalogo)).toEqual([]);
    expect(instalarPublicadas(lab, catalogo)).toEqual([]);
  });
});

describe("la instalación global de Hermes", () => {
  const destino = (): string =>
    join(home, ".hermes", "skills", "demo", "referencias", "a.md");

  const casos: {
    nombre: string;
    previa: string | null;
    forzar: boolean;
    escritas: string[];
    pendientes: string[];
    contenido: string | null;
  }[] = [
    {
      nombre: "escribe la referencia nueva junto al SKILL.md (C14)",
      previa: null,
      forzar: false,
      escritas: ["demo"],
      pendientes: [],
      contenido: "# A\n",
    },
    {
      nombre: "deja pendiente la editada sin forzar (C15)",
      previa: "mía\n",
      forzar: false,
      escritas: [],
      pendientes: ["demo"],
      contenido: "mía\n",
    },
    {
      nombre: "la pisa con forzar",
      previa: "mía\n",
      forzar: true,
      escritas: ["demo"],
      pendientes: [],
      contenido: "# A\n",
    },
  ];

  it.each(casos)("$nombre", ({ previa, forzar, escritas, pendientes, contenido }) => {
    publicar({ "a.md": "# A\n" });
    // El SKILL.md global ya está al día: lo único que cambia es la referencia.
    escribir(
      join(home, ".hermes", "skills", "demo", "SKILL.md"),
      readFileSync(join(catalogo, "demo", "SKILL.md"), "utf8"),
    );
    if (previa !== null) escribir(destino(), previa);

    const resultado = instalarPublicadasEnHermes(home, { forzar, dir: catalogo });

    expect([...resultado.escritas]).toEqual(escritas);
    expect([...resultado.pendientes]).toEqual(pendientes);
    expect(existsSync(destino()) ? readFileSync(destino(), "utf8") : null).toBe(contenido);
  });
});

describe("regresión: sin carpeta de referencias", () => {
  it("sync y sync --check se comportan como antes", () => {
    proyecto("name: Demo\nruntimes: [claude]\n", {});

    expect(syncProject(lab, "Demo", false).exitCode).toBe(0);
    const check = syncProject(lab, "Demo", true);

    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain("Archivos generados al día.");
    expect(existsSync(join(lab, ".claude", "skills", "demo", "referencias"))).toBe(false);
    expect(existsSync(join(lab, ".valmen", "skills", "demo", "referencias"))).toBe(false);
  });
});
