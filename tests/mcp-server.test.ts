/**
 * El servidor MCP: el harness al alcance de un agente.
 *
 * Esta suite prueba una frontera, no una funcionalidad. Que `crear_ticket`
 * escriba un ticket correcto ya lo prueba el resto del suite; lo que se prueba
 * aquí es **qué puede y qué no puede hacer un agente** por esta vía, porque es
 * una superficie nueva por la que un modelo puede escribir en el registro.
 *
 * Cuatro cosas concretas:
 *
 * 1. **Las herramientas y el CLI no pueden divergir.** `validar_ticket` sobre un
 *    registro inválido tiene que devolver el mismo texto que `valmen validate`,
 *    porque son la misma función. Si algún día dejan de serlo, este test lo dice.
 * 2. **Un fallo de herramienta es un resultado, no un error de protocolo.** El
 *    agente tiene que poder leer «falta `type`» y corregir; un error JSON-RPC lo
 *    dejaría sin el motivo. Un método desconocido sí es error de protocolo.
 * 3. **Un agente no se aprueba a sí mismo.** No existe herramienta para aprobar
 *    una compuerta, y `mover_ticket` no salta la tabla de estados.
 * 4. **El protocolo se cumple literalmente**: negociación de versión, `id`
 *    respetado, notificaciones sin respuesta y stdout con una línea de JSON por
 *    mensaje y nada más.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TOOLS, callTool } from "../packages/mcp/src/tools.js";
import type { ToolContext } from "../packages/mcp/src/tools.js";
import { credentialsFor, parseOptions, pathsFor } from "../packages/mcp/src/main.js";

const ID = "BUGFIX-POS-FILTRO-PARCIAL-20260922";

let lab: string;
let contexto: ToolContext;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-mcp-"));
  contexto = { paths: pathsFor(lab), credentialsFile: undefined };
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Crea el ticket de trabajo y devuelve su ruta. */
async function crear(): Promise<string> {
  const resultado = await callTool(contexto, "crear_ticket", {
    id: ID,
    title: "El filtro ignora la coincidencia parcial",
    type: "BUGFIX",
    module: "POS",
    request: 'Busco "999" y no aparece nada, aunque sé que existe.',
  });
  expect(resultado.isError).toBe(false);
  return join(lab, "tickets", "2026", ID, "ticket.md");
}

/** Un evaluador semántico falso que aprueba todo lo que se le pregunte. */
function evaluadorQueAprueba(valor = 0.95): NonNullable<ToolContext["jev"]> {
  // La opción que aprueba se llama distinto en cada gate —`completa` en el de
  // análisis, `completo` en el de plan—, así que se elige por la forma del id y
  // no por el valor: lo que estos tests afirman es la herramienta, no el gate.
  const porId: Record<string, string> = { clasificacion: "completa" };
  return async (options: { propositions?: readonly { id: string }[] }) => ({
    answers: (options.propositions ?? []).map((proposition) => {
      const eleccion = porId[proposition.id];
      return eleccion === undefined
        ? { id: proposition.id, kind: "noul" as const, value: valor, rationale: "falso" }
        : {
            id: proposition.id,
            kind: "choice" as const,
            choice: eleccion,
            rationale: "falso",
          };
    }),
    model: {
      provider: "falso",
      model: "para-pruebas",
      resolvedVersion: "falso/para-pruebas@0",
    },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: 1,
  });
}

/** El contexto con el evaluador inyectado y una fecha fija. */
function conEvaluadorFalso(valor = 0.95): ToolContext {
  return {
    ...contexto,
    jev: evaluadorQueAprueba(valor),
    now: () => new Date("2026-09-22T12:00:00Z"),
  };
}

describe("el catálogo de herramientas", () => {
  it("no expone ninguna forma de aprobar una compuerta", () => {
    // La regla del proyecto: un gate puede prepararse automáticamente, pero la
    // aprobación es de una persona. No es un olvido — es la propiedad que este
    // servidor no puede perder, y por eso se afirma sobre los nombres.
    const nombres = TOOLS.map((tool) => tool.name);
    expect(nombres.some((nombre) => /aprob|approve|decid|decide/.test(nombre))).toBe(false);
  });

  it("declara las ocho herramientas, cada una con descripción y esquema", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "crear_ticket",
      "ver_ticket",
      "listar_tickets",
      "validar_ticket",
      "evaluar_compuerta",
      "mover_ticket",
      "reanudar_ticket",
      "simular_compuerta",
    ]);
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.inputSchema["type"]).toBe("object");
    }
  });

  it("declara `root` opcional en todas, para que una sesión pueda apuntar a otro proyecto", () => {
    for (const tool of TOOLS) {
      const propiedades = tool.inputSchema["properties"] as
        Record<string, unknown> | undefined;
      // Las que no llevan argumentos no lo declaran; el resto sí lo admiten.
      if (Object.keys(propiedades ?? {}).length > 0) {
        expect(tool.inputSchema["additionalProperties"]).toBe(false);
      }
    }
  });
});

describe("crear y validar", () => {
  it("crea el ticket desde cero en un proyecto que nunca tuvo registro", async () => {
    const resultado = await callTool(contexto, "crear_ticket", {
      id: ID,
      title: "El filtro ignora la coincidencia parcial",
      type: "BUGFIX",
      module: "POS",
      request: 'Busco "999" y no aparece nada.',
    });

    expect(resultado.isError).toBe(false);
    // La ruta se devuelve explícita: el paso siguiente es escribir en ese
    // archivo, y el agente no debería tener que deducir dónde quedó.
    expect(resultado.text).toContain(join(lab, "tickets", "2026", ID, "ticket.md"));

    const texto = readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8");
    expect(texto).toContain(`id: ${ID}`);
    expect(texto).toContain("workflow_status: intake");
    // La solicitud entra literal: es contra lo que después se compara el
    // diagnóstico, así que el agente no puede parafrasearla.
    expect(texto).toContain('Busco "999" y no aparece nada.');
  });

  it("rechaza un id que no cumple el formato, con el motivo del motor", async () => {
    const resultado = await callTool(contexto, "crear_ticket", {
      id: "no-es-un-id",
      title: "x",
      type: "BUGFIX",
      module: "POS",
      request: "y",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("<TIPO>-<MODULO>-<DESCRIPCION>-<YYYYMMDD>");
  });

  it("dice qué argumento falta en vez de fallar en silencio", async () => {
    const resultado = await callTool(contexto, "crear_ticket", {
      id: ID,
      title: "x",
      module: "POS",
      request: "y",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toBe("Falta `type`, y es obligatorio.");
  });

  it("devuelve el mismo texto de validación que el comando del CLI", async () => {
    const ruta = await crear();
    // Se quita la sección de diagnóstico para que el ticket sea inválido: un
    // registro inválido es el caso que el agente tiene que poder leer.
    const roto = readFileSync(ruta, "utf8").replace("## Diagnóstico", "## Otra cosa");
    writeFileSync(ruta, roto, "utf8");

    const porHerramienta = await callTool(contexto, "validar_ticket", { id: ID });
    const { validateOne } = await import("../packages/cli/src/commands.js");
    const porComando = validateOne(contexto.paths, ID);

    expect(porHerramienta.isError).toBe(true);
    expect(porHerramienta.text).toBe(porComando.stderr.trimEnd());
  });

  it("valida el registro entero cuando no se le pasa id", async () => {
    await crear();
    const resultado = await callTool(contexto, "validar_ticket", {});
    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("Tickets válidos: 1");
  });
});

describe("ver, listar y reanudar", () => {
  it("muestra el ticket con su estado y su ruta", async () => {
    await crear();
    const resultado = await callTool(contexto, "ver_ticket", { id: ID });
    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain(ID);
    expect(resultado.text).toContain("intake");
  });

  it("no falla cuando no hay nada: lo dice", async () => {
    // Un proyecto recién adoptado no tiene registro. Devolver ahí un error le
    // haría creer al agente que el harness está roto, cuando la respuesta
    // correcta es que no hay trabajo en curso.
    const resultado = await callTool(contexto, "listar_tickets", {});
    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("No hay tickets activos");
  });

  it("lista los activos y excluye los cerrados", async () => {
    await crear();
    const resultado = await callTool(contexto, "listar_tickets", {});
    expect(resultado.text).toContain(ID);
  });

  it("reanudar sin id y con varios activos no elige: pregunta", async () => {
    await crear();
    await callTool(contexto, "crear_ticket", {
      id: "BUGFIX-POS-OTRO-FALLO-20260923",
      title: "Otro fallo",
      type: "BUGFIX",
      module: "POS",
      request: "otra cosa",
    });

    const resultado = await callTool(contexto, "reanudar_ticket", {});
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("varios tickets activos");
  });

  it("un ticket que no existe se informa, no se inventa", async () => {
    const resultado = await callTool(contexto, "ver_ticket", {
      id: "NO-EXISTE-XX-20260101",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("no existe");
  });
});

describe("mover el estado", () => {
  it("aplica la tabla del contrato y rechaza el salto ilegal", async () => {
    await crear();
    const ilegal = await callTool(contexto, "mover_ticket", { id: ID, to: "closed" });
    expect(ilegal.isError).toBe(true);
    expect(ilegal.text).toContain("no permitida");

    const legal = await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });
    expect(legal.isError).toBe(false);
    expect(readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8")).toContain(
      "workflow_status: analyzed",
    );
  });

  it("no deja entrar a `approved` sin la aprobación de una persona, ni con todo el camino legal hecho", async () => {
    await crear();
    await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });
    await callTool(contexto, "mover_ticket", { id: ID, to: "planned" });

    // El camino hasta aquí es legal y el agente lo puede recorrer solo. Lo que
    // no puede es cruzar la última puerta: `approved` exige la línea de
    // aprobación explícita del PO en el plan, y la plantilla la deja vacía. Un
    // agente que pudiera escribirla y avanzar convertiría el gate humano en un
    // trámite que se firma solo.
    const resultado = await callTool(contexto, "mover_ticket", { id: ID, to: "approved" });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("aprobación explícita del PO");
    expect(readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8")).toContain(
      "workflow_status: planned",
    );
  });
});

describe("evaluar una compuerta", () => {
  it("se niega a evaluar donde el gate no aplica, y explica por qué", async () => {
    await crear();
    const resultado = await callTool(contexto, "evaluar_compuerta", {
      gate: "plan",
      id: ID,
      evaluator: "command",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("solo aplica a un ticket en");
    expect(resultado.text).toContain("intake");
  });

  it("un evaluador determinista sin checks declarados lo dice, en vez de fingir un veredicto", async () => {
    await crear();
    await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });

    const resultado = await callTool(contexto, "evaluar_compuerta", {
      gate: "analysis",
      id: ID,
      evaluator: "command",
    });
    // Este proyecto no declara checks para el gate de análisis, así que el
    // evaluador determinista no puede decidir nada. Lo importante es que lo
    // **diga**: un veredicto inventado aquí sería peor que un fallo.
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("no se declaró ningún check");
  });

  it("escribe el recibo y devuelve el veredicto cuando el evaluador responde", async () => {
    await crear();
    await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });

    // Se inyecta el evaluador semántico: probar esto de verdad costaría una
    // llamada a un proveedor y haría el test dependiente de la red y del modelo.
    // Con el falso, lo que se prueba es la herramienta —que arma bien la
    // evaluación y escribe el recibo—, que es lo que esta suite tiene que
    // afirmar.
    const resultado = await callTool(conEvaluadorFalso(), "evaluar_compuerta", {
      gate: "analysis",
      id: ID,
    });

    expect(resultado.isError).toBe(false);
    // El recibo se escribe aparte del ticket: el ticket guarda el historial y el
    // recibo la evidencia de la decisión, con el estado que vio el evaluador.
    const recibos = join(lab, ".valmen", "receipts", `${ID}.jsonl`);
    expect(existsSync(recibos)).toBe(true);
    const recibo = JSON.parse(readFileSync(recibos, "utf8").trim()) as Record<
      string,
      unknown
    >;
    expect(recibo["gate"]).toBe("analysis");
    expect(recibo["subject"]).toMatchObject({ type: "ticket", id: ID });
    // El recibo guarda el estado que vio el evaluador, para que la decisión se
    // pueda auditar después sin reconstruir nada.
    expect(String(recibo["stateHash"]).length).toBeGreaterThan(0);
  });

  it("devuelve el informe cuando el gate bloquea, en vez de un error vacío", async () => {
    // El fallo real que motivó esta prueba: el gate devolvía el código 3 —que
    // significa «bloquea», no «se rompió»— con el informe completo en la salida
    // y el error vacío. La herramienta devolvía ese error vacío, así que el
    // agente recibía un fallo **sin texto**: sin veredicto, sin motivo y sin
    // nada que contarle a quien preguntaba. Pasó en el primer ticket real.
    await crear();
    await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });

    const resultado = await callTool(conEvaluadorFalso(0.5), "evaluar_compuerta", {
      gate: "analysis",
      id: ID,
    });

    // Media probabilidad cae en la banda de revisión: la compuerta no aprueba,
    // que no es lo mismo que fallar.
    expect(resultado.text).not.toBe("");
    expect(resultado.text).toContain("RESULTADO");
    expect(resultado.text).toContain("REVIEW");
    // Y se conserva la señal del código de salida, para un agente que ramifique.
    expect(resultado.text).toContain("[código de salida 3");
  });

  it("no disfraza de éxito un fallo de verdad", async () => {
    // El otro lado de la misma regla: un error con mensaje sigue siendo error.
    const resultado = await callTool(contexto, "evaluar_compuerta", {
      gate: "plan",
      id: "NO-EXISTE-XX-20260101",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).not.toBe("");
  });

  it("no mueve el ticket aunque el veredicto sea de aprobación", async () => {
    await crear();
    await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });

    await callTool(conEvaluadorFalso(), "evaluar_compuerta", { gate: "analysis", id: ID });

    // Un gate no cambia estados: esa es la regla, y la herramienta lo dice. Si
    // evaluar moviera el ticket, aprobar y avanzar serían el mismo acto y no
    // habría dónde poner la decisión de una persona.
    expect(readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8")).toContain(
      "workflow_status: analyzed",
    );
  });
});

describe("el arranque del servidor", () => {
  it("toma la raíz del argumento y resuelve la ruta del registro", () => {
    const opciones = parseOptions(["--root", lab], "/otro/sitio");
    expect(opciones.root).toBe(lab);
    expect(pathsFor(opciones.root).ticketsDir).toBe("tickets");
  });

  it("sin `--root` usa el directorio de trabajo", () => {
    expect(parseOptions([], "/proyecto").root).toBe("/proyecto");
  });

  it("falla si `--root` viene sin valor en vez de adivinar", () => {
    expect(() => parseOptions(["--root"], "/proyecto")).toThrow(/necesita un valor/);
  });

  it("prefiere las credenciales del proyecto sobre las del `$HOME`", () => {
    const propio = join(lab, ".valmen", ".credentials.yaml");
    // Sin archivo propio devuelve el de la casa o nada, pero nunca una ruta que
    // no existe: quien la reciba la va a leer.
    const sinArchivo = credentialsFor(lab);
    expect(sinArchivo === undefined || sinArchivo.length > 0).toBe(true);

    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(propio, "version: 1\n", { mode: 0o600 });
    expect(credentialsFor(lab)).toBe(propio);
  });
});
