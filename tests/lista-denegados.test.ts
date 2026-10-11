/**
 * La lista única de rutas y comandos denegados (CHORE-CORE-LISTA-DENEGADOS-20261010).
 *
 * «El motor no cambia» es la caracterización: fija, con el valor exacto que cada función devuelve,
 * lo que las cinco listas del motor admiten y rechazan. Se escribió y se corrió sobre el código
 * anterior al cambio; mover las listas a `@valmen/core` no puede tocar una sola fila.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DENIED_GIT_FLAGS, SENSITIVE_PATH_PATTERNS } from "../packages/core/src/index.js";
import {
  ejecutarGitDeQaAgent,
  motivoDeArchivoProhibido,
  motivoDeGitDeIntegracion,
  motivoDeGitDeWorktree,
  motivoDeGitProhibido,
} from "../packages/engine/src/index.js";

const CARPETA = ".claude/worktrees/ticket-lista-denegados";
const RAIZ = join(import.meta.dirname, "..");
const DENIED_CORE = join(RAIZ, "packages", "core", "src", "denied.ts");
const SRC_DEL_MOTOR = join(RAIZ, "packages", "engine", "src");

/** El código de un archivo sin sus comentarios: los de cabecera nombran las banderas en prosa. */
const sinComentarios = (texto: string): string =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * El motivo con el que la lista de `qa-agent` rechaza una invocación, o `null` si la admite.
 *
 * Se observa por el ejecutor (`ejecutarGitDeQaAgent`), que rechaza con el mismo motivo que
 * `motivoDeGitDeQaAgent` y es la entrada que el motor consume. `motivoDeGitDeQaAgent` no se
 * importa aquí a propósito: la guarda de exportaciones lo contaría como consumido y pediría quitar
 * su entrada de la línea base, que este ticket no toca.
 */
const motivoDeQaAgent = (argumentos: readonly string[]): string | null => {
  try {
    ejecutarGitDeQaAgent(argumentos, RAIZ, () => ({ status: 0, stdout: "", stderr: "" }));
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const archivosDelMotor = (): ReadonlyArray<readonly [string, string]> =>
  readdirSync(SRC_DEL_MOTOR)
    .filter((nombre) => nombre.endsWith(".ts"))
    .sort()
    .map((nombre) => [
      nombre,
      sinComentarios(readFileSync(join(SRC_DEL_MOTOR, nombre), "utf8")),
    ]);

describe("el motor no cambia", () => {
  const fuera = (ruta: string): string => `${ruta} está fuera del proyecto`;
  const prohibido = (ruta: string): string =>
    `${ruta} es un archivo que una jornada no commitea (credenciales o configuración del harness)`;

  describe("motivoDeArchivoProhibido (C7)", () => {
    const filas: ReadonlyArray<readonly [string, string | null]> = [
      [".env", prohibido(".env")],
      [".env.local", prohibido(".env.local")],
      ["app/.env.production", prohibido("app/.env.production")],
      [".credentials", prohibido(".credentials")],
      [".credentials.json", prohibido(".credentials.json")],
      ["id_rsa", prohibido("id_rsa")],
      ["id_rsa.pub", prohibido("id_rsa.pub")],
      ["keys/id_ed25519", prohibido("keys/id_ed25519")],
      ["cert.pem", prohibido("cert.pem")],
      ["x.key", prohibido("x.key")],
      ["a.p12", prohibido("a.p12")],
      [".valmen/config.yaml", prohibido(".valmen/config.yaml")],
      [".valmen/routing.yaml", prohibido(".valmen/routing.yaml")],
      [".valmen/delegations/d.json", prohibido(".valmen/delegations/d.json")],
      [".envrc", null],
      ["src/ok.ts", null],
      ["keyboard.ts", null],
      ["docs/key.md", null],
      ["/etc/passwd", fuera("/etc/passwd")],
      ["../x", fuera("../x")],
    ];

    it.each(filas)("%s", (ruta, esperado) => {
      expect(motivoDeArchivoProhibido(ruta)).toBe(esperado);
    });
  });

  describe("git", () => {
    type Fila = readonly [readonly string[], string | null];

    describe("motivoDeGitProhibido, la lista de las jornadas (C8)", () => {
      const bandera = (b: string): string =>
        `La bandera ${b} no está permitida a una jornada.`;
      const filas: readonly Fila[] = [
        [["commit", "-m", "--force"], bandera("--force")],
        [["commit", "-m", "-f"], bandera("-f")],
        [["commit", "-m", "--force-with-lease"], bandera("--force-with-lease")],
        [["commit", "-m", "--hard"], bandera("--hard")],
        [["commit", "-m", "--no-verify"], bandera("--no-verify")],
        [["commit", "-m", "--amend"], bandera("--amend")],
        [["commit", "-m", "-D"], null],
        [["commit", "-m", "mensaje"], null],
        [["status"], null],
      ];

      it.each(filas)("%j", (argumentos, esperado) => {
        expect(motivoDeGitProhibido(argumentos)).toBe(esperado);
      });
    });

    describe("la lista de qa-agent, motivoDeGitDeQaAgent (C9)", () => {
      const bandera = (b: string): string =>
        `La bandera ${b} no está permitida a qa-agent.`;
      const filas: readonly Fila[] = [
        [["diff", "--name-status", "-z", "-M", "-C", "--force"], bandera("--force")],
        [["diff", "--name-status", "-z", "-M", "-C", "-f"], bandera("-f")],
        [["diff", "--name-status", "-z", "-M", "-C", "--force-with-lease"], null],
        [["diff", "--name-status", "-z", "-M", "-C", "--hard"], bandera("--hard")],
        [
          ["diff", "--name-status", "-z", "-M", "-C", "--no-verify"],
          bandera("--no-verify"),
        ],
        [["diff", "--name-status", "-z", "-M", "-C", "--amend"], bandera("--amend")],
        [["diff", "--name-status", "-z", "-M", "-C", "-D"], null],
        [["worktree", "remove", "--force", CARPETA], null],
        [["worktree", "remove", "-f", CARPETA], bandera("-f")],
        [["worktree", "add", "--detach", "-D", "abc1234"], null],
        [["rev-parse", "HEAD"], null],
      ];

      it.each(filas)("%j", (argumentos, esperado) => {
        expect(motivoDeQaAgent(argumentos)).toBe(esperado);
      });
    });

    describe("motivoDeGitDeWorktree (C10)", () => {
      const bandera = (b: string): string =>
        `La bandera ${b} no está permitida en los worktrees.`;
      const forma =
        "git rev-parse admite `--git-dir`, `--git-common-dir`, `--abbrev-ref <ref>` o una referencia.";
      const filas: readonly Fila[] = [
        [["rev-parse", "--force"], bandera("--force")],
        [["rev-parse", "-f"], bandera("-f")],
        [["rev-parse", "--force-with-lease"], forma],
        [["rev-parse", "--hard"], bandera("--hard")],
        [["rev-parse", "--no-verify"], bandera("--no-verify")],
        [["rev-parse", "--amend"], bandera("--amend")],
        [["rev-parse", "-D"], bandera("-D")],
        [["worktree", "remove", "--force", CARPETA], bandera("--force")],
        [["branch", "-D", "valmen/ticket-lista-denegados"], bandera("-D")],
        [["rev-parse", "--git-dir"], null],
        [["status", "--porcelain"], null],
      ];

      it.each(filas)("%j", (argumentos, esperado) => {
        expect(motivoDeGitDeWorktree(argumentos)).toBe(esperado);
      });
    });

    describe("motivoDeGitDeIntegracion (C11)", () => {
      const bandera = (b: string): string =>
        `La bandera ${b} no está permitida en la integración.`;
      const filas: readonly Fila[] = [
        [["commit", "-m", "--force"], bandera("--force")],
        [["commit", "-m", "-f"], bandera("-f")],
        [["commit", "-m", "--force-with-lease"], null],
        [["commit", "-m", "--hard"], bandera("--hard")],
        [["commit", "-m", "--no-verify"], bandera("--no-verify")],
        [["commit", "-m", "--amend"], bandera("--amend")],
        [["commit", "-m", "-D"], bandera("-D")],
        [["worktree", "remove", "--force", CARPETA], bandera("--force")],
        [["branch", "-D", "valmen/ticket-lista-denegados"], bandera("-D")],
        [["commit", "-m", "mensaje"], null],
        [["merge", "--abort"], null],
      ];

      it.each(filas)("%j", (argumentos, esperado) => {
        expect(motivoDeGitDeIntegracion(argumentos)).toBe(esperado);
      });
    });
  });
});

describe("la lista de core", () => {
  it("SENSITIVE_PATH_PATTERNS lleva los cuatro patrones de credenciales con el mismo texto (C1)", () => {
    expect(SENSITIVE_PATH_PATTERNS.map((patron) => patron.source)).toEqual([
      String.raw`(^|\/)\.env(\.|$)`,
      String.raw`(^|\/)\.credentials(\.|$)`,
      String.raw`(^|\/)(id_rsa|id_ed25519)(\.pub)?$`,
      String.raw`\.(pem|key|p12)$`,
    ]);
  });

  it("DENIED_GIT_FLAGS es la intersección de las cuatro listas del motor: cinco banderas (C2)", () => {
    expect(DENIED_GIT_FLAGS).toEqual(["--force", "-f", "--hard", "--no-verify", "--amend"]);
  });

  it("SENSITIVE_PATH_PATTERNS está congelada (C3)", () => {
    expect(Array.isArray(SENSITIVE_PATH_PATTERNS)).toBe(true);
    expect(Object.isFrozen(SENSITIVE_PATH_PATTERNS)).toBe(true);
  });

  it("DENIED_GIT_FLAGS está congelada (C4)", () => {
    expect(Array.isArray(DENIED_GIT_FLAGS)).toBe(true);
    expect(Object.isFrozen(DENIED_GIT_FLAGS)).toBe(true);
  });

  it("ningún patrón lleva banderas de expresión regular, así que compartirlo no guarda estado (C5)", () => {
    expect(SENSITIVE_PATH_PATTERNS.length).toBeGreaterThan(0);
    for (const patron of SENSITIVE_PATH_PATTERNS) expect(patron.flags).toBe("");
  });

  it("el módulo de core no importa ningún otro módulo (C6)", () => {
    const codigo = sinComentarios(readFileSync(DENIED_CORE, "utf8"));
    expect(codigo).not.toMatch(/\bimport\b/);
    expect(codigo).not.toMatch(/\brequire\b/);
  });

  it("ningún archivo del motor repite el texto de un patrón de core (C12)", () => {
    const archivos = archivosDelMotor();
    expect(archivos.length).toBeGreaterThan(0);
    for (const patron of SENSITIVE_PATH_PATTERNS) {
      const repetidos = archivos
        .filter(([, codigo]) => codigo.includes(patron.source))
        .map(([nombre]) => nombre);
      expect(repetidos, patron.source).toEqual([]);
    }
  });

  it("ningún archivo del motor declara por su cuenta las banderas que solo usan las listas de denegación (C13)", () => {
    const exclusivas = DENIED_GIT_FLAGS.filter(
      (bandera) => !["--force", "-f"].includes(bandera),
    );
    expect(exclusivas).toEqual(["--hard", "--no-verify", "--amend"]);
    const archivos = archivosDelMotor();
    for (const bandera of exclusivas) {
      const declarados = archivos
        .filter(
          ([, codigo]) =>
            codigo.includes(`"${bandera}"`) || codigo.includes(`'${bandera}'`),
        )
        .map(([nombre]) => nombre);
      expect(declarados, bandera).toEqual([]);
    }
  });
});
