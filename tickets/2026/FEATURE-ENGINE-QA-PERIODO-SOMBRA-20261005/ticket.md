---
schema_version: 2
id: FEATURE-ENGINE-QA-PERIODO-SOMBRA-20261005
title: Correr la QA por agente en sombra y promoverla con veinte coincidencias
type: FEATURE
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
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-QA-PERIODO-SOMBRA-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-008: La QA por agente DEBE pasar por un periodo en sombra antes de cerrar tickets
Depende de: SECURITY-ENGINE-QA-POR-POLITICA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que la QA por agente pase por un periodo en sombra antes de cerrar tickets (R-QAAG-008). En sombra, `qa-agent` corre y deja su veredicto en el recibo sin cerrar nada y el responsable sigue aprobando; el motor compara cada veredicto con lo que el responsable decidió; la política solo puede pasar a cerrar después de 20 tickets en sombra con concordancia del 100 %, la promoción la registra una persona con esa evidencia, y volver a sombra es un cambio de configuración. Fuera de alcance: decidir qué tickets se intentan y la plantilla de AGENTS.md (ticket siguiente).
- Usuario o rol afectado: el responsable que decide cuándo confiar en la QA por agente, y que necesita ver con datos —no con una impresión— si el agente coincide con su criterio.
- Comportamiento actual: `qa-policy-close` (`packages/engine/src/qa-policy-close.ts`) cierra el ciclo de QA siempre que se cumplan sus condiciones; no existe un modo en sombra, ni una medida de concordancia, ni una promoción registrada.
- Comportamiento esperado: (1) `qa-agent.mode` en `.valmen/config.yaml` vale `shadow` por defecto o `close`; (2) `valmen qa-shadow` muestra, por cada ticket con recibo de `qa-agent` y resultado del responsable, el veredicto del agente, lo que decidió el responsable y si coinciden (el agente aprueba y el responsable aprueba, o el agente bloquea y el responsable pide cambios); un ticket que el agente aprobó y el responsable devolvió, o al revés, es una discrepancia; (3) `valmen qa-promote --actor --quote` exige sesión atendida, al menos 20 tickets con resultado del responsable y 0 discrepancias —si no, se rechaza y muestra los tickets discordantes o cuántos faltan— y registra la promoción con la lista de tickets como evidencia; (4) `qa-policy-close` solo cierra si el modo es `close` **y** hay una promoción registrada; en sombra se rechaza diciendo por qué; (5) volver a sombra es poner `qa-agent.mode: shadow`, sin tocar el registro de promociones.

## Diagnóstico

- Archivos y flujo investigados: el recibo de `qa-agent` con su veredicto y el ticket al que pertenece está en `packages/engine/src/qa-agent-receipt.ts` (`leerRecibosQaAgent`); la decisión del responsable queda en el bloque de QA del ticket, cuyas entradas pares abren el ciclo y las impares lo cierran con un resultado (`packages/core/src/blocks.ts`, `validateQa`); el cierre por política y sus condiciones están en `packages/engine/src/qa-policy-close.ts`; la configuración de la compuerta se lee en `packages/adapter/src/config.ts` (`readQaAgentConfig`); las autorizaciones y su cupo, en `packages/engine/src/qa-authorization.ts`; los comandos del CLI se declaran en `packages/cli/src/main.ts` y se implementan en `packages/cli/src/commands.ts`.
- Causa raíz o hipótesis: el síntoma es que, con las piezas actuales, bastaría una autorización para empezar a cerrar tickets por política sin ninguna evidencia previa de que el agente coincide con el criterio del responsable. La causa comprobada es que `cerrarQaPorPolitica` no consulta ningún modo ni historial. La concordancia puede calcularse sin escribir nada nuevo durante la sombra: el veredicto ya está en el recibo y la decisión del responsable en el bloque de QA; solo la promoción necesita un registro propio. Hipótesis a confirmar al implementar: que un ticket con varios ciclos se compare por su último recibo y su último ciclo cerrado por una persona.
- Riesgos y compatibilidad: (a) la promoción amplía la autoridad del agente, así que solo la registra una persona (sesión atendida, con su frase) y nunca el agente; (b) un ticket cerrado por política (confirmación `policy:`) no cuenta como decisión del responsable, para que la política no se mida contra sí misma; (c) el 100 % es exacto: una sola discrepancia rechaza la promoción y la muestra; (d) Consumidores comprobados con búsqueda: `cerrarQaPorPolitica` lo llaman `qaPolicyCloseCommand` y las pruebas de QA por política, que deben declarar el modo `close` y una promoción para seguir cerrando; `readQaAgentConfig` lo llama la compuerta `qa-agent` para la regresión y no cambia; (e) un proyecto sin la clave queda en sombra, que es el comportamiento seguro y apagado por defecto.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el modo sombra/cierre, la medida de concordancia, la promoción registrada y la condición en el cierre por política. Exclusiones: decidir qué tickets se intentan y la plantilla de AGENTS.md.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` agregar `mode` a `QaAgentConfig` (`readQaAgentConfig` lee `qa-agent.mode`: `shadow` por defecto o `close`; cualquier otro valor falla con un mensaje claro).
  2. Crear `packages/engine/src/qa-shadow.ts` con `concordanciaEnSombra(paths)`, que por cada ticket con recibo toma el último recibo de `leerRecibosQaAgent` y el último ciclo de QA cerrado por una persona (se excluyen los que cierran con `policy:`), y devuelve la lista `{ ticketId, agente, responsable, concordante, recibo }` con los totales; `promoverQaAgent({ paths, actor, quote, ahora, env })`, que exige sesión atendida con `assertSesionAtendida`, actor y frase, al menos 20 tickets comparados y 0 discrepancias —si no, falla listando los discordantes o cuántos faltan— y anexa a `.valmen/qa/promotions.jsonl` (append-only) la promoción con la lista de tickets como evidencia; y `modoEfectivoDeQaAgent(paths)`, que devuelve `close` solo si `qa-agent.mode` es `close` y existe una promoción registrada, y `shadow` en cualquier otro caso.
  3. En `packages/engine/src/qa-policy-close.ts` hacer que `cerrarQaPorPolitica` se niegue, antes de escribir nada, si `modoEfectivoDeQaAgent` no es `close`, con un mensaje que diga si falta el modo, la promoción o ambos; exportar el módulo nuevo desde `packages/engine/src/index.ts`.
  4. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `qa-shadow` (imprime la concordancia por ticket, el total y el modo efectivo) y `qa-promote --actor <nombre> --quote "<frase>"`, con su ayuda y sus banderas.
  5. Crear `tests/qa-sombra.test.ts` con un caso por criterio: 20 tickets concordantes promueven y registran la evidencia, 19 concordantes más uno discordante rechazan y muestran el ticket, con menos de 20 se rechaza diciendo cuántos faltan, un ticket cerrado por política no cuenta, una sesión desatendida no puede promover, en sombra `cerrarQaPorPolitica` se niega, con modo `close` y promoción cierra, y volver a `shadow` en la configuración lo detiene sin tocar el registro; actualizar `tests/qa-por-politica.test.ts` para declarar el modo `close` y una promoción; correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; sin la clave el comportamiento es el de sombra y el registro de promociones es un archivo nuevo.

## Criterios de aceptación

- [x] Con 19 tickets concordantes y uno en el que el responsable pidió cambios y `qa-agent` aprobó, la promoción se rechaza y muestra el ticket discordante
      <!-- test: npx vitest run tests/qa-sombra.test.ts -->
- [x] Con 20 tickets concordantes la promoción se registra con la lista de tickets como evidencia, y solo la puede registrar una persona
      <!-- test: npx vitest run tests/qa-sombra.test.ts -->
- [x] Con menos de 20 tickets comparados se rechaza diciendo cuántos faltan, y un ticket cerrado por política no cuenta como decisión del responsable
      <!-- test: npx vitest run tests/qa-sombra.test.ts -->
- [x] En sombra el cierre por política se rechaza; con el modo `close` y una promoción cierra; volver a `shadow` en la configuración lo detiene
      <!-- test: npx vitest run tests/qa-sombra.test.ts tests/qa-por-politica.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-QA-PERIODO-SOMBRA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/qa-policy-close.ts",
      "tests/qa-por-politica.test.ts",
      "packages/engine/src/qa-shadow.ts",
      "tests/qa-sombra.test.ts"
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

- `packages/adapter/src/config.ts`: `qa-agent.mode` (`shadow` por defecto o `close`; otro valor falla con mensaje claro).
- `packages/engine/src/qa-shadow.ts` (nuevo): `concordanciaEnSombra` compara, por ticket, el último recibo de `qa-agent` con la última decisión de una persona (los ciclos cerrados `policy:` no cuentan); `promoverQaAgent` exige sesión atendida, responsable y frase, 20 tickets comparados y 0 discrepancias —si no, falla mostrando los discordantes o cuántos faltan— y registra la promoción con su evidencia en `.valmen/qa/promotions.jsonl` (append-only); `modoEfectivoDeQaAgent` devuelve `close` solo con el modo `close` **y** una promoción.
- `packages/engine/src/qa-policy-close.ts`: `cerrarQaPorPolitica` se niega, antes de escribir nada, si el modo efectivo es sombra, y dice qué falta.
- `packages/cli/src/commands.ts` y `main.ts`: `valmen qa-shadow` y `valmen qa-promote --actor --quote`.
- `tests/qa-sombra.test.ts` (nuevo) y `tests/qa-por-politica.test.ts` (declara modo `close` y promoción).

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/qa-sombra.test.ts tests/qa-por-politica.test.ts` → 22 pruebas pasan.
- Suite completa: `npx vitest run` → 190 archivos, 2765 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
<!-- verify: manual -->

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:f57b155d3bc83b95d5f64d4d734714b06573c480",
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
    "description": "npx vitest run",
    "reference": "worktree:sha256:5e7ca0869767e332c51840585f34f28ad01b44fbf0295147d493121854a54f94",
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
    "technical_summary": "Modo sombra/cierre, concordancia por ticket y promoción registrada; el cierre por política exige ambos.",
    "functional_summary": "La QA por agente solo cierra tickets tras 20 coincidencias con el responsable y una promoción suya.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
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
    "at": "2026-10-06T01:51:51.437Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T05:23:15.809Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T05:23:31.951Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T05:24:25.400Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:d9b55d8b799003bf4cb28837309e30f805e51021705b17f63ebe4fbea53b5cc4\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T05:24:25.562Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:d9b55d8b799003bf4cb28837309e30f805e51021705b17f63ebe4fbea53b5cc4."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T05:24:25.562Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T05:24:25.658Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.136Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.278Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.371Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.463Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.552Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.641Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:32.831Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.050Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.136Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.224Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.315Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.405Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.491Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.582Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T05:26:33.671Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
