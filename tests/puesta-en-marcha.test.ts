/**
 * La puesta en marcha sin pasar por la pantalla: `provider`, `routing` y `doctor`.
 *
 * Existen porque la configuración vivía **solo en Mission Control**, y eso dejaba
 * fuera el caso que motiva todo esto: que el proyecto lo configure un agente. Un
 * equipo que trabaja dentro de Claude Code le pide a Claude «instalá y configurá el
 * harness», y Claude no puede abrir un navegador.
 *
 * Lo que se protege acá:
 *
 * 1. **Nada se guarda sin probarse.** Una clave mal pegada falla en el comando y no
 *    se escribe: el mismo contrato que la pantalla.
 * 2. **El routing se escribe como lo escribe la pantalla.** Los roles sin override
 *    no se escriben —un archivo con los cuatro haría creer que el proyecto decidió
 *    sobre los cuatro— y `clear` los devuelve al preset.
 * 3. **El diagnóstico no escribe y dice el comando.** Un `doctor` que arregla solo
 *    es un programa que decide por su cuenta; lo que hace falta es que un agente
 *    lea qué falta y lo ejecute.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { readProjectRouting } from "../packages/adapter/src/index.js";
import {
  doctorCommand,
  providerCommand,
  routingCommand,
} from "../packages/cli/src/setup.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** Un proyecto adoptado a medias: lo mínimo para que el diagnóstico tenga sujeto. */
function proyecto(): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    "name: Demo\ntickets-dir: tickets\ngates: []\n",
    "utf8",
  );
  writeFileSync(join(lab, "package.json"), '{"name":"demo"}\n', "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-setup-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("routing", () => {
  it("cambia el preset y lo deja escrito como la pantalla", () => {
    proyecto();
    const guardado = routingCommand(PATHS(), { preset: "suscripcion" }, "set", undefined);
    expect(guardado.exitCode).toBe(0);

    // El archivo lo lee el motor: es la misma fuente que la pantalla.
    const declarado = readProjectRouting(lab);
    expect(declarado.preset).toBe("suscripcion");
    // Sin overrides: el preset ya trae los cuatro roles.
    expect(Object.keys(declarado.roles)).toEqual([]);
  });

  it("un rol con override se escribe, y `clear` lo devuelve al preset", () => {
    proyecto();
    routingCommand(PATHS(), { preset: "balanced" }, "set", undefined);
    const conRol = routingCommand(
      PATHS(),
      { provider: "claude-code", model: "claude-sonnet-5", effort: "high" },
      "set",
      "gate-judge",
    );
    expect(conRol.exitCode).toBe(0);

    let declarado = readProjectRouting(lab);
    expect(declarado.roles["gate-judge"]).toMatchObject({
      provider: "claude-code",
      model: "claude-sonnet-5",
      effort: "high",
    });

    // Y solo ese: escribir los cuatro haría creer que el proyecto decidió sobre los
    // cuatro.
    expect(Object.keys(declarado.roles)).toEqual(["gate-judge"]);

    const limpiado = routingCommand(PATHS(), {}, "clear", "gate-judge");
    expect(limpiado.exitCode).toBe(0);
    declarado = readProjectRouting(lab);
    expect(Object.keys(declarado.roles)).toEqual([]);
  });

  it("rechaza un rol que el harness no ejecuta y un preset inventado", () => {
    proyecto();
    const rol = routingCommand(PATHS(), { model: "claude-sonnet-5" }, "set", "implementer");
    expect(rol.exitCode).not.toBe(0);
    expect(rol.stderr).toContain("gate-evaluator");

    const preset = routingCommand(PATHS(), { preset: "el-mejor" }, "set", undefined);
    expect(preset.exitCode).not.toBe(0);
    expect(preset.stderr).toMatch(/Preset desconocido/);
  });

  it("un rol sin modelo se rechaza: el modelo es lo que decide qué corre", () => {
    proyecto();
    const resultado = routingCommand(
      PATHS(),
      { provider: "claude-code" },
      "set",
      "orchestrator",
    );
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("--model");
  });

  it("`show` avisa cuando el evaluador deja de ser probabilístico", () => {
    proyecto();
    routingCommand(PATHS(), { preset: "suscripcion" }, "set", undefined);
    const visto = routingCommand(PATHS(), {}, "show", undefined);
    expect(visto.exitCode).toBe(0);
    // El aviso sale del modelo declarado y no de una bandera escrita a mano.
    expect(visto.stdout).toContain("no apunta al evaluador probabilístico");
    expect(visto.stdout).toContain("gate-evaluator  claude-code");
  });
});

describe("provider", () => {
  it("lista el catálogo sin imprimir nunca una credencial", () => {
    const listado = providerCommand(PATHS(), {}, "list", undefined, {
      home: lab,
      env: {},
    });
    return listado.then((resultado) => {
      expect(resultado.exitCode).toBe(0);
      // El nombre del archivo sí, el valor no: el estado dice si está y cuánto
      // mide, que es lo que permite notar una clave truncada.
      expect(resultado.stdout).toContain(".valmen/.credentials.yaml");
      expect(resultado.stdout).toContain("claude-code");
      expect(resultado.stdout).toContain("anthropic");
    });
  });

  it("`set` sin --key no escribe nada y lo dice", async () => {
    const resultado = await providerCommand(PATHS(), {}, "set", "deepseek", {
      home: lab,
      env: {},
    });
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("--key");
  });

  it("una clave que no sirve no se guarda", async () => {
    // Se prueba contra el proveedor real y se falla cerrado: el mismo contrato que
    // la pantalla. La clave es inventada, así que la respuesta es un 401.
    const resultado = await providerCommand(
      PATHS(),
      { key: "sk-inventada" },
      "set",
      "deepseek",
      {
        home: lab,
        env: {},
      },
    );
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("No se escribió nada");
  }, 30_000);

  it("los modelos conocidos se listan sin catálogo público", async () => {
    // claude-code no publica su catálogo con un token de sesión: sin esta lista, el
    // selector queda vacío y hay que escribir un identificador largo a mano.
    const resultado = await providerCommand(PATHS(), {}, "models", "claude-code", {
      home: lab,
      env: {},
    });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("claude-sonnet-5");
  });
});

describe("doctor", () => {
  it("no escribe nada y dice el comando que arregla cada cosa", async () => {
    // Proyecto pelado: sin `.valmen/` y sin nada generado.
    writeFileSync(join(lab, "package.json"), '{"name":"demo"}\n', "utf8");
    const antes = readFileSync(join(lab, "package.json"), "utf8");
    const resultado = await doctorCommand(PATHS(), { env: {} });

    // Falta lo esencial en un proyecto vacío: adoptado, AGENTS.md y MCP.
    expect(resultado.exitCode).toBe(2);
    expect(resultado.stdout).toContain("valmen adopt");
    expect(resultado.stdout).toContain("valmen sync");
    expect(resultado.stdout).toContain("valmen mcp --install");
    // Y no tocó el proyecto: diagnostica, no arregla.
    expect(readFileSync(join(lab, "package.json"), "utf8")).toBe(antes);
    expect(() => readFileSync(join(lab, "AGENTS.md"), "utf8")).toThrow();
  });

  it("con el proyecto adoptado y las reglas proyectadas deja de faltar lo esencial", async () => {
    proyecto();
    writeFileSync(join(lab, "AGENTS.md"), "# Demo\n", "utf8");
    writeFileSync(join(lab, ".mcp.json"), '{"mcpServers":{"valmen":{}}}\n', "utf8");
    writeFileSync(join(lab, "opencode.json"), '{"mcp":{"valmen":{}}}\n', "utf8");

    const resultado = await doctorCommand(PATHS(), { env: {} });
    // Ya no falta nada bloqueante: los avisos —el registro vacío, Hermes— no
    // cambian el código de salida.
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("✓ Proyecto adoptado");
    expect(resultado.stdout).toContain("✓ MCP en Claude Code");
  });

  it("un routing que apunta a un proveedor inexistente se marca", async () => {
    proyecto();
    writeFileSync(
      join(lab, ".valmen", "routing.yaml"),
      "preset: balanced\nroles:\n  orchestrator:\n    provider: inventado\n    model: x\n",
      "utf8",
    );
    const resultado = await doctorCommand(PATHS(), { env: {} });
    expect(resultado.stdout).toContain("proveedor desconocido");
    expect(resultado.stdout).toContain("orchestrator=inventado");
  });
});
