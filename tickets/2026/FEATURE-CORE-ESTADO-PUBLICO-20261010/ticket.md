---
schema_version: 2
id: FEATURE-CORE-ESTADO-PUBLICO-20261010
title: Función única que deriva el estado público del ticket
type: FEATURE
module: CORE
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CORE-ESTADO-PUBLICO-20261010

## Solicitud original

Parte del sprint: El PO lee cuatro estados públicos con una sola función y recibe aviso cuando algo espera su decisión.
- R-EPU-001: Una sola función DEBE derivar el estado público de un ticket
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una sola función DEBE derivar el estado público de un ticket
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno sin decidir. Lo nuevo del pedido se tradujo a campos reales:
- «compuerta escalada a una persona sin resolver» → recibo con `escalatedTo: "human"` y `humanDecision: null` (`packages/gate/src/receipt.ts:182`).
- «autorización vigente que aprueba el plan sin una persona» → `elegibilidadDeAprobacion({ etapa: "plan" }).elegible` (`packages/engine/src/approval-eligibility.ts:93`).

## Descripción funcional

- Alcance: una función pura en `@valmen/core` que recibe el estado del motor y dos hechos del registro (si la aprobación del plan espera a una persona y si hay una compuerta escalada a una persona sin decisión) y devuelve uno de cuatro estados públicos —Necesita tu decisión, Verificando, Listo, Trabajando—; más un lector en `@valmen/engine` que obtiene esos dos hechos del registro de un ticket y llama a la función. Fuera: la vista web (FEATURE-WEB-ESTADO-PUBLICO-20261010) y el aviso de Telegram (FEATURE-CLI-AVISO-DECISION-20261010), que la consumen después.
- Usuario o rol afectado: el PO, que hoy lee estados del motor agrupados de tres formas distintas; y los dos tickets del sprint S4 que dependen de este.
- Comportamiento actual: no existe estado público; cada vista agrupa `WORKFLOW_STATES` a su manera y ninguna considera el plan que espera aprobación ni la compuerta escalada.
- Comportamiento esperado: una sola función deriva el estado público con las reglas de R-EPU-001 (`.valmen/features/operacion-entrega-harness/spec/s4-estados/spec.md`), y el motivo cuando es «Necesita tu decisión».

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la agrupación de estados está repetida y no coincide entre sí: tablero de la feature `packages/server/web/index.html:4071-4082` (siete columnas, `planned` dentro de «Planeado»), vista Agentes `packages/server/web/index.html:6339` (`ESTADOS_QUE_ESPERAN_AL_PO` = `awaiting_user_tests`, `blocked`, `changes_requested`, usada en `index.html:6411`) y tira de estado `packages/server/web/index.html:5662-5673`. Ninguna mira el plan que espera aprobación ni los recibos escalados. Los estados del motor son `WORKFLOW_STATES` (`packages/core/src/contract.ts:126-138`) y no cambian: el estado público es una proyección.
- Hipótesis pendientes: ninguna sobre la causa. Un recibo escalado de una corrida vieja de una compuerta ya superada por otra corrida podría seguir contando como «espera persona» si se miran todas las corridas (así lo hace `packages/cli/src/hermes.ts:774`); el lector mirará solo el último recibo de cada compuerta, como `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:125-143`).
- Consumidores afectados: ninguno cambia en este ticket (la función es nueva). Consumidores futuros: la web (`index.html:6339`, `:6411`, `:5662`) en FEATURE-WEB-ESTADO-PUBLICO-20261010 y el vigilante `pendientesDeAvisar` (`packages/cli/src/hermes.ts:759`) en FEATURE-CLI-AVISO-DECISION-20261010.
- Archivos y flujo investigados:
  - `packages/core/src/contract.ts:126-138` — `WORKFLOW_STATES`, entrada de la función.
  - `packages/core/src/index.ts:9-29` — reexporta los módulos de core; ahí se suma el nuevo.
  - `packages/gate/src/receipt.ts:182` — `escalatedTo: "human" | null`; con `humanDecision === null` es «compuerta escalada sin resolver», la misma lectura de `packages/server/src/portafolio.ts:104` y `packages/cli/src/hermes.ts:774`.
  - `packages/engine/src/receipts.ts:72-76` — `currentReceipts` colapsa por corrida, no por compuerta; `receipts.ts:125-143` — `veredictoDeCompuerta` toma el último recibo de una compuerta.
  - `packages/engine/src/approval-eligibility.ts:93-293` — `elegibilidadDeAprobacion` con etapa `plan` decide en código si una autorización vigente aprueba el plan sin una persona (tipo no SECURITY, sin despliegue, compuerta en approve, autorización que cubre tipo/módulo/riesgo/impactos/etapa, cupo); su `elegible` es exactamente «planned con autorización vigente».
  - `packages/engine/src/approval-authorization.ts:402-425` — `autorizacionDeAprobacionQueCubre`, usada por la anterior.
  - `packages/engine/src/discovery.ts:424` — `findTicket`, para leer el estado del ticket.
- Riesgos y compatibilidad: `@valmen/core` no toca el disco (AGENTS.md, Stack): por eso la función recibe los hechos ya calculados y el lector vive en `engine`. Aditivo: no cambia ninguna firma ni la máquina de estados. Riesgo de divergencia con `hermes.ts:774` (todas las corridas) frente al último recibo por compuerta: se documenta para el ticket del aviso.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente de la compuerta plan (evaluador cascade) y de la aprobación explícita del PO; no hay autorización de aprobación declarada para este ticket.
- Alcance: una función pura `estadoPublico` en `@valmen/core` (la única que decide el estado público) y un lector `estadoPublicoDelTicket` en `@valmen/engine` que solo reúne del registro los dos hechos que la función recibe. Exclusiones: la web (`packages/server/web/index.html:4071-4082`, `:5662-5673`, `:6339`, `:6411`) queda para FEATURE-WEB-ESTADO-PUBLICO-20261010 y el vigilante (`packages/cli/src/hermes.ts:759`) para FEATURE-CLI-AVISO-DECISION-20261010; la máquina de estados (`packages/core/src/contract.ts:126-138`) no cambia.
- Tamaño previsto: 18 criterios; unas 80 líneas de producción (core ~55, engine ~25) y unas 280 de pruebas, unas 360 en total.
- Pruebas existentes que el plan cambia a propósito: ninguna. Ningún comando, herramienta MCP ni opción existente se toca, así que no lleva prueba de regresión de comando; C18 cubre que nada existente deja de compilar.
- Pasos ordenados:
  1. Prueba primero: crear `tests/estado-publico.test.ts` con un `it` por criterio, nombrado con su prefijo (`C01 …` a `C17 …`), y verla en rojo con `npx vitest run tests/estado-publico.test.ts`. C01–C12 llaman a la función pura; C13–C17 arman un registro temporal con los ayudantes de `tests/elegibilidad-aprobacion.test.ts:71-136` (`ticket`, `recibo`, `autorizar`, con `appendReceipt` y `crearAutorizacionDeAprobacion`). (C01–C17)
  2. Crear `packages/core/src/public-state.ts`: `PUBLIC_STATES = ["needs-decision", "verifying", "done", "working"]`, `PUBLIC_STATE_LABELS` («Necesita tu decisión», «Verificando», «Listo», «Trabajando»), `DecisionReason` (`user-tests`, `blocked`, `changes-requested`, `plan-approval`, `escalated-gate`) y `estadoPublico({ state, planWaitsForPerson, escalatedGatePending })` que devuelve `{ state, label, reason }`. Orden: `blocked`/`changes_requested`/`awaiting_user_tests` → motivo propio; `planned` con `planWaitsForPerson` → `plan-approval`; cualquier estado con `escalatedGatePending` (salvo `qa_approved` y `closed`) → `escalated-gate`; `in_qa` → verifying; `qa_approved`/`closed` → done; el resto → working. Sin imports de disco. (C01–C11)
  3. Reexportar en `packages/core/src/index.ts:9-29` con `export * from "./public-state.js";`. (C12)
  4. Crear `packages/engine/src/public-state.ts` con `estadoPublicoDelTicket(paths, ticketId, ahora?)`: lee el estado con `findTicket` (`packages/engine/src/discovery.ts:424`) y `parseTicket`; `escalatedGatePending` = algún gate cuyo último recibo (`currentReceipts`, `packages/engine/src/receipts.ts:72`, primero por `gate`) tiene `escalatedTo === "human"` y `humanDecision === null`; `planWaitsForPerson` = estado `planned` y `!elegibilidadDeAprobacion({ paths, ticketId, etapa: "plan", ahora }).elegible` (`packages/engine/src/approval-eligibility.ts:93`). Llama a `estadoPublico` y devuelve su resultado. (C13–C17)
  5. Reexportar en `packages/engine/src/index.ts` junto a `receipts.js` (línea 74). (C13)
  6. Ver en verde `npx vitest run tests/estado-publico.test.ts tests/elegibilidad-aprobacion.test.ts` y compilar con `npx tsc --build tsconfig.build.json`. (C18)
- Impactos declarados: ninguno; no hay sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit de implementación; los dos módulos son nuevos y aditivos, ningún consumidor los usa todavía.

## Criterios de aceptación

- [ ] C01: Un ticket en `awaiting_user_tests` deriva «Necesita tu decisión» con motivo `user-tests`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C01 -->
- [ ] C02: Un ticket en `blocked` deriva «Necesita tu decisión» con motivo `blocked`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C02 -->
- [ ] C03: Un ticket en `changes_requested` deriva «Necesita tu decisión» con motivo `changes-requested`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C03 -->
- [ ] C04: Un ticket en `planned` cuya aprobación espera a una persona deriva «Necesita tu decisión» con motivo `plan-approval`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C04 -->
- [ ] C05: Un ticket en `in_progress` con una compuerta escalada sin decisión deriva «Necesita tu decisión» con motivo `escalated-gate`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C05 -->
- [ ] C06: Un ticket en `in_qa` sin compuerta escalada deriva «Verificando».
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C06 -->
- [ ] C07: Un ticket en `qa_approved` deriva «Listo».
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C07 -->
- [ ] C08: Un ticket en `closed` deriva «Listo».
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C08 -->
- [ ] C09: Cada ticket en `intake`, `analyzed`, `approved` o `in_progress` sin compuerta escalada deriva «Trabajando».
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C09 -->
- [ ] C10: Un ticket en `planned` cuyo plan aprueba una autorización vigente deriva «Trabajando».
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C10 -->
- [ ] C11: El módulo `packages/core/src/public-state.ts` no importa `node:fs` ni otro módulo de disco.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C11 -->
- [ ] C12: `estadoPublico` se importa desde el índice de `@valmen/core`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C12 -->
- [ ] C13: En un registro con un ticket en `planned` sin autorización vigente, `estadoPublicoDelTicket` devuelve «Necesita tu decisión» con motivo `plan-approval`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C13 -->
- [ ] C14: En un registro con un ticket en `planned` cubierto por una autorización vigente con la compuerta plan en approve, `estadoPublicoDelTicket` devuelve «Trabajando».
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C14 -->
- [ ] C15: En un registro con un ticket en `in_progress` con un recibo escalado sin decisión, `estadoPublicoDelTicket` devuelve «Necesita tu decisión» con motivo `escalated-gate`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C15 -->
- [ ] C16: Un recibo escalado con decisión humana registrada no cuenta como compuerta escalada para `estadoPublicoDelTicket`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C16 -->
- [ ] C17: Un recibo escalado sin decisión que una corrida posterior de la misma compuerta superó no cuenta para `estadoPublicoDelTicket`.
      <!-- test: npx vitest run tests/estado-publico.test.ts -t C17 -->
- [ ] C18: El monorepo compila sin errores de tipos con los dos módulos nuevos.
      <!-- test: npx tsc --build tsconfig.build.json -->

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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:34.972Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T19:34:58.019Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T19:39:57.039Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261011-FEATURE-CORE-ESTADO-PUBLICO-20261010-analysis-1, canal cli, decidida 2026-10-11T19:39:57.034Z): Aprobar el análisis (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T19:40:38.968Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
