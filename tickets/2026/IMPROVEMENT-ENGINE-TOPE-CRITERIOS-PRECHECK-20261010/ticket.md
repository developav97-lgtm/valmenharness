---
schema_version: 2
id: IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK-20261010
title: El precheck rechaza un plan de más de 20 criterios, no de más de 40
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
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK-20261010

## Solicitud original

La compuerta exige que TODAS las proposiciones pasen approveAt (0,90) y evalúa los criterios en tandas de MAX_CRITERIA_PROPOSITIONS = 12 (packages/gate/src/dynamic.ts:32); cuantos más criterios, más probable que uno caiga entre 0,85 y 0,90 aunque esté cubierto. Medido sobre los 299 recibos cascade del registro el 2026-10-10: la tasa de REVIEW en planes de 12 a 20 proposiciones es del 10 %, de 20 a 30 del 51 % y de 30 a 60 del 69 %; los 14 REVIEW de la jornada JOR-20261010 con mínimo entre 0,80 y 0,90 se aprobaron todos sin cambiar el plan (AP-012 y AP-013). El tope del precheck es hoy TOPE_DE_CRITERIOS = 40 (packages/engine/src/revision-previa.ts:50, hallazgo mas_criterios_que_el_tope). Se pide bajarlo a 20 criterios de aceptación para tickets nuevos, con el mismo mensaje de «partí el ticket», sin invalidar los tickets que ya pasaron la compuerta con más (no se reabren), y con la regla ya escrita en las skills descomposicion y planificacion como referencia. Decisión del PO del 2026-10-10: «Tope de 20 criterios en el precheck (Recomendado)». Cuida que la suma incluya los criterios compuestos partidos, como hoy (revision-previa.ts:45-48).

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

- Causa comprobada (con `ruta:línea`):
- Hipótesis pendientes:
- Consumidores afectados:
- Archivos y flujo investigados:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

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

- [ ]

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
    "at": "2026-10-11T04:20:48.833Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
