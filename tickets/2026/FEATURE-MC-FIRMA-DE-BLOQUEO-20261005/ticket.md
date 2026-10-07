---
schema_version: 2
id: FEATURE-MC-FIRMA-DE-BLOQUEO-20261005
title: Mission Control ofrece firmar un recibo en block con la frase literal de quien autoriza
type: FEATURE
module: MC
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

# FEATURE-MC-FIRMA-DE-BLOQUEO-20261005

## Solicitud original

Solicitud del PO el 2026-10-05, tras cerrar BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004: «sigamos tu recomendacion pero no podemos olvidar la pantalla». Contexto: ese ticket hizo que `transition()` rechace entrar a `planned` o `approved` con la compuerta en `block` o `review` sin decisión humana, y que un recibo `block` admita la decisión humana con la frase literal (`withHumanDecision`, `packages/gate/src/receipt.ts`). Pero la pantalla de Mission Control sigue ofreciendo decidir solo sobre un recibo escalado: `bloqueDecision` en `packages/server/web/index.html` (alrededor de las líneas 3735 a 3860) muestra «Aprobar» y «Rechazar» únicamente cuando `recibo.escalatedTo === "human"`, que solo ocurre con `review`. Un bloqueo que la persona quiere autorizar seguir —el caso de AP-006 y de la escalada tras dos bloqueos de AGENTS.md— hoy solo se puede firmar por el CLI. La pantalla tiene que poder hacerlo, con el mismo endpoint (`POST /api/tickets/:id/gates/:receipt/decision`, `packages/server/src/server.ts:1343`), que ya pasa por `recordHumanDecision`. El campo de texto de la pantalla hoy se llama «Motivo de la decisión» y es opcional; sobre un `block` la frase literal es obligatoria en el motor.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- ¿La pantalla permite firmar un `block` obsoleto, es decir, con el ticket ya cambiado desde que se emitió el recibo? El motor sí lo permite a propósito: tras dos bloqueos, lo normal es un artefacto ya corregido que la persona autoriza sin una tercera corrida (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004). Pero la pantalla hoy dice, ante un recibo obsoleto, «hay que volver a evaluar». Recomendación del que abrió el ticket: permitirlo, con el aviso de obsoleto visible junto al botón.
- ¿Se ofrece «Rechazar» sobre un `block`? El motor lo admite, pero rechazar un bloqueo no cambia nada. Recomendación: no; sobre un `block` solo se ofrece «Autorizar seguir pese al bloqueo», con la frase obligatoria.
- ¿Se ofrece sobre el `block` de `qa-mechanical`? El motor no lo admite (un comando que falló es un hecho). Recomendación: no se ofrece, y la pantalla dice por qué.
- Relación con la feature `autonomia-confiable`: **resuelto por el PO el 2026-10-05.** Se anexó al grafo en el sprint S3, sin dependencias, que fue la recomendación de quien abrió el ticket; frase literal del PO: «si necesitamos meterlo al feture, en que sprint, ahi si el que me recomiendas».

## Descripción funcional

- Alcance: la tarjeta de decisión de una compuerta en Mission Control (`bloqueDecision` en `packages/server/web/index.html`): permitir a una persona firmar, desde la pantalla, un recibo que bloqueó, con la misma rama del motor que ya lo admite por el CLI. Fuera de alcance: el endpoint (ya existe y pasa por `recordHumanDecision`), cualquier cambio a las reglas del motor y el resto de la pantalla.
- Usuario o rol afectado: la persona que decide —el PO— cuando una compuerta de análisis o de plan bloquea y quiere autorizar seguir tras dos bloqueos, o porque el bloqueo ya no aplica.
- Comportamiento actual: la tarjeta muestra «Aprobar» y «Rechazar» solo si `recibo.escalatedTo === "human"`, que ocurre únicamente con `review`; un recibo `block` se muestra sin ninguna acción, de modo que autorizar seguir pese a un bloqueo —el caso de AP-006 y de la escalada tras dos bloqueos— solo se puede hacer por el CLI.
- Comportamiento esperado: sobre un recibo `block` de `analysis` o `plan` sin decisión, la tarjeta explica que el bloqueo lo decidió el evaluador y ofrece un campo de frase literal, obligatorio, y un único botón «Autorizar seguir pese al bloqueo» que no se habilita sin la frase; no ofrece «Rechazar», porque rechazar un bloqueo no cambia nada. Sobre el `block` de `qa-mechanical` no ofrece nada y dice por qué: un comando que falló es un hecho. Un bloqueo obsoleto sí se puede autorizar, porque el motor lo permite a propósito.

## Diagnóstico

- Archivos y flujo investigados: `bloqueDecision` en `packages/server/web/index.html:3735` pinta el veredicto, el aviso de obsoleto, la tabla de proposiciones, el pie y la decisión humana; la rama que ofrece los botones es `else if (recibo.escalatedTo === "human")`, y su campo de texto se llama «Motivo de la decisión» y es opcional. El botón llama a `POST /api/tickets/:id/gates/:receiptId/decision` (`packages/server/src/server.ts:1313`), que valida `decision` y `actor` y delega en `recordHumanDecision` de `packages/server/src/gates.ts`; esa función llega a `withHumanDecision` de `packages/gate/src/receipt.ts`, que admite aprobar un `block` con la frase literal obligatoria y rechaza el `block` de `qa-mechanical`. La vista de un recibo (`GateDecisionView`) trae `gate`, `outcome`, `escalatedTo`, `stale` y `humanDecision`. Las pruebas de interfaz ejecutan el HTML real con un DOM mínimo (`ejecutarInterfaz` en `scripts/verificar-interfaz.mjs`).
- Causa raíz o hipótesis: la pantalla se escribió cuando solo un `review` admitía una decisión; el motor ya admite el `block` y la pantalla no lo ofrece, por lo que la única vía de firma es el CLI. La condición `escalatedTo === "human"` es la que deja fuera al bloqueo.
- Riesgos y compatibilidad: la frase literal debe ser obligatoria también en la pantalla, porque el motor la exige para aprobar un bloqueo y un botón sin ella solo produciría un error; el botón queda deshabilitado hasta que haya frase y responsable. No se ofrece «Rechazar» sobre un bloqueo ni nada sobre el de `qa-mechanical`. Es una tarjeta que firma decisiones: un texto claro importa tanto como el botón, y el efecto («no avanza el ticket: la transición es otro paso») se dice. La revisión visual final la hace el PO.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la rama de la tarjeta para un recibo `block`, su texto y su estilo, con pruebas que ejecutan el HTML real, y la verificación en el navegador. Exclusiones: el endpoint, el motor y el resto de la pantalla.
- Pasos ordenados:
  1. En `bloqueDecision` de `packages/server/web/index.html`, agregar después de la rama de `escalatedTo === "human"` una rama para `recibo.outcome === "block"` sin decisión humana: si `recibo.gate === "qa-mechanical"`, un bloque que dice que un comando que falló es un hecho y que se corrige y se vuelve a correr; si no, un bloque que explica que lo decidió el evaluador y que autorizar seguir es una decisión de una persona.
  2. En esa rama, agregar un campo de texto «Frase literal de quien autoriza (obligatoria)» y un único botón «Autorizar seguir pese al bloqueo» con la clase de acción principal, deshabilitado mientras la frase o el responsable estén vacíos y habilitado al escribir; al pulsarlo llama al mismo endpoint de decisión con `decision: "approve"`, el responsable y la frase, y recarga la tarjeta con `alDecidir`.
  3. Agregar al texto del bloque que autorizar no avanza el ticket —la transición es otro paso— y que un recibo obsoleto también se puede autorizar; reutilizar las clases `decision-humana` y `resultado` y, si hace falta, una regla de estilo que use las variables de tema para que funcione en claro y oscuro.
  4. Crear `tests/firma-de-bloqueo-pantalla.test.ts` que ejecuta la interfaz con `ejecutarInterfaz` sobre un ticket con un recibo `block` de `plan`, uno de `qa-mechanical`, uno de `analysis` obsoleto y uno `review` de control: comprueba el texto, el botón único, la ausencia de «Rechazar» y de acciones en la mecánica, que el `review` conserva «Aprobar» y «Rechazar», y que el botón envía la decisión con la frase.
  5. Verificar en el navegador con un proyecto de laboratorio que tenga un recibo `block`: levantar el servidor, abrir el ticket, capturar la tarjeta en claro y oscuro y firmar un bloqueo. Correr la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; es una rama de la pantalla y no toca datos ni el motor.

## Criterios de aceptación

- [x] Un recibo `block` de `plan` sin decisión humana muestra el campo de frase literal y el botón «Autorizar seguir pese al bloqueo»
      <!-- test: npx vitest run tests/firma-de-bloqueo-pantalla.test.ts -->
- [x] Sobre un `block` la pantalla no ofrece «Rechazar»
      <!-- test: npx vitest run tests/firma-de-bloqueo-pantalla.test.ts -->
- [x] Sobre el `block` de `qa-mechanical` la pantalla no ofrece ninguna acción y dice por qué
      <!-- test: npx vitest run tests/firma-de-bloqueo-pantalla.test.ts -->
- [x] Un bloqueo obsoleto se puede autorizar
      <!-- test: npx vitest run tests/firma-de-bloqueo-pantalla.test.ts -->
- [x] El botón envía la decisión `approve` con el responsable y la frase literal
      <!-- test: npx vitest run tests/firma-de-bloqueo-pantalla.test.ts -->
- [x] Un recibo `review` conserva «Aprobar» y «Rechazar» como antes
      <!-- test: npx vitest run tests/firma-de-bloqueo-pantalla.test.ts -->
- [x] La pantalla se ve bien en modo claro y oscuro y el texto de la tarjeta se entiende sin explicación (verificado por el PO en el laboratorio el 2026-10-07: autorizó un bloqueo obsoleto y aprobó una revisión desde Mission Control)
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-MC-FIRMA-DE-BLOQUEO-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/web/index.html",
      "scripts/recibo-de-laboratorio.mjs",
      "scripts/verificar-interfaz.d.mts",
      "scripts/verificar-interfaz.mjs",
      "tests/firma-de-bloqueo-pantalla.test.ts"
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

- `packages/server/web/index.html`: `bloqueDecision` tiene una rama nueva para el recibo `block`. En `qa-mechanical` explica que el bloqueo es un hecho (un comando falló) y no ofrece acciones. En plan y analysis muestra el motivo, un campo «Frase literal de quien autoriza» obligatorio y un único botón «Autorizar seguir pese al bloqueo», deshabilitado hasta que haya frase; sin «Rechazar». La decisión viaja a `POST /api/tickets/:id/gates/:receiptId/decision` con la frase como motivo.
- `scripts/verificar-interfaz.mjs` y `.d.mts`: los oyentes se guardan y se exportan `disparar` y `buscarNodos` para ejecutar el HTML real en pruebas.
- `scripts/recibo-de-laboratorio.mjs`: acepta `[review|block] [compuerta]` para sembrar recibos de laboratorio.
- `tests/firma-de-bloqueo-pantalla.test.ts`: 10 pruebas que ejecutan el HTML real.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/firma-de-bloqueo-pantalla.test.ts` — esperado: 10 pruebas pasan.
2. `npx vitest run` — esperado: 162 archivos pasan y 1 omitido; 2441 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. Manual (responsable): `valmen serve`, abrir un ticket con un recibo `block` de plan y revisar en modo claro y oscuro la tarjeta, el campo obligatorio y el botón.

Resultado de la ejecución del agente (2026-10-06): 1–3 dieron lo esperado; la tarjeta se revisó en el navegador en modo oscuro (laboratorio local). El modo claro y el punto 4 quedan para el responsable.

- Resultado del PO: «ya revisé los puntos y aprobé los que se podían aprobar… podemos cerrar esos tickets» — Juan Andrade, 2026-10-07. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:57cfc68bf945c9e8d3fbc898e872cd8dcdea8739",
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
    "po_confirmation": "«ya revisé los puntos y aprobé los que se podían aprobar… podemos cerrar esos tickets» — Juan Andrade, 2026-10-07"
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
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:d0999f67bbb3103def13805c22a8f5d4aa5baad75b0de30df1b65820f93060ea",
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
    "po_confirmation": "«ya revisé los puntos y aprobé los que se podían aprobar… podemos cerrar esos tickets» — Juan Andrade, 2026-10-07"
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
    "technical_summary": "Pantalla entregada en el commit 370b13d; ver ## Implementación.",
    "functional_summary": "Revisada por el PO en laboratorio.",
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
    "notes": "Sesión que atendió varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code, corrida delegada DEL-20261006-001",
    "confidence": "medium",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": "a677fc70-a2a6-4173-a36a-e18e91da94c4",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 4 tickets (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004 ×97, FEATURE-MC-FIRMA-DE-BLOQUEO-20261005 ×12, BUGFIX-POS-FILTRO-ORDENES-20260921 ×10, BUGFIX-CLI-CANAL-DECISION-20261005 ×7), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 579341 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Trabajar BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:a677fc70-a2a6-4173-a36a-e18e91da94c4",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "at": "2026-10-06T03:08:50.746Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:46:39.343Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:46:51.333Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-MC-FIRMA-DE-BLOQUEO-20261005-analysis-1, canal delegation, decidida 2026-10-07T01:46:51.332Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:46:51.439Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:47:15.461Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:47:15.597Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:52:40.319Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:34.371Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:34.658Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:34.909Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:35.150Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:35.409Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:35.695Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:36.008Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:36.234Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:36.463Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:36.696Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:36.927Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:37.164Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:38.632Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:38.751Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:39.017Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
