---
schema_version: 2
id: FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001
title: Elegir el siguiente ticket independiente y autorizado
type: FEATURE
module: ENGINE
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

# FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001

## Solicitud original

Parte del sprint: Integrar selección y capacidad con autonomía existente y despacho Hermes opcional.
- R-JOR-002: La selección DEBE permitir avanzar con un ticket independiente y autorizado cuando otro espera intervención.
- R-JOR-003: El siguiente ticket elegible DEBE poder iniciar por disponibilidad sin esperar una hora fija posterior.
Depende de: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001, FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-RUN-AUTONOMO-20260926, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [jornadas/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/jornadas/spec.md).

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

- [ ] R-JOR-002: La selección DEBE permitir avanzar con un ticket independiente y autorizado cuando otro espera intervención.
- [ ] R-JOR-003: El siguiente ticket elegible DEBE poder iniciar por disponibilidad sin esperar una hora fija posterior.

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
    "at": "2026-10-01T19:10:45.327Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
