---
schema_version: 2
id: SECURITY-ENGINE-APROBACION-DESPLIEGUE-20261005
title: Exigir la frase con versión y consumir la aprobación de despliegue
type: SECURITY
module: ENGINE
workflow_status: planned
qa_status: pending
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

- Gate de plan y aprobación: pendiente
- Alcance: la frase exigida, la aprobación atada a corrida y versión, y su consumo; el comando, el endpoint y la ayuda que la usan. Exclusiones: ejecutar despliegues, el contenido de `deploy.yaml` y los gates de ticket.
- Pasos ordenados:
  1. En `packages/engine/src/run-state.ts` ampliar `GateApproval` con `runId`, `version`, `phrase` y `consumedAt` opcionales; agregar `readGatePhrase(root, gate)` que lee `require_phrase` de `.valmen/gates/<gate>.yaml`; hacer que `approveGate` reciba `{ runId, phrase }`, resuelva `{version}` con los valores de la corrida (`readRun`), compare la frase **exacta** y rechace una distinta o una corrida inexistente con el código de invariante.
  2. En el mismo archivo cambiar `gateApproved(root, gate, corrida)` para que, si el gate declara frase, devuelva solo una aprobación sin consumir con la misma corrida y versión, y agregar `consumeApproval(root, aprobacion)` que escribe `consumedAt` de forma atómica.
  3. En `packages/engine/src/process.ts:939` pasar la corrida y la versión a `gateApproved` y llamar a `consumeApproval` cuando el paso acepta la aprobación; el motivo del paso dice si falta la frase, si la aprobación es de otra versión o si ya se consumió.
  4. En `packages/cli/src/commands.ts` (`approveProcessGate`) y en `packages/server/src/server.ts:572` aceptar `--run` y `--phrase` (campos `run` y `phrase` en el cuerpo) y pasarlos; actualizar el texto de ayuda de `process approve`.
  5. Crear `tests/aprobacion-despliegue.test.ts`: frase correcta aprueba, frase distinta se rechaza, aprobación de la 1.4.0 no habilita la 1.5.0, la aprobación se consume y una segunda corrida con la misma versión queda esperando, una aprobación antigua sin corrida no habilita un gate con frase y sí uno sin frase; correr `npx vitest run tests/aprobacion-despliegue.test.ts`, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; `approvals.json` conserva su forma y los campos nuevos son opcionales, de modo que las aprobaciones escritas con el código nuevo siguen leyéndose con el anterior.

## Criterios de aceptación

- [ ] Aprobar el gate `deploy` con una frase distinta de la declarada, con `{version}` resuelta, se rechaza
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [ ] La aprobación queda atada a la corrida y a la versión: la de la 1.4.0 no habilita el despliegue de la 1.5.0
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [ ] La aprobación se consume al usarse y una segunda corrida queda esperando una aprobación nueva
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [ ] Una aprobación sin corrida ni versión no habilita un gate que exige frase
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->
- [ ] Los gates sin `require_phrase` conservan su comportamiento
      <!-- test: npx vitest run tests/aprobacion-despliegue.test.ts -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

## QA

```json
[]
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
[]
```

## Consumo de IA

```json
[]
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
  }
]
```
