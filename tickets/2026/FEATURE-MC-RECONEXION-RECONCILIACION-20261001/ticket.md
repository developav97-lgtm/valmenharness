---
schema_version: 2
id: FEATURE-MC-RECONEXION-RECONCILIACION-20261001
title: Reconciliar eventos pendientes tras reconexión
type: FEATURE
module: MC
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-RECONEXION-RECONCILIACION-20261001

## Solicitud original

Parte del sprint: Actualizar la vista en vivo con reconexión, frescura y lecturas acotadas.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
Depende de: FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001, FEATURE-MC-HOJA-RUTA-20261001, FEATURE-MC-SELECTOR-PROYECTOS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

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

- [ ] R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- [ ] R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.

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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:45.175Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
