---
schema_version: 2
id: FEATURE-ENGINE-REANUDAR-COMPACTO-20260926
title: Añadir reanudación compacta determinista
type: FEATURE
module: ENGINE
workflow_status: in_qa
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-26
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-REANUDAR-COMPACTO-20260926

## Solicitud original

Parte del sprint: Reducir el costo de contexto y habilitar el enrutado y la consulta segura.
- R-S1-001: Reanudación compacta — `reanudar_ticket` DEBE ofrecer un modo compacto que entregue el estado del
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: añadir a `reanudar_ticket` un modo compacto determinista con el identificador, estados de workflow/QA/release, plan vigente, puntos abiertos resumidos con estado, último recibo de compuerta y guía para leer secciones completas bajo demanda; conservar el modo completo y usar compacto por defecto en MCP.
- Usuario o rol afectado: agentes que reanudan tickets mediante el servidor MCP y quienes usan `valmen resume`.
- Comportamiento actual: el MCP acepta solo `id` y devuelve un resumen breve sin plan, puntos abiertos ni recibo estructurado; el CLI mantiene una presentación separada.
- Comportamiento esperado: el motor proyecta el contexto desde el ticket y los recibos en disco sin invocar un modelo; MCP entrega esa estructura por defecto y permite solicitar el documento completo.

## Diagnóstico

- Archivos y flujo investigados: `packages/cli/src/commands.ts` selecciona el ticket y genera una salida limitada; `packages/mcp/src/tools.ts` define `reanudar_ticket` con solo `id` y delega al CLI; `packages/engine/src/receipts.ts` lee el historial append-only; `.valmen/features/evolucion-harness/spec/s1-costo-contexto/spec.md` y `design.md` definen el contrato. La auditoría `docs/auditoria-20260926/INFORME.md` identifica la recontextualización completa como causa del costo.
- Causa raíz o hipótesis: no existe una proyección canónica del contexto de reanudación en el motor ni un parámetro de modo en la herramienta MCP; cada cliente carece de los datos estructurados necesarios para recuperar solo el contexto activo.
- Riesgos y compatibilidad: conservar la selección ambigua actual cuando se omite `id`; conservar provenance de feature; no resumir con modelo ni reescribir el ticket; el modo completo devuelve el texto original íntegro.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: aprobado explícitamente por el PO, en sus palabras: «si dale» para arrancar el alcance y «yo apruebo que pase el plan» para esta compuerta.
- Pasos ordenados:
  1. Crear `packages/engine/src/resume.ts` con `buildResumeContext(paths, ticket, modo)` y `renderResumeContext(contexto)`, y exportarlo desde `packages/engine/src/index.ts`. La proyección se arma del ticket parseado y de `readReceipts`, sin llamar a ningún modelo.
  2. En `buildResumeContext`, llenar `status` con `workflow_status`, `qa_status` y `release_status` del frontmatter, y `plan` con la sección `## Plan` vigente recortada.
  3. En `buildResumeContext`, filtrar `blocks.Puntos` con la constante `ESTADOS_PUNTO_ABIERTO` (`open`, `analyzed`, `in_progress`, `awaiting_retest`) y proyectar cada punto a `{id, status, title, severity}`, descartando el resto del bloque.
  4. En `buildResumeContext`, tomar el último recibo de `.valmen/receipts/<id>.jsonl` y exponer `{id, gate, outcome, reason, decidedAt}` en `lastReceipt`, más `readInstruction` con la indicación de leer secciones completas con `ver_ticket`.
  5. Cambiar `resumeTicket` en `packages/cli/src/commands.ts` para aceptar `modo: compacto | completo` y devolver el contexto del motor; en `completo` conserva el texto íntegro del ticket.
  6. Declarar en `packages/mcp/src/tools.ts` el parámetro `modo` con valor por defecto `compacto`, el `outputSchema` cerrado y la validación del enum; el `case "reanudar_ticket"` emite el texto y el dato como `structuredContent`.
  7. Garantizar el determinismo como propiedad del motor, no de la prueba: `buildResumeContext` solo lee el ticket parseado y `.valmen/receipts/<id>.jsonl`, sin modelo, sin reloj y sin estado externo, así que dos llamadas sobre el mismo registro devuelven el mismo texto y el mismo dato.
  8. Añadir a `tests/mcp-server.test.ts` las pruebas que responden cada criterio: la prueba del resumen compacto cubre (a), (b), (c), (d) y (e) —incluida la repetición de la llamada—, y la del modo completo cubre su criterio; correr las pruebas focalizadas, `npm run build`, `npm run typecheck` y la suite completa.
- Compatibilidad hacia atrás: el resumen compacto es aditivo. El ticket no se reescribe, `ver_ticket` sigue devolviendo el documento íntegro, omitir `id` con varios activos sigue devolviendo la lista en vez de elegir, y la procedencia de feature se conserva en el resumen. Los archivos que el plan toca son los que el diagnóstico identificó —`packages/cli/src/commands.ts` y `packages/mcp/src/tools.ts`— más el módulo nuevo `packages/engine/src/resume.ts`; ningún consumidor existente pierde datos por adoptar el modo compacto.
- Rollback: revertir únicamente los cambios de implementación y pruebas de este ticket; conservar el historial del ticket y volver a dejarlo en `changes_requested` si ya se hubiera iniciado su ciclo de revisión.

## Criterios de aceptación

- [x] R-S1-001 (a): el modo compacto de `reanudar_ticket` devuelve el identificador del ticket y su estado de workflow, QA y release.
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto" -->
- [x] R-S1-001 (b): el modo compacto lista los puntos abiertos con identificador, estado, título y severidad.
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto" -->
- [x] R-S1-001 (c): el modo compacto incluye el plan vigente, el último recibo de compuerta y la instrucción de leer secciones completas bajo demanda.
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto" -->
- [x] R-S1-001 (d): `compacto` es el modo por defecto del servidor MCP cuando la llamada no declara `modo`.
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto" -->
- [x] R-S1-001 (e): repetir la llamada en modo compacto devuelve el mismo texto y el mismo dato.
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto" -->
- [x] El modo `completo` sigue disponible y devuelve íntegro el documento del ticket.
      <!-- test: npx vitest run tests/mcp-server.test.ts -t "permite pedir el ticket completo" -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/resume.ts` (nuevo): `buildResumeContext(paths, ticket, modo)` y `renderResumeContext(contexto)`. Proyectan el resumen desde el ticket parseado y `readReceipts`; exportan `ResumeMode`, `ResumePoint` y `ResumeReceipt`.
- `packages/engine/src/index.ts`: exporta el módulo nuevo.
- `packages/cli/src/commands.ts`: `resumeTicket` acepta `modo` (`compacto` por defecto) y devuelve el contexto del motor junto al texto; se retiró el `renderResume` local, que quedaba como segunda forma del mismo hecho.
- `packages/mcp/src/tools.ts`: la herramienta `reanudar_ticket` declara `modo` con `compacto` por defecto, valida el enum, declara `outputSchema` cerrado y emite el dato como `structuredContent`.
- Criterios: se marcan cuando el recibo del gate mecánico diga que pasaron, no antes.

## Pruebas

- `npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto"` — pasa; cubre los criterios (a), (b), (c), (d) y (e), incluida la repetición de la llamada que comprueba el determinismo.
- `npx vitest run tests/mcp-server.test.ts -t "permite pedir el ticket completo"` — pasa; cubre el modo completo.
- `npm run build` — pasa. `npm run typecheck` — pasa.
- `npm test` — 1.391 pruebas pasaron, 48 omitidas, una suite omitida.
- `npx prettier --check` sobre los archivos tocados — pasa.

- Resultado del PO: «yo ya vi que ejecutaste las pruebas y pasaron creo que de mi parte no habria necesidad de volver a correr los mismos comandos si con eso ya es necesario pasemos a cerrar». No se volvieron a ejecutar los comandos: el responsable acepta el resultado ya registrado en el recibo del gate mecánico.

### Contrato de pruebas para el responsable

- Directorio de ejecución: la raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/mcp-server.test.ts -t "reanuda en modo compacto"` — esperado: 1 prueba pasa.
- `npx vitest run tests/mcp-server.test.ts -t "permite pedir el ticket completo"` — esperado: 1 prueba pasa.
- `npm test` — esperado: 1.391 pruebas pasan, 48 omitidas.
- Validación manual: llamar a `reanudar_ticket` con `{id}` y comprobar que el texto trae estado, plan, puntos abiertos y último recibo sin el documento entero; repetir con `{id, modo: "completo"}` y comprobar que devuelve el ticket íntegro.
- Ambiente: Node 22 o superior con dependencias instaladas. No requiere credenciales ni red.

## QA

```json
[]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[]
```

## Consumo de IA

```json
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  }
]
```
