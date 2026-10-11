---
schema_version: 2
id: FEATURE-CORE-ESTADO-PUBLICO-20261010
title: Función única que deriva el estado público del ticket
type: FEATURE
module: CORE
workflow_status: analyzed
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

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1.
  2.
- Impactos declarados:
  <!-- Una línea por cada impacto que el ticket declara, con las palabras de su proposición:
       sincronización (datos ya sincronizados y clientes que todavía no se actualizaron),
       migración (orden de aplicación y reversión) o contenedores (imagen y publicación). -->
- Rollback (obligatorio):

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] R-EPU-001: Una sola función DEBE derivar el estado público de un ticket

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
  }
]
```
