---
schema_version: 2
id: SECURITY-ENGINE-QA-POR-POLITICA-20261005
title: Conectar qa-agent al flujo y atribuir el ciclo de QA a la autorización
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
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-QA-POR-POLITICA-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-006: Un ciclo de QA aprobado por política DEBE atribuirse a la autorización, no al agente
Depende de: SECURITY-ENGINE-COMPUERTA-QA-AGENT-20261005, SECURITY-GATEHTTP-CRITERIO-HTTP-20261005, SECURITY-MC-AUTORIZACION-QA-20261005, FEATURE-ENGINE-JORNADA-EJECUCION-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que un ticket elegible, con una verificación `qa-agent` aprobada y vigente, pueda cerrar su ciclo de QA **por política** (R-QAAG-006): el bloque de QA nombra la autorización aplicada y el actor `policy` en lugar de una confirmación escrita por el agente, la validación del ticket lo acepta como aprobación, se consume un cupo diario, y llega un aviso «QA aprobada por política» con el recibo y la forma de reabrir. Fuera de alcance: el periodo en sombra (R-QAAG-008, ticket siguiente), decidir qué tickets se intentan y llevar el ticket de `qa_approved` a `closed` (el cierre final sigue siendo el paso de siempre).
- Usuario o rol afectado: el responsable que autorizó el cierre por agente y debe poder ver, ticket por ticket, que lo aprobó su política y no el agente; el agente, que no puede aprobar QA por su cuenta.
- Comportamiento actual: `qaClose` (`packages/engine/src/append.ts:609`) exige una confirmación textual del PO para aprobar y rechaza a una sesión desatendida (`assertSesionAtendida`); `hasApprovedQaCycle` (`packages/core/src/validate.ts:314`) acepta un ciclo aprobado solo si trae `po_confirmation` no vacío; no existe ninguna ruta que una la autorización persistida, la elegibilidad y el recibo de `qa-agent` con un cierre de QA.
- Comportamiento esperado: `valmen qa-policy-close --id <ID>` (1) vuelve a evaluar `elegibilidadQa` y se niega si no es elegible; (2) exige el recibo más reciente de `qa-agent` del ticket con veredicto `approve`, cuyo commit entregado coincida con el HEAD actual y cuyo hash de árbol coincida con el del commit, y cuya autorización (id y hash) siga vigente; (3) con el ticket en `in_qa`, abre y cierra el ciclo con `po_confirmation: "política:<id de la autorización>"`, el actor `policy`, la autorización citada y la referencia al recibo; (4) consume un cupo del día; (5) pasa el ticket a `qa_approved`; (6) deja un aviso «QA aprobada por política» con el recibo y el comando para reabrir. Si cualquier paso falla no queda un ciclo a medias. Una sesión desatendida puede ejecutarlo (es su razón de ser), pero `qa-close` sigue rechazándola.

## Diagnóstico

- Archivos y flujo investigados: el ciclo de QA se abre con `qaStart` y se cierra con `qaClose` en `packages/engine/src/append.ts`; `qaClose` aprueba solo con confirmación del PO y sesión atendida; la validación de un ciclo aprobado es `hasApprovedQaCycle` en `packages/core/src/validate.ts:314`, que lee `po_confirmation` del cierre y `build_reference` y `environment` de la apertura; la autorización persistida, el cupo y la elegibilidad son `autorizacionQueCubre`, `registrarUsoDeCupo` (`packages/engine/src/qa-authorization.ts`) y `elegibilidadQa` (`packages/engine/src/qa-eligibility.ts`); el recibo es `leerRecibosQaAgent` (`packages/engine/src/qa-agent-receipt.ts`); los avisos del vigilante usan entradas del registro de aprobaciones, como `tests-ready-notice` en `packages/engine/src/approval.ts:126`, que emite `packages/cli/src/hermes.ts:934`.
- Causa raíz o hipótesis: el síntoma es que cerrar QA sin una persona hoy exigiría que el agente escriba una confirmación que no es suya; el diseño correcto es que la aprobación se atribuya a una política auditable. La causa comprobada es que `qaClose` y `hasApprovedQaCycle` solo conocen una confirmación escrita, y no hay un camino que reúna autorización, elegibilidad y recibo. Hipótesis a confirmar al implementar: que los bloques de QA admitan campos adicionales (`actor`, `authorization`, `receipt`) sin romper el validador del contrato.
- Riesgos y compatibilidad: (a) es la pieza que permite cerrar sin una persona, por eso el camino es único, cada precondición se comprueba en código y se vuelve a evaluar al cerrar; el recibo debe corresponder al HEAD y al árbol actuales para que un cambio posterior invalide la aprobación; (b) la política no puede cerrar `SECURITY`, `SYNC`, `INTEGRATION` ni `AGENT` ni nada que `elegibilidadQa` rechace; (c) la escritura del ciclo es atómica con los mismos ayudantes de `append.ts`: si falla algo después de abrir el ciclo no se deja un ciclo pendiente; (d) Consumidores comprobados con búsqueda: `hasApprovedQaCycle` lo llaman la validación del ticket y la transición a `qa_approved`; aceptar `política:<id>` no cambia su regla (no vacío) pero se agrega una comprobación de que, si el actor es `policy`, exista la autorización citada; las pruebas de `qa-close` existentes deben seguir rechazando la sesión desatendida; (e) Un proyecto sin autorizaciones no cambia: la ruta nueva responde «no elegible».
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente
- Alcance: el cierre del ciclo de QA por política, su validación y su aviso. Exclusiones: el periodo en sombra, decidir qué tickets se intentan y el paso de `qa_approved` a `closed`.
- Pasos ordenados:
  1. Crear `packages/engine/src/qa-policy-close.ts` con `cerrarQaPorPolitica({ paths, ticketId, ahora, git? })`: evalúa `elegibilidadQa` con el diff base..HEAD, toma el último recibo de `leerRecibosQaAgent`, exige veredicto `approve`, `delivered` igual al HEAD y `treeHash` igual al árbol del HEAD (con la lista cerrada de git de `packages/engine/src/qa-agent-git.ts`), y que su autorización (id y hash) siga vigente según `autorizacionQueCubre`; cualquier incumplimiento lanza un error con el motivo y no escribe nada.
  2. En el mismo `packages/engine/src/qa-policy-close.ts`, con el ticket en `in_qa`, abrir el ciclo con `qaStart` (referencia de build `commit:<sha>` del entregado y ambiente `qa-agent worktree limpio`) y cerrarlo con una función nueva `qaCloseByPolicy` que agregue en `packages/engine/src/append.ts`, junto a `qaClose`, escribiendo `po_confirmation: "política:<id>"`, `actor: "policy"`, `authorization: { id, hash }` y `receipt: <ruta:línea del recibo>` sin pasar por `assertSesionAtendida` (la barrera es el conjunto de precondiciones del paso 1); si el cierre falla, no deja el ciclo abierto.
  3. En `packages/core/src/validate.ts` hacer que `hasApprovedQaCycle` y la validación del bloque de QA acepten un cierre con `actor: "policy"` solo si trae `authorization.id` y `receipt` no vacíos; un `po_confirmation` que empiece por `política:` sin esos campos, o con `actor: "policy"` escrito por `qaClose`, se rechaza.
  4. Tras el cierre, en `qa-policy-close.ts`: `registrarUsoDeCupo` (consume un cupo, solo después de cerrar), mover el ticket a `qa_approved` con la transición habitual y anexar al registro de aprobaciones un aviso `policy-close-notice` (agregarlo a los tipos de `packages/engine/src/approval.ts`, a su lectura y a la exclusión de `pendingApprovals`) con el ticket, la autorización, el recibo y la forma de reabrir (`valmen transition --id <ID> --entity ticket --to changes_requested`).
  5. En `packages/cli/src/hermes.ts` agregar el envío del aviso «QA aprobada por política» desde el vigilante, una sola vez por ticket, con el enlace al recibo y el comando para reabrir; y en `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` el comando `qa-policy-close --id <ID>` con su ayuda, que sale con error de invariante si no se puede cerrar.
  6. Crear `tests/qa-por-politica.test.ts` con repositorios git temporales y un caso por criterio: cierre válido (el bloque de QA nombra la autorización y el actor `policy`, el ticket pasa la validación y queda en `qa_approved`, se consume un cupo y se anexa el aviso), recibo ausente, con veredicto `block` o de otro commit (HEAD cambió) no cierra, autorización revocada o sin cupo no cierra, ticket no elegible (tipo SECURITY, criterio manual) no cierra, `qa-close` sigue rechazando la sesión desatendida y un cierre con `actor: "policy"` falsificado sin autorización citada no valida; correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; ningún flujo llama todavía al cierre por política y los tickets cerrados por otras vías no cambian.

## Criterios de aceptación

- [ ] Un ticket elegible con `qa-agent` aprobado cierra su ciclo de QA por política: el bloque nombra la autorización y el actor `policy`, la validación lo acepta y el ticket queda en `qa_approved`
      <!-- test: npx vitest run tests/qa-por-politica.test.ts -->
- [ ] Sin recibo aprobado, con un recibo de otro commit u otro árbol, con la autorización revocada o sin cupo, o siendo no elegible, no cierra y no deja un ciclo a medias
      <!-- test: npx vitest run tests/qa-por-politica.test.ts -->
- [ ] `qa-close` sigue rechazando a una sesión desatendida y un cierre con `actor: policy` sin autorización o recibo citados no valida
      <!-- test: npx vitest run tests/qa-por-politica.test.ts -->
- [ ] El cierre consume un cupo del día y deja un aviso «QA aprobada por política» con el recibo y la forma de reabrir
      <!-- test: npx vitest run tests/qa-por-politica.test.ts -->

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
    "at": "2026-10-06T01:51:51.368Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:59:43.391Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T05:00:02.123Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
