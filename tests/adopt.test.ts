/**
 * Adopción de un proyecto existente.
 *
 * La regla que estos tests protegen: **nada se borra y nada se mueve sin que el
 * usuario lo vea**. La adopción crea `.valmen/` y reporta lo que encuentra;
 * todo lo demás queda intacto.
 *
 * Ver docs/08-ADOPCION.md.
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

import {
  detectLegacyConfigs,
  parseConfig,
  profileProject,
  proposeConfig,
  readList,
} from "../packages/adapter/src/index.js";
import { chooseTicketsDir } from "../packages/gate-run/src/discovery.js";
import { adoptProject, syncProject } from "../packages/cli/src/commands.js";

let lab: string;

/** Crea un archivo con su directorio padre. */
function write(relative: string, content: string): void {
  const target = join(lab, relative);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content, "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-adopt-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un proyecto con la forma real: manifiestos anidados, no en la raíz. */
function scaffoldRealProject(): void {
  write(
    "BackEnd/requirements.txt",
    "Django==5.2.1\ndjango-tenants==3.10.1\ndjangorestframework==3.17.1\n",
  );
  write(
    "FrontEnd/package.json",
    JSON.stringify({ dependencies: { "@angular/core": "^14.3.0" } }),
  );
  write("docker-compose.yml", "services: {}\n");
  write(".github/workflows/ci.yml", "name: ci\n");
  write(".codegraph/index.db", "");
  write("docs/tickets/2026/.keep", "");
}

describe("detección del perfil", () => {
  it("encuentra manifiestos anidados, no solo en la raíz", () => {
    scaffoldRealProject();
    const profile = profileProject(lab, "Demo");

    const paths = profile.detectedFiles.map((file) => file.path);
    expect(paths).toContain("BackEnd/requirements.txt");
    expect(paths).toContain("FrontEnd/package.json");
    expect(paths).toContain("docker-compose.yml");
  });

  it("lee las versiones reales de las dependencias", () => {
    scaffoldRealProject();
    const profile = profileProject(lab, "Demo");

    const versions = new Map(
      profile.dependencies.map((d) => [d.name, d.version]),
    );
    expect(versions.get("django")).toBe("5.2.1");
    expect(versions.get("django-tenants")).toBe("3.10.1");
    expect(versions.get("@angular/core")).toBe("14.3.0");
  });

  it("no repite un manifiesto aunque dos nombres de directorio resuelvan al mismo", () => {
    // En macOS y Windows `BackEnd` y `backend` son el mismo directorio. Sin
    // deduplicar, cada dependencia se contaría dos veces.
    scaffoldRealProject();
    const profile = profileProject(lab, "Demo");
    const djangoCount = profile.dependencies.filter(
      (d) => d.name === "django",
    ).length;
    expect(djangoCount).toBe(1);
  });

  it("reconoce capacidades por la estructura de directorios", () => {
    scaffoldRealProject();
    const profile = profileProject(lab, "Demo");
    expect(profile.capabilities).toContain("contenedores");
    expect(profile.capabilities).toContain("GitHub Actions");
    expect(profile.capabilities).toContain("CodeGraph");
  });

  it("tolera un package.json ilegible sin abortar", () => {
    write("FrontEnd/package.json", "{ esto no es json }");
    expect(() => profileProject(lab, "Demo")).not.toThrow();
  });
});

describe("detección de configuración preexistente", () => {
  it("reconoce la configuración agéntica y respeta la que se declara legado", () => {
    write("AGENTS.md", "# Instrucciones activas\n");
    write(
      "CLAUDE.md",
      "# Claude Context\n\n> **Documento legado.** No autoriza acciones.\n",
    );
    write(".codex/config.toml", "model = 'x'\n");

    const found = detectLegacyConfigs(lab);
    const byPath = new Map(found.map((entry) => [entry.path, entry]));

    expect(byPath.get("AGENTS.md")?.selfDeclaredLegacy).toBe(false);
    expect(byPath.get("CLAUDE.md")?.selfDeclaredLegacy).toBe(true);
    expect(byPath.get(".codex")?.selfDeclaredLegacy).toBe(false);
  });
});

describe("elección del registro", () => {
  it("prefiere docs/tickets si ya existe, para no obligar a mover el registro", () => {
    mkdirSync(join(lab, "docs", "tickets"), { recursive: true });
    expect(chooseTicketsDir(lab)).toBe("docs/tickets");
  });

  it("usa tickets/ cuando el proyecto no tiene registro", () => {
    expect(chooseTicketsDir(lab)).toBe("tickets");
  });
});

describe("configuración propuesta", () => {
  it("solo incluye lo que se pudo comprobar, y lo demás va comentado", () => {
    scaffoldRealProject();
    const profile = profileProject(lab, "Demo");
    const config = proposeConfig(profile, "docs/tickets");

    expect(config).toContain("name: Demo");
    expect(config).toContain("tickets-dir: docs/tickets");
    // Los gates empiezan vacíos: automatizar es una decisión posterior.
    expect(config).toContain("gates: []");

    // Las dependencias se listan como comentario, no como configuración
    // efectiva: son un punto de partida, no una regla.
    const dependencyLine = config
      .split("\n")
      .find((line) => line.includes("django 5.2.1"));
    expect(dependencyLine?.trimStart().startsWith("#")).toBe(true);
  });

  it("una lista vacía se lee como lista vacía, no como el texto «[]»", () => {
    // Este caso se coló una vez: `gates: []` se interpretaba como la cadena
    // "[]", y el documento generado anunciaba gates configurados que no existían.
    const config = parseConfig("gates: []\nbudgets: {}\n");
    expect(readList(config, "gates", ["por-defecto"])).toEqual([]);
    expect(config["budgets"]).toEqual({});
  });
});

describe("comando adopt", () => {
  it("crea la configuración y las reglas, sin tocar lo existente", () => {
    scaffoldRealProject();
    const agentsBefore = "# AGENTS.md previo\n";
    write("AGENTS.md", agentsBefore);
    write("CLAUDE.md", "# Claude\n\n> Documento legado.\n");

    const result = adoptProject(lab, "Demo");
    expect(result.exitCode).toBe(0);

    expect(existsSync(join(lab, ".valmen", "config.yaml"))).toBe(true);
    expect(existsSync(join(lab, ".valmen", "rules"))).toBe(true);

    // Nada preexistente se modificó: ni el AGENTS.md viejo ni el legado.
    expect(readFileSync(join(lab, "AGENTS.md"), "utf8")).toBe(agentsBefore);
    expect(readFileSync(join(lab, "CLAUDE.md"), "utf8")).toContain(
      "Documento legado",
    );
  });

  it("avisa de que sync reemplazará el AGENTS.md previo", () => {
    write("AGENTS.md", "# Previo\n");
    const result = adoptProject(lab, "Demo");
    expect(result.stdout).toContain("Existe un AGENTS.md previo");
  });

  it("con --dry-run informa pero no escribe nada", () => {
    scaffoldRealProject();
    const result = adoptProject(lab, "Demo", { dryRun: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Adopción (simulación)");
    expect(existsSync(join(lab, ".valmen"))).toBe(false);
  });

  it("no sobrescribe una configuración ya existente", () => {
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Original\n",
      "utf8",
    );

    const result = adoptProject(lab, "Demo");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Ya existe una configuración");
    expect(readFileSync(join(lab, ".valmen", "config.yaml"), "utf8")).toBe(
      "name: Original\n",
    );
  });

  it("adopt y luego sync producen un AGENTS.md coherente", () => {
    scaffoldRealProject();
    adoptProject(lab, "Demo");
    const synced = syncProject(lab, "Demo", false);
    expect(synced.exitCode).toBe(0);

    const generated = readFileSync(join(lab, "AGENTS.md"), "utf8");
    expect(generated).toContain("GENERADO POR valmen");
    expect(generated).toContain("## Flujo de trabajo");
    // Sin gates declarados, no se anuncia la sección de gates.
    expect(generated).not.toContain("## Gates configurados");
    // Con registro declarado, sí se anuncia.
    expect(generated).toContain("## Registro de trabajo");
  });
});
