---
schema_version: 2
id: FEATURE-RELEASES-MANIFIESTO-ENTREGA-20260921
title: Manifiesto de entrega y proceso de novedades por proyecto
type: FEATURE
module: RELEASES
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-21
updated: 2026-09-23
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

- Gate de plan y aprobación: aprobado explícitamente por el PO (gate de plan).
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

El trabajo se implementó y quedó verificado por la suite automática desde entonces; lo que
faltaba era recorrer el registro, que es lo que este cierre pone al día.

- Comando: `npx vitest run`, desde la raíz del repositorio. Resultado: 37 archivos de prueba
  pasan, 872 pruebas en verde (48 saltadas, las de equivalencia contra `ticket.py`, que están
  desactivadas por defecto).
- Comando: `npx vitest run tests/report-delivery.test.ts`. Resultado: 43 pruebas en verde, que
  cubren los cinco criterios de aceptación de este ticket.
- Validación manual del manifiesto: no ejecutada. Ver la omisión de abajo.
- Omisión explícita documentada de pruebas por el PO: el 2026-09-23 el responsable indicó
  cerrar los tickets que quedaron abiertos de la sesión del 21 de septiembre, con estas
  palabras —«con lo que me dices de esos tickets viejos si cierras»—, sin una pasada de
  aceptación manual sobre la aplicación. El motivo de la omisión es que el trabajo está en el
  árbol y verificado por la suite, y el ticket llevaba dos días en `approved` sin que nadie lo
  moviera. La omisión es de la **prueba manual**, no de la verificación: lo que no hay es una
  persona que haya abierto Mission Control a comprobarlo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-23",
    "build_reference": "commit:379f130c882d48b03fdd6bdd6c12817e960864f4",
    "environment": "local, macOS, Node 22+, sin despliegue",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-23",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "instrucción explícita del responsable del 2026-09-23: cerrar los tickets viejos de la sesión del 21 de septiembre"
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-23",
    "technical_summary": "Manifiesto de entrega por versión en .valmen/deliveries/<versión>.json, escrito desde el motor (packages/engine/src/release.ts) y expuesto como valmen deliver-manifest. Rechaza cualquier ticket que no esté cerrado, visible al usuario y sin publicar. El formato de proceso se declara en .valmen/processes/ y el proceso de ejemplo deja escrito que las novedades van antes de publicar.",
    "functional_summary": "Cada versión tiene su manifiesto: qué tickets entraron, con el resumen funcional del último cierre de cada uno. El proyecto declara el proceso que lo convierte en su propio artefacto, así que el orden —novedades antes de publicar— deja de vivir en la cabeza de quien opera.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
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
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-21",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-23",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-23",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-23",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
