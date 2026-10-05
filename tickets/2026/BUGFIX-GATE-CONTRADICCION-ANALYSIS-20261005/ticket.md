---
schema_version: 2
id: BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005
title: Degradar contradicción aislada del gate analysis
type: BUGFIX
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005

## Solicitud original

Corregir la decisión del gate analysis para que un bloqueo aislado de diagnostico_explica_el_sintoma no produzca block cuando el mismo recibo clasifica el análisis como completo y aprueba causa, archivos y riesgos; debe degradarse a review y conservar bloqueo ante fallos estructurales. Autorizado por el PO el 2026-10-05.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: corregir la decisión determinista del gate `analysis` ante un único bloqueo contradictorio de `diagnostico_explica_el_sintoma`.
- Usuario o rol afectado: responsable que prepara el diagnóstico de un ticket y recibe un bloqueo o una revisión de la compuerta de análisis.
- Comportamiento actual: `decide()` convierte cualquier proposición con efecto `block` en un veto absoluto. Por ello el vector real de AP-004 —síntoma `0.04`, causa, archivos y riesgos con al menos `0.97`, y clasificación `completa`— devuelve `block` aunque el propio recibo respalda el diagnóstico.
- Comportamiento esperado: solo en el gate `analysis`, ese vector contradictorio devuelve `review`, conserva la trazabilidad de la proposición que impide aprobar y exige decisión humana. Un bloqueo de causa, archivos, riesgos, clasificación incompleta, más de un bloqueo o cualquier otro gate conserva el resultado `block`.

## Diagnóstico

- Memoria consultada: AP-004 documenta cuatro bloqueos de `diagnostico_explica_el_sintoma` con clasificación completa y evidencia estructural alta; AP-006 confirma que dos bloqueos semánticos equivalentes no justifican repetir una tercera evaluación. Se citan como antecedente, no como sustituto de esta corrección determinista.
- Archivos y flujo investigados: `packages/gate/src/definitions.ts` declara las cinco proposiciones del `ANALYSIS_GATE`; `packages/gate/src/decide.ts` evalúa sus respuestas y, en las líneas 374–386, devuelve `block` tan pronto encuentra cualquier bloqueo. `tests/gate-decide.test.ts` cubre el veto genérico, pero no el vector de contradicción propio de analysis. `tests/gate-impacto-nulo.test.ts` confirma que `riesgos_cubren_impactos` puede ser descriptiva cuando no hay impactos y no debe convertir la excepción en una relajación global.
- Causa raíz confirmada: el algoritmo conoce efectos individuales pero no la regla de coherencia que `ANALYSIS_GATE` necesita. Como `decide()` solo recibe proposiciones y umbrales, el bloqueo aislado del síntoma no se contrasta contra la clasificación completa ni contra causa, archivos y riesgos antes de aplicar el veto absoluto.
- Riesgos y compatibilidad: relajar el veto de forma global permitiría que un criterio incumplido de otro gate pase a revisión. La excepción debe ser declarativa, exclusiva de `ANALYSIS_GATE`, exigir exactamente un bloqueo de `diagnostico_explica_el_sintoma`, clasificación `completa` y las tres evidencias estructurales en o por encima de `approveAt`. La salida queda en `review`, no en `approve`, por lo que conserva la decisión humana.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: se ajustará el contrato de decisión para que un gate pueda declarar una excepción estrecha de bloqueo contradictorio y `ANALYSIS_GATE` será el único que la use. Quedan fuera cambiar umbrales, reinterpretar respuestas del modelo, promover gates a automático, reescribir recibos históricos o relajar otros gates.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan, 2026-10-05): «Si dale».
- Pasos ordenados:
  1. Añadir un contrato opcional y explícito para degradar un único bloqueo contradictorio a `review`, sin cambiar el veto absoluto predeterminado.
     Archivo: `packages/gate/src/decide.ts`.
  2. Declarar la regla solo para el análisis: síntoma bloqueado, clasificación `completa` y causa, archivos y riesgos aprobados.
     Archivo: `packages/gate/src/definitions.ts`, `ANALYSIS_GATE`.
  3. Reproducir AP-004 y los controles de causa, archivos y veto absoluto ajeno a la excepción.
     Archivo: `tests/gate-decide.test.ts`.
  4. Ejecutar verificaciones focales, regresión completa y revisión de secretos; registrar los resultados en la entrega.
     Comandos: `npx vitest run tests/gate-decide.test.ts`, `npx vitest run` y `node packages/cli/dist/main.js secrets`.
- Rollback: retirar la regla declarativa de `ANALYSIS_GATE` y el soporte opcional de decisión; el motor vuelve al veto absoluto que ya cubren las pruebas genéricas, sin modificar recibos existentes.

## Criterios de aceptación

- [x] El vector AP-004 con síntoma bloqueado, clasificación `completa` y causa, archivos y riesgos aprobados devuelve `review`, nunca `approve`.
      <!-- test: npx vitest run tests/gate-decide.test.ts --testNamePattern "degrada AP-004" -->
- [x] Si `causa_especifica` o `nombra_archivos_reales` bloquea, el mismo gate analysis devuelve `block`.
      <!-- test: npx vitest run tests/gate-decide.test.ts --testNamePattern "conserva el bloqueo" -->
- [x] Un gate que no declara la excepción conserva el veto absoluto ante un bloqueo aislado.
      <!-- test: npx vitest run tests/gate-decide.test.ts --testNamePattern "un solo bloqueo decide" -->
- [x] La suite completa mantiene el comportamiento de los gates y de sus recibos.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism -->

## Puntos

```json
[]
```

## Implementación

- `GateDefinition` ahora admite `isolatedBlockReview`, una regla declarativa opcional que solo puede degradar un bloqueo único a `review` cuando todas sus evidencias requeridas aprobaron.
- `ANALYSIS_GATE` declara AP-004 con el síntoma como único bloqueo admisible y con clasificación, causa, archivos y riesgos como evidencias requeridas.
- La ejecución real y `simulate` transmiten la regla declarada al decisor. Los demás gates conservan el veto absoluto porque no declaran la regla.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- Focal ejecutada: `npx vitest run --maxWorkers 1 --no-file-parallelism tests/gate-decide.test.ts` — 39 pruebas aprobadas, incluido el control de clasificación incompleta; cada criterio focal selecciona después su caso por nombre en el gate mecánico.
- Regresión ejecutada: `npx vitest run` — 1.928 pruebas aprobadas y 48 omitidas por la configuración de equivalencia. La verificación final limita Vitest a un trabajador y desactiva el paralelismo de archivos para no saturar la RAM.
- Gate mecánico ejecutado: `qa-mechanical` aprobó los cuatro criterios declarados; su recibo está en `.valmen/receipts/BUGFIX-GATE-CONTRADICCION-ANALYSIS-20261005.jsonl`.
- Compilación ejecutada: `npm run build` aprobó. `npm run typecheck` mantiene fallos preexistentes en tipos de pruebas ajenas (`autonomous-collisions`, `gate-promotion`, `journeys` y `project-selector`), sin errores en los archivos de este ticket.
- Seguridad ejecutada: `node packages/cli/dist/main.js secrets` no detectó secretos en 12 archivos con cambios.
- Validación manual pendiente: revisar que un recibo con el vector AP-004 resulte en `review`, muestre `diagnostico_explica_el_sintoma` como bloqueo y requiera decisión humana; no necesita servicios ni credenciales.
- Resultado comunicado por el PO: aprobado el 2026-10-05. Ejecutó `npx vitest run --maxWorkers 1 --no-file-parallelism tests/gate-decide.test.ts --testNamePattern "degrada AP-004"`; el caso pasó y confirmó `review` para AP-004.
- Resultado comunicado por el PO tras la corrección final: aprobado el 2026-10-05. Repitió el mismo comando focal sobre 39 pruebas; el caso pasó y confirmó `review` para AP-004.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:26b764092c585c72505cad623fb41a2f99ce2aaf847904fc491bdaa63c460dfe",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO ejecutó la prueba focal y confirmó que AP-004 queda en review."
  },
  {
    "id": "QA-003",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:26b764092c585c72505cad623fb41a2f99ce2aaf847904fc491bdaa63c460dfe",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [
      "La revisión final detectó que la excepción exigía indebidamente el umbral de confianza de clasificación; debe exigir únicamente la opción completa."
    ],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-005",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:7e01419e814debd5213e96e5bbb307c09243bf55c50df009e8a76b6023fdeb1b",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO repitió la prueba focal tras la corrección final y confirmó review para AP-004."
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
    "date": "2026-10-05",
    "technical_summary": "Se añadió una excepción declarativa y acotada para que ANALYSIS_GATE degrade a review el único bloqueo contradictorio del síntoma, propagada a la ejecución y a la simulación; las regresiones preservan los bloqueos estructurales y el veto de los demás gates.",
    "functional_summary": "Un análisis con evidencia estructural completa ya no queda bloqueado automáticamente por una única puntuación contradictoria del síntoma: llega a decisión humana; las carencias reales de causa o archivos siguen bloqueando.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó la prueba focal de AP-004 y autorizó cerrar el ticket.",
    "release_impact": "Sin publicación: el ticket permanece unreleased; test-timeout se ajustó a 60 segundos para verificar suites en un único trabajador sin saturar la memoria."
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-10-05",
    "technical_summary": "Se corrigió la excepción declarativa de analysis: solo degrada a review el bloqueo aislado del síntoma si la clasificación está completa y causa, archivos y riesgos superan approveAt; la ejecución y la simulación reciben la misma regla.",
    "functional_summary": "Los análisis con el patrón contradictorio AP-004 pasan a revisión humana, mientras una causa, archivo o clasificación incompleta conserva el bloqueo automático.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO repitió la prueba focal tras la corrección final y confirmó review para AP-004.",
    "release_impact": "Sin publicación: ticket unreleased. test-timeout queda en 60 segundos para que las verificaciones de un solo trabajador no agoten la memoria."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-05",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de Codex compartida con FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001 y FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001; no existe un agregado verificable por ticket, por lo que no se asignan tokens ni coste inventados.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-compartida-20261005",
    "confidence": "low",
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
    "date": "2026-10-05",
    "at": "2026-10-05T15:09:11.280Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T15:11:05.244Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T15:11:55.619Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T15:21:53.959Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T15:21:54.130Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T16:07:07.295Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T16:10:56.793Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T16:10:57.082Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T16:11:34.668Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T16:11:34.960Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T16:11:35.194Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T16:11:47.834Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T16:11:48.027Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-05T16:12:45.025Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: closed -> changes_requested. Reapertura por hallazgo: La revisión final detectó que la excepción exigía indebidamente el umbral de confianza de clasificación; debe exigir únicamente la opción completa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-05T16:12:45.239Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-05",
    "at": "2026-10-05T16:14:46.869Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-05",
    "at": "2026-10-05T16:23:34.499Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-05",
    "at": "2026-10-05T16:23:34.800Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-05",
    "at": "2026-10-05T16:23:34.978Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-05",
    "at": "2026-10-05T16:23:35.160Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-05",
    "at": "2026-10-05T16:23:47.114Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-05",
    "at": "2026-10-05T16:23:47.327Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
