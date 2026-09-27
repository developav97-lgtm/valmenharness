---
schema_version: 2
id: IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926
title: Hacer legible por que un plan queda en banda y avisar del criterio compuesto
type: IMPROVEMENT
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-26
related_ticket: FEATURE-ENGINE-REANUDAR-COMPACTO-20260926
target_release: null
released_in: null
---

# IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926

## Solicitud original

veo que el plan fallo por redaccion eso no se puede afinar para cuando se escriban los planes?

## Descripción funcional

- Alcance: el gate `plan` explica por qué quedó en revisión, y avisa de un criterio
  compuesto antes de que la persona tenga que intervenir. Traza a R-S5-007: **informa,
  no relaja** — no cambia ningún umbral ni la autoridad de ninguna compuerta. El alcance
  lo eligió el PO al responder «las dos adiciones completas al motor, incluido el aviso
  previo de criterio compuesto».
- Usuario o rol afectado: quien escribe el plan de un ticket —agente o persona— y el PO
  que recibe una compuerta en banda de revisión sin saber qué se le está pidiendo.
- Comportamiento actual: un criterio que junta varias afirmaciones se despliega como
  **una sola** proposición `criterio_NN` (`criterionProposition` en
  `packages/gate/src/dynamic.ts`) y puntúa 0.87–0.89 contra un umbral de 0.90. El recibo
  dice `criterio_04 en banda de revisión` y nada más: manda a mirar el contenido del plan
  cuando la causa es la forma del criterio. Medido en
  `FEATURE-ENGINE-REANUDAR-COMPACTO-20260926`: media 0.743 → 0.845 → 0.861 → 0.890,
  con las proposiciones descriptivas entre 0.90 y 0.97 y la clasificación en `completo`
  desde la primera corrida.
- Comportamiento esperado: (a) cuando la banda la causan criterios mientras el plan está
  completo, el informe y el recibo lo dicen y nombran el criterio; (b) el aviso de
  criterio compuesto aparece en el informe de la compuerta; (c) la plantilla del ticket
  guía a escribir un criterio por afirmación y pasos que nombran archivo.

## Diagnóstico

- Archivos y flujo investigados: `packages/gate/src/definitions.ts` (definición del gate
  `plan` y sus proposiciones `cubre_todos_los_criterios`, `pasos_ejecutables`,
  `criterios_verificables`, `compatibilidad_hacia_atras`, `rollback`, `clasificacion`);
  `packages/gate/src/dynamic.ts` (`extractCriteriaSpecs`, `criterionProposition`,
  `commandChecksFor`); `packages/gate/src/decide.ts` (`decide`, `DEFAULT_POLICY` con
  `approveAt: 0.9`, razón de `review` como `inBand.map(...).join("; ")`);
  `packages/gate/src/receipt.ts`; `packages/engine/src/gate.ts` (`runGate`,
  `revisarCriteriosVerificables`, `GateRunOptions.jev` y `.judge` como costura de
  inyección); `packages/core/src/template.ts`. Evidencia medida:
  `.valmen/receipts/FEATURE-ENGINE-REANUDAR-COMPACTO-20260926.jsonl`.
- Causa raíz: la proposición de un criterio es atómica por construcción —el enunciado
  interpola el texto del criterio y nada más—, así que un criterio que agrupa varias
  afirmaciones produce una proposición que el evaluador resuelve a favor de «cubierto en
  parte»: 0.87–0.89. La compuerta no puede distinguir eso de un plan incompleto, porque
  del criterio solo ve el número, no su forma. El bloqueo se corre de criterio en criterio
  mientras cada uno siga siendo compuesto.
- Riesgos y compatibilidad: el aviso es aditivo y no cambia el veredicto. El recibo gana
  un campo opcional, así que los recibos ya escritos siguen siendo válidos —el formato es
  append-only— y un motor viejo sigue leyendo los nuevos. Falso positivo posible: un
  criterio con ` y ` que en realidad expresa una sola afirmación se marcará como compuesto;
  es aceptable porque el aviso informa y no bloquea.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), en sus
  palabras: «el plan actual lo apruebo». Su aprobación venía condicionada a que el punto
  del registro de consumo cupiera en este ticket; no cabe —esa lectura vive en
  `packages/server/src/timeline.ts`, no en la compuerta—, así que se ejecuta este plan y
  el registro de costo y tiempo del ticket va a un ticket aparte.
- Pasos ordenados:
  1. Crear `packages/gate/src/criteria.ts` con `analizarFormaDeCriterios(criteria)`, que
     trabaja sobre las `CriterionSpec` que ya extrae `packages/gate/src/dynamic.ts` y no
     consulta modelo, reloj ni estado externo: cuenta las afirmaciones de cada criterio
     —separadores `;` y conjunciones ` y `, ` o ` y ` así como ` a nivel superior— y marca
     `compuesto` cuando son dos o más, o cuando el texto pasa de 320 caracteres. Exportarlo
     desde `packages/gate/src/index.ts`.
  2. Agregar en `packages/gate/src/receipt.ts` el campo opcional `notes` del recibo y
     aceptarlo en su validador, sin tocar los campos existentes ni su orden.
  3. En `packages/engine/src/gate.ts`, dentro de `runGate` y después de `decide(...)`:
     cuando el veredicto es `review`, lo **único** en banda son proposiciones `criterio_NN`
     y al menos una agrupa varias afirmaciones, componer un bloque «Forma de los criterios»
     que nombre el criterio, cuente sus afirmaciones y pida partirlo; imprimirlo en el
     informe y guardarlo en `notes` del recibo. Si algo que no es un criterio quedó en
     banda, el aviso calla. `DEFAULT_POLICY` no se toca: `approveAt` sigue en 0.9 y
     `blockAt` en 0.1, y tampoco cambian `decision.outcome` ni `decision.reason`.
  4. Crear `tests/gate-plan-aviso.test.ts` inyectando por `GateRunOptions.jev` una
     evaluación fija —`criterio_04=0.88`, descriptivas a 0.95, `clasificacion=completo`—
     para comprobar el bloque, el `notes` del recibo y el caso contrario sin aviso; la
     misma prueba afirma que `DEFAULT_POLICY.approveAt` sigue en 0.9 y `blockAt` en 0.1 y
     que el veredicto del caso con aviso sigue siendo `review`.
  5. Editar `packages/core/src/template.ts`: una línea de guía en `## Plan` —«cada paso
     nombra archivo, símbolo o comando»— y otra en `## Criterios de aceptación` —«una
     afirmación verificable por criterio; una frase con “y” son dos»—, y cubrirlas con la
     prueba del paso 4.
  6. Escribir la decisión como `D10` en `.valmen/features/evolucion-harness/design.md`,
     junto a `D9`, que es su antecedente directo.
  7. Correr `npx vitest run tests/gate-plan-aviso.test.ts`, `npm run build`,
     `npm run typecheck`, `npx prettier --write` sobre los archivos tocados y `npm test`.
- Rollback: revertir el commit. Los recibos ya escritos no se tocan y `notes` es opcional,
  así que volver atrás no invalida ningún recibo ni ningún estado de ticket.

## Criterios de aceptación

- [x] `analizarFormaDeCriterios` marca como compuesto un criterio que junta dos afirmaciones y como atómico uno de una sola.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] El informe de la compuerta, con el plan completo y un criterio compuesto en banda, nombra ese criterio y pide partirlo.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] El recibo guarda ese aviso en su campo `notes` sin que cambie el veredicto.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] Un plan con un hueco real, y no de redacción, no produce el aviso.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] `DEFAULT_POLICY` conserva `approveAt` en 0.9 y `blockAt` en 0.1: la compuerta no se relaja.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] La plantilla de un ticket nuevo guía a escribir un criterio por afirmación y pasos que nombran archivo.
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/gate/src/criteria.ts` (nuevo): `analizarFormaDeCriterios(criteria)` y
  `criterionPropositionId(index)`. Cuenta las afirmaciones de cada criterio —separadores
  `;`, conjunciones ` y `, ` o `, ` así como ` y longitud— sin modelo, sin reloj y sin
  estado externo. Exportado desde `packages/gate/src/index.ts`.
- `packages/gate/src/receipt.ts`: campo opcional `notes` en el recibo y en `buildReceipt`,
  que lo omite cuando está vacío. Los recibos que no lo llevan siguen siendo válidos.
- `packages/engine/src/gate.ts`: `avisoDeForma(decision, criteria, policy)`, calculado
  después de `decide(...)`; el bloque «Forma de los criterios» en el informe y `notes` en
  el recibo. No toca `decision`, ni la política, ni el veredicto.
- `packages/core/src/template.ts`: la guía de escritura en `## Plan` y en
  `## Criterios de aceptación`, más `TEMPLATE_CRITERIOS_VACIOS`, que define la forma de la
  sección vacía.
- `packages/engine/src/materialize.ts` y `tests/mcp-server.test.ts`: consumen ese patrón en
  vez de un literal propio.
- `tests/gate-plan-aviso.test.ts` (nuevo): siete casos.

### Desvíos del plan aprobado

- **La condición del aviso quedó más estrecha.** El paso 3 pedía que las proposiciones
  descriptivas del plan estuvieran por encima del umbral de aprobación. Medido, las
  descriptivas del gate de plan viven entre 0.42 y 0.88 y no emiten veredicto: esa
  condición habría dejado el aviso sin disparar nunca. La regla quedó sobre lo que sí
  decide —lo único en banda son criterios que agrupan varias afirmaciones— y calla si algo
  que no es un criterio quedó en banda.
- **Un consumidor que el plan no había mirado.** `escribirCriterios` en
  `packages/engine/src/materialize.ts` dependía del literal de la sección de criterios
  vacía, así que el ticket materializado salía **sin criterios** —sin lo que el gate
  evalúa—. Lo detectó la suite, no el plan. Se resolvió con un patrón único que vive en la
  plantilla.
- El paso 5 pedía cubrir la guía de la plantilla con la prueba del paso 4; se cubre en
  `tests/gate-plan-aviso.test.ts`, que es ese archivo.

## Pruebas

- Resultado del PO: las pruebas pasan y el ticket se puede cerrar — «ya verifique y IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926 las pruebas pasan entonces podemos cerrarlo». Verificó sus dos comandos: `npx vitest run tests/gate-plan-aviso.test.ts` (7 pasan) y `npm test` (1.398 pasan, 48 omitidas).
- `npx vitest run tests/gate-plan-aviso.test.ts` — 7 pruebas pasan.
- `npm test` — 1.398 pruebas pasan, 48 omitidas, una suite omitida.
- `npm run build` — pasa. `npm run typecheck` — pasa.
- `npx prettier --write` sobre los archivos tocados; `format:check` pasa en ellos. Quedan
  tres avisos previos y ajenos a este ticket: `packages/engine/src/append.ts`,
  `packages/engine/src/features.ts` y `tests/anexar-a-feature.test.ts`.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-27",
    "build_reference": "commit:53e904662d2caec484d00ca4adb8ac3fe1970195",
    "environment": "local: macOS 27.0, Node v22.16.0",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "ya verifique y IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926 las pruebas pasan entonces podemos cerrarlo"
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
    "date": "2026-09-27",
    "technical_summary": "Se anadio packages/gate/src/criteria.ts: analizarFormaDeCriterios cuenta las afirmaciones de cada criterio sin modelo, sin reloj y sin estado externo. packages/engine/src/gate.ts calcula el aviso de forma despues de decide(...) y lo escribe en el informe y en el campo notes del recibo (packages/gate/src/receipt.ts), sin tocar DEFAULT_POLICY ni el veredicto. La plantilla guia la escritura de criterios y de pasos, y la forma de la seccion vacia vive en TEMPLATE_CRITERIOS_VACIOS porque un consumidor literal -escribirCriterios en packages/engine/src/materialize.ts- dejaba el ticket materializado sin criterios. Pruebas en tests/gate-plan-aviso.test.ts: siete casos. 1.398 pruebas pasan; build, typecheck y format:check en verde.",
    "functional_summary": "Cuando un plan queda en banda solo por criterios que agrupan varias afirmaciones, el informe y el recibo lo dicen, nombran el criterio y piden partirlo, en vez de mandar a revisar el contenido del plan. El aviso informa: no despeja la banda ni promueve la compuerta.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin cambio de esquema de tickets ni migraciones. Cambia el texto del informe del gate de plan y agrega un campo opcional al recibo; los recibos anteriores siguen siendo validos. Sin cambios de interfaz grafica ni de datos persistidos."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": null,
    "model": "typesafe/jev-1.13-20260917",
    "reasoning_effort": null,
    "notes": "Las compuertas de este ticket: dos corridas del gate de plan a $0.000132006 y $0.000135198, y el gate mecanico con coste 0. Suma verificable en los recibos.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": 0.000267204,
    "source": "process:.valmen/receipts/IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926.jsonl",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "20260926_182737_425c0d",
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesion que trabajo este ticket ya declaro su costo en FEATURE-ENGINE-REANUDAR-COMPACTO-20260926 (CONSUMO-001, $0.229688). Registrarla otra vez contaria dos veces el mismo gasto, asi que este ticket no declara numero de sesion.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion 20260926_182737_425c0d",
    "confidence": "low",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-26",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-26",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-26",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-26",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-26",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
