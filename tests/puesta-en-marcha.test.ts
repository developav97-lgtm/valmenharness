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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { readProjectRouting } from "../packages/adapter/src/index.js";
import {
  doctorCommand,
  perfilesCommand,
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

describe("perfiles", () => {
  const perfilesYaml = () => join(lab, ".valmen", "profiles.yaml");
  const PROPIO =
    "perfiles:\n  mio:\n    description: El mío\n    roles:\n      architect:\n" +
    "        provider: claude-code\n        model: claude-opus-5-5\n        effort: high\n";

  function conPerfilPropio(): void {
    proyecto();
    writeFileSync(join(lab, ".valmen", "routing.yaml"), "preset: balanced\n", "utf8");
    writeFileSync(perfilesYaml(), PROPIO, "utf8");
  }

  it("C1 lista los incorporados y los del proyecto con su origen", () => {
    conPerfilPropio();
    const r = perfilesCommand(PATHS(), {}, undefined, undefined);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/claude-code-completo\s+incorporado/);
    expect(r.stdout).toMatch(/mio\s+proyecto/);
  });

  it("C2 C3 C4 marca la elección del proyecto y la del ejecutor, y lista las fases", () => {
    conPerfilPropio();
    perfilesCommand(PATHS(), {}, "elegir", "claude-code-completo");
    perfilesCommand(PATHS(), { cliente: "codex" }, "elegir", "mio");
    const r = perfilesCommand(PATHS(), { cliente: "claude" }, "list", undefined);
    expect(r.stdout).toMatch(/claude-code-completo\s+incorporado\s+elegido para el proyecto/);
    expect(r.stdout).toContain("elegido para codex");
    expect(r.stdout).toContain("Modelos por fase (cliente: claude)");
    expect(r.stdout).toContain("perfil claude-code-completo");
  });

  it("C5 show muestra cada rol con proveedor, modelo y esfuerzo", () => {
    conPerfilPropio();
    const r = perfilesCommand(PATHS(), {}, "show", "mio");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/architect\s+claude-code\s+claude-opus-5-5\s+high/);
  });

  it("C6 show con un id inexistente falla y lo dice", () => {
    conPerfilPropio();
    const r = perfilesCommand(PATHS(), {}, "show", "nada");
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('"nada" no existe');
  });

  it("C7 C8 elegir escribe el perfil del proyecto y conserva los del proyecto", () => {
    conPerfilPropio();
    const r = perfilesCommand(PATHS(), {}, "elegir", "mio");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("próxima corrida");
    const texto = readFileSync(perfilesYaml(), "utf8");
    expect(texto).toContain("proyecto: mio");
    expect(texto).toContain("description: El mío");
    expect(texto).toContain("model: claude-opus-5-5");
  });

  it("C9 elegir para un ejecutor no cambia el del proyecto", () => {
    conPerfilPropio();
    perfilesCommand(PATHS(), {}, "elegir", "mio");
    const r = perfilesCommand(PATHS(), { cliente: "codex" }, "elegir", "claude-code-completo");
    expect(r.exitCode).toBe(0);
    const texto = readFileSync(perfilesYaml(), "utf8");
    expect(texto).toContain("proyecto: mio");
    expect(texto).toMatch(/codex: claude-code-completo/);
  });

  it("C10 un id inexistente falla y no modifica el archivo", () => {
    conPerfilPropio();
    const antes = readFileSync(perfilesYaml(), "utf8");
    const r = perfilesCommand(PATHS(), {}, "elegir", "nada");
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("no existe");
    expect(readFileSync(perfilesYaml(), "utf8")).toBe(antes);

    rmSync(perfilesYaml());
    perfilesCommand(PATHS(), {}, "elegir", "nada");
    expect(existsSync(perfilesYaml())).toBe(false);
  });

  it("C11 un ejecutor sin perfil falla y no escribe", () => {
    conPerfilPropio();
    const antes = readFileSync(perfilesYaml(), "utf8");
    const r = perfilesCommand(PATHS(), { cliente: "pepe" }, "elegir", "mio");
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("no es un ejecutor con perfil");
    expect(readFileSync(perfilesYaml(), "utf8")).toBe(antes);
  });

  it("C12 C13 quitar quita la elección del proyecto o la de un ejecutor, no la otra", () => {
    conPerfilPropio();
    perfilesCommand(PATHS(), {}, "elegir", "mio");
    perfilesCommand(PATHS(), { cliente: "codex" }, "elegir", "claude-code-completo");

    const delEjecutor = perfilesCommand(PATHS(), { cliente: "codex" }, "quitar", undefined);
    expect(delEjecutor.exitCode).toBe(0);
    let texto = readFileSync(perfilesYaml(), "utf8");
    expect(texto).toContain("proyecto: mio");
    expect(texto).not.toContain("codex:");

    const delProyecto = perfilesCommand(PATHS(), {}, "quitar", undefined);
    expect(delProyecto.exitCode).toBe(0);
    texto = readFileSync(perfilesYaml(), "utf8");
    expect(texto).not.toContain("seleccion:");
    expect(texto).toContain("mio:");
  });

  it("C14 elegir y quitar dejan routing.yaml y config.yaml con los mismos bytes", () => {
    conPerfilPropio();
    const rutas = [join(lab, ".valmen", "routing.yaml"), join(lab, ".valmen", "config.yaml")];
    const antes = rutas.map((ruta) => readFileSync(ruta));
    perfilesCommand(PATHS(), {}, "elegir", "mio");
    perfilesCommand(PATHS(), { cliente: "claude" }, "elegir", "claude-code-completo");
    perfilesCommand(PATHS(), {}, "quitar", undefined);
    perfilesCommand(PATHS(), { cliente: "claude" }, "quitar", undefined);
    rutas.forEach((ruta, i) => expect(readFileSync(ruta).equals(antes[i] as Buffer)).toBe(true));
  });

  it("C15 un profiles.yaml ilegible sale con el mensaje y sin excepción", () => {
    proyecto();
    writeFileSync(perfilesYaml(), "perfiles:\n  - esto no es un mapa\n  [roto\n", "utf8");
    let r: ReturnType<typeof perfilesCommand> | undefined;
    expect(() => {
      r = perfilesCommand(PATHS(), {}, undefined, undefined);
    }).not.toThrow();
    expect(r?.exitCode).not.toBe(0);
    expect((r?.stderr ?? "").length).toBeGreaterThan(0);
  });

  it("C16 routing show nombra el perfil y su alcance en el rol que sale de él", () => {
    conPerfilPropio();
    perfilesCommand(PATHS(), {}, "elegir", "claude-code-completo");
    const r = routingCommand(PATHS(), {}, "show", undefined);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("perfil claude-code-completo (proyecto)");
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

    // Con una credencial declarada por entorno: sin ninguna, el diagnóstico marca
    // «Credenciales» como faltante —que es correcto— y el código sería 2.
    const resultado = await doctorCommand(PATHS(), {
      env: { OPENROUTER_API_KEY: "de-prueba" },
    });
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

  it("mantiene operativo el flujo CLI cuando MCP y Hermes no están seleccionados", async () => {
    proyecto();
    writeFileSync(join(lab, "AGENTS.md"), "# Demo\n", "utf8");

    const resultado = await doctorCommand(PATHS(), {
      env: { OPENROUTER_API_KEY: "de-prueba", HERMES_HOME: lab },
    });

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("Flujo básico CLI");
    expect(resultado.stdout).toContain("Capacidades opcionales");
    expect(resultado.stdout).toContain("MCP en Claude Code");
    expect(resultado.stdout).toContain("Hermes no seleccionado");
  });

  it("no muestra una lista de acciones vacía cuando solo quedan avisos informativos", async () => {
    proyecto();
    writeFileSync(join(lab, "AGENTS.md"), "# Demo\n", "utf8");
    writeFileSync(join(lab, ".mcp.json"), '{"mcpServers":{"valmen":{}}}\n', "utf8");
    writeFileSync(join(lab, "opencode.json"), '{"mcp":{"valmen":{}}}\n', "utf8");
    mkdirSync(join(lab, "tickets"), { recursive: true });
    writeFileSync(join(lab, "config.yaml"), "profiles: {}\n", "utf8");

    const resultado = await doctorCommand(PATHS(), {
      env: { OPENROUTER_API_KEY: "de-prueba", HERMES_HOME: lab },
    });

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).not.toContain("Qué hacer, en orden:");
  });

  it("declara la compatibilidad y los límites de las capacidades seleccionadas", async () => {
    proyecto();
    writeFileSync(join(lab, "AGENTS.md"), "# Demo\n", "utf8");
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      [
        "name: Demo",
        "tickets-dir: tickets",
        "gates: []",
        "execution:",
        "  observation-sources:",
        "    - opencode",
        "  dispatch-executors:",
        "    - hermes",
        "",
      ].join("\n"),
      "utf8",
    );

    const resultado = await doctorCommand(PATHS(), {
      env: { OPENROUTER_API_KEY: "de-prueba", HERMES_HOME: lab },
    });

    expect(resultado.stdout).toContain("Observación seleccionada: opencode");
    expect(resultado.stdout).toContain("Solo metadatos incrementales");
    expect(resultado.stdout).toContain("Despacho seleccionado: hermes");
    expect(resultado.stdout).toContain(
      "requiere la integración Hermes de jornadas autorizada",
    );
  });

  it("declara una fuente seleccionada sin perfil conocido sin inventar soporte", async () => {
    proyecto();
    writeFileSync(join(lab, "AGENTS.md"), "# Demo\n", "utf8");
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Demo\ntickets-dir: tickets\ngates: []\nexecution:\n  observation-sources:\n    - fuente-local\n",
      "utf8",
    );

    const resultado = await doctorCommand(PATHS(), {
      env: { OPENROUTER_API_KEY: "de-prueba", HERMES_HOME: lab },
    });

    expect(resultado.stdout).toContain("Observación seleccionada: fuente-local");
    expect(resultado.stdout).toContain("compatibilidad no declarada");
  });

  it("diagnostica una raíz temporal sin modificar un archivo ajeno", async () => {
    proyecto();
    writeFileSync(join(lab, "AGENTS.md"), "# Demo\n", "utf8");
    const ajeno = join(tmpdir(), `valmen-doctor-ajeno-${Date.now()}.txt`);
    writeFileSync(ajeno, "no tocar\n", "utf8");

    try {
      await doctorCommand(PATHS(), {
        env: { OPENROUTER_API_KEY: "de-prueba", HERMES_HOME: lab },
      });
      expect(readFileSync(ajeno, "utf8")).toBe("no tocar\n");
    } finally {
      rmSync(ajeno, { force: true });
    }
  });
});
