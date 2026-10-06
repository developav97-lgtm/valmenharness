---
schema_version: 2
id: FEATURE-CONFIG-PROPOSICIONES-JEV-20260926
title: Declarar proposiciones Jev por etapa
type: FEATURE
module: CONFIG
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

# FEATURE-CONFIG-PROPOSICIONES-JEV-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-007: Validación semántica ampliada por etapa — El proyecto DEBE poder declarar proposiciones adicionales de Jev por etapa del
Depende de: FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: permitir que el proyecto declare, para una etapa de compuerta conocida, proposiciones semánticas adicionales que el evaluador Jev debe contestar junto con las proposiciones base y las que se derivan del ticket.
- Usuario o rol afectado: responsable que define la política del proyecto y revisa los recibos de `analysis`, `plan` o `qa-mechanical`.
- Comportamiento actual: `config.yaml` solo declara promociones de gates; las proposiciones salen de las definiciones estáticas y de la expansión por criterios, impactos e interfaz.
- Comportamiento esperado: la configuración valida una lista cerrada y segura de proposiciones adicionales por etapa; cada una llega a la evaluación y al recibo con sus umbrales y consumo, y el motor conserva la regla de conjunción: una proposición nueva puede bloquear o informar, pero nunca aprobar, eliminar ni rebajar el efecto de otra.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts:38-57` analiza el YAML estricto y `:115-159` es el patrón de una política declarativa con claves cerradas; `packages/gate/src/definitions.ts:25-178` y `:187-298` fijan las proposiciones de las etapas; `packages/gate/src/dynamic.ts:551-664` solo agrega criterios, impactos e interfaz desde el ticket; `packages/engine/src/gate.ts:392-404` construye esa expansión, `:490-533` evalúa y decide en código, y `:582-607` emite el recibo; `packages/gate/src/receipt.ts:100-155` ya almacena proposiciones evaluadas, política, modelo y uso. La memoria aplicable es AP-001 (`.valmen/memory/aprendizajes.md:5`): una proposición compuesta induce revisiones espurias y debe partirse en preguntas atómicas.
- Causa raíz o hipótesis: no hay tipo ni lector para una sección de configuración de proposiciones por etapa, y `runGate` no recibe esa política al construir el gate efectivo. Por eso un proyecto no puede añadir la comprobación exigida por R-S5-007 para integración desatendida ni otra validación semántica declarada.
- Riesgos y compatibilidad: aceptar texto, IDs o efectos libres permitiría cambiar la autoridad de una compuerta mediante YAML. La política debe usar etapas conocidas, IDs deterministas y tipos/efectos permitidos; la ausencia de configuración debe conservar exactamente las proposiciones, decisiones y recibos actuales. Las proposiciones añadidas deben ser atómicas y solo pueden endurecer (`block`) o informar (`verdict: false`), nunca emitir `approve`, sustituir una existente ni promocionar el modo del gate. Los recibos existentes son append-only y el formato ya admite la información exigida.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es configuración local del harness y evaluación de gates; no hay sincronización, migración de datos, contenedor ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Juan Andrade autorizó continuar pese al bloqueo del recibo `GR-20261006-FEATURE-CONFIG-PROPOSICIONES-JEV-20260926-plan-2` con la frase: «si dale perfecto».
- Alcance y exclusiones: se define el contrato seguro de `jev-propositions` y su lectura tipada; no se habilita ninguna proposición en este proyecto, no se promueve un gate y no se conecta todavía la configuración a una corrida autónoma. Ese consumo corresponde a `FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926`.
- Pasos ordenados:
  1. `tests/config-jev-propositions.test.ts` (nuevo) — escribir primero casos para: ausencia de `jev-propositions` (lista vacía e inmutable); una proposición requerida e informativa válida por cada etapa admitida; rechazo de etapa desconocida, claves sobrantes, identificador fuera del prefijo reservado `custom-`, duplicado por etapa, texto vacío, peso no positivo y umbrales no numéricos, fuera de `[0,1]` o con `block-at >= approve-at`; y regresión de que la sección no puede pedir promoción ni un efecto que sustituya una proposición base.
  2. `packages/adapter/src/config.ts` — definir el contrato `JevStage` (`analysis`, `plan`, `integration`), `JevPropositionConfig` y `readJevPropositions(config)`. Leer `jev-propositions` como mapa por etapa con listas de mapas; aceptar solo `id`, `description`, `instructions`, `criteria`, `weight`, `approve-at`, `block-at` y `verdict`; exigir preguntas atómicas con criterios `yes` y `no`; congelar el resultado. `verdict` solo admite `required` o `inform`: el primero aporta un requisito adicional y el segundo queda descriptivo. No se aceptan efectos, modos, ni claves de promoción; una proposición requerida no puede relajar las proposiciones base porque el consumidor deberá evaluarla por conjunción.
  3. `packages/adapter/src/index.ts` — exponer los tipos y el lector desde el borde público del adaptador si la exportación actual no los alcanza, sin introducir dependencias de `@valmen/gate` en el adaptador ni dependencias externas.
  4. `docs/03-GATES.md` — documentar el bloque `jev-propositions`, su ejemplo mínimo, etapas permitidas, la diferencia entre `required` e `inform`, y el límite de autoridad: declarar una pregunta no modifica el modo del gate ni reemplaza sus proposiciones. Indicar que `integration` queda declarado para su futuro consumidor y que la ausencia conserva el comportamiento vigente.
  5. Ejecutar la prueba enfocada y la batería completa. Confirmar además por prueba que el objeto resultante es inmutable y que una configuración inexistente no cambia las proposiciones actuales; el ticket de motor posterior probará la expansión, decisión y recibo en una corrida real.
- Rollback: revertir el lector, sus tipos, la exportación y su documentación; como ninguna configuración se activa ni el motor consume la sección en este ticket, los proyectos existentes y los recibos append-only permanecen sin cambios.

## Criterios de aceptación

- [x] Un proyecto sin `jev-propositions` recibe una colección vacía e inmutable y conserva el comportamiento actual.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->
- [x] La configuración admite una proposición `custom-…` atómica para las etapas `analysis`, `plan` e `integration` con descripción, instrucciones, criterios, peso, umbrales y modo de veredicto.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->
- [x] El lector rechaza etapas, claves, identificadores, duplicados, textos, pesos y umbrales inválidos con la ruta de `config.yaml` que falló.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->
- [x] Una declaración solo puede ser `required` o `inform` como modo de veredicto.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->
- [x] El lector rechaza una declaración que incluya efectos.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->
- [x] El lector rechaza una declaración que incluya promoción de modo o sustitución de una proposición base.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->
- [x] La documentación explica el contrato y que agregar una proposición no amplía autoridad ni activa integración automática.
      <!-- test: npx vitest run tests/config-jev-propositions.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `readJevPropositions` en `packages/adapter/src/config.ts` con contrato inmutable para `analysis`, `plan` e `integration`.
- El lector exige IDs `custom-…`, preguntas atómicas, criterios `yes`/`no`, peso positivo, banda de umbrales válida y los únicos modos `required` e `inform`; rechaza cualquier clave que pretenda cambiar efectos, promociones o proposiciones base.
- Se documentó el bloque en `docs/03-GATES.md`. No se añadió una configuración activa ni se conectó el lector a la ejecución autónoma: esa integración sigue fuera del alcance de este ticket.

## Pruebas

- Directorio de ejecución: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- Comando enfocado: `npx vitest run tests/config-jev-propositions.test.ts`.
- Comando de regresión: `npx vitest run`.
- Resultado esperado: la prueba enfocada cubre el contrato del lector y la batería completa termina sin fallos atribuibles al ticket.
- Validación manual: revisar el ejemplo de `docs/03-GATES.md` y verificar que no ofrece un mecanismo para promover un gate ni integrar cambios sin la autorización correspondiente.
- Requisitos de ambiente: Node 24 y dependencias de npm ya instaladas; no usa red, credenciales, contenedores ni datos externos.
- Resultado técnico: `npx vitest run tests/config-jev-propositions.test.ts` aprobó 10/10; `npx vitest run` aprobó 2.171 pruebas en 139 archivos (48 omitidas en un archivo); `npm run typecheck` aprobó. El recibo `GR-20261006-FEATURE-CONFIG-PROPOSICIONES-JEV-20260926-qa-mechanical-2` aprobó los siete criterios declarados.
- Resultado del PO: Juan Andrade confirma que las pruebas ya ejecutadas son suficientes para aprobar QA: «si ya ejecutaste los test ya con eso seria necesario para aprobar QA».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:726ae4f650c1ce7358feadb3436cbc8cff87ed0a739e87a8f2b3074ed9a6a20f",
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
    "po_confirmation": "si ya ejecutaste los test ya con eso seria necesario para aprobar QA"
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
    "technical_summary": "Se añadió en @valmen/adapter el lector validado e inmutable de jev-propositions por etapa, con rechazo explícito de configuraciones inválidas, y su cobertura unitaria.",
    "functional_summary": "Los proyectos pueden declarar proposiciones Jev adicionales para análisis, plan e integración sin que la ausencia de configuración cambie el comportamiento actual ni que la configuración otorgue autoridad de decisión.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin impacto de release: el cambio permanece sin publicar y la configuración ausente conserva el comportamiento vigente."
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
    "notes": "La sesión Codex atendió este ticket, pero esta interfaz no expone el agregado verificable de tokens ni coste por ticket; no se registra una estimación.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-sin-agregado",
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
    "at": "2026-10-06T03:22:01.841Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T03:24:25.179Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T03:28:26.482Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade pese al bloqueo (recibo GR-20261006-FEATURE-CONFIG-PROPOSICIONES-JEV-20260926-plan-2, canal mission-control, decidida 2026-10-06T03:28:26.473Z): Autorización explícita del PO: «si dale perfecto»."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T03:28:41.315Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T03:28:51.986Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T03:33:07.962Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T03:37:02.516Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T03:37:03.499Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T03:37:04.084Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T03:37:04.546Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T03:39:08.167Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T03:39:09.958Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T03:39:10.762Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
