/**
 * Generador de tickets mínimos y válidos para los tests.
 *
 * Existe porque los gates tienen **precondición de estado**: el gate de plan
 * solo aplica a un ticket en `planned`, y los 57 tickets reales del fixture
 * están todos cerrados. Mutar uno real para forzar el estado no funciona: el
 * validador rechaza la incoherencia histórica resultante, y con razón.
 *
 * Construir el ticket desde cero es además más honesto: el test declara
 * exactamente el sujeto que necesita, sin depender del contenido de un ticket
 * de producción que puede cambiar.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { parseTicket } from "../../packages/core/src/index.js";
import { hashDelPlan } from "../../packages/engine/src/plan-approval.js";
import { join } from "node:path";

/** Campos que un test puede querer variar. */
export interface FixtureTicketOptions {
  readonly id: string;
  readonly workflowStatus?: string;
  readonly riskLevel?: string;
  readonly type?: string;
  readonly module?: string;
  readonly title?: string;
  readonly plan?: string;
  readonly criterios?: string;
  readonly diagnostico?: string;
  readonly releaseStatus?: string;
  /**
   * Los impactos que el ticket declara, por su identificador del contrato:
   * `sync_impact`, `migration_impact`, `docker_impact`.
   *
   * Existe porque los impactos dejaron de ser decorativos: el check mecánico
   * compara esta declaración con la línea del diagnóstico, y la compuerta de plan
   * despliega una proposición por cada uno. Un test de impactos necesita
   * declararlos, y hacerlo con un `replace` sobre el texto generado sería escribir
   * el caso dos veces.
   */
  readonly impacts?: readonly string[];
  /**
   * El estado de QA del frontmatter.
   *
   * Hace falta para construir un ticket en `qa_approved`: el validador exige que
   * `qa_status` acompañe al estado del workflow, y un ticket aprobado con la QA en
   * `pending` es una incoherencia —con razón—.
   */
  readonly qaStatus?: string;
  readonly targetRelease?: string;
  readonly releasedIn?: string;
  /**
   * El contrato de pruebas de `## Pruebas`. Sin él queda el marcador de pendiente, que es lo que
   * deja un ejecutor que no entregó el contrato (R-JORN-005).
   */
  readonly pruebas?: string;
  /**
   * Si el ticket lleva la aprobación del plan **registrada** (el evento `plan-approved` con el hash
   * del plan). Por defecto sí en `approved` e `in_progress`: desde R-CTRL-001 un ticket no llega a
   * esos estados sin ella, y la elegibilidad del run autónomo la exige. Pasar `false` deja un
   * ticket cuyo plan solo dice «aprobado» en el texto.
   */
  readonly aprobacionRegistrada?: boolean;
}

/**
 * Construye el texto de un ticket válido en el estado pedido.
 *
 * Las secciones que no aplican a un ticket temprano se dejan vacías y con su
 * bloque JSON en `[]`, que es lo que el contrato espera.
 */
export function renderFixtureTicket(options: FixtureTicketOptions): string {
  const estado = options.workflowStatus ?? "planned";
  const registrada = options.aprobacionRegistrada ?? (estado === "approved" || estado === "in_progress");
  if (!registrada) return renderBase(options, "");
  // El hash del plan no depende de los eventos: se calcula sobre la versión sin el evento.
  const hash = hashDelPlan(parseTicket(renderBase(options, "")));
  const evento = `,
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-21",
    "at": "2026-09-21T12:00:00.000Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": ${JSON.stringify(JSON.stringify({ actor: "Juan Andrade", source: "cli", quote: "Apruebo el plan (fixture)", planHash: hash }))}
  }`;
  return renderBase(options, evento);
}

function renderBase(options: FixtureTicketOptions, eventoExtra: string): string {
  const {
    id,
    workflowStatus = "planned",
    riskLevel = "normal",
    type = "BUGFIX",
    module = "POS",
    title = "El filtro de órdenes no encuentra por número parcial",
    plan = [
      "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).",
      "- Pasos ordenados:",
      "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number` de `exact` a `icontains`.",
      "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
      "  3. Verificar con `npx vitest run` que el término enviado no requiere normalización.",
      "- Rollback: revertir el cambio de una línea y retirar las pruebas añadidas.",
    ].join("\n"),
    // Cada criterio declara cómo se verifica: la revisión previa de la compuerta del plan
    // corta, antes del evaluador, un criterio sin anotación (R-CPRE-008).
    criterios = [
      '- [ ] Buscar "104" devuelve la orden "1042".\n      <!-- verify: manual -->',
      '- [ ] Buscar "1042" sigue devolviendo la orden "1042".\n      <!-- verify: manual -->',
      '- [ ] Buscar "999" no devuelve resultados.\n      <!-- verify: manual -->',
      "- [ ] El cliente que consulta con el número exacto sigue recibiendo su resultado.\n      <!-- verify: manual -->",
    ].join("\n"),
    diagnostico = [
      "- Archivos y flujo investigados: `BackEnd/pos/filters.py` define `OrderFilter.number` con `lookup_expr='exact'`; `OrderFilter` se aplica desde el ViewSet de órdenes.",
      "- Causa raíz o hipótesis: el `lookup_expr` es exacto cuando la pantalla documenta búsqueda parcial, así que el backend descarta las coincidencias parciales antes de devolver el listado.",
      "- Riesgos y compatibilidad: cambiar el lookup a `icontains` amplía el conjunto de resultados. Un cliente que consulte con el número exacto sigue recibiendo su resultado.",
      "- Impactos de sync, migración, Docker o despliegue: ninguno.",
    ].join("\n"),
    impacts = [],
    qaStatus = "pending",
    releaseStatus = "unreleased",
    targetRelease = "null",
    releasedIn = "null",
  } = options;

  // Las secciones deben emitirse en el orden canónico exacto: el parser exige
  // que la secuencia de encabezados sea idéntica a la del contrato, así que un
  // generador que las agrupe por tipo produce un ticket que no parsea.
  const vacio = (seccion: string): string => `## ${seccion}\n\n\`\`\`json\n[]\n\`\`\`\n`;

  return `---
schema_version: 1
id: ${id}
title: ${title}
type: ${type}
module: ${module}
workflow_status: ${workflowStatus}
qa_status: ${qaStatus}
release_status: ${releaseStatus}
user_visible: true
sync_impact: ${impacts.includes("sync_impact")}
migration_impact: ${impacts.includes("migration_impact")}
docker_impact: ${impacts.includes("docker_impact")}
risk_level: ${riskLevel}
created: 2026-09-21
updated: 2026-09-21
related_ticket: null
target_release: ${targetRelease}
released_in: ${releasedIn}
---

# ${id}

## Solicitud original

El filtro de órdenes del POS no encuentra la orden cuando busco por número. Si escribo el número exacto aparece, pero si escribo parte del número no encuentra nada.

## Descripción funcional

- Alcance: la búsqueda por número en el listado de órdenes del POS.
- Usuario o rol afectado: cajero y administrador de sucursal.
- Comportamiento actual: solo encuentra con el número exacto.
- Comportamiento esperado: encuentra por número parcial.

## Diagnóstico

${diagnostico}

## Plan

${plan}

## Criterios de aceptación

${criterios}

${vacio("Puntos")}
## Implementación

Pendiente.

## Pruebas

${options.pruebas ?? "Pendiente de ejecución."}

${vacio("QA")}
${vacio("Evidencia")}
${vacio("Retests")}
${vacio("Cierre")}
${vacio("Consumo de IA")}
## Release

Sin publicar todavía.

## Eventos

\`\`\`json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-21",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }${eventoExtra}
]
\`\`\`
`;
}

/**
 * Escribe un ticket de prueba en el registro y devuelve su identificador.
 *
 * El año del directorio se toma de los cuatro dígitos finales del id, que es lo
 * que el contrato espera.
 */
export function writeFixtureTicket(root: string, options: FixtureTicketOptions): string {
  const year = options.id.slice(-8, -4);
  const directory = join(root, "tickets", year, options.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "ticket.md"), renderFixtureTicket(options), "utf8");
  return options.id;
}
