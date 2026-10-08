/**
 * Las plantillas del harness en `AGENTS.md`, compactas.
 *
 * El `AGENTS.md` se carga entero en cada sesión, y 15 464 B de los de SaiOpenCloud
 * eran las tres plantillas fijas del harness: texto igual en todo proyecto, la
 * mitad procedimiento que solo se consulta al hacer una fase concreta. Lo que estas
 * pruebas protegen son las dos mitades del reparto:
 *
 * - **lo que frena una acción se queda en la plantilla**, que es lo único que un
 *   agente sin skills llega a leer: las acciones que nunca se automatizan, los pasos
 *   de «Continuar un ticket», el límite del modo directo y las reglas de entrega;
 * - **lo que se mueve llega a su skill publicada**, con un puntero de una línea que
 *   la nombra: estados y verificación de criterios en `planificacion`, marcado de
 *   criterios y consumo de IA en `revision-final`, recorrido de feature en `feature`.
 *
 * Y el tope: un tope de bytes que nadie comprueba se vuelve a llenar en el siguiente
 * ticket que «solo agrega un párrafo».
 *
 * Ver `docs/07-ADAPTADORES.md` §6.5.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { publicadas, versionPublicada } from "../packages/adapter/src/skills.js";
import {
  DELIVERY_TEMPLATE,
  INVARIANTS_TEMPLATE,
  WORKFLOW_TEMPLATE,
} from "../packages/adapter/src/templates.js";

/** El repositorio del harness: el catálogo se lee de ahí, no de un proyecto. */
const REPO = process.cwd();

/**
 * Tope de las tres plantillas juntas, en bytes. Eran 15 464 B; el borrador compacto
 * medido pesa 9 162 B y el tope deja el margen de las frases que otras pruebas fijan. Subió de 9 400 a
 * 9 800 B con R-QAAG-009, que agrega dos reglas de QA por agente (unos 420 B), y a
 * 10 400 B con la sección «Corrida orquestada» (569 B medidos; decisión del PO).
 * Por qué: la sesión que orquesta una corrida solo puede cumplir el contrato si lo lee en AGENTS.md.
 */
const TOPE_BYTES = 10400;

/** Texto sin saltos de línea ni espacios repetidos: se afirma la frase, no dónde corta el renglón. */
const plano = (texto: string): string => texto.replace(/\s+/g, " ");

const workflow = plano(WORKFLOW_TEMPLATE);
const delivery = plano(DELIVERY_TEMPLATE);

const skill = (id: string): string =>
  plano(readFileSync(join(REPO, "skills", id, "SKILL.md"), "utf8"));

describe("el tope de las plantillas fijas", () => {
  it("suman 10 400 B o menos, desde 15 464 B", () => {
    const bytes = [WORKFLOW_TEMPLATE, INVARIANTS_TEMPLATE, DELIVERY_TEMPLATE]
      .map((plantilla) => Buffer.byteLength(plantilla, "utf8"))
      .reduce((suma, tamano) => suma + tamano, 0);

    expect(bytes, `las plantillas pesan ${bytes} B y el tope es ${TOPE_BYTES} B`).toBeLessThanOrEqual(
      TOPE_BYTES,
    );
  });
});

describe("la corrida orquestada", () => {
  const inicio = workflow.indexOf("### Corrida orquestada");
  const seccion = inicio < 0 ? "" : workflow.slice(inicio).split(" ### ")[0] ?? "";

  const afirma = (nombre: string, patron: RegExp): void => {
    it(nombre, () => {
      expect(seccion, "la plantilla no tiene la sección «Corrida orquestada»").not.toBe("");
      expect(seccion).toMatch(patron);
    });
  };

  afirma("se pide en la sesión, con 3 a la vez por defecto", /ejecuta el feature X.*N a la vez.*3 por defecto/);
  afirma("la sesión es el orquestador y lanza un subagente por ticket", /sesión es el orquestador.*un subagente por ticket/);
  afirma("cada subagente trabaja en su worktree y su rama", /cada uno en su worktree y su rama/);
  afirma("solo el orquestador toca el checkout principal", /Solo el orquestador toca el checkout principal/);
  afirma("el subagente corre las pruebas de su ticket, no la suite completa", /pruebas de su ticket, no la suite completa/);
  afirma("la aprobación sale de la política por tipo de ticket", /política por tipo de ticket.*autorización vigente.*elegible/);
  afirma("SECURITY y despliegue son siempre de una persona", /SECURITY y despliegue son siempre de una persona/);

  it("control: no nombra git push, --force ni --no-verify", () => {
    expect(seccion).not.toBe("");
    for (const prohibido of ["git push", "--force", "--no-verify"]) {
      expect(seccion).not.toContain(prohibido);
    }
  });
});

describe("lo que frena una acción se queda en la plantilla", () => {
  it("nombra cada una de las siete acciones que nunca se automatizan", () => {
    const acciones: readonly (readonly [string, RegExp])[] = [
      ["aprobar un despliegue a producción", /despliegue a producción/i],
      ["crear un tag de release publicado", /tag de release publicado/i],
      ["force-push", /force-push/i],
      ["reset destructivo", /reset destructivo/i],
      ["borrar tags", /borrar tags/i],
      ["ampliar la autoridad de edición", /autoridad de edición/i],
      ["marcar QA como eximida", /QA como eximida/i],
      ["modificar el gate que lo evalúa", /el gate que lo evalúa/i],
      ["modificar credenciales", /credenciales/i],
      ["hosts permitidos", /hosts permitidos/i],
    ];

    for (const [nombre, patron] of acciones) {
      expect(workflow, `«Acciones que nunca se automatizan» no nombra: ${nombre}`).toMatch(patron);
    }
    expect(workflow).toContain("### Acciones que nunca se automatizan");
    expect(workflow, "estas acciones se preparan, no se ejecutan sin una persona").toMatch(
      /ejecutan? una persona/i,
    );
  });

  it("declara la QA por agente como vía de entrega y su autorización como acción humana (R-QAAG-009)", () => {
    expect(delivery, "«Entrega y documentación» no dice que un agente puede ejecutar la QA").toMatch(/La QA puede ejecutarla un agente/);
    expect(delivery).toMatch(/autorización vigente que creó una persona/);
    expect(delivery).toMatch(/sombra/);
    expect(delivery).toMatch(/sin autorización vigente, la QA es de una persona/i);
    const acciones = workflow.slice(workflow.indexOf("### Acciones que nunca se automatizan"));
    expect(acciones).toMatch(/autorización permanente de QA por agente/);
    expect(acciones).toMatch(/promover la política a cerrar tickets/);
    expect(acciones).toMatch(/sin herramienta MCP/);
  });

  it("conserva los tres pasos de «Continuar un ticket» y no toca el código sin `approved`", () => {
    expect(workflow).toContain("### Continuar un ticket");
    expect(workflow, "primer paso: reanudar_ticket").toContain("`reanudar_ticket`");
    expect(workflow, "segundo paso: repetir con el siguiente paso").toMatch(
      /volver a llamarla|volver a llamar/i,
    );
    expect(workflow, "tercer paso: detenerse en el primer alto sin superarlo").toMatch(
      /primer \*\*alto\*\*/,
    );
    expect(workflow, "un alto no se supera").toMatch(/Un alto no se supera/);
    expect(workflow).toContain("`approved`");
    expect(workflow).toContain("**el código de la aplicación no se toca**");
  });

  it("conserva el límite del modo directo sobre un proyecto real y quién decide el ticket", () => {
    expect(workflow).toContain("**El modo directo no relaja los gates de impacto.**");
    expect(workflow).toContain("aplicar **sobre un proyecto real**");
    expect(workflow).toContain("**La persona, no el agente.**");
  });

  it("conserva cada regla de entrega que hoy declara", () => {
    expect(delivery).toContain("contrato de pruebas");
    expect(delivery).toContain("`awaiting_user_tests`");
    expect(delivery).toContain("Los commits se crean solo tras la confirmación");
    expect(delivery).toMatch(/consumo de IA queda registrado antes de cerrar/i);
    expect(delivery, "sin consumo el motor rechaza el cierre").toMatch(/el motor rechaza el cierre/i);
    expect(delivery).toMatch(/una sesión por ticket/i);
    expect(delivery).toContain("`valmen secrets`");
    expect(delivery).toContain("`valmen:allow-secret`");
    expect(delivery).toContain("No se mezclan tickets en un commit");
    expect(delivery).toContain("`git add -A`");
    expect(delivery).toContain("`- [x]`");
  });
});

describe("lo que sale de la plantilla deja un puntero a su skill", () => {
  it("nombra `planificacion`, `feature` y `revision-final` donde el detalle salió", () => {
    expect(workflow, "estados y verificación de criterios → planificacion").toMatch(
      /skill `planificacion`/,
    );
    expect(workflow, "recorrido de feature → feature").toMatch(/skill `feature`/);
    expect(delivery, "marcado de criterios y consumo de IA → revision-final").toMatch(
      /skill `revision-final`/,
    );
  });

  it("apunta solo a skills que el harness publica", () => {
    const ids = new Set(publicadas().map((publicada) => publicada.id));
    const nombradas = [...workflow.matchAll(/skill `([a-z-]+)`/g), ...delivery.matchAll(/skill `([a-z-]+)`/g)]
      .map((coincidencia) => coincidencia[1] as string);

    expect(nombradas.length).toBeGreaterThan(0);
    for (const id of nombradas) {
      expect(ids.has(id), `la plantilla manda a la skill «${id}» y el catálogo no la publica`).toBe(true);
    }
  });
});

describe("el detalle que sale llega a su skill publicada", () => {
  it("`planificacion` 1.2.0 trae los estados y la verificación de criterios", () => {
    const texto = skill("planificacion");

    expect(versionPublicada("planificacion")).toBe("1.2.0");
    expect(texto).toContain("## Estados del ticket");
    expect(texto).toContain("intake → analyzed → planned → approved → in_progress");
    expect(texto, "máquina del punto").toContain("point:");
    expect(texto, "máquina de la release").toContain("release:");
    expect(texto).toContain("`completed`");
    expect(texto).toContain("## Cómo se verifica un criterio");
    expect(texto).toContain("<!-- test:");
    expect(texto).toContain("verify: manual");
    expect(texto).toContain("`qa-mechanical`");
    expect(texto).toContain("`test-commands`");
    expect(texto).toContain("`test-timeout`");
  });

  it("`revision-final` trae las reglas de la fuente del consumo de IA", () => {
    const texto = skill("revision-final");

    expect(versionPublicada("revision-final")).toBe("1.3.0");
    expect(texto).toContain("## El consumo de IA se registra antes de cerrar");
    for (const prefijo of ["`opencode:`", "`hermes:`", "`codex:`", "`claude:`", "`manual:`", "`process:`"]) {
      expect(texto, `falta el prefijo ${prefijo}`).toContain(prefijo);
    }
    expect(texto, "la sesión que sirvió varios tickets").toMatch(/varios\*\* tickets|varios tickets/);
    expect(texto).toMatch(/una sesión por ticket/i);
  });

  it("`feature` conserva el recorrido que la plantilla dejó de repetir", () => {
    const texto = skill("feature");

    for (const comando of [
      "valmen feature new",
      "valmen feature decompose",
      "valmen feature materialize",
    ]) {
      expect(texto, `la skill feature no trae «${comando}»`).toContain(comando);
    }
    expect(workflow, "la plantilla ya no repite el recorrido").not.toContain(
      "valmen feature materialize",
    );
  });

  it("`revision-final` sigue diciendo que los criterios verificados se marcan", () => {
    expect(skill("revision-final")).toContain("## Los criterios se marcan");
  });
});
