---
schema_version: 2
id: FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001
title: Resolver cada operación contra proyecto autorizado
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
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-PRO-002: Cada operación DEBE resolver su proyecto contra una declaración autorizada.
- R-PRO-003: Una sesión sin directorio DEBE requerir asociación explícita para mostrarse como propia de un proyecto.
Depende de: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001, FEATURE-CONFIG-BINDINGS-MAQUINA-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [proyectos/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/proyectos/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: resolvedor de proyecto autorizado en el motor y asociación explícita de perfiles Hermes sin directorio.
- Usuario o rol afectado: CLI, MCP, Mission Control y lectores de adaptadores que necesiten operar o atribuir actividad a uno de los proyectos declarados en la máquina.
- Comportamiento actual: cada superficie construye `RegistryPaths` desde su propia raíz. Un futuro selector podría aceptar una ruta recibida de una petición, y los lectores no tienen un contrato común para asociar un perfil Hermes sin `cwd`.
- Comportamiento esperado: una operación pide un `projectId` lógico; el motor lo resuelve solo desde `~/.valmen/bindings.local.yaml`, comprueba que la política del repositorio declara el mismo ID y devuelve el contexto del registro. Una sesión sin directorio solo obtiene proyecto por coincidencia exacta de perfil Hermes declarado; de otro modo no se atribuye.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/discovery.ts` construye `RegistryPaths` desde una raíz; CLI, MCP y servidor la llaman directamente. `packages/adapter/src/machine-bindings.ts` valida bindings locales y `packages/adapter/src/config.ts` lee `project-id`. `packages/server/src/hermes.ts` ya excluye sesiones sin directorio; el adaptador Hermes posterior consumirá la asociación de perfil.
- Causa raíz confirmada: no existe un único resolvedor que convierta una identidad lógica en una raíz autorizada. Pasar una ruta a `choosePaths` es válido para procesos locales actuales, pero no demuestra que pertenezca a un proyecto declarado ni protege las nuevas superficies multiproyecto.
- Riesgos y compatibilidad: el resolvedor no debe aceptar una raíz proporcionada por cliente ni inventar perfiles. Debe rechazar binding ausente, raíz inaccesible, configuración sin `project-id` o ID diferente. Para no romper el flujo existente, los comandos actuales conservan su `--root`; las nuevas operaciones multiproyecto deberán usar el resolvedor. El lector Hermes vigente continúa excluyendo sesiones sin `cwd` hasta que su ticket de adaptador incorpore el vínculo de perfil.
- Impactos de sync, migración, Docker o despliegue: no hay. Lee configuración local y de proyecto; no escribe bindings, no abre red, no cambia credenciales ni perfiles Hermes.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «si, porfa de aqui en adelante te voy a dar autorizacion para que apruebes los planes y los analisis» (2026-10-01).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Declarar `@valmen/adapter` como dependencia de `@valmen/engine` para reutilizar el contrato de bindings y política compartida, sin duplicar su parser.
  2. Crear `packages/engine/src/project-resolution.ts` con lectura del archivo local, resolución por `projectId`, verificación de igualdad con `project-id` de cada repositorio y rechazo de cualquier binding inconsistente o no declarado.
  3. Añadir una consulta exacta de perfil Hermes que devuelva proyecto solo cuando el binding lo declara; una sesión sin coincidencia devuelve `null`.
  4. Exportar el resolvedor desde `packages/engine/src/index.ts` sin reemplazar los flujos actuales de `--root`.
  5. Crear `tests/project-resolution.test.ts` para cubrir dos proyectos válidos, ID desconocido, ruta declarada que no coincide con su política y asociación/no asociación de perfiles sin directorio.
  6. Ejecutar `npx vitest run tests/project-resolution.test.ts` y `npm run build` desde la raíz.
- Rollback: retirar el resolvedor y su dependencia nueva. El cambio no persiste ejecuciones ni modifica configuraciones, por lo que no requiere migración ni reversión de datos.

## Criterios de aceptación

- [x] R-PRO-002: Cada operación DEBE resolver su proyecto contra una declaración autorizada.
      <!-- test: npx vitest run tests/project-resolution.test.ts -->
- [x] R-PRO-003: Una sesión sin directorio DEBE requerir asociación explícita para mostrarse como propia de un proyecto.
      <!-- test: npx vitest run tests/project-resolution.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/project-resolution.ts` resuelve un `projectId` únicamente desde `~/.valmen/bindings.local.yaml`, comprueba el `project-id` de la política compartida y devuelve el contexto del registro.
- El resolvedor rechaza proyectos no declarados, raíces sin configuración y bindings cuyo ID no coincide con la política del repositorio.
- La asociación de perfil Hermes es exacta: un perfil no declarado devuelve `null`, por lo que una sesión sin directorio no se atribuye por semejanza.
- `@valmen/engine` declara la dependencia y referencia de compilación a `@valmen/adapter`, reutilizando el parser único de bindings.
- `tests/project-resolution.test.ts` cubre proyectos autorizados, inconsistencias y asociación/no asociación de perfiles.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/project-resolution.test.ts` — pasó: 3 pruebas de resolución autorizada y asociación explícita de perfiles.
- `npm run build` — pasó: compila los proyectos TypeScript, incluidas las nuevas referencias de paquete.
- `valmen secrets` y `git diff --check` — pasaron.
- La suite completa se inició y recorrió sus pruebas existentes; el criterio del ticket se verificó de forma aislada porque la terminal agotó su ventana de salida en suites lentas ya existentes.
- Validación manual propuesta: con los bindings locales actuales, resolver `valmen-harness` y `saiopencloud` debe devolver solo sus raíces declaradas; un ID o perfil Hermes inexistente debe rechazarse o devolver `null`.
- Entorno: Node 24, los dos `project-id` y `~/.valmen/bindings.local.yaml` ya configurados; no requiere red ni credenciales.
- Resultado comunicado por el PO: ejecutó la comprobación y obtuvo las dos rutas correctas; el perfil inexistente devolvió `null`.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:ab71080b9a18b1fde2bd69f8fd1e8fb3c6c8a7075ab4028b6a89646fb2c39921",
    "environment": "local-macos",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-02",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El usuario ejecutó la comprobación y mostró las dos rutas correctas; el perfil inexistente devolvió null."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-02",
    "kind": "automated-test",
    "description": "La suite específica valida resolución por project-id, rechazo de bindings inconsistentes y asociación exacta de perfiles Hermes.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-02",
    "kind": "manual-test",
    "description": "El PO ejecutó la resolución contra ValmenHarness y SaiOpenCloud; ambas rutas y perfiles coincidieron y un perfil inexistente devolvió null.",
    "reference": "worktree:sha256:ab71080b9a18b1fde2bd69f8fd1e8fb3c6c8a7075ab4028b6a89646fb2c39921",
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
    "date": "2026-10-02",
    "technical_summary": "El motor resuelve projectId exclusivamente desde bindings locales, valida la política compartida y asocia perfiles Hermes por coincidencia exacta.",
    "functional_summary": "Las operaciones multiproyecto pueden usar contextos declarados sin aceptar rutas arbitrarias ni atribuir sesiones sin vínculo explícito.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; queda unreleased."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión compartida con otros tickets; el gasto no se reparte porque no hay agregado fiable por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida",
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
    "at": "2026-10-01T19:10:44.395Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T00:59:49.394Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T01:00:43.935Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: aaaa ok perfecto"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T01:00:44.108Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T01:02:48.721Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T01:02:48.900Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T01:05:04.284Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T01:05:07.142Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.014Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.234Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.406Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.562Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.713Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.866Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:20.997Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T01:07:21.058Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
