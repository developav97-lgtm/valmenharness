---
schema_version: 2
id: FEATURE-ADAPTER-CAPACIDADES-20261001
title: Declarar capacidades y límites de adaptadores
type: FEATURE
module: ADAPTER
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

# FEATURE-ADAPTER-CAPACIDADES-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-CON-005: Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.
Depende de: FEATURE-ENGINE-CONTRATO-EJECUCION-20261001, FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: contrato puro de `@valmen/adapter` para que un adaptador declare, de manera completa, si puede observar estados, leer actividad, leer mensajes o despachar, y el límite explícito de cada capacidad. No instala, sondea ni conecta integraciones.
- Usuario o rol afectado: adaptadores futuros de Hermes, OpenCode, Codex y clientes genéricos; las puertas CLI, MCP y Mission Control que deben mostrar hechos disponibles sin suponer acceso.
- Comportamiento actual: `readExecutionCapabilities` en `packages/adapter/src/config.ts` devuelve únicamente `observationSources` y `dispatchExecutors`, listas de consentimiento del proyecto. Ningún módulo o exportación de `@valmen/adapter` devuelve para un adaptador las operaciones `observe-states`, `read-activity`, `read-messages` y `dispatch`, ni su limitación.
- Comportamiento esperado: cada adaptador produce un perfil inmutable con las cuatro capacidades canónicas, cada una declarada como disponible o no disponible y con su límite o ausencia de límite explícitos. Una capacidad no disponible no invalida las disponibles ni habilita permisos, lectores o despacho.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` define `ExecutionCapabilities` y lee `execution.observation-sources` / `execution.dispatch-executors` como consentimiento opt-in; `packages/adapter/src/index.ts` es la exportación pública. `packages/engine/src/execution-contract.ts` entrega el historial genérico y no debe conocer las particularidades de cada fuente. R-CON-005 y D4 separan expresamente el contrato de un adaptador de su instalación o de los bindings locales.
- Causa raíz confirmada: el síntoma verificable es que un consumidor que recibe `ExecutionCapabilities` solo puede leer las dos listas de configuración; no existe ningún valor que responda si `hermes`, `opencode`, `codex` o un cliente genérico soporta mensajes, actividad o despacho. Ocurre porque `packages/adapter/src` no tiene un contrato ni una exportación de perfil por adaptador: `config.ts` representa elección del proyecto, no compatibilidad del ejecutor. Por eso un consumidor debe adivinar desde instalación/configuración o esconder una fuente parcial. Usar las listas de configuración como si probaran soporte confundiría autorización con compatibilidad; inferir mensajes desde fases, o despacho desde la presencia de Hermes, contradice la spec y hace que una fuente incompleta bloquee las sanas.
- Riesgos y compatibilidad: se añade una API pura y aditiva, sin alterar `ExecutionCapabilities` ni configuraciones existentes. El perfil exigirá exactamente las capacidades `observe-states`, `read-activity`, `read-messages` y `dispatch`; cada declaración incluye `available` y `limitation` (texto no vacío o `null`) para que la ausencia se comunique, no se deduzca. No contendrá rutas, perfiles, credenciales, contenido de conversaciones ni acceso a red.
- Supuestos y decisiones pendientes: un límite describe la restricción pública que un consumidor debe respetar —por ejemplo, «solo lectura» o «mensajes no expuestos»—; no mide salud de una instalación ni reemplaza el consentimiento configurado. Los lectores de Hermes, OpenCode y Codex declararán sus perfiles concretos en sus tickets dependientes.
- Gate de análisis: el PO aprobó desbloquearlo el 2026-10-03 tras cuatro bloqueos contradictorios de `diagnostico_explica_el_sintoma`; `AP-004` conserva el vector para refinar la compuerta y validarlo con regresión, sin ampliar este ticket.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: añadir el contrato de perfil de adaptador y sus validaciones en `@valmen/adapter`. Quedan fuera los lectores reales, el probing de versiones/acceso, la configuración de fuentes, Mission Control, credenciales, conexiones y despacho.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La compuerta `GR-20261003-plan` aprobó la revisión 8585 el 2026-10-03; autorización vigente del PO: aprobar directamente el plan si pasa la compuerta.
- Pasos ordenados:
  1. Crear `packages/adapter/src/capabilities.ts` con el vocabulario cerrado de capacidades, el perfil de adaptador y una fábrica que valide identificador portable, las cuatro declaraciones únicas, disponibilidad booleana y limitación explícita o nula; devolver objetos inmutables.
  2. Exportar el contrato desde `packages/adapter/src/index.ts`, sin acoplarlo al parser de configuración ni a `ExecutionContract`, para que los lectores posteriores combinen compatibilidad declarada y consentimiento del proyecto sin que una capa interprete a la otra.
  3. Añadir `tests/adapter-capabilities.test.ts` para cubrir un ejecutor con estados/actividad disponibles y mensajes no expuestos, capacidad ausente sin bloqueo de las presentes, perfiles incompletos o duplicados, límites inválidos e inmutabilidad. Ejecutar `npx vitest run tests/adapter-capabilities.test.ts tests/machine-bindings.test.ts` desde la raíz.
- Compatibilidad: `ExecutionCapabilities` y sus configuraciones no cambian; los consumidores existentes no importan el nuevo perfil y los adaptadores nuevos lo adoptan explícitamente.
- Rollback: dejar de exportar y consumir `capabilities.ts`; no hay estado persistido, configuración reescrita ni integración iniciada que requiera reversión.

## Criterios de aceptación

- [x] R-CON-005: Un perfil de adaptador declara de forma inmutable las cuatro capacidades canónicas, su disponibilidad y su limitación explícita o ausencia de limitación.
      <!-- test: npx vitest run tests/adapter-capabilities.test.ts -->
- [x] R-CON-005: Un adaptador sin mensajes puede declarar esa ausencia sin ocultar estados o actividad disponibles.
      <!-- test: npx vitest run tests/adapter-capabilities.test.ts -->
- [x] R-CON-005: Perfiles incompletos, duplicados o con identificadores y límites inválidos se rechazan sin consultar configuración, bindings ni servicios externos.
      <!-- test: npx vitest run tests/adapter-capabilities.test.ts tests/machine-bindings.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/adapter/src/capabilities.ts` con un perfil inmutable de adaptador y las cuatro operaciones canónicas: observar estados, leer actividad, leer mensajes y despachar.
- La fábrica exige una única declaración por operación, disponibilidad booleana y una limitación visible para toda capacidad no disponible; `null` declara explícitamente que no existe límite adicional.
- El contrato se exportó desde `packages/adapter/src/index.ts`. No lee configuración, bindings ni servicios externos, por lo que no confunde compatibilidad del adaptador con consentimiento del proyecto.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/adapter-capabilities.test.ts tests/machine-bindings.test.ts` — pasó: 2 archivos y 13 pruebas. Cubre perfil completo e inmutable, fuente parcial, declaraciones incompletas o repetidas y límites inválidos, conservando la configuración de consentimiento existente.
- `npm run build` — pasó: TypeScript de producción compila y la interfaz se copia al artefacto CLI.
- `npx vitest run` — pasó: 106 archivos y 1828 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- Resultado del PO: autorizó continuar el ticket y cerrar, commitear y hacer push si las pruebas ejecutadas pasan. Las pruebas específicas, la compilación y la suite completa dieron el resultado esperado.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:dd46e91c32f4cfb35c8c5bee0d25573e3dea0a75d703cd541f24ddba84c6e935",
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
    "po_confirmation": "El PO autorizó continuar el ticket y cerrar, commitear y hacer push si las pruebas ejecutadas pasan."
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
    "technical_summary": "Se añadió un contrato inmutable y completo para declarar capacidades y límites de un adaptador, separado del consentimiento de configuración.",
    "functional_summary": "Los lectores posteriores pueden comunicar estados, actividad, mensajes y despacho disponibles o ausentes sin inferir permisos ni ocultar fuentes parciales.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación, integración, configuración externa ni migración; el contrato queda disponible para los lectores dependientes."
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
    "notes": "Sesión actual de Codex compartida con tickets previos y con FEATURE-ADAPTER-CAPACIDADES-20261001; no existe un agregado verificable por ticket, por lo que no se asignan tokens ni coste inventados.",
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
    "at": "2026-10-01T19:10:44.720Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T07:48:52.860Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T07:57:09.637Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T07:58:32.368Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T07:58:32.539Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:44.139Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:44.301Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:44.487Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:54.878Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:55.040Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:55.196Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:55.857Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T08:00:56.018Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
