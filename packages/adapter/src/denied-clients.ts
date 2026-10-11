/**
 * La lista única de lo que el harness niega, traducida a Codex y a OpenCode, y el reporte de lo
 * que no se pudo aplicar.
 *
 * La lista vive en `@valmen/core` sin la sintaxis de ningún cliente; el adaptador de Claude Code
 * la traduce en `claude-code.ts` y este módulo hace lo mismo para los otros dos:
 *
 * - Codex solo expresa prefijos de comando (`prefix_rule` en `.codex/rules/valmen.rules`). Las
 *   rutas de lectura y edición exigirían un perfil de permisos que cambia el sandbox de toda sesión
 *   (decisión D-1 del PO), y `git push +` no es un prefijo de argumentos completo: ambas se
 *   reportan como no aplicadas en vez de callarse.
 * - OpenCode lo expresa todo con `permission.read`, `permission.edit` y `permission.bash`, en
 *   `.opencode/opencode.json` (que carga después del `opencode.json` de la raíz) y en cada agente
 *   proyectado. Gana la última regla que casa, así que las del harness van al final.
 *
 * `.opencode/opencode.json` también lo escribe la persona, así que se fusiona (R-PER-002): solo se
 * suman claves ausentes, una clave existente con otro valor no se toca y se reporta.
 */
import {
  DENIED_GIT_CLEAN_EXACT_FORMS,
  DENIED_GIT_COMMANDS,
  SENSITIVE_PATH_GLOBS,
  fail,
} from "@valmen/core";

export const CODEX_RULES_PATH = ".codex/rules/valmen.rules";
export const OPENCODE_CONFIG_PATH = ".opencode/opencode.json";
export const OPENCODE_JSONC_PATH = ".opencode/opencode.jsonc";

export type DenyClient = "codex" | "opencode";

/** Una regla del harness que un cliente no aplica, con el motivo. */
export interface DenyNotApplied {
  readonly cliente: DenyClient;
  readonly regla: string;
  readonly motivo: string;
}

/** El aviso fijo de cada cliente: lo que la proyección no puede garantizar aunque aplique. */
export const DENY_CLIENT_NOTICE: Readonly<Record<DenyClient, string>> = Object.freeze({
  codex:
    "Codex solo lee estas reglas con la forma canónica del comando y en un proyecto de confianza.",
  opencode:
    "los agentes propios de la persona no heredan read ni edit: la protección de lectura y edición vale en los agentes que proyecta el harness. El shell niega por mención: todo comando que nombra una ruta sensible, también los legítimos.",
});

type Tool = "read" | "edit" | "bash";
const TOOLS: readonly Tool[] = ["read", "edit", "bash"];

const PUSH_REFSPEC = "git push +";
const MOTIVO_PUSH_REFSPEC =
  "un prefijo de argumentos de Codex no casa parte de un argumento (git push origin +main)";
const MOTIVO_RUTAS_CODEX =
  "negar leer o editar una ruta exige un perfil de permisos que cambia el sandbox de toda sesión de Codex";
/**
 * El límite conocido de Claude Code, que `sync` y `doctor` dicen aparte de lo no aplicado de Codex
 * y OpenCode (un proyecto solo con Claude Code no tiene nada «no aplicado» que listar): un patrón
 * de Bash que empieza por git no ve `env git clean -f` ni `command git clean -f`.
 */
export const CLAUDE_CLEAN_LIMIT =
  "git clean tras env o command sigue permitido en Claude Code: un patrón de Bash que empieza por git no lo ve (límite conocido, decisión del PO del 2026-10-10)";

const CLEAN_ENVOLTORIO = "git clean tras env o command";
const MOTIVO_CLEAN_ENVOLTORIO =
  "límite conocido (decisión del PO, 2026-10-10): un patrón que empieza por git no casa env git clean -f ni command git clean -f";
const CLEAN_CODEX =
  "git clean con otras combinaciones de banderas, opciones globales o envoltorio";
const MOTIVO_CLEAN_CODEX =
  "un prefijo de argumentos de Codex casa argumentos completos: solo niega git clean con las banderas -f, --force y las combinaciones de f con d, x y X escritas tal cual, sin opciones globales de git (-C, -c) ni envoltorio (env, command) ni otras banderas en el mismo grupo";
const MOTIVO_JSONC = `existe ${OPENCODE_JSONC_PATH}: reescribirlo perdería sus comentarios`;

/** Las formas de git que Codex puede negar como prefijo de comando. */
function gitFormsForCodex(): string[] {
  return [
    ...DENIED_GIT_COMMANDS.filter((forma) => forma !== PUSH_REFSPEC),
    ...DENIED_GIT_CLEAN_EXACT_FORMS,
  ];
}

/** El contenido de `.codex/rules/valmen.rules`: una `prefix_rule` prohibida por forma expresable. */
export function codexRulesText(): string {
  const reglas = gitFormsForCodex().map((forma) => {
    const patron = forma
      .split(" ")
      .map((parte) => JSON.stringify(parte))
      .join(", ");
    return [
      "prefix_rule(",
      `    pattern = [${patron}],`,
      '    decision = "forbidden",',
      `    justification = ${JSON.stringify(`valmen: «${forma}» nunca se automatiza; lo ejecuta una persona.`)},`,
      ")",
    ].join("\n");
  });
  return [
    "# GENERADO por `valmen sync` desde la lista de denegaciones del harness. No editar.",
    `# ${DENY_CLIENT_NOTICE.codex}`,
    "",
    reglas.join("\n\n"),
    "",
  ].join("\n");
}

/** Un glob del harness como patrones de OpenCode: allí el asterisco cruza las barras y un prefijo de dos asteriscos con barra no casa la raíz. */
function opencodePathPatterns(glob: string): string[] {
  if (glob.startsWith("**/")) {
    const resto = glob.slice(3);
    return resto.startsWith("*") ? [resto] : [resto, `*/${resto}`];
  }
  return [glob.replace(/\*\*$/, "*")];
}

/**
 * El patrón de mención de un glob del harness para `bash`: todo comando que nombre la ruta queda
 * denegado, sea cual sea el lector (`cat .env`, `cd . && cat ./.env`). OpenCode no aplica a su
 * shell las reglas de `read`, y Claude Code sí lo hace por su cuenta. Frena también un comando
 * legítimo que nombra la ruta (`git check-ignore .env`) y no ve lo que la oculta (`python -c`).
 */
function opencodeMentionPattern(glob: string): string {
  const base = glob.replace(/^(\*\*\/|~\/)/, "").replace(/\/\*\*$/, "/");
  return `*${base.replace(/^\*/, "").replace(/\*+$/, "")}*`;
}

/** Los cuatro patrones `bash` de una forma de git, como en Claude Code. */
function opencodeGitPatterns(forma: string): string[] {
  const [git, operacion, bandera] = forma.split(" ") as [string, string, string];
  return [
    `${git} ${operacion} ${bandera}*`,
    `${git} ${operacion} * ${bandera}*`,
    `${git} * ${operacion} ${bandera}*`,
    `${git} * ${operacion} * ${bandera}*`,
  ];
}

interface OpencodeRule {
  readonly regla: string;
  readonly tool: Tool;
  readonly patrones: readonly string[];
}

function opencodeRules(): OpencodeRule[] {
  const reglas: OpencodeRule[] = [];
  for (const tool of ["read", "edit"] as const) {
    for (const glob of SENSITIVE_PATH_GLOBS) {
      reglas.push({ regla: `${tool} ${glob}`, tool, patrones: opencodePathPatterns(glob) });
    }
  }
  // Las rutas van antes que las formas de git: la última clave de `bash` sigue siendo la de git clean.
  for (const glob of SENSITIVE_PATH_GLOBS) {
    reglas.push({
      regla: `bash ${glob}`,
      tool: "bash",
      patrones: [opencodeMentionPattern(glob)],
    });
  }
  for (const forma of DENIED_GIT_COMMANDS) {
    reglas.push({ regla: forma, tool: "bash", patrones: opencodeGitPatterns(forma) });
  }
  return reglas;
}

type DenyObjects = Record<Tool, Record<string, string>>;

/** Los objetos `read`, `edit` y `bash` de las denegaciones, en el orden de la lista. */
export function opencodeDenyPermission(): DenyObjects {
  const objetos: DenyObjects = { read: {}, edit: {}, bash: {} };
  for (const regla of opencodeRules()) {
    for (const patron of regla.patrones) objetos[regla.tool][patron] = "deny";
  }
  return objetos;
}

/** El bloque `permission` de un agente de OpenCode: la base de hoy como `"*"` y las denegaciones después. */
export function opencodeAgentPermission(write: boolean, execute: boolean): DenyObjects {
  const denegadas = opencodeDenyPermission();
  return {
    read: { "*": "allow", ...denegadas.read },
    edit: { "*": write ? "allow" : "deny", ...denegadas.edit },
    bash: { "*": execute ? "allow" : "ask", ...denegadas.bash },
  };
}

interface Analisis {
  /** El objeto completo del archivo, o `null` si no existe. */
  readonly objeto: Record<string, unknown> | null;
  /** Claves a sumar por herramienta. */
  readonly suma: Record<Tool, Record<string, string>>;
  /** Reglas que la persona dejó con otro valor, o escritas como texto. */
  readonly choques: ReadonlySet<string>;
  /** Si `permission` es texto: no se convierte. */
  readonly permisoTexto: boolean;
}

function analizar(actual: string | null): Analisis {
  const suma: Record<Tool, Record<string, string>> = { read: {}, edit: {}, bash: {} };
  const choques = new Set<string>();
  const reglas = opencodeRules();

  let objeto: Record<string, unknown> | null = null;
  if (actual !== null && actual.trim() !== "") {
    let datos: unknown;
    try {
      datos = JSON.parse(actual);
    } catch {
      fail(
        `${OPENCODE_CONFIG_PATH} no es JSON válido; corríjalo y vuelva a ejecutar \`valmen sync\`. ` +
          "No se sobrescribió.",
      );
    }
    if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
      fail(`${OPENCODE_CONFIG_PATH} debe ser un objeto JSON; no se sobrescribió.`);
    }
    objeto = datos as Record<string, unknown>;
  }

  const permiso = objeto?.["permission"];
  if (typeof permiso === "string") {
    for (const regla of reglas) choques.add(regla.regla);
    return { objeto, suma, choques, permisoTexto: true };
  }
  if (
    permiso !== undefined &&
    (typeof permiso !== "object" || permiso === null || Array.isArray(permiso))
  ) {
    fail(
      `${OPENCODE_CONFIG_PATH}: «permission» debe ser un objeto o un texto; no se sobrescribió.`,
    );
  }
  const porHerramienta = (permiso ?? {}) as Record<string, unknown>;

  for (const tool of TOOLS) {
    const valor = porHerramienta[tool];
    const delTool = reglas.filter((regla) => regla.tool === tool);
    if (typeof valor === "string") {
      for (const regla of delTool) choques.add(regla.regla);
      continue;
    }
    if (
      valor !== undefined &&
      (typeof valor !== "object" || valor === null || Array.isArray(valor))
    ) {
      fail(
        `${OPENCODE_CONFIG_PATH}: «permission.${tool}» debe ser un objeto o un texto; no se sobrescribió.`,
      );
    }
    const existente = (valor ?? {}) as Record<string, unknown>;
    for (const regla of delTool) {
      for (const patron of regla.patrones) {
        if (!(patron in existente)) suma[tool][patron] = "deny";
        else if (existente[patron] !== "deny") choques.add(regla.regla);
      }
    }
  }
  return { objeto, suma, choques, permisoTexto: false };
}

/**
 * Fusiona las denegaciones con `.opencode/opencode.json` (R-PER-002): suma al final las claves
 * ausentes, no toca las existentes ni lo que no es del harness, y sin nada que sumar devuelve el
 * texto tal cual para que `--check` compare sin lógica aparte.
 */
export function mergeOpencodeDenyConfig(actual: string | null): string {
  const { objeto, suma } = analizar(actual);
  if (
    actual !== null &&
    objeto !== null &&
    TOOLS.every((tool) => Object.keys(suma[tool]).length === 0)
  ) {
    return actual;
  }
  if (objeto === null) {
    return `${JSON.stringify({ permission: opencodeDenyPermission() }, null, 2)}\n`;
  }
  const permiso = objeto["permission"];
  if (typeof permiso === "string") return actual as string;

  const nuevo: Record<string, unknown> = {
    ...(permiso as Record<string, unknown> | undefined),
  };
  for (const tool of TOOLS) {
    const valor = nuevo[tool];
    if (typeof valor === "string") continue;
    if (Object.keys(suma[tool]).length === 0) continue;
    nuevo[tool] = { ...(valor as Record<string, unknown> | undefined), ...suma[tool] };
  }
  return `${JSON.stringify({ ...objeto, permission: nuevo }, null, 2)}\n`;
}

/** Los patrones de OpenCode que `.opencode/opencode.json` no trae hoy y `sync` agregaría. */
export function missingOpencodeDenyRules(actual: string | null): string[] {
  const { suma } = analizar(actual);
  return TOOLS.flatMap((tool) =>
    Object.keys(suma[tool]).map((patron) => `${tool}:${patron}`),
  );
}

/**
 * Lo que cada cliente no aplica, con su motivo: Codex siempre las rutas y `git push +`; OpenCode,
 * las reglas que la persona dejó con otro valor o escritas como texto, o todas si existe el JSONC.
 */
export function denyNotApplied(
  runtimes: readonly string[],
  opencodeActual: string | null,
  hayJsonc: boolean,
): DenyNotApplied[] {
  const salida: DenyNotApplied[] = [];
  if (runtimes.includes("codex")) {
    for (const tool of ["read", "edit"] as const) {
      for (const glob of SENSITIVE_PATH_GLOBS) {
        salida.push({
          cliente: "codex",
          regla: `${tool} ${glob}`,
          motivo: MOTIVO_RUTAS_CODEX,
        });
      }
    }
    if (DENIED_GIT_COMMANDS.includes(PUSH_REFSPEC)) {
      salida.push({ cliente: "codex", regla: PUSH_REFSPEC, motivo: MOTIVO_PUSH_REFSPEC });
    }
    salida.push({ cliente: "codex", regla: CLEAN_CODEX, motivo: MOTIVO_CLEAN_CODEX });
  }
  if (runtimes.includes("opencode")) {
    if (hayJsonc) {
      for (const regla of opencodeRules()) {
        salida.push({ cliente: "opencode", regla: regla.regla, motivo: MOTIVO_JSONC });
      }
    } else {
      const { choques, permisoTexto } = analizar(opencodeActual);
      for (const regla of opencodeRules()) {
        if (!choques.has(regla.regla)) continue;
        salida.push({
          cliente: "opencode",
          regla: regla.regla,
          motivo: permisoTexto
            ? `${OPENCODE_CONFIG_PATH} escribe «permission» como texto y no se convierte`
            : `${OPENCODE_CONFIG_PATH} ya tiene una clave de esta regla con otro valor, o «permission.${regla.tool}» como texto`,
        });
      }
    }
    salida.push({
      cliente: "opencode",
      regla: CLEAN_ENVOLTORIO,
      motivo: MOTIVO_CLEAN_ENVOLTORIO,
    });
  }
  return salida;
}
