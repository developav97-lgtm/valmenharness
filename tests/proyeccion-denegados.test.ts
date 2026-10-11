/**
 * `valmen sync` proyecta las denegaciones del harness a `.claude/settings.json`
 * (SECURITY-CLI-PROYECCION-DENEGADOS-20261010, R-PER-001 a R-PER-003).
 *
 * Todo corre en directorios temporales: nunca se lee ni se escribe el `.claude/settings.json`
 * ni el `.claude/settings.local.json` de este repositorio. Las pruebas se escribieron antes que
 * el código y se observaron en rojo; las de «regresión» fijan lo que `sync` y `journey worktree
 * create` ya hacían y deben seguir haciendo.
 */
import { matchesGlob } from "node:path";
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
  DENIED_GIT_COMMANDS,
  SENSITIVE_PATH_GLOBS,
  SENSITIVE_PATH_PATTERNS,
} from "../packages/core/src/index.js";
import {
  WORKTREE_INCLUDE_PATH,
  claudeAllowConflicts,
  claudeDenyRules,
  mergeClaudeSettings,
  mergeWorktreeInclude,
  missingClaudeDenyRules,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";
import { journeyWorktreeCommand } from "../packages/cli/src/worktree.js";
import { defaultPaths } from "../packages/engine/src/index.js";
import {
  type Laboratorio,
  TICKET_A,
  crearLaboratorio,
  procesoSimulado,
} from "./helpers/worktree-lab.js";

const GLOBS = [
  "**/.env",
  "**/.env.*",
  "**/.credentials",
  "**/.credentials.*",
  "**/id_rsa",
  "**/id_rsa.pub",
  "**/id_ed25519",
  "**/id_ed25519.pub",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "~/.ssh/**",
];

const FORMAS = [
  "git push --force",
  "git push -f",
  "git push +",
  "git push --delete",
  "git push -d",
  "git reset --hard",
  "git clean -f",
  "git clean --force",
  "git tag -d",
  "git tag --delete",
];

/** Las 64 reglas, escritas a mano y en el orden del plan: 12 Read, 12 Edit y 4 Bash por cada forma. */
const REGLAS_ESPERADAS = [
  ...GLOBS.map((glob) => `Read(${glob})`),
  ...GLOBS.map((glob) => `Edit(${glob})`),
  "Bash(git push --force*)",
  "Bash(git push * --force*)",
  "Bash(git * push --force*)",
  "Bash(git * push * --force*)",
  "Bash(git push -f*)",
  "Bash(git push * -f*)",
  "Bash(git * push -f*)",
  "Bash(git * push * -f*)",
  "Bash(git push +*)",
  "Bash(git push * +*)",
  "Bash(git * push +*)",
  "Bash(git * push * +*)",
  "Bash(git push --delete*)",
  "Bash(git push * --delete*)",
  "Bash(git * push --delete*)",
  "Bash(git * push * --delete*)",
  "Bash(git push -d*)",
  "Bash(git push * -d*)",
  "Bash(git * push -d*)",
  "Bash(git * push * -d*)",
  "Bash(git reset --hard*)",
  "Bash(git reset * --hard*)",
  "Bash(git * reset --hard*)",
  "Bash(git * reset * --hard*)",
  "Bash(git clean -f*)",
  "Bash(git clean * -f*)",
  "Bash(git * clean -f*)",
  "Bash(git * clean * -f*)",
  "Bash(git clean --force*)",
  "Bash(git clean * --force*)",
  "Bash(git * clean --force*)",
  "Bash(git * clean * --force*)",
  "Bash(git tag -d*)",
  "Bash(git tag * -d*)",
  "Bash(git * tag -d*)",
  "Bash(git * tag * -d*)",
  "Bash(git tag --delete*)",
  "Bash(git tag * --delete*)",
  "Bash(git * tag --delete*)",
  "Bash(git * tag * --delete*)",
];

const SETTINGS = ".claude/settings.json";

let lab: string;
let worktrees: Laboratorio | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-denegados-"));
  mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
  worktrees?.limpiar();
  worktrees = undefined;
});

function escribir(ruta: string, texto: string): void {
  mkdirSync(join(lab, ruta, ".."), { recursive: true });
  writeFileSync(join(lab, ruta), texto, "utf8");
}

const leer = (ruta: string): string => readFileSync(join(lab, ruta), "utf8");
const leerJson = (ruta: string): Record<string, unknown> =>
  JSON.parse(leer(ruta)) as Record<string, unknown>;
const permisos = (ruta = SETTINGS): { allow?: string[]; deny?: string[] } =>
  leerJson(ruta)["permissions"] as { allow?: string[]; deny?: string[] };
const sync = (check = false) => syncProject(lab, "Demo", check);

describe("la lista de core, sin la sintaxis de ningún cliente", () => {
  it("SENSITIVE_PATH_GLOBS lleva los 12 globs de rutas sensibles, ~/.ssh/** incluido (C1)", () => {
    expect(SENSITIVE_PATH_GLOBS).toEqual(GLOBS);
    expect(SENSITIVE_PATH_GLOBS).toContain("~/.ssh/**");
  });

  it("DENIED_GIT_COMMANDS lleva las diez formas de git que nunca se automatizan (C2)", () => {
    expect(DENIED_GIT_COMMANDS).toEqual(FORMAS);
  });

  it("SENSITIVE_PATH_GLOBS está congelada (C3)", () => {
    expect(Array.isArray(SENSITIVE_PATH_GLOBS)).toBe(true);
    expect(Object.isFrozen(SENSITIVE_PATH_GLOBS)).toBe(true);
  });

  it("DENIED_GIT_COMMANDS está congelada (C4)", () => {
    expect(Array.isArray(DENIED_GIT_COMMANDS)).toBe(true);
    expect(Object.isFrozen(DENIED_GIT_COMMANDS)).toBe(true);
  });

  it("los globs y los patrones dan el mismo veredicto en cada ruta de la tabla (C5)", () => {
    const tabla: ReadonlyArray<readonly [string, boolean]> = [
      [".env", true],
      [".env.local", true],
      ["app/.env.production", true],
      [".envrc", false],
      [".credentials", true],
      [".credentials.json", true],
      ["id_rsa", true],
      ["keys/id_ed25519.pub", true],
      ["cert.pem", true],
      ["x.key", true],
      ["a.p12", true],
      ["keyboard.ts", false],
      ["docs/key.md", false],
      ["src/ok.ts", false],
    ];
    for (const [ruta, sensible] of tabla) {
      const porPatron = SENSITIVE_PATH_PATTERNS.some((patron) => patron.test(ruta));
      const porGlob = SENSITIVE_PATH_GLOBS.some((glob) => matchesGlob(ruta, glob));
      expect({ ruta, porPatron }, ruta).toEqual({ ruta, porPatron: sensible });
      expect({ ruta, porGlob }, ruta).toEqual({ ruta, porGlob: porPatron });
    }
  });
});

describe("las reglas de Claude Code", () => {
  it("claudeDenyRules() devuelve las 64 reglas del plan en su orden (C6)", () => {
    expect(REGLAS_ESPERADAS).toHaveLength(64);
    expect(claudeDenyRules()).toEqual(REGLAS_ESPERADAS);
  });
});

describe("R-PER-001: sync escribe las denegaciones en .claude/settings.json", () => {
  it('sobre {"outputStyle":"valmen"} conserva outputStyle (C7)', () => {
    escribir(SETTINGS, '{"outputStyle":"valmen"}');
    expect(sync().exitCode).toBe(0);
    expect(leerJson(SETTINGS)["outputStyle"]).toBe("valmen");
  });

  it('sobre {"outputStyle":"valmen"} escribe en permissions.deny las 64 reglas del harness (C8)', () => {
    escribir(SETTINGS, '{"outputStyle":"valmen"}');
    expect(sync().exitCode).toBe(0);
    expect(permisos().deny).toEqual(REGLAS_ESPERADAS);
  });

  it("sin archivo lo crea con outputStyle y las 64 reglas", () => {
    expect(sync().exitCode).toBe(0);
    expect(leerJson(SETTINGS)).toEqual({
      outputStyle: "valmen",
      permissions: { deny: REGLAS_ESPERADAS },
    });
  });
});

describe("R-PER-002: la proyección no quita ni reescribe lo de la persona", () => {
  const propio = {
    permissions: {
      allow: ["Bash(npm test)", "Bash(npx vitest run*)"],
      deny: ["Bash(rm -rf*)", "Read(./secretos/**)"],
    },
    model: "opus",
  };

  it("tras dos sync la lista allow propia queda idéntica (C9)", () => {
    escribir(SETTINGS, JSON.stringify(propio, null, 2));
    sync();
    sync();
    expect(permisos().allow).toEqual(propio.permissions.allow);
  });

  it("tras dos sync las reglas deny propias quedan con su texto y su orden, delante de las del harness (C10)", () => {
    escribir(SETTINGS, JSON.stringify(propio, null, 2));
    sync();
    sync();
    const deny = permisos().deny as string[];
    expect(deny.slice(0, propio.permissions.deny.length)).toEqual(propio.permissions.deny);
    expect(deny.slice(propio.permissions.deny.length)).toEqual(REGLAS_ESPERADAS);
  });

  it("tras dos sync cada regla del harness aparece una sola vez (C11)", () => {
    escribir(
      SETTINGS,
      JSON.stringify({
        permissions: { deny: ["Bash(git reset --hard*)", "Bash(rm -rf*)"] },
      }),
    );
    sync();
    sync();
    const deny = permisos().deny as string[];
    for (const regla of REGLAS_ESPERADAS)
      expect(
        deny.filter((r) => r === regla),
        regla,
      ).toHaveLength(1);
    expect(deny).toHaveLength(REGLAS_ESPERADAS.length + 1);
    expect(deny[0]).toBe("Bash(git reset --hard*)");
  });

  it("sync deja .claude/settings.local.json igual byte a byte (C12)", () => {
    const local =
      '{ "permissions":{"allow":["Bash(git push *)"]},\n   "model":"haiku" }\n\n';
    escribir(".claude/settings.local.json", local);
    escribir(SETTINGS, JSON.stringify(propio));
    sync();
    sync();
    expect(readFileSync(join(lab, ".claude/settings.local.json"))).toEqual(
      Buffer.from(local, "utf8"),
    );
    sync(true);
    expect(readFileSync(join(lab, ".claude/settings.local.json"))).toEqual(
      Buffer.from(local, "utf8"),
    );
  });

  it("una allow que contradice una denegación sale como aviso en la salida de sync (C13)", () => {
    escribir(
      SETTINGS,
      JSON.stringify({
        permissions: { allow: ["Bash(git push *)", "Bash(git:*)", "Read(**)"] },
      }),
    );
    const resultado = sync();
    expect(resultado.exitCode).toBe(0);
    for (const regla of ["Bash(git push *)", "Bash(git:*)", "Read(**)"]) {
      expect(resultado.stdout, regla).toMatch(
        new RegExp(`Aviso: .*${regla.replace(/[()*:]/g, "\\$&")}.*contradice`),
      );
    }
    expect(resultado.stdout).toContain("Claude Code aplica la denegación");
    expect(resultado.stdout).toContain("no se borró");
  });

  it("la allow que contradice una denegación sigue en el archivo después de sync (C14)", () => {
    const allow = ["Bash(git push *)", "Bash(git:*)", "Read(**)", "Bash(npm test)"];
    escribir(SETTINGS, JSON.stringify({ permissions: { allow } }));
    sync();
    sync();
    expect(permisos().allow).toEqual(allow);
  });

  it("una allow que no contradice ninguna denegación no produce aviso (C15)", () => {
    escribir(
      SETTINGS,
      JSON.stringify({
        permissions: { allow: ["Bash(npm test)", "Bash(git status*)", "Read(./src/**)"] },
      }),
    );
    const resultado = sync();
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).not.toContain("contradice");
    expect(resultado.stdout).not.toContain("Aviso:");
  });

  it("claudeAllowConflicts nombra la allow y la denegación, sin avisos para lo que no choca", () => {
    const avisos = claudeAllowConflicts(
      JSON.stringify({
        permissions: {
          allow: [
            "Bash",
            "Edit",
            "Bash(git push *)",
            "Read(.env)",
            "Edit(**/*.pem)",
            "Bash(git status)",
            "Read(./src/**)",
          ],
        },
      }),
    );
    expect(avisos).toHaveLength(5);
    expect(avisos[0]).toContain("Bash");
    expect(avisos[2]).toContain("Bash(git push *)");
    expect(avisos[2]).toContain("Bash(git push --force*)");
    expect(avisos[3]).toContain("Read(.env)");
    expect(avisos[3]).toContain("Read(**/.env)");
    expect(avisos[4]).toContain("Edit(**/*.pem)");
    expect(claudeAllowConflicts(null)).toEqual([]);
    expect(claudeAllowConflicts('{"outputStyle":"valmen"}')).toEqual([]);
  });

  it("un permissions que no es objeto hace fallar sync sin escribir el archivo (C16)", () => {
    for (const texto of [
      '{"permissions":"todo"}',
      '{"permissions":[]}',
      '{"permissions":null}',
    ]) {
      escribir(SETTINGS, texto);
      const resultado = sync();
      expect(resultado.exitCode, texto).not.toBe(0);
      expect(resultado.stderr).toContain(SETTINGS);
      expect(leer(SETTINGS)).toBe(texto);
    }
  });

  it("un permissions.deny que no es un arreglo de textos hace fallar sync sin escribir el archivo (C17)", () => {
    for (const texto of [
      '{"permissions":{"deny":"Bash(rm *)"}}',
      '{"permissions":{"deny":[1,2]}}',
      '{"permissions":{"deny":{"x":"y"}}}',
      '{"permissions":{"deny":null}}',
    ]) {
      escribir(SETTINGS, texto);
      const resultado = sync();
      expect(resultado.exitCode, texto).not.toBe(0);
      expect(resultado.stderr).toContain(SETTINGS);
      expect(leer(SETTINGS)).toBe(texto);
    }
  });

  it("mergeClaudeSettings no toca otras claves ni deja de fallar ante JSON inválido", () => {
    const fusion = JSON.parse(
      mergeClaudeSettings(
        '{"hooks":{"a":1},"permissions":{"ask":["Bash(ls)"],"defaultMode":"plan"},"model":"opus"}',
      ),
    ) as Record<string, unknown>;
    expect(fusion["hooks"]).toEqual({ a: 1 });
    expect(fusion["model"]).toBe("opus");
    expect(fusion["permissions"]).toEqual({
      ask: ["Bash(ls)"],
      defaultMode: "plan",
      deny: REGLAS_ESPERADAS,
    });
    expect(() => mergeClaudeSettings("{ no es json")).toThrow(SETTINGS);
    expect(() => mergeClaudeSettings("[]")).toThrow(SETTINGS);
  });
});

describe("R-PER-003: sync --check nombra la denegación que falta", () => {
  it("con Bash(git reset --hard*) borrada, --check sale con código distinto de 0 (C19)", () => {
    sync();
    const datos = leerJson(SETTINGS);
    const deny = (datos["permissions"] as { deny: string[] }).deny.filter(
      (r) => r !== "Bash(git reset --hard*)",
    );
    escribir(SETTINGS, JSON.stringify({ ...datos, permissions: { deny } }, null, 2));
    expect(sync(true).exitCode).not.toBe(0);
  });

  it("la salida de --check nombra la denegación que falta (C20)", () => {
    sync();
    const datos = leerJson(SETTINGS);
    const deny = (datos["permissions"] as { deny: string[] }).deny.filter(
      (r) => r !== "Bash(git reset --hard*)",
    );
    escribir(SETTINGS, JSON.stringify({ ...datos, permissions: { deny } }, null, 2));
    const resultado = sync(true);
    expect(resultado.stderr).toContain(
      "Faltan 1 denegación(es) del harness en .claude/settings.json",
    );
    expect(resultado.stderr).toContain("Bash(git reset --hard*)");
    expect(resultado.stderr).not.toContain("Read(**/.env)");
  });

  it("tras sync, --check vuelve a salir con 0 (C21)", () => {
    sync();
    escribir(
      SETTINGS,
      JSON.stringify({ outputStyle: "valmen", permissions: { deny: [] } }),
    );
    expect(sync(true).exitCode).not.toBe(0);
    expect(sync().exitCode).toBe(0);
    expect(sync(true).exitCode).toBe(0);
  });

  it("missingClaudeDenyRules devuelve las ausentes, todas sin archivo y ninguna con las 64", () => {
    expect(missingClaudeDenyRules(null)).toEqual(REGLAS_ESPERADAS);
    expect(
      missingClaudeDenyRules(JSON.stringify({ permissions: { deny: REGLAS_ESPERADAS } })),
    ).toEqual([]);
    expect(
      missingClaudeDenyRules(JSON.stringify({ permissions: { deny: ["Read(**/.env)"] } })),
    ).toHaveLength(63);
  });
});

describe(".worktreeinclude lleva el archivo de permisos a los worktrees de Claude Code", () => {
  it("sync escribe la línea .claude/settings.json (C22)", () => {
    expect(sync().exitCode).toBe(0);
    expect(WORKTREE_INCLUDE_PATH).toBe(".worktreeinclude");
    expect(leer(".worktreeinclude").split("\n")).toContain(".claude/settings.json");
  });

  it("sync conserva las líneas propias y no repite la suya (C23)", () => {
    const propio =
      "# archivos locales que van al worktree\n.env.local\nconfig/secretos.json";
    escribir(".worktreeinclude", propio);
    sync();
    sync();
    const lineas = leer(".worktreeinclude").split("\n");
    expect(lineas.slice(0, 3)).toEqual(propio.split("\n"));
    expect(lineas.filter((l) => l === ".claude/settings.json")).toHaveLength(1);
    expect(sync(true).exitCode).toBe(0);
  });

  it("mergeWorktreeInclude suma la línea al final y devuelve el texto tal cual si ya está", () => {
    expect(mergeWorktreeInclude(null)).toBe(".claude/settings.json\n");
    expect(mergeWorktreeInclude("a\n")).toBe("a\n.claude/settings.json\n");
    expect(mergeWorktreeInclude("a")).toBe("a\n.claude/settings.json\n");
    const completo = "a\n.claude/settings.json\nb";
    expect(mergeWorktreeInclude(completo)).toBe(completo);
  });
});

describe("regresión: lo que sync ya hacía sigue igual", () => {
  it("sync escribe AGENTS.md, el estilo de salida y CLAUDE.md y activa outputStyle", () => {
    const resultado = sync();
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout.startsWith("Sincronización\n")).toBe(true);
    expect(resultado.stdout).toContain("  AGENTS.md ");
    expect(resultado.stdout).toContain("skills publicadas");
    expect(existsSync(join(lab, "AGENTS.md"))).toBe(true);
    expect(leer(".claude/output-styles/valmen.md")).toContain("name: valmen");
    expect(leer("CLAUDE.md")).toContain("@AGENTS.md");
    expect(leerJson(SETTINGS)["outputStyle"]).toBe("valmen");
  });

  it("sync --check tras sync dice que los archivos están al día", () => {
    sync();
    const resultado = sync(true);
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("Archivos generados al día.");
  });

  it("sync --check marca un AGENTS.md editado a mano, como siempre", () => {
    sync();
    writeFileSync(join(lab, "AGENTS.md"), "editado a mano\n", "utf8");
    const resultado = sync(true);
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("AGENTS.md");
    expect(resultado.stderr).not.toContain("Faltan");
  });

  it("sin el runtime claude, sync no escribe nada de Claude Code ni .worktreeinclude y --check pasa", () => {
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Demo\nruntimes:\n  - codex\n",
      "utf8",
    );
    expect(sync().exitCode).toBe(0);
    expect(existsSync(join(lab, ".claude"))).toBe(false);
    expect(existsSync(join(lab, ".worktreeinclude"))).toBe(false);
    expect(sync().stdout).not.toContain("denegaciones de Claude Code");
    expect(sync(true).exitCode).toBe(0);
  });

  it("journey worktree create sigue informando carpeta, rama y cupo, sin avisos nuevos", () => {
    worktrees = crearLaboratorio();
    const creado = journeyWorktreeCommand(
      defaultPaths(worktrees.root),
      ["create"],
      { id: TICKET_A },
      { home: worktrees.home, proceso: procesoSimulado().ejecutor },
    );
    expect(creado.exitCode).toBe(0);
    const lineas = creado.stdout.trimEnd().split("\n");
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toContain(
      "Worktree creado: .claude/worktrees/ticket-uno (rama valmen/ticket-uno",
    );
    expect(lineas[1]).toBe("Cupo de la máquina: reservado.");
    expect(
      existsSync(
        join(worktrees.root, ".claude/worktrees/ticket-uno/node_modules/otro/index.js"),
      ),
    ).toBe(true);
  });
});

describe("la línea de permisos de sync", () => {
  it("dice cuántas denegaciones hay, cuántas agregó y que un worktree a mano no las trae", () => {
    const primera = sync().stdout;
    expect(primera).toContain("denegaciones de Claude Code  64 (64 agregadas)");
    expect(primera).toContain("un worktree creado con git worktree add a mano no las trae");
    expect(sync().stdout).toContain("denegaciones de Claude Code  64 (0 agregadas)");
  });
});
