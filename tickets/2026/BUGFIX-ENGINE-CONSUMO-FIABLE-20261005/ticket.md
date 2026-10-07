---
schema_version: 2
id: BUGFIX-ENGINE-CONSUMO-FIABLE-20261005
title: Impedir sesiones duplicadas y registrar el costo de Hermes y Codex
type: BUGFIX
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-CONSUMO-FIABLE-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CTRL-005: Una sesión con números de consumo NO DEBE cargarse completa a más de un ticket
- R-CTRL-006: El consumo de Hermes y Codex DEBERÍA registrar costo o declarar por qué no lo tiene
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (R-CTRL-005) que una sesión con números de consumo no se cargue completa a más de un ticket, y que el informe de valor la cuente una sola vez, también en el histórico; y (R-CTRL-006, un DEBERÍA) que el consumo de una sesión de Codex o de Hermes sin costo declare por qué no lo tiene en vez de dejar un hueco ambiguo. Fuera de alcance: una tabla de precios por modelo (los precios se inventarían), y reescribir el consumo ya registrado, que es append-only.
- Usuario o rol afectado: quien lee el informe de valor y el consumo de un ticket para saber cuánto costó, y el agente que registra el consumo de una sesión que atendió varios tickets.
- Comportamiento actual: `add-ai-usage` acepta la misma referencia de sesión con números en cualquier cantidad de tickets, y `reporte_valor` suma el costo de cada ticket, así que una sesión cargada a dos tickets se cuenta dos veces; la foto automática del cierre (`guardarFotoEnTicket`) declara compartidas solo las sesiones que su propio reparto detecta. Una sesión sin costo en su origen deja el campo vacío con una nota en prosa, sin una marca que un lector automático distinga entre suscripción y desconocido.
- Comportamiento esperado: registrar con números una sesión que ya tiene números en otro ticket se rechaza, diciendo que una sesión compartida se declara con `manual:` y sin números; la foto automática, ante esa situación, la declara compartida sin números en vez de fallar; el informe de valor cuenta cada sesión con números una vez y señala la duplicación del histórico; y el consumo sin costo lleva una marca explícita —«suscripción» o «desconocido»— y nunca se suma como cero.

## Diagnóstico

- Archivos y flujo investigados: `addAiUsage` en `packages/engine/src/append.ts` valida y anexa la entrada del bloque «Consumo de IA» dentro de una mutación de un solo ticket, sin mirar los demás; `ticketValueReport` en `packages/engine/src/value.ts` suma `estimated_cost_usd` de cada entrada de cada ticket cerrado y cuenta como desconocidas las que no traen costo (`sessionsUnknown`), pero no deduplica referencias de sesión entre tickets; `guardarFotoEnTicket` en `packages/server/src/timeline.ts` arma la entrada de cada sesión del ticket —sin números cuando su reparto la declara compartida, y con la nota «Proveedor por suscripción» cuando no hay costo—. `documentsForReport` de `packages/engine/src/mutate.ts` lee todo el registro tolerando tickets ilegibles.
- Causa raíz o hipótesis: la unicidad de la sesión con números es una regla entre tickets y el motor solo valida un ticket a la vez; y el informe suma lo que cada ticket dice sin comprobar que dos digan lo mismo.
- Riesgos y compatibilidad: el rechazo solo aplica a entradas **nuevas** con referencia de sesión y con algún número; las entradas sin referencia (`manual:` sin números) y las ya escritas no cambian, porque el bloque es append-only. En el histórico los duplicados existen —el informe los señala y cuenta la sesión una vez— sin reescribir nada. La foto automática no debe fallar al cerrar un ticket por una duplicación ajena: la declara compartida y lo dice en la nota. Sobre el costo: sin una tabla de precios verificable no se calcula nada; se declara la causa. «Suscripción» se asigna a las sesiones de Codex y de Claude Code y «desconocido» a las demás sin costo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la regla entre tickets al registrar consumo, la deduplicación del informe de valor, la declaración de sesión compartida en la foto automática y la marca de costo, con pruebas. Exclusiones: tabla de precios y reescritura del histórico.
- Pasos ordenados:
  1. En `append.ts` del motor, agregar `sessionNumbersOwner(paths, referencia, ticketId)`, que recorre `documentsForReport` y devuelve el ticket que ya tiene esa referencia de sesión con algún número (tokens o costo) distinto del actual; y hacer que `addAiUsage` rechace una entrada con referencia de sesión y números cuando existe ese dueño, con un mensaje que nombre el ticket e indique declarar la sesión compartida con `manual:` y sin números.
  2. En `value.ts`, hacer que `ticketValueReport` cuente una vez cada referencia de sesión con costo —la primera, en el orden de cierre—, agregue al informe `duplicatedSessions` (sesión y tickets que la cargan) y que `renderValue` lo señale.
  3. En `timeline.ts` del servidor, hacer que `guardarFotoEnTicket` declare una sesión sin números, como compartida, cuando `sessionNumbersOwner` encuentra que otro ticket ya la tiene con números, y que la nota lo diga.
  4. En el mismo archivo, agregar `marcaDeCosto(sesion)` —«suscripción» para Codex y Claude Code, «desconocido» para el resto— y escribir en la nota de toda sesión sin costo una línea `Costo: <marca>; no es cero`, en lugar del texto genérico anterior.
  5. Crear `tests/consumo-fiable.test.ts`: una sesión con números en un ticket se rechaza en otro con el mensaje esperado; la misma sesión sin números o con `manual:` se acepta; el informe de valor cuenta una vez una sesión duplicada en el histórico y la señala; la foto automática declara compartida una sesión ya cargada en otro ticket sin fallar; y una sesión sin costo lleva la marca y no suma cero. Correr `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el consumo ya escrito no cambia y el rechazo desaparece con el código.

## Criterios de aceptación

- [x] Registrar con números una sesión que ya tiene números en otro ticket se rechaza nombrando ese ticket
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] El rechazo indica que una sesión compartida se declara con `manual:` y sin números
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] La misma sesión declarada sin números se acepta en el segundo ticket
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] El informe de valor cuenta una sola vez una sesión cargada con números a dos tickets en el histórico
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] El informe de valor señala la sesión duplicada y los tickets que la cargan
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] La foto automática declara compartida, sin números, una sesión ya cargada en otro ticket en vez de fallar
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] Una sesión sin costo en su origen lleva la marca explícita de suscripción o de desconocido
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->
- [x] Un costo ausente no se suma como cero en el informe
      <!-- test: npx vitest run tests/consumo-fiable.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de BUGFIX-ENGINE-CONSUMO-FIABLE-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/append.ts",
      "packages/engine/src/value.ts",
      "packages/server/src/timeline.ts",
      "tests/consumo-fiable.test.ts",
      "tests/timeline.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

`packages/engine/src/append.ts`: `sessionNumbersOwner` busca en el registro (con `documentsForReport`) el ticket que ya tiene una referencia de sesión con algún número (tokens o costo), ignorando las entradas sin números y las `process:` —una corrida de proceso reparte su gasto entre tickets a propósito—; `addAiUsage` rechaza una entrada nueva con referencia y números cuando existe ese dueño, nombrándolo e indicando que una sesión compartida se declara con `manual:` y sin números. `packages/engine/src/value.ts`: `ticketValueReport` cuenta una vez cada sesión con números —la del primer ticket en el orden de cierre—, agrega `duplicatedSessions` al informe y `renderValue` lo señala; el histórico no se reescribe. `packages/server/src/timeline.ts`: `guardarFotoEnTicket` declara sin números, como compartida, una sesión que otro ticket ya tiene con números (en vez de fallar el cierre) y dice en qué ticket están; `marcaDeCosto` marca «suscripción» (Codex, Claude Code) o «desconocido» y la nota de toda sesión sin costo lo dice con `Costo: <marca>; no es cero`. R-CTRL-006 es un DEBERÍA: no se calcula con una tabla de precios porque nadie la verificó; se declara la causa. Pruebas nuevas: `tests/consumo-fiable.test.ts` (8) y un caso en `tests/timeline.test.ts`.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/consumo-fiable.test.ts` — esperado: 8 pruebas pasan.
2. `npx vitest run tests/timeline.test.ts` — esperado: 32 pruebas pasan, incluida la sesión ya cargada en otro ticket.
3. `npx vitest run` — esperado: 161 archivos pasan y 1 omitido; 2431 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2431 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:5208237c6be18007012d9eb0d7edbedf3a67454e",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run: 2431 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:0c1bed16739d4f5d8c3b2bfac2963def6b6214114879a966e09be103ef855a27",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "sessionNumbersOwner y rechazo en addAiUsage, deduplicación y duplicatedSessions en el informe de valor, foto automática que declara compartida una sesión ajena y marca de costo suscripción o desconocido; 8 pruebas nuevas y una en timeline",
    "functional_summary": "Una sesión con números ya no suma su costo en dos tickets, el informe lo señala y un costo ausente se declara suscripción o desconocido en vez de leerse como cero",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambia el registro de consumo; el histórico no se reescribe"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets de la delegación; sin números por ticket para no repartir a ojo un costo que no se midió por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code por delegación DEL-20261006-001",
    "confidence": "medium",
    "id": "CONSUMO-001"
  }
]
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
    "at": "2026-10-06T01:51:50.130Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:40:00.938Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:40:18.202Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:40:44.810Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:40:44.940Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:23.552Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:23.672Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:23.754Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:23.842Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:23.922Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:23.999Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.138Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.310Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.390Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.470Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.553Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.641Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.722Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.808Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:45:24.886Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
