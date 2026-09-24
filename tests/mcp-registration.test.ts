/**
 * El registro del servidor MCP en los agentes.
 *
 * Esta suite no prueba el servidor —eso está en `mcp-server.test.ts`— sino el
 * paso que hace que alguien lo use: **declararlo en el archivo del agente**. Es
 * un paso que toca archivos de configuración que ya existían y que tienen cosas
 * de otras herramientas, así que lo que se prueba aquí es, sobre todo, que no
 * rompa nada:
 *
 * 1. **Lo que ya estaba se conserva.** Otros servidores MCP, claves que este
 *    código no conoce, comentarios en el caso del TOML de codex.
 * 2. **Un archivo que no se pudo leer no se pisa.** Un `opencode.json` con
 *    comentarios —que es JSONC, no JSON— no se puede analizar, y sobrescribirlo
 *    borraría la configuración de alguien. Se deja intacto y se informa.
 * 3. **Es idempotente.** Aplicarlo dos veces no acumula entradas: un `--install`
 *    repetido sobre el mismo proyecto tiene que dejar el mismo archivo.
 * 4. **El `--root` va escrito.** Es lo que hace que la declaración sirva: el
 *    servidor tiene que saber sobre qué proyecto escribe sin depender del
 *    directorio de trabajo del proceso hijo.
 */
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MCP_SERVER_ID,
  RELATIVE_CWD,
  claudeServer,
  codexToml,
  mcpEntry,
  mcpExecutableFrom,
  mergeClaudeConfig,
  mergeCodexConfig,
  mergeOpencodeConfig,
  opencodeServer,
  readIfExists,
} from "../packages/adapter/src/mcp.js";
import {
  claudeConfigPath,
  codexConfigPath,
  dshProfilePath,
  dshSnippet,
  mcpCommand,
  opencodeConfigPath,
} from "../packages/cli/src/mcp.js";

let lab: string;
const ROOT = "/proyectos/tienda";
const EJECUTABLE = "/opt/valmen/packages/mcp/dist/main.js";

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-mcp-inst-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** La entrada de trabajo. */
function entrada() {
  return mcpEntry(EJECUTABLE);
}

describe("la entrada del servidor", () => {
  it("no graba la raíz: la resuelve el servidor por su directorio de trabajo", () => {
    // Es la diferencia entre una configuración que sirve para cualquier
    // proyecto y una que solo sirve para el primero que se registró.
    expect(entrada()).toEqual({ command: EJECUTABLE, args: [] });
  });

  it("deduce el ejecutable hermano cuando el CLI corre desde su paquete", () => {
    expect(mcpExecutableFrom("/repos/valmen/packages/cli/dist/main.js")).toBe(
      "/repos/valmen/packages/mcp/dist/main.js",
    );
  });

  it("devuelve el nombre cuando el binario está instalado por enlace", () => {
    // Es el caso bueno: la configuración que se escriba no lleva ninguna ruta
    // absoluta, así que sirve en cualquier máquina. Se usa un enlace de verdad
    // porque es la señal que distingue una instalación de una ruta de trabajo, y
    // es exactamente la que se perdía al mirar la ruta del módulo en vez de la de
    // invocación.
    const enlace = join(lab, "valmen");
    symlinkSync("/repos/valmen/packages/cli/dist/main.js", enlace);
    expect(mcpExecutableFrom(enlace)).toBe("valmen-mcp");
  });

  it("cae al nombre del ejecutable cuando la forma no es la del repositorio", () => {
    // Inventar una ruta que no existe es peor que dejar que el `PATH` resuelva.
    expect(mcpExecutableFrom("/usr/local/bin/valmen")).toBe("valmen-mcp");
  });

  it("declara el servidor habilitado y con directorio de trabajo", () => {
    const servidor = opencodeServer(entrada());
    expect(servidor["type"]).toBe("local");
    expect(servidor["enabled"]).toBe(true);
    expect(servidor["cwd"]).toBe(RELATIVE_CWD);
    // Sin `--root`: la raíz sale del directorio de trabajo, que es el del
    // proyecto abierto. Grabar la raíz ataría la configuración a un proyecto.
    expect(servidor["command"]).toEqual([EJECUTABLE]);
  });
});

describe("la fusión en el `.mcp.json` de Claude Code", () => {
  it("usa la clave de Claude Code, que no es la de opencode", () => {
    // Mismo formato de archivo, clave distinta: `mcpServers` en vez de `mcp`. Una
    // entrada escrita con la clave equivocada no da error —simplemente el
    // servidor no aparece—, que es el fallo que este comando existe para evitar.
    const documento = JSON.parse(mergeClaudeConfig(null, entrada()).content) as Record<
      string,
      unknown
    >;
    expect(Object.keys(documento)).toEqual(["mcpServers"]);
    expect(claudeServer(entrada())).toEqual({
      command: EJECUTABLE,
      args: [],
      cwd: RELATIVE_CWD,
    });
  });

  it("conserva los otros servidores y es idempotente", () => {
    const previo = JSON.stringify({
      mcpServers: { github: { command: "npx", args: ["-y", "server-github"] } },
    });
    const primera = mergeClaudeConfig(previo, entrada());
    const servidores = (
      JSON.parse(primera.content) as Record<string, Record<string, unknown>>
    )["mcpServers"];

    expect(servidores?.["github"]).toEqual({
      command: "npx",
      args: ["-y", "server-github"],
    });
    expect(servidores?.[MCP_SERVER_ID]).toBeDefined();

    const segunda = mergeClaudeConfig(primera.content, entrada());
    expect(segunda.changed).toBe(false);
    expect(segunda.content).toBe(primera.content);
  });

  it("no pisa un archivo que no se pudo leer", () => {
    // Los comentarios son válidos en el `opencode.json` de opencode y no en JSON.
    // Aquí el caso es el mismo: un archivo ilegible puede tener la configuración
    // de otras herramientas, y sobrescribirlo sería borrarla.
    const roto = '{ "mcpServers": { /* comentario */ } }';
    const resultado = mergeClaudeConfig(roto, entrada());
    expect(resultado.changed).toBe(false);
    expect(resultado.content).toBe(roto);
  });
});

describe("la declaración en DSH", () => {
  it("es una lista de inserción de su capa de parches", () => {
    // La forma importa: DSH compone su árbol con entradas `- insert:`, y una
    // entrada suelta no se carga —sin error, otra vez—.
    const fragmento = dshSnippet(entrada());
    expect(fragmento).toContain("- insert:");
    expect(fragmento).toContain("name: '@deepseek-ai/dsh-mcp-client'");
    expect(fragmento).toContain("serverName: valmen");
    expect(fragmento).toContain(`command: ${EJECUTABLE}`);
    // Sin `cwd`: el servidor hereda el directorio desde el que se lanzó DSH, que
    // es el espacio de trabajo. Fijarlo en un archivo de perfil haría que todas
    // las sesiones escribieran en el registro de un proyecto concreto.
    expect(fragmento).not.toContain("cwd");
  });

  it("vive en el perfil de DSH, que es global", () => {
    expect(dshProfilePath("/casa/juan")).toBe(
      "/casa/juan/.dsh/profiles/web/cordis.patch.yml",
    );
  });
});

describe("la fusión en opencode.json", () => {
  it("crea el archivo con el esquema cuando no existe", () => {
    const resultado = mergeOpencodeConfig(null, entrada());
    expect(resultado.changed).toBe(true);

    const documento = JSON.parse(resultado.content) as Record<string, unknown>;
    expect(documento["$schema"]).toBe("https://opencode.ai/config.json");
    expect((documento["mcp"] as Record<string, unknown>)[MCP_SERVER_ID]).toBeDefined();
  });

  it("conserva los otros servidores MCP y las claves ajenas", () => {
    const previo = JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      default_agent: "build",
      mcp: {
        codegraph: { type: "local", command: ["codegraph", "serve", "--mcp"] },
      },
    });

    const resultado = mergeOpencodeConfig(previo, entrada());
    const documento = JSON.parse(resultado.content) as Record<string, unknown>;
    const mcp = documento["mcp"] as Record<string, unknown>;

    expect(resultado.changed).toBe(true);
    expect(mcp["codegraph"]).toEqual({
      type: "local",
      command: ["codegraph", "serve", "--mcp"],
    });
    expect(mcp[MCP_SERVER_ID]).toBeDefined();
    // Una clave que este código no conoce no se puede perder por el camino.
    expect(documento["default_agent"]).toBe("build");
  });

  it("es idempotente: la segunda vez no cambia el archivo", () => {
    const primera = mergeOpencodeConfig(null, entrada());
    const segunda = mergeOpencodeConfig(primera.content, entrada());

    expect(segunda.changed).toBe(false);
    expect(segunda.content).toBe(primera.content);
  });

  it("no guarda la ruta del proyecto, así que sirve en cualquier máquina", () => {
    // Es lo que hace que este archivo se pueda versionar: con la ruta absoluta
    // de una máquina dentro, en otra el servidor no arranca y el síntoma es que
    // las herramientas «no existen».
    const fusion = mergeOpencodeConfig(null, entrada());
    expect(fusion.content).not.toContain(ROOT);
    expect(fusion.content).not.toContain("/proyectos");
    const mcp = (JSON.parse(fusion.content) as Record<string, unknown>)["mcp"] as Record<
      string,
      unknown
    >;
    expect((mcp[MCP_SERVER_ID] as Record<string, unknown>)["cwd"]).toBe(RELATIVE_CWD);
  });

  it("actualiza la entrada si el ejecutable cambió, sin duplicarla", () => {
    const primera = mergeOpencodeConfig(null, entrada());
    const otra = mergeOpencodeConfig(primera.content, mcpEntry("/otro/valmen-mcp"));

    expect(otra.changed).toBe(true);
    const mcp = (JSON.parse(otra.content) as Record<string, unknown>)["mcp"] as Record<
      string,
      unknown
    >;
    expect(Object.keys(mcp)).toEqual([MCP_SERVER_ID]);
    expect(JSON.stringify(mcp[MCP_SERVER_ID])).toContain("/otro/valmen-mcp");
  });

  it("no pisa un archivo que no pudo analizar, y lo dice", () => {
    // `opencode.jsonc` permite comentarios, así que un archivo perfectamente
    // válido para opencode puede no ser JSON. Sobrescribirlo borraría la
    // configuración de esa persona.
    const conComentarios = '{\n  // servidores\n  "mcp": {}\n}\n';
    const resultado = mergeOpencodeConfig(conComentarios, entrada());

    expect(resultado.changed).toBe(false);
    expect(resultado.content).toBe(conComentarios);
    expect(resultado.note).toContain("no es JSON válido");
  });

  it("tampoco pisa un archivo que es JSON pero no un objeto", () => {
    const resultado = mergeOpencodeConfig("[1, 2, 3]", entrada());
    expect(resultado.changed).toBe(false);
    expect(resultado.content).toBe("[1, 2, 3]");
  });
});

describe("la fusión en el config.toml de codex", () => {
  it("añade la sección al final sin tocar lo que había", () => {
    const previo =
      'model = "gpt-5.6-terra"\n\n[mcp_servers.codegraph]\ncommand = "codegraph"\n';
    const resultado = mergeCodexConfig(previo, entrada());

    expect(resultado.changed).toBe(true);
    expect(resultado.content.startsWith(previo)).toBe(true);
    expect(resultado.content).toContain(`[mcp_servers.${MCP_SERVER_ID}]`);
    expect(resultado.content).toContain(`cwd = "${RELATIVE_CWD}"`);
    // La entrada ajena sigue donde estaba.
    expect(resultado.content).toContain("[mcp_servers.codegraph]");
  });

  it("no duplica la sección si ya estaba, aunque su contenido difiera", () => {
    const previo = `model = "x"\n\n[mcp_servers.${MCP_SERVER_ID}]\ncommand = "/viejo"\n`;
    const resultado = mergeCodexConfig(previo, entrada());

    expect(resultado.changed).toBe(false);
    expect(resultado.content).toBe(previo);
    // Cambiar la configuración de otro runtime sin que nadie lo pida es peor
    // que informar de que ya hay una entrada.
    expect(resultado.note).toContain("ya había");
  });

  it("escapa las barras invertidas, para que una ruta de Windows siga siendo válida", () => {
    const bloque = codexToml(mcpEntry("C:\\valmen\\mcp.exe"));
    expect(bloque).toContain('command = "C:\\\\valmen\\\\mcp.exe"');
  });
});

describe("el comando `valmen mcp`", () => {
  it("muestra los cuatro fragmentos sin escribir nada", () => {
    const resultado = mcpCommand({
      root: lab,
      cliEntry: "/repos/valmen/packages/cli/dist/main.js",
      install: false,
      global: false,
      json: false,
    });

    expect(resultado.exitCode).toBe(0);
    // Los cuatro agentes con los que se trabaja: el registro tiene que decir los
    // cuatro, porque el que falta es el que parece no estar soportado.
    expect(resultado.stdout).toContain("opencode");
    expect(resultado.stdout).toContain("Claude Code");
    expect(resultado.stdout).toContain("codex");
    expect(resultado.stdout).toContain("DSH");
    expect(resultado.stdout).toContain("[mcp_servers.valmen]");
    expect(resultado.stdout).toContain("mcpServers");
    expect(resultado.stdout).toContain("dsh-mcp-client");
    // Y dice cómo comprobar que arranca, que es el primer fallo real.
    expect(resultado.stdout).toContain("--check");
    // La puerta que no depende de ninguna configuración: el CLI.
    expect(resultado.stdout).toContain("valmen …");
    // Nada se escribió: sin `--install` el comando solo informa.
    expect(readIfExists(opencodeConfigPath(lab))).toBeNull();
    expect(readIfExists(claudeConfigPath(lab))).toBeNull();
  });

  it("con `--install` escribe la configuración del proyecto", () => {
    const resultado = mcpCommand({
      root: lab,
      cliEntry: "/repos/valmen/packages/cli/dist/main.js",
      install: true,
      global: false,
      json: false,
    });

    expect(resultado.stdout).toContain("se creó");
    // Las dos configuraciones de proyecto se escriben juntas: son el mismo paso
    // —dejar el servidor al alcance de los agentes del proyecto— y separarlas
    // obligaría a acordarse de la segunda.
    const escrito = readIfExists(opencodeConfigPath(lab));
    expect(escrito).not.toBeNull();
    expect(readIfExists(claudeConfigPath(lab))).not.toBeNull();
    const mcp = (JSON.parse(escrito as string) as Record<string, unknown>)["mcp"] as Record<
      string,
      unknown
    >;
    expect(mcp[MCP_SERVER_ID]).toBeDefined();
  });

  it("no escribe la configuración global de codex sin `--global`", () => {
    // Es la configuración de usuario de una persona y afecta a todos sus
    // proyectos: tocarla por defecto sería una sorpresa, no una comodidad.
    const antes = readIfExists(codexConfigPath());
    mcpCommand({
      root: lab,
      cliEntry: "/repos/valmen/packages/cli/dist/main.js",
      install: true,
      global: false,
      json: false,
    });
    expect(readIfExists(codexConfigPath())).toBe(antes);
  });

  it("con `--json` devuelve el contenido que escribiría, sin escribir", () => {
    const resultado = mcpCommand({
      root: lab,
      cliEntry: "/repos/valmen/packages/cli/dist/main.js",
      install: false,
      global: false,
      json: true,
    });

    const documento = JSON.parse(resultado.stdout) as Record<string, unknown>;
    expect(documento["executable"]).toBe("/repos/valmen/packages/mcp/dist/main.js");
    expect(String(documento["codex"])).toBeDefined();
    const dsh = documento["dsh"] as Record<string, unknown>;
    expect(String(dsh["snippet"])).toContain("dsh-mcp-client");
    const opencode = documento["opencode"] as Record<string, unknown>;
    expect(String(opencode["content"])).toContain(MCP_SERVER_ID);
    const claude = documento["claude"] as Record<string, unknown>;
    expect(String(claude["content"])).toContain(MCP_SERVER_ID);
    expect(readIfExists(opencodeConfigPath(lab))).toBeNull();
    expect(readIfExists(claudeConfigPath(lab))).toBeNull();
  });

  it("declara el directorio de trabajo relativo, para que el archivo sirva en otra máquina", () => {
    const resultado = mcpCommand({
      root: lab,
      cliEntry: "/repos/valmen/packages/cli/dist/main.js",
      install: true,
      global: false,
      json: false,
    });

    // Sin argumentos que puedan apuntar a otro sitio, la raíz sale del
    // directorio de trabajo: por eso es lo que hay que dejar bien puesto, y por
    // eso `"."` —el directorio del propio archivo— es suficiente y portable.
    expect(resultado.stdout).not.toContain("--root ");
    const escrito = readIfExists(opencodeConfigPath(lab)) as string;
    expect(escrito).not.toContain(lab);
    const mcp = (JSON.parse(escrito) as Record<string, unknown>)["mcp"] as Record<
      string,
      unknown
    >;
    expect((mcp[MCP_SERVER_ID] as Record<string, unknown>)["cwd"]).toBe(RELATIVE_CWD);
  });
});
