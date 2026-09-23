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
  cpSync,
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

import { parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import { TOOLS, callTool } from "../packages/mcp/src/tools.js";
import type { ToolContext } from "../packages/mcp/src/tools.js";
import {
  credentialsFor,
  describe as describirServidor,
  parseOptions,
  pathsFor,
} from "../packages/mcp/src/main.js";
import { respuestaDeHerramienta } from "../packages/mcp/src/protocol.js";

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

/**
 * Escribe un criterio de aceptación real en el ticket.
 *
 * Hace falta porque la plantilla deja la casilla vacía y el check mecánico la
 * rechaza —con razón: un ticket sin criterios no se puede evaluar—. Un test que
 * quiera llegar al evaluador tiene que declarar el sujeto que el evaluador
 * necesita, igual que un ticket de verdad.
 */
function escribirCriterio(ruta: string, criterio: string): void {
  const texto = readFileSync(ruta, "utf8");
  writeFileSync(
    ruta,
    texto.replace(
      /## Criterios de aceptación\n\n- \[ \]/,
      `## Criterios de aceptación\n\n- [ ] ${criterio}`,
    ),
    "utf8",
  );
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

  it("declara las diez herramientas, cada una con descripción y esquema", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "crear_ticket",
      "ver_ticket",
      "listar_tickets",
      "anotar_punto",
      "anotar_evidencia",
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

  it("declara `root` en todos los esquemas, para que una sesión pueda apuntar a otro proyecto", () => {
    // Este test se llamaba así desde antes y **no comprobaba esto**: miraba
    // `additionalProperties` y pasaba en verde con el argumento sin declarar, que
    // es justo lo que decía cubrir. El `root` se leía en `main.ts` y no estaba en
    // ningún esquema, así que un cliente que validara rechazaba la llamada y el
    // agente concluía que no podía trabajar sobre otro repositorio. Un test cuyo
    // nombre afirma más de lo que hace es peor que no tenerlo.
    for (const tool of TOOLS) {
      const propiedades = tool.inputSchema["properties"] as
        Record<string, unknown> | undefined;
      expect(propiedades, `${tool.name} no declara properties`).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(propiedades ?? {}, "root"),
        `${tool.name} no declara root`,
      ).toBe(true);
    }
  });

  it("`root` es opcional en todas: volverlo obligatorio rompería a los clientes de hoy", () => {
    for (const tool of TOOLS) {
      const requeridos = tool.inputSchema["required"];
      if (Array.isArray(requeridos)) {
        expect(requeridos, `${tool.name} exige root`).not.toContain("root");
      }
    }
  });

  it("solo declara `outputSchema` donde el dato ya existe del lado del motor", () => {
    // El criterio, afirmado sobre el catálogo y no sobre la intención: devolver
    // contenido estructurado obliga a prometer una forma estable, y solo se
    // promete donde el dato **ya existe** —el frontmatter del ticket, las filas
    // que el motor proyecta para la pantalla, y el recibo de la compuerta—,
    // nunca donde habría que inventar una segunda representación del texto que
    // la herramienta ya devuelve.
    const conEsquema = TOOLS.filter((t) => t.outputSchema !== undefined).map((t) => t.name);
    expect(conEsquema).toEqual(["ver_ticket", "listar_tickets", "evaluar_compuerta"]);
  });

  it("los esquemas de salida están cerrados, para que la forma prometida sea una sola", () => {
    for (const tool of TOOLS) {
      if (tool.outputSchema === undefined) continue;
      expect(tool.outputSchema["type"]).toBe("object");
      expect(tool.outputSchema["additionalProperties"]).toBe(false);
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
    // No dice «no hay tickets activos» porque ahora también puede listar los
    // cerrados: lo que falta es el registro entero, y eso es lo que dice.
    expect(resultado.text).toContain("el registro todavía no existe");
    expect(resultado.data).toMatchObject({ total: 0, enElRegistro: 0 });
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
    const ruta = await crear();
    escribirCriterio(ruta, 'Buscar "104" devuelve la orden "1042".');
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
    const ruta = await crear();
    escribirCriterio(ruta, 'Buscar "104" devuelve la orden "1042".');
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
    const ruta = await crear();
    escribirCriterio(ruta, 'Buscar "104" devuelve la orden "1042".');
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
    const ruta = await crear();
    escribirCriterio(ruta, 'Buscar "104" devuelve la orden "1042".');
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

describe("el contenido estructurado", () => {
  it("`ver_ticket` devuelve el frontmatter como dato, con el parser del motor", async () => {
    await crear();
    const resultado = await callTool(contexto, "ver_ticket", { id: ID });

    expect(resultado.isError).toBe(false);
    expect(resultado.data).toBeDefined();
    expect(resultado.data?.["id"]).toBe(ID);
    expect(String(resultado.data?.["ruta"])).toContain(join("tickets", "2026", ID));

    // Los valores van tal cual están en disco. Si se normalizaran aquí habría dos
    // lecturas del mismo contrato, y la que se desincroniza es siempre la que
    // nadie mira.
    const campos = resultado.data?.["campos"] as Record<string, unknown>;
    expect(campos["workflow_status"]).toBe("intake");
    expect(campos["type"]).toBe("BUGFIX");
  });

  it("`evaluar_compuerta` devuelve el recibo que acaba de anexar, sin interpretar el informe", async () => {
    const ruta = await crear();
    escribirCriterio(ruta, 'Buscar "104" devuelve la orden "1042".');
    await callTool(contexto, "mover_ticket", { id: ID, to: "analyzed" });

    const resultado = await callTool(conEvaluadorFalso(), "evaluar_compuerta", {
      gate: "analysis",
      id: ID,
    });

    // El veredicto se lee del dato: un agente que ramifica por `outcome` no
    // debería tener que buscar la palabra en una tabla de texto.
    const recibo = resultado.data?.["recibo"] as Record<string, unknown> | null;
    expect(recibo).not.toBeNull();
    expect(recibo?.["gate"]).toBe("analysis");
    expect(recibo?.["subject"]).toMatchObject({ type: "ticket", id: ID });
  });

  it("las que no declaran `outputSchema` no devuelven dato", async () => {
    // El otro lado del criterio: mandar `structuredContent` sin esquema sería
    // entregar un objeto que el cliente no puede validar contra nada.
    await crear();
    const resultado = await callTool(contexto, "validar_ticket", { id: ID });
    expect(resultado.isError).toBe(false);
    expect(resultado.data).toBeUndefined();
  });

  it("`tools/call` emite `structuredContent` cuando hay dato, y lo omite cuando no", () => {
    const conDato = respuestaDeHerramienta({
      text: "informe",
      isError: false,
      data: { a: 1 },
    });
    expect(conDato["structuredContent"]).toEqual({ a: 1 });
    // El texto no se pierde: el informe del motor dice qué falta y con qué código
    // de salida, y el dato es para ramificar. Uno no sustituye al otro.
    expect(conDato["content"]).toEqual([{ type: "text", text: "informe" }]);

    const sinDato = respuestaDeHerramienta({ text: "informe", isError: false });
    expect("structuredContent" in sinDato).toBe(false);
  });
});

describe("el arranque del servidor", () => {
  it("la autocomprobación nombra los argumentos obligatorios de cada herramienta", () => {
    // La diferencia entre «no veo la herramienta» y «la veo y le falta un
    // argumento» es la diferencia entre revisar el cliente y revisar la llamada.
    // Adivinarla cuesta más que imprimirla.
    const salida = describirServidor({
      root: lab,
      credentialsFile: undefined,
      check: true,
    });
    expect(salida).toContain("crear_ticket(id, title, type, module, request)");
    expect(salida).toContain("evaluar_compuerta(gate, id)");
    // Las que no exigen nada se ven sin argumentos, y eso también informa.
    expect(salida).toContain("listar_tickets()");
  });

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

// ── Anotar lo que se encuentra mientras se trabaja ──────────────────────────

describe("anotar un hallazgo", () => {
  it("crea el punto con el identificador del motor y deja el ticket válido", async () => {
    const ruta = await crear();
    const resultado = await callTool(contexto, "anotar_punto", {
      id: ID,
      title: "El listado ignora las sucursales inactivas",
      severity: "high",
      actual: "Con el filtro `999` el endpoint contesta 200 y una lista vacía.",
      expected: "Debe devolver la orden 1042.",
    });

    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("POINT-001");

    // Que el bloque quede coherente lo dice el validador del contrato, no este
    // test: anotar por la herramienta tiene que dejar el ticket como lo dejaría
    // el comando, y eso solo lo puede afirmar quien valida.
    const validacion = await callTool(contexto, "validar_ticket", { id: ID });
    expect(validacion.isError).toBe(false);
    expect(readFileSync(ruta, "utf8")).toContain(
      "El listado ignora las sucursales inactivas",
    );
  });

  it("rechaza una gravedad fuera del contrato con el mensaje del motor", async () => {
    await crear();
    const resultado = await callTool(contexto, "anotar_punto", {
      id: ID,
      title: "Un hallazgo",
      severity: "urgentísimo",
      actual: "Pasa esto.",
      expected: "Debería pasar lo otro.",
    });

    expect(resultado.isError).toBe(true);
    // El mensaje se devuelve tal cual lo produjo el motor: parafrasearlo aquí le
    // quitaría al agente lo único que necesita para corregir.
    expect(resultado.text).toContain("severity no pertenece al esquema");
  });

  it("exige lo que exige el contrato: sin `expected` no hay punto", async () => {
    await crear();
    const resultado = await callTool(contexto, "anotar_punto", {
      id: ID,
      title: "Un hallazgo",
      severity: "high",
      actual: "Pasa esto.",
    });

    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("expected");
  });
});

describe("anotar evidencia", () => {
  /** El ticket con un punto ya anotado, que es el estado normal al probar algo. */
  async function conPunto(): Promise<string> {
    const ruta = await crear();
    await callTool(contexto, "anotar_punto", {
      id: ID,
      title: "El listado ignora las sucursales inactivas",
      severity: "high",
      actual: "Con el filtro `999` devuelve una lista vacía.",
      expected: "Debe devolver la orden 1042.",
    });
    return ruta;
  }

  it("enlaza la evidencia con el punto, que es lo que mantiene coherente el bloque", async () => {
    const ruta = await conPunto();
    const resultado = await callTool(contexto, "anotar_evidencia", {
      id: ID,
      kind: "automated-test",
      description: "`npx vitest run tests/filtros.test.ts`: 12 pruebas, todas en verde.",
      punto: "POINT-001",
    });

    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("EVIDENCE-001");

    // La coherencia del contrato exige que el punto declare sus evidencias: si
    // la herramienta anotara solo el bloque, el ticket quedaría inválido. Se
    // afirma sobre el dato, no sobre el texto del archivo.
    const ticket = parseTicket(readFileSync(ruta, "utf8"));
    const puntos = ticket.blocks.Puntos as readonly Record<string, unknown>[];
    expect(puntos[0]?.["evidence"]).toEqual(["EVIDENCE-001"]);
    const validacion = await callTool(contexto, "validar_ticket", { id: ID });
    expect(validacion.isError).toBe(false);
  });

  it("sin `punto`, la evidencia es del ticket y no se cuelga de ningún hallazgo", async () => {
    await crear();
    const resultado = await callTool(contexto, "anotar_evidencia", {
      id: ID,
      kind: "code-inspection",
      description: "Leí `BackEnd/pos/filters.py`: el lookup compara por igualdad exacta.",
    });

    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("EVIDENCE-001");
    const validacion = await callTool(contexto, "validar_ticket", { id: ID });
    expect(validacion.isError).toBe(false);
  });

  it("señala un punto que no existe en vez de inventarlo", async () => {
    await crear();
    const resultado = await callTool(contexto, "anotar_evidencia", {
      id: ID,
      kind: "build",
      description: "Build en verde.",
      punto: "POINT-007",
    });

    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("punto inexistente");
  });

  it("exige la forma del contrato en la referencia, que no es una ruta suelta", async () => {
    await crear();
    const resultado = await callTool(contexto, "anotar_evidencia", {
      id: ID,
      kind: "build",
      description: "Build en verde.",
      reference: "BackEnd/pos/filters.py",
    });

    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("commit:<sha40>");
  });
});

// ── Filtros de la lista ─────────────────────────────────────────────────────

describe("listar con filtros", () => {
  const FIXTURE = join(import.meta.dirname, "fixtures", "saicloud", "tickets");
  /** Los del fixture real: todos cerrados, que es lo que hace útil el contraste. */
  const CERRADOS = 57;
  const UN_CERRADO = "BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907";

  let registro: string;
  let ctx: ToolContext;

  beforeEach(() => {
    registro = mkdtempSync(join(tmpdir(), "valmen-mcp-lista-"));
    cpSync(FIXTURE, join(registro, "tickets"), { recursive: true });
    ctx = { paths: pathsFor(registro) };
  });

  afterEach(() => {
    rmSync(registro, { recursive: true, force: true });
  });

  it("sin filtros devuelve los activos, que es lo que devolvía antes de tenerlos", async () => {
    const resultado = await callTool(ctx, "listar_tickets", {});
    expect(resultado.isError).toBe(false);
    // El encabezado es lo que faltaba: sin él, «no hay nada» y «no encontré
    // nada» se ven igual.
    expect(resultado.text).toContain(`0 de ${CERRADOS} ticket(s).`);
    expect(resultado.text).toContain("No hay tickets activos.");
    expect(resultado.data).toMatchObject({ total: 0, enElRegistro: CERRADOS });
  });

  it("con un ticket en curso lo trae, y deja fuera los cerrados", async () => {
    const abierto = writeFixtureTicket(registro, {
      id: "BUGFIX-POS-ABIERTO-20260922",
      workflowStatus: "in_progress",
      module: "POS",
    });
    const resultado = await callTool(ctx, "listar_tickets", {});

    expect(resultado.text).toContain(`1 de ${CERRADOS + 1} ticket(s).`);
    expect(resultado.text).toContain(abierto);
    expect(resultado.text).not.toContain(UN_CERRADO);
  });

  it("`incluir_cerrados` los trae, y lo dice en el encabezado", async () => {
    const resultado = await callTool(ctx, "listar_tickets", { incluir_cerrados: true });
    expect(resultado.text).toContain(`de ${CERRADOS} ticket(s) — incluye cerrados.`);
    expect(resultado.text).toContain(UN_CERRADO);
    expect(resultado.data).toMatchObject({ total: CERRADOS, enElRegistro: CERRADOS });
  });

  it("combina tipo, módulo y texto sobre el registro entero", async () => {
    const porTipo = await callTool(ctx, "listar_tickets", {
      tipo: "SYNC",
      incluir_cerrados: true,
    });
    expect(porTipo.text).toContain("tipo=SYNC");
    // El tipo no se repite en la línea —va en el identificador, como en el CLI—,
    // así que se comprueba sobre el dato, que es de donde sale el filtro.
    const filas = porTipo.data?.["tickets"] as readonly { type: string }[];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((fila) => fila.type === "SYNC")).toBe(true);
    expect(porTipo.data).toMatchObject({ total: filas.length });

    const porTexto = await callTool(ctx, "listar_tickets", {
      texto: "reporte z",
      incluir_cerrados: true,
    });
    expect(porTexto.text).toContain(UN_CERRADO);

    const sinNada = await callTool(ctx, "listar_tickets", {
      modulo: "NO-EXISTE",
      incluir_cerrados: true,
    });
    expect(sinNada.text).toContain("Ningún ticket cumple el filtro.");
    expect(sinNada.data).toMatchObject({ total: 0 });
  });

  it("filtra por rango sobre la fecha de cierre, que es lo que se cuenta al reportar", async () => {
    const resultado = await callTool(ctx, "listar_tickets", {
      desde: "2026-09-07",
      hasta: "2026-09-07",
      fecha: "closedOn",
      incluir_cerrados: true,
    });

    expect(resultado.text).toContain("closedOn entre 2026-09-07 y 2026-09-07");
    expect(resultado.data).toMatchObject({ total: 1 });
  });

  it("un valor que no existe se contesta con los que sí, no con una lista vacía", async () => {
    // `estado: "cerrado"` devolvería cero tickets y se leería como «no hay
    // nada», que es la conclusión contraria a la verdad.
    const estado = await callTool(ctx, "listar_tickets", { estado: "cerrado" });
    expect(estado.isError).toBe(true);
    expect(estado.text).toContain("intake");
    expect(estado.text).toContain("closed");

    const orden = await callTool(ctx, "listar_tickets", { orden: "titulo" });
    expect(orden.isError).toBe(true);
    expect(orden.text).toContain("closedOn");
  });

  it("la línea avisa del impacto crítico, que cambia por dónde empezar", async () => {
    const resultado = await callTool(ctx, "listar_tickets", {
      solo_criticos: true,
      incluir_cerrados: true,
    });

    expect(resultado.text).toContain("solo con impacto crítico");
    // Todas las que salen lo declaran: el filtro y la señal no pueden discrepar.
    for (const linea of resultado.text.split("\n").slice(1)) {
      expect(linea).toContain("impacto crítico:");
    }
  });
});

describe("la lista avisa de lo que está a medias", () => {
  it("señala los puntos abiertos de cada ticket", async () => {
    await crear();
    await callTool(contexto, "anotar_punto", {
      id: ID,
      title: "El listado ignora las sucursales inactivas",
      severity: "critical",
      actual: "Con el filtro `999` devuelve una lista vacía.",
      expected: "Debe devolver la orden 1042.",
    });

    const resultado = await callTool(contexto, "listar_tickets", {});
    expect(resultado.text).toContain("1 punto(s) abierto(s)");
  });
});
