---
schema_version: 2
id: FEATURE-RELEASES-MANIFIESTO-ENTREGA-20260921
title: Manifiesto de entrega y proceso de novedades por proyecto
type: FEATURE
module: RELEASES
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-21
updated: 2026-09-21
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-RELEASES-MANIFIESTO-ENTREGA-20260921

## Solicitud original

El harness debe producir un manifiesto de entrega por versión —qué tickets entraron y el resumen funcional de cada cierre— y cada proyecto debe poder declarar el proceso que lo convierte en su artefacto. En SaiOpenCloud ese artefacto es un JSON que carga el menú principal del frontend.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/release.ts` (publicación), `release_notes.py` del proyecto migrado (190 líneas) y el orden documentado en `docs/agentic/rules/delivery.md`.
- Causa raíz o hipótesis: el artefacto de novedades es específico de cada cliente, y por eso no puede vivir dentro del harness. Lo que sí es común es el dato: qué tickets entraron en una versión y qué cambió, en las palabras del último cierre.
- Riesgos y compatibilidad: hoy `release_notes.py` exige `release_status: unreleased`, así que tiene que correr **antes** de publicar. Ese orden vive en la cabeza de quien opera y hay que moverlo al proceso.
- Impactos de sync, migración, Docker o despliegue: ninguno en el harness; en SaiOpenCloud nada, el artefacto ya se genera así.

## Plan

- Gate no exigible: es una capacidad nueva, sin impacto de sincronización, migración ni despliegue, y no cambia nada de lo que hoy funciona.
- Pasos ordenados:
  1. Añadir en `packages/engine` una función que construya el manifiesto de entrega: versión, fecha, y por cada ticket el identificador, el tipo, el módulo, el título y el resumen funcional del último cierre. Falla si algún ticket no está cerrado.
  2. Escribirlo en `.valmen/deliveries/<versión>.json`, versionado, con la misma serialización que los bloques para que sea reproducible byte a byte.
  3. Declarar el formato de proceso en `.valmen/processes/<id>.yaml`: pasos ordenados, cada uno con su comando, y los gates que lo protegen. Un proceso no ejecuta nada por su cuenta: se declara y se ejecuta paso a paso.
  4. Escribir el proceso de SaiOpenCloud como ejemplo: generar novedades desde el manifiesto, y después publicar. El orden es parte del proceso, no de la memoria de quien opera.
  5. Test que verifica que el manifiesto contiene el resumen funcional del último cierre y que un ticket abierto lo rechaza.
- Rollback: quitar el comando; los manifiestos ya escritos son datos, no estado del harness.

## Criterios de aceptación

- [ ] El manifiesto de una versión lista los tickets incluidos con el resumen funcional de su último cierre.
- [ ] Un ticket que no está cerrado impide generar el manifiesto, con el identificador en el mensaje.
- [ ] Dos ejecuciones sobre el mismo registro producen el mismo archivo, byte a byte.
- [ ] Un proceso declarado en `.valmen/processes/` lista sus pasos en orden y los gates que lo protegen.
- [ ] El proceso de ejemplo documenta que las novedades van antes de publicar, y por qué.

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
    "date": "2026-09-21",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-21",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-21",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
