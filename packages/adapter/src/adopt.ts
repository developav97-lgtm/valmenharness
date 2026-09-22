/**
 * Adopción de un proyecto existente.
 *
 * El problema: toda configuración agéntica mezcla dos cosas —el *cómo* se
 * trabaja (del harness) y el *qué* es este sistema (del proyecto)— y migrar de
 * herramienta obliga a separarlas a mano.
 *
 * La adopción hace esa separación de forma explícita y auditable. Regla dura:
 * **nada se borra y nada se mueve sin que el usuario lo vea**. Lo que no se
 * gestiona se deja intacto; lo que se reemplaza queda referenciado.
 *
 * Ninguna detección llama a un modelo: es todo análisis de archivos. Un modelo
 * se reserva para lo que el código no puede decidir, y aquí el código sí puede.
 *
 * Ver docs/08-ADOPCION.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Un manifiesto o archivo de configuración encontrado en el proyecto. */
export interface DetectedFile {
  /** Ruta relativa a la raíz, con separadores POSIX. */
  readonly path: string;
  /** Qué aporta al perfil. */
  readonly kind: string;
}

/** Una dependencia clave detectada, con su versión si se pudo leer. */
export interface DetectedDependency {
  readonly name: string;
  readonly version: string;
  /** Archivo del que se leyó. */
  readonly source: string;
}

/** Configuración agéntica preexistente que la adopción **no** toca. */
export interface LegacyConfig {
  readonly path: string;
  readonly kind: string;
  /** `true` si el proyecto ya lo marca como legado en su propia cabecera. */
  readonly selfDeclaredLegacy: boolean;
}

/** Perfil del proyecto, derivado solo de lo que hay en disco. */
export interface ProjectProfile {
  readonly name: string;
  readonly detectedFiles: readonly DetectedFile[];
  readonly dependencies: readonly DetectedDependency[];
  readonly legacyConfigs: readonly LegacyConfig[];
  /** Capacidades detectadas, para el resumen. */
  readonly capabilities: readonly string[];
}

/** Directorios donde se buscan manifiestos, en orden de preferencia. */
const MANIFEST_DIRS = [
  "",
  "BackEnd",
  "backend",
  "server",
  "api",
  "FrontEnd",
  "frontend",
  "web",
  "app",
  "WebSocket",
  "LocalAgents",
  "tools",
  "scripts",
];

/** Manifiestos reconocidos y qué aportan. */
const MANIFESTS: readonly { file: string; kind: string }[] = [
  { file: "package.json", kind: "dependencias Node" },
  { file: "requirements.txt", kind: "dependencias Python" },
  { file: "pyproject.toml", kind: "proyecto Python" },
  { file: "go.mod", kind: "módulo Go" },
  { file: "Dockerfile", kind: "imagen de contenedor" },
  { file: "docker-compose.yml", kind: "orquestación local" },
  { file: ".nvmrc", kind: "versión de Node" },
  { file: "Gemfile", kind: "dependencias Ruby" },
  { file: "pom.xml", kind: "proyecto Java" },
];

/** Configuración agéntica preexistente que la adopción debe reconocer. */
const AGENTIC_CONFIGS: readonly { path: string; kind: string }[] = [
  { path: "AGENTS.md", kind: "instrucciones de agente" },
  { path: "CLAUDE.md", kind: "instrucciones de Claude Code" },
  { path: ".claude", kind: "configuración de Claude Code" },
  { path: ".codex", kind: "configuración de Codex" },
  { path: ".opencode", kind: "configuración de opencode" },
  { path: ".agents", kind: "skills y reglas compartidas" },
  { path: ".cursor", kind: "configuración de Cursor" },
  { path: ".github/copilot-instructions.md", kind: "instrucciones de Copilot" },
];

/** Tecnologías reconocidas por el nombre de la dependencia. */
const KNOWN_DEPENDENCIES: readonly string[] = [
  "django",
  "djangorestframework",
  "django-tenants",
  "django-tenant-schemas",
  "psycopg2",
  "psycopg",
  "celery",
  "pytest",
  "angular",
  "@angular/core",
  "@angular/material",
  "react",
  "next",
  "vue",
  "typescript",
  "express",
  "fastapi",
  "flask",
  "sqlalchemy",
];

/** Lee un archivo de texto, o `null` si no se puede. */
function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Extrae versiones de un `requirements.txt`. */
function parseRequirements(text: string, source: string): DetectedDependency[] {
  const found: DetectedDependency[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("-")) continue;
    const match = /^([A-Za-z0-9._-]+)\s*(?:==|>=|~=|===)\s*([^\s;#]+)/.exec(
      line,
    );
    if (match === null) continue;
    const name = (match[1] as string).toLowerCase();
    if (!KNOWN_DEPENDENCIES.includes(name)) continue;
    found.push({ name, version: match[2] as string, source });
  }
  return found;
}

/** Extrae versiones de un `package.json`. */
function parsePackageJson(text: string, source: string): DetectedDependency[] {
  const found: DetectedDependency[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    // Un package.json ilegible no debe abortar la adopción: se informa y sigue.
    return found;
  }
  if (typeof data !== "object" || data === null) return found;

  const record = data as Record<string, unknown>;
  const sections = ["dependencies", "devDependencies"] as const;
  for (const section of sections) {
    const dependencies = record[section];
    if (typeof dependencies !== "object" || dependencies === null) continue;
    for (const [name, version] of Object.entries(
      dependencies as Record<string, unknown>,
    )) {
      const key = name.toLowerCase();
      if (!KNOWN_DEPENDENCIES.includes(key)) continue;
      found.push({
        name: key,
        version:
          typeof version === "string" ? version.replace(/^[\^~]/, "") : "?",
        source,
      });
    }
  }
  return found;
}

/** Detecta los manifiestos y las dependencias clave del proyecto. */
export function detectFiles(root: string): {
  files: DetectedFile[];
  dependencies: DetectedDependency[];
} {
  const files: DetectedFile[] = [];
  const dependencies: DetectedDependency[] = [];
  // En macOS y Windows el sistema de archivos no distingue mayúsculas, así que
  // `BackEnd` y `backend` resuelven al mismo directorio: sin esta guarda, cada
  // manifiesto se contaría dos veces y las dependencias se duplicarían.
  const seen = new Set<string>();

  for (const directory of MANIFEST_DIRS) {
    const base = directory === "" ? root : join(root, directory);
    if (!existsSync(base)) continue;
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }

    for (const manifest of MANIFESTS) {
      if (!entries.includes(manifest.file)) continue;

      const absolute = join(base, manifest.file);
      let identity: string;
      try {
        identity = statSync(absolute).ino.toString();
      } catch {
        identity = absolute;
      }
      if (seen.has(identity)) continue;
      seen.add(identity);

      const relative =
        directory === "" ? manifest.file : `${directory}/${manifest.file}`;
      files.push({ path: relative, kind: manifest.kind });

      const text = readOrNull(absolute);
      if (text === null) continue;
      if (manifest.file === "requirements.txt") {
        dependencies.push(...parseRequirements(text, relative));
      } else if (manifest.file === "package.json") {
        dependencies.push(...parsePackageJson(text, relative));
      }
    }
  }

  return { files, dependencies };
}

/** Detecta configuración agéntica preexistente, sin tocarla. */
export function detectLegacyConfigs(root: string): LegacyConfig[] {
  const found: LegacyConfig[] = [];

  for (const candidate of AGENTIC_CONFIGS) {
    const absolute = join(root, candidate.path);
    if (!existsSync(absolute)) continue;

    // Un archivo puede declararse legado en su propia cabecera. Respetar esa
    // declaración evita proponer como fuente algo que el proyecto ya descartó.
    let selfDeclaredLegacy = false;
    if (statSync(absolute).isFile()) {
      const head = (readOrNull(absolute) ?? "").slice(0, 800).toLowerCase();
      selfDeclaredLegacy =
        head.includes("legado") ||
        head.includes("legacy") ||
        head.includes("deprecat");
    }

    found.push({
      path: candidate.path,
      kind: candidate.kind,
      selfDeclaredLegacy,
    });
  }

  return found;
}

/** Construye el perfil del proyecto. */
export function profileProject(root: string, name: string): ProjectProfile {
  const { files, dependencies } = detectFiles(root);
  const legacyConfigs = detectLegacyConfigs(root);

  const capabilities: string[] = [];
  if (
    files.some(
      (file) =>
        file.path.endsWith("docker-compose.yml") ||
        file.path.endsWith("Dockerfile"),
    )
  ) {
    capabilities.push("contenedores");
  }
  if (existsSync(join(root, ".github", "workflows")))
    capabilities.push("GitHub Actions");
  if (files.some((file) => file.path.includes("buildspec")))
    capabilities.push("CodeBuild");
  if (existsSync(join(root, ".codegraph"))) capabilities.push("CodeGraph");
  if (
    existsSync(join(root, "migrations")) ||
    existsSync(join(root, "BackEnd", "migrations"))
  ) {
    capabilities.push("migraciones de base de datos");
  }

  return {
    name,
    detectedFiles: files,
    dependencies,
    legacyConfigs,
    capabilities,
  };
}

/**
 * Propone el contenido de `.valmen/config.yaml`.
 *
 * Solo incluye lo que se detectó: una configuración con valores inventados
 * sería peor que una mínima, porque el usuario creería que el harness sabe algo
 * que en realidad no comprobó.
 */
export function proposeConfig(
  profile: ProjectProfile,
  ticketsDir: string,
): string {
  const lines = [
    "# Configuración del harness en este proyecto.",
    "#",
    "# Generado por `valmen adopt`. Revise y ajuste lo que corresponda:",
    "# el harness solo escribió lo que pudo comprobar en el disco.",
    "",
    `name: ${profile.name}`,
    `tickets-dir: ${ticketsDir}`,
    "",
  ];

  if (profile.dependencies.length > 0) {
    lines.push(
      "# Dependencias clave detectadas. No son una regla: son un punto de partida",
      "# para escribir `.valmen/rules/stack.md`.",
    );
    for (const dependency of profile.dependencies) {
      lines.push(
        `#   ${dependency.name} ${dependency.version}  (${dependency.source})`,
      );
    }
    lines.push("");
  }

  if (profile.capabilities.length > 0) {
    lines.push("# Capacidades detectadas:");
    for (const capability of profile.capabilities)
      lines.push(`#   ${capability}`);
    lines.push("");
  }

  lines.push(
    "# Gates del proyecto. Empiezan sin configurar a propósito: el modo por",
    "# defecto de un gate es humano, y automatizarlo es una decisión que se toma",
    "# con evidencia, no al adoptar.",
    "gates: []",
    "",
    "# Modelos que este proyecto quiere tener a mano en el selector, por proveedor.",
    "#",
    "# Hace falta para los proveedores que no publican su catálogo —codex no lo",
    "# publica—, y sirve además para subir arriba los que se usan de verdad. El",
    "# identificador tiene que ser el que acepta el proveedor: se comprueba con el",
    "# botón «Probar» de Mission Control antes de fiarse.",
    "#",
    "# providers:",
    "#   codex:",
    "#     candidates:",
    "#       - gpt-5.6-terra",
    "#       - gpt-5.6-sol",
    "",
  );

  return lines.join("\n");
}

/** Rutas que la adopción crea, para el informe. */
export interface AdoptPlan {
  readonly configPath: string;
  readonly rulesDir: string;
  readonly legacyDir: string;
  readonly agentsPath: string;
}

/** Calcula las rutas del plan de adopción. */
export function adoptPlan(root: string): AdoptPlan {
  return {
    configPath: join(root, ".valmen", "config.yaml"),
    rulesDir: join(root, ".valmen", "rules"),
    legacyDir: join(root, ".valmen", "legacy"),
    agentsPath: join(root, "AGENTS.md"),
  };
}
