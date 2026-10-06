/**
 * El contrato de respuesta en el `AGENTS.md` proyectado (R-RESP-001).
 *
 * El pedido del PO fue que, ante una decisión, el agente devuelva solo las opciones
 * y en qué afecta cada una, **en todos los proyectos que monten el harness y en todos
 * los clientes**. Lo que llega a todos los clientes es `AGENTS.md`, así que ahí tiene
 * que estar el contrato, antes de las reglas del proyecto y con la declaración de que
 * prevalece sobre cualquier modo de respuesta heredado.
 *
 * La propiedad que más cuesta romper sin darse cuenta es la idempotencia: `valmen
 * sync` reescribe el archivo entero, y una sección que se acumula en cada corrida
 * dejaría a los proyectos con el contrato repetido.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RESPONSE_CONTRACT_PRECEDENCE,
  RESPONSE_CONTRACT_RULES,
  RESPONSE_CONTRACT_TITLE,
  extractRules,
  loadProjectModel,
  projectAgentsMd,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";

let lab: string;

/** Crea un `.valmen/` mínimo con las reglas indicadas. */
function scaffold(rules: Record<string, string>, config = "name: Demo\n"): void {
  mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), config, "utf8");
  for (const [name, content] of Object.entries(rules)) {
    writeFileSync(join(lab, ".valmen", "rules", name), content, "utf8");
  }
}

function agentsMd(): string {
  return projectAgentsMd(loadProjectModel(lab, "Demo"));
}

/** Cuántas veces aparece un encabezado de nivel 2 con ese título. */
function secciones(texto: string, titulo: string): number {
  return texto.split("\n").filter((line) => line.trim() === `## ${titulo}`).length;
}

function huella(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-respuesta-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el contrato de respuesta abre el AGENTS.md", () => {
  it("va después del título y antes de las reglas del proyecto y del flujo", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django 5.2.1\n" });
    const output = agentsMd();

    const titulo = output.indexOf("\n# Demo\n");
    const contrato = output.indexOf(`\n## ${RESPONSE_CONTRACT_TITLE}\n`);
    const regla = output.indexOf("\n## Stack\n");
    const flujo = output.indexOf("\n## Flujo de trabajo\n");

    expect(titulo).toBeGreaterThan(-1);
    expect(contrato, "falta la sección «Cómo se responde»").toBeGreaterThan(titulo);
    expect(regla).toBeGreaterThan(contrato);
    expect(flujo).toBeGreaterThan(regla);
  });

  it("también va primero cuando el proyecto no declara reglas propias", () => {
    scaffold({});
    const output = agentsMd();

    expect(output.indexOf(`## ${RESPONSE_CONTRACT_TITLE}`)).toBeGreaterThan(-1);
    expect(output.indexOf(`## ${RESPONSE_CONTRACT_TITLE}`)).toBeLessThan(
      output.indexOf("no declara reglas propias"),
    );
  });

  it("lleva las ocho reglas del pedido, tal como las dice el contrato", () => {
    scaffold({});
    // Se compara sin saltos de línea: lo que se afirma es la frase, no dónde corta el renglón.
    const plano = agentsMd().replace(/\s+/g, " ");

    expect(RESPONSE_CONTRACT_RULES).toHaveLength(8);
    for (const regla of RESPONSE_CONTRACT_RULES) {
      expect(plano, `falta la regla «${regla}»`).toContain(regla);
    }

    // Y las que el PO nombró, por sus palabras clave.
    expect(plano).toContain("va en la primera línea");
    expect(plano).toContain("El largo sigue el peso del pedido");
    expect(plano).toContain("cinco líneas o menos");
    expect(plano).toContain("`Decisión`");
    expect(plano).toContain("`A) opción → efecto`");
    expect(plano).toContain("`Recomiendo`");
    expect(plano).toContain(
      "Sin tablas ni encabezados, salvo para comparar tres filas o más",
    );
    expect(plano).toContain("La evidencia se cita");
    expect(plano).toContain("van al ticket");
    expect(plano).toContain("Un riesgo irreversible se dice en una línea");
    expect(plano).toContain("Se amplía solo lo que la persona pida");
  });

  it("declara que prevalece sobre cualquier modo de respuesta heredado", () => {
    scaffold({});
    const plano = agentsMd().replace(/\s+/g, " ");

    expect(RESPONSE_CONTRACT_PRECEDENCE).toContain(
      "prevalece sobre cualquier modo de respuesta heredado",
    );
    expect(plano).toContain(RESPONSE_CONTRACT_PRECEDENCE);
    // La precedencia va ANTES de las reglas: es lo que las desempata.
    expect(plano.indexOf(RESPONSE_CONTRACT_PRECEDENCE)).toBeLessThan(
      plano.indexOf("- La respuesta va"),
    );
  });

  it("es determinista: el mismo modelo produce el mismo texto", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django.\n" });
    expect(agentsMd()).toBe(agentsMd());
  });
});

describe("sync --check verifica la sección", () => {
  it("falla con un AGENTS.md generado antes de que existiera la sección y pasa tras sync", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django.\n" });
    expect(syncProject(lab, "Demo", false).exitCode).toBe(0);
    expect(syncProject(lab, "Demo", true).exitCode).toBe(0);

    // El AGENTS.md que escribía el harness antes: el mismo, sin la sección.
    const ruta = join(lab, "AGENTS.md");
    const actual = readFileSync(ruta, "utf8");
    const inicio = actual.indexOf(`## ${RESPONSE_CONTRACT_TITLE}`);
    const fin = actual.indexOf("## Stack");
    expect(inicio, "el sync no escribió la sección").toBeGreaterThan(-1);
    writeFileSync(ruta, actual.slice(0, inicio) + actual.slice(fin), "utf8");

    const viejo = syncProject(lab, "Demo", true);
    expect(viejo.exitCode).not.toBe(0);
    expect(viejo.stderr + viejo.stdout).toContain("AGENTS.md");

    expect(syncProject(lab, "Demo", false).exitCode).toBe(0);
    expect(syncProject(lab, "Demo", true).exitCode).toBe(0);
    expect(secciones(readFileSync(ruta, "utf8"), RESPONSE_CONTRACT_TITLE)).toBe(1);
  });

  it("detecta que alguien editó a mano el contrato", () => {
    scaffold({});
    syncProject(lab, "Demo", false);

    const ruta = join(lab, "AGENTS.md");
    writeFileSync(
      ruta,
      readFileSync(ruta, "utf8").replace(
        "Se amplía solo lo que la persona pida.",
        "Se amplía lo que haga falta.",
      ),
      "utf8",
    );

    expect(syncProject(lab, "Demo", true).exitCode).not.toBe(0);
  });
});

describe("sincronizar dos veces no duplica la sección", () => {
  it("deja el mismo archivo y una sola sección", () => {
    scaffold({ "10-stack.md": "# Stack\n\n- Django.\n" });

    syncProject(lab, "Demo", false);
    const primero = readFileSync(join(lab, "AGENTS.md"), "utf8");
    syncProject(lab, "Demo", false);
    const segundo = readFileSync(join(lab, "AGENTS.md"), "utf8");

    expect(segundo).toBe(primero);
    expect(secciones(segundo, RESPONSE_CONTRACT_TITLE)).toBe(1);
  });

  it("reemplaza un AGENTS.md escrito a mano en vez de sumarse a él", () => {
    scaffold({});
    writeFileSync(
      join(lab, "AGENTS.md"),
      "# Demo\n\n## Notas\n\n- Escritas a mano.\n",
      "utf8",
    );

    syncProject(lab, "Demo", false);
    syncProject(lab, "Demo", false);

    const output = readFileSync(join(lab, "AGENTS.md"), "utf8");
    expect(secciones(output, RESPONSE_CONTRACT_TITLE)).toBe(1);
    expect(output).toContain("GENERADO POR valmen");
  });

  it("conserva una sección «Cómo se responde» propia del proyecto, retitulada, y sigue siendo una sola del harness", () => {
    // El caso real: el proyecto ya tenía su propia sección, `adopt` la extrajo de su
    // AGENTS.md anterior y el sync la proyecta junto a la del harness.
    scaffold({});
    writeFileSync(
      join(lab, "AGENTS.md"),
      "# Demo\n\n## Cómo se responde\n\n- Siempre en verso.\n\n## Otra\n\n- Cosa.\n",
      "utf8",
    );
    const extraccion = extractRules(lab);
    expect(extraccion.files.map((file) => file.path)).toContain(
      ".valmen/rules/como-se-responde.md",
    );
    for (const file of extraccion.files) {
      mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
      writeFileSync(join(lab, file.path), file.content, "utf8");
    }
    const fuente = join(lab, ".valmen", "rules", "como-se-responde.md");
    const antes = huella(fuente);

    syncProject(lab, "Demo", false);
    const primero = readFileSync(join(lab, "AGENTS.md"), "utf8");
    syncProject(lab, "Demo", false);
    const segundo = readFileSync(join(lab, "AGENTS.md"), "utf8");

    expect(segundo).toBe(primero);
    // Una sola «Cómo se responde», la del harness, y la del proyecto con otro título.
    expect(secciones(segundo, RESPONSE_CONTRACT_TITLE)).toBe(1);
    expect(secciones(segundo, `${RESPONSE_CONTRACT_TITLE} en este proyecto`)).toBe(1);
    expect(segundo).toContain("- Siempre en verso.");
    // El harness va primero.
    expect(segundo.indexOf(`## ${RESPONSE_CONTRACT_TITLE}\n`)).toBeLessThan(
      segundo.indexOf(`## ${RESPONSE_CONTRACT_TITLE} en este proyecto`),
    );
    // Y la fuente del proyecto no se tocó.
    expect(huella(fuente)).toBe(antes);
    expect(readFileSync(fuente, "utf8")).toContain("# Cómo se responde");
  });

  it("no retitula un encabezado con ese nombre dentro de un bloque de código", () => {
    scaffold({
      "10-doc.md": "# Doc\n\n```markdown\n## Cómo se responde\n```\n",
    });
    const output = agentsMd();

    expect(output).toContain("```markdown\n## Cómo se responde\n```");
    expect(secciones(output, `${RESPONSE_CONTRACT_TITLE} en este proyecto`)).toBe(0);
  });
});
