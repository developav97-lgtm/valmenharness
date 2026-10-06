---
schema_version: 2
id: BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005
title: Distinguir fallas del entorno de pruebas fallidas y guardar la cola de la salida
type: BUGFIX
module: GATECOMMAND
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005

## Solicitud original

Parte del sprint: Compuertas sin defectos: lector de criterios, contradicción descriptiva, firma, motivos, fallas del entorno, preparación del ambiente y no repetir sobre el mismo estado.
- R-CDEF-006: La compuerta mecánica DEBE distinguir un comando que no llegó a probar de una prueba que falló
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

Vector real para el análisis (no es una decisión pendiente): BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004
(commit `a0ea22d`) hizo que `transition()` exija una decisión humana al entrar a `planned` y
`approved` con la compuerta en `block` o `review`, y dejó **fuera** a `qa-mechanical` a propósito:
un comando que falló es un hecho y no una opinión, así que `withHumanDecision` no admite decisión
sobre su `block`. Pero este ticket (R-CDEF-006) va a producir un `review` de `qa-mechanical` para la
falla del entorno, y hoy `exigirVerificacionMecanica` (`packages/engine/src/transition.ts`) solo
rechaza el `block`: un `review` sin firma dejaría pasar `in_progress → awaiting_user_tests`, es decir,
entregar a la persona trabajo que no llegó a probarse. Lo que el análisis tiene que decidir: que la
entrega con un `review` mecánico exija la decisión humana registrada (el recibo `review` ya admite
la decisión por `valmen gate-decide`, porque `buildReceipt` lo escala), con el mismo mensaje y la
misma constancia en el ticket que ya existen: `veredictoDeCompuerta` y `describirDecisionHumana`
(`packages/engine/src/receipts.ts`) y `eventosPrevios` (`packages/engine/src/mutate.ts`). La prueba
`R-CDEF-004 compuerta mecánica` (`tests/firma-de-compuerta.test.ts`) fija el límite actual.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
- Causa raíz o hipótesis:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1.
  2.
- Rollback:

## Criterios de aceptación

- [ ] R-CDEF-006: La compuerta mecánica DEBE distinguir un comando que no llegó a probar de una prueba que falló

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
    "at": "2026-10-06T01:51:49.192Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
