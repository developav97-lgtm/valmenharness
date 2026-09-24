/**
 * Las anotaciones del catálogo MCP: qué declara cada herramienta de sí misma.
 *
 * Existe porque `readOnlyHint` es la única señal con la que un cliente decide
 * **sin llamar** si puede auto-aprobar una herramienta. Hermes, con
 * `trust: untrusted`, pide permiso humano para toda llamada que no venga marcada
 * como de solo lectura; Claude Code y Cursor tienen equivalentes. Si esa marca
 * está mal puesta, el daño va en dos direcciones opuestas y las dos son reales:
 *
 * - Una herramienta que **escribe** y se declara de solo lectura deja que un
 *   agente mueva el registro sin que nadie mire. Es el modo de fallo que el
 *   harness entero existe para evitar.
 * - Una herramienta que **gasta** y se declara de solo lectura convierte
 *   «permiso para leer» en «permiso para gastar sin tope»: `simular_compuerta`
 *   no toca un archivo y cuesta una llamada por ticket evaluado.
 *
 * El compilador ya garantiza que ninguna herramienta quede **sin** anotar
 * —`annotations` es obligatorio en `ToolDefinition`—. Lo que no puede garantizar
 * es que los valores sean los correctos, y eso es lo que se fija acá: las listas
 * son explícitas para que cambiar el carácter de una herramienta exija editar
 * este archivo a mano y decirlo.
 */
import { describe, expect, it } from "vitest";

import { TOOLS } from "../packages/mcp/src/tools.js";
import { atender, type ServerCatalog } from "../packages/mcp/src/protocol.js";

/** Las herramientas que salen del proyecto: llaman a un modelo o corren pasos. */
const SALEN_DEL_PROYECTO = [
  "evaluar_compuerta",
  "simular_compuerta",
  "descomponer_feature",
  "calibrar_compuerta",
  "ejecutar_proceso",
];

/** Las que reescriben algo que ya existía, en vez de solo anexar. */
const REESCRIBEN = [
  "mover_ticket",
  "mover_punto",
  "descomponer_feature",
  "ejecutar_proceso",
  "indexar_registro",
  "revisar_aprendizajes",
  "decidir_estandar",
];

/** Las únicas que un cliente puede ejecutar sin preguntar. */
const SOLO_LECTURA = [
  "ver_ticket",
  "listar_tickets",
  "validar_ticket",
  "reanudar_ticket",
  "ver_features",
  "ver_procesos",
  "estado_proceso",
  "reporte_cierres",
  "revisar_secretos",
  "reporte_consumo",
  "revisar_drift",
  "reporte_valor",
  "buscar_memoria",
  "ver_estandares",
  "revisar_presentacion",
];

/** Las que no se pueden repetir sin cambiar el resultado. */
const NO_IDEMPOTENTES = [
  "crear_ticket",
  "mover_ticket",
  "anotar_punto",
  "mover_punto",
  "anotar_evidencia",
  "evaluar_compuerta",
  "simular_compuerta",
  "descomponer_feature",
  "ejecutar_proceso",
  "calibrar_compuerta",
  "manifiesto_entrega",
  "guardar_aprendizaje",
  "revisar_aprendizajes",
  "proponer_estandar",
  "decidir_estandar",
  "iniciar_qa",
  "anotar_retest",
  "cerrar_qa",
  "preparar_cierre",
];

describe("las anotaciones de las herramientas", () => {
  it("las treinta y cinco declaran las cuatro, con un booleano cada una", () => {
    expect(TOOLS).toHaveLength(35);
    for (const tool of TOOLS) {
      const a = tool.annotations;
      expect(a, `${tool.name} no declara anotaciones`).toBeDefined();
      for (const campo of [
        "readOnlyHint",
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
      ] as const) {
        expect(typeof a[campo], `${tool.name}.${campo}`).toBe("boolean");
      }
    }
  });

  it("marca de solo lectura exactamente las quince que no escriben", () => {
    const leen = TOOLS.filter((t) => t.annotations.readOnlyHint)
      .map((t) => t.name)
      .sort();
    expect(leen).toEqual([...SOLO_LECTURA].sort());
  });

  it("ninguna herramienta que gaste se declara de solo lectura", () => {
    // Es la propiedad que separa «permiso para leer» de «permiso para gastar sin
    // tope», y por eso se afirma sobre la lista explícita y no sobre un conteo.
    for (const nombre of SALEN_DEL_PROYECTO) {
      const tool = TOOLS.find((t) => t.name === nombre);
      expect(tool, `falta ${nombre}`).toBeDefined();
      expect(
        tool?.annotations.readOnlyHint,
        `${nombre} sale del proyecto y no puede declararse de solo lectura`,
      ).toBe(false);
      expect(tool?.annotations.openWorldHint, `${nombre}.openWorldHint`).toBe(true);
    }
  });

  it("una herramienta de solo lectura nunca se declara destructiva", () => {
    // Leer no puede reescribir nada. Si alguna vez hiciera falta que una
    // herramienta de lectura sea destructiva, es que no es de lectura.
    for (const tool of TOOLS) {
      if (tool.annotations.readOnlyHint) {
        expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      }
    }
  });

  it("declara destructivas exactamente las siete que reescriben algo existente", () => {
    const reescriben = TOOLS.filter((t) => t.annotations.destructiveHint)
      .map((t) => t.name)
      .sort();
    expect(reescriben).toEqual([...REESCRIBEN].sort());
  });

  it("declara no idempotentes exactamente las diecinueve que anexan o mueven", () => {
    const noIdempotentes = TOOLS.filter((t) => !t.annotations.idempotentHint)
      .map((t) => t.name)
      .sort();
    expect(noIdempotentes).toEqual([...NO_IDEMPOTENTES].sort());
  });

  it("las emite en el cable, dentro de `tools/list`", async () => {
    // La anotación no sirve de nada si se queda en el proceso: el cliente decide
    // con lo que recibe. `tools/list` devuelve las definiciones tal cual, así que
    // esto comprueba que esa promesa sigue siendo cierta.
    const catalogo: ServerCatalog = {
      name: "valmen",
      version: "0.0.1",
      tools: TOOLS,
      prompts: [],
      call: () => Promise.resolve({ text: "", isError: false }),
      getPrompt: () => ({ description: "", text: "" }),
    };

    const resultado = (await atender(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      catalogo,
    )) as { tools: readonly { name: string; annotations: Record<string, boolean> }[] };

    expect(resultado.tools).toHaveLength(35);
    for (const tool of resultado.tools) {
      expect(Object.keys(tool.annotations).sort()).toEqual([
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
        "readOnlyHint",
      ]);
    }

    const listar = resultado.tools.find((t) => t.name === "listar_tickets");
    expect(listar?.annotations["readOnlyHint"]).toBe(true);

    const ejecutar = resultado.tools.find((t) => t.name === "ejecutar_proceso");
    expect(ejecutar?.annotations["readOnlyHint"]).toBe(false);
    expect(ejecutar?.annotations["destructiveHint"]).toBe(true);
    expect(ejecutar?.annotations["openWorldHint"]).toBe(true);
  });
});
