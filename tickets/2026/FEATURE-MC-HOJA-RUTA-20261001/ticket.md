---
schema_version: 2
id: FEATURE-MC-HOJA-RUTA-20261001
title: Presentar hoja de ruta de las jornadas seleccionadas
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

# FEATURE-MC-HOJA-RUTA-20261001

## Solicitud original

Parte del sprint: Persistir jornadas y mostrar su hoja de ruta sin habilitar despacho.
- R-VIV-001: Mission Control DEBE presentar la hoja de ruta completa de las jornadas seleccionadas.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.
Depende de: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001, FEATURE-MC-SELECTOR-PROYECTOS-20261001, FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001, FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
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

- [ ] R-VIV-001: Mission Control DEBE presentar la hoja de ruta completa de las jornadas seleccionadas.
- [ ] R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- [ ] R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.

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
    "at": "2026-10-01T19:10:45.079Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
