/**
 * Los impactos: de la declaración a la pregunta.
 *
 * Un ticket que toca la migración y un bugfix de una línea no son el mismo
 * riesgo, y durante mucho tiempo el harness los evaluó igual: los impactos vivían
 * en el frontmatter, el check que decía comprobarlos **siempre pasaba**, y el
 * evaluador nunca supo que el cambio tocaba la base de datos. Estas pruebas
 * cubren las dos mitades: que la declaración y el diagnóstico no puedan
 * contradecirse, y que un impacto declarado llegue al gate como una pregunta
 * concreta.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildGateState, runMechanicalChecks } from "../packages/engine/src/state.js";
import { ANALYSIS_GATE, PLAN_GATE, gateFor } from "../packages/gate/src/index.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-impactos-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

/** El texto de un ticket con los impactos y el diagnóstico que pida el test. */
function ticket(options: {
  readonly impacts?: readonly string[];
  readonly diagnostico?: string;
}): string {
  return renderFixtureTicket({
    id: TICKET,
    workflowStatus: "analyzed",
    ...(options.impacts === undefined ? {} : { impacts: options.impacts }),
    ...(options.diagnostico === undefined ? {} : { diagnostico: options.diagnostico }),
  });
}

/** La línea de impactos del contrato, con el valor que se le pase. */
function diagnosticoCon(valor: string, continuacion?: string): string {
  return [
    "- Archivos y flujo investigados: `BackEnd/pos/filters.py`, que define el filtro.",
    "- Causa raíz o hipótesis: el lookup compara por igualdad exacta.",
    "- Riesgos y compatibilidad: ninguno relevante.",
    `- Impactos de sync, migración, Docker o despliegue: ${valor}`,
    ...(continuacion === undefined ? [] : [`  ${continuacion}`]),
  ].join("\n");
}

/** El check de impactos, que es el que se afirma. */
function check(texto: string): ReturnType<typeof runMechanicalChecks>[number] {
  const encontrado = runMechanicalChecks(texto).find(
    (candidato) => candidato.id === "impactos_declarados",
  );
  if (encontrado === undefined) throw new Error("El check de impactos no se ejecutó.");
  return encontrado;
}

describe("el check de impactos declarados", () => {
  it("pasa cuando el diagnóstico explica el impacto que el frontmatter marca", () => {
    const resultado = check(
      ticket({
        impacts: ["migration_impact"],
        diagnostico: diagnosticoCon(
          "hay migración: la tabla `orders` cambia y hay que revertirla.",
        ),
      }),
    );

    expect(resultado.result).toBe("pass");
    expect(resultado.detail).toContain("migración");
  });

  it("falla cuando el frontmatter declara un impacto y el diagnóstico dice que no hay ninguno", () => {
    // La contradicción que importa: el registro dice que toca la base de datos y
    // el propio ticket lo niega. Una de las dos cosas es falsa, y el evaluador no
    // puede preguntar por un impacto que el ticket desmiente.
    const resultado = check(
      ticket({ impacts: ["migration_impact"], diagnostico: diagnosticoCon("ninguno.") }),
    );

    expect(resultado.result).toBe("fail");
    expect(resultado.detail).toContain("dice que no hay ninguno");
  });

  it("no bloquea cuando el diagnóstico no los nombra uno por uno, pero lo deja dicho", () => {
    // La diferencia se aprendió mirando el registro real: un ticket de release
    // dice «aplican los cuatro» y es una declaración coherente. Exigir la palabra
    // del contrato castigaba la forma de escribirlo, no un hueco. La señal queda
    // en el detalle, que es lo que la pantalla muestra.
    const resultado = check(
      ticket({
        impacts: ["migration_impact"],
        diagnostico: diagnosticoCon("afecta la base de datos del cliente."),
      }),
    );

    expect(resultado.result).toBe("pass");
    expect(resultado.detail).toContain("no lo nombra uno por uno");
  });

  it("acepta «aplican los cuatro», que es como lo escribió un ticket real", () => {
    // Texto literal de `INTEGRATION-RELEASE-6-2-4-20260904`: la regla estricta lo
    // bloqueaba y el ticket tenía razón.
    const resultado = check(
      ticket({
        impacts: ["sync_impact", "migration_impact", "docker_impact"],
        diagnostico: diagnosticoCon(
          "aplican los cuatro; no se asume estado de AWS, imágenes ni hosts sin evidencia actual.",
        ),
      }),
    );

    expect(resultado.result).toBe("pass");
  });

  it("falla cuando la línea del contrato está sin rellenar", () => {
    // La plantilla la deja vacía. Antes eso pasaba sin más y el hueco llegaba
    // hasta la compuerta; ahora se ve en el código, antes de gastar una llamada.
    const resultado = check(ticket({ diagnostico: diagnosticoCon("") }));

    expect(resultado.result).toBe("fail");
    expect(resultado.detail).toContain("sin rellenar");
  });

  it("falla cuando el diagnóstico no tiene la línea", () => {
    const resultado = check(
      ticket({
        diagnostico: [
          "- Archivos y flujo investigados: `BackEnd/pos/filters.py`.",
          "- Causa raíz o hipótesis: el lookup es exacto.",
          "- Riesgos y compatibilidad: ninguno.",
        ].join("\n"),
      }),
    );

    expect(resultado.result).toBe("fail");
    expect(resultado.detail).toContain("no tiene la línea");
  });

  it("pasa sin impactos cuando el diagnóstico dice que no hay ninguno", () => {
    const resultado = check(ticket({ diagnostico: diagnosticoCon("Ninguno.") }));
    expect(resultado.result).toBe("pass");
    expect(resultado.detail).toBe("sin impactos");
  });

  it("lee la explicación que continúa en la línea siguiente", () => {
    // Una explicación de impacto no siempre cabe en un renglón, y el contrato
    // permite continuarla indentada. Exigirla en la misma línea sería castigar el
    // formato en vez del contenido.
    const resultado = check(
      ticket({
        impacts: ["docker_impact"],
        diagnostico: diagnosticoCon("", "hay que reconstruir el contenedor del POS."),
      }),
    );

    expect(resultado.result).toBe("pass");
    expect(resultado.detail).toContain("contenedores");
  });

  it("no confunde «ninguno» con una frase que menciona la palabra", () => {
    // «No hay impacto de sync; el despliegue va aparte» es una explicación
    // honesta y no puede leerse como «no hay ninguno»: la frase empieza negando
    // una dimensión, no todas.
    const resultado = check(
      ticket({
        impacts: ["migration_impact"],
        diagnostico: diagnosticoCon(
          "no hay impacto de sync; sí hay migración que revertir.",
        ),
      }),
    );

    expect(resultado.result).toBe("pass");
  });

  it("una prosa que menciona más de lo que se declara no bloquea", () => {
    // La asimetría es deliberada: bloquear aquí castigaría a quien explicó de
    // más. Los impactos que el frontmatter declara son los que generan preguntas.
    const resultado = check(
      ticket({
        diagnostico: diagnosticoCon(
          "no hay impacto de sync ni de Docker; solo de despliegue.",
        ),
      }),
    );

    expect(resultado.result).toBe("pass");
    expect(resultado.detail).toContain("declara");
  });
});

describe("los impactos llegan al evaluador", () => {
  it("el estado que ve el modelo los nombra", () => {
    // Además de generar proposiciones propias, el impacto va en el estado: un
    // evaluador que responde por los criterios tiene que saber que este cambio
    // toca la migración, o contesta lo mismo que para un bugfix de una línea.
    const estado = buildGateState(
      ticket({
        impacts: ["sync_impact", "migration_impact"],
        diagnostico: diagnosticoCon("hay sync y migración."),
      }),
    );

    expect(estado["impactos"]).toBe("sincronización, migración");
    expect(
      buildGateState(ticket({ diagnostico: diagnosticoCon("ninguno.") }))["impactos"],
    ).toBe("ninguno");
  });

  it("cada impacto declarado se despliega como una proposición del plan", () => {
    const expandido = gateFor(PLAN_GATE, {
      criteria: [],
      impacts: ["migration_impact"],
    });

    const ids = expandido.propositions.map((proposition) => proposition.id);
    expect(ids).toContain("migration_impact");
    // Y la proposición dice qué falta, no «el impacto está bien considerado»:
    // eso no se puede computar.
    const proposicion = expandido.propositions.find((p) => p.id === "migration_impact");
    expect(proposicion?.instructions).toContain("cómo se revierte");
    // La compuerta deja constancia de que se expandió por impacto.
    expect(expandido.id).toBe("plan+impactos");
  });

  it("el orden de las proposiciones es el del contrato, no el de la llamada", () => {
    // Dos tickets con los mismos impactos tienen que producir el mismo recibo,
    // sin importar en qué orden se declararon en el frontmatter.
    const expandido = gateFor(PLAN_GATE, {
      criteria: [],
      impacts: ["docker_impact", "sync_impact"],
    });

    const ids = expandido.propositions.map((proposition) => proposition.id);
    expect(ids.indexOf("sync_impact")).toBeLessThan(ids.indexOf("docker_impact"));
  });

  it("la compuerta de análisis no los despliega: protege el estado anterior al plan", () => {
    const expandido = gateFor(ANALYSIS_GATE, {
      criteria: [],
      impacts: ["migration_impact"],
    });

    expect(expandido.propositions.map((proposition) => proposition.id)).not.toContain(
      "migration_impact",
    );
    expect(expandido.id).toBe("analysis");
  });

  it("sin impactos, la expansión sigue siendo la de criterios", () => {
    // La garantía de que esto no cambió lo que ya funcionaba: el identificador
    // del gate expandido por criterios es el mismo de antes.
    const expandido = gateFor(PLAN_GATE, {
      criteria: [
        { text: 'Buscar "104" devuelve la orden "1042".', command: null, manual: true },
      ],
      impacts: [],
    });

    expect(expandido.id).toBe("plan+criterios");
    expect(expandido.propositions.map((p) => p.id)).toContain("criterio_01");
    expect(expandido.propositions.map((p) => p.id)).not.toContain("migration_impact");
  });

  it("un identificador que el contrato no conoce no se despliega", () => {
    const expandido = gateFor(PLAN_GATE, { criteria: [], impacts: ["lo_que_sea"] });
    expect(expandido.id).toBe("plan");
  });

  it("los dos despliegues conviven y cada uno aporta lo suyo", () => {
    const expandido = gateFor(PLAN_GATE, {
      criteria: [
        { text: 'Buscar "104" devuelve la orden "1042".', command: null, manual: true },
      ],
      impacts: ["migration_impact"],
    });

    const ids = expandido.propositions.map((proposition) => proposition.id);
    expect(ids).toContain("criterio_01");
    expect(ids).toContain("migration_impact");
    expect(expandido.id).toBe("plan+criterios+impactos");
  });
});

describe("un ticket de migración sobrevive al paso por el disco", () => {
  it("el fixture declara los impactos que se le piden", () => {
    // El generador de tickets tiene que poder declararlos, o cada test de
    // impactos tendría que reescribir el frontmatter a mano.
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "analyzed",
      impacts: ["migration_impact"],
    });
    const texto = renderFixtureTicket({ id: TICKET, impacts: ["migration_impact"] });
    expect(texto).toContain("migration_impact: true");
    expect(texto).toContain("sync_impact: false");
  });
});
