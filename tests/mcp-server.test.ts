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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { spawnSync } from "node:child_process";

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

  // El proyecto declara qué comandos puede ejecutar como verificación: sin esa
  // lista, el gate mecánico no corre nada —el comando sale del ticket, y el
  // ticket lo escribe quien el gate controla—.
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    "name: Laboratorio\ntest-commands:\n  - node\n",
    "utf8",
  );
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

/**
 * Escribe un diagnóstico real en el ticket.
 *
 * Desde que el check mecánico de impactos comprueba de verdad, un ticket con la
 * línea de impactos sin rellenar **no llega al evaluador**: la compuerta se
 * detiene antes. Es lo que le pasa a un ticket de verdad, y el check no distingue
 * un test de un proyecto — así que el test escribe el ticket como lo escribiría
 * una persona.
 */
function escribirDiagnostico(ruta: string): void {
  const texto = readFileSync(ruta, "utf8");
  const cuerpo = [
    "- Archivos y flujo investigados: `BackEnd/pos/filters.py` define `OrderFilter.number` con `lookup_expr='exact'`.",
    "- Causa raíz o hipótesis: el lookup es exacto cuando la pantalla documenta búsqueda parcial.",
    "- Riesgos y compatibilidad: ampliar el conjunto de resultados; un cliente que consulte el número exacto sigue recibiéndolo.",
    "- Impactos de sync, migración, Docker o despliegue: ninguno.",
  ].join("\n");
  writeFileSync(
    ruta,
    texto.replace(/(## Diagnóstico\n\n)[\s\S]*?(?=\n## )/, `$1${cuerpo}\n`),
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
    expect(nombres.filter((nombre) => /aprob|approve/.test(nombre))).toEqual([]);
  });

  it("toda herramienta que emite un veredicto de persona exige sus palabras", () => {
    // Esta prueba empezó prohibiendo la sílaba `decid` en los nombres, y eso
    // confundía la propiedad con su ortografía: `decidir_estandar` decide un
    // estándar, no una compuerta, y lo hace **con la frase de la persona**
    // citada. Lo que no se puede perder no es una lista de nombres: es que un
    // agente no pueda emitir un veredicto reservado sin esa frase. Se afirma
    // sobre el esquema, que es lo que el cliente obliga a mandar, y sobre los
    // tres casos que existen hoy, para que agregar uno sin sus palabras falle
    // acá en vez de fallar en un proyecto real.
    const conVeredicto = ["cerrar_qa", "preparar_cierre", "decidir_estandar"];
    expect(TOOLS.map((tool) => tool.name)).toEqual(expect.arrayContaining(conVeredicto));

    for (const nombre of conVeredicto) {
      const tool = TOOLS.find((candidata) => candidata.name === nombre);
      expect(tool, `falta ${nombre}`).toBeDefined();
      const propiedades = Object.keys(
        (tool?.inputSchema["properties"] ?? {}) as Record<string, unknown>,
      );
      expect(
        propiedades.some((clave) => clave === "confirmacion_po" || clave === "instruccion"),
        `${nombre} no declara las palabras de quien decide`,
      ).toBe(true);
    }

    // Y la única que decide sin condiciones —un estándar se acepta o no, no hay
    // resultado que lo exima— las exige en `required`.
    const estandar = TOOLS.find((tool) => tool.name === "decidir_estandar");
    expect(estandar?.inputSchema["required"]).toContain("instruccion");
  });

  it("declara las treinta y dos herramientas, cada una con descripción y esquema", () => {
    // El orden es el de la lectura: alta, consulta, validación, movimiento,
    // anotación, compuertas, features, procesos, reportes, y al final el ciclo de
    // QA y el cierre. Estaba intercalado por historia —cada herramienta nueva
    // entraba donde se pudiera— y leer el catálogo costaba más de lo que debería.
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "crear_ticket",
      "ver_ticket",
      "listar_tickets",
      "validar_ticket",
      "mover_ticket",
      "anotar_punto",
      "mover_punto",
      "anotar_evidencia",
      "reanudar_ticket",
      "evaluar_compuerta",
      "simular_compuerta",
      "ver_features",
      "descomponer_feature",
      "ver_procesos",
      "estado_proceso",
      "ejecutar_proceso",
      "reporte_cierres",
      "calibrar_compuerta",
      "manifiesto_entrega",
      "indexar_registro",
      "revisar_secretos",
      "reporte_consumo",
      "buscar_memoria",
      "guardar_aprendizaje",
      "ver_estandares",
      "proponer_estandar",
      "decidir_estandar",
      "revisar_presentacion",
      "iniciar_qa",
      "anotar_retest",
      "cerrar_qa",
      "preparar_cierre",
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
    expect(conEsquema).toEqual([
      "ver_ticket",
      "listar_tickets",
      "evaluar_compuerta",
      "reporte_consumo",
    ]);
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
    escribirDiagnostico(ruta);
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
    escribirDiagnostico(ruta);
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
    escribirDiagnostico(ruta);
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
    escribirDiagnostico(ruta);
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
    escribirDiagnostico(ruta);
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

// ── El ciclo entero, sin terminal ───────────────────────────────────────────

const SHA = "a".repeat(40);

/**
 * Un evaluador falso que aprueba, con el vocabulario de cada compuerta.
 *
 * Las dos usan una proposición `clasificacion`, pero no comparten las
 * opciones: la de análisis aprueba con `completa` y la de plan con `completo`.
 * Un evaluador que contestara lo mismo en las dos haría fallar la segunda, y el
 * fallo se leería como si el ciclo estuviera roto.
 */
function evaluadorQueApruebaCon(eleccion: string): NonNullable<ToolContext["jev"]> {
  return async (options: { propositions?: readonly { id: string }[] }) => ({
    answers: (options.propositions ?? []).map((proposition) =>
      proposition.id === "clasificacion"
        ? {
            id: proposition.id,
            kind: "choice" as const,
            choice: eleccion,
            rationale: "falso",
          }
        : { id: proposition.id, kind: "noul" as const, value: 0.95, rationale: "falso" },
    ),
    model: {
      provider: "falso",
      model: "para-pruebas",
      resolvedVersion: "falso/para-pruebas@0",
    },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: 1,
  });
}

/** El paso, con el nombre y el mensaje del motor si falla. */
async function paso(
  ctx: ToolContext,
  nombre: string,
  args: Record<string, unknown>,
): Promise<void> {
  const resultado = await callTool(ctx, nombre, args);
  expect(resultado.isError, `${nombre}: ${resultado.text}`).toBe(false);
}

/**
 * Escribe una sección del ticket.
 *
 * Es lo que hace el agente con su editor: las secciones son prosa, y una
 * herramienta que las escribiera sería una herramienta que redacta el
 * diagnóstico en vez de una que obliga a investigarlo.
 */
function escribir(ruta: string, seccion: string, contenido: string): void {
  const texto = readFileSync(ruta, "utf8");
  const patron = new RegExp(`(## ${seccion}\\n\\n)[\\s\\S]*?(?=\\n## )`);
  if (!patron.test(texto)) throw new Error(`El ticket no tiene la sección ${seccion}.`);
  writeFileSync(ruta, texto.replace(patron, `$1${contenido}\n`), "utf8");
}

/** Lo mínimo que un ticket necesita para poder aprobarse. */
function escribirContenido(ruta: string): void {
  escribir(
    ruta,
    "Diagnóstico",
    [
      "- Archivos y flujo investigados: `BackEnd/pos/filters.py` define `OrderFilter.number` con `lookup_expr='exact'`; el ViewSet de órdenes lo aplica al listado.",
      "- Causa raíz o hipótesis: el lookup es exacto cuando la pantalla documenta búsqueda parcial, así que el backend descarta las coincidencias parciales.",
      "- Riesgos y compatibilidad: ampliar el conjunto de resultados. Un cliente que consulte el número exacto sigue recibiendo su resultado.",
      "- Impactos de sync, migración, Docker o despliegue: ninguno.",
    ].join("\n"),
  );
  escribir(
    ruta,
    "Plan",
    [
      "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).",
      "- Pasos ordenados:",
      "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number` de `exact` a `icontains`.",
      "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
      "- Rollback: revertir el cambio de una línea y retirar la prueba añadida.",
    ].join("\n"),
  );
  escribir(
    ruta,
    "Criterios de aceptación",
    '- [ ] Buscar "104" devuelve la orden "1042".\n' +
      "      <!-- verify: manual -->\n" +
      '- [ ] Buscar "999" no devuelve resultados.\n' +
      "      <!-- verify: manual -->",
  );
}

/** El ticket implementado y con el resultado del PO registrado: listo para QA. */
async function hastaInQa(): Promise<string> {
  const ruta = await crear();
  escribirContenido(ruta);
  await paso(contexto, "validar_ticket", { id: ID });
  await paso(contexto, "mover_ticket", { id: ID, to: "analyzed" });
  await paso(contexto, "mover_ticket", { id: ID, to: "planned" });
  await paso(contexto, "mover_ticket", { id: ID, to: "approved" });
  await paso(contexto, "mover_ticket", { id: ID, to: "in_progress" });
  escribir(ruta, "Pruebas", "- Resultado del PO: probado en la sucursal y conforme.");
  // La verificación mecánica es precondición de la entrega. Acá los criterios
  // declaran verificación manual, así que el gate no corre nada y deja constancia.
  await paso(contexto, "evaluar_compuerta", { gate: "qa-mechanical", id: ID });
  await paso(contexto, "mover_ticket", { id: ID, to: "awaiting_user_tests" });
  await paso(contexto, "mover_ticket", { id: ID, to: "in_qa" });
  return ruta;
}

/** El ticket cerrado con QA aprobada, que es el estado del que se reabre. */
async function hastaCerrado(): Promise<string> {
  const ruta = await hastaInQa();
  await paso(contexto, "iniciar_qa", {
    id: ID,
    ambiente: "local, macOS, Node 24",
    referencia: `commit:${SHA}`,
  });
  await paso(contexto, "cerrar_qa", {
    id: ID,
    resultado: "approved",
    confirmacion_po: "Conforme",
  });
  await paso(contexto, "mover_ticket", { id: ID, to: "qa_approved" });
  await paso(contexto, "preparar_cierre", {
    id: ID,
    resumen_tecnico: "El lookup pasó de exacto a parcial.",
    resumen_funcional: "El cajero encuentra la orden escribiendo parte del número.",
    qa: "approved",
    impacto_release: "Queda unreleased hasta el próximo despliegue.",
  });
  await paso(contexto, "mover_ticket", { id: ID, to: "closed" });
  return ruta;
}

describe("el ciclo entero del ticket", () => {
  it("llega de `intake` a `closed` sin pasar por la terminal", async () => {
    const ruta = await crear();
    escribirContenido(ruta);

    // Planificar y aprobar: cada compuerta con su vocabulario, y la aprobación
    // que ya está escrita en el plan por quien la dio.
    await paso(contexto, "validar_ticket", { id: ID });
    await paso(contexto, "mover_ticket", { id: ID, to: "analyzed" });
    await paso(
      { paths: contexto.paths, jev: evaluadorQueApruebaCon("completa") },
      "evaluar_compuerta",
      { gate: "analysis", id: ID },
    );
    await paso(contexto, "mover_ticket", { id: ID, to: "planned" });
    await paso(
      { paths: contexto.paths, jev: evaluadorQueApruebaCon("completo") },
      "evaluar_compuerta",
      { gate: "plan", id: ID },
    );
    await paso(contexto, "mover_ticket", { id: ID, to: "approved" });
    await paso(contexto, "mover_ticket", { id: ID, to: "in_progress" });

    // El trabajo: un hallazgo, su evidencia, y el punto recorriendo su ciclo.
    await paso(contexto, "anotar_punto", {
      id: ID,
      title: "El listado ignora las sucursales inactivas",
      severity: "high",
      actual: "Con el filtro `999` el endpoint contesta 200 y una lista vacía.",
      expected: "Debe devolver la orden 1042.",
    });
    await paso(contexto, "anotar_evidencia", {
      id: ID,
      kind: "automated-test",
      description: "`npx vitest run tests/filtros.test.ts`: 12 pruebas, todas en verde.",
      punto: "POINT-001",
    });
    for (const estado of ["analyzed", "in_progress", "awaiting_retest"]) {
      await paso(contexto, "mover_punto", { id: ID, punto: "POINT-001", to: estado });
    }

    // La entrega exige la verificación mecánica, y acá uno de los criterios
    // declara un test de verdad —uno que corre y pasa—, así que el camino que se
    // recorre es el de los comandos y no el de los criterios manuales.
    escribir(
      ruta,
      "Criterios de aceptación",
      '- [ ] Buscar "104" devuelve la orden "1042".\n' +
        '      <!-- test: node -e "process.exit(0)" -->\n' +
        '- [ ] Buscar "999" no devuelve resultados.\n' +
        "      <!-- verify: manual -->",
    );
    await paso(contexto, "evaluar_compuerta", { gate: "qa-mechanical", id: ID });

    escribir(
      ruta,
      "Pruebas",
      "- Resultado del PO: lo probé en la sucursal y ahora encuentra por número parcial.",
    );
    await paso(contexto, "mover_ticket", { id: ID, to: "awaiting_user_tests" });
    await paso(contexto, "mover_ticket", { id: ID, to: "in_qa" });

    // El ciclo de QA: se abre, se retestea el punto y se cierra con la frase de
    // quien aprobó. Ninguna de las tres la decide el agente.
    await paso(contexto, "iniciar_qa", {
      id: ID,
      ambiente: "local, macOS, Node 24, datos de la sucursal 3",
      referencia: `commit:${SHA}`,
    });
    await paso(contexto, "anotar_retest", {
      id: ID,
      punto: "POINT-001",
      resultado: "approved",
      confirmacion_po: "Sí, ya lo probé y quedó bien",
    });
    await paso(contexto, "mover_punto", { id: ID, punto: "POINT-001", to: "closed" });
    await paso(contexto, "cerrar_qa", {
      id: ID,
      resultado: "approved",
      confirmacion_po: "Aprobado, quedó bien",
    });
    await paso(contexto, "mover_ticket", { id: ID, to: "qa_approved" });
    await paso(contexto, "preparar_cierre", {
      id: ID,
      resumen_tecnico: "El lookup pasó de exacto a parcial.",
      resumen_funcional: "El cajero encuentra la orden escribiendo parte del número.",
      qa: "approved",
      impacto_release: "Queda unreleased hasta el próximo despliegue.",
    });
    await paso(contexto, "mover_ticket", { id: ID, to: "closed" });

    // El registro, que es lo que queda cuando la conversación se pierde.
    const ticket = parseTicket(readFileSync(ruta, "utf8"));
    expect(ticket.fields.workflow_status).toBe("closed");
    expect(ticket.fields.qa_status).toBe("approved");
    expect(ticket.blocks.QA).toHaveLength(2);
    expect(ticket.blocks.Retests).toHaveLength(1);
    expect(ticket.blocks.Cierre).toHaveLength(1);
    const puntos = ticket.blocks.Puntos as readonly Record<string, unknown>[];
    expect(puntos[0]?.["status"]).toBe("closed");
  });

  it("reabrir un ticket cerrado exige decir qué apareció", async () => {
    const ruta = await hastaCerrado();

    // Sin motivo no se reabre: la arista hacia atrás existe para registrar un
    // hallazgo, y un hallazgo sin texto no se puede retomar después.
    const sinMotivo = await callTool(contexto, "mover_ticket", {
      id: ID,
      to: "changes_requested",
    });
    expect(sinMotivo.isError).toBe(true);
    expect(sinMotivo.text).toContain("reason");

    const conMotivo = await callTool(contexto, "mover_ticket", {
      id: ID,
      to: "changes_requested",
      motivo: "Apareció un caso que el ticket no documentaba: sucursales inactivas.",
    });
    expect(conMotivo.isError).toBe(false);
    const ticket = parseTicket(readFileSync(ruta, "utf8"));
    expect(ticket.fields.workflow_status).toBe("changes_requested");
  });

  it("un ticket ya publicado no se reabre: el ciclo termina y empieza otro", async () => {
    // La regla del responsable, y la del motor: una release publicada no se
    // despublica, así que un hallazgo posterior va a un ticket nuevo.
    const ruta = await hastaCerrado();
    const publicado = readFileSync(ruta, "utf8")
      .replace("release_status: unreleased", "release_status: released")
      .replace("released_in: null", "released_in: 1.0.0")
      .replace("target_release: null", "target_release: 1.0.0");
    writeFileSync(ruta, publicado, "utf8");

    const resultado = await callTool(contexto, "mover_ticket", {
      id: ID,
      to: "changes_requested",
      motivo: "Un hallazgo posterior al despliegue.",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("unreleased");
  });

  it("la aprobación de QA exige las palabras de quien aprobó", async () => {
    await hastaInQa();
    const resultado = await callTool(contexto, "cerrar_qa", {
      id: ID,
      resultado: "approved",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("confirmación explícita del PO");
  });

  it("un ciclo de QA no se abre fuera de `in_qa`, ni sin saber qué se probó", async () => {
    const ruta = await crear();
    escribirContenido(ruta);
    await paso(contexto, "mover_ticket", { id: ID, to: "analyzed" });
    await paso(contexto, "mover_ticket", { id: ID, to: "planned" });
    await paso(contexto, "mover_ticket", { id: ID, to: "approved" });
    await paso(contexto, "mover_ticket", { id: ID, to: "in_progress" });

    // Fuera de `in_qa` no hay ciclo que abrir, y el motivo lo dice el motor.
    const fuera = await callTool(contexto, "iniciar_qa", {
      id: ID,
      ambiente: "local",
      referencia: `commit:${SHA}`,
    });
    expect(fuera.isError).toBe(true);
    expect(fuera.text).toContain("in_qa");

    // Y una referencia que no dice qué código se probó no vale.
    const suelta = await callTool(contexto, "iniciar_qa", {
      id: ID,
      ambiente: "local",
      referencia: "mi máquina",
    });
    expect(suelta.isError).toBe(true);
  });

  it("un punto terminal exige motivo, y un salto imposible se rechaza", async () => {
    await crear();
    await paso(contexto, "anotar_punto", {
      id: ID,
      title: "Un hallazgo",
      severity: "low",
      actual: "Pasa esto.",
      expected: "Debería pasar lo otro.",
    });

    // `verified` no se puede forzar: exige un retest aprobado y confirmado.
    const salto = await callTool(contexto, "mover_punto", {
      id: ID,
      punto: "POINT-001",
      to: "verified",
    });
    expect(salto.isError).toBe(true);

    const sinMotivo = await callTool(contexto, "mover_punto", {
      id: ID,
      punto: "POINT-001",
      to: "not_reproducible",
    });
    expect(sinMotivo.isError).toBe(true);
    expect(sinMotivo.text).toContain("reason");

    const conMotivo = await callTool(contexto, "mover_punto", {
      id: ID,
      punto: "POINT-001",
      to: "not_reproducible",
      motivo: "El caso que describía ya no se reproduce con los datos actuales.",
    });
    expect(conMotivo.isError).toBe(false);
  });
});

// ── Los archivos del punto ──────────────────────────────────────────────────

describe("los archivos que declara un punto", () => {
  /** Un laboratorio versionado: el hash de `worktree` exige que git los conozca. */
  function versionar(): void {
    for (const args of [
      ["init", "-q", "."],
      ["config", "user.email", "prueba@valmen.local"],
      ["config", "user.name", "Prueba"],
    ]) {
      spawnSync("git", args, { cwd: lab, stdio: "ignore" });
    }
  }

  function archivo(relativa: string, contenido: string): void {
    mkdirSync(join(lab, relativa, ".."), { recursive: true });
    writeFileSync(join(lab, relativa), contenido, "utf8");
  }

  it("los guarda en el punto, y con ellos la referencia sin commitear se calcula", async () => {
    versionar();
    archivo("BackEnd/pos/filters.py", "lookup_expr = 'icontains'\n");
    spawnSync("git", ["add", "."], { cwd: lab, stdio: "ignore" });

    // El punto se anota con el ticket ya en `in_qa`, que es cuando el hash se
    // pide: lo que entra en él es lo que los puntos declaren en ese momento.
    const ruta = await hastaInQa();
    await paso(contexto, "anotar_punto", {
      id: ID,
      title: "El listado ignora las sucursales inactivas",
      severity: "high",
      actual: "Con el filtro `999` devuelve una lista vacía.",
      expected: "Debe devolver la orden 1042.",
      archivos: ["BackEnd/pos/filters.py"],
    });

    const ticket = parseTicket(readFileSync(ruta, "utf8"));
    const puntos = ticket.blocks.Puntos as readonly Record<string, unknown>[];
    expect(puntos[0]?.["affected_files"]).toEqual(["BackEnd/pos/filters.py"]);

    // El hash describe el contenido de esos archivos, así que existe aunque el
    // trabajo no sea todavía un commit — que es para lo que estaba.
    await paso(contexto, "iniciar_qa", {
      id: ID,
      ambiente: "local, macOS, Node 24",
      referencia: "worktree",
    });
    const conQa = parseTicket(readFileSync(ruta, "utf8"));
    const ciclos = conQa.blocks.QA as readonly Record<string, unknown>[];
    expect(ciclos[0]?.["build_reference"]).toMatch(/^worktree:sha256:[0-9a-f]{64}$/);
  });

  it("rechaza una ruta que el contrato no admite, con el motivo", async () => {
    await crear();
    const resultado = await callTool(contexto, "anotar_punto", {
      id: ID,
      title: "Un hallazgo",
      severity: "low",
      actual: "Pasa esto.",
      expected: "Debería pasar lo otro.",
      archivos: ["/etc/passwd"],
    });

    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("no canónica");
  });
});

// ── Lo que el motor ya sabía hacer ──────────────────────────────────────────

describe("features, procesos y reportes", () => {
  /** Un comando de verdad, sin depender del shell. */
  const comando = (texto: string) => `node -e "process.stdout.write('${texto}')"`;

  /** Un proyecto con un proceso que se detiene en un gate a mitad de camino. */
  function escribirProceso(): void {
    mkdirSync(join(lab, ".valmen", "processes"), { recursive: true });
    mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "gates", "deploy.yaml"),
      "id: deploy\ntitle: Aprobación\n",
    );
    writeFileSync(
      join(lab, ".valmen", "processes", "saludar.yaml"),
      [
        "id: saludar",
        "title: Saludar con aprobación",
        "params:",
        "  nombre: { type: string, required: true }",
        "steps:",
        "  - id: eco",
        "    title: Escribir el saludo",
        "    kind: command",
        `    run: ${comando("hola")}`,
        "  - id: aprobacion",
        "    title: Aprobación de una persona",
        "    kind: gate",
        "    gate: deploy",
        "  - id: despues",
        "    title: Lo que va después del gate",
        "    kind: command",
        `    run: ${comando("despues")}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  it("lista las features y dice cuando no hay ninguna", async () => {
    const vacio = await callTool(contexto, "ver_features", {});
    expect(vacio.isError).toBe(false);

    const { featureNew } = await import("../packages/cli/src/features.js");
    expect(featureNew(lab, "demo", "Una feature de prueba").exitCode).toBe(0);

    const lista = await callTool(contexto, "ver_features", {});
    expect(lista.text).toContain("demo");

    const detalle = await callTool(contexto, "ver_features", { slug: "demo" });
    expect(detalle.text).toContain("Una feature de prueba");
  });

  it("mover un proceso inexistente lo dice, en vez de fallar sin motivo", async () => {
    const resultado = await callTool(contexto, "ver_procesos", { proceso: "no-existe" });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("no-existe");
  });

  it("lista y muestra los procesos declarados", async () => {
    escribirProceso();
    const lista = await callTool(contexto, "ver_procesos", {});
    expect(lista.text).toContain("saludar");

    const detalle = await callTool(contexto, "ver_procesos", { proceso: "saludar" });
    expect(detalle.text).toContain("aprobacion");
  });

  it("correr un proceso se detiene en el gate, y eso es un resultado y no un error", async () => {
    escribirProceso();
    const resultado = await callTool(contexto, "ejecutar_proceso", {
      proceso: "saludar",
      parametros: { nombre: "Juan" },
    });

    // Que se detenga es lo que tiene que pasar: el gate existe para eso. Un
    // agente que lo leyera como error intentaría «arreglar» lo que está bien.
    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("se detuvo esperando");
    // Y el avance de los pasos, que en el CLI se ve al vuelo, viaja en el texto.
    expect(resultado.text).toContain("eco");

    const corridas = await callTool(contexto, "estado_proceso", {});
    expect(corridas.text).toContain("saludar");
  });

  it("no escribe nada en stdout, porque stdout es el protocolo", async () => {
    // El avance de los pasos se imprimía directo a stdout: desde el CLI es lo
    // correcto, y desde acá metería un renglón suelto entre dos mensajes
    // JSON-RPC, que rompe la sesión del agente con un síntoma que no dice nada
    // de la causa. Se afirma sobre el espía y no sobre la intención.
    escribirProceso();
    const espia = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const resultado = await callTool(contexto, "ejecutar_proceso", {
        proceso: "saludar",
        parametros: { nombre: "Juan" },
      });
      expect(resultado.isError).toBe(false);
    } finally {
      espia.mockRestore();
    }
    expect(espia).not.toHaveBeenCalled();
  });

  it("el reporte de cierres y el índice leen el registro sin tocarlo", async () => {
    await hastaCerrado();
    const reporte = await callTool(contexto, "reporte_cierres", {});
    expect(reporte.isError).toBe(false);
    expect(reporte.text).toContain("Tickets cerrados");

    const indice = await callTool(contexto, "indexar_registro", {});
    expect(indice.isError).toBe(false);
    expect(existsSync(join(lab, "tickets", "index.md"))).toBe(true);

    // `comprobar` no escribe: dice si está al día.
    const comprobado = await callTool(contexto, "indexar_registro", { comprobar: true });
    expect(comprobado.isError).toBe(false);
    expect(comprobado.text).toContain("actualizado");

    // La deriva que esto repara no viene del motor —cada mutación reescribe el
    // índice—, sino de lo que pasa por fuera: un archivo copiado a mano, una
    // operación interrumpida, alguien que editó el índice. Se reproduce así.
    const rutaIndice = join(lab, "tickets", "index.md");
    writeFileSync(rutaIndice, `${readFileSync(rutaIndice, "utf8")}| basura |\n`, "utf8");
    const desactualizado = await callTool(contexto, "indexar_registro", {
      comprobar: true,
    });
    expect(desactualizado.isError).toBe(true);
    expect(desactualizado.text).toContain("desactualizado");

    // Y regenerarlo lo arregla.
    const regenerado = await callTool(contexto, "indexar_registro", {});
    expect(regenerado.isError).toBe(false);
    expect(readFileSync(rutaIndice, "utf8")).not.toContain("basura");
  });

  it("el manifiesto exige la lista explícita y no publica nada", async () => {
    const sinLista = await callTool(contexto, "manifiesto_entrega", {
      version: "1.0.0",
      tickets: [],
      dry_run: true,
    });
    expect(sinLista.isError).toBe(true);
    expect(sinLista.text).toContain("explícita");
  });

  it("calibrar mide sobre el histórico sin gastar llamadas cuando no hay nada que medir", async () => {
    await crear();
    const resultado = await callTool(contexto, "calibrar_compuerta", {
      gate: "analysis",
      limite: 0,
    });
    expect(resultado.isError).toBe(false);
    expect(resultado.text.toLowerCase()).toContain("calibración");
  });
});
