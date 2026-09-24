/**
 * El comando `valmen hermes`: conectar y diagnosticar.
 *
 * Dos cosas se prueban acá, y la segunda importa más de lo que parece.
 *
 * 1. **Que conecte bien**, sobre todo cuando son dos proyectos. Hermes tiene una
 *    sola configuración para toda la máquina, así que «conectar un segundo
 *    proyecto» no es volver a correr lo mismo: es declarar una segunda entrada, y
 *    si eso se hace mal el segundo proyecto pisa al primero sin decir nada.
 * 2. **Que se niegue cuando corresponde.** Escribir la configuración de un
 *    programa que no está deja un archivo que nadie lee y un diagnóstico que dice
 *    que todo está bien —el peor de los dos mundos, porque el que lo mira no
 *    puede desconfiar de lo que ve—. Una negativa con motivo es una respuesta.
 *
 * La comprobación de «¿está Hermes?» se inyecta y no se hereda del entorno: si
 * dependiera de la máquina, el mismo test daría resultados distintos según quién
 * lo corra, y la mitad del comando quedaría sin cubrir en cada caso.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseYamlSubset, type YamlMap } from "../packages/core/src/index.js";
import type { CommandRunner } from "../packages/engine/src/index.js";
import {
  declaredRoot,
  hermesConnect,
  hermesStatus,
  hermesTest,
  type HermesRequest,
} from "../packages/cli/src/hermes.js";

/** Un runner que anota lo que se le pidió y contesta que salió bien. */
function runnerFalso(
  respuesta: {
    status: number | null;
    stdout?: string;
    stderr?: string;
    failed?: boolean;
  } = { status: 0 },
): {
  runner: CommandRunner;
  llamadas: { command: string; args: readonly string[]; input: string }[];
} {
  const llamadas: { command: string; args: readonly string[]; input: string }[] = [];
  const runner: CommandRunner = (command, args, input) => {
    llamadas.push({ command, args, input });
    return {
      status: respuesta.status,
      stdout: respuesta.stdout ?? "",
      stderr: respuesta.stderr ?? "",
      failed: respuesta.failed ?? false,
    };
  };
  return { runner, llamadas };
}

let casa: string;
let proyecto: string;
let anterior: string | undefined;

beforeEach(() => {
  casa = mkdtempSync(join(tmpdir(), "hermes-home-"));
  proyecto = mkdtempSync(join(tmpdir(), "proyecto-"));
  anterior = process.env["HERMES_HOME"];
  process.env["HERMES_HOME"] = casa;
});

afterEach(() => {
  if (anterior === undefined) delete process.env["HERMES_HOME"];
  else process.env["HERMES_HOME"] = anterior;
  rmSync(casa, { recursive: true, force: true });
  rmSync(proyecto, { recursive: true, force: true });
});

function pedido(extra: Partial<HermesRequest> = {}): HermesRequest {
  return {
    root: proyecto,
    cliEntry: "/usr/local/bin/valmen",
    action: "status",
    name: "valmen",
    dryRun: false,
    untrusted: false,
    json: false,
    force: false,
    instalado: () => true,
    ...extra,
  };
}

/** El archivo de configuración que este comando escribe. */
function configPath(): string {
  return join(casa, "config.yaml");
}

function leerConfig(): YamlMap {
  return parseYamlSubset(readFileSync(configPath(), "utf8"), {
    fileName: "config.yaml",
  }) as YamlMap;
}

describe("leer la raíz que declara una entrada", () => {
  it("la encuentra en el `cwd` de la entrada", () => {
    const texto = [
      "mcp_servers:",
      "  valmen:",
      '    command: "valmen-mcp"',
      '    cwd: "/tmp/x"',
      "",
    ].join("\n");
    expect(declaredRoot(texto, "valmen")).toBe("/tmp/x");
  });

  it("devuelve `null` cuando la entrada no está, en vez de inventarla", () => {
    // Un diagnóstico que adivina es peor que uno que dice «no lo sé»: el primero
    // manda a arreglar algo que no está roto.
    const texto = 'mcp_servers:\n  otro:\n    command: "x"\n';
    expect(declaredRoot(texto, "valmen")).toBeNull();
  });

  it("no confunde una entrada con otra que empieza igual", () => {
    const texto = [
      "mcp_servers:",
      "  valmen-saicloud:",
      '    cwd: "/tmp/saicloud"',
      "  valmen:",
      '    cwd: "/tmp/valmen"',
      "",
    ].join("\n");
    expect(declaredRoot(texto, "valmen")).toBe("/tmp/valmen");
    expect(declaredRoot(texto, "valmen-saicloud")).toBe("/tmp/saicloud");
  });

  it("dice que no hay raíz cuando la entrada existe sin `cwd`", () => {
    const texto = 'mcp_servers:\n  valmen:\n    command: "valmen-mcp"\n';
    expect(declaredRoot(texto, "valmen")).toBeNull();
  });
});

describe("el diagnóstico", () => {
  it("dice qué falta cuando no hay nada", () => {
    const r = hermesStatus(pedido({ instalado: () => false }));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Hermes instalado");
    expect(r.stdout).toContain("no");
    expect(r.stdout).toContain("valmen hermes connect");
  });

  it("sugiere el nombre cuando la entrada que falta no es la de por defecto", () => {
    // Sin el nombre, alguien con dos proyectos copiaría el consejo, escribiría la
    // entrada `valmen` y volvería al mismo diagnóstico sin entender por qué.
    const r = hermesStatus(pedido({ name: "valmen-saicloud", instalado: () => false }));
    expect(r.stdout).toContain("valmen hermes connect --name valmen-saicloud");
  });

  it("avisa cuando la entrada apunta a otro proyecto", () => {
    // La entrada se llama `valmen` —la de por defecto— pero declara otra raíz.
    // Es el caso real de tener dos proyectos y conectar el segundo sin cambiarle
    // el nombre: el primero deja de estar declarado y hay que decirlo.
    hermesConnect(pedido({ root: "/tmp/otro-proyecto" }));
    const r = hermesStatus(pedido());
    expect(r.stdout).toContain("apunta a otro proyecto");
    expect(r.stdout).toContain("--name valmen-");
  });

  it("con la entrada puesta y Hermes instalado, manda a recargar", () => {
    hermesConnect(pedido());
    const r = hermesStatus(pedido());
    expect(r.stdout).toContain("apunta a este proyecto");
    expect(r.stdout).toContain("sí");
    expect(r.stdout).toContain("/reload-mcp");
  });

  it("con la entrada puesta pero sin Hermes, dice que la entrada no la lee nadie", () => {
    hermesConnect(pedido());
    const r = hermesStatus(pedido({ instalado: () => false }));
    expect(r.stdout).toContain("no responde");
    expect(r.stdout).not.toContain("/reload-mcp");
  });

  it("en `--json` devuelve el estado como dato", () => {
    hermesConnect(pedido());
    const r = hermesStatus(pedido({ json: true }));
    const estado = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(estado["configExists"]).toBe(true);
    expect(estado["declared"]).toBe(true);
    expect(estado["declaredRoot"]).toBe(proyecto);
    expect(estado["pointsHere"]).toBe(true);
  });
});

describe("conectar", () => {
  it("se niega a escribir si Hermes no está, y dice cómo seguir", () => {
    const r = hermesConnect(pedido({ instalado: () => false }));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("hermes mcp add");
    expect(existsSync(configPath())).toBe(false);
  });

  it("escribe con `--force` aunque no esté", () => {
    const r = hermesConnect(pedido({ instalado: () => false, force: true }));
    expect(r.exitCode).toBe(0);
    expect(existsSync(configPath())).toBe(true);
    const valor = leerConfig();
    const valmen = (valor["mcp_servers"] as YamlMap)["valmen"] as YamlMap;
    expect(valmen["cwd"]).toBe(proyecto);
  });

  it("`--dry-run` muestra el bloque y no toca el archivo", () => {
    const r = hermesConnect(pedido({ dryRun: true }));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Escribiría en");
    expect(r.stdout).toContain("cwd:");
    expect(existsSync(configPath())).toBe(false);
  });

  it("es idempotente: la segunda vez no cambia nada", () => {
    hermesConnect(pedido());
    const antes = readFileSync(configPath(), "utf8");
    const r = hermesConnect(pedido());
    expect(r.stdout).toContain("Sin cambios");
    expect(readFileSync(configPath(), "utf8")).toBe(antes);
  });

  it("declara dos proyectos como dos entradas, sin pisarse", () => {
    // Es el caso que hace distinto a Hermes de todos los demás destinos: una sola
    // configuración para toda la máquina. Si la segunda conexión reescribiera la
    // entrada de la primera, el primer proyecto dejaría de funcionar en silencio.
    const otro = mkdtempSync(join(tmpdir(), "proyecto-"));
    try {
      hermesConnect(pedido());
      hermesConnect(pedido({ name: "valmen-otro", root: otro }));

      const servidores = leerConfig()["mcp_servers"] as YamlMap;
      expect(Object.keys(servidores).sort()).toEqual(["valmen", "valmen-otro"]);
      expect((servidores["valmen"] as YamlMap)["cwd"]).toBe(proyecto);
      expect((servidores["valmen-otro"] as YamlMap)["cwd"]).toBe(otro);
    } finally {
      rmSync(otro, { recursive: true, force: true });
    }
  });

  it("conserva lo que ya había en la configuración de Hermes", () => {
    // Este archivo no es nuestro: lo escribe una persona, con sus plataformas y
    // sus comentarios. Perderlos sería el daño más caro que puede hacer este
    // comando, y no se vería en ningún test que solo mirara la entrada nueva.
    const previo = [
      "# mi configuración",
      "model: anthropic/claude-sonnet-4.6",
      "platforms:",
      "  telegram:",
      "    enabled: true   # el celular",
      "",
      "mcp_servers:",
      "  filesystem:",
      '    command: "npx"',
      "",
    ].join("\n");
    mkdirSync(casa, { recursive: true });
    writeFileSync(configPath(), previo, "utf8");

    hermesConnect(pedido());

    const despues = readFileSync(configPath(), "utf8");
    expect(despues).toContain("# mi configuración");
    expect(despues).toContain("# el celular");
    const valor = leerConfig();
    expect(valor["model"]).toBe("anthropic/claude-sonnet-4.6");
    expect((valor["mcp_servers"] as YamlMap)["filesystem"]).toBeDefined();
    expect((valor["mcp_servers"] as YamlMap)["valmen"]).toBeDefined();
  });

  it("declara `trust: untrusted` cuando se pide", () => {
    hermesConnect(pedido({ untrusted: true }));
    const servidores = leerConfig()["mcp_servers"] as YamlMap;
    expect((servidores["valmen"] as YamlMap)["trust"]).toBe("untrusted");
  });
});

describe("la prueba de punta a punta", () => {
  it("exige el destino en vez de adivinarlo", () => {
    // Adivinarlo haría que la prueba pasara sin probar el destino que el proyecto
    // usa de verdad, que es lo único que la prueba tiene que contestar.
    const r = hermesTest(pedido({ action: "test" }));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("hermes send --list");
  });

  it("dice que salió, y con qué destino", () => {
    const { runner, llamadas } = runnerFalso();
    const r = hermesTest(pedido({ action: "test", to: "telegram:-100", runner }));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("telegram:-100");
    expect(llamadas[0]!.args).toContain("telegram:-100");
  });

  it("cuando no llega, manda a mirar Hermes y no el harness", () => {
    // Es la distinción que hace útil el comando: «no llegó» desde adentro de un
    // gate no se distingue de «no había nada que notificar», y el primer reflejo
    // es culpar al harness.
    const { runner } = runnerFalso({ status: null, failed: true });
    const r = hermesTest(pedido({ action: "test", to: "telegram", runner }));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Hermes");

    const rechazo = runnerFalso({ status: 1, stderr: "chat not found" });
    const r2 = hermesTest(
      pedido({ action: "test", to: "telegram", runner: rechazo.runner }),
    );
    expect(r2.exitCode).not.toBe(0);
    expect(r2.stderr).toContain("chat not found");
  });
});

describe("el paso de confianza de las skills", () => {
  /** Escribe una skill en el proyecto, como la escribiría una persona. */
  function conSkill(): void {
    const directorio = join(proyecto, ".valmen", "skills", "planificacion");
    mkdirSync(directorio, { recursive: true });
    writeFileSync(
      join(directorio, "SKILL.md"),
      "---\nname: planificacion\ndescription: Planifica.\n---\n\nPasos.\n",
      "utf8",
    );
  }

  it("con skills, dice el comando de confianza y no lo ejecuta", () => {
    // Hermes no carga skills de un repositorio clonado sin permiso, y hace bien:
    // una skill es un procedimiento que el agente sigue. Encadenar «escribí en tu
    // proyecto» con «y ahora confiá en las instrucciones de adentro» es la forma
    // de que un `git clone` se convierta en ejecución de código ajeno.
    conSkill();
    mkdirSync(join(proyecto, ".agents", "skills"), { recursive: true });
    const r = hermesConnect(pedido());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hermes skills trust");
    expect(r.stdout).toContain(proyecto);
    expect(r.stdout).toContain("No lo hace este comando a propósito");
  });

  it("sin skills, no menciona nada: sería un paso que no hace falta", () => {
    const r = hermesConnect(pedido());
    expect(r.stdout).not.toContain("hermes skills trust");
  });

  it("con skills sin proyectar, manda a `valmen sync` en vez de a confiar", () => {
    // Hermes lee la **proyección**, que es un artefacto generado y no está en un
    // clon recién bajado. Mandar a `hermes skills trust` sin comprobarlo lleva a
    // un comando que contesta «no hay ninguna skill de proyecto», y su aviso
    // nombra `.hermes/` y `.agents/` en vez de la fuente. Pasó de verdad la
    // primera vez que se conectó un proyecto.
    conSkill();
    const r = hermesConnect(pedido());
    expect(r.stdout).toContain("Corré primero:");
    expect(r.stdout).toContain("valmen sync");
    // El comando de confianza **con su ruta** no está: se lo nombra solo para
    // explicar por qué no sirve todavía, que es distinto de mandarlo a correrlo.
    expect(r.stdout).not.toContain(`hermes skills trust ${proyecto}`);
  });

  it("con las skills proyectadas, sí manda a confiar", () => {
    conSkill();
    mkdirSync(join(proyecto, ".agents", "skills"), { recursive: true });
    const r = hermesConnect(pedido());
    expect(r.stdout).toContain("hermes skills trust");
  });

  it("y lo dice también cuando la entrada MCP ya estaba", () => {
    // El paso vivía solo en el camino que escribía la configuración, así que una
    // segunda conexión no avisaba de nada.
    conSkill();
    mkdirSync(join(casa, "..", "x"), { recursive: true });
    writeFileSync(configPath(), 'mcp_servers:\n  valmen:\n    command: "x"\n', "utf8");
    const r = hermesConnect(pedido());
    expect(r.stdout).toContain("Sin cambios");
    expect(r.stdout).toContain("valmen sync");
  });
});

describe("la instalación de la skill", () => {
  function rutaSkill(): string {
    return join(casa, "skills", "valmen", "SKILL.md");
  }

  it("la escribe al conectar", () => {
    hermesConnect(pedido());
    expect(existsSync(rutaSkill())).toBe(true);
    expect(readFileSync(rutaSkill(), "utf8")).toContain("name: valmen");
  });

  it("la escribe aunque la entrada MCP ya estuviera", () => {
    // La entrada y la skill son dos cosas distintas: si la segunda dependiera de
    // que la primera fuera nueva, un proyecto ya declarado nunca recibiría la
    // skill, ni siquiera después de una versión que la agregue.
    mkdirSync(casa, { recursive: true });
    writeFileSync(configPath(), 'mcp_servers:\n  valmen:\n    command: "x"\n', "utf8");
    hermesConnect(pedido());
    expect(existsSync(rutaSkill())).toBe(true);
  });

  it("no pisa una que la persona editó, y dice cómo reemplazarla", () => {
    mkdirSync(join(casa, "skills", "valmen"), { recursive: true });
    writeFileSync(rutaSkill(), "la mía\n", "utf8");

    const r = hermesConnect(pedido());
    expect(readFileSync(rutaSkill(), "utf8")).toBe("la mía\n");
    expect(r.stdout).toContain("ya existía y es distinta");
    expect(r.stdout).toContain("--force");
  });

  it("con `--force` sí la reemplaza", () => {
    mkdirSync(join(casa, "skills", "valmen"), { recursive: true });
    writeFileSync(rutaSkill(), "la mía\n", "utf8");
    hermesConnect(pedido({ force: true }));
    expect(readFileSync(rutaSkill(), "utf8")).toContain("name: valmen");
  });

  it("una segunda conexión no la reescribe y lo dice", () => {
    hermesConnect(pedido());
    const r = hermesConnect(pedido());
    expect(r.stdout).toContain("ya estaba al día");
  });
});
