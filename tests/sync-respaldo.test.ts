/**
 * `valmen sync --dry-run` y el respaldo de lo que `sync` sobrescribe.
 *
 * Tres reglas (spec `s1-sync`): la vista previa no escribe nada (R-SYN-001), cada
 * archivo que se pisa con contenido distinto se respalda antes (R-SYN-002) y la
 * carpeta de respaldos no se versiona (R-SYN-003). Más una de regresión para
 * `sync --check`, que no cambia.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adoptProject, syncProject } from "../packages/cli/src/commands.js";
import { dispatch, parseArgs } from "../packages/cli/src/main.js";
import { syncProjections } from "../packages/server/src/config.js";

const REPO = process.cwd();
const NOMBRE = "proyecto-de-prueba";
const SKILL_PROYECTADA = ".claude/skills/feature/SKILL.md";
const PUBLICADA = join(".valmen", "skills", "planificacion", "SKILL.md");

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-sync-respaldo-"));
  delete process.env["HERMES_HOME"];
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function leer(relativa: string): string {
  return readFileSync(join(lab, relativa), "utf8");
}

function escribir(relativa: string, contenido: string): void {
  const destino = join(lab, relativa);
  mkdirSync(join(destino, ".."), { recursive: true });
  writeFileSync(destino, contenido, "utf8");
}

/** Proyecto adoptado y sincronizado: todo al día. */
function proyectoAlDia(): void {
  adoptProject(lab, NOMBRE, {});
  syncProject(lab, NOMBRE, false);
}

/** Corre la CLI por su despachador, como lo hace `run`. */
function cli(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  return dispatch(parseArgs([...args, "--root", lab]));
}

/** Las carpetas de respaldo de `sync` (una por corrida). */
function respaldos(): string[] {
  const base = join(lab, ".valmen", "backups", "sync");
  return existsSync(base) ? readdirSync(base).sort() : [];
}

describe("R-SYN-001: sync --dry-run muestra sin escribir", () => {
  it("C1/C3: nombra AGENTS.md desactualizado con su resumen +N −M y sale con 0", () => {
    proyectoAlDia();
    escribir("AGENTS.md", leer("AGENTS.md") + "\nlínea editada a mano\n");

    const resultado = cli("sync", "--dry-run");

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toMatch(/AGENTS\.md.*\+\d+ −\d+/);
  });

  it("C2/C5/C6: deja el disco igual y no crea .valmen/backups/", () => {
    proyectoAlDia();
    escribir("AGENTS.md", leer("AGENTS.md") + "\nlínea editada a mano\n");
    escribir(PUBLICADA, "# copia editada a mano\n");
    const agentsAntes = leer("AGENTS.md");
    const skillAntes = leer(PUBLICADA);

    cli("sync", "--dry-run");

    expect(leer("AGENTS.md")).toBe(agentsAntes);
    expect(leer(PUBLICADA)).toBe(skillAntes);
    expect(existsSync(join(lab, ".valmen", "backups"))).toBe(false);
  });

  it("C4: nombra la copia de una skill publicada que reinstalaría", () => {
    proyectoAlDia();
    escribir(PUBLICADA, leer(PUBLICADA) + "\nedición a mano\n");

    const resultado = cli("sync", "--dry-run");

    expect(resultado.stdout).toContain(PUBLICADA);
  });

  it("C7: --check con --dry-run es un error de uso", () => {
    proyectoAlDia();

    const resultado = cli("sync", "--check", "--dry-run");

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toMatch(/--check.*--dry-run|--dry-run.*--check/);
  });
});

describe("R-SYN-002: sync respalda lo que pisa", () => {
  const AHORA = new Date("2026-10-11T12:30:45Z");

  function editarProyectada(): string {
    const original = leer(SKILL_PROYECTADA);
    escribir(SKILL_PROYECTADA, original + "\nediciones a mano\n");
    return leer(SKILL_PROYECTADA);
  }

  it("C8/C9/C10/C11: copia la versión editada, la registra con sha256, la nombra y proyecta", () => {
    proyectoAlDia();
    const proyectada = leer(SKILL_PROYECTADA);
    const editada = editarProyectada();

    const resultado = syncProject(lab, NOMBRE, false, { ahora: AHORA });

    const carpetas = respaldos();
    expect(carpetas).toEqual(["20261011T123045Z"]);
    const carpeta = join(lab, ".valmen", "backups", "sync", carpetas[0] as string);
    expect(readFileSync(join(carpeta, SKILL_PROYECTADA), "utf8")).toBe(editada);
    const manifiesto = JSON.parse(readFileSync(join(carpeta, "manifiesto.json"), "utf8"));
    expect(manifiesto.origen).toBe("cli");
    expect(manifiesto.archivos).toContainEqual({
      ruta: SKILL_PROYECTADA,
      sha256: createHash("sha256").update(editada).digest("hex"),
      bytes: Buffer.byteLength(editada),
    });
    expect(resultado.stdout).toContain(".valmen/backups/sync/20261011T123045Z");
    expect(leer(SKILL_PROYECTADA)).toBe(proyectada);
  });

  it("C12: un proyecto al día no crea carpeta de respaldo", () => {
    proyectoAlDia();

    syncProject(lab, NOMBRE, false);

    expect(respaldos()).toEqual([]);
    expect(existsSync(join(lab, ".valmen", "backups"))).toBe(false);
  });

  it("C13: un proyectado que no existía en disco no se respalda", () => {
    proyectoAlDia();
    rmSync(join(lab, SKILL_PROYECTADA));

    syncProject(lab, NOMBRE, false, { ahora: AHORA });

    expect(respaldos()).toEqual([]);
    expect(existsSync(join(lab, SKILL_PROYECTADA))).toBe(true);
  });

  it("C14: respalda la copia editada de una skill publicada antes de reinstalarla", () => {
    proyectoAlDia();
    escribir(PUBLICADA, "# copia editada a mano\n");

    syncProject(lab, NOMBRE, false, { ahora: AHORA });

    const carpeta = join(lab, ".valmen", "backups", "sync", "20261011T123045Z");
    expect(readFileSync(join(carpeta, PUBLICADA), "utf8")).toBe("# copia editada a mano\n");
    expect(leer(PUBLICADA)).not.toBe("# copia editada a mano\n");
  });

  it("C15: syncProjections de Mission Control respalda un proyectado editado a mano", () => {
    proyectoAlDia();
    const editada = editarProyectada();

    const resultado = syncProjections(lab);

    expect(resultado.ok).toBe(true);
    expect(resultado.backup).not.toBeNull();
    const carpeta = join(lab, resultado.backup as string);
    expect(readFileSync(join(carpeta, SKILL_PROYECTADA), "utf8")).toBe(editada);
    const manifiesto = JSON.parse(readFileSync(join(carpeta, "manifiesto.json"), "utf8"));
    expect(manifiesto.origen).toBe("mission-control");
  });
});

describe("R-SYN-003: los respaldos no se versionan", () => {
  it("C17: git check-ignore reconoce .valmen/backups/sync/ en el repositorio del harness", () => {
    const salida = execFileSync(
      "git",
      ["check-ignore", ".valmen/backups/sync/20261011T123045Z/AGENTS.md"],
      { cwd: REPO, encoding: "utf8" },
    );

    expect(salida.trim()).toBe(".valmen/backups/sync/20261011T123045Z/AGENTS.md");
  });

  it("C18: en un repositorio git sin reglas propias, git status no lista .valmen/backups/", () => {
    proyectoAlDia();
    execFileSync("git", ["init", "-q"], { cwd: lab });
    escribir("AGENTS.md", leer("AGENTS.md") + "\nlínea editada a mano\n");

    syncProject(lab, NOMBRE, false);

    expect(respaldos().length).toBe(1);
    const estado = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: lab,
      encoding: "utf8",
    });
    expect(estado).not.toContain(".valmen/backups");
  });
});

describe("regresión: sync --check", () => {
  it("C19: sigue saliendo con error ante un archivo generado editado a mano", () => {
    proyectoAlDia();
    escribir("AGENTS.md", leer("AGENTS.md") + "\nlínea editada a mano\n");

    const resultado = cli("sync", "--check");

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("AGENTS.md");
    expect(existsSync(join(lab, ".valmen", "backups"))).toBe(false);
  });
});
