/**
 * Hermes como despachador opcional de la jornada (R-JORN-011).
 *
 * Sin la declaración rige el disparador de la máquina; con `execution.dispatcher: hermes` el
 * comando prepara el job de Hermes sin agente. Nada se ejecuta: ni `launchctl` ni `hermes`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readJourneyDispatcher } from "../packages/adapter/src/index.js";
import { journeyInstallTriggerCommand } from "../packages/cli/src/commands.js";

const projectId = "despacho-lab";
const entorno = { node: "/usr/local/bin/node", cliMain: "/opt/valmen/cli/dist/main.js" };

let home: string;
let root: string;

const declarar = (lineas: string[]): void =>
  writeFileSync(join(root, ".valmen", "config.yaml"), [`project-id: ${projectId}`, ...lineas, ""].join("\n"), "utf8");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-despacho-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: despacho\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const instalar = (flags: Record<string, string | true> = {}) =>
  journeyInstallTriggerCommand({ project: projectId, ...flags }, { ...entorno, home });

describe("proyecto sin Hermes declarado", () => {
  it("sin la clave prepara el plist de launchd, no el job de Hermes", () => {
    declarar(["test-commands:", "  - node"]);
    const r = instalar();
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("launchctl bootstrap");
    expect(r.stdout).not.toContain("hermes cron create");
  });

  it("con `machine` es lo mismo, y un proyecto sin configuración también", () => {
    declarar(["execution:", "  dispatcher: machine"]);
    expect(instalar().stdout).toContain("launchctl bootstrap");
    rmSync(join(root, ".valmen", "config.yaml"));
    expect(instalar().stdout).toContain("launchctl bootstrap");
  });
});

describe("Hermes como despachador", () => {
  beforeEach(() => declarar(["execution:", "  dispatcher: hermes"]));

  it("imprime el script sin agente y el comando exacto de hermes, y no escribe nada", () => {
    const r = instalar({ every: "10" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("journey advance --project 'despacho-lab'");
    expect(r.stdout).toContain(
      `hermes cron create --no-agent --name valmen-jornada-${projectId} --script ${join(home, ".hermes", "scripts", `valmen-jornada-${projectId}.sh`)} "every 10m"`,
    );
    expect(r.stdout).toContain("Sin --write no se escribió nada");
    expect(existsSync(join(home, ".hermes"))).toBe(false);
  });

  it("con --write escribe solo el script ejecutable y dice que no registró nada en Hermes", () => {
    const dir = join(home, "scripts");
    const r = instalar({ write: true, dir });
    expect(r.stdout).toContain("No se registró nada en Hermes");
    const ruta = join(dir, `valmen-jornada-${projectId}.sh`);
    const script = readFileSync(ruta, "utf8");
    expect(script).toContain("journey advance --project");
    // Sin agente y sin credenciales: el job no llama a un modelo ni lleva secretos.
    expect(script).not.toMatch(/token|secret|password|claude|codex/i);
    expect(statSync(ruta).mode & 0o111).not.toBe(0);
    expect(existsSync(join(home, "Library"))).toBe(false);
  });

  it("--via machine fuerza el disparador de la máquina para esa llamada", () => {
    expect(instalar({ via: "machine" }).stdout).toContain("launchctl bootstrap");
  });

  it("--via hermes funciona aunque el proyecto no lo declare", () => {
    declarar([]);
    expect(instalar({ via: "hermes" }).stdout).toContain("hermes cron create --no-agent");
  });
});

describe("una declaración inválida", () => {
  it("falla con un mensaje claro en la configuración y en el comando", () => {
    expect(() => readJourneyDispatcher(parseConfig("execution:\n  dispatcher: cron\n"))).toThrow(/"machine" o "hermes"/);
    declarar(["execution:", "  dispatcher: cron"]);
    const r = instalar();
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("execution.dispatcher");
  });

  it("un --via inválido se rechaza", () => {
    expect(instalar({ via: "cron" }).exitCode).not.toBe(0);
  });
});
