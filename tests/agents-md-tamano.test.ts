/**
 * El tamaño del `AGENTS.md` proyectado (R-RESP-005).
 *
 * `AGENTS.md` se carga entero en cada sesión. En SaiOpenCloud pesaba 54 KB, y casi
 * todo ese peso es evidencia («Por qué») y reglas que solo aplican a un tipo de
 * trabajo. Tres mecanismos lo acotan, y estas pruebas fijan lo que cada uno promete y
 * lo que **no** debe hacer: ninguna regla vigente se pierde, `.valmen/rules/` no se
 * reescribe y lo que no se encamina se proyecta como siempre.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ADAPTER_VERSION,
  AGENTS_MD_BUDGET_MIN,
  POR_QUE_MAX,
  agentsMdWarning,
  compactPorQue,
  describeAgentsMdSize,
  loadProjectModel,
  measureAgentsMd,
  parseConfig,
  projectAgentsMd,
  projectFiles,
  readAgentsMdBudget,
  readSkills,
  renderSkill,
  routedRules,
  skillText,
  withRoutedRules,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";
import { getPromptFor } from "../packages/mcp/src/prompts.js";

let lab: string;

function escribir(ruta: string, contenido: string): void {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, contenido, "utf8");
}

function scaffold(rules: Record<string, string>, config = "name: Demo\n"): void {
  escribir(join(lab, ".valmen", "config.yaml"), config);
  for (const [name, content] of Object.entries(rules)) {
    escribir(join(lab, ".valmen", "rules", name), content);
  }
}

function skill(id: string, instructions = `# ${id}\n\nPasos de ${id}.`): void {
  escribir(
    join(lab, ".valmen", "skills", id, "SKILL.md"),
    `---\nname: ${id}\ndescription: Skill de ${id}\n---\n\n${instructions}\n`,
  );
}

function huella(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

function fallo(accion: () => unknown): string {
  try {
    accion();
  } catch (caught) {
    return (caught as { message?: string }).message ?? String(caught);
  }
  return "";
}

const POR_QUE_LARGO =
  "El PO devolvió la pantalla porque los montos salían alineados a la izquierda y no a la derecha. " +
  "La causa fue que la columna heredaba text-left desde el contenedor (src/app/montos/montos.component.html:12) " +
  "y la pantalla vecina ya lo resolvía con una clase propia (src/app/saldos/saldos.component.html:30), " +
  "pero esa solución no estaba escrita en ninguna regla y cada pantalla volvió a decidir la suya.";

const PRESENTACION = [
  "# Estándares de presentación",
  "",
  "Reglas de pantalla del proyecto.",
  "",
  "## Alineación en tablas",
  "",
  "- Los números van a la derecha.",
  "",
  `**Por qué:** ${POR_QUE_LARGO}`,
  "**Visto en:** TICKET-1 (2026-10-01)",
  "",
  "## Montos",
  "",
  "- Usan el separador del regional del proyecto.",
  "",
  `**Por qué:** ${POR_QUE_LARGO}`,
  "",
].join("\n");

const BACKEND = [
  "# Estándares de backend",
  "",
  "## La lógica va en services",
  "",
  "- Las views no calculan.",
  "",
  `**Por qué:** ${POR_QUE_LARGO}`,
  "",
].join("\n");

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-tamano-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el «Por qué» de un estándar en una línea", () => {
  it("deja la primera oración completa cuando cabe, sin «…»", () => {
    const { text, shortened } = compactPorQue(`# T\n\n**Por qué:** ${POR_QUE_LARGO}\n`);
    const linea = text.split("\n").find((l) => l.startsWith("**Por qué:**")) as string;

    expect(shortened).toBe(1);
    expect(linea).toBe(
      "**Por qué:** El PO devolvió la pantalla porque los montos salían alineados a la izquierda y no a la derecha.",
    );
  });

  it("corta una oración larga en una palabra entera y lo marca con «…»", () => {
    const larga = POR_QUE_LARGO.replace(/\. /g, ", y ");
    const { text, shortened } = compactPorQue(`# T\n\n**Por qué:** ${larga}\n`);
    const linea = text.split("\n").find((l) => l.startsWith("**Por qué:**")) as string;

    expect(shortened).toBe(1);
    expect(linea.length).toBeLessThanOrEqual("**Por qué:** ".length + POR_QUE_MAX + 1);
    expect(linea.endsWith("…")).toBe(true);
    // No parte una palabra: lo que queda antes de «…» es un prefijo del original que
    // termina donde acaba una palabra o una cláusula.
    const cuerpo = linea.slice("**Por qué:** ".length, -1);
    expect(larga.startsWith(cuerpo)).toBe(true);
    expect([" ", ",", ";", ":"]).toContain(larga[cuerpo.length]);
  });

  it("prefiere cortar donde termina una cláusula a cortar en una palabra cualquiera", () => {
    const original =
      "La cascada gasta tres llamadas donde el evaluador de siempre gasta una —produce el modelo barato, " +
      "verifica cada proposición y solo lo que el verificador no respalda vuelve al modelo superior—, " +
      "así que se paga cuando el veredicto importa.";
    const { text } = compactPorQue(`**Por qué:** ${original}\n`);

    expect(text).toBe(
      "**Por qué:** La cascada gasta tres llamadas donde el evaluador de siempre gasta una —produce el modelo barato…\n",
    );
  });

  it("junta un párrafo de varias líneas y no toca la etiqueta que le sigue", () => {
    const { text } = compactPorQue(
      "**Por qué:** Primero ocurrió esto en la pantalla de facturas\ny luego se repitió en la de devoluciones, con el mismo síntoma. Más detalle que sobra.\n**Visto en:** T-1 (2026-10-01)\n",
    );

    expect(text).toBe(
      "**Por qué:** Primero ocurrió esto en la pantalla de facturas y luego se repitió en la de devoluciones, con el mismo síntoma.\n**Visto en:** T-1 (2026-10-01)\n",
    );
  });

  it("suma oraciones cuando la primera es demasiado corta para decir algo", () => {
    const { text } = compactPorQue(
      "**Por qué:** Ver AP-004. El evaluador bloqueó cuatro veces la misma proposición con el resto del recibo aprobado. Tercera oración que sobra.\n",
    );

    expect(text).toContain(
      "Ver AP-004. El evaluador bloqueó cuatro veces la misma proposición",
    );
    expect(text).not.toContain("Tercera oración");
  });

  it("no deja un fragmento de código abierto al cortar", () => {
    const largo = `${"palabra ".repeat(19)}\`src/app/muy/largo/componente.component.html:12-40\` y más texto después de eso`;
    const { text } = compactPorQue(`**Por qué:** ${largo}\n`);

    expect((text.match(/`/g) ?? []).length % 2).toBe(0);
  });

  it("deja igual un «Por qué» que ya cabe en una línea, y no lo cuenta como acortado", () => {
    const original =
      "**Por qué:** Una razón corta que ya cabe en una línea y no necesita resumirse.\n";
    const { text, shortened } = compactPorQue(original);

    expect(text).toBe(original);
    expect(shortened).toBe(0);
  });

  it("no toca un «Por qué» dentro de un bloque de código", () => {
    const original = `\`\`\`markdown\n**Por qué:** ${POR_QUE_LARGO}\n\`\`\`\n`;
    expect(compactPorQue(original).text).toBe(original);
  });

  it("proyecta el resumen solo en las reglas estandares-*, con una nota de dónde está el texto completo", () => {
    scaffold({
      "estandares-backend.md": BACKEND,
      "proyecto.md": `# Proyecto\n\n- Una regla.\n\n**Por qué:** ${POR_QUE_LARGO}\n`,
    });
    const fuente = join(lab, ".valmen", "rules", "estandares-backend.md");
    const antes = huella(fuente);

    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));

    // El estándar va resumido; la regla de proyecto, íntegra.
    const largo = POR_QUE_LARGO.replace(/\s+/g, " ");
    expect(output.split(largo).length - 1).toBe(1);
    expect(output).toContain("El PO devolvió la pantalla porque los montos salían");
    expect(output).toContain("El «Por qué» de cada estándar va resumido en una línea");
    expect(output).toContain("`.valmen/rules/`");
    // La fuente no se reescribe: el texto completo vive ahí.
    expect(huella(fuente)).toBe(antes);
    expect(readFileSync(fuente, "utf8")).toContain(POR_QUE_LARGO);
  });

  it("no agrega la nota cuando no se acortó nada", () => {
    scaffold({
      "estandares-backend.md":
        "# Estándares\n\n- Regla.\n\n**Por qué:** Una razón corta y completa en una línea.\n",
    });

    expect(projectAgentsMd(loadProjectModel(lab, "Demo"))).not.toContain(
      "va resumido en una línea",
    );
  });
});

describe("el presupuesto de tamaño", () => {
  it("sin la clave no hay presupuesto", () => {
    expect(readAgentsMdBudget(parseConfig("name: Demo\n"))).toBeNull();
  });

  it("lee un entero de bytes", () => {
    expect(readAgentsMdBudget(parseConfig("agents-md-budget: 24000\n"))).toBe(24000);
    expect(
      readAgentsMdBudget(parseConfig(`agents-md-budget: ${AGENTS_MD_BUDGET_MIN}\n`)),
    ).toBe(AGENTS_MD_BUDGET_MIN);
  });

  it.each(["999", "abc", "24KB", "-5", "1e5", "2.5"])(
    "rechaza %s en vez de ignorarlo",
    (valor) => {
      const mensaje = fallo(() =>
        readAgentsMdBudget(parseConfig(`agents-md-budget: ${valor}\n`)),
      );
      expect(mensaje).toContain('"agents-md-budget"');
      expect(mensaje).toContain(String(AGENTS_MD_BUDGET_MIN));
    },
  );

  it("mide bytes UTF-8 y estima tokens como bytes / 4", () => {
    const texto = "ñandú —\n";
    const bytes = Buffer.byteLength(texto, "utf8");
    expect(bytes).toBeGreaterThan(texto.length);

    const medida = measureAgentsMd(texto, null);
    expect(medida).toEqual({
      bytes,
      estimatedTokens: Math.ceil(bytes / 4),
      budget: null,
      exceeded: false,
    });
  });

  it("solo se pasa del presupuesto cuando lo supera: justo en el tope no avisa", () => {
    expect(measureAgentsMd("x".repeat(1000), 1000).exceeded).toBe(false);
    expect(measureAgentsMd("x".repeat(1001), 1000).exceeded).toBe(true);
  });

  it("el aviso dice cuánto se pasa y qué hacer", () => {
    const medida = measureAgentsMd("x".repeat(1500), 1000);
    const aviso = agentsMdWarning(medida) as string;

    expect(aviso).toContain("500 B");
    expect(aviso).toContain("rules-to-skills");
    expect(agentsMdWarning(measureAgentsMd("x".repeat(900), 1000))).toBeNull();
    expect(agentsMdWarning(measureAgentsMd("x".repeat(9000), null))).toBeNull();
    expect(describeAgentsMdSize(medida)).toBe("1 500 B (~375 tokens), presupuesto 1 000 B");
  });

  it("la proyección informa el tamaño real del archivo que se escribe", () => {
    scaffold({ "estandares-backend.md": BACKEND });

    const proyeccion = projectFiles(lab, "Demo");
    const agents = proyeccion.files.find((file) => file.path === "AGENTS.md") as {
      content: string;
    };

    expect(proyeccion.agentsMd.bytes).toBe(Buffer.byteLength(agents.content, "utf8"));
    expect(proyeccion.agentsMd.estimatedTokens).toBe(
      Math.ceil(proyeccion.agentsMd.bytes / 4),
    );
    expect(proyeccion.agentsMd.budget).toBeNull();
    expect(proyeccion.warnings).toEqual([]);
  });

  it("avisa si el documento pasa del presupuesto del proyecto y no si cabe", () => {
    scaffold({ "estandares-backend.md": BACKEND }, "name: Demo\nagents-md-budget: 1000\n");
    const pasado = projectFiles(lab, "Demo");
    expect(pasado.agentsMd.exceeded).toBe(true);
    expect(pasado.warnings).toHaveLength(1);
    expect(pasado.warnings[0]).toContain("pasa del presupuesto");

    scaffold(
      { "estandares-backend.md": BACKEND },
      "name: Demo\nagents-md-budget: 200000\n",
    );
    const holgado = projectFiles(lab, "Demo");
    expect(holgado.agentsMd.exceeded).toBe(false);
    expect(holgado.warnings).toEqual([]);
  });

  it("un presupuesto inválido hace fallar la proyección", () => {
    scaffold({}, "name: Demo\nagents-md-budget: mucho\n");
    expect(fallo(() => projectFiles(lab, "Demo"))).toContain('"agents-md-budget"');
  });
});

describe("rules-to-skills", () => {
  const CONFIG = [
    "name: Demo",
    "rules-to-skills:",
    "  estandares-presentacion:",
    "    - desarrollo-frontend",
    "    - validacion-ui",
    "",
  ].join("\n");

  function armar(config = CONFIG): void {
    scaffold(
      { "estandares-presentacion.md": PRESENTACION, "estandares-backend.md": BACKEND },
      config,
    );
    skill("desarrollo-frontend");
    skill("validacion-ui");
    skill("otra");
  }

  it("lee la forma de bloque y la forma en línea", () => {
    expect(routedRules(parseConfig(CONFIG))).toEqual({
      "estandares-presentacion": ["desarrollo-frontend", "validacion-ui"],
    });
    expect(
      routedRules(
        parseConfig("rules-to-skills:\n  estandares-presentacion: [a, b]\n  x: c\n"),
      ),
    ).toEqual({ "estandares-presentacion": ["a", "b"], x: ["c"] });
    expect(routedRules(parseConfig("name: Demo\n"))).toEqual({});
  });

  it("deja en AGENTS.md el título y un puntero, y saca el contenido", () => {
    armar();
    const output = projectAgentsMd(loadProjectModel(lab, "Demo"));

    expect(output).toContain("## Estándares de presentación");
    expect(output).toContain("`desarrollo-frontend` y `validacion-ui`");
    expect(output).toContain("`.valmen/rules/estandares-presentacion.md`");
    // El contenido salió; el de la regla que no se encamina sigue.
    expect(output).not.toContain("Los números van a la derecha");
    expect(output).not.toContain("## Alineación en tablas");
    expect(output).toContain("Las views no calculan");
  });

  it("proyecta la regla, compactada, a esas skills en los cuatro runtimes y a ninguna otra", () => {
    armar();
    const proyeccion = projectFiles(lab, "Demo");
    const archivo = (ruta: string): string =>
      (proyeccion.files.find((file) => file.path === ruta) as { content: string }).content;

    for (const directorio of [".opencode", ".claude", ".codex", ".agents"]) {
      for (const id of ["desarrollo-frontend", "validacion-ui"]) {
        const contenido = archivo(`${directorio}/skills/${id}/SKILL.md`);
        expect(contenido, `${directorio}/${id}`).toContain("Los números van a la derecha");
        expect(contenido).toContain("## Estándares de presentación");
        expect(contenido).toContain(
          "<!-- reglas proyectadas: .valmen/rules/estandares-presentacion.md -->",
        );
        // Con el mismo «Por qué» en una línea.
        expect(contenido).toContain("**Visto en:** TICKET-1 (2026-10-01)");
        expect(contenido.split(POR_QUE_LARGO).length - 1).toBe(0);
      }
      expect(archivo(`${directorio}/skills/otra/SKILL.md`)).not.toContain(
        "Los números van a la derecha",
      );
    }
  });

  it("las reglas van antes de la marca de generado y lo propio de local.md después", () => {
    armar();
    escribir(
      join(lab, ".valmen", "skills", "validacion-ui", "local.md"),
      "## Lo mío\n\n- Local.\n",
    );

    const proyeccion = projectFiles(lab, "Demo");
    const contenido = (
      proyeccion.files.find(
        (file) => file.path === ".claude/skills/validacion-ui/SKILL.md",
      ) as { content: string }
    ).content;

    expect(contenido.indexOf("Los números van a la derecha")).toBeLessThan(
      contenido.indexOf("GENERADO POR valmen"),
    );
    expect(contenido.indexOf("GENERADO POR valmen")).toBeLessThan(
      contenido.indexOf("## Lo mío"),
    );
  });

  it("el prompt MCP de la skill sirve la regla encaminada", () => {
    armar();

    const texto = getPromptFor(lab, "desarrollo-frontend").messages[0]?.content
      .text as string;
    expect(texto).toContain("Pasos de desarrollo-frontend.");
    expect(texto).toContain("Los números van a la derecha");

    // Una skill a la que no se le encaminó nada sigue sirviendo solo lo suyo.
    expect(getPromptFor(lab, "otra").messages[0]?.content.text).toBe(
      "# otra\n\nPasos de otra.",
    );
  });

  it("nombrar una regla que no existe falla diciéndolo", () => {
    armar("name: Demo\nrules-to-skills:\n  estandares-inexistente:\n    - otra\n");

    const mensaje = fallo(() => projectFiles(lab, "Demo"));
    expect(mensaje).toContain('"rules-to-skills.estandares-inexistente"');
    expect(mensaje).toContain("regla que no existe");
    expect(mensaje).toContain("estandares-presentacion");
  });

  it("nombrar una skill que no existe falla diciéndolo", () => {
    armar("name: Demo\nrules-to-skills:\n  estandares-presentacion:\n    - no-existe\n");

    const mensaje = fallo(() => projectFiles(lab, "Demo"));
    expect(mensaje).toContain('"rules-to-skills.estandares-presentacion"');
    expect(mensaje).toContain('la skill "no-existe"');
    expect(mensaje).toContain("desarrollo-frontend");
  });

  it.each([
    ["una lista vacía", "name: Demo\nrules-to-skills:\n  estandares-presentacion: []\n"],
    [
      "un mapa en vez de una lista",
      "name: Demo\nrules-to-skills:\n  estandares-presentacion:\n    otra: x\n",
    ],
  ])("rechaza %s", (_nombre, config) => {
    expect(fallo(() => routedRules(parseConfig(config)))).toContain(
      '"rules-to-skills.estandares-presentacion" debe ser una lista de ids de skill',
    );
  });
});

describe("un corpus que imita a SaiOpenCloud", () => {
  /** Un estándar con varias secciones, cada una con su «Por qué» largo. */
  function estandar(titulo: string, secciones: number): string {
    const partes = [`# ${titulo}`, ""];
    for (let i = 1; i <= secciones; i += 1) {
      partes.push(
        `## Regla ${titulo} ${i}`,
        "",
        `- Cumple la condición ${i} de ${titulo}.`,
        "",
        `**Por qué:** ${POR_QUE_LARGO} Caso ${i} de ${titulo}.`,
        "",
      );
    }
    return partes.join("\n");
  }

  const ESTANDARES = {
    "estandares-backend.md": estandar("Backend", 3),
    "estandares-datos.md": estandar("Datos", 6),
    "estandares-presentacion.md": estandar("Presentacion", 8),
  };

  function tamano(rules: Record<string, string>, config = "name: Demo\n"): number {
    rmSync(join(lab, ".valmen"), { recursive: true, force: true });
    scaffold(rules, config);
    skill("desarrollo-frontend");
    return projectFiles(lab, "Demo").agentsMd.bytes;
  }

  it("el documento baja con el «Por qué» en una línea y baja más al encaminar la pantalla", () => {
    // Sin comprimir: las mismas reglas con un nombre que no es de estándar.
    const sinComprimir = tamano({
      "reglas-backend.md": ESTANDARES["estandares-backend.md"],
      "reglas-datos.md": ESTANDARES["estandares-datos.md"],
      "reglas-presentacion.md": ESTANDARES["estandares-presentacion.md"],
    });
    const comprimido = tamano(ESTANDARES);
    const encaminado = tamano(
      ESTANDARES,
      "name: Demo\nrules-to-skills:\n  estandares-presentacion:\n    - desarrollo-frontend\n",
    );

    expect(comprimido).toBeLessThan(sinComprimir);
    expect(encaminado).toBeLessThan(comprimido);
    // No es un detalle: con 17 «Por qué» de ~480 caracteres el ahorro tiene que ser grande.
    expect(sinComprimir - comprimido).toBeGreaterThan(17 * 250);
  });

  it("ninguna regla vigente se pierde: cada título y cada línea que no es «Por qué» sigue en un documento", () => {
    rmSync(join(lab, ".valmen"), { recursive: true, force: true });
    scaffold(
      ESTANDARES,
      "name: Demo\nrules-to-skills:\n  estandares-presentacion:\n    - desarrollo-frontend\n",
    );
    skill("desarrollo-frontend");

    const proyeccion = projectFiles(lab, "Demo");
    const agents = (
      proyeccion.files.find((file) => file.path === "AGENTS.md") as { content: string }
    ).content;
    const skillClaude = (
      proyeccion.files.find(
        (file) => file.path === ".claude/skills/desarrollo-frontend/SKILL.md",
      ) as {
        content: string;
      }
    ).content;

    const vigentes = (contenido: string): string[] =>
      contenido
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("**Por qué:**"));

    for (const [nombre, contenido] of Object.entries(ESTANDARES)) {
      const destino = nombre === "estandares-presentacion.md" ? skillClaude : agents;
      for (const line of vigentes(contenido)) {
        // El título de nivel 1 de cada archivo se proyecta como nivel 2.
        const esperada = line.startsWith("# ") ? `#${line}` : line;
        expect(destino, `${nombre}: «${line}»`).toContain(esperada);
      }
    }
    // Y de la regla encaminada queda en AGENTS.md su título como puntero.
    expect(agents).toContain("## Presentacion");
  });
});

describe("compatibilidad hacia atrás", () => {
  it("una skill sin reglas encaminadas ni local.md se proyecta como antes del cambio", () => {
    const definicion = {
      id: "revisar",
      description: "Revisa un cambio",
      instructions: "# Revisar\n\nMira el diff.",
      version: null,
      origen: null,
      local: null,
    };

    // El archivo tal como lo escribía el adaptador antes de `rules-to-skills`.
    const anterior =
      "---\nname: revisar\ndescription: Revisa un cambio\n---\n\n# Revisar\n\nMira el diff.\n" +
      "\n---\n\n" +
      `<!-- GENERADO POR valmen v${ADAPTER_VERSION} — NO EDITAR A MANO -->\n` +
      "<!-- fuente:   .valmen/skills/revisar/SKILL.md -->\n" +
      "<!-- regenerar: valmen sync -->\n" +
      "<!-- verificar:  valmen sync --check -->\n";

    expect(renderSkill(definicion, "claude").content).toBe(anterior);
    expect(skillText(definicion)).toBe("# Revisar\n\nMira el diff.");
  });

  it("sin rules-to-skills las skills salen idénticas de withRoutedRules", () => {
    scaffold({ "estandares-backend.md": BACKEND });
    skill("desarrollo-frontend");
    skill("otra");

    const leidas = readSkills(lab);
    expect(withRoutedRules(leidas, loadProjectModel(lab, "Demo"))).toEqual(leidas);
  });

  it("encaminar una regla no cambia las skills que no la reciben", () => {
    scaffold(
      { "estandares-presentacion.md": PRESENTACION },
      "name: Demo\nrules-to-skills:\n  estandares-presentacion:\n    - desarrollo-frontend\n",
    );
    skill("desarrollo-frontend");
    skill("otra");

    const leidas = readSkills(lab);
    const proyectadas = withRoutedRules(leidas, loadProjectModel(lab, "Demo"));

    expect(proyectadas.find((s) => s.id === "otra")).toEqual(
      leidas.find((s) => s.id === "otra"),
    );
    expect(proyectadas.find((s) => s.id === "desarrollo-frontend")?.rules).toHaveLength(1);
  });

  it("proyectar no escribe nada en .valmen/", () => {
    scaffold(
      { "estandares-presentacion.md": PRESENTACION },
      "name: Demo\nagents-md-budget: 5000\n",
    );
    const fuentes = [
      join(lab, ".valmen", "config.yaml"),
      join(lab, ".valmen", "rules", "estandares-presentacion.md"),
    ];
    const antes = fuentes.map(huella);

    projectFiles(lab, "Demo");

    expect(fuentes.map(huella)).toEqual(antes);
  });
});

describe("valmen sync informa el tamaño", () => {
  /** La línea de tamaño tal como la imprime el comando, calculada del archivo que dejó. */
  function tamanoEscrito(presupuesto: number | null): string {
    const contenido = readFileSync(join(lab, "AGENTS.md"), "utf8");
    return describeAgentsMdSize(measureAgentsMd(contenido, presupuesto));
  }

  it("al escribir, dice cuánto pesa el AGENTS.md que escribió y no avisa si no hay presupuesto", () => {
    scaffold({ "estandares-backend.md": BACKEND });

    const resultado = syncProject(lab, "Demo", false);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain(`  tamaño de AGENTS.md      ${tamanoEscrito(null)}`);
    expect(resultado.stdout).toMatch(/[\d ]+ B \(~[\d ]+ tokens\)/);
    expect(resultado.stdout).not.toContain("presupuesto");
    expect(resultado.stdout).not.toContain("Aviso");
  });

  it("al escribir, avisa cuando pasa del presupuesto y aun así escribe y sale en 0", () => {
    scaffold({ "estandares-backend.md": BACKEND }, "name: Demo\nagents-md-budget: 1000\n");

    const resultado = syncProject(lab, "Demo", false);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("presupuesto 1 000 B");
    expect(resultado.stdout).toContain("  Aviso: AGENTS.md pasa del presupuesto");
    expect(resultado.stdout).toContain("rules-to-skills");
    // El documento se escribió: el aviso no bloquea.
    expect(readFileSync(join(lab, "AGENTS.md"), "utf8")).toContain("GENERADO POR valmen");
  });

  it("no avisa cuando cabe en el presupuesto, pero lo muestra", () => {
    scaffold(
      { "estandares-backend.md": BACKEND },
      "name: Demo\nagents-md-budget: 200000\n",
    );

    const resultado = syncProject(lab, "Demo", false);

    expect(resultado.stdout).toContain("presupuesto 200 000 B");
    expect(resultado.stdout).not.toContain("Aviso");
  });

  it("con --check al día, repite el tamaño y el aviso sin cambiar el código de salida", () => {
    scaffold({ "estandares-backend.md": BACKEND }, "name: Demo\nagents-md-budget: 1000\n");
    syncProject(lab, "Demo", false);

    const resultado = syncProject(lab, "Demo", true);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain(`AGENTS.md: ${tamanoEscrito(1000)}`);
    expect(resultado.stdout).toContain("Aviso: AGENTS.md pasa del presupuesto");
  });

  it("con --check desactualizado, el aviso viaja junto al error", () => {
    scaffold({ "estandares-backend.md": BACKEND }, "name: Demo\nagents-md-budget: 1000\n");

    const resultado = syncProject(lab, "Demo", true);

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr + resultado.stdout).toContain("AGENTS.md (falta)");
    expect(resultado.stderr + resultado.stdout).toContain(
      "Aviso: AGENTS.md pasa del presupuesto",
    );
  });

  it("un presupuesto inválido hace fallar el comando y lo dice", () => {
    scaffold({}, "name: Demo\nagents-md-budget: mucho\n");

    const resultado = syncProject(lab, "Demo", false);

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr + resultado.stdout).toContain('"agents-md-budget"');
  });
});
