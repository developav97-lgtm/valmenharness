/**
 * El retiro del disparador por launchd y del avance desatendido (CHORE-CLI-RETIRO-DISPARADOR-JORNADA-20261008).
 *
 * Se afirma lo retirado (responde con un aviso, sale con 2 y no escribe nada) y, con un control
 * por barrera, lo que se conserva: la preparación manual, la parada que se libera, el aviso que
 * sigue saliendo y la aprobación que sigue siendo de una persona.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapter from "../packages/adapter/src/index.js";
import {
  journeyAdvanceCommand,
  journeyClearStopCommand,
  journeyInstallTriggerCommand,
  journeyNextCommand,
} from "../packages/cli/src/commands.js";
import { pendientesDeAvisar } from "../packages/cli/src/hermes.js";
import { USAGE } from "../packages/cli/src/main.js";
import { EXIT_SCHEMA } from "../packages/core/src/index.js";
import * as engine from "../packages/engine/src/index.js";
import {
  advertenciaDeArbolSucio,
  armarJornada,
  autonomousConfig,
  leerPasadas,
  paradasActivas,
  readApprovalLog,
  recordAutonomousStop,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { crearEntornoOla, crearJornada, enJornada, ticketEn, type EntornoOla } from "./helpers/ola.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectId = "retiro-lab";
const A = "FEATURE-RETIRO-UNO-20261008";
const B = "FEATURE-RETIRO-DOS-20261008";
// Los tickets del entorno de la ola (módulo JOURNEY, como el resto de las pruebas de la ola).
const OA = "FEATURE-JOURNEY-ALFA-20261008";
const OB = "FEATURE-JOURNEY-BETA-20261008";
const AHORA = new Date("2026-10-08T08:00:00.000Z");
const ESTE_DIA_UTC = "JOR-20261008";

let home: string;
let root: string;

function politica(extra: string[] = []): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      "  dispatch-executors:",
      "    - codex",
      ...extra,
      "autonomous:",
      "  enabled: true",
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - tests-declared",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 5",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

const proyecto = () => resolveAuthorizedProject({ projectId, home });

/** Todo archivo bajo `dir` con su contenido: sirve para afirmar que nada cambió. */
function foto(dir: string): Record<string, string> {
  const salida: Record<string, string> = {};
  const recorrer = (actual: string): void => {
    for (const nombre of readdirSync(actual).sort()) {
      if (nombre === ".git") continue;
      const ruta = join(actual, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else salida[ruta.slice(dir.length)] = readFileSync(ruta, "utf8");
    }
  };
  recorrer(dir);
  return salida;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-retiro-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: retiro\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica();
  for (const id of [A, B]) writeFixtureTicket(root, { id, workflowStatus: "intake", type: "FEATURE", module: "RETIRO" });
  armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AHORA });
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("el disparador retirado", () => {
  it("C1: el CLI ofrece `journey next --wave`, al que apunta el aviso de retiro", () => {
    expect(USAGE).toContain("journey next --wave");
    expect(journeyInstallTriggerCommand({ project: projectId }).stderr).toContain("journey next --wave");
  });

  it("C3: `journey install-trigger` dice en español que está retirado, nombra la ola y sale con 2", () => {
    const resultado = journeyInstallTriggerCommand({ project: projectId });
    expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    expect(resultado.stderr).toContain("se retiró");
    expect(resultado.stderr).toContain("journey next --wave");
    expect(resultado.stderr).toContain("journey brief --id");
    expect(resultado.stderr).toContain("corrida-orquestada");
    expect(resultado.stdout).toBe("");
  });

  it("C4: `--write` no escribe ni el plist ni el script del job, ni crea la carpeta", () => {
    const dir = join(home, "LaunchAgents");
    const antes = foto(home);
    for (const via of [undefined, "hermes"]) {
      const resultado = journeyInstallTriggerCommand({ project: projectId, dir, write: true, ...(via === undefined ? {} : { via }) });
      expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    }
    expect(existsSync(dir)).toBe(false);
    expect(foto(home)).toEqual(antes);
  });

  it("C5: `journey advance` sin fase responde con el aviso de retiro, sale con 2 y no despacha ni anexa pasada", async () => {
    const antes = foto(home);
    const resultado = await journeyAdvanceCommand({ project: projectId }, { home, ahora: () => AHORA });
    expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    expect(resultado.stderr).toContain("se retiró");
    expect(resultado.stderr).toContain("journey next --wave");
    expect(leerPasadas(root)).toEqual([]);
    expect(foto(home)).toEqual(antes);
  });

  it("C6: `journey advance --fase ejecucion` responde con el mismo aviso y no despacha ni anexa pasada", async () => {
    const antes = foto(home);
    const ejecutarPreparacion = vi.fn();
    const resultado = await journeyAdvanceCommand({ project: projectId, fase: "ejecucion" }, { home, ahora: () => AHORA, ejecutarPreparacion });
    expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    expect(resultado.stderr).toContain("se retiró");
    expect(ejecutarPreparacion).not.toHaveBeenCalled();
    expect(leerPasadas(root)).toEqual([]);
    expect(foto(home)).toEqual(antes);
  });

  it("C7: el archivo del disparador ya no existe y nadie exporta el plist", () => {
    expect(existsSync(join(REPO, "packages", "cli", "src", "journey-trigger.ts"))).toBe(false);
    for (const exportes of [Object.keys(engine), Object.keys(adapter)]) {
      expect(exportes.filter((nombre) => /LaunchdPlist|escribirPlist|HermesJobScript/.test(nombre))).toEqual([]);
    }
  });

  it("C8: la ayuda marca `install-trigger` y el avance de ejecución como retirados y apunta a la ola", () => {
    const instalar = USAGE.split("\n").findIndex((l) => l.includes("journey install-trigger"));
    expect(USAGE.split("\n").slice(instalar, instalar + 3).join(" ")).toContain("RETIRADO");
    const avanzar = USAGE.split("\n").findIndex((l) => l.includes("journey advance"));
    const textoAvanzar = USAGE.split("\n").slice(avanzar, avanzar + 4).join(" ");
    expect(textoAvanzar).toContain("RETIRADO");
    expect(textoAvanzar).toContain("journey next --wave");
    expect(USAGE).not.toContain("launchd");
  });
});

describe("la configuración del despachador", () => {
  it("C9: @valmen/adapter ya no exporta readJourneyDispatcher", () => {
    expect("readJourneyDispatcher" in adapter).toBe(false);
  });

  it("C10: un config.yaml que todavía declara execution.dispatcher se carga sin error", () => {
    politica(["  dispatcher: hermes"]);
    expect(() => autonomousConfig(root)).not.toThrow();
    expect(autonomousConfig(root).enabled).toBe(true);
    expect(() => proyecto()).not.toThrow();
  });

  it("C11: el config.yaml del repositorio ya no declara dispatcher", () => {
    expect(readFileSync(join(REPO, ".valmen", "config.yaml"), "utf8")).not.toMatch(/^\s*dispatcher:/m);
  });

  it("C12: el motor ya no exporta dispatchJourney y el archivo no existe", () => {
    expect("dispatchJourney" in engine).toBe(false);
    expect(existsSync(join(REPO, "packages", "engine", "src", "journey-dispatch.ts"))).toBe(false);
  });
});

describe("lo que se conserva", () => {
  it("C13: `journey advance --fase preparacion` prepara a mano y no registra ninguna aprobación", async () => {
    const ejecutarPreparacion = vi.fn(() => ({ status: 0, stdout: "preparado", stderr: "" }));
    const resultado = await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, { home, ahora: () => AHORA, ejecutarPreparacion });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain(ESTE_DIA_UTC);
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
    expect(leerPasadas(root)).toHaveLength(1);
    // Control de la barrera: preparar no aprueba un plan.
    expect(readApprovalLog(proyecto().paths).filter((e) => e.kind !== "autonomous-stop-notice")).toEqual([]);
    expect(readFileSync(join(root, "tickets", "2026", A, "ticket.md"), "utf8")).not.toMatch(/workflow_status: approved/);
  });

  it("control: una parada de la preparación se libera con `journey clear-stop` y la preparación vuelve a elegir el ticket", async () => {
    const falla = vi.fn(() => ({ status: 2, stdout: "", stderr: "falló" }));
    const opciones = { home, ahora: () => AHORA, ejecutarPreparacion: falla };
    await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, opciones);
    expect(paradasActivas(proyecto().paths)).toHaveLength(1);
    expect(journeyClearStopCommand({ project: projectId, id: A, actor: "Juan Andrade" }, { home }).exitCode).toBe(0);
    expect(paradasActivas(proyecto().paths)).toHaveLength(0);
    await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, opciones);
    expect(falla).toHaveBeenCalledTimes(2);
  });
});

describe("el aviso de árbol sucio", () => {
  let entorno: EntornoOla;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: entorno.root, encoding: "utf8" }).trim();

  beforeEach(() => {
    entorno = crearEntornoOla();
    ticketEn(entorno.root, OA, "intake");
    ticketEn(entorno.root, OB, "approved");
    crearJornada(entorno, [enJornada(OA, 1), enJornada(OB, 2)]);
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
  });
  afterEach(() => entorno.limpiar());

  it("C15: nombra los archivos ajenos si el árbol está sucio y devuelve null si está limpio", () => {
    expect(advertenciaDeArbolSucio(entorno.root)).toBeNull();
    writeFileSync(join(entorno.root, "suelto.ts"), "export const x = 1;\n", "utf8");
    const aviso = advertenciaDeArbolSucio(entorno.root);
    expect(aviso).toContain("suelto.ts");
    expect(aviso).toContain("No bloquea");
  });

  it("C15: una raíz que no es un repositorio git no tiene aviso", () => {
    expect(advertenciaDeArbolSucio(home)).toBeNull();
  });

  it("C16: calcular el aviso no escribe ningún archivo del registro", () => {
    writeFileSync(join(entorno.root, "suelto.ts"), "export const x = 1;\n", "utf8");
    const antes = foto(entorno.root);
    advertenciaDeArbolSucio(entorno.root);
    expect(foto(entorno.root)).toEqual(antes);
    expect(existsSync(join(entorno.root, ".valmen", "journeys", "arbol-sucio.jsonl"))).toBe(false);
  });

  it("C17: `journey next --wave` con el árbol sucio imprime el aviso y sigue listando la ola; limpio no lo imprime", () => {
    const limpio = journeyNextCommand({ project: "ola-lab", wave: true }, { home: entorno.home, ahora: () => AHORA });
    expect(limpio.stderr).toBe("");
    expect(limpio.exitCode).toBe(0);
    expect(limpio.stdout).not.toContain("sin commitear");

    writeFileSync(join(entorno.root, "suelto.ts"), "export const x = 1;\n", "utf8");
    const antes = foto(entorno.root);
    const sucio = journeyNextCommand({ project: "ola-lab", wave: true }, { home: entorno.home, ahora: () => AHORA });
    expect(sucio.exitCode).toBe(0);
    expect(sucio.stdout).toContain("suelto.ts");
    expect(sucio.stdout).toContain(`${OA} [intake]`);
    expect(sucio.stdout).toContain("Ola de la jornada");
    // Sigue siendo de solo lectura.
    expect(foto(entorno.root)).toEqual(antes);
  });
});

describe("los avisos del vigilante", () => {
  it("C19: una parada autónoma y una jornada terminada siguen avisándose", () => {
    const paths = proyecto().paths;
    recordAutonomousStop(paths, { ticketId: A, reason: "executor-failed", detail: "se cayó", workflowStatus: "in_progress", now: AHORA });
    for (const id of [A, B]) {
      writeFixtureTicket(root, { id, workflowStatus: "closed", type: "FEATURE", module: "RETIRO" });
    }
    const tipos = pendientesDeAvisar(paths, AHORA).map((p) => p.kind);
    expect(tipos).toContain("autonomous-stop");
    expect(tipos).toContain("jornada-terminada");
    expect(tipos).not.toContain("arbol-sucio");
  });

  it("C20: `readApprovalLog` sigue leyendo una línea histórica journey-dirty-tree-notice", () => {
    const paths = proyecto().paths;
    const ruta = engine.approvalLogPath(paths);
    mkdirSync(dirname(ruta), { recursive: true });
    const historica = { kind: "journey-dirty-tree-notice", journeyId: ESTE_DIA_UTC, episodio: "2026-10-07T08:00:00.000Z", notifiedAt: "2026-10-07T08:30:00.000Z" };
    writeFileSync(ruta, `${JSON.stringify(historica)}\n`, "utf8");
    expect(readApprovalLog(paths)).toEqual([historica]);
  });
});

describe("la documentación vigente", () => {
  it("C30: ningún documento vigente ni skill instruye a usar install-trigger o el avance de ejecución", () => {
    const carpetas = [".valmen/skills", ".valmen/rules", "skills", "templates"];
    const archivos: string[] = [join(REPO, "README.md"), join(REPO, "AGENTS.md")];
    const recorrer = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.(md|yaml|yml|json|txt)$/.test(nombre)) archivos.push(ruta);
      }
    };
    for (const carpeta of carpetas) recorrer(join(REPO, carpeta));
    for (const archivo of archivos.filter(existsSync)) {
      const texto = readFileSync(archivo, "utf8");
      expect(texto, archivo).not.toMatch(/journey install-trigger/);
      expect(texto, archivo).not.toMatch(/journey advance[^\n]*--fase ejecucion/);
    }
  });
});
