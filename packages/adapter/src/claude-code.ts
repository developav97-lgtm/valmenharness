/**
 * Lo que `valmen sync` proyecta para Claude Code además de agentes y skills: un
 * estilo de salida, su activación y las denegaciones del harness en
 * `settings.json`, un bloque gestionado en `CLAUDE.md` y la línea de
 * `.worktreeinclude` que lleva `settings.json` a los worktrees.
 *
 * Los tres últimos archivos mezclan lo que escribió la persona con lo del harness,
 * así que no se proyectan enteros: se **fusionan** con el contenido actual. Que la
 * fusión sea idempotente —aplicarla a su propio resultado devuelve el mismo
 * texto— es lo que permite comparar con el disco sin una lógica aparte para
 * `--check`.
 *
 * La lista de lo que se niega vive en `@valmen/core` sin la sintaxis de ningún
 * cliente; la traducción a reglas de Claude Code (`Read`, `Edit` y `Bash`) vive aquí.
 */
import { DENIED_GIT_COMMANDS, SENSITIVE_PATH_GLOBS, fail } from "@valmen/core";

import {
  RESPONSE_CONTRACT_PRECEDENCE,
  RESPONSE_CONTRACT_RULES,
  RESPONSE_CONTRACT_TITLE,
} from "./templates.js";

/** Nombre del estilo de salida y valor de `outputStyle`. */
export const OUTPUT_STYLE_NAME = "valmen";

/** Ruta del estilo de salida, relativa a la raíz del proyecto. */
export const OUTPUT_STYLE_PATH = `.claude/output-styles/${OUTPUT_STYLE_NAME}.md`;

export const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
export const CLAUDE_MD_PATH = "CLAUDE.md";

/**
 * El archivo con el que Claude Code decide qué ignorado copia a los worktrees que él crea
 * (`claude -w`, la app de escritorio): una línea por ruta, con la sintaxis de `.gitignore`.
 */
export const WORKTREE_INCLUDE_PATH = ".worktreeinclude";

export const CLAUDE_MD_BEGIN = "<!-- valmen:inicio (gestionado por `valmen sync`; no editar) -->";
export const CLAUDE_MD_END = "<!-- valmen:fin -->";

/** El estilo de salida: el contrato de respuesta, con la misma fuente que `AGENTS.md`. */
export function renderOutputStyle(): string {
  return [
    "---",
    `name: ${OUTPUT_STYLE_NAME}`,
    "description: Respuestas cortas: la respuesta primero, decisiones como opción y efecto, evidencia citada.",
    "keep-coding-instructions: true",
    "---",
    "",
    `# ${RESPONSE_CONTRACT_TITLE}`,
    "",
    RESPONSE_CONTRACT_PRECEDENCE,
    "",
    ...RESPONSE_CONTRACT_RULES.map((regla) => `- ${regla}`),
    "",
  ].join("\n");
}

/**
 * Las reglas `permissions.deny` de Claude Code que el harness proyecta, en su orden: `Read` y
 * `Edit` por cada glob de `SENSITIVE_PATH_GLOBS` y, por cada forma `git <operación> <bandera>`
 * de `DENIED_GIT_COMMANDS`, cuatro reglas `Bash`.
 *
 * Las cuatro cubren la bandera tras otros argumentos y las opciones globales de git antes de la
 * operación (`git -C . reset --hard`, `git -c k=v push --force`), que una sola regla deja pasar.
 * Un patrón que termina en `:*` se leería como la sintaxis antigua de prefijo, así que el
 * borrado remoto con `git push origin :rama` no se puede expresar; está declarado en el ticket.
 */
export function claudeDenyRules(): readonly string[] {
  const reglas: string[] = [];
  for (const glob of SENSITIVE_PATH_GLOBS) reglas.push(`Read(${glob})`);
  for (const glob of SENSITIVE_PATH_GLOBS) reglas.push(`Edit(${glob})`);
  for (const forma of DENIED_GIT_COMMANDS) {
    const { operacion, bandera } = partesDeForma(forma);
    reglas.push(
      `Bash(git ${operacion} ${bandera}*)`,
      `Bash(git ${operacion} * ${bandera}*)`,
      `Bash(git * ${operacion} ${bandera}*)`,
      `Bash(git * ${operacion} * ${bandera}*)`,
    );
  }
  return reglas;
}

/** `git push --force` → operación `push`, bandera `--force`. Una forma mal escrita no se adivina. */
function partesDeForma(forma: string): { operacion: string; bandera: string } {
  const [git, operacion, bandera, ...resto] = forma.split(" ");
  if (git !== "git" || operacion === undefined || bandera === undefined || resto.length > 0) {
    fail(`La forma de git denegada «${forma}» no tiene el formato «git <operación> <bandera>».`);
  }
  return { operacion, bandera };
}

/**
 * Las claves `allow` y `deny` de `permissions` en el texto de `settings.json`, sin fallar: un
 * archivo ausente, que no parsea o con otra forma no tiene ninguna regla que contar.
 */
function permisosDe(actual: string | null): { allow: string[]; deny: string[] } {
  const vacio = { allow: [] as string[], deny: [] as string[] };
  if (actual === null || actual.trim() === "") return vacio;
  let datos: unknown;
  try {
    datos = JSON.parse(actual);
  } catch {
    return vacio;
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) return vacio;
  const permisos = (datos as Record<string, unknown>)["permissions"];
  if (typeof permisos !== "object" || permisos === null || Array.isArray(permisos)) return vacio;
  const textos = (valor: unknown): string[] =>
    Array.isArray(valor) ? valor.filter((regla): regla is string => typeof regla === "string") : [];
  return {
    allow: textos((permisos as Record<string, unknown>)["allow"]),
    deny: textos((permisos as Record<string, unknown>)["deny"]),
  };
}

/**
 * Las reglas del harness que faltan en `permissions.deny` del texto de `settings.json`: todas si
 * no hay archivo, ninguna si ya están las 64. Una regla cuenta por igualdad exacta de texto.
 */
export function missingClaudeDenyRules(actual: string | null): readonly string[] {
  const presentes = new Set(permisosDe(actual).deny);
  return claudeDenyRules().filter((regla) => !presentes.has(regla));
}

/** Un patrón de `Bash(...)` como expresión regular: `*` es cualquier texto y un `:*` final, un `*`. */
function patronDeBash(patron: string): RegExp {
  const fuente = patron
    .replace(/:\*$/, "*")
    .split("*")
    .map((trozo) => trozo.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${fuente}$`);
}

/** Un glob de ruta como expresión regular: `**` cruza directorios y `*` no. */
function globDeRuta(glob: string): RegExp {
  let fuente = "";
  for (let i = 0; i < glob.length; i++) {
    const caracter = glob.charAt(i);
    if (caracter === "*" && glob.charAt(i + 1) === "*") {
      if (glob.charAt(i + 2) === "/") {
        fuente += "(?:.*/)?";
        i += 2;
      } else {
        fuente += ".*";
        i += 1;
      }
    } else if (caracter === "*") fuente += "[^/]*";
    else if (caracter === "?") fuente += "[^/]";
    else fuente += caracter.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${fuente}$`);
}

/** Una ruta que el glob del harness cubre, para ver si una `allow` también la cubre. */
function rutaDeEjemplo(glob: string): string {
  return glob.startsWith("~/") ? glob.replace("**", "id_rsa") : glob.replace(/^\*\*\//, "").replace(/\*/g, "x");
}

/**
 * Un aviso por cada regla `allow` de la persona que contradice una denegación del harness.
 *
 * Es la duda que la persona tendría tras `sync`: una `allow` que cree vigente y que no lo es,
 * porque en Claude Code la `deny` gana. La regla no se toca —R-PER-002—; solo se dice. Una
 * `Bash(<patrón>)` contradice si su patrón cubre una forma de `DENIED_GIT_COMMANDS`; una `Read` o
 * `Edit`, si no lleva glob o si su glob cubre la ruta de ejemplo de uno de `SENSITIVE_PATH_GLOBS`.
 */
export function claudeAllowConflicts(actual: string | null): readonly string[] {
  const avisos: string[] = [];
  const aviso = (allow: string, deny: string): string =>
    `la regla allow «${allow}» de ${CLAUDE_SETTINGS_PATH} contradice la denegación del harness «${deny}»: ` +
    "Claude Code aplica la denegación (la deny gana a la allow) y la regla no se borró.";

  for (const allow of permisosDe(actual).allow) {
    const partes = /^(Bash|Read|Edit)(?:\((.*)\))?$/s.exec(allow);
    if (partes === null) continue;
    const herramienta = partes[1] as string;
    const patron = partes[2];

    if (herramienta === "Bash") {
      const cubre = patron === undefined ? undefined : patronDeBash(patron);
      for (const forma of DENIED_GIT_COMMANDS) {
        if (cubre !== undefined && !cubre.test(forma)) continue;
        const { operacion, bandera } = partesDeForma(forma);
        avisos.push(aviso(allow, `Bash(git ${operacion} ${bandera}*)`));
        break;
      }
      continue;
    }

    const normalizado = patron?.replace(/^\.\//, "").replace(/^\/(?!\/)/, "");
    const cubre = normalizado === undefined ? undefined : globDeRuta(normalizado);
    for (const glob of SENSITIVE_PATH_GLOBS) {
      if (cubre !== undefined && !cubre.test(rutaDeEjemplo(glob))) continue;
      avisos.push(aviso(allow, `${herramienta}(${glob})`));
      break;
    }
  }
  return avisos;
}

/**
 * Activa `outputStyle` y suma las denegaciones del harness en el texto de `settings.json`, sin
 * tocar las demás claves ni ninguna regla de la persona.
 *
 * Las reglas se suman **al final** de `permissions.deny`, en su orden y solo las que no estén
 * (igualdad exacta de texto): nunca se quita ni se reescribe una regla `deny` ni `allow` de la
 * persona (R-PER-002). Si `outputStyle` ya vale `valmen` y no falta ninguna regla, devuelve el
 * texto **tal cual**: reserializar cambiaría el formato que la persona eligió y `--check` lo
 * marcaría desactualizado para siempre. Un JSON que no parsea, o un `permissions` o un
 * `permissions.deny` con otra forma, no se sobrescribe: se falla nombrando el archivo.
 */
export function mergeClaudeSettings(actual: string | null): string {
  const reglas = claudeDenyRules();
  if (actual === null || actual.trim() === "") {
    return `${JSON.stringify({ outputStyle: OUTPUT_STYLE_NAME, permissions: { deny: reglas } }, null, 2)}\n`;
  }

  let datos: unknown;
  try {
    datos = JSON.parse(actual);
  } catch {
    fail(
      `${CLAUDE_SETTINGS_PATH} no es JSON válido; corríjalo y vuelva a ejecutar \`valmen sync\`. ` +
        "No se sobrescribió.",
    );
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    fail(`${CLAUDE_SETTINGS_PATH} debe ser un objeto JSON; no se sobrescribió.`);
  }

  const objeto = datos as Record<string, unknown>;
  const permisos = objeto["permissions"];
  let deny: string[] = [];
  if (permisos !== undefined) {
    if (typeof permisos !== "object" || permisos === null || Array.isArray(permisos)) {
      fail(`${CLAUDE_SETTINGS_PATH}: «permissions» debe ser un objeto; no se sobrescribió.`);
    }
    const actuales = (permisos as Record<string, unknown>)["deny"];
    if (actuales !== undefined) {
      if (!Array.isArray(actuales) || actuales.some((regla) => typeof regla !== "string")) {
        fail(`${CLAUDE_SETTINGS_PATH}: «permissions.deny» debe ser un arreglo de textos; no se sobrescribió.`);
      }
      deny = actuales as string[];
    }
  }

  const faltan = reglas.filter((regla) => !deny.includes(regla));
  if (objeto["outputStyle"] === OUTPUT_STYLE_NAME && faltan.length === 0) return actual;
  const permisosNuevos = { ...(permisos as Record<string, unknown> | undefined), deny: [...deny, ...faltan] };
  return `${JSON.stringify({ ...objeto, outputStyle: OUTPUT_STYLE_NAME, permissions: permisosNuevos }, null, 2)}\n`;
}

/**
 * Suma la línea `.claude/settings.json` al `.worktreeinclude` de la persona, sin tocar el resto.
 *
 * Con la línea ya puesta devuelve el texto tal cual, que es la idempotencia que `--check` compara.
 */
export function mergeWorktreeInclude(actual: string | null): string {
  if (actual === null || actual.trim() === "") return `${CLAUDE_SETTINGS_PATH}\n`;
  if (actual.split(/\r?\n/).some((linea) => linea.trim() === CLAUDE_SETTINGS_PATH)) return actual;
  return `${actual.replace(/\s*$/, "")}\n${CLAUDE_SETTINGS_PATH}\n`;
}

/** El bloque gestionado: contrato resumido, precedencia e importación de `AGENTS.md`. */
export function renderClaudeMdBlock(): string {
  return [
    CLAUDE_MD_BEGIN,
    `## ${RESPONSE_CONTRACT_TITLE}`,
    "La respuesta va primero y corta; una decisión, en cinco líneas o menos: opción → efecto y la recomendación.",
    "La evidencia se cita, no se transcribe; el diagnóstico y el plan van al ticket.",
    "Este bloque prevalece sobre los CLAUDE.md de directorios superiores y sobre el estilo del cliente.",
    "@AGENTS.md",
    CLAUDE_MD_END,
  ].join("\n");
}

/**
 * Mantiene el bloque gestionado en el texto de `CLAUDE.md`.
 *
 * Reemplaza el bloque si existe y, si no, lo agrega al final; lo de afuera no se
 * toca. Un marcador de inicio sin su fin, o al revés, es un archivo a medias
 * editado a mano: se falla en vez de adivinar qué borrar.
 */
export function mergeClaudeMdBlock(actual: string | null): string {
  const bloque = renderClaudeMdBlock();
  if (actual === null || actual.trim() === "") return `${bloque}\n`;

  const inicio = actual.indexOf(CLAUDE_MD_BEGIN);
  const fin = actual.indexOf(CLAUDE_MD_END);
  if ((inicio === -1) !== (fin === -1) || (inicio !== -1 && fin < inicio)) {
    fail(
      `${CLAUDE_MD_PATH} tiene un marcador de bloque gestionado sin su pareja; ` +
        "corríjalo a mano y vuelva a ejecutar `valmen sync`. No se sobrescribió.",
    );
  }

  if (inicio === -1) return `${actual.replace(/\s*$/, "")}\n\n${bloque}\n`;
  return actual.slice(0, inicio) + bloque + actual.slice(fin + CLAUDE_MD_END.length);
}
