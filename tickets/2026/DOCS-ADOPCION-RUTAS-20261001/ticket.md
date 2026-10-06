---
schema_version: 2
id: DOCS-ADOPCION-RUTAS-20261001
title: Guiar puesta en marcha por CLI, MCP y Hermes opcional
type: DOCS
module: ADOPCION
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# DOCS-ADOPCION-RUTAS-20261001

## Solicitud original

Parte del sprint: Entregar adopción portable, diagnóstico y verificación temporal reutilizables.
- R-ADO-001: La puesta en marcha DEBE ofrecer rutas CLI, MCP y Hermes opcional por separado.
- R-ADO-002: La guía DEBE permitir configuración por persona o agente con comprobaciones de resultado.
Depende de: FEATURE-CLI-EJECUCION-DIRECTA-20261001, FEATURE-MCP-EJECUCION-DIRECTA-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [adopcion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/adopcion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: actualizar la guía de puesta en marcha portable para separar la ruta mínima por CLI, la conexión MCP y la integración opcional con Hermes; incluir la observación directa de ejecuciones y comprobaciones que no dependan de Hermes, Mission Control ni de un proveedor semántico.
- Usuario o rol afectado: persona que adopta el harness en un proyecto autorizado y agentes con terminal o cliente MCP que siguen esa puesta en marcha.
- Comportamiento actual: `docs/15-PUESTA-EN-MARCHA.md` explica la adopción inicial, la instalación MCP y la conexión opcional de Hermes, pero no incorpora el contrato de actividad directa que ya exponen CLI y MCP ni una comprobación explícita de cada ruta.
- Comportamiento esperado: una persona o agente puede elegir sólo CLI, CLI más MCP, o agregar Hermes después; la guía declara los requisitos, las escrituras que hará cada paso, cómo comprobar su resultado y qué falta cuando una herramienta local no está disponible, sin afirmar una conexión no ejecutada.

## Diagnóstico

- Archivos y flujo investigados: `docs/15-PUESTA-EN-MARCHA.md:55-70` concentra `adopt`, `sync` y `doctor`; `:171-195` conecta MCP y conserva entradas existentes; `:225-275` presenta Hermes como opción aparte. La guía no nombra `execution`. El flujo directo ya vive en `packages/cli/src/execution.ts:25-124`: `valmen execution record|list|journeys` resuelve sólo un proyecto autorizado y persiste o lee actividad sin Hermes. MCP publica las mismas puertas `registrar_actividad_ejecucion` y `ver_actividad_ejecucion` en `packages/mcp/src/tools.ts:281-315`, y sus manejadores vuelven a resolver el proyecto autorizado y delegan en `createExecutionContract` (`:1959-1979`).
- Causa raíz o hipótesis: las rutas de adopción fueron documentadas antes de que los tickets predecesores expusieran la actividad directa por CLI y MCP. La guía describe instalación general, pero no transforma esas superficies nuevas en rutas separadas con verificación, por lo que quien no usa Hermes no sabe cómo comprobar que puede observar una ejecución ni qué capacidades quedan opcionales.
- Riesgos y compatibilidad: la guía debe conservar las garantías existentes: `valmen mcp --install` fusiona configuraciones ajenas, Hermes permanece opcional y toda operación de actividad exige un `project-id` autorizado. No debe prometer que un chat sin terminal o MCP puede efectuar escrituras locales, ni convertir observación en autorización de despacho, aprobación de gates o cambio de credenciales. AP-002 se consultó: al documentar ejemplos, no se debe sugerir importar índices internos; las superficies públicas son CLI y MCP.
- Impactos de sync, migración, Docker o despliegue: ninguno; el alcance es documentación y ejemplos sobre comandos locales existentes, sin cambio de esquema, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Aprobación literal en esta conversación: «Si apruebo».
- Alcance y exclusiones: se documentarán las rutas de adopción y sus comprobaciones en la guía existente. Quedan fuera cambios al comportamiento de `adopt`, `sync`, `doctor`, `mcp`, Hermes, el contrato de ejecución, configuraciones locales reales, credenciales, bindings, despacho y Mission Control.
- Pasos ordenados:
  1. Actualizar `docs/15-PUESTA-EN-MARCHA.md`, en la puesta en marcha inicial y la sección de conexión del agente, para diferenciar la ruta mínima CLI de la ruta MCP y de Hermes opcional. La ruta CLI mostrará la consulta segura `valmen execution journeys --project <project-id> --json` como comprobación de la superficie directa; la ruta MCP nombrará `registrar_actividad_ejecucion`, `ver_actividad_ejecucion` y el reinicio del cliente; Hermes conservará su sección independiente y explícitamente opcional.
  2. Actualizar el bloque «Para el agente» de `docs/15-PUESTA-EN-MARCHA.md` para que determine si dispone de terminal o MCP antes de actuar, ejecute sólo la ruta elegida y declare la herramienta ausente en vez de afirmar una instalación o conexión local ficticia. Mantendrá las pausas para decisiones de proveedor, modelos, Hermes y cualquier escritura fuera del alcance autorizado.
  3. Extender `tests/docs-perfil-hermes.test.ts` con comprobaciones textuales acotadas que vinculen las tres rutas de la guía a los comandos y herramientas públicos ya implementados, preservando la comprobación vigente del perfil Hermes. Ejecutar `npx vitest run tests/docs-perfil-hermes.test.ts` desde la raíz para verificar que la documentación nombra las superficies reales.
- Rollback: revertir únicamente los cambios de `docs/15-PUESTA-EN-MARCHA.md` y `tests/docs-perfil-hermes.test.ts`; no hay datos, configuración local ni comportamiento de producto que revertir.

## Criterios de aceptación

- [x] R-ADO-001: La puesta en marcha DEBE ofrecer rutas CLI, MCP y Hermes opcional por separado, y la ruta CLI debe comprobar la consulta directa de jornadas de un proyecto autorizado.
      <!-- test: npx vitest run tests/docs-perfil-hermes.test.ts -->
- [x] R-ADO-002: La guía DEBE permitir configuración por persona o agente con comprobaciones de resultado y declarar una herramienta local ausente sin afirmar una conexión ficticia.
      <!-- test: npx vitest run tests/docs-perfil-hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `docs/15-PUESTA-EN-MARCHA.md` ahora separa la ruta CLI mínima, la ruta MCP y Hermes opcional. Declara el binding local que exige la observación directa, usa `execution journeys` como comprobación de sólo lectura y explica que MCP no se afirma conectado cuando faltan las herramientas locales.
- El texto para agentes conserva las decisiones humanas y añade la elección explícita de CLI, MCP y Hermes, sin convertir observación en autorización de despacho o gates.
- `tests/docs-perfil-hermes.test.ts` vincula la guía con `valmen execution journeys` y las herramientas públicas MCP de actividad, además de conservar la prueba del perfil Hermes.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/docs-perfil-hermes.test.ts` — 3 pruebas aprobadas; la prueba nueva falló antes de la guía con «la guía no separa las rutas de adopción» y pasó después de documentar CLI/MCP.
- `valmen execution journeys --project valmen-harness --json` — consulta de sólo lectura aprobada: resolvió el proyecto autorizado, sin ejecutores de despacho y sin jornadas registradas.
- `npx vitest run` — 2.123 pruebas aprobadas y 48 omitidas de equivalencia opcional.
- `git diff --check` y `valmen secrets` — aprobados; no hay errores de espacio ni secretos en los 5 archivos modificados.
- Validación manual para el responsable: en una raíz autorizada con binding local, seguir la ruta CLI y confirmar que `execution journeys` responde aun sin Hermes; después, sólo si el cliente MCP está disponible y se autoriza su instalación, comprobar que ofrece las dos herramientas de actividad. En un chat sin terminal ni MCP, verificar que informa la limitación sin declarar una conexión local.
- Entorno: Node 24 y dependencias npm instaladas; la comprobación CLI no requiere Hermes, Mission Control, worker ni proveedor semántico.
- Resultado comunicado por el PO: pruebas de la ruta MCP completadas y aprobadas en esta conversación: «listo ya entonces podemos continuar con el siguiente ticket».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:f63e33e8c4c3ec0406ce31de0a238a5df17f80354dcbe36cf7ced9435b804311",
    "environment": "local-macos",
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
    "po_confirmation": "Confirmación del PO en esta conversación: «listo ya entonces podemos continuar con el siguiente ticket»."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-05",
    "kind": "manual-test",
    "description": "Con autorización del PO se ejecutó valmen mcp --install: creó .mcp.json del proyecto sin alterar configuraciones globales. valmen-mcp --check inició sobre el registro actual y publicó registrar_actividad_ejecucion y ver_actividad_ejecucion entre 42 herramientas.",
    "reference": null,
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-06",
    "technical_summary": "La guía separa CLI, MCP y Hermes opcional; la prueba de documentación se enlaza con las superficies públicas de ejecución y MCP.",
    "functional_summary": "Una persona o agente puede elegir una ruta de adopción verificable sin suponer Hermes ni una conexión local inexistente.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: documentación, prueba y configuración MCP de proyecto permanecen sin commit ni release."
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
    "notes": "Sesión de Codex sin un agregado de tokens o coste expuesto a este ticket; se declara manualmente para no inventar una medición.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-sesion-2026-10-05",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:45.534Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T22:27:24.329Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T23:05:29.497Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Aprobación explícita del PO en esta conversación: «Si dale»."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T23:06:27.307Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T23:13:25.984Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T23:13:40.474Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T23:17:48.882Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T23:18:00.120Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T23:23:33.313Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T00:11:27.875Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T00:11:28.136Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T00:11:28.332Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T00:11:46.690Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T00:11:48.021Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-06T00:11:48.269Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
