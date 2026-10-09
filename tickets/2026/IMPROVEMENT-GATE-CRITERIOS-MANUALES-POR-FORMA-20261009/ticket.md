---
schema_version: 2
id: IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009
title: Validar por forma en código los criterios manuales y contar afirmaciones en el tope de criterios
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
created: 2026-10-09
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009

## Solicitud original

El PO eligió el 2026-10-09 «arreglemos las fugas» con la opción «Ruido de REVIEW»: los criterios `verify: manual` se validan por forma en código y no por el modelo, y el tope de 40 cuenta afirmaciones. Hallazgo de la corrida vista-agentes (.valmen/features/vista-agentes/aprobaciones-claude.md, «Revisión final de las compuertas», punto 3): las vueltas extra de plan (renombrado 3, pastelería 3, marco, lienzo y texto 2 cada uno) fueron casi siempre por criterios manuales o compuestos en banda 0.77-0.90; partir criterios no siempre subió la nota (marco pasó de 4 a 7 en banda), el evaluador fue inconsistente con formas idénticas (pastelería C37 contra C34-C36), el verificador puntúa bajo criterios «el test X pasa» que ya cubre el gate mecánico (pantalla de autorizaciones C31 0.51, C32 0.27, C34 0.35), y el tope de 40 chocó con partir.

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
    "date": "2026-10-09",
    "at": "2026-10-09T14:34:13.915Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
