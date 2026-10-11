/**
 * `valmen sync` proyecta las denegaciones del harness a Codex y a OpenCode y reporta lo que no
 * puede aplicar (SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010).
 *
 * Todo corre en directorios temporales: nunca se lee ni se escribe el `.codex/`, el `.opencode/`,
 * el `opencode.json` ni el `.claude/settings.json` de este repositorio. Las pruebas se escribieron
 * antes que el código y se observaron en rojo; las de «regresión» fijan lo que `sync`,
 * `sync --check` y `doctor` ya hacían en un proyecto sin Codex ni OpenCode.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DENIED_GIT_COMMANDS, SENSITIVE_PATH_GLOBS } from "../packages/core/src/index.js";
import {
  CODEX_RULES_PATH,
  OPENCODE_CONFIG_PATH,
  codexRulesText,
  denyNotApplied,
  mergeOpencodeDenyConfig,
  missingOpencodeDenyRules,
  opencodeAgentPermission,
  opencodeDenyPermission,
  projectFiles,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";
import { doctorCommand } from "../packages/cli/src/setup.js";

// El JSON de los archivos del cliente se recorre por claves; su forma exacta la fijan las aserciones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const PUSH_REFSPEC = "git push +";
const FORMAS_CODEX = DENIED_GIT_COMMANDS.filter((forma) => forma !== PUSH_REFSPEC);

/** Una traducción independiente del glob, escrita aquí a mano para no probar el código con él mismo. */
function patronesEsperados(glob: string): string[] {
  if (glob === "~/.ssh/**") return ["~/.ssh/*"];
  const resto = glob.replace(/^\*\*\//, "");
  return resto.startsWith("*") ? [resto] : [resto, `*/${resto}`];
}

/** En OpenCode `*` cruza `/`. */
function casa(patron: string, ruta: string): boolean {
  const re = new RegExp(
    `^${patron.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );
  return re.test(ruta);
}

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-denegados-co-"));
  mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
  mkdirSync(join(lab, ".valmen", "agents"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "agents", "planner.md"),
    "---\ndescription: Planea.\n---\n\nPlanea esto.\n",
    "utf8",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function config(runtimes: string): void {
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    `name: Demo\nruntimes: ${runtimes}\n`,
    "utf8",
  );
}
function escribir(ruta: string, texto: string): void {
  mkdirSync(join(lab, ruta, ".."), { recursive: true });
  writeFileSync(join(lab, ruta), texto, "utf8");
}
const leer = (ruta: string): string => readFileSync(join(lab, ruta), "utf8");
const leerJson = (ruta: string): Json => JSON.parse(leer(ruta)) as Json;
const sync = (check = false) => syncProject(lab, "Demo", check);

describe("Codex: .codex/rules/valmen.rules", () => {
  it.each(FORMAS_CODEX)(
    "«%s» queda como prefix_rule forbidden con justificación",
    (forma) => {
      const patron = forma
        .split(" ")
        .map((p) => `"${p}"`)
        .join(", ");
      const texto = codexRulesText();
      expect(texto).toContain(`pattern = [${patron}],`);
      const bloque =
        texto.slice(texto.indexOf(`pattern = [${patron}],`)).split(")\n")[0] ?? "";
      expect(bloque).toContain('decision = "forbidden"');
      expect(bloque).toMatch(/justification = "valmen: /);
    },
  );

  it("no proyecta git push + y lleva el aviso fijo en la cabecera", () => {
    const texto = codexRulesText();
    expect(texto).not.toContain('"+"');
    expect(texto.split("\n")[1]).toMatch(/forma canónica.*de confianza/);
    expect(texto.match(/prefix_rule\(/g)).toHaveLength(27);
  });

  it("sync con codex escribe el archivo, y sin codex no", () => {
    config("[codex]");
    sync();
    expect(leer(CODEX_RULES_PATH)).toBe(codexRulesText());
    config("[claude]");
    rmSync(join(lab, ".codex"), { recursive: true, force: true });
    sync();
    expect(existsSync(join(lab, CODEX_RULES_PATH))).toBe(false);
  });
});

describe("OpenCode: traducción de la lista", () => {
  it.each(
    SENSITIVE_PATH_GLOBS.flatMap((glob) =>
      (["read", "edit"] as const).map((t) => [t, glob] as const),
    ),
  )("%s %s: patrones deny y casa las rutas que el glob casa", (tool, glob) => {
    const objeto = opencodeDenyPermission()[tool];
    for (const patron of patronesEsperados(glob))
      expect(objeto[patron], patron).toBe("deny");
    const muestra =
      glob === "~/.ssh/**"
        ? ["~/.ssh/id_rsa"]
        : [
            glob.replace("**/", "").replace("*", "x"),
            `a/b/${glob.replace("**/", "").replace("*", "x")}`,
          ];
    for (const ruta of muestra) {
      expect(
        patronesEsperados(glob).some((p) => casa(p, ruta)),
        ruta,
      ).toBe(true);
    }
  });

  it.each(DENIED_GIT_COMMANDS)("«%s» da cuatro patrones bash deny", (forma) => {
    const [git, op, bandera] = forma.split(" ");
    const esperados = [
      `${git} ${op} ${bandera}*`,
      `${git} ${op} * ${bandera}*`,
      `${git} * ${op} ${bandera}*`,
      `${git} * ${op} * ${bandera}*`,
    ];
    const bash = opencodeDenyPermission().bash;
    for (const patron of esperados) expect(bash[patron], patron).toBe("deny");
  });

  it("el bloque de un agente lleva la base de hoy como «*» y las denegaciones después", () => {
    for (const [write, execute] of [
      [false, false],
      [true, true],
    ] as const) {
      const permiso = opencodeAgentPermission(write, execute);
      expect(Object.keys(permiso.read)[0]).toBe("*");
      expect(permiso.read["*"]).toBe("allow");
      expect(permiso.edit["*"]).toBe(write ? "allow" : "deny");
      expect(permiso.bash["*"]).toBe(execute ? "allow" : "ask");
      expect(Object.keys(permiso.bash).at(-1)).toBe("git * clean * -Xfd*");
    }
  });
});

describe("OpenCode: fusión de .opencode/opencode.json (R-PER-002)", () => {
  it("sin archivo, lo crea solo con permission", () => {
    const datos = JSON.parse(mergeOpencodeDenyConfig(null)) as Json;
    expect(Object.keys(datos)).toEqual(["permission"]);
    expect(datos["permission"]).toEqual(opencodeDenyPermission());
  });

  it("suma al final, conserva lo de la persona y es idempotente", () => {
    const actual = JSON.stringify({
      model: "x/y",
      permission: {
        read: { "*.log": "ask" },
        bash: { "npm test": "allow" },
        webfetch: "ask",
      },
    });
    const fusion = mergeOpencodeDenyConfig(actual);
    const datos = JSON.parse(fusion) as Json;
    expect(datos["model"]).toBe("x/y");
    expect(datos["permission"]["webfetch"]).toBe("ask");
    expect(Object.keys(datos["permission"]["read"])[0]).toBe("*.log");
    expect(datos["permission"]["read"][".env"]).toBe("deny");
    expect(Object.keys(datos["permission"]["bash"])[0]).toBe("npm test");
    expect(mergeOpencodeDenyConfig(fusion)).toBe(fusion);
    expect(missingOpencodeDenyRules(fusion)).toEqual([]);
    expect(missingOpencodeDenyRules(actual).length).toBeGreaterThan(0);
  });

  it("una clave existente con otro valor no se toca y la regla se reporta", () => {
    const actual = JSON.stringify({ permission: { read: { ".env": "allow" } } });
    const datos = JSON.parse(mergeOpencodeDenyConfig(actual)) as Json;
    expect(datos["permission"]["read"][".env"]).toBe("allow");
    const reglas = denyNotApplied(["opencode"], actual, false).map((r) => r.regla);
    expect(reglas).toContain("read **/.env");
    expect(reglas).not.toContain("read **/.env.*");
  });

  it("permission o permission.<herramienta> como texto no se convierte y se reporta", () => {
    const todo = JSON.stringify({ permission: "allow" });
    expect(mergeOpencodeDenyConfig(todo)).toBe(todo);
    expect(denyNotApplied(["opencode"], todo, false)).toHaveLength(
      SENSITIVE_PATH_GLOBS.length * 2 + DENIED_GIT_COMMANDS.length + 1,
    );

    const bash = JSON.stringify({ permission: { bash: "allow" } });
    const datos = JSON.parse(mergeOpencodeDenyConfig(bash)) as Json;
    expect(datos["permission"]["bash"]).toBe("allow");
    expect(datos["permission"]["read"][".env"]).toBe("deny");
    expect(denyNotApplied(["opencode"], bash, false).map((r) => r.regla)).toEqual([
      ...DENIED_GIT_COMMANDS,
      "git clean tras env o command",
    ]);
  });

  it.each([
    ["JSON inválido", "{ no es json"],
    ["raíz que no es objeto", "[1]"],
    ["permission numérico", '{"permission": 3}'],
    ["permission arreglo", '{"permission": []}'],
    ["permission.read arreglo", '{"permission": {"read": []}}'],
  ])("%s falla sin escribir", (_nombre, actual) => {
    config("[opencode]");
    escribir(OPENCODE_CONFIG_PATH, actual);
    const r = sync();
    expect(r.exitCode).not.toBe(0);
    expect(leer(OPENCODE_CONFIG_PATH)).toBe(actual);
  });

  it("con opencode.jsonc no escribe el .json y reporta todas las reglas", () => {
    config("[opencode]");
    escribir(".opencode/opencode.jsonc", "// de la persona\n{}\n");
    const r = sync();
    expect(existsSync(join(lab, OPENCODE_CONFIG_PATH))).toBe(false);
    expect(leer(".opencode/opencode.jsonc")).toBe("// de la persona\n{}\n");
    expect(r.stdout).toContain("no aplicadas en opencode (46)");
  });

  it("sync escribe, no toca opencode.json de la raíz y --check queda al día", () => {
    config("[opencode]");
    escribir("opencode.json", '{"permission": {"read": "allow"}}');
    sync();
    expect(leer("opencode.json")).toBe('{"permission": {"read": "allow"}}');
    expect(leerJson(OPENCODE_CONFIG_PATH)["permission"]["edit"]["*.pem"]).toBe("deny");
    const check = sync(true);
    expect(check.exitCode).toBe(0);
  });

  it("--check nombra lo que falta si alguien borró una denegación", () => {
    config("[opencode]");
    sync();
    const datos = leerJson(OPENCODE_CONFIG_PATH);
    delete datos["permission"]["bash"]["git reset --hard*"];
    escribir(OPENCODE_CONFIG_PATH, JSON.stringify(datos, null, 2) + "\n");
    const check = sync(true);
    expect(check.exitCode).not.toBe(0);
    expect(check.stderr + check.stdout).toMatch(
      /Faltan 1 denegación\(es\) del harness en \.opencode\/opencode\.json: bash:git reset --hard\*/,
    );
  });
});

describe("agentes de OpenCode", () => {
  it("el frontmatter trae el bloque permission con claves entre comillas", () => {
    config("[opencode]");
    sync();
    const texto = leer(".opencode/agents/planner.md");
    expect(texto).toMatch(/^permission:\n {2}read:\n {4}"\*": allow\n/m);
    expect(texto).toContain('    "**/.env": deny'.replace("**/", ""));
    expect(texto).toMatch(/^ {2}edit:\n {4}"\*": deny$/m);
    expect(texto).toMatch(/^ {2}bash:\n {4}"\*": ask$/m);
    expect(texto).toContain('"git * reset * --hard*": deny');
  });

  it("el agente Codex no cambia", () => {
    config("[codex]");
    sync();
    expect(leer(".codex/agents/planner.toml")).not.toContain("permission");
  });
});

describe("regla por cliente: en el archivo o reportada, nunca las dos ni ninguna", () => {
  const reglas = [
    ...SENSITIVE_PATH_GLOBS.flatMap((glob) =>
      (["read", "edit"] as const).map((t) => `${t} ${glob}`),
    ),
    ...DENIED_GIT_COMMANDS,
  ];

  function enCodex(regla: string): boolean {
    if (regla.startsWith("read ") || regla.startsWith("edit ")) return false;
    return readFileSync(join(lab, CODEX_RULES_PATH), "utf8").includes(
      `pattern = [${regla
        .split(" ")
        .map((p) => `"${p}"`)
        .join(", ")}],`,
    );
  }
  function enOpencode(regla: string): boolean {
    const datos = leerJson(OPENCODE_CONFIG_PATH)["permission"];
    const m = /^(read|edit) (.+)$/.exec(regla);
    if (m) {
      return patronesEsperados(m[2] as string).every(
        (p) => datos[m[1] as string][p] === "deny",
      );
    }
    const [git, op, bandera] = regla.split(" ");
    return [
      `${git} ${op} ${bandera}*`,
      `${git} ${op} * ${bandera}*`,
      `${git} * ${op} ${bandera}*`,
      `${git} * ${op} * ${bandera}*`,
    ].every((p) => datos["bash"][p] === "deny");
  }

  it.each(reglas)("codex: %s", (regla) => {
    config("[codex, opencode]");
    sync();
    const reportada = denyNotApplied(["codex"], null, false).some((r) => r.regla === regla);
    expect(enCodex(regla) !== reportada, regla).toBe(true);
  });

  it.each(reglas)("opencode: %s", (regla) => {
    config("[codex, opencode]");
    sync();
    const reportada = denyNotApplied(["opencode"], leer(OPENCODE_CONFIG_PATH), false).some(
      (r) => r.regla === regla,
    );
    expect(enOpencode(regla) !== reportada, regla).toBe(true);
  });
});

describe("salida de sync, sync --check y doctor", () => {
  it("sync dice, por cliente, cuántas y cuáles no aplicó, con el aviso fijo", () => {
    config("[codex, opencode]");
    escribir(OPENCODE_CONFIG_PATH, JSON.stringify({ permission: { bash: "allow" } }));
    const r = sync();
    expect(r.stdout).toMatch(
      /no aplicadas en codex \(26\): .*read \*\*\/\.env.*git push \+.*— /,
    );
    expect(r.stdout).toContain("forma canónica");
    expect(r.stdout).toMatch(/no aplicadas en opencode \(22\): git push --force/);
    expect(r.stdout).toContain("no heredan read ni edit");
  });

  it("sync --check con codex sigue reportando lo no aplicado sin fallar si todo está al día", () => {
    config("[codex]");
    sync();
    const r = sync(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("no aplicadas en codex (26)");
  });

  it("doctor avisa por cliente y no cambia el código de salida", async () => {
    config("[codex, opencode]");
    escribir(
      OPENCODE_CONFIG_PATH,
      JSON.stringify({ permission: { read: { ".env": "allow" } } }),
    );
    const r = await doctorCommand(
      { root: lab, ticketsDir: "tickets" },
      { env: {}, codegraph: () => ({ estado: "no-instalado" }) },
    );
    expect(r.stdout).toMatch(/Denegaciones en codex.*git push \+/);
    expect(r.stdout).toMatch(/Denegaciones en opencode.*read \*\*\/\.env/);
  });

  it("doctor no escribe nada", async () => {
    config("[codex, opencode]");
    await doctorCommand(
      { root: lab, ticketsDir: "tickets" },
      { env: {}, codegraph: () => ({ estado: "no-instalado" }) },
    );
    expect(existsSync(join(lab, CODEX_RULES_PATH))).toBe(false);
    expect(existsSync(join(lab, OPENCODE_CONFIG_PATH))).toBe(false);
  });
});

describe("regresión: proyectos sin Codex ni OpenCode siguen igual", () => {
  it("sync, sync --check y doctor no mencionan denegaciones de esos clientes", async () => {
    config("[claude]");
    const r = sync();
    expect(r.stdout).not.toContain("no aplicadas en");
    expect(projectFiles(lab, "Demo").denyNotApplied).toEqual([]);
    expect(projectFiles(lab, "Demo").opencodeDenyMissing).toEqual([]);
    expect(existsSync(join(lab, ".codex"))).toBe(false);
    expect(existsSync(join(lab, ".opencode"))).toBe(false);
    const check = sync(true);
    expect(check.exitCode).toBe(0);
    expect(check.stdout).not.toContain("no aplicadas en");
    const d = await doctorCommand(
      { root: lab, ticketsDir: "tickets" },
      { env: {}, codegraph: () => ({ estado: "no-instalado" }) },
    );
    expect(d.stdout).not.toContain("Denegaciones en");
  });
});
