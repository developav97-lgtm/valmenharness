---
schema_version: 2
id: FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926
title: Aplicar proposiciones Jev con umbrales y recibos
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
created: 2026-09-26
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-007: Validación semántica ampliada por etapa — El proyecto DEBE poder declarar proposiciones adicionales de Jev por etapa del
Depende de: FEATURE-CONFIG-PROPOSICIONES-JEV-20260926, FEATURE-ENGINE-RUN-AUTONOMO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: consumir las entradas seguras `jev-propositions` ya declaradas por el adaptador y agregarlas a las evaluaciones semánticas de análisis, plan e integración, conservando en cada recibo la pregunta, respuesta, umbrales y consumo que realmente se usaron.
- Usuario o rol afectado: responsable del proyecto que configura validaciones semánticas adicionales y quien audita o decide una corrida autónoma.
- Comportamiento actual: `.valmen/config.yaml` puede describir preguntas por etapa, pero las corridas de gate ignoran la sección. Todas las proposiciones `noul` se deciden contra la política única del gate, por lo que un umbral declarado por pregunta tampoco puede aplicarse ni quedar trazable de forma diferenciada.
- Comportamiento esperado: una pregunta `required` se agrega por conjunción al gate de su etapa —solo endurece— y una `inform` se evalúa y queda como contexto del recibo sin emitir veredicto. La integración autónoma debe comprobar además correspondencia con el plan aprobado, la solicitud y el alcance declarado; ninguna pregunta puede promover el modo del gate ni despejar un bloqueo previo.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/adapter/src/config.ts:101-265` define `JEV_STAGES`, valida y devuelve de forma inmutable las preguntas de `jev-propositions`, incluidos `approve-at`, `block-at` y `verdict`; su comentario en `:225-230` deja explícito que falta el consumidor que una las `required` y conserve las `inform`.
  - `packages/engine/src/gate.ts:392-404` arma el gate efectivo únicamente con criterios, impactos e interfaz. `packages/engine/src/gate.ts:490-533` evalúa y entrega todas sus proposiciones a `decide` con una política global; no carga `config.yaml` ni recibe preguntas por etapa.
  - `packages/gate/src/dynamic.ts:558-667` es la expansión existente: construye proposiciones derivadas del sujeto, deja las fijas como descriptivas cuando corresponde y conserva el principio de que no se puede relajar un veredicto. Es el borde natural para sumar las proposiciones configuradas sin alterar las definiciones base.
  - `packages/gate/src/decide.ts:323-333` y `:514-579` validan y aplican un único `GatePolicy` a las proposiciones `noul`; para respetar los umbrales declarados por pregunta habrá que resolver de forma determinista una política efectiva por proposición, sin que el modelo interprete esos límites.
  - `packages/gate/src/receipt.ts:226-280` ya calcula el hash sobre las proposiciones y la política, y guarda respuestas, proposiciones evaluadas y uso. El recibo debe ampliarse de forma aditiva para que los umbrales efectivos de cada proposición sean auditables sin reescribir recibos existentes.
  - `packages/engine/src/autonomous-run.ts:230-316` lleva un ticket elegible hasta el gate mecánico y las pruebas; no incorpora aún una validación semántica de integración ni la configuración adicional.
- Causa raíz o hipótesis: el ticket precedente creó deliberadamente el contrato de lectura, pero no hay una dependencia desde el ejecutor de gates hacia ese contrato ni una representación en `Proposition`/`GateReceipt` para políticas por pregunta. La expansión actual solo conoce información extraída del ticket, por lo que las entradas del proyecto no llegan al evaluador ni a `decide`.
- Riesgos y compatibilidad: hay que conservar byte a byte el comportamiento cuando `jev-propositions` no existe, no modificar las definiciones base ni permitir ids configurados que colisionen con ellas. `required` debe mantener el veto absoluto y `inform` no debe entrar en bloqueos, bandas ni medias. La política por pregunta no puede cambiar los umbrales de proposiciones base, y el cambio del recibo debe ser opcional/aditivo para leer historial previo. La etapa de integración requiere que el motor congele también el plan aprobado, solicitud y alcance al construir el estado que ve el evaluador; sin eso la afirmación de correspondencia no es reproducible.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es un cambio interno de evaluación y recibos; no ejecuta sincronización, migraciones, contenedores ni despliegues.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Juan Andrade autorizó el alcance y los pasos descritos mediante la frase: «si apruebo el plan».
- Alcance y exclusiones: conectar `jev-propositions` con las evaluaciones semánticas, la decisión determinista y los recibos de análisis, plan e integración. No se activa una proposición en la configuración de este proyecto, no se modifica la definición ni el modo de los gates base, no se implementa la integración automática, ni se hace commit, push, tag, despliegue o migración.
- Pasos ordenados:
  1. En `decide.ts` y `dynamic.ts` del paquete de decisión, representar una proposición adicional con sus umbrales efectivos y convertir el contrato del adaptador en una proposición `noul` segura. Extender el expansor con las preguntas de la etapa sin mutar las definiciones base: `required` participa por conjunción y veto; `inform` conserva la respuesta como contexto con `verdict: false`. Hacer que la decisión aplique y valide la política por proposición cuando exista, sin permitir que una configuración altere las proposiciones base ni que una pregunta adicional despeje un `block` o eleve el modo.
  2. En los módulos de ejecución y estado del motor, leer `readJevPropositions(parseConfig(.valmen/config.yaml))` en el borde de ejecución y asociar `analysis` y `plan` a su expansión. Exponer `buildIntegrationValidation` como preparación reutilizable: recibe el ticket y las preguntas de `integration`, congela solicitud original, plan aprobado y alcance declarado, y devuelve la definición/estado que se entrega a `decide`; una respuesta `required` bajo su `block-at` devuelve `block` antes de que un consumidor Git pueda actuar. El ticket no invoca Git ni implementa la integración automática.
  3. En `receipt.ts` y la ejecución del motor, añadir al recibo, de forma opcional y compatible con JSONL histórico, los umbrales efectivos y metadatos de cada pregunta adicional; incluirlos en el hash de definición y en el estado congelado. Mantener respuestas, coste, modelo y recibos append-only existentes sin reescritura.
  4. En `tests/gate-jev-propositions.test.ts` (nuevo) y pruebas cercanas de recibos, probar ausencia de configuración sin regresión; expansión por análisis, plan e integración; `required` que aprueba/bloquea con sus propios umbrales; `inform` visible sin veto; imposibilidad de relajar un bloqueo base; estado de integración con solicitud, plan y alcance; y recibo con pregunta, respuesta, política efectiva, uso y compatibilidad de recibos previos.
  5. En `docs/03-GATES.md`, documentar el consumo por etapa, la conjunción de `required`, el carácter descriptivo de `inform`, los umbrales por pregunta y la evidencia de integración, dejando explícito que ni YAML ni el modelo cambian la autoridad de una compuerta.
- Rollback: revertir la expansión, lectura del motor, metadatos aditivos del recibo, pruebas y documentación de este ticket. Las configuraciones sin `jev-propositions` continúan con los gates actuales y los JSONL ya emitidos no se alteran; un recibo nuevo que incluya campos opcionales sigue siendo legible por las rutas compatibles.

## Criterios de aceptación

- [x] Una configuración ausente conserva exactamente las proposiciones y el resultado actuales; una configuración válida agrega preguntas solo a su etapa `analysis`, `plan` o `integration`.
      <!-- test: npx vitest run tests/gate-jev-propositions.test.ts -->
- [x] Una pregunta `required` se decide con sus propios umbrales y suma un veto por conjunción, sin alterar umbrales, modo ni resultado de las proposiciones base.
      <!-- test: npx vitest run tests/gate-jev-propositions.test.ts -->
- [x] Una pregunta `inform` queda evaluada y visible en el recibo, pero no puede provocar bloqueo, revisión ni aprobar una compuerta.
      <!-- test: npx vitest run tests/gate-jev-propositions.test.ts -->
- [x] El recibo append-only conserva para cada pregunta adicional su respuesta, umbrales efectivos, modelo y consumo; los recibos emitidos antes de estos campos siguen siendo legibles.
      <!-- test: npx vitest run tests/gate-jev-propositions.test.ts -->
- [x] `buildIntegrationValidation` congela solicitud original, plan aprobado y alcance declarado, y una respuesta `required` sobre correspondencia por debajo de su `block-at` devuelve `block` antes de que un consumidor Git pueda actuar.
      <!-- test: npx vitest run tests/gate-jev-propositions.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/gate/src/decide.ts` permite una política opcional por proposición `noul`, la valida en código y la deja como política efectiva dentro de la proposición evaluada que se serializa en el recibo. Las proposiciones base siguen tomando la política global.
- `packages/gate/src/dynamic.ts` incorpora preguntas adicionales ya validadas, detecta colisiones de identificadores y mantiene `required` como voto por conjunción e `inform` como contexto (`verdict: false`).
- `packages/engine/src/gate.ts` lee `jev-propositions` para `analysis` y `plan`, las traduce al contrato del motor y ofrece `buildIntegrationValidation`, que congela solicitud, plan y alcance antes de que un consumidor futuro pueda tocar Git.
- `tests/gate-jev-propositions.test.ts` cubre ausencia de configuración, las tres etapas, umbrales por pregunta, veto base, contexto informativo, recibos y preparación de integración; `docs/03-GATES.md` documenta el límite de autoridad y la compatibilidad.

## Pruebas

- Directorio: raíz del repositorio.
- Focalizada: `npx vitest run tests/gate-jev-propositions.test.ts` — debe pasar todos los escenarios de expansión, decisión y recibo del ticket.
- Regresión completa: `npx vitest run` — debe terminar sin fallos.
- Tipos: `npm run typecheck` — debe terminar sin errores de TypeScript.
- No requiere navegador, Docker, migraciones, servicios externos ni credenciales: los evaluadores se inyectan en las pruebas y no hacen llamadas de red.
- Resultado técnico: la prueba dirigida aprobó 4/4; `npm run typecheck` terminó sin errores; `npx vitest run` aprobó 142 archivos y 2.225 pruebas (48 omitidas; 1 archivo de equivalencia omitido).
- Validación manual propuesta: revisar un recibo emitido con `jev-propositions` y confirmar que `inform` se muestra sin votar y que una `required` bloqueada impide al consumidor de integración actuar.
- Resultado del PO: Juan Andrade confirma la evidencia técnica presentada para QA: «si confirmo».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:a4980ae324b0a1e9bb742a71b7a5d566c2cfbbc25506bd78e169c2b240a1a0e2",
    "environment": "local, macOS, Node 24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-06",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "si confirmo"
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
    "date": "2026-10-06",
    "technical_summary": "Se conectaron las proposiciones Jev a análisis, plan e integración preparada, con políticas por proposición, expansión segura, recibos compatibles y pruebas de regresión.",
    "functional_summary": "Los gates pueden incorporar preguntas configuradas sin cambiar la autoridad de los gates base; las requeridas bloquean según sus propios umbrales y las informativas quedan como contexto.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación ni etiquetado. La release permanece unreleased."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Esta sesión Codex también cerró FEATURE-CONFIG-PROPOSICIONES-JEV-20260926; la interfaz no expone un agregado verificable por ticket, por lo que no se registra una estimación.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-evolucion-harness",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T03:40:40.791Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T03:41:46.147Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (recibo GR-20261006-FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926-analysis-1, canal mission-control, decidida 2026-10-06T03:41:46.144Z): El PO aprueba el análisis tras revisar el recibo en revisión humana: «si»."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T03:43:03.777Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T03:50:47.422Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T03:51:02.864Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T03:56:48.852Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T03:57:08.815Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T03:59:15.995Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T03:59:16.643Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T03:59:17.044Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T03:59:17.478Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T04:00:04.955Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T04:00:05.411Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
