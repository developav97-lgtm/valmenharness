---
schema_version: 2
id: SECURITY-ENGINE-APROBACION-DESPLIEGUE-20261005
title: Exigir la frase con versión y consumir la aprobación de despliegue
type: SECURITY
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-APROBACION-DESPLIEGUE-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CTRL-002: El gate de despliegue DEBE exigir su frase con la versión y consumir la aprobación
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que el gate humano de un proceso que declara `require_phrase` (hoy solo `deploy`) **exija** esa frase, con `{version}` resuelta, al aprobar; que la aprobación quede atada a la corrida y a la versión; y que se **consuma** al usarse, de modo que una aprobación anterior no habilite otra corrida (R-CTRL-002). Fuera de alcance: ejecutar despliegues, cambiar el contenido de `.valmen/gates/deploy.yaml`, y las aprobaciones de gates de ticket.
- Usuario o rol afectado: quien aprueba un despliegue (el PO) y cualquier proceso que se detenga en un gate humano.
- Comportamiento actual: `approveGate` (`packages/engine/src/run-state.ts:275`) registra actor y motivo sin mirar la frase; `gateApproved` devuelve la última aprobación del gate sin considerar corrida ni versión y no se gasta al usarse, de modo que una aprobación de la versión 1.4.0 habilita también el despliegue de la 1.5.0.
- Comportamiento esperado: aprobar el gate `deploy` pide la frase con la versión de la corrida detenida; una frase distinta se rechaza; la aprobación se guarda con la corrida y la versión, el paso de gate la acepta solo si coincide con la corrida y la versión que corre, y la marca como consumida al usarla; una corrida nueva queda esperando una aprobación nueva.

## Diagnóstico

- Archivos y flujo investigados: el gate está declarado en `.valmen/gates/deploy.yaml` con `require_phrase: "APROBAR DEPLOY v{version}"` y nada del código lo lee; el paso de gate de un proceso se resuelve en `packages/engine/src/process.ts:939` con `gateApproved(root, paso.target)`; `approveGate` y el registro `approvals.json` viven en `packages/engine/src/run-state.ts:222-295`; el comando es `approveProcessGate` en `packages/cli/src/commands.ts:2104` y el endpoint `POST /api/processes/gates/:gate/approve` en `packages/server/src/server.ts:572`. La versión de la corrida está en sus valores, que lee `readRun` (`run-state.ts:107`).
- Causa raíz o hipótesis: la frase se declaró como contrato del harness pero nunca se implementó su comprobación, y el registro de aprobaciones es una lista por nombre de gate sin identidad de corrida: «la última aprobación manda» convierte una aprobación en permanente. Comprobado: no hay ninguna referencia a `require_phrase` en `packages/*/src`.
- Riesgos y compatibilidad: es un gate de despliegue, por eso exige tu aprobación del plan. Las aprobaciones ya escritas en `approvals.json` no traen corrida ni versión: se tratan como **no válidas para gates que exigen frase** (el despliegue pide aprobación nueva, que es el comportamiento seguro) y siguen valiendo para gates sin `require_phrase`, como el de manuales. Los campos nuevos de `GateApproval` son opcionales para no invalidar el archivo existente. Un cambio de contrato en `process approve`: el gate `deploy` pasa a requerir `--run` y `--phrase`; se actualizan el comando, el endpoint y el texto de ayuda. No se ejecuta ningún despliegue durante las pruebas.
- Impactos de sync, migración, Docker o despliegue: despliegue (cambia cómo se aprueba el gate de despliegue); sin migración de datos ni cambios de contenedor.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), Juan Andrade, 2026-10-06: «Escojo la A aprobar los 3 planes»; compuerta `plan` aprobada por el evaluador y registrada en su recibo.
- Alcance: la frase exigida, la aprobación atada a corrida y versión, y su consumo; el comando, el endpoint y la ayuda que la usan. Exclusiones: ejecutar despliegues, el contenido de `deploy.yaml` y los gates de ticket.
- Pasos ordenados:
  1. En `packages/engine/src/run-state.ts` ampliar el tipo de la aprobación con `runId`, `version`, `phrase` y `consumedAt` opcionales; agregar `readRequiredPhrase(root, id)` que lee `require_phrase` de `.valmen/gates/<gate>.yaml`; hacer que la función de aprobación reciba `{ runId, phrase }`, resuelva `{version}` con los valores de la corrida (`readRun`), compare la frase **exacta** y rechace una distinta o una corrida inexistente con el código de invariante.
  2. En el mismo archivo cambiar la lectura de aprobaciones vigentes (`aprobacionVigente`) para que, si la compuerta declara frase, devuelva solo una aprobación sin consumir con la misma corrida y versión, y agregar `consumeApproval(root, aprobacion)` que escribe `consumedAt` de forma atómica.
  3. En `packages/engine/src/process.ts:939` pasar la corrida y la versión a la lectura de aprobaciones vigentes y llamar a `consumeApproval` cuando el paso acepta la aprobación; el motivo del paso dice si falta la frase, si la aprobación es de otra versión o si ya se consumió.
  4. En `packages/cli/src/commands.ts` (la función del comando `process approve`) y en `packages/server/src/server.ts:572` aceptar `--run` y `--phrase` (campos `run` y `phrase` en el cuerpo) y pasarlos; actualizar el texto de ayuda de `process approve`.
  5. Crear `tests/aprobacion-despliegue.test.ts`: frase correcta aprueba, frase distinta se rechaza, aprobación de la 1.4.0 no habilita la 1.5.0, la aprobación se consume y una segunda corrida con la misma versión queda esperando, una aprobación antigua sin corrida no habilita una compuerta con frase y sí uno sin frase; correr `npx vitest run tests/aprobacion-despliegue.test.ts`, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; `approvals.json` conserva su forma y los campos nuevos son opcionales, de modo que las aprobaciones escritas con el código nuevo siguen leyéndose con el anterior.

## Criterios de aceptación

- [x] Aprobar el gate `deploy` con una frase distinta de la declarada, con `{version}` resuelta, se rechaza
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [x] La aprobación queda atada a la corrida y a la versión: la de la 1.4.0 no habilita el despliegue de la 1.5.0
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [x] La aprobación se consume al usarse y una segunda corrida queda esperando una aprobación nueva
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [x] Una aprobación sin corrida ni versión no habilita un gate que exige frase
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [x] Los gates sin `require_phrase` conservan su comportamiento
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de SECURITY-ENGINE-APROBACION-DESPLIEGUE-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/run-state.ts",
      "packages/engine/src/process.ts"
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

- `packages/engine/src/run-state.ts`: `GateApproval` gana `runId`, `version`, `phrase` y `consumedAt` opcionales; `readRequiredPhrase` lee `require_phrase` de `.valmen/gates/<gate>.yaml`; `approveGate` recibe `{ runId, phrase }`, exige la corrida detenida y compara la frase exacta con `{version}` resuelta por los parámetros de esa corrida; `gateApproved` devuelve, en un gate con frase, solo una aprobación sin consumir de la misma corrida y versión; `consumeApproval` la gasta.
- `packages/engine/src/process.ts`: el paso de gate pasa la corrida y sus valores a `gateApproved` (`runId` nuevo en el contexto del paso) y consume la aprobación al usarla.
- `packages/cli/src/commands.ts` y `main.ts`: `process approve` acepta `--run` y `--phrase` (bandera declarada y ayuda). `packages/server/src/server.ts`: el endpoint acepta `run` y `phrase`.
- `tests/aprobacion-despliegue.test.ts` (nuevo, 7 pruebas).
- Efecto a tener en cuenta: aprobar `deploy` desde la pantalla de Procesos ahora devuelve el error que pide corrida y frase; la pantalla no tiene todavía esos campos (queda como mejora aparte). Las aprobaciones antiguas sin corrida no habilitan `deploy`.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin ejecutar ningún despliegue:

1. `npx vitest run tests/aprobacion-despliegue.test.ts tests/process-gates.test.ts` — esperado: 31 pruebas pasan.
2. `npx vitest run` — esperado: 169 archivos pasan y 1 omitido; 2505 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «La A cierra los 3» — Juan Andrade, 2026-10-06 (cierre de los tres SECURITY tras revisar el resumen de pruebas). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:e617bcd5606691f762d9c485a66445b4fbf04361",
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
    "po_confirmation": "«La A cierra los 3» — Juan Andrade, 2026-10-06 (cierre de los tres SECURITY tras revisar el resumen de pruebas)"
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
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:ebe5fc8ce39e22377abd273917c718d4c2715ffaeaab5caee09ab32ee1d78b72",
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
    "po_confirmation": "«La A cierra los 3» — Juan Andrade, 2026-10-06 (cierre de los tres SECURITY tras revisar el resumen de pruebas)"
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
    "technical_summary": "run-state.ts exige la frase con la versión, ata la aprobación a corrida y versión y la consume; process.ts la usa en el paso de gate.",
    "functional_summary": "Aprobar un despliegue exige la frase con la versión y vale una sola vez para su corrida.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "despliegue: cambia cómo se aprueba el gate deploy; las aprobaciones antiguas ya no lo habilitan"
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
    "notes": "Sesión que atendió varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code, corrida delegada DEL-20261006-001",
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:49.926Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T02:28:54.278Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T02:29:28.317Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T02:50:46.121Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T02:50:46.366Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T02:56:42.144Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:08.469Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:08.695Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:08.901Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:09.106Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:09.312Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:09.547Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:09.804Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:10.015Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:10.223Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:10.431Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:10.635Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:10.841Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:11.821Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:03:12.051Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
