---
schema_version: 2
id: BUGFIX-GATE-RECIBO-POR-INTENTO-20261004
title: Identificar cada recibo por ticket e intento, no por fecha y compuerta
type: BUGFIX
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-04
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-RECIBO-POR-INTENTO-20261004

## Solicitud original

Hallazgo de la revisión del 2026-10-04, orden del PO ese día: «si este toca arreglarlo si creermos el bugfix». El id de un recibo se arma como GR-<fecha UTC>-<compuerta> (packages/gate/src/receipt.ts), sin ticket ni número de intento: en .valmen/receipts/ hay 373 líneas con 26 ids distintos y 24 ids compartidos por varios tickets (GR-20260929-analysis lo comparten 11; GR-20260927-plan, 7). vigentes() en packages/engine/src/usage.ts y currentReceipts() en packages/engine/src/receipts.ts colapsan por ese id, así que el reporte de consumo del 2 al 4 de octubre cuenta 9 evaluaciones en 4 tickets cuando esos archivos tienen 193 líneas en 36, los reintentos del mismo día del mismo gate se pisan entre sí y la calibración que serviría para promover un gate híbrido a automático se calcula sobre recibos cruzados. Además la decisión humana no cambia actor, que queda en model, así que un gate escalado y aprobado por el PO sigue contando como decisión del modelo.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que el identificador de un recibo nombre la corrida que lo produjo —ticket, compuerta e intento— y no el día, y que los colapsadores (`currentReceipts`, `vigentes`) y el informe de consumo dejen de mezclar corridas y tickets distintos.
- Usuario o rol afectado: quien lee el consumo y la calibración —el PO y quien decide promover un gate híbrido— y quien registra una decisión humana con `gate-decide --receipt`.
- Comportamiento actual: `packages/engine/src/gate.ts:502` arma el id como `GR-<YYYYMMDD UTC>-<gateId>` cuando no se le pasa uno; en el registro hay 373 líneas con 26 ids distintos y 24 de esos ids los comparten varios tickets (`GR-20260929-analysis`, 11 tickets). `currentReceipts` (`packages/engine/src/receipts.ts:56`) y `vigentes` (`packages/engine/src/usage.ts:117`) colapsan por ese id, y `readAllReceipts` + `currentReceipts` en `packages/server/src/portafolio.ts:92` lo hacen sobre todo el registro: el informe de consumo del 2 al 4 de octubre cuenta 9 evaluaciones en 4 tickets mientras esos archivos tienen 193 líneas en 36, y los reintentos del mismo día del mismo gate se pisan entre sí.
- Comportamiento esperado: dos corridas del mismo gate del mismo ticket el mismo día tienen identificadores distintos y las dos sobreviven al colapso; dos tickets distintos que corren el mismo gate el mismo día no comparten identificador; la decisión humana se anexa, con el mismo identificador de su corrida, al recibo que le corresponde; y los recibos ya escritos —cuyo id no nombra ticket ni intento— se siguen leyendo.

## Diagnóstico

- Síntoma observable: el informe de consumo del rango 2026-10-02 a 2026-10-04 devuelve 9 evaluaciones en 4 tickets mientras `.valmen/receipts/` tiene 193 líneas en 36 archivos para esas fechas; `GR-20260929-analysis` aparece en los recibos de 11 tickets distintos. El análisis de FEATURE-ENGINE-MODELO-INTENTO-20261001 registra seis corridas del mismo gate el 3 de octubre entre 06:13 y 07:17 con el mismo id, así que cualquier lectura que colapse por id ve una sola.
- Archivos y flujo investigados: `packages/engine/src/gate.ts:502-503` (id por defecto), `packages/gate/src/receipt.ts:262-320` (construcción y `recordHumanDecision`, que exige un recibo escalado y sin decisión previa), `packages/engine/src/receipts.ts` (`readReceipts` devuelve la historia; `currentReceipts` colapsa por id), `packages/engine/src/usage.ts:117` (`vigentes`), `packages/server/src/portafolio.ts:92` (colapso sobre todo el registro), `packages/server/src/gates.ts:585` (busca el vigente por `receipt.id === receiptId`), `packages/cli/src/main.ts:229,760` (`gate-decide --receipt`) y `packages/cli/src/hermes.ts:1200`.
- Causa raíz o hipótesis: el id se pensó como identificador de la compuerta de ese día, porque el diseño append-only necesita un id estable al que anexar la decisión humana (encabezado de `receipts.ts`). Ese requisito pide un id estable por corrida, no por día: al no incluir ticket ni intento, dos corridas del mismo gate el mismo día —un reintento tras un bloqueo, o corridas de tickets distintos— comparten identificador, y el colapso que existe para que la decisión humana no borre el veredicto del modelo termina borrando corridas y cruzando tickets. Síntoma y causa son entonces el mismo dato mal formado —un identificador de día donde hace falta uno de corrida—, y por eso el informe no pierde un recuento por redondeo sino corridas enteras: cada reintento que el registro escribe desaparece de la lectura, y la calibración que decide si un gate se promueve compara contra un conjunto que ya no es el que ocurrió.
- Riesgos y compatibilidad: el registro es append-only y los recibos escritos no se reescriben, así que el formato viejo debe seguir leyéndose (id sin ticket ni intento, orden por `decidedAt`). Un `gate-decide` con un id viejo debe seguir encontrando su recibo. Ningún veredicto cambia y no se reescribe historial.
- Impactos de sync, migración, Docker o despliegue: ninguno. No hay migración: los archivos existentes se leen como están.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** — «Apruebo aplicar EST-004 y seguir con el plan» (2026-10-04) —, que autoriza continuar tras dos revisiones equivalentes del análisis (0.86 y 0.87, con la corrección del vínculo síntoma-causa incorporada) y aprobar este plan. La compuerta de plan aprobó en su tercera corrida, con los siete criterios por encima del umbral.
- Pasos ordenados:
  1. En `packages/engine/src/gate.ts`, componer el id por defecto con ticket, compuerta e intento —`GR-<YYYYMMDD>-<ticket>-<gateId>-<n>`, con el número de corrida vigente para ese ticket y compuerta leído de `readReceipts`— y conservar `options.receiptId` como camino explícito. Corrección declarada durante la implementación: el literal original escribía `GR-<YYYYMMDD>-<gateId>-<n>` sin el ticket, y con eso dos tickets distintos que corren el mismo gate el mismo día comparten identificador, que es lo que R-2 prohíbe; el formato definitivo nombra el ticket.
  2. En `packages/engine/src/receipts.ts`, colapsar por corrida sin cruzar tickets y leer de forma tolerante los ids viejos, sin ticket ni intento, ordenando por `decidedAt`.
  3. En `packages/engine/src/usage.ts`, contar una evaluación por corrida —reintentos incluidos— sin colapsar entre tickets, y dejar la calibración leyendo lo mismo que lee el informe.
  4. En `packages/server/src/portafolio.ts` y `packages/server/src/gates.ts`, ajustar la búsqueda del recibo vigente para que `gate-decide --receipt` siga encontrando su recibo, viejo o nuevo, y la vista no muestre dos veces la misma corrida.
  5. En `packages/gate/src/receipt.ts`, conservar `recordHumanDecision` anexando la decisión como línea nueva con el mismo identificador de la corrida —sin reescribir la línea del veredicto del modelo— y mantener el rechazo de una segunda decisión humana sobre el mismo recibo; cubrirlo con una prueba de regresión.
  6. Cubrir con pruebas las dos corridas del mismo gate el mismo día, los dos tickets con el mismo gate el mismo día, la anexión de la decisión humana al recibo correcto sin reescribir el veredicto, el rechazo de una segunda decisión, el recuento del informe con reintentos y la lectura de los recibos viejos; correr focales, compilación y suite completa.
- Rollback: revertir el cambio devuelve el id al formato por fecha; los recibos nuevos ya escritos siguen leyéndose porque el lector acepta los dos formatos y no se reescribe ningún recibo histórico.

## Criterios de aceptación

- [ ] R-1: Dos corridas del mismo gate del mismo ticket el mismo día quedan con identificadores distintos y `currentReceipts` conserva las dos.
      <!-- test: npx vitest run tests/receipt-identity.test.ts -->
- [ ] R-2: Dos tickets distintos que corren el mismo gate el mismo día no comparten el identificador de sus recibos.
      <!-- test: npx vitest run tests/receipt-identity.test.ts -->
- [ ] R-3: El informe de consumo cuenta una evaluación por corrida, incluidos los reintentos del mismo día, y no cuenta recibos de otro ticket.
      <!-- test: npx vitest run tests/usage-report.test.ts -->
- [ ] R-4a: La decisión humana se anexa al recibo de su corrida con el mismo identificador, sin reescribir la línea del veredicto del modelo.
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [ ] R-4b: `gate-decide --receipt` encuentra el recibo vigente de su corrida, tanto con el identificador nuevo como con uno viejo sin ticket ni intento.
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [ ] R-4c: Un recibo que ya tiene decisión humana se rechaza en lugar de anexar una segunda decisión.
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [ ] R-5: Los recibos ya escritos, cuyo identificador no nombra ticket ni intento, se siguen leyendo y la calibración no cambia de resultado por el formato nuevo.
      <!-- test: npx vitest run tests/receipts-compat.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/gate.ts`: `defaultReceiptId` arma el identificador como `GR-<fecha>-<ticket>-<compuerta>-<intento>`, tomando el intento del mayor número ya escrito para ese ticket y esa compuerta —viejos y nuevos— para no reutilizar ninguno; `options.receiptId` sigue siendo el camino explícito.
- `packages/engine/src/receipts.ts`: `currentReceipts` colapsa por corrida con `claveDeCorrida` (identificador más sujeto), así que los identificadores viejos compartidos entre tickets dejan de cruzarse; `ticketDeClave` es la inversa para volver al identificador del ticket.
- `packages/engine/src/usage.ts`: `vigentes` y la calibración usan la clave de corrida, cuentan una evaluación por corrida con sus reintentos y no mezclan tickets.
- `packages/gate/src/receipt.ts`: `withHumanDecision` marca `actor: human` sin tocar `outcome`, `reason` ni `propositions`, y conserva el rechazo de una segunda decisión humana.
- `packages/server/src/gates.ts`: `recordHumanDecision` busca el vigente por identificador o por clave de corrida, así que `gate-decide --receipt` acepta el formato nuevo y el viejo.
- `packages/engine/src/value.ts` y `packages/server/src/portafolio.ts`: el colapso usa la clave de corrida; en portafolio el arreglo quedó en `receipts.ts`.
- Corrección de paso: el comentario de cabecera de `receipts.ts` quedó nombrando el formato viejo del identificador y se ajustó al implementado.

## Pruebas

- Focales: `npx vitest run tests/receipt-identity.test.ts tests/usage-report.test.ts tests/gate-human-decision.test.ts tests/receipts-compat.test.ts` — pasó, 4 archivos y 22 pruebas.
- Compilación: `npm run build` — pasó.
- Suite completa: `npx vitest run` — pasó, 125 archivos (1 omitido) y 1903 pruebas aprobadas con 48 omitidas.
- Lint: `npx eslint` sobre los archivos tocados — sin hallazgos.
- Comprobación sobre el registro real: `npx valmen usage --desde 2026-10-02 --hasta 2026-10-04` pasó de informar 9 evaluaciones en 4 tickets a 100 evaluaciones en 37 tickets, con 23 escaladas a persona; es el síntoma que declara el diagnóstico.
- No se hizo commit ni push: el árbol queda a la decisión del PO.
- Resultado del PO: autorizó cerrar y commitear sin push: «Cerrá el ticket y hacé commit de la implementación y el registro, sin push» (2026-10-04). El commit del cambio es `da93224e6e0ffc26107c8b36da061e2bbeab98a2`.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:543b4b734b6fefed69620132d6d661324e12f640fecb141168b88c0bac3eb752",
    "environment": "macOS (Darwin 27.0.1), Node del repositorio ValmenHarness en el worktree local, suite completa con npx vitest run y compilación con npm run build; sin servicios externos.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«Cerrá el ticket y hacé commit de la implementación y el registro, sin push» (Juan Andrade, 2026-10-04)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-04",
    "kind": "automated-test",
    "description": "Focales npx vitest run tests/receipt-identity.test.ts tests/usage-report.test.ts tests/gate-human-decision.test.ts tests/receipts-compat.test.ts — 4 archivos y 22 pruebas, todas pasan. Suite completa npx vitest run — 125 archivos (1 omitido) y 1903 pruebas aprobadas con 48 omitidas. Compilación npm run build correcta. Gate mecánico qa-mechanical aprobado con los siete criterios en salida 0. Comprobación sobre el registro real, npx valmen usage --desde 2026-10-02 --hasta 2026-10-04, que pasó de informar 9 evaluaciones en 4 tickets a 100 en 37, con 23 escaladas a persona.",
    "reference": "worktree:sha256:543b4b734b6fefed69620132d6d661324e12f640fecb141168b88c0bac3eb752",
    "point_id": null
  }
]
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
    "date": "2026-10-04",
    "technical_summary": "El identificador por defecto de un recibo pasó de GR-fecha-compuerta a GR-fecha-ticket-compuerta-intento, con el intento leído de los recibos ya escritos para no reutilizar ninguno. currentReceipts y vigentes colapsan por corrida (identificador más sujeto) y no por identificador, así que los recibos viejos con identificador compartido dejan de cruzarse entre tickets; recordHumanDecision acepta el formato nuevo y el viejo y withHumanDecision marca actor human sin tocar el veredicto. Cuatro suites nuevas cubren identidad, informe, decisión humana y compatibilidad con los recibos ya escritos.",
    "functional_summary": "El informe de consumo y la calibración que decide si una compuerta pasa a automática dejan de contar mal: cada corrida de compuerta aparece una vez, con sus reintentos, y la decisión de una persona sobre un gate escalado se lee como decisión humana. Quien mira el registro ve lo que ocurrió, no una versión colapsada.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin release ni despliegue: cambio interno del harness, queda unreleased y pendiente de push."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-04",
    "session_reference": "ses_ef6d49638ffe1SAGrdYQcxjE17",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesión de OpenCode que implementó el ticket: 117 mensajes con uso. Dos intervenciones —una interrumpida al pedir una aclaración, más la continuación—, 7 archivos de código y 4 suites de pruebas. El coste incluye el caché de lectura, 11.308.288 tokens, facturado aparte de la entrada. No hubo commit ni push desde la sesión.",
    "input_tokens": 292545,
    "output_tokens": 39964,
    "total_tokens": 334895,
    "estimated_cost_usd": 0.103217,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
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
    "date": "2026-10-04",
    "at": "2026-10-04T22:38:49.593Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-04",
    "at": "2026-10-04T23:04:08.615Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-04",
    "at": "2026-10-04T23:05:27.878Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade: «Apruebo aplicar EST-004 y seguir con el plan» — aplicación de EST-004 tras dos revisiones equivalentes del análisis (0.86 y 0.87) con el vínculo síntoma-causa ya incorporado"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-04",
    "at": "2026-10-04T23:05:31.433Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-04",
    "at": "2026-10-04T23:06:24.103Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-04",
    "at": "2026-10-04T23:06:31.121Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-04",
    "at": "2026-10-04T23:21:02.250Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-04",
    "at": "2026-10-04T23:22:51.860Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-04",
    "at": "2026-10-04T23:22:57.758Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-04",
    "at": "2026-10-04T23:23:48.346Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-04",
    "at": "2026-10-04T23:24:18.344Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-04",
    "at": "2026-10-04T23:24:29.798Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-04",
    "at": "2026-10-04T23:24:33.377Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-04",
    "at": "2026-10-04T23:24:40.052Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-04",
    "at": "2026-10-04T23:24:44.441Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
