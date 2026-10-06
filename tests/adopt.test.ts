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
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detectLegacyConfigs,
  detectMemorySources,
  extractRules,
  machineBindingsPath,
  parseMachineBindings,
  parseConfig,
  profileProject,
  proposeConfig,
  readList,
} from "../packages/adapter/src/index.js";
import { chooseTicketsDir } from "../packages/engine/src/discovery.js";
import { loadMemory } from "../packages/engine/src/memory.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
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

    const versions = new Map(profile.dependencies.map((d) => [d.name, d.version]));
    expect(versions.get("django")).toBe("5.2.1");
    expect(versions.get("django-tenants")).toBe("3.10.1");
    expect(versions.get("@angular/core")).toBe("14.3.0");
  });

  it("no repite un manifiesto aunque dos nombres de directorio resuelvan al mismo", () => {
    // En macOS y Windows `BackEnd` y `backend` son el mismo directorio. Sin
    // deduplicar, cada dependencia se contaría dos veces.
    scaffoldRealProject();
    const profile = profileProject(lab, "Demo");
    const djangoCount = profile.dependencies.filter((d) => d.name === "django").length;
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
    // Un `docs/tickets` con tickets dentro gana, aunque el layout nuevo exista.
    expect(chooseTicketsDir(lab)).toBe("docs/tickets");
  });

  it("usa tickets/ cuando el proyecto no tiene registro", () => {
    expect(chooseTicketsDir(lab)).toBe("tickets");
  });

  it("un directorio vacío no desvía el registro al layout anterior", () => {
    // Pasó de verdad: un `docs/tickets` vacío, dejado por una prueba, hacía que
    // el harness creyera que el registro era el anterior y mostrara una lista
    // vacía con los tickets a la vista.
    mkdirSync(join(lab, "docs", "tickets"), { recursive: true });
    writeFixtureTicket(lab, { id: "BUGFIX-A-B-20260921" });
    expect(chooseTicketsDir(lab)).toBe("tickets");

    // Y si el que tiene tickets es el anterior, gana el anterior.
    mkdirSync(join(lab, "docs", "tickets", "2026", "BUGFIX-C-D-20260921"), {
      recursive: true,
    });
    writeFileSync(
      join(lab, "docs", "tickets", "2026", "BUGFIX-C-D-20260921", "ticket.md"),
      "---\n",
      "utf8",
    );
    expect(chooseTicketsDir(lab)).toBe("docs/tickets");
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
    const dependencyLine = config.split("\n").find((line) => line.includes("django 5.2.1"));
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
    expect(readFileSync(join(lab, "CLAUDE.md"), "utf8")).toContain("Documento legado");
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
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Original\n", "utf8");

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

describe("binding local durante adopt", () => {
  function prepararProyectoConIdentidad(): void {
    write(
      ".valmen/config.yaml",
      "name: Demo\nproject-id: demo\ntickets-dir: tickets\ngates: []\n",
    );
  }

  it("crea el primer binding local con el machine-id explícito", () => {
    prepararProyectoConIdentidad();
    const home = join(lab, "home");

    const result = adoptProject(lab, "Demo", { home, machineId: "equipo-pruebas" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Binding local creado");
    expect(parseMachineBindings(readFileSync(machineBindingsPath(home), "utf8"))).toEqual({
      schemaVersion: "1",
      machineId: "equipo-pruebas",
      managedExecutionCapacity: 1,
      projects: { demo: { root: resolve(lab) } },
    });
  });

  it("repite una adopción idéntica sin reescribir bindings de otros proyectos", () => {
    prepararProyectoConIdentidad();
    const home = join(lab, "home");
    mkdirSync(join(home, ".valmen"), { recursive: true });
    writeFileSync(
      machineBindingsPath(home),
      [
        "schema-version: 1",
        "machine-id: equipo-pruebas",
        "managed-execution-capacity: 1",
        "projects:",
        "  demo:",
        `    root: ${resolve(lab)}`,
        "  otro-proyecto:",
        "    root: /tmp/otro-proyecto",
        "    hermes-profile: otro",
        "",
      ].join("\n"),
      "utf8",
    );
    const before = readFileSync(machineBindingsPath(home), "utf8");

    const result = adoptProject(lab, "Demo", { home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Binding local ya declarado");
    expect(readFileSync(machineBindingsPath(home), "utf8")).toBe(before);
  });

  it("informa el conflicto de raíz sin escribir el binding existente", () => {
    prepararProyectoConIdentidad();
    const home = join(lab, "home");
    mkdirSync(join(home, ".valmen"), { recursive: true });
    writeFileSync(
      machineBindingsPath(home),
      [
        "schema-version: 1",
        "machine-id: equipo-pruebas",
        "managed-execution-capacity: 1",
        "projects:",
        "  demo:",
        "    root: /tmp/otra-raiz",
        "",
      ].join("\n"),
      "utf8",
    );
    const before = readFileSync(machineBindingsPath(home), "utf8");

    const result = adoptProject(lab, "Demo", { home });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("conflicto");
    expect(readFileSync(machineBindingsPath(home), "utf8")).toBe(before);
  });

  it("informa el conflicto de perfil sin escribir el binding existente", () => {
    prepararProyectoConIdentidad();
    const home = join(lab, "home");
    mkdirSync(join(home, ".valmen"), { recursive: true });
    writeFileSync(
      machineBindingsPath(home),
      [
        "schema-version: 1",
        "machine-id: equipo-pruebas",
        "managed-execution-capacity: 1",
        "projects:",
        "  demo:",
        `    root: ${resolve(lab)}`,
        "    hermes-profile: perfil-ajeno",
        "",
      ].join("\n"),
      "utf8",
    );
    const before = readFileSync(machineBindingsPath(home), "utf8");

    const result = adoptProject(lab, "Demo", { home });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("conflicto");
    expect(readFileSync(machineBindingsPath(home), "utf8")).toBe(before);
  });

  it("simula el binding sin crear archivos locales", () => {
    prepararProyectoConIdentidad();
    const home = join(lab, "home");

    const result = adoptProject(lab, "Demo", {
      dryRun: true,
      home,
      machineId: "equipo-pruebas",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Binding local propuesto");
    expect(existsSync(machineBindingsPath(home))).toBe(false);
  });
});

describe("comandos de prueba detectados del stack", () => {
  it("declara lo que el disco respalda, con la evidencia de cada uno", () => {
    write("BackEnd/requirements.txt", "Django==5.2.1\npytest==8.0.0\n");
    write("BackEnd/manage.py", "#!/usr/bin/env python\n");
    write(
      "FrontEnd/package.json",
      JSON.stringify({ devDependencies: { vitest: "^2.1.8" } }),
    );

    const profile = profileProject(lab, "Demo");
    expect(profile.testCommands.map((uno) => uno.command)).toEqual([
      "python BackEnd/manage.py test",
      "pytest",
      "npx vitest run",
    ]);
    expect(profile.testCommands[0]?.evidence).toBe("BackEnd/manage.py");
  });

  it("no declara ningún comando que el disco no respalde", () => {
    // Un stack sin runner de pruebas no autoriza nada: declarar comandos típicos
    // haría que el gate ejecutara algo que el proyecto no tiene.
    write(
      "FrontEnd/package.json",
      JSON.stringify({ dependencies: { "@angular/core": "^14.3.0" } }),
    );
    expect(profileProject(lab, "Demo").testCommands).toEqual([]);
  });

  it("el documento propuesto declara los comandos y el parser del motor los lee", () => {
    write("BackEnd/requirements.txt", "Django==5.2.1\n");
    write("BackEnd/manage.py", "#!/usr/bin/env python\n");

    const config = parseConfig(proposeConfig(profileProject(lab, "Demo"), "tickets"));
    expect(readList(config, "test-commands", [])).toEqual(["python BackEnd/manage.py test"]);
  });

  it("sin comandos detectados la lista queda vacía, no como el texto «[]»", () => {
    const config = parseConfig(proposeConfig(profileProject(lab, "Demo"), "tickets"));
    expect(readList(config, "test-commands", ["nada"])).toEqual([]);
  });
});

describe("documentos de memoria detectados", () => {
  it("declara las dos fuentes cuando los documentos están en la raíz", () => {
    write("DECISIONS.md", "# Decisiones\n\n## DEC-001: Usar Django\n");
    write("ERRORS.md", "# Errores\n\n## 2026-08-23 — El entorno heredaba .env\n");

    const config = parseConfig(proposeConfig(profileProject(lab, "Demo"), "tickets"));
    expect(readList(config, "memory-sources", [])).toEqual(["DECISIONS.md", "ERRORS.md"]);
  });

  it("declara la ruta relativa cuando el documento vive en docs/", () => {
    write("docs/decisions.md", "# Decisiones\n\n## DEC-001: Usar Django\n");
    const config = parseConfig(proposeConfig(profileProject(lab, "Demo"), "tickets"));
    expect(readList(config, "memory-sources", [])).toEqual(["docs/decisions.md"]);
  });

  it("declara el nombre que está en el disco, no la forma canónica", () => {
    // En un sistema que distingue mayúsculas `DECISIONS.md` y `decisions.md` no
    // son el mismo archivo: declarar el que no es deja la fuente sin abrir.
    write("DECISIONS.md", "# Decisiones\n\n## DEC-001: Usar Django\n");
    const config = proposeConfig(profileProject(lab, "Demo"), "tickets");

    expect(config).toContain("  - DECISIONS.md");
    expect(config).not.toContain("- decisions.md");
  });

  it("no declara ninguna fuente cuando el proyecto no tiene esos documentos", () => {
    // `CONTEXT.md` no entra: es prosa sin entradas, y una fuente declarada con
    // cero entradas detrás se lee como «esto ya está indexado».
    write("CONTEXT.md", "# Contexto\n\n## Lo que hay\n\nProsa suelta.\n");
    const config = proposeConfig(profileProject(lab, "Demo"), "tickets");

    expect(config).not.toContain("memory-sources");
    expect(readList(parseConfig(config), "memory-sources", [])).toEqual([]);
  });

  it("la detección solo declara los documentos que el índice sabe leer", () => {
    write("CONTEXT.md", "# Contexto\n\n## Lo que hay\n");
    write("DECISIONS.md", "# Decisiones\n");

    expect(detectMemorySources(lab).map((source) => source.path)).toEqual(["DECISIONS.md"]);
  });

  it("el informe los nombra, y dice qué revisó cuando no hay ninguno", () => {
    write("DECISIONS.md", "# Decisiones\n\n## DEC-001: Usar Django\n");
    write("ERRORS.md", "# Errores\n\n## 2026-08-23 — El entorno heredaba .env\n");

    const conDocumentos = adoptProject(lab, "Demo", { dryRun: true }).stdout;
    expect(conDocumentos).toContain("Documentos de memoria (2)");
    expect(conDocumentos).toContain("DECISIONS.md");
    expect(conDocumentos).toContain("ERRORS.md");

    const vacio = mkdtempSync(join(tmpdir(), "valmen-adopt-vacio-"));
    try {
      const sinDocumentos = adoptProject(vacio, "Demo", { dryRun: true }).stdout;
      expect(sinDocumentos).toContain("Documentos de memoria");
      expect(sinDocumentos).toContain("no se detectó ninguno");
    } finally {
      rmSync(vacio, { recursive: true, force: true });
    }
  });

  it("un proyecto adoptado consulta su memoria sin editar nada a mano", () => {
    // El síntoma de punta a punta: la detección escribe la clave y el índice
    // devuelve las entradas de los dos documentos, incluida la variante por
    // fecha que el catálogo de errores usa.
    write(
      "DECISIONS.md",
      "# Decisiones\n\n## DEC-001: Usar Django\n\n**Fecha:** 2026-01-01\n",
    );
    write(
      "ERRORS.md",
      "# Errores\n\n## 2026-08-23 — El entorno heredaba .env\n\n**Síntoma:** x.\n",
    );

    expect(adoptProject(lab, "Demo").exitCode).toBe(0);

    const memoria = loadMemory({ root: lab, ticketsDir: "tickets" });
    expect(memoria.map((entrada) => entrada.id)).toEqual(["DEC-001", null]);
    expect(memoria.map((entrada) => entrada.source.path)).toEqual([
      "DECISIONS.md",
      "ERRORS.md",
    ]);
    expect(memoria.map((entrada) => entrada.kind)).toEqual(["decision", "error"]);
  });
});

describe("extracción de las reglas del AGENTS.md previo", () => {
  /** El caso real: título, preámbulo, secciones y un ejemplo cercado. */
  const previo = [
    "# crm-valment",
    "",
    "Sistema de gestión con backend Django.",
    "",
    "## Stack",
    "",
    "Django 5.2 y Angular 14.",
    "",
    "```bash",
    "## esto no es una sección",
    "valmen sync",
    "```",
    "",
    "## Invariantes",
    "",
    "El saldo no se edita a mano.",
    "",
  ].join("\n");

  it("una sección de nivel 2 por archivo, con su título y su cuerpo", () => {
    write("AGENTS.md", previo);
    const extraccion = extractRules(lab);

    expect(extraccion.source).toBe("AGENTS.md");
    expect(extraccion.files.map((uno) => uno.path)).toEqual([
      ".valmen/rules/crm-valment.md",
      ".valmen/rules/stack.md",
      ".valmen/rules/invariantes.md",
    ]);

    const stack = extraccion.files.find((uno) => uno.path === ".valmen/rules/stack.md");
    expect(stack?.content).toContain("# Stack");
    expect(stack?.content).toContain("Django 5.2 y Angular 14.");
  });

  it("un encabezado dentro de un cerco no abre una sección nueva", () => {
    write("AGENTS.md", previo);
    const extraccion = extractRules(lab);

    const stack = extraccion.files.find((uno) => uno.path === ".valmen/rules/stack.md");
    // El ejemplo viaja entero dentro de su sección: partirlo perdería el bloque.
    expect(stack?.content).toContain("## esto no es una sección");
    expect(stack?.content).toContain("valmen sync");
    expect(extraccion.files.some((uno) => uno.path.includes("esto-no-es"))).toBe(false);
  });

  it("no pisa una regla preexistente y la informa como salteada", () => {
    write("AGENTS.md", previo);
    write(".valmen/rules/stack.md", "# Stack\n\nLo que el proyecto ya decidió.\n");

    const extraccion = extractRules(lab);
    expect(extraccion.skipped.map((uno) => uno.path)).toEqual([".valmen/rules/stack.md"]);
    expect(extraccion.files.some((uno) => uno.path === ".valmen/rules/stack.md")).toBe(false);
  });

  it("un AGENTS.md ya generado por el harness no aporta reglas", () => {
    // Sus reglas ya viven en `.valmen/rules/`: extraerlas de nuevo duplicaría el
    // flujo de trabajo del harness dentro de las reglas del proyecto.
    write(
      "AGENTS.md",
      "<!-- GENERADO POR valmen — NO EDITAR A MANO -->\n\n# Demo\n\n## Flujo de trabajo\n\n…\n",
    );
    expect(extractRules(lab).files).toEqual([]);
  });

  it("sin AGENTS.md previo no hay nada que extraer", () => {
    const extraccion = extractRules(lab);
    expect(extraccion.source).toBeNull();
    expect(extraccion.files).toEqual([]);
  });
});

describe("adopt con reglas y comandos del stack", () => {
  it("deja las reglas extraídas en .valmen/rules/ sin tocar el AGENTS.md", () => {
    scaffoldRealProject();
    write("BackEnd/manage.py", "#!/usr/bin/env python\n");
    const agents = "# Demo\n\n## Stack\n\nDjango.\n";
    write("AGENTS.md", agents);

    const result = adoptProject(lab, "Demo");
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(lab, ".valmen", "rules", "stack.md"), "utf8")).toContain(
      "Django.",
    );
    expect(readFileSync(join(lab, "AGENTS.md"), "utf8")).toBe(agents);
    expect(result.stdout).toContain(".valmen/rules/stack.md");
  });

  it("sugiere la plantilla cuando el stack coincide", () => {
    write("BackEnd/requirements.txt", "Django==5.2.1\n");
    write("BackEnd/manage.py", "#!/usr/bin/env python\n");
    write("FrontEnd/angular.json", "{}\n");

    expect(adoptProject(lab, "Demo").stdout).toContain("django-angular-multitenant");
  });

  it("con --dry-run informa las reglas pero no las escribe", () => {
    write("AGENTS.md", "# Demo\n\n## Stack\n\nDjango.\n");

    const result = adoptProject(lab, "Demo", { dryRun: true });
    expect(result.stdout).toContain(".valmen/rules/stack.md");
    expect(existsSync(join(lab, ".valmen"))).toBe(false);
  });

  it("adopt y luego sync devuelven la sección extraída al AGENTS.md", () => {
    write("AGENTS.md", "# Demo\n\n## Stack\n\nDjango 5.2.\n");
    adoptProject(lab, "Demo");
    expect(syncProject(lab, "Demo", false).exitCode).toBe(0);

    const generado = readFileSync(join(lab, "AGENTS.md"), "utf8");
    expect(generado).toContain("## Stack");
    expect(generado).toContain("Django 5.2.");
  });
});
