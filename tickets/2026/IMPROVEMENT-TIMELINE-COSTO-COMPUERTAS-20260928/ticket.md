---
schema_version: 2
id: IMPROVEMENT-TIMELINE-COSTO-COMPUERTAS-20260928
title: Mostrar el costo y los tokens de las compuertas Jev en la ficha del ticket
type: IMPROVEMENT
module: TIMELINE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-28
updated: 2026-09-28
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-TIMELINE-COSTO-COMPUERTAS-20260928

## Solicitud original

El PO quiere ver en el costeo el costo de cada paso: los recibos de compuerta existen en .valmen/receipts con su costo real de Jev (verificado: ~$0.0008 por ticket en ANALIZACION y PLAN) pero ninguna pantalla los lee; el historial de decisiones muestra gate y veredicto sin costo. 2026-09-28.

## Descripción funcional

- Alcance: la ficha de ticket de Mission Control (packages/server/web/index.html) y el endpoint de timeline (packages/server/src/server.ts:657-668): sumar a la «Línea de tiempo y coste» los recibos de compuerta del ticket (.valmen/receipts/&lt;ID&gt;.jsonl, ya leídos por readAllReceipts en packages/engine/src/usage.ts:30-59) como un bloque por compuerta con evaluaciones, veredicto, tokens y costo.
- Usuario o rol afectado: el PO, que hoy no puede ver el costo de las compuertas en ninguna pantalla: los recibos existen con su costo real (verificado en FEATURE-RELLENO-MASIVO-ANULACION-20260924: 3 evaluaciones analysis de ~$0.00013, 3 de plan de ~$0.00034, qa-mechanical $0; ~$0.0008 por ticket) pero el historial de decisiones (index.html:4570-4590) muestra gate/veredicto/actor sin costo y la línea de tiempo los ignora.
- Comportamiento actual: el costo de Jev está en disco con model (typesafe/jev-1.13), usage (inputTokens/outputTokens/costUsd) y outcome por evaluación, y ninguna vista lo lee: ni la tira de decisiones, ni la línea de tiempo (que solo suma sesiones de opencode/codex/hermes), ni `usage` del CLI, que agrega por compuerta de todo el registro y no por ticket.
- Comportamiento esperado: la ficha del ticket muestra junto a las sesiones el consumo de sus compuertas: evaluaciones por gate con veredicto, tokens y costo de Jev, con el total de compuertas sumado a la foto del consumo del ticket.

## Diagnóstico

- Archivos y flujo investigados: los recibos por ticket en packages/engine/src/receipts.ts:24-26 (.valmen/receipts/&lt;ID&gt;.jsonl, una línea por recibo) y su forma (id GR-&lt;fecha&gt;-&lt;gate&gt;, gate, outcome, actor, model, usage con costUsd — verificado contra los recibos reales de tres tickets del 2026-09-22/24/28); el agregador packages/engine/src/usage.ts:30-59 (readAllReceipts) que ya parsea y salta corruptos contándolos; la línea de tiempo packages/server/src/timeline.ts (no lee recibos) y la vista index.html: tira de decisiones :4570-4590 y bloque de consumo :4159-4163.
- Causa raíz o hipótesis: no hay defecto de datos sino de presentación: el recibo guarda el costo desde su creación («el harness evaluó y lo sabe de primera mano», timeline.ts:4-6) pero la única consumidora era `usage` del CLI por registro, no por ticket, y la ficha nunca sumó esa fila. Es la pieza que faltaba del desglose por paso que pidió el PO.
- Riesgos y compatibilidad: (a) los recibos qa-mechanical traen usage en ceros y model null (evaluación mecánica sin modelo) — la fila debe decir mecánica/sin modelo y no un $0 que se lea como «gratis»; mismo criterio que ya rige para suscripciones (timeline.ts:101-108); (b) re-evaluaciones y recibos obsoletos: el bloque cuenta todas las evaluaciones del ticket y marca el vigente por gate, sin decidar por el lector; (c) el endpoint de gates ya expone decisions por ticket — reutilizar esa lectura si el formato lo permite, o leer el JSONL con readReceipts del engine, sin duplicar parseo.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es presentación de datos que ya están en disco.

## Plan

- Gate no exigible: IMPROVEMENT de presentación sobre datos ya registrados; no cambia contratos del registro ni estados.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. packages/server/src/server.ts: en el endpoint `/api/timeline` (:657-668) agregar al payload el desglose de compuertas del ticket leído con readReceipts (packages/engine/src/receipts.ts): evaluaciones por gate con outcome, tokens, costUsd y actor, más el total del ticket.
  2. packages/server/web/index.html: en pintarLineaDeTiempo (:4212) agregar el bloque «Compuertas (Jev)» con evaluaciones, tokens y costo por gate y total; la evaluación mecánica sin modelo se rotula como tal; incluir el total de compuertas en el resumen del acordeón (:4255-4292).
  3. packages/server/web/index.html: en tiraDeDecisiones (:4570-4590) sumar al title del chip el costo y tokens de esa evaluación si el payload del endpoint de gates los trae, sin cambiar la forma del chip.
  4. Pruebas: fixture con recibos JSONL de un ticket (mecánica + Jev) afirmando el desglose que arma el endpoint; y la verificación de interfaz existente (scripts/verificar-interfaz.mjs) para los textos nuevos de la vista.
- Rollback: revertir los commits saca el bloque de compuertas de la vista; los recibos no se modifican.

## Criterios de aceptación

- [x] La ficha del ticket muestra un bloque por compuerta evaluada con evaluaciones, veredicto, tokens y costo leidos de los recibos del ticket, y un recibo mecanico sin modelo se muestra rotulado y sin sumar un cero al total de Jev
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] El total de compuertas del ticket aparece en el resumen de la linea de tiempo junto al costo de sesiones
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] La bateria completa del paquete server sigue verde tras el cambio
      <!-- test: npx vitest run tests/timeline.test.ts -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/server/src/server.ts` — el endpoint `/api/timeline` agrega `compuertas` al payload cuando la query trae `ticket`: lee los recibos con `readReceipts` (reexportado de `@valmen/engine`) sobre el `directory` de la query y proyecta cada recibo a `gate/outcome/actor/decidedAt/model/inputTokens/outputTokens/costUsd`. El modelo se normaliza a `provider/model` y el mecánico queda `null` — sin modelo, sin mentir con uno.
2. `packages/server/web/index.html` — `pintarLineaDeTiempo` (:4259) agrega al resumen la etiqueta `N compuerta(s) ($X)`, y la tabla «compuerta/resultado/actor/modelo/tokens/coste» va **antes** del corte de intervenciones: un ticket sin llamadas al registro —el caso del cron— igual pagó sus compuertas, y ocultarlas sería mostrar un costo de menos. El mecánico se rotula «mecánico (sin modelo)».
3. `tiraDeDecisiones` (:4624) — el title de cada chip del historial suma tokens y coste de la evaluación cuando el recibo la trae, y dice «mecánico, sin modelo» cuando no; la forma del chip no cambia.
4. `tests/timeline.test.ts` — prueba nueva del endpoint con fixture de dos recibos (Jev con coste + mecánico sin modelo): afirma el desglose completo y la rotulación.

Nota: el paso 3 del plan hablaba de «si el payload del endpoint de gates los trae» — verificado contra `GateDecisionView` (gates.ts:145-175): `model`/`usage`/`latencyMs` ya viajaban en la respuesta de `/api/tickets/:id/gates`; el cambio fue usarlos en la vista, no añadirlos.

## Pruebas

- `npx vitest run tests/timeline.test.ts` → 17 pasadas (16 previas + 1 nueva del desglose de compuertas).
- `npx vitest run` (suite completa) → **1539 pasadas, 48 skipped, 0 fallos** (tras `npm run build`: la prueba de interfaz ejecutable compara el dist contra la fuente).
- Verificación contra el registro real de SaiOpenCloud vía API en :4174: FEATURE-RELLENO-MASIVO-ANULACION-20260924 muestra 7 evaluaciones — 6 de Jev (3 analysis ~$0.00013, 3 plan ~$0.00034, `TypeSafe/typesafe/jev-1.13`) y 1 qa-mechanical sin modelo — con su total ~$0.0014 junto al $0.0731 del ejecutor.
- Verificación manual pendiente del PO: la sección «Línea de tiempo y coste» del ticket muestra la fila de compuertas y los chips del historial traen costo/tokens al pasar el cursor.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Desglose de compuertas: /api/timeline agrega compuertas con readReceipts; vista con tabla compuerta/resultado/actor/modelo/tokens/cost antes del corte de intervenciones y etiqueta en el resumen; chips del historial con tokens y costo en el title. Suite completa: 1539 pruebas, 0 fallos. Verificado via API en :4174 sobre el registro real de SaiOpenCloud: FEATURE-RELLENO-MASIVO-ANULACION-20260924 muestra 7 evaluaciones, 6 de Jev con costo y el mecanico rotulado sin modelo.",
    "reference": "worktree:sha256:e3ff591c95225e3ed4805e85f906ac78f61555ef975442868f5fdf26b82751b1",
    "point_id": null
  }
]
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
    "date": "2026-09-28",
    "at": "2026-09-29T01:50:02.481Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-28",
    "at": "2026-09-29T02:07:14.666Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:40.105Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO): Análisis aprobado por el PO en conversación: los 4 gates cayeron en la banda espuria de riesgos_cubren_impactos con impactos en ninguno, defecto ya registrado en FEATURE-GATE-IMPACTO-NULO-BANDA-20260928."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:50.935Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:51.068Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-28",
    "at": "2026-09-29T03:54:52.224Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-28",
    "at": "2026-09-29T03:55:06.808Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-28",
    "at": "2026-09-29T03:55:47.624Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
