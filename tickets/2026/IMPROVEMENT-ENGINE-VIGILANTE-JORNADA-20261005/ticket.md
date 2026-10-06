---
schema_version: 2
id: IMPROVEMENT-ENGINE-VIGILANTE-JORNADA-20261005
title: Avisar pruebas pendientes, fallos y parte diario por Telegram
type: IMPROVEMENT
module: ENGINE
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

# IMPROVEMENT-ENGINE-VIGILANTE-JORNADA-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-008: El vigilante DEBE avisar cada ticket que llega a las pruebas del responsable y el parte diario
Depende de: FEATURE-ENGINE-TOPES-Y-PARADA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

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

- [ ] R-JORN-008: El vigilante DEBE avisar cada ticket que llega a las pruebas del responsable y el parte diario

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
    "at": "2026-10-06T01:51:50.952Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
