---
schema_version: 2
id: BUGFIX-CORE-PLAN-ESTRUCTURADO-GATE-20261007
title: hasStructuredPlan descarta pasos que mencionan «gate» en rutas o texto
type: BUGFIX
module: CORE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-CORE-PLAN-ESTRUCTURADO-GATE-20261007

## Solicitud original

En /Users/juanandrade/Desktop/ValmenHarness, packages/core/src/validate.ts, la función hasStructuredPlan (alrededor de la línea 132) descarta como «paso» cualquier línea del plan cuyo texto normalizado incluya la subcadena "gate" (`normalized.includes("gate")`) o "aprobación del po". Efecto: en un ticket de módulo GATE (o que cite rutas como packages/gate/src/decide.ts o tests/gate-decide.test.ts) casi todos los pasos reales se descartan y el motor rechaza la transición a approved con «approved requiere un plan proporcional estructurado con al menos dos pasos reales», aunque el plan tenga tres pasos concretos. Caso reproducible: BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005 (2026-10-06), cuyos pasos 1 a 3 nombraban packages/gate/ y tests/gate-decide.test.ts. Cambio pedido: excluir solo las cabeceras de compuerta (líneas que empiezan por «gate de plan», «gate de análisis» o «gate de plan y aprobación», o equivalentes) y las que dicen «aprobación del PO» como encabezado, no cualquier línea que mencione la palabra. Agregar pruebas en tests/ que fijen: un plan con pasos que citan packages/gate/... cuenta como estructurado, y la plantilla sin rellenar con solo cabeceras sigue sin contar. Es un ticket nuevo del harness (BUGFIX, módulo CORE): sigue el flujo de AGENTS.md, no modo directo. Corre npx vitest run antes de entregar.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la comprobación de plan estructurado de `@valmen/core`, usada por `validate.ts` y por la transición a `approved` del motor.
- Usuario o rol afectado: quien lleva un ticket de módulo GATE o que cita rutas `packages/gate/...`.
- Comportamiento actual: un paso del plan se descarta si contiene la subcadena «gate» o «aprobación del po» en cualquier parte; un plan con tres pasos reales se rechaza.
- Comportamiento esperado: solo se descartan las cabeceras de compuerta y el encabezado «aprobación del PO»; un paso que cita `packages/gate/...` cuenta.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): `packages/core/src/validate.ts:141-142` usa `normalized.includes("gate")` y `normalized.includes("aprobación del po")`, que filtran por subcadena en vez de por cabecera.
- Hipótesis pendientes: ninguna.
- Consumidores afectados: `packages/core/src/validate.ts:617` (validación de tickets approved o posteriores) y `packages/engine/src/transition.ts:371` (transición a `approved`).
- Archivos y flujo investigados: `packages/core/src/validate.ts:104-146` (`planLines`, `hasStructuredPlan`); no hay pruebas previas de `hasStructuredPlan` en `tests/`. Caso real: BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005.
- Riesgos y compatibilidad: aflojar el filtro podría contar como paso una cabecera con valor («Gate de plan y aprobación: pendiente»); se cubre con coincidencia por prefijo. Los tickets ya aprobados solo pueden ganar pasos, no perderlos.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan, cascade GR-20261007-BUGFIX-CORE-PLAN-ESTRUCTURADO-GATE-20261007-plan-1).
- Pasos ordenados:
  1. En `packages/core/src/validate.ts`, reemplazar en `hasStructuredPlan` las dos comprobaciones `includes` por una regex anclada al inicio (`^gate de (plan|análisis)…`, `^aprobación del po`) que solo excluye cabeceras (C1, C2, C3).
  2. Crear `tests/plan-estructurado.test.ts` con los casos: pasos con `packages/gate/...` cuentan, plantilla sin rellenar no cuenta, cabecera con valor no cuenta (C1, C2, C3).
  3. Correr `npx vitest run` completo y confirmar que no hay regresiones (C4).
- Impactos declarados: ninguno declarado.
- Rollback (obligatorio): revertir el commit; el cambio es una sola función pura sin datos persistidos.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: un plan con tres pasos que citan `packages/gate/src/decide.ts` y `tests/gate-decide.test.ts` cuenta como estructurado.
<!-- test: npx vitest run tests/plan-estructurado.test.ts -->
- [x] C2: la plantilla sin rellenar, con solo cabeceras («Gate de plan y aprobación:», «Pasos ordenados:»), no cuenta como estructurada.
<!-- test: npx vitest run tests/plan-estructurado.test.ts -->
- [x] C3: una cabecera de compuerta o de «aprobación del PO» con valor en la misma línea no cuenta como paso.
<!-- test: npx vitest run tests/plan-estructurado.test.ts -->
- [x] C4: la suite completa pasa sin regresiones.
<!-- test: npx vitest run -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "hasStructuredPlan descarta pasos que mencionan «gate»",
    "status": "verified",
    "severity": "normal",
    "actual": "validate.ts:141-142 filtraba con includes(\"gate\") y includes(\"aprobación del po\"): un plan con tres pasos que citan packages/gate/ se rechazaba para approved.",
    "expected": "Solo las cabeceras de compuerta y el encabezado «aprobación del PO» se descartan; los pasos que citan packages/gate/ cuentan.",
    "evidence": [
      "EVIDENCE-002"
    ],
    "affected_files": [
      "packages/core/src/validate.ts",
      "tests/plan-estructurado.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/core/src/validate.ts`: `hasStructuredPlan` excluye ahora por la regex anclada `ENCABEZADO_DE_COMPUERTA_RE` (cabeceras «gate de plan/análisis», «gate no exigible», «aprobación del PO») en vez de `includes("gate")`.
- `tests/plan-estructurado.test.ts`: 4 casos (pasos con `packages/gate/`, plantilla solo cabeceras, cabecera con valor, un solo paso real).
- Observación: las líneas vacías «1.» y «2.» de la plantilla ya contaban como pasos antes de este cambio; no se tocó (fuera de alcance).

## Pruebas

- Directorio: raíz del repositorio.
- `npx vitest run tests/plan-estructurado.test.ts` → 4 pruebas pasan.
- `npx vitest run` → 191 archivos pasan, 2770 pruebas pasan, 48 omitidas.
- Manual: ninguna.
- Resultado del PO: «pruebas OK, cierra el ticket».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:1b740cd2087cd80d40c5dcd660fc56d54ece8651",
    "environment": "macOS Darwin, Node 24, repo ValmenHarness en main, npx vitest run local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "pruebas OK, cierra el ticket"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run (raíz del repo): 191 archivos pasan, 2770 pruebas pasan, 48 omitidas; tests/plan-estructurado.test.ts: 4 pruebas pasan. qa-mechanical aprobó (GR-20261007-BUGFIX-CORE-PLAN-ESTRUCTURADO-GATE-20261007-qa-mechanical-1).",
    "reference": "commit:1b740cd2087cd80d40c5dcd660fc56d54ece8651",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run tests/plan-estructurado.test.ts: 4 pruebas pasan sobre el árbol de packages/core/src/validate.ts y tests/plan-estructurado.test.ts (ya commiteado en 1b740cd).",
    "reference": "worktree:sha256:0eb201622aa7c3c374c14dd695f78d995dc5e537edfa05e348dc58209ce0d509",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "pruebas OK, cierra el ticket"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "hasStructuredPlan en packages/core/src/validate.ts reemplaza los includes(\"gate\") y includes(\"aprobación del po\") por una regex anclada al inicio de línea que solo excluye cabeceras de compuerta y el encabezado de aprobación del PO. Pruebas en tests/plan-estructurado.test.ts.",
    "functional_summary": "Un plan con pasos concretos que citan rutas como packages/gate/... ya se acepta como estructurado: los tickets del módulo GATE dejan de ser rechazados al pasar a approved por nombrar «gate».",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Queda unreleased; sin impacto de sync, migración ni Docker."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": "e6720be8-b4bc-4a2b-9b92-3622b2511615",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesión de Claude Code (Sonnet 5.5) que trabajó solo este ticket: registro, análisis, plan, implementación, entrega y cierre. Sin números: la sesión no los expone y no se estiman.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:la sesión de Claude Code no expone el agregado de tokens al agente",
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
    "date": "2026-10-07",
    "at": "2026-10-07T13:14:28.782Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T13:14:51.425Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T13:15:21.752Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T14:43:07.053Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade (PO)\",\"source\":\"cli\",\"quote\":\"si apruebo decision A\",\"planHash\":\"sha256:08c95fe19d809ebf33116755ea140546485faf14b8f58e43fc23aa4d745eec7a\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T14:43:12.900Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (PO) (fuente cli), plan sha256:08c95fe19d809ebf33116755ea140546485faf14b8f58e43fc23aa4d745eec7a."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T14:43:12.900Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T14:43:14.673Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T14:45:54.692Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T14:59:44.073Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T14:59:49.941Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T14:59:55.172Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T14:59:58.169Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:00.444Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:03.758Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:05.288Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:06.881Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:08.977Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:10.723Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:12.358Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:18.069Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:21.758Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T15:00:23.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
