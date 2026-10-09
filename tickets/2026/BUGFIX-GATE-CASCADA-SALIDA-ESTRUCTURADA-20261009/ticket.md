---
schema_version: 2
id: BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009
title: La cascada falla porque el productor no entrega todas las proposiciones del esquema
type: BUGFIX
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

# BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009

## Solicitud original

El PO eligió el 2026-10-09 por AskUserQuestion «Arreglar cascade con haiku (Recomendado)»: falló en casi todas las compuertas de hoy y cae a jev, el evaluador más débil. Síntoma, que ahora el recibo deja escrito (`evaluatorFailure`): «INVALID_REQUEST … error_max_structured_output_retries … Failed to provide valid structured output after 5 attempts … must have required property 'cubre_todos_los_criterios'» (también `structured_output_retry_exhausted`), con el productor claude-haiku-4-5-20251001. Se vio en las compuertas de plan de IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009, IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009 y las cuatro de BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008; en otras corridas la cascada sí funcionó (por ejemplo la del plan de FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009 con 40 criterios). Modo según EST-008: harness completo, porque la causa no está clara (puede ser el tamaño del esquema, el número de proposiciones por tanda o el modelo productor).

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
    "at": "2026-10-09T18:25:01.408Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
