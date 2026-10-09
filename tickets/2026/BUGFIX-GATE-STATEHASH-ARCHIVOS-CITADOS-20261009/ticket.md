---
schema_version: 2
id: BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS-20261009
title: El recibo guarda el estado con archivos citados y la aprobación lo recalcula sin ellos
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

# BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS-20261009

## Solicitud original

El PO dijo el 2026-10-09, al cerrar IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009 sin corrida real: «si hay un error con esas dos yo te abro un bugfix», y al aparecer el error eligió por AskUserQuestion «Abrirlo y hacerlo ya (Recomendado)». Síntoma: `valmen approve-by-authorization` rechaza dos veces el plan de IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009 con «El recibo … de la compuerta plan evaluó otro texto del ticket (cambió después de la compuerta)» aunque el texto no cambió entre la compuerta y la aprobación. Causa observada por el orquestador: desde f031e65 la compuerta añade `archivos_citados` al estado antes de calcular el stateHash del recibo (packages/engine/src/gate.ts:469-480), y quien lo compara lo recalcula con `buildGateState(texto)` sin las citas: packages/engine/src/approval-eligibility.ts:364, packages/engine/src/reviewer.ts:224 y :438, packages/engine/src/next-step.ts:411, packages/server/src/gates.ts:256, :559 y :687, packages/cli/src/hermes.ts:622. Mientras no se arregle, ningún plan con citas en el diagnóstico se aprueba por autorización y las aprobaciones van por persona.

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
    "at": "2026-10-09T15:03:55.881Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
