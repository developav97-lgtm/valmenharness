/**
 * La conexión con Hermes: el bloque que se declara y la fusión que lo inserta.
 *
 * Lo que se prueba acá no es una funcionalidad del harness, es una **cirugía
 * sobre el archivo de otro programa**. `~/.hermes/config.yaml` lo escribe una
 * persona a mano —plataformas, modelos, rutas de proveedor— y tiene comentarios
 * que explican por qué cada cosa está como está. Un error acá no se ve en un
 * test: se ve cuando esa persona abre su configuración y descubre que perdió lo
 * que había escrito.
 *
 * Por eso la verificación es estructural y no de texto: el archivo fusionado se
 * vuelve a leer con `parseYamlSubset`, el mismo parser que el harness usa para
 * sus propios documentos, y se comprueba la estructura resultante. Que un archivo
 * «se vea bien» no es evidencia de que sea válido.
 */
import { spawnSync } from "node:child_process";

import { describe, expect, it, afterEach } from "vitest";

import { parseYamlSubset, type YamlMap } from "../packages/core/src/index.js";
import {
  HERMES_SERVER_ID,
  parseConfig,
  readHermesConfig,
  hermesAddCommand,
  hermesBlock,
  hermesConfigPath,
  hermesDeepLink,
  hermesRelayHookBlock,
  hermesRelayScript,
  hermesSkill,
  hermesSkillPath,
  mergeHermesConfig,
  type HermesEntry,
} from "../packages/adapter/src/index.js";

const RAIZ = "/tmp/proyecto de prueba/ValmenHarness";

function entrada(extra: Partial<HermesEntry> = {}): HermesEntry {
  return {
    name: HERMES_SERVER_ID,
    root: RAIZ,
    command: "valmen-mcp",
    untrusted: false,
    idleTimeoutSeconds: 900,
    ...extra,
  };
}

/** Un `config.yaml` de Hermes con lo que de verdad tiene: otras cosas y comentarios. */
const CONFIG_AJENA = `# Configuración de Hermes.
model: anthropic/claude-sonnet-4.6

# Proveedores: el orden importa, el primero que responde gana.
fallback_providers:
  - openrouter
  - nous

platforms:
  telegram:
    enabled: true   # el celular

mcp_servers:
  # Contexto del repositorio, lo puse yo a mano.
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
`;

/** Lee un valor anidado del mapa, fallando con un mensaje útil si no está. */
function anidado(raiz: YamlMap, ...claves: string[]): YamlMap {
  let actual: unknown = raiz;
  for (const clave of claves) {
    actual = (actual as YamlMap)[clave];
    if (actual === undefined) throw new Error(`falta ${claves.join(".")}`);
  }
  return actual as YamlMap;
}

afterEach(() => {
  delete process.env["HERMES_HOME"];
});

describe("la ubicación del archivo de Hermes", () => {
  it("vive en el home del usuario", () => {
    expect(hermesConfigPath("/Users/alguien")).toBe("/Users/alguien/.hermes/config.yaml");
  });

  it("respeta HERMES_HOME, que es lo que mueve una instalación", () => {
    // Hay instalaciones con el home en otro sitio. Escribir en `~/.hermes`
    // cuando la instalación vive en otro lado deja una entrada que nadie lee y
    // un diagnóstico que dice que todo está bien, que es el peor de los dos.
    process.env["HERMES_HOME"] = "/opt/hermes";
    expect(hermesConfigPath("/Users/alguien")).toBe("/opt/hermes/config.yaml");
  });
});

describe("el bloque que se declara", () => {
  it("arranca el servidor del harness apuntando al proyecto", () => {
    const valor = parseYamlSubset(`mcp_servers:\n${hermesBlock(entrada())}`, {
      fileName: "config.yaml",
    }) as YamlMap;

    const valmen = anidado(valor, "mcp_servers", "valmen");
    expect(valmen["command"]).toBe("valmen-mcp");
    expect(valmen["cwd"]).toBe(RAIZ);
    expect(valmen["enabled"]).toBe("true");
    expect(valmen["idle_timeout_seconds"]).toBe("900");
  });

  it("cita siempre los escalares, incluida una ruta con espacios", () => {
    // Decidir cuándo un valor necesita comillas es la regla que se implementa mal
    // para el caso raro —una ruta con espacios, un `#`, un dos puntos— y el
    // síntoma es un archivo que el otro programa rechaza al arrancar.
    const valor = parseYamlSubset(`mcp_servers:\n${hermesBlock(entrada())}`, {
      fileName: "config.yaml",
    }) as YamlMap;
    expect(anidado(valor, "mcp_servers", "valmen")["cwd"]).toBe(RAIZ);
  });

  it("declara `trust: untrusted` solo cuando se pide", () => {
    const normal = parseYamlSubset(`mcp_servers:\n${hermesBlock(entrada())}`, {
      fileName: "config.yaml",
    }) as YamlMap;
    expect(anidado(normal, "mcp_servers", "valmen")["trust"]).toBeUndefined();

    const desconfiado = parseYamlSubset(
      `mcp_servers:\n${hermesBlock(entrada({ untrusted: true }))}`,
      { fileName: "config.yaml" },
    ) as YamlMap;
    expect(anidado(desconfiado, "mcp_servers", "valmen")["trust"]).toBe("untrusted");
  });

  it("pasa el archivo de credenciales como argumento cuando se declara", () => {
    const bloque = hermesBlock(entrada({ credentialsFile: "/tmp/cred.yaml" }));
    const valor = parseYamlSubset(`mcp_servers:\n${bloque}`, {
      fileName: "config.yaml",
    }) as YamlMap;
    expect(anidado(valor, "mcp_servers", "valmen")["args"]).toEqual([
      "--credentials",
      "/tmp/cred.yaml",
    ]);
  });
});

describe("la fusión con una configuración que no es nuestra", () => {
  it("crea el archivo cuando no existe", () => {
    const r = mergeHermesConfig(null, hermesBlock(entrada()));
    expect(r.changed).toBe(true);
    const valor = parseYamlSubset(r.content, { fileName: "config.yaml" }) as YamlMap;
    expect(anidado(valor, "mcp_servers", "valmen")["command"]).toBe("valmen-mcp");
  });

  it("inserta bajo la cabecera que ya existe, sin tocar lo demás", () => {
    const r = mergeHermesConfig(CONFIG_AJENA, hermesBlock(entrada()));
    expect(r.changed).toBe(true);

    const valor = parseYamlSubset(r.content, { fileName: "config.yaml" }) as YamlMap;

    // Lo que ya estaba sigue ahí: el otro servidor MCP y todo lo de arriba.
    expect(anidado(valor, "mcp_servers", "filesystem")["command"]).toBe("npx");
    expect(valor["model"]).toBe("anthropic/claude-sonnet-4.6");
    expect(valor["fallback_providers"]).toEqual(["openrouter", "nous"]);
    expect(anidado(valor, "platforms", "telegram")["enabled"]).toBe("true");

    // Y el nuestro entró.
    expect(anidado(valor, "mcp_servers", "valmen")["cwd"]).toBe(RAIZ);
  });

  it("conserva los comentarios, que es la razón de insertar y no reescribir", () => {
    const r = mergeHermesConfig(CONFIG_AJENA, hermesBlock(entrada()));
    expect(r.content).toContain("# Configuración de Hermes.");
    expect(r.content).toContain(
      "# Proveedores: el orden importa, el primero que responde gana.",
    );
    expect(r.content).toContain("# Contexto del repositorio, lo puse yo a mano.");
    expect(r.content).toContain("# el celular");
  });

  it("no toca una línea de lo que ya estaba", () => {
    // Cada línea original tiene que seguir presente y en el mismo orden: la
    // fusión inserta, no reordena ni reformatea.
    const r = mergeHermesConfig(CONFIG_AJENA, hermesBlock(entrada()));
    const originales = CONFIG_AJENA.split("\n").filter((l) => l.trim() !== "");
    const resultado = r.content.split("\n");
    let desde = 0;
    for (const linea of originales) {
      const encontrada = resultado.indexOf(linea, desde);
      expect(encontrada, `se perdió o se movió: ${linea}`).toBeGreaterThanOrEqual(0);
      desde = encontrada;
    }
  });

  it("es idempotente: aplicarla dos veces no duplica la entrada", () => {
    const primera = mergeHermesConfig(CONFIG_AJENA, hermesBlock(entrada()));
    const segunda = mergeHermesConfig(primera.content, hermesBlock(entrada()));
    expect(segunda.changed).toBe(false);
    expect(segunda.content).toBe(primera.content);
    expect(segunda.content.split(/\n {2}valmen:/).length - 1).toBe(1);
  });

  it("añade `mcp_servers` al final cuando el archivo no lo declaraba", () => {
    const sinMcp = "model: gpt-5\nplatforms:\n  telegram:\n    enabled: true\n";
    const r = mergeHermesConfig(sinMcp, hermesBlock(entrada()));
    expect(r.changed).toBe(true);
    const valor = parseYamlSubset(r.content, { fileName: "config.yaml" }) as YamlMap;
    expect(anidado(valor, "mcp_servers", "valmen")["command"]).toBe("valmen-mcp");
    expect(valor["model"]).toBe("gpt-5");
    expect(anidado(valor, "platforms", "telegram")["enabled"]).toBe("true");
  });

  it("se niega en vez de adivinar cuando `mcp_servers` no está vacío en su línea", () => {
    // `mcp_servers: {}` es un mapa en la misma línea. Meter debajo un bloque
    // indentado daría un archivo inválido, y un archivo de configuración roto en
    // el programa de otro es peor que una función que no hizo nada y lo dijo.
    const flujo = "model: gpt-5\nmcp_servers: {}\n";
    const r = mergeHermesConfig(flujo, hermesBlock(entrada()));
    expect(r.changed).toBe(false);
    expect(r.content).toBe(flujo);
    expect(r.note).toContain("mcp_servers");
  });

  it("el motivo dice qué hacer cuando no se pudo", () => {
    const r = mergeHermesConfig("mcp_servers: {}\n", hermesBlock(entrada()));
    expect(r.note.length).toBeGreaterThan(30);
    expect(r.note).toContain("a mano");
  });
});

describe("las otras dos formas de declararlo", () => {
  it("el enlace de un clic lleva el comando y la raíz", () => {
    const enlace = hermesDeepLink(entrada());
    expect(enlace.startsWith("hermes://mcp/install?name=valmen&config=")).toBe(true);

    const base64 = enlace.split("config=")[1] as string;
    const config = JSON.parse(Buffer.from(base64, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(config["command"]).toBe("valmen-mcp");
    expect(config["cwd"]).toBe(RAIZ);
  });

  it("el comando de Hermes deja `--args` al final, que es donde su parser lo acepta", () => {
    // `--args` usa `nargs=REMAINDER` en el parser de Hermes: cualquier opción
    // después se la traga como argumento del servidor. Un `--args` en el medio
    // produce un servidor que arranca con los argumentos equivocados, sin error.
    const cmd = hermesAddCommand(entrada({ credentialsFile: "/tmp/c.yaml" }));
    expect(cmd).toBe(
      "hermes mcp add valmen --command valmen-mcp --args --credentials /tmp/c.yaml",
    );
    expect(cmd.endsWith("--credentials /tmp/c.yaml")).toBe(true);
  });
});

describe("la configuración del puente en config.yaml", () => {
  function leer(yaml: string) {
    return readHermesConfig(parseConfig(yaml));
  }

  it("sin bloque `hermes`, el puente está apagado", () => {
    // El default es el silencio, y no es un detalle: una herramienta que empieza a
    // mandar mensajes al celular de alguien porque actualizó una versión es una
    // herramienta que se desinstala.
    const config = leer("name: Proyecto\ntickets-dir: tickets\n");
    expect(config.enabled).toBe(false);
    expect(config.gateTarget).toBe("");
    expect(config.tokenHours).toBe(24);
    expect(config.allowedRisk).toEqual(["low", "normal"]);
  });

  it("lee lo que se declara", () => {
    const config = leer(
      [
        "hermes:",
        "  enabled: true",
        "  notify:",
        "    gate: discord:#ops",
        "  approval:",
        "    token-hours: 4",
        "    allowed-risk: [low]",
        "",
      ].join("\n"),
    );
    expect(config.enabled).toBe(true);
    expect(config.gateTarget).toBe("discord:#ops");
    expect(config.tokenHours).toBe(4);
    expect(config.allowedRisk).toEqual(["low"]);
  });

  it("solo `true` enciende el puente", () => {
    // El parser devuelve los escalares como texto y el YAML que la gente escribe
    // incluye `yes` y `1`. Tratarlos como verdaderos sería adivinar la intención
    // en la única dirección que manda mensajes sin que nadie lo haya pedido.
    for (const valor of ["yes", "1", "on", "sí", "TRUE"]) {
      expect(leer(`hermes:\n  enabled: ${valor}\n`).enabled, valor).toBe(false);
    }
  });

  it("se niega a aceptar una vida de token que no es un número de horas", () => {
    // Un token de cero horas o de infinitas no es una configuración: es un error
    // de tipeo con el mismo aspecto que un valor legítimo.
    for (const valor of ["0", "-3", "muchas"]) {
      expect(
        () => leer(`hermes:\n  approval:\n    token-hours: ${valor}\n`),
        valor,
      ).toThrow();
    }
  });

  it("una vida vacía usa la de por defecto, como el resto del archivo", () => {
    // `token-hours:` sin valor no es un error de tipeo: es una clave declarada sin
    // llenar, y el resto de `config.yaml` la trata igual —el valor por defecto—.
    // Negarse acá sería el único sitio del archivo que se comporta distinto ante
    // lo mismo.
    expect(leer("hermes:\n  approval:\n    token-hours:\n").tokenHours).toBe(24);
  });

  it("falla si `hermes` no es un mapa", () => {
    expect(() => leer("hermes: telegram\n")).toThrow();
  });
});

describe("la skill que se le instala a Hermes", () => {
  it("vive en el directorio global de skills, no en el del proyecto", () => {
    // Describe cómo se usa **el harness**, que es el mismo en todos los
    // proyectos. Ponerla por proyecto la duplicaría en cada uno y las copias se
    // desincronizarían.
    expect(hermesSkillPath("/Users/alguien")).toBe(
      "/Users/alguien/.hermes/skills/valmen/SKILL.md",
    );
  });

  it("respeta HERMES_HOME, como el resto del puente", () => {
    process.env["HERMES_HOME"] = "/opt/hermes";
    expect(hermesSkillPath("/Users/alguien")).toBe("/opt/hermes/skills/valmen/SKILL.md");
  });

  it("tiene el frontmatter que Hermes exige, con un nombre y una descripción", () => {
    const skill = hermesSkill();
    expect(skill.startsWith("---\n")).toBe(true);
    expect(skill).toContain("\nname: valmen\n");
    expect(skill).toMatch(/\ndescription: .{20,}/);
    // El nombre del frontmatter y el de la carpeta tienen que coincidir: Hermes
    // resuelve la skill por el directorio y la muestra por el frontmatter, y si
    // difieren el `/comando` que anuncia no es el que existe.
    expect(hermesSkillPath()).toContain("/valmen/SKILL.md");
  });

  it("enseña el orden de trabajo, no un catálogo de herramientas", () => {
    // Un agente con el MCP conectado ve treinta y cinco herramientas y no sabe
    // cuál usar primero. Lo que esta skill agrega son los criterios.
    const skill = hermesSkill();
    expect(skill).toContain("reglas-del-proyecto");
    expect(skill).toContain("buscar_memoria");
    expect(skill).toContain("crear_ticket");
    expect(skill).toContain("reanudar_ticket");
    expect(skill).toContain("guardar_aprendizaje");
  });

  it("prohíbe explícitamente lo que un agente no puede hacer", () => {
    // Es la mitad del valor: las herramientas ya no dejan aprobar, pero un
    // agente que no lo sabe pierde turnos intentándolo, o peor, escribe la
    // confirmación de una persona.
    const skill = hermesSkill();
    expect(skill).toContain("No apruebes ni rechaces una compuerta");
    expect(skill).toContain("No escribas la confirmación de nadie");
  });

  it("pide una sesión por ticket y el consumo al cerrar", () => {
    // Sin esto, una conversación que atendió cinco tickets deja un solo costo y
    // el registro no tiene de dónde repartirlo: el consumo por ticket se vuelve
    // una estimación, que es exactamente lo que el registro no admite.
    const skill = hermesSkill();
    expect(skill).toContain("Un ticket, una sesión");
    expect(skill).toContain("/new <ID-DEL-TICKET>");
    expect(skill).toContain("el cierre se rechaza sin consumo");
    // Y la salida honesta cuando la sesión ya es compartida: declararlo, no
    // inventar un reparto.
    expect(skill).toContain("sin\nnúmeros");
  });

  it("manda escribir el plan en el ticket cuando lo implementa otro", () => {
    // El traspaso entre agentes se rompe en silencio: el que implementa lee el
    // ticket, no la conversación donde se planeó.
    expect(hermesSkill()).toContain("El plan va en el ticket, no en el chat");
  });

  it("obliga a nombrar lo que escribió el verificador", () => {
    // En un flujo de dos agentes —uno implementa, otro verifica— el commit
    // atribuye al ejecutor lo que escribió el verificador salvo que alguien lo
    // diga.
    const skill = hermesSkill();
    expect(skill).toContain("Lo que escribas vos, nombralo");
  });

  it("no nombra identificadores prefixados de herramientas", () => {
    // Las dos páginas de Hermes escriben el prefijo distinto —`mcp_` contra
    // `mcp__`— y una instrucción con el nombre equivocado es una instrucción que
    // el agente no puede seguir, que falla en silencio.
    expect(hermesSkill()).not.toMatch(/mcp_{1,2}valmen_{1,2}/);
  });
});

describe("el relé", () => {
  const RUTAS = { valmen: "/opt/valmen", root: "/tmp/proyecto con espacios" };

  it("el script graba las rutas absolutas, no las busca en el PATH", () => {
    // El servicio de Hermes arranca con `/usr/bin:/bin:/usr/sbin:/sbin`, así que un
    // `valmen` a secas no se encuentra y el relé fallaría en silencio.
    const script = hermesRelayScript(RUTAS);
    expect(script).toContain('VALMEN = "/opt/valmen"');
    expect(script).toContain('ROOT = "/tmp/proyecto con espacios"');
  });

  it("no se mete cuando el mensaje no es una decisión", () => {
    // Es la mitad del contrato: el gancho corre con **cada** mensaje, y devolver
    // algo distinto de la nada cambiaría la conversación en las que no son para él.
    const script = hermesRelayScript(RUTAS);
    expect(script).toContain("if coincidencia is None:");
    expect(script).toContain("return 0");
  });

  it("reconoce el código con las dos decisiones", () => {
    const script = hermesRelayScript(RUTAS);
    expect(script).toContain("(aprobar|rechazar)");
    expect(script).toContain('"aprobar": "approve"');
    expect(script).toContain('"rechazar": "reject"');
  });

  it("explica por qué es un gancho y no una herramienta", () => {
    // La decisión de seguridad de todo el puente: si la aprobación fuera una
    // herramienta MCP, el harness no podría distinguir una persona de una
    // aserción del agente, y una inyección de prompt bastaría para aprobar.
    const script = hermesRelayScript(RUTAS);
    expect(script).toContain("antes de que el\nmodelo lo vea");
  });

  it("le dice al agente qué pasó, para que su respuesta sea coherente", () => {
    // `pre_llm_call` no puede bloquear el turno: sin esto el agente contestaría
    // «no puedo aprobar compuertas» sobre una decisión ya registrada.
    const script = hermesRelayScript(RUTAS);
    expect(script).toContain("CONTEXTO_OK");
    expect(script).toContain("CONTEXTO_FALLO");
  });

  it("el script es Python válido", () => {
    // Se comprueba de verdad y no por el texto: la primera versión tenía un `}`
    // donde iba un `)` y solo se vio al ejecutarlo.
    const script = hermesRelayScript(RUTAS);
    const r = spawnSync(
      "/usr/bin/python3",
      ["-c", "import ast,sys; ast.parse(sys.stdin.read())"],
      {
        input: script,
        encoding: "utf8",
      },
    );
    expect(r.stderr ?? "").toBe("");
    expect(r.status).toBe(0);
  });

  it("el bloque del gancho no repite la cabecera", () => {
    // La cabecera `hooks:` la pone la fusión, igual que con `mcp_servers`. Repetirla
    // duplicó la clave en la configuración del primer proyecto donde se instaló.
    const bloque = hermesRelayHookBlock("/ruta/script.py", "/usr/bin/python3");
    expect(bloque).not.toMatch(/^hooks:/m);
    expect(bloque).toContain("pre_llm_call:");
    expect(bloque).toContain("timeout: 60");
  });

  it("cita la ruta del script, que puede tener espacios", () => {
    const bloque = hermesRelayHookBlock(
      "/tmp/10-Proyectos/mi script.py",
      "/usr/bin/python3",
    );
    expect(bloque).toContain("'/tmp/10-Proyectos/mi script.py'");
  });
});
