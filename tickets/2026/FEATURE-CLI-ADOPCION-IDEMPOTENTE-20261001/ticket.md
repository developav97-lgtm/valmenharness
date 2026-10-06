---
schema_version: 2
id: FEATURE-CLI-ADOPCION-IDEMPOTENTE-20261001
title: Repetir configuración sin sobrescribir reglas ajenas
type: FEATURE
module: CLI
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

# FEATURE-CLI-ADOPCION-IDEMPOTENTE-20261001

## Solicitud original

Parte del sprint: Entregar adopción portable, diagnóstico y verificación temporal reutilizables.
- R-ADO-003: Repetir la configuración NO DEBE sobrescribir reglas ni conexiones ajenas existentes.
Depende de: FEATURE-CLI-ADOPTAR-PROYECTO-20260926, FEATURE-CONFIG-BINDINGS-MAQUINA-20261001.
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

- Alcance: completar la adopción local de un proyecto con su binding de máquina, conservando la política compartida, reglas, skills y conexiones MCP ya presentes.
- Usuario o rol afectado: persona o agente con autorización para configurar una raíz de proyecto en una máquina que puede repetir la puesta en marcha o adoptar más de un proyecto.
- Comportamiento actual: `valmen adopt` crea la política compartida y reporta una configuración existente; `valmen mcp --install` fusiona conexiones MCP sin duplicarlas. Sin embargo, la adopción no crea ni comprueba el binding local que exigen las operaciones de ejecución, por lo que la ruta directa queda incompleta o se resuelve editando `~/.valmen/bindings.local.yaml` a mano.
- Comportamiento esperado: adoptar una raíz autorizada deja o conserva un binding local compatible para su `project-id`, informa qué se creó, conservó o entró en conflicto, y una segunda ejecución no borra reglas, servidores MCP, perfiles ni bindings ajenos ni crea proyectos o despachadores duplicados.

## Diagnóstico

- Archivos y flujo investigados: `packages/cli/src/commands.ts:873-1058` implementa `adopt`: perfila la raíz, extrae reglas y crea `.valmen/config.yaml` sólo si no existe; si existe, informa la propuesta y retorna sin sobrescribirla (`:995-1007`). `extractRules` preserva reglas ya existentes (`packages/adapter/src/adopt-rules.ts:181-244`). `syncProject` vuelve a generar únicamente sus proyecciones declaradas (`packages/cli/src/commands.ts:667-763`). La fusión MCP ya conserva entradas ajenas e informa si no cambia nada (`packages/cli/src/mcp.ts:200-249`). En cambio, `adoptPlan` sólo contempla configuración compartida, reglas y `AGENTS.md` (`packages/adapter/src/adopt.ts:583-599`), mientras que `machineBindingsPath` y `parseMachineBindings` definen el archivo local y su esquema cerrado sin un escritor de adopción (`packages/adapter/src/machine-bindings.ts:12-112`).
- Causa raíz o hipótesis: las piezas que preservan contenido existen por separado, pero `adopt` no enlaza la identidad compartida recién creada o existente con `~/.valmen/bindings.local.yaml`. No hay un plan ni una fusión canónica para el binding, ni una salida que distinga el alta idempotente de un conflicto de raíz o perfil; por eso la segunda instalación depende de edición manual y puede duplicar o reemplazar información local.
- Riesgos y compatibilidad: el binding contiene ruta absoluta y perfil Hermes locales, por lo que no debe entrar en `.valmen/config.yaml`, versionarse ni importarse desde otro equipo. Un `project-id` existente con otra raíz o perfil es un conflicto que debe mostrarse y preservarse, no resolverse automáticamente. El cambio debe conservar el comportamiento actual de `adopt`, la extracción append-only de reglas y las fusiones MCP; no habilita observación, despacho, Hermes, credenciales ni cambios de hosts.
- Impactos de sync, migración, Docker o despliegue: ninguno; la operación afecta configuración local por máquina y archivos de proyecto ya soportados, sin migración de datos, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Aprobación literal en esta conversación: «si apruebo el plan».
- Alcance y exclusiones: se añadirá el binding local idempotente a la adopción CLI. Quedan fuera instalar MCP o Hermes, modificar credenciales, hosts, reglas existentes, dispatchers, política compartida, capacidad de ejecución y adoptar proyectos sin una raíz autorizada.
- Pasos ordenados:
  1. Ampliar `packages/adapter/src/machine-bindings.ts` con una operación pura para preparar y renderizar el alta de un proyecto en `bindings.local.yaml`: crear el archivo sólo con `machine-id` explícito, reutilizar una entrada exactamente igual, conservar los bindings de otros proyectos y devolver un conflicto verificable cuando el mismo `project-id` apunte a otra raíz o perfil. Exportar el contrato desde `packages/adapter/src/index.ts`.
  2. Actualizar `packages/cli/src/commands.ts` en `adoptProject` para leer la política compartida, resolver el `project-id` y aplicar la operación anterior a `~/.valmen/bindings.local.yaml`; aceptar el `machine-id` sólo al inicializar el archivo y mostrar en la salida si el binding se creó, ya estaba declarado o entró en conflicto. Cuando haya conflicto o falta de identidad inicial, no escribir ningún binding ni modificar configuración, reglas o conexiones existentes.
  3. Conectar las opciones de `adopt` en `packages/cli/src/main.ts` para transportar el `machine-id` y el directorio local de pruebas hacia `adoptProject`, conservando `--dry-run` como simulación sin escrituras tanto en la raíz como en el binding local.
  4. Extender `tests/adopt.test.ts` con raíces y hogares temporales para cubrir: alta inicial con `machine-id`; segunda adopción sin cambios y conservando otro proyecto/perfil; conflicto de raíz o perfil sin escritura; y `--dry-run` sin crear el binding. Ejecutar `npx vitest run tests/adopt.test.ts` y la compilación TypeScript desde la raíz.
- Rollback: retirar la operación, las opciones y sus pruebas; no borrar ni reescribir bindings locales que hayan sido creados por una adopción ya ejecutada, porque son configuración de la persona.

## Criterios de aceptación

- [x] R-ADO-003: Repetir la configuración NO DEBE sobrescribir reglas ni conexiones ajenas existentes; un binding local idéntico debe conservarse y uno conflictivo debe informarse sin escribirlo.
      <!-- test: npx vitest run tests/adopt.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `prepareMachineProjectBinding`, una operación pura que prepara el alta, declara que una entrada idéntica ya existe y rechaza conflictos de raíz o perfil sin producir texto para escritura.
- `adoptProject` lee el `project-id` compartido de una configuración existente y aplica ese resultado exclusivamente en `~/.valmen/bindings.local.yaml`; el primer archivo requiere `--machine-id` y una simulación no lo escribe.
- `valmen adopt` ahora recibe `--machine-id <id>` y conserva la ruta de hogar inyectable para pruebas. No se modificaron reglas, MCP, Hermes, credenciales, hosts, despachadores ni política compartida.
- Revisión final: sin hallazgos bloqueantes. La idempotencia se cubre por la igualdad de bytes al repetir el binding y los conflictos salen antes de cualquier escritura.

## Pruebas

- Desde la raíz: `npx vitest run tests/adopt.test.ts` — pasó: 41 pruebas, incluyendo alta inicial, repetición sin reescritura, conflictos de raíz y perfil, y simulación sin archivo local.
- Gate `qa-mechanical` aprobado: `GR-20261006-FEATURE-CLI-ADOPCION-IDEMPOTENTE-20261001-qa-mechanical-1`; ejecutó el criterio R-ADO-003 con salida 0 en 1912 ms.
- Desde la raíz: `npx tsc -b --pretty false` — pasó sin diagnósticos.
- Desde la raíz: `npx vitest run` — pasó: 135 archivos, 2128 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- Desde la raíz: `git diff --check` y `valmen secrets` — pasaron; no hay errores de espacios ni secretos en los cambios.
- Validación manual propuesta para el responsable: en una raíz autorizada que ya tenga `.valmen/config.yaml` con `project-id`, ejecutar `valmen adopt --machine-id <identidad>` y repetirlo; la primera salida debe indicar «Binding local creado» y la segunda «ya declarado», sin cambiar otras entradas de `~/.valmen/bindings.local.yaml`. Entorno: Node 24 y un `machine-id` lógico en minúsculas.
- Resultado del PO: aprobado. En `/Users/juanandrade/Desktop/ValmenHarness`, tras compilar el CLI vigente, ejecutó `./node_modules/.bin/valmen adopt --dry-run --machine-id juan-macbook`; se informó el conflicto con el perfil local existente y no se sobrescribió ningún binding. Confirmación literal: «si dale prueba aprobada».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:4618d46f2f342d86df1f8be5c1c4526a614d58440c159299c74fc46c615be1a8",
    "environment": "local",
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
    "po_confirmation": "si dale prueba aprobada"
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
    "technical_summary": "Binding local idempotente implementado y verificado con prueba dirigida, compilación y suite completa.",
    "functional_summary": "El PO aprobó el simulacro: el conflicto del binding existente se informó sin sobrescribirlo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: cambio local pendiente de commit y release."
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
    "notes": "Sesión de Codex sin agregado verificable de tokens o coste; trabajó exclusivamente este ticket después del cierre de DOCS-ADOPCION-RUTAS-20261001.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-sesion-2026-10-06",
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
    "at": "2026-10-01T19:10:45.578Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T00:13:27.395Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T00:14:56.813Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Aprobación explícita del PO en esta conversación: «si dale»."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T00:16:16.340Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T00:19:26.962Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T00:19:34.141Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T00:25:34.087Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T00:25:46.380Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T00:42:46.766Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T00:42:57.548Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T00:42:57.745Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T00:43:07.190Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T00:43:24.365Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T00:43:24.578Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
