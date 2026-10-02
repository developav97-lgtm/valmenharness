---
schema_version: 2
id: FEATURE-ADAPTER-OPENCODE-CODEX-20261001
title: Declarar lectores OpenCode y Codex con sus límites
type: FEATURE
module: ADAPTER
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

# FEATURE-ADAPTER-OPENCODE-CODEX-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-006: Un ticket ejecutado directamente DEBE ser observable sin tablero ni jornada.
- R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
- R-CON-005: Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.
Depende de: FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

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

- [ ] R-ACT-006: Un ticket ejecutado directamente DEBE ser observable sin tablero ni jornada.
- [ ] R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
- [ ] R-CON-005: Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.

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
    "at": "2026-10-01T19:10:44.817Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
