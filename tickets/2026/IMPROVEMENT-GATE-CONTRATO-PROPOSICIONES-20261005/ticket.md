---
schema_version: 2
id: IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005
title: Alinear proposiciones, partir impactos y excluir afirmaciones sobre aprobaciones
type: IMPROVEMENT
module: GATE
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

# IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-004: Cada proposición que vota DEBE preguntar lo mismo que dice su descripción y declarar criterios de sí y de no
- R-CPRE-005: Cada impacto declarado DEBE evaluarse con proposiciones atómicas
- R-CPRE-012: Las proposiciones NO DEBEN tomar como evidencia lo que el ticket afirma sobre aprobaciones o compuertas
Depende de: IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

Vector real para el análisis (no es una decisión pendiente): el recibo
`GR-20261006-BUGFIX-GATE-LECTOR-CRITERIOS-20261005-plan-1` (gate `plan`, cascada) dio
`corresponde_a_la_investigacion` = 0.00 —descriptiva, no decide— con la clasificación
«completo» y todo lo demás ≥ 0.94, el mismo patrón de AP-004 y AP-005. Hipótesis sin
comprobar, relacionadas con R-CPRE-004 y R-CPRE-012: el plan se evaluó con la línea «pendiente
de la aprobación explícita del PO» en su primer renglón, y el diagnóstico es largo. El
análisis debe reproducirlo con ese estado (stateHash `7aa937859f2f2e2acc5fe7ac2345433dc4da78391e2866b8ee6f6099d2d6f827`)
antes de proponer un cambio.

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

- [ ] R-CPRE-004: Cada proposición que vota DEBE preguntar lo mismo que dice su descripción y declarar criterios de sí y de no
- [ ] R-CPRE-005: Cada impacto declarado DEBE evaluarse con proposiciones atómicas
- [ ] R-CPRE-012: Las proposiciones NO DEBEN tomar como evidencia lo que el ticket afirma sobre aprobaciones o compuertas

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
    "at": "2026-10-06T01:51:49.457Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
