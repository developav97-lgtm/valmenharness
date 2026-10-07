---
schema_version: 2
id: FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926
title: Declarar migraciones con esquema permitido y auto apagado
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
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-008: Migración automática al esquema de pruebas — El proyecto DEBE poder declarar en `.valmen/config.yaml` la migración que se
Depende de: FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la **declaración** en `.valmen/config.yaml` de la preparación del ambiente de pruebas —sección `test-setup` y lista `allowed-schemas`— con su lectura, su validación y la regla de qué esquemas se aceptan. Fuera de alcance: ejecutar la preparación antes de los criterios y registrarla en el recibo (ticket `FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926`).
- Usuario o rol afectado: quien configura un proyecto con base de datos persistente (por ejemplo SaiOpenCloud) y el motor que después correrá la preparación.
- Comportamiento actual: el proyecto solo declara `test-commands` y `test-timeout`; no hay forma de decir qué comandos dejan listo el ambiente (migrar al esquema de pruebas, reutilizar la base con `--keepdb`) ni contra qué esquemas está permitido migrar.
- Comportamiento esperado: el proyecto puede declarar `test-setup` con el esquema de pruebas al que apunta, los comandos de preparación y un tope opcional, y `allowed-schemas` con los esquemas permitidos; la lectura valida la forma con errores que nombran la clave, y una preparación cuyo esquema no está en la lista queda rechazada con un motivo. Sin la sección, nada cambia.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` tiene los lectores de secciones de `config.yaml` (`readPlaywrightConfig`, `readVerifyDevConfig`, `readAutonomousConfig`) con el mismo molde —opt-in, `null` si falta, error que nombra la clave si la forma es inválida—; `packages/engine/src/discovery.ts:166` y `:180` los exponen como `playwrightConfig(root)` y `verifyDevConfig(root)` leyendo el archivo con `parseYamlSubset`; los comandos permitidos salen de `configList(root, "test-commands")`. La compuerta mecánica que consumirá la declaración está en `packages/engine/src/gate.ts` (`revisarCriteriosVerificables`, `testCommands`).
- Causa raíz o hipótesis: falta de la declaración; no hay un lugar en el contrato de configuración para la preparación del ambiente, y sin él cada proyecto la resuelve a mano o la compuerta falla por la base ya creada.
- Riesgos y compatibilidad: una migración es un cambio de datos; por eso la declaración exige `schema` y solo se acepta si está en `allowed-schemas` —sin esa lista, la preparación se rechaza, no se asume permitida—. Los comandos salen de la configuración del proyecto, nunca del ticket: el ticket lo escribe quien la compuerta controla. La sección es opt-in y un proyecto sin ella no cambia; no se agrega nada a `.valmen/config.yaml` de este repositorio. No toca bases ni contenedores: solo lee y valida texto.
- Impactos de sync, migración, Docker o despliegue: ninguno en este ticket (declara y valida configuración; no ejecuta migraciones ni toca contenedores).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: lectores y validación de `test-setup` y `allowed-schemas` en el adaptador, su exposición en el motor y las pruebas. Exclusiones: ejecutar la preparación, el recibo y cualquier cambio a `.valmen/config.yaml` de este repositorio.
- Pasos ordenados:
  1. En `config.ts` del adaptador, agregar la interfaz `TestSetupConfig` (`schema`, `commands`, `timeoutMs`) y `readTestSetupConfig(config)`: devuelve `null` si falta `test-setup`; falla nombrando la clave si no es un mapa, si `schema` falta o está vacío, si `commands` no es una lista no vacía de textos o si `timeout` no es un número de segundos mayor que cero.
  2. En el mismo archivo, agregar `readAllowedSchemas(config)` (lista de textos no vacíos, vacía si falta) y `testSetupRefusal(setup, allowedSchemas)`, que devuelve el motivo cuando el esquema de la preparación no está en la lista —también cuando la lista está vacía— o `null` si se acepta.
  3. Exportar los tres desde el índice del adaptador y exponerlos en `discovery.ts` del motor como `testSetupConfig(root)` y `allowedSchemas(root)`, con el mismo patrón de lectura que `playwrightConfig` (una forma inválida sube como error).
  4. Crear `tests/config-test-setup.test.ts`: sin sección devuelve `null`; una sección válida se lee completa; cada forma inválida falla nombrando la clave; el esquema permitido se acepta; el no permitido y el caso de lista vacía se rechazan con motivo; la lectura desde un archivo `config.yaml` real en un directorio temporal.
  5. Correr `npx vitest run` sobre ese archivo, después la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; solo agrega funciones y pruebas, y la sección de configuración es opt-in.

## Criterios de aceptación

- [x] Un proyecto que no declara `test-setup` obtiene `null` y su comportamiento no cambia
      <!-- test: npx vitest run tests/config-test-setup.test.ts -->
- [x] Una sección `test-setup` válida se lee con su esquema, sus comandos y su tope opcional
      <!-- test: npx vitest run tests/config-test-setup.test.ts -->
- [x] Una forma inválida falla con un error que nombra la clave
      <!-- test: npx vitest run tests/config-test-setup.test.ts -->
- [x] Una preparación cuyo esquema no está en `allowed-schemas` se rechaza con un motivo, y una lista vacía rechaza cualquier esquema
      <!-- test: npx vitest run tests/config-test-setup.test.ts -->
- [x] El motor lee la declaración desde `.valmen/config.yaml` del proyecto
      <!-- test: npx vitest run tests/config-test-setup.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/engine/src/discovery.ts",
      "tests/config-test-setup.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

`packages/adapter/src/config.ts`: `TestSetupConfig` y `readTestSetupConfig` (sección `test-setup` con `schema`, `commands` y `timeout` opcional; `null` si falta; errores que nombran la clave), `readAllowedSchemas` y `testSetupRefusal`, que rechaza una preparación cuyo esquema no está en `allowed-schemas` —también cuando la lista falta o está vacía—. `packages/engine/src/discovery.ts`: `testSetupConfig(root)` y `allowedSchemas(root)` leen el `config.yaml` del proyecto con el patrón de `playwrightConfig`. Solo declara y valida: no ejecuta la preparación (ticket `FEATURE-ENGINE-MIGRACION-ANTES-TESTS`) y no se agregó nada a `.valmen/config.yaml` de este repositorio. Pruebas nuevas: `tests/config-test-setup.test.ts` (14).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/config-test-setup.test.ts` — esperado: 14 pruebas pasan.
2. `npx vitest run` — esperado: 150 archivos pasan y 1 omitido; 2317 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2317 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:99ea8ffe88c105d1f80eb0bb7882d4a229f4779c",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run: 2317 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:1a711891f26b70d21cdbcc3e0b2351a7db38fb7aa6c44347f08efa2e5f689e51",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "readTestSetupConfig, readAllowedSchemas y testSetupRefusal en el adaptador; testSetupConfig y allowedSchemas en el motor; 14 pruebas nuevas",
    "functional_summary": "El proyecto puede declarar en config.yaml la preparación del ambiente de pruebas con su esquema, y solo se acepta si el esquema está en allowed-schemas",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: solo declara y valida configuración, sin ejecutar migraciones ni despliegue"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets de la delegación; sin números por ticket para no repartir a ojo un costo que no se midió por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code por delegación DEL-20261006-001",
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
    "date": "2026-10-06",
    "at": "2026-10-07T00:37:04.013Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:37:22.119Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926-analysis-1, canal delegation, decidida 2026-10-07T00:37:22.118Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:37:22.228Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:37:56.899Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926-plan-1, canal delegation, decidida 2026-10-07T00:37:56.898Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:37:57.027Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:37:57.102Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.367Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.452Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.530Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.612Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.688Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.765Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:15.874Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.014Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.087Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.158Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.232Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.308Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.382Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.455Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T00:39:16.526Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
