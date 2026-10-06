---
schema_version: 2
id: FEATURE-CLI-DOCTOR-CAPACIDADES-20261001
title: Diagnosticar flujo básico y capacidades opcionales
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

# FEATURE-CLI-DOCTOR-CAPACIDADES-20261001

## Solicitud original

Parte del sprint: Entregar adopción portable, diagnóstico y verificación temporal reutilizables.
- R-ADO-004: El diagnóstico DEBE separar el flujo básico de las capacidades opcionales seleccionadas.
- R-ADO-006: La guía DEBE verificar el paso a paso en un registro temporal sin afectar tickets reales.
Depende de: FEATURE-ADAPTER-CAPACIDADES-20261001, DOCS-ADOPCION-RUTAS-20261001, FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001.
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

- Alcance: separar en `valmen doctor` la comprobación que permite trabajar por CLI del estado informativo de MCP, Hermes y las fuentes de observación o despacho que el proyecto haya elegido. El diagnóstico seguirá siendo de solo lectura y podrá ejecutarse contra una raíz temporal.
- Usuario o rol afectado: persona o agente que adopta ValmenHarness en un proyecto y necesita saber qué falta para el flujo CLI, qué rutas opcionales están instaladas, cuáles fueron seleccionadas y qué recuperación aplicar sin habilitar ninguna capacidad.
- Comportamiento actual: `valmen doctor` reúne Node, adopción, registro, AGENTS, los dos archivos MCP, routing, credenciales y Hermes en una única lista. La ausencia de MCP se marca como `falta` y devuelve código 2 aun cuando el uso por CLI no lo necesita; la salida no lee `execution.observation-sources` ni `execution.dispatch-executors`, por lo que no distingue una capacidad no seleccionada de una seleccionada y fallida.
- Comportamiento esperado: el resultado separa explícitamente el flujo básico operable por CLI de las capacidades opcionales. MCP y Hermes no seleccionados se informan sin bloquear el flujo básico; una fuente o ejecutor seleccionado muestra su autorización y su compatibilidad o limitación conocida, con un paso de recuperación si corresponde. Ejecutarlo en una raíz temporal no modifica tickets ni archivos reales.

## Diagnóstico

- Archivos y flujo investigados: `packages/cli/src/main.ts:1664-1677` despacha `doctor` hacia `doctorCommand(resolvePaths(options))`. `packages/cli/src/setup.ts:388-626` construye una sola colección de hallazgos: Node y adopción (`:395-416`), registro y `AGENTS.md` (`:418-439`), MCP de Claude Code/OpenCode (`:441-460`), routing y credenciales (`:462-558`) y Hermes opcional (`:560-573`); todo hallazgo con estado `falta` fija salida 2 (`:575-626`). El recorrido actual confirmó que `valmen doctor` en esta raíz declara todos esos elementos en una lista única. `packages/adapter/src/config.ts:602-609` ya expone el consentimiento explícito mediante `readExecutionCapabilities`, pero `setup.ts` no lo importa ni lo muestra. Los perfiles de compatibilidad de adaptador existen en `packages/adapter/src/capabilities.ts:12-90` y los lectores de Hermes/OpenCode/Codex los declaran; el panel de servidor es hoy el único consumidor (`packages/server/src/execution-panel.ts:17-20`). Las pruebas actuales de doctor viven en `tests/puesta-en-marcha.test.ts:186-231` y solo cubren instalación mínima, MCP presente y routing inválido.
- Causa raíz confirmada: el diagnóstico anterior fue diseñado para una puesta en marcha única donde MCP y credenciales eran tratados como prerrequisitos globales. Tras las rutas CLI/MCP y la política `execution` añadidas por los tickets dependientes, conserva ese conjunto plano: no existe una clasificación de requisitos básicos frente a opcionales, ni lectura de la autorización de fuentes y ejecutores, ni combinación con los perfiles de compatibilidad. Por ello una instalación CLI válida sin MCP queda bloqueada y la presencia de Hermes/MCP se puede confundir con una selección autorizada o con soporte real, en contradicción con R-ADO-004.
- Riesgos y compatibilidad: el diagnóstico no debe escribir, iniciar Hermes, registrar actividad, crear tickets ni modificar routing, credenciales, hosts o gates. Las configuraciones históricas sin `execution` deben mostrar las capacidades apagadas, no faltantes. Las etiquetas de fuente desconocida deben declararse como seleccionadas sin inventar compatibilidad; los perfiles de adaptador disponibles solo describen límites, no salud de instalación ni permiso. R-ADO-006 se comparte con `FEATURE-CLI-VERIFICACION-TEMPORAL-20261001`: este ticket debe conservar `doctor --root <temporal>` de solo lectura y aportar una salida comprobable, mientras que el recorrido completo del registro temporal pertenece al ticket dependiente.
- Memoria consultada: `valmen memory search "CLI doctor diagnóstico capacidades adopción flujo básico opcional"` devolvió AP-005 («Gate de análisis no aplica a requisito nuevo sin síntoma») y reglas de proceso, sin diagnóstico técnico previo de `doctor`; se aplicó investigando el flujo real antes de formular la causa.
- Impactos de sync, migración, Docker o despliegue: ninguno. El cambio será de diagnóstico CLI y pruebas locales; no reescribe configuración ni activa integraciones.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Aprobación literal en esta conversación: «Si».
- Alcance y exclusiones: se reorganizará la salida de `valmen doctor` para distinguir los requisitos del flujo básico CLI de MCP, Hermes y las fuentes o ejecutores seleccionados por `execution.*`. Se comprobará la política y la compatibilidad declarada sin inferir permisos ni salud de instalación. Quedan fuera instalar MCP o Hermes, cambiar credenciales, hosts, routing, gates, bindings, perfiles, eventos persistidos, ejecutar despacho, modificar Mission Control o completar el recorrido temporal íntegro de R-ADO-006, que conserva su ticket dependiente `FEATURE-CLI-VERIFICACION-TEMPORAL-20261001`.
- Pasos ordenados:
  1. Actualizar `packages/cli/src/setup.ts`, en `doctorCommand`, para separar los hallazgos básicos (Node, proyecto, registro, reglas, routing y credenciales necesarias) de las rutas opcionales; MCP y Hermes no seleccionados deben quedar como información o aviso sin volver inválido un flujo CLI por sí solo. Mantener el diagnóstico sin escrituras y conservar los comandos de recuperación solo para el hallazgo correspondiente.
  2. En `packages/cli/src/setup.ts`, leer `parseConfig` y `readExecutionCapabilities` de `@valmen/adapter` para declarar qué fuentes de observación y ejecutores de despacho fueron seleccionados. Añadir un resolvedor local de perfiles conocidos (`hermes`, `opencode`, `codex`) usando sus contratos existentes de `@valmen/adapter`: una fuente desconocida o una capacidad no disponible se informa con su límite y recuperación, sin convertir presencia de archivos, configuración global o adaptador disponible en autorización. Las listas vacías deben expresarse como capacidades no seleccionadas.
  3. Extender `tests/puesta-en-marcha.test.ts` con hogares y raíces temporales para comprobar: CLI básica preparada sin MCP ni Hermes con salida no bloqueante; MCP presente y Hermes no seleccionado; selección explícita de una fuente o ejecutor conocida y límite de compatibilidad; selección desconocida sin soporte inventado; y ejecución del diagnóstico contra registro temporal sin cambiar un ticket o archivo ajeno. Ejecutar `npx vitest run tests/puesta-en-marcha.test.ts` desde la raíz.
  4. Ejecutar `npx tsc -b --pretty false` y `npx vitest run` desde la raíz para comprobar tipado y regresión. No iniciar integraciones ni escribir un registro temporal; el ticket de verificación posterior consumirá esta salida de solo lectura.
- Compatibilidad: `doctor` conserva la lectura de archivos, la priorización de pasos y el código 2 cuando falte un requisito básico. Configuraciones sin `execution` preservan el flujo CLI y muestran capacidades opcionales no seleccionadas; fuentes conocidas mantienen sus limitaciones ya declaradas.
- Rollback: restaurar la presentación plana anterior y las pruebas de `doctor`; no hay datos persistidos, instalaciones, procesos ni configuración modificada que revertir.

## Criterios de aceptación

- [x] R-ADO-004: `valmen doctor` DEBE declarar el flujo CLI básico por separado y NO DEBE bloquearlo por MCP o Hermes no seleccionados.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] R-ADO-004: El diagnóstico DEBE mostrar las fuentes de observación y ejecutores seleccionados, su compatibilidad conocida o límite, sin confundir selección, instalación y autorización.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] R-ADO-006: Ejecutar el diagnóstico sobre una raíz temporal NO DEBE modificar tickets ni archivos de otro registro.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `doctorCommand` ahora muestra dos bloques: `Flujo básico CLI` y `Capacidades opcionales`. Node, adopción, registro, reglas, routing y credenciales conservan el código bloqueante cuando falta un requisito básico; MCP ausente pasa a ser una ruta opcional informativa.
- El diagnóstico lee `execution.observation-sources` y `execution.dispatch-executors`. Las listas vacías se declaran como no seleccionadas; `hermes`, `opencode` y `codex` usan sus perfiles estáticos para informar disponibilidad o límite, y una etiqueta desconocida se declara sin inventar soporte.
- Cuando solo quedan avisos informativos, `doctor` ya no imprime el encabezado `Qué hacer, en orden:` sin ningún paso debajo; conserva los avisos visibles sin sugerir una recuperación inexistente.
- No se añadieron escrituras: `doctor` sigue leyendo solo configuración y archivos existentes, no inicia Hermes, no cambia routing, credenciales, tickets ni registros temporales.
- Revisión final: sin hallazgos bloqueantes. Se excluyeron cambios ajenos ya presentes en documentación, adopción idempotente, recibos y `.valmen/features/autonomia-confiable/`.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/puesta-en-marcha.test.ts` — pasó: 17 pruebas; cubre CLI sin MCP/Hermes, capacidades seleccionadas y desconocidas, diagnóstico aislado en una raíz temporal y la ausencia de una lista de recuperación vacía.
- Gate `qa-mechanical` aprobado: `GR-20261006-FEATURE-CLI-DOCTOR-CAPACIDADES-20261001-qa-mechanical-1`; los tres criterios R-ADO-004/R-ADO-006 se ejecutaron con salida 0.
- `npx tsc -b --pretty false` — pasó sin diagnósticos.
- `npx vitest run` — pasó: 135 archivos y 2133 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- `npx prettier --check packages/cli/src/setup.ts tests/puesta-en-marcha.test.ts`, `git diff --check` y `valmen secrets` — pasaron; formato, espacios y secretos verificados.
- Validación manual posterior: ejecutar `valmen doctor` en una instalación CLI con `execution` vacío y en una con una fuente seleccionada; confirmar que la salida diferencia cada ruta sin escribir configuración, tickets ni activar procesos. Requisito de entorno: Node 24 y una raíz autorizada; no se requiere Hermes para el caso CLI.
- Resultado comunicado por el PO: aprobó la prueba al ejecutar `./node_modules/.bin/valmen doctor` desde la raíz; obtuvo `Flujo básico CLI` íntegramente listo, las tres capacidades opcionales no seleccionadas como avisos y ninguna lista de acciones vacía. No reportó cambios de configuración, tickets ni procesos.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:07ad17106242ec25c011e4f634d3cba90fa5f95fee47e19cebb033a85d456c83",
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
    "po_confirmation": "si dale vamos a cerrarlo"
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
    "technical_summary": "doctor separa el flujo básico CLI de las capacidades opcionales, declara límites de fuentes y ejecutores seleccionados y evita una lista de recuperación vacía; no escribe configuración ni inicia integraciones.",
    "functional_summary": "El responsable verificó en su instalación que el diagnóstico muestra el flujo básico listo y los opcionales como avisos no bloqueantes.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: cambio local de CLI, sin migraciones, despliegue, etiquetas ni procesos externos."
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
    "notes": "Sesión de Codex sin agregado verificable de tokens o coste; trabajó exclusivamente este ticket después del cierre de FEATURE-CLI-ADOPCION-IDEMPOTENTE-20261001.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-sesion-2026-10-06",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 20 tickets (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004 ×14, SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926 ×10, BUGFIX-GATE-LECTOR-CRITERIOS-20261005 ×9, INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926 ×8, INTEGRATION-HERMES-DESPACHO-JORNADA-20261001 ×8), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 2015423 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"AI development harness review\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "at": "2026-10-01T19:10:45.630Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T00:45:34.265Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T00:50:14.144Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Aprobación explícita del PO en esta conversación: «si apruebo»."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T00:51:20.968Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T01:26:29.315Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO: Aprobación explícita del PO en esta conversación: «Si»."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T01:26:29.500Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T01:26:41.279Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T01:31:49.798Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T01:31:56.857Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T02:00:26.525Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T02:00:26.843Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T02:48:05.423Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T02:48:11.753Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T02:48:24.725Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-06T02:48:24.930Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-05",
    "at": "2026-10-06T02:48:37.082Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
