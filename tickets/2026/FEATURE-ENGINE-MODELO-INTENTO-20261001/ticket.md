---
schema_version: 2
id: FEATURE-ENGINE-MODELO-INTENTO-20261001
title: Declarar modelo configurado y efectivo por intento
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-MODELO-INTENTO-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-004: La vista DEBE distinguir modelo configurado y modelo efectivo de cada intento.
Depende de: FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: contrato persistido del motor para declarar el modelo configurado y observar el modelo efectivo de cada intento, con proveedor, fuente y orden verificable. No integra todavía lectores ni interfaz.
- Usuario o rol afectado: adaptadores y superficies que muestran actividad de intentos sin presentar una intención de tarjeta como si fuera uso confirmado.
- Comportamiento actual: `execution-events.ts` conserva identidad, intento, actividad y el nuevo enlace de sesión, pero no posee campos para modelos. `routing.yaml` configura solo roles del harness y no identifica necesariamente al worker que ejecutó el intento.
- Comportamiento esperado: el motor conserva por separado declaraciones de modelo configurado y observaciones de modelo efectivo; un cambio de modelo o compactación añade otro tramo ordenado y la ausencia se consulta como desconocida.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/routing.ts` resuelve modelos de roles propios del harness; `packages/engine/src/execution-events.ts` es el historial append-only común; `packages/engine/src/execution-sessions.ts` recién enlaza sesiones por intento sin conocer modelos; `packages/engine/src/execution-contract.ts` centraliza las operaciones comunes.
- Causa raíz o hipótesis: no existe un hecho tipado que distinga la intención configurada del dato efectivo observado. Usar el routing o el modelo de una sesión como reemplazo del otro cruzaría responsabilidades y contradice el diseño D4: el efectivo procede de sesión/transporte y los huecos no se inventan.
- Riesgos y compatibilidad: los eventos anteriores no contienen modelos y deben seguir leyéndose. Los modelos admiten identificadores de proveedor habituales con `/`, pero no rutas ni espacios; los cambios se añaden y se leen por cursor, sin sobrescribir tramos ni deducir valores ausentes.
- Supuestos y decisiones pendientes: el ticket expondrá el contrato del motor; la captura desde Hermes, OpenCode o Codex, el coste y la presentación visual quedan para sus tickets dependientes. El proveedor y modelo se guardan juntos cuando una fuente los observa; sin hecho efectivo la consulta devuelve ausencia explícita.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: añadir declaración y lectura de modelos por intento en `@valmen/engine`, incluido `ExecutionContract`, que es la interfaz pública que CLI, MCP y la vista consumirán para distinguirlos. Quedan fuera el renderizado de UI, routing, lectores externos y coste; los adaptadores posteriores publicarán los hechos observados.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La compuerta `GR-20261003-plan` (revisión 7958, 2026-10-03) bloqueó por `criterio_01=0.06`: interpreta «consumible por la vista» como renderizado obligatorio. Autorización literal del PO: «Si apruebo el desbloqueo» (2026-10-03); la aprobación conserva el alcance de motor descrito en este plan.
- Decisión del PO (2026-10-03): `R-ACT-004` se implementa por capas. Este ticket entrega exclusivamente el contrato de motor y conserva fuera la representación visual, que corresponde a los tickets posteriores de Mission Control. La compuerta de plan bloqueó por interpretar «consumible por la vista» como renderizado obligatorio; el caso quedó registrado como `AP-003` para refinar la compuerta sin ampliar este ticket.
- Pasos ordenados:
  1. Crear `packages/core/src/model-reference.ts` con proveedor/modelo portables y validar los identificadores sin tratar el slash habitual de un modelo como ruta.
  2. Extender `packages/engine/src/execution-events.ts` con carga y persistencia opcional del dato de modelo únicamente para los hechos `model.configured` y `model.observed`, preservando los eventos previos sin modelo.
  3. Crear `packages/engine/src/execution-models.ts`, reexportarlo desde `packages/engine/src/index.ts` e incorporar sus operaciones en `packages/engine/src/execution-contract.ts`, para declarar la configuración, observar el efectivo y entregar a CLI/MCP/vista los tramos ordenados por intento.
  4. Añadir `tests/execution-models.test.ts` y ampliar `tests/execution-contract.test.ts` para diferenciar ambos tipos de modelo por la fachada pública, conservar los cambios efectivos por compactación/reintento, rechazar identificadores no portables y confirmar que ausencia de observación no se rellena desde configuración. Ejecutar `npx vitest run tests/execution-models.test.ts tests/execution-contract.test.ts tests/execution-events.test.ts` desde la raíz.
- Compatibilidad: `model` es opcional para rehidratar JSONL ya existente; la consulta devuelve una lista vacía cuando falta una declaración u observación, que expresa dato desconocido.
- Rollback: revertir los módulos y la extensión opcional; no se reescriben ni se eliminan hechos append-only ya persistidos.

## Criterios de aceptación

- [x] R-ACT-004: `ExecutionContract`, consumible por la vista, registra y consulta por separado un modelo configurado y un modelo efectivo observado, con proveedor, modelo y fuente.
      <!-- test: npx vitest run tests/execution-models.test.ts tests/execution-contract.test.ts -->
- [x] R-ACT-004: Un cambio de modelo efectivo por reintento o compactación conserva cada tramo en orden y no sobrescribe el anterior.
      <!-- test: npx vitest run tests/execution-models.test.ts -->
- [x] R-ACT-004: Cuando no existe observación efectiva, el motor la declara ausente y no la infiere desde el modelo configurado.
      <!-- test: npx vitest run tests/execution-models.test.ts tests/execution-events.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/core/src/model-reference.ts`: valida y congela proveedor y modelo sin rutas ni espacios, permitiendo el slash de catálogo habitual como `openai/gpt-6.1`.
- Se extendió `packages/engine/src/execution-events.ts` con el dato opcional `model`, exclusivo de los hechos append-only `model.configured` y `model.observed`; los eventos históricos sin ese dato continúan rehidratándose.
- Se añadió `packages/engine/src/execution-models.ts`, exportado desde el motor, y se amplió `ExecutionContract` con operaciones separadas para declarar el modelo configurado, observar el efectivo y consultar cada secuencia por ejecución o intento. No se infieren observaciones desde configuración.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/execution-models.test.ts tests/execution-contract.test.ts tests/execution-events.test.ts` — pasó: 3 archivos y 13 pruebas. Cubre la separación de modelos, proveedor y fuente, tramos ordenados de compactación/reintento, ausencia efectiva, compatibilidad del historial y validación de identificadores.
- `npm run build` — pasó: TypeScript de producción compila y la interfaz se copia al artefacto CLI.
- `npx vitest run` — pasó: 105 archivos, 1824 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- `npx tsc --noEmit` detectó cuatro errores ya concentrados en `tests/interfaz-ejecutable.test.ts` y `tests/project-selector.test.ts`, fuera de este ticket; el build de producción y la suite completa pasaron.
- Resultado del PO: aprobó el desbloqueo del plan el 2026-10-03 y autorizó previamente documentar, cerrar, commitear y hacer push si las pruebas ejecutadas daban el resultado esperado. Las verificaciones declaradas y la suite completa pasaron.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:2e1f355a0530abd672376ca34079b62d8ba06271dd10dac99bf5b1042a9f25e5",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO aprobó el desbloqueo y autorizó documentar, cerrar, commitear y hacer push si las pruebas ejecutadas pasaban."
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-03",
    "technical_summary": "Se añadió el contrato append-only para declarar modelo configurado y observar modelo efectivo por intento, con proveedor, fuente, tramos ordenados y ausencia explícita.",
    "functional_summary": "Las superficies posteriores pueden distinguir intención de uso confirmado sin inferir el modelo efectivo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación ni configuración externa; queda disponible para los tickets dependientes."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión actual de Codex compartida con tickets previos y con FEATURE-ENGINE-MODELO-INTENTO-20261001; Codex no expone un agregado verificable por ticket, por lo que no se asignan tokens ni coste inventados. El registro conserva la ausencia explícita en lugar de un reparto estimado.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-sesion-compartida-20261003",
    "confidence": "medium",
    "id": "CONSUMO-001"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:44.673Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T06:11:59.209Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T06:12:55.186Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T07:20:28.693Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T07:20:28.877Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T07:24:48.273Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T07:24:48.438Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T07:24:48.662Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T07:24:54.411Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T07:24:54.573Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T07:25:17.627Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T07:25:18.302Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T07:25:18.465Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
