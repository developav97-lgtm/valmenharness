/**
 * La configuración editable de Mission Control.
 *
 * `.valmen/config.yaml` es lo que el harness proyecta a `AGENTS.md`, así que
 * tocarlo desde la app es tocar el contrato que leen los agentes. Lo que estos
 * tests protegen:
 *
 * 1. **Un texto que no parsea no se guarda nunca.** El archivo no se toca y el
 *    error se muestra con su línea. Un `config.yaml` roto deja el proyecto sin
 *    proyección y el fallo aparecería más tarde y en otro sitio.
 * 2. **El texto es la fuente.** Los comentarios sobreviven a la edición: son la
 *    mitad del valor del archivo.
 * 3. **El efecto se ve antes de guardar.** La pantalla dice qué entendió el
 *    harness y si `AGENTS.md` queda desactualizado. Sin eso, el usuario tendría
 *    que saber que ese archivo es generado, que es justo el conocimiento que la
 *    app debe evitar exigir.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadProjectModel, projectAgentsMd } from "../packages/adapter/src/index.js";
import {
  checkConfig,
  configPath,
  diffLines,
  projectionImpact,
  readConfigText,
  syncProjections,
  writeConfig,
} from "../packages/server/src/config.js";
import { handleApi } from "../packages/server/src/server.js";

const CONFIG = `# Configuración del harness en este proyecto.
#
# Generado por \`valmen adopt\`. Revise y ajuste lo que corresponda.

name: SaiOpenCloud
tickets-dir: docs/tickets

# Gates del proyecto.
gates: []
`;

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-config-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), CONFIG, "utf8");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** El contexto de la API para el laboratorio. */
function context() {
  return {
    root: lab,
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

describe("leer la configuración", () => {
  it("resume lo que el harness entendió", () => {
    const estado = checkConfig(lab, readConfigText(lab));
    expect(estado.ok).toBe(true);
    expect(estado.error).toBe("");
    expect(estado.summary?.name).toBe("SaiOpenCloud");
    expect(estado.summary?.ticketsDir).toBe("docs/tickets");
    expect(estado.summary?.gates).toEqual([]);
    expect(estado.summary?.adopted).toBe(true);
    expect(estado.summary?.keys).toEqual(["name", "tickets-dir", "gates"]);
  });

  it("no inventa un diff cuando el texto es el guardado", () => {
    const estado = checkConfig(lab, readConfigText(lab));
    expect(estado.diff.every((linea) => linea.kind === "same")).toBe(true);
  });

  it("un proyecto sin configurar no tiene archivo y lo dice", () => {
    const virgen = mkdtempSync(join(tmpdir(), "valmen-config-virgen-"));
    try {
      const estado = checkConfig(virgen, readConfigText(virgen));
      expect(estado.ok).toBe(true);
      // Un texto vacío es una configuración válida: sin archivo, todo son
      // valores por defecto. Lo que no puede es parecer adoptado.
      expect(estado.summary?.adopted).toBe(false);
      expect(estado.summary?.name).toBe(virgen.split("/").pop());
    } finally {
      rmSync(virgen, { recursive: true, force: true });
    }
  });
});

// ── Análisis ────────────────────────────────────────────────────────────────

describe("analizar un texto sin guardarlo", () => {
  it("acepta una lista de gates y la interpreta", () => {
    const texto = CONFIG.replace("gates: []", "gates:\n  - plan\n  - analysis");
    const estado = checkConfig(lab, texto);
    expect(estado.ok).toBe(true);
    expect(estado.summary?.gates).toEqual(["plan", "analysis"]);
  });

  it("explica el error con su número de línea", () => {
    const estado = checkConfig(lab, "name: SaiOpenCloud\n\tgates: []\n");
    expect(estado.ok).toBe(false);
    expect(estado.summary).toBeNull();
    expect(estado.error).toContain("línea 2");
    expect(estado.error).toContain("indentación");
  });

  it("rechaza una clave con formato inválido", () => {
    const estado = checkConfig(lab, "Name: SaiOpenCloud\n");
    expect(estado.ok).toBe(false);
    expect(estado.error).toContain("Name");
  });

  it("no escribe nada al analizar", () => {
    checkConfig(lab, "name: Otro\n");
    expect(readFileSync(configPath(lab), "utf8")).toBe(CONFIG);
  });
});

// ── Diff ────────────────────────────────────────────────────────────────────

describe("las diferencias antes de guardar", () => {
  it("señala la línea añadida y la quitada", () => {
    const diff = diffLines("a\nb\n", "a\nc\n");
    expect(diff).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "add", text: "c" },
      { kind: "same", text: "" },
    ]);
  });

  it("un reordenamiento no se lee como una reescritura", () => {
    const diff = diffLines("a\nb\nc\n", "a\nc\nb\n");
    const quitadas = diff.filter((linea) => linea.kind === "remove");
    expect(quitadas).toHaveLength(1);
    expect(diff.filter((linea) => linea.kind === "add")).toHaveLength(1);
  });

  it("el diff de guardar gates es corto y legible", () => {
    const estado = checkConfig(lab, CONFIG.replace("gates: []", "gates:\n  - plan"));
    const cambios = estado.diff.filter((linea) => linea.kind !== "same");
    // Tres líneas: la lista vacía se va, el encabezado y su elemento llegan. El
    // comentario de encima no se toca, que es lo que hace legible el diff.
    expect(cambios.map((linea) => [linea.kind, linea.text.trim()])).toEqual([
      ["remove", "gates: []"],
      ["add", "gates:"],
      ["add", "- plan"],
    ]);
  });
});

// ── Escritura ───────────────────────────────────────────────────────────────

describe("guardar la configuración", () => {
  it("escribe el texto y conserva los comentarios", () => {
    const texto = CONFIG.replace("gates: []", "gates:\n  - plan");
    const resultado = writeConfig(lab, texto);
    expect(resultado.written).toBe(true);

    const guardado = readFileSync(configPath(lab), "utf8");
    expect(guardado).toContain("# Generado por `valmen adopt`");
    expect(guardado).toContain("- plan");
    // Tras guardar, el texto en disco es el que se escribió: no hay diff.
    expect(resultado.diff).toEqual([]);
  });

  it("no escribe un texto que no parsea, y no toca el archivo", () => {
    const resultado = writeConfig(lab, "name: [esto no es un texto]\n");
    expect(resultado.written).toBe(false);
    expect(resultado.ok).toBe(false);
    expect(readFileSync(configPath(lab), "utf8")).toBe(CONFIG);
  });

  it("no deja un archivo a medias si el texto es enorme y roto", () => {
    const resultado = writeConfig(lab, "a".repeat(5000));
    expect(resultado.written).toBe(false);
    expect(readFileSync(configPath(lab), "utf8")).toBe(CONFIG);
  });

  it("cambiar el nombre cambia lo que el harness proyecta", () => {
    const texto = CONFIG.replace("name: SaiOpenCloud", "name: OtroNombre");
    expect(projectAgentsMd(loadProjectModel(lab, "x", texto))).not.toBe(
      projectAgentsMd(loadProjectModel(lab, "x", CONFIG)),
    );
    expect(projectAgentsMd(loadProjectModel(lab, "x", texto))).toContain("OtroNombre");

    // El efecto que la pantalla anuncia es el real: guardado el texto y generado
    // el archivo, ya no queda nada pendiente.
    writeConfig(lab, texto);
    writeFileSync(
      join(lab, "AGENTS.md"),
      projectAgentsMd(loadProjectModel(lab, "x")),
      "utf8",
    );
    expect(projectionImpact(lab, texto)?.changesAgentsMd).toBe(false);
  });

  it("avisa de qué archivos generados quedan desactualizados", () => {
    const impacto = projectionImpact(lab, CONFIG.replace("name: SaiOpenCloud", "name: Otro"));
    expect(impacto?.files).toEqual([{ path: "AGENTS.md", stale: true }]);
    expect(impacto?.stale).toBe(1);
    expect(impacto?.changesAgentsMd).toBe(true);
  });
});

// ── Regenerar ───────────────────────────────────────────────────────────────

describe("regenerar los archivos proyectados", () => {
  it("escribe AGENTS.md y deja de haber nada pendiente", () => {
    expect(projectionImpact(lab, CONFIG)?.stale).toBe(1);

    const resultado = syncProjections(lab);
    expect(resultado.ok).toBe(true);
    expect(resultado.written).toEqual(["AGENTS.md"]);
    expect(readFileSync(join(lab, "AGENTS.md"), "utf8")).toContain("SaiOpenCloud");

    // Y una segunda ejecución no escribe nada: la proyección es determinista.
    const segunda = syncProjections(lab);
    expect(segunda.written).toEqual([]);
    expect(segunda.unchanged).toEqual(["AGENTS.md"]);
  });

  it("el archivo generado es el mismo que produce `valmen sync`", () => {
    syncProjections(lab);
    expect(readFileSync(join(lab, "AGENTS.md"), "utf8")).toBe(
      projectAgentsMd(loadProjectModel(lab, "SaiOpenCloud")),
    );
  });

  it("una edición a mano del archivo generado se detecta y se repara", () => {
    syncProjections(lab);
    const ruta = join(lab, "AGENTS.md");
    writeFileSync(ruta, `${readFileSync(ruta, "utf8")}\nEDITADO A MANO\n`, "utf8");

    expect(projectionImpact(lab, CONFIG)?.stale).toBe(1);
    expect(syncProjections(lab).written).toEqual(["AGENTS.md"]);
    expect(readFileSync(ruta, "utf8")).not.toContain("EDITADO A MANO");
  });

  it("regenerar con una configuración rota devuelve el error sin escribir", () => {
    writeFileSync(join(lab, ".valmen", "config.yaml"), "\tmal\n", "utf8");
    const resultado = syncProjections(lab);
    expect(resultado.ok).toBe(false);
    // El mensaje es el del parser, con su línea: no se resume ni se reinterpreta.
    expect(resultado.error).toContain("config.yaml línea 1");
    expect(resultado.written).toEqual([]);
  });

  it("la API regenera y devuelve el impacto resultante", async () => {
    const respuesta = await handleApi("POST", "/api/config/sync", {}, context());
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      ok: boolean;
      written: string[];
      impact: { stale: number };
    };
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.written).toEqual(["AGENTS.md"]);
    expect(cuerpo.impact.stale).toBe(0);
  });

  it("un texto que no parsea no tiene efecto que mostrar", () => {
    expect(projectionImpact(lab, "\tmal\n")).toBeNull();
  });
});

// ── API ─────────────────────────────────────────────────────────────────────

describe("la API de configuración", () => {
  it("devuelve el estado y el efecto", async () => {
    const respuesta = await handleApi("GET", "/api/config", {}, context());
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      config: { ok: boolean; summary: { name: string } };
      impact: { changesAgentsMd: boolean } | null;
    };
    expect(cuerpo.config.ok).toBe(true);
    expect(cuerpo.config.summary.name).toBe("SaiOpenCloud");
    expect(cuerpo.impact).not.toBeNull();
  });

  it("analiza sin escribir", async () => {
    const respuesta = await handleApi(
      "POST",
      "/api/config/check",
      { text: CONFIG.replace("name: SaiOpenCloud", "name: Cambiado") },
      context(),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      config: { summary: { name: string }; diff: { kind: string }[] };
    };
    expect(cuerpo.config.summary.name).toBe("Cambiado");
    expect(cuerpo.config.diff.some((linea) => linea.kind === "add")).toBe(true);
    expect(readFileSync(configPath(lab), "utf8")).toBe(CONFIG);
  });

  it("guarda cuando el texto parsea", async () => {
    const texto = CONFIG.replace("tickets-dir: docs/tickets", "tickets-dir: tickets");
    const respuesta = await handleApi("PUT", "/api/config", { text: texto }, context());
    expect(respuesta.status).toBe(200);
    expect((respuesta.body as { config: { summary: { ticketsDir: string } } }).config.summary.ticketsDir).toBe("tickets");
  });

  it("no guarda cuando el texto no parsea, y lo informa", async () => {
    const respuesta = await handleApi(
      "PUT",
      "/api/config",
      { text: "name:\n  - roto\n" },
      context(),
    );
    // 200 y no 500: el servidor no falló, el texto sí. La pantalla muestra el
    // motivo donde el usuario está escribiendo.
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      config: { written: boolean; ok: boolean; error: string };
    };
    expect(cuerpo.config.written).toBe(false);
    expect(cuerpo.config.ok).toBe(false);
    expect(cuerpo.config.error).not.toBe("");
    expect(readFileSync(configPath(lab), "utf8")).toBe(CONFIG);
  });

  it("rechaza una petición sin texto", async () => {
    expect((await handleApi("PUT", "/api/config", {}, context())).status).toBe(400);
    expect((await handleApi("POST", "/api/config/check", {}, context())).status).toBe(400);
  });

  it("la ruta de la configuración sale del proyecto, no del directorio actual", async () => {
    const respuesta = await handleApi("GET", "/api/config", {}, context());
    expect((respuesta.body as { config: { path: string } }).config.path).toBe(
      join(lab, ".valmen", "config.yaml"),
    );
  });
});
