---
schema_version: 2
id: FEATURE-CONFIG-BINDINGS-MAQUINA-20261001
title: Separar políticas compartibles de bindings por máquina
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
created: 2026-10-01
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CONFIG-BINDINGS-MAQUINA-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-PRO-004: La configuración DEBE separar las políticas compartibles de los bindings propios de cada máquina.
Depende de: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001.
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

- Alcance: contrato de configuración para distinguir el identificador lógico y las políticas versionables del proyecto frente a los bindings locales por máquina.
- Usuario o rol afectado: equipos que adoptan el harness en una raíz, perfil Hermes u otro cliente local distintos de los del autor del repositorio.
- Comportamiento actual: `.valmen/config.yaml` acepta claves generales del proyecto, pero no declara qué datos son portables ni existe un esquema validado para asociar una raíz y perfiles locales a un `project-id`. Las integraciones resuelven ubicaciones por separado.
- Comportamiento esperado: la política compartida declara solo `project-id` lógico; `~/.valmen/bindings.local.yaml` declara el `machine-id` y, por proyecto, la raíz absoluta y referencias locales como perfil Hermes. Ningún binding admite secretos, y otro equipo puede crear su archivo local sin editar la política versionada.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` analiza la configuración compartida sin E/S; `packages/core/src/execution-identity.ts` ya valida `projectId` lógico. `packages/cli/src/mcp.ts` y `packages/cli/src/hermes.ts` conservan las raíces y perfiles fuera de las entradas versionadas. `.gitignore` excluye `*.local.yaml`; `packages/credentials` resuelve secretos en un almacén independiente.
- Causa raíz confirmada: el aislamiento existe como convención en varios conectores, no como contrato único. No hay una fuente local validada que vincule una identidad de proyecto con su raíz, máquina y perfil, ni una frontera que impida confundirla con la política compartible.
- Riesgos y compatibilidad: una ruta o perfil versionado filtraría contexto personal y rompería la adopción en otra máquina. El archivo local debe contener un esquema cerrado y no credenciales; la configuración existente sin `project-id` debe seguir leyéndose hasta que el ticket de resolución autorizada exija el nuevo contexto. No se modifican configuraciones globales de Hermes, Codex ni hosts permitidos.
- Impactos de sync, migración, Docker o despliegue: no hay. Es configuración local sin servicio, migración ni conectividad remota; los cambios de instalación y de despacho quedan en tickets posteriores.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «Si» (2026-10-01).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. En `packages/adapter/src/config.ts`, añadir lectura validada de `project-id` como identidad lógica compartible y rechazar un bloque de bindings locales dentro de `config.yaml`.
  2. Crear `packages/adapter/src/machine-bindings.ts` con el esquema cerrado de `~/.valmen/bindings.local.yaml`: versión, `machine-id` y bindings indexados por `project-id`, con raíz absoluta y perfil Hermes opcional; no acepta campos de secreto ni rutas relativas.
  3. Exportar el contrato por `packages/adapter/src/index.ts` para que la resolución autorizada y la futura puesta en marcha usen la misma lectura.
  4. Crear `tests/machine-bindings.test.ts` para comprobar que una política compartida no contiene bindings, que dos máquinas pueden declarar raíces/perfiles distintos para el mismo proyecto y que claves de secreto o rutas relativas se rechazan.
  5. Ejecutar `npx vitest run tests/machine-bindings.test.ts` y `npm run build` desde la raíz.
- Rollback: retirar el nuevo lector y los exports. Como el lector es aditivo y no reescribe configuraciones existentes, no hay datos que migrar ni configuración global que restaurar.

## Criterios de aceptación

- [x] R-PRO-004: La configuración DEBE separar las políticas compartibles de los bindings propios de cada máquina.
      <!-- test: npx vitest run tests/machine-bindings.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/config.ts` reconoce `project-id` lógico y rechaza el bloque `machine-bindings` dentro de la política versionada.
- Se añadió `packages/adapter/src/machine-bindings.ts`: analiza `~/.valmen/bindings.local.yaml` con un esquema cerrado de versión, `machine-id`, raíz absoluta y perfil Hermes opcional por proyecto; no admite campos de credenciales.
- `packages/adapter/src/index.ts` exporta ambos contratos para su consumo por la resolución autorizada y la puesta en marcha futuras.
- `tests/machine-bindings.test.ts` cubre la separación, dos máquinas con bindings distintos y el rechazo de rutas relativas o campos de secreto.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/machine-bindings.test.ts` — pasó: 5 pruebas de contrato, aislamiento y rechazo de entradas inválidas.
- `npm run build` — pasó: TypeScript compila y la interfaz se copia al artefacto CLI.
- `npx vitest run` — pasó: 1.682 pruebas, 48 omitidas de equivalencia opcional.
- `valmen secrets` y `git diff --check` — pasaron.
- Validación manual propuesta: en una máquina distinta, crear `~/.valmen/bindings.local.yaml` con su `machine-id`, raíz y perfil propios para `valmen-harness`; `.valmen/config.yaml` no debe cambiar.
- Entorno: Node 24 y dependencias npm ya instaladas; no requiere Hermes en ejecución, Mission Control ni credenciales.
- Resultado comunicado por el PO: bindings locales creados para ValmenHarness y SaiOpenCloud; perfiles Hermes verificados y asociados.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:f8c8a0c572a71ef0a74896b3964c93f27ca371322622e923af7c8b6cec976fc2",
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
    "po_confirmation": "listo que seguirira"
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
    "description": "La suite específica verifica que las políticas compartidas no contienen bindings y que los bindings locales aíslan dos máquinas.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-02",
    "kind": "manual-test",
    "description": "Se creó y validó ~/.valmen/bindings.local.yaml con ValmenHarness, SaiOpenCloud y sus perfiles Hermes correspondientes.",
    "reference": "worktree:sha256:f8c8a0c572a71ef0a74896b3964c93f27ca371322622e923af7c8b6cec976fc2",
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
    "technical_summary": "La política compartida declara project-id y el lector local valida bindings por máquina con raíz absoluta y perfil Hermes opcional.",
    "functional_summary": "Dos proyectos pueden usar la misma política portable y conservar rutas y perfiles Hermes propios de esta máquina.",
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
    "at": "2026-10-01T19:10:44.343Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T00:21:41.891Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T00:31:25.398Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Si apruebo"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T00:31:25.579Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T00:32:20.822Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T00:32:20.996Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T00:34:28.134Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T00:34:30.090Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:32.777Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:32.953Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:33.110Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:33.267Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:33.419Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:33.571Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:33.697Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T00:57:33.767Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
