/**
 * Un comparador de las reglas de comando de cada cliente y la tabla de `git clean` que las prueba.
 *
 * Imita lo que cada cliente hace con una línea de Bash: la parte en compuestos (`;`, `&&`, `||`,
 * `|`) y compara cada comando con las reglas. Claude Code y OpenCode comparan con un patrón donde
 * `*` es cualquier texto, quitan las asignaciones `VAR=valor` del principio y NO quitan `env` ni
 * `command` (un patrón que empieza por `git` no ve `env git clean -f`). Codex compara por prefijo
 * de argumentos completos, sin opciones globales, envoltorios ni asignaciones.
 */
export type Veredicto = "denegado" | "permitido";

function comandos(linea: string, quitaAsignaciones: boolean): string[] {
  return linea
    .split(/;|&&|\|\||\|/)
    .map((c) => c.trim())
    .map((c) =>
      quitaAsignaciones ? c.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "") : c,
    )
    .filter((c) => c !== "");
}

/** `*` es cualquier texto; lo demás, literal. */
export function patronComoRegex(patron: string): RegExp {
  const fuente = patron
    .split("*")
    .map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${fuente}$`);
}

/** Claude Code (`Bash(<patrón>)`) y OpenCode (`<patrón>`): patrón con `*` sobre el comando entero. */
export function veredictoPorPatrones(
  patrones: readonly string[],
  linea: string,
): Veredicto {
  const regex = patrones.map(patronComoRegex);
  return comandos(linea, true).some((c) => regex.some((r) => r.test(c)))
    ? "denegado"
    : "permitido";
}

/** Codex: `prefix_rule` con `pattern = [..]`; casa si los primeros argumentos son exactamente esos. */
export function veredictoCodex(textoReglas: string, linea: string): Veredicto {
  const prefijos = [...textoReglas.matchAll(/pattern = \[(.*)\],/g)].map(
    (m) => JSON.parse(`[${m[1] as string}]`) as string[],
  );
  const denegado = comandos(linea, false).some((c) => {
    const tokens = c.split(/\s+/);
    return prefijos.some((p) => p.every((t, i) => tokens[i] === t));
  });
  return denegado ? "denegado" : "permitido";
}

export interface CasoClean {
  readonly comando: string;
  readonly claude: Veredicto;
  readonly opencode: Veredicto;
  readonly codex: Veredicto;
}

const d: Veredicto = "denegado";
const p: Veredicto = "permitido";
/** Los tres clientes igual. */
const todos = (comando: string, v: Veredicto): CasoClean => ({
  comando,
  claude: v,
  opencode: v,
  codex: v,
});
/** Claude Code y OpenCode niegan; Codex solo lee la forma canónica, sin opciones ni envoltorios. */
const sinCodex = (comando: string): CasoClean => ({
  comando,
  claude: d,
  opencode: d,
  codex: p,
});

/** Los casos de `git clean`: lo que destruye se niega y el simulacro (`-n`) se admite. */
export const CASOS_CLEAN: readonly CasoClean[] = [
  // Ya denegados antes del arreglo: no se relajan.
  ...["-f", "-fd", "-fdx", "-fX", "--force"].map((a) => todos(`git clean ${a}`, d)),
  sinCodex("git clean -d -f"),
  sinCodex("git clean -ffd"),
  sinCodex("git -C . clean -f"),
  sinCodex("git -c k=v clean -f"),
  sinCodex("git --git-dir=.git clean -f"),
  todos("git status; git clean -f", d),
  todos("git status && git clean -f", d),
  sinCodex("GIT_TRACE=0 git clean -f"),
  // Los huecos: formas que destruyen y se escapaban.
  ...[
    "-xdf",
    "-df",
    "-xf",
    "-Xf",
    "-dxf",
    "-Xdf",
    "-xfd",
    "-Xfd",
    "-dXf",
    "-dfx",
    "-dfX",
  ].map((a) => todos(`git clean ${a}`, d)),
  sinCodex("git -C . clean -xdf"),
  sinCodex("git clean -d -x -f"),
  // El simulacro: con `-n` git no borra nada aunque lleve `-f`.
  ...["-n", "--dry-run", "-nd", "-ndX", "-nf", "-nfd"].map((a) =>
    todos(`git clean ${a}`, p),
  ),
  // Sin falsos positivos con rutas que contienen «f».
  todos("git clean -n src/foo", p),
  todos("git clean -nd src/foo", p),
  todos("env git clean -n src/foo", p),
];

/**
 * Límite conocido, decisión del PO (2026-10-10): un patrón que empieza por `git` no ve el comando
 * tras `env` ni `command`, y el harness no lo cubre. Los tres clientes lo dejan pasar y lo
 * reportan como no aplicado; no se presenta como protegido.
 */
export const LIMITES_CONOCIDOS: readonly string[] = [
  "env git clean -f",
  "command git clean -f",
  "env git clean -xdf",
  "command git clean -df",
];
