/**
 * Proyección de `.valmen/` a `AGENTS.md`.
 *
 * La propiedad central es la **determinación**: el mismo modelo debe producir
 * siempre el mismo texto. Sin ella, `sync --check` daría falsos positivos y la
 * detección de ediciones a mano sería inútil, que es justamente para lo que
 * existe.
 *
 * Ver docs/07-ADAPTADORES.md.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadProjectModel,
  parseConfig,
  projectFiles,
  projectAgentsMd,
  readList,
  readString,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";

/** Captura el fallo de una operación, o `null` si no falló. */
function captureFailure(
  action: () => unknown,
): { message: string; exitCode: number } | null {
  try {
    action();
    return null;
  } catch (caught) {
    const error = caught as { message?: unknown; exitCode?: unknown };
    return {
      message: typeof error.message === "string" ? error.message : String(caught),
      exitCode: typeof error.exitCode === "number" ? error.exitCode : -1,
    };
  }
}

let lab: string;

/** Crea un `.valmen/` mínimo con las reglas indicadas. */
function scaffold(rules: Record<string, string>, config?: string): void {
  mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
  if (config !== undefined) {
    writeFileSync(join(lab, ".valmen", "config.yaml"), config, "utf8");
  }
  for (const [name, content] of Object.entries(rules)) {
    writeFileSync(join(lab, ".valmen", "rules", name), content, "utf8");
  }
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-sync-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("análisis de config.yaml", () => {
  it("lee escalares, listas y mapas anidados", () => {
    const config = parseConfig(
      [
        "# comentario de cabecera",
        "name: SaiOpenCloud",
        "description: SaaS multi-tenant",
        "gates:",
        "  - intake",
        "  - plan",
        "budgets:",
        "  per-ticket: 2.00",
        "  per-feature: 15.00",
        "",
      ].join("\n"),
    );

    expect(readString(config, "name", "")).toBe("SaiOpenCloud");
    expect(readList(config, "gates", [])).toEqual(["intake", "plan"]);
    expect(config["budgets"]).toEqual({
      "per-ticket": "2.00",
      "per-feature": "15.00",
    });
  });

  it("ignora los comentarios al final de una línea", () => {
    const config = parseConfig("name: SaiOpenCloud  # el producto\ngates: []\n");
    expect(readString(config, "name", "")).toBe("SaiOpenCloud");
  });

  it("no confunde un # dentro de un valor con un comentario", () => {
    const config = parseConfig("color: a#b\n");
    expect(readString(config, "color", "")).toBe("a#b");
  });

  it("falla ante una clave duplicada en vez de quedarse con una", () => {
    // Se comprueba el contrato observable —mensaje y código— y no `instanceof`:
    // este archivo importa el código fuente mientras los paquetes resuelven a
    // `dist`, así que hay dos identidades de la misma clase. El mensaje y el
    // código de salida son lo que un consumidor ve.
    const failure = captureFailure(() => parseConfig("name: uno\nname: dos\n"));
    expect(failure?.message).toBe('config.yaml línea 2: la clave "name" está duplicada.');
    expect(failure?.exitCode).toBe(2);
  });

  it("falla ante una clave con formato inválido", () => {
    expect(() => parseConfig("Name: uno\n")).toThrow("no es válida");
  });

  it("falla ante una indentación inconsistente", () => {
    const failure = captureFailure(() => parseConfig("a:\n  b: 1\n   c: 2\n"));
    expect(failure?.message).toBe("config.yaml línea 3: indentación inesperada.");
    expect(failure?.exitCode).toBe(2);
  });

  it("devuelve una configuración vacía si el archivo está vacío", () => {
    expect(parseConfig("\n# solo un comentario\n")).toEqual({});
  });

  it("interpreta una colección en línea y no la lee como texto", () => {
    // `gates: [plan, analysis]` es YAML normal. Leerlo como el texto
    // "[plan, analysis]" haría que el documento generado anunciara un gate con
    // ese nombre: un valor con contenido donde no lo hay. Antes se rechazaba;
    // ahora se interpreta, que es lo que espera quien lo escribe.
    expect(parseConfig("gates: [plan, analysis]\n").gates).toEqual(["plan", "analysis"]);
    expect(parseConfig("budgets: {a: 1}\n").budgets).toEqual({ a: "1" });
    // Las formas vacías siguen admitidas: son las que escribe el harness.
    expect(parseConfig("gates: []\n").gates).toEqual([]);
    expect(parseConfig("budgets: {}\n").budgets).toEqual({});
    // Un texto que solo empieza por corchete no se confunde con una colección.
    expect(parseConfig("description: [beta] es la versión\n").description).toBe(
      "[beta] es la versión",
    );
  });

  it("rechaza una colección en línea que no cierra", () => {
    // El error que queda: algo que parece una colección y no se puede leer. Se
    // dice la línea y la clave en vez de leer un valor distinto del escrito.
    expect(() => parseConfig("gates: [plan, 'analysis\n")).toThrow(
      /abre una colección y no la cierra/,
    );
  });

  it("usa el valor por defecto cuando la clave no está", () => {
    const config = parseConfig("name: uno\n");
    expect(readString(config, "description", "sin descripción")).toBe("sin descripción");
    expect(readList(config, "gates", ["intake"])).toEqual(["intake"]);
  });
});

describe("proyección a AGENTS.md", () => {
  it("es determinista: el mismo modelo produce el mismo texto", () => {
    scaffold(
      {
        "10-stack.md": "# Stack\n\n- Django 5.2.1\n",
        "20-reglas.md": "# Reglas\n\n- Una.\n",
      },
      "name: Demo\n",
    );
    const model = loadProjectModel(lab, "Demo");
    const first = projectAgentsMd(model);
    const second = projectAgentsMd(model);
    expect(second).toBe(first);

    // Y estable entre lecturas independientes del disco.
    expect(projectAgentsMd(loadProjectModel(lab, "Demo"))).toBe(first);
  });

  it("declara que el archivo es generado y de dónde viene", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django.\n" }, "name: Demo\n");
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));

    expect(output).toContain("GENERADO POR valmen");
    expect(output).toContain("NO EDITAR A MANO");
    expect(output).toContain("regenerar: valmen sync");
    // La procedencia es lo que permite saber de qué archivo salió cada parte.
    expect(output).toContain(".valmen/config.yaml");
    expect(output).toContain(".valmen/rules/10-stack.md");
  });

  it("incluye las reglas del proyecto en orden alfabético y con su título degradado", () => {
    scaffold(
      {
        "30-tercero.md": "# Tercero\n\n- C.\n",
        "10-primero.md": "# Primero\n\n- A.\n",
        "20-segundo.md": "# Segundo\n\n- B.\n",
      },
      "name: Demo\n",
    );
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));

    const positions = ["## Primero", "## Segundo", "## Tercero"].map((heading) =>
      output.indexOf(heading),
    );
    expect(positions.every((position) => position > 0)).toBe(true);
    // El orden de los archivos manda, y el proyecto lo controla renombrándolos.
    expect(positions[0]).toBeLessThan(positions[1] as number);
    expect(positions[1]).toBeLessThan(positions[2] as number);
  });

  it("incluye el flujo de trabajo y los invariantes del harness", () => {
    scaffold({}, "name: Demo\n");
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));

    expect(output).toContain("## Flujo de trabajo");
    expect(output).toContain("## Invariantes de operación");
    expect(output).toContain("## Entrega y documentación");
    // Las secciones que hacen útil el documento para un agente nuevo.
    expect(output).toContain("Autorización antes de acción");
    expect(output).toContain("Acciones que nunca se automatizan");
    expect(output.toLowerCase()).toContain("los bloques append-only no se reescriben");
  });

  it("avisa cuando el proyecto no declara reglas propias", () => {
    scaffold({}, "name: Demo\n");
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));
    expect(output).toContain("no declara reglas propias");
  });

  it("refleja los gates y el registro declarados en la configuración", () => {
    scaffold({}, "name: Demo\ntickets-dir: docs/tickets\ngates:\n  - plan\n  - qa\n");
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));
    expect(output).toContain("## Gates configurados");
    expect(output).toContain("- `plan`");
    expect(output).toContain("## Registro de trabajo");
    expect(output).toContain("`docs/tickets/`");
  });

  it("usa la descripción en el título cuando existe", () => {
    scaffold({}, "name: Demo\ndescription: Un producto\n");
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));
    expect(output.split("\n").find((line) => line.startsWith("# "))).toBe(
      "# Demo — Un producto",
    );
  });

  it("termina con exactamente un salto de línea", () => {
    scaffold({ "10-a.md": "# A\n\n- Uno.\n" }, "name: Demo\n");
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));
    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
  });
});

describe("comando sync", () => {
  it("genera AGENTS.md y lo reconoce al día", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django.\n" }, "name: Demo\n");

    const written = syncProject(lab, "Demo", false);
    expect(written.exitCode).toBe(0);
    expect(written.stdout).toContain("AGENTS.md");
    expect(written.stdout).toContain("Sincronización");

    const checked = syncProject(lab, "Demo", true);
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toBe("Archivos generados al día.\n");
  });

  it("detecta que alguien editó el archivo generado a mano", () => {
    scaffold({}, "name: Demo\n");
    syncProject(lab, "Demo", false);

    const target = join(lab, "AGENTS.md");
    writeFileSync(target, readFileSync(target, "utf8") + "\nnota añadida a mano\n", "utf8");

    const checked = syncProject(lab, "Demo", true);
    expect(checked.exitCode).toBe(2);
    expect(checked.stderr).toContain("editados a mano");
  });

  it("detecta que falta el archivo generado", () => {
    scaffold({}, "name: Demo\n");
    const checked = syncProject(lab, "Demo", true);
    expect(checked.exitCode).toBe(2);
    expect(checked.stderr).toContain("AGENTS.md (falta)");
  });

  it("detecta que una regla del proyecto cambió y el archivo quedó viejo", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django 5.2.1.\n" }, "name: Demo\n");
    syncProject(lab, "Demo", false);

    writeFileSync(
      join(lab, ".valmen", "rules", "10-stack.md"),
      "# Stack\n\n- Django 6.0.\n",
      "utf8",
    );

    const checked = syncProject(lab, "Demo", true);
    expect(checked.exitCode).toBe(2);
  });

  it("falla de forma ruidosa ante una configuración inválida", () => {
    scaffold({}, "name: uno\nname: dos\n");
    const result = syncProject(lab, "Demo", false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("duplicada");
    // No debe haberse escrito nada: un config roto no se degrada a "sin config".
    expect(() => readFileSync(join(lab, "AGENTS.md"), "utf8")).toThrow();
  });
});

/**
 * Los runtimes a los que se proyecta.
 *
 * Un proyecto que trabaja con un solo agente no debería recibir los archivos de
 * los otros: mantener configuraciones que nadie lee es ruido en cada `git
 * status`, y en el caso de `.claude/` puede ser mucho ruido.
 */
describe("proyección por runtime", () => {
  /** Un proyecto con una skill y un agente, para ver qué runtimes los reciben. */
  function scaffoldCompleto(config: string): void {
    scaffold({ "10-stack.md": "# Stack\n" }, config);
    mkdirSync(join(lab, ".valmen", "skills", "revision"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "skills", "revision", "SKILL.md"),
      "---\nname: revision\ndescription: Revisa.\n---\n\nRevisa esto.\n",
      "utf8",
    );
    mkdirSync(join(lab, ".valmen", "agents"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "agents", "planner.md"),
      "---\ndescription: Planea.\n---\n\nPlanea esto.\n",
      "utf8",
    );
  }

  /** Las rutas generadas, sin `AGENTS.md`. */
  function rutas(lab: string): string[] {
    const model = loadProjectModel(lab, "Demo");
    return projectFiles(lab, model.name)
      .files.map((file) => file.path)
      .filter((path) => path !== "AGENTS.md")
      .sort();
  }

  it("proyecta a los tres runtimes cuando el proyecto no declara ninguno", () => {
    scaffoldCompleto("name: Demo\n");
    const generadas = rutas(lab);
    expect(generadas.filter((path) => path.startsWith(".opencode/"))).toHaveLength(2);
    expect(generadas.filter((path) => path.startsWith(".claude/"))).toHaveLength(2);
    expect(generadas.filter((path) => path.startsWith(".codex/"))).toHaveLength(2);
  });

  it("proyecta solo a los declarados", () => {
    scaffoldCompleto("name: Demo\nruntimes:\n  - opencode\n");
    const generadas = rutas(lab);
    expect(generadas).toEqual([
      ".opencode/agents/planner.md",
      ".opencode/skills/revision/SKILL.md",
    ]);
  });

  it("admite más de uno", () => {
    scaffoldCompleto("name: Demo\nruntimes: [opencode, claude]\n");
    const generadas = rutas(lab);
    expect(generadas.some((path) => path.startsWith(".codex/"))).toBe(false);
    expect(generadas.some((path) => path.startsWith(".claude/"))).toBe(true);
    expect(generadas.some((path) => path.startsWith(".opencode/"))).toBe(true);
  });

  it("falla ante un runtime desconocido en vez de ignorarlo", () => {
    // Un nombre mal escrito que se descarta en silencio deja al usuario sin los
    // archivos que pidió y sin ninguna señal de por qué.
    scaffoldCompleto("name: Demo\nruntimes:\n  - opencode\n  - cursor\n");
    const result = syncProject(lab, "Demo", false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("cursor");
    expect(result.stderr).toContain("no es un runtime conocido");
  });

  it("falla ante una lista vacía, que no proyectaría nada", () => {
    scaffoldCompleto("name: Demo\nruntimes: []\n");
    const result = syncProject(lab, "Demo", false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("no puede estar vacío");
  });
});
