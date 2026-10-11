---
schema_version: 2
id: FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010
title: Exigir la revisión del diff al entregar un ticket y adaptar a quienes entregan
type: FEATURE
module: GATE
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

# FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010

## Solicitud original

Es la Parte B de FEATURE-GATE-CODE-REVIEW-20261010, que el PO pidió partir el 2026-10-10 («Partir: A aquí, B en un ticket nuevo (Recomendado)»): la Parte A crea la compuerta `code-review` (recibo atado al árbol revisado, profundidad por riesgo y una sola corrección) y se invoca a mano con `valmen gate code-review --id <ID>`; esta parte la exige en la entrega y adapta a quienes entregan. Depende de que la Parte A esté integrada. El PO decidió también NO activar la clave en este repositorio por ahora: `code-review: exigida` en `.valmen/config.yaml` queda como interruptor que agrega una persona después de ver cuánto cuesta y cuánto sirve; sin la clave, la entrega no cambia en ningún proyecto. El plan de la Parte A (paso 15) activaba la clave en este repositorio: aquí NO se hace. Lo que el plan original asignaba a esta parte, tal cual, para que el análisis lo verifique contra el código real y no lo dé por cierto:

PASOS DEL PLAN ORIGINAL (11 a 15)
11. Parte B. En `packages/engine/src/discovery.ts`, crear `codeReviewExigida(root)`: lee la clave `code-review` de `.valmen/config.yaml` del árbol de trabajo y de `git show HEAD:.valmen/config.yaml` (con el `git` de solo lectura de `packages/engine/src/diff.ts`), y devuelve verdadero si alguno dice `exigida`. (C27, C28)
12. En `packages/engine/src/transition.ts`, crear `exigirRevisionDeCodigo(document, paths)` y llamarla después de `exigirVerificacionMecanica` (`:461-463`) cuando `codeReviewExigida`: sin recibo, «La entrega requiere la revisión del diff: valmen gate code-review --id <ID>»; con `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:125-145`) distinto de `aprobada`, el motivo del recibo y quién decide; aprobada con `motivoDeArbolNoVigente(recibo, paths, id, "code-review")` no nulo, ese motivo. (C23, C24, C25, C26, C27, C28)
13. En `packages/engine/src/next-step.ts`, caso `in_progress` de `computeNextStep` (`:374-431`), con la verificación mecánica vigente y la revisión exigida: paso «revisión del diff» con `valmen gate code-review --id <ID>`; tras un bloqueo de ronda 1, «una sola corrección acotada a los hallazgos y volver a correrla»; con la ronda 2 escalada, el alto de una persona; con el árbol cambiado, el motivo de `motivoDeArbolNoVigente`. En `packages/engine/src/journey-brief.ts` (`:195-201`), con la revisión exigida, sumar `valmen gate code-review --id <ID>` a las compuertas de implementación. (C29, C37)
14. En `packages/engine/src/autonomous-run.ts`, con la revisión exigida, correr `runGate` de `code-review` después de `qa-mechanical` (`:483`) y antes de entregar (`:516`); si no aprueba, detenerse con `verification-failed` y el id del recibo. En `packages/cli/src/delegation.ts` (`:314-323`), con la revisión exigida, `resolverPorDelegacion(..., "code-review", undefined, deps, true)` antes de `transition`: sin motivo, un `review` o un `block` frenan la delegación. (C35, C36)
15. Agregar `code-review: exigida` a `.valmen/config.yaml` de este repositorio, con un comentario que explica la clave y que quitarla sin commit no la apaga. (C27, C28)

CRITERIOS DEL PLAN ORIGINAL
C23 — R-REV-004: Con la revisión exigida, la entrega a `awaiting_user_tests` sin recibo de `code-review` se rechaza.
C24 — R-REV-004: Con un recibo `approve` de `code-review` seguido de otro contenido commiteado, la entrega se rechaza pidiendo revisar el árbol nuevo.
C25 — R-REV-004: Con un recibo `approve` de `code-review` del árbol actual, la entrega se acepta.
C26 — R-REV-004: Un recibo `review` de `code-review` aprobado por una persona permite entregar ese mismo árbol.
C27 — R-REV-004: Sin la clave `code-review: exigida`, la entrega no pide la revisión del diff.
C28 — R-REV-004: Quitar `code-review: exigida` del árbol de trabajo sin commitearlo no quita la exigencia.
C29 — R-REV-004: Con el árbol actual distinto del revisado, `computeNextStep` en `in_progress` indica correr `valmen gate code-review`.
C35 — R-REV-004: La jornada autónoma con la revisión exigida corre `code-review` antes de entregar.
C36 — R-REV-004: La corrida delegada con la revisión exigida corre `code-review` antes de entregar.
C37 — R-REV-004: Con la revisión exigida, el brief de un subagente lista `valmen gate code-review` entre las compuertas de implementación.

El evaluador dudó en C25 y C26 (0,86 y 0,80) en la compuerta del plan original: el plan de este ticket los redacta explícitos. Cuida que la jornada autónoma (autonomous-run.ts:483,516) y la corrida delegada (delegation.ts:314-323, ceremony.ts:110) no entreguen sin la revisión cuando está exigida, y que ninguna aprueba un review por su cuenta: lo decide una persona.

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
    "at": "2026-10-11T01:25:12.308Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
