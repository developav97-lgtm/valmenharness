---
schema_version: 2
id: IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009
title: Un comando para resolver la REVIEW y aprobar el plan, y otro para cerrar con QA del PO
type: IMPROVEMENT
module: CLI
workflow_status: closed
qa_status: approved
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

# IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009

## Solicitud original

El PO eligió el 2026-10-09 «arreglemos las fugas» con la opción «Ceremonia de aprobar y cerrar»: un comando que encadena gate-decide, approve-plan, línea del plan y transición, y otro que cierra con punto, evidencia, QA y cierre. Hallazgo de la corrida vista-agentes: aprobar un plan en REVIEW tomó 4 pasos manuales (gate-decide, approve-plan, editar la línea «Gate de plan y aprobación» en ## Plan, transition a approved) y cerrar un ticket validado por el PO tomó 12 (resultado del PO en ## Pruebas, in_qa, add-point con archivos, tres transiciones del punto, add-evidence con referencia worktree, qa-start con commit, add-retest, cierre del punto, qa-close, qa_approved, add-ai-usage, close-attempt, closed); el orquestador tuvo que escribir un script para cerrar 11 tickets, y `cerrar_ticket_delegado` solo sirve dentro de una delegación.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- D1. ¿Cómo se llaman los dos comandos? Por defecto: `valmen approve --id <ID> --actor <PO> --quote "<frase>" [--reason "<motivo>"]` y `valmen close --id <ID> --actor <PO> --po-confirmation "<frase>" …`; ninguno de los dos nombres existe hoy en `packages/cli/src/main.ts`.
- D2. ¿Qué hace `approve` si la compuerta `plan` dio BLOCK? Por defecto: se detiene y nombra el recibo; un BLOCK sigue saliendo solo con `gate-decide` explícito, no con el atajo.
- D3. ¿Qué hace `approve` con un REVIEW? Por defecto: lo decide como `approve` con `--reason` obligatorio y la frase del PO en el recibo; sin `--reason` se detiene, igual que `resolverCompuerta` en la delegación.
- D4. ¿Los atajos aceptan un ticket SECURITY? Por defecto: no; se rechaza y sigue con los pasos manuales de siempre. El despliegue no es un tipo de ticket (`TICKET_TYPES`, `packages/core/src/contract.ts:96`): va por release, y ningún atajo toca `release_status` ni publica.
- D5. ¿Los atajos aceptan un ticket con impacto de sincronización, migración o contenedores? Por defecto: sí, porque la frase literal del PO es la aprobación humana que esos gates exigen; la delegación los rechaza porque ahí no hay frase por ticket.
- D6. ¿Desde qué estado parte `close`? Por defecto: desde `awaiting_user_tests` o un cierre a medias (`in_qa`, `qa_approved`); desde `in_progress` lo rechaza, porque la entrega con `qa-mechanical` es otro paso.
- D7. ¿De dónde salen los archivos del punto de QA? Por defecto: de `--files`, obligatorio cuando el ticket no tiene punto; no se infieren de `git diff`.
- D8. ¿Qué consumo de IA anota `close` si el ticket no tiene entrada? Por defecto: exige `--source` (`manual:` o la fuente con números); no inventa una fuente por defecto como hace la delegación.
- D9. ¿Cómo se declara un criterio que no aplica? Por defecto: el criterio ya debe decir «no aplica: <motivo>» en el ticket; `close` no lo escribe por su cuenta y se detiene nombrando el criterio sin marcar.

## Descripción funcional

- Alcance: dos comandos del CLI fuera de una delegación —`approve` resuelve la compuerta `plan`, registra la aprobación con la frase del PO, escribe la línea del gate en `## Plan` y mueve a `approved`; `close` lleva un ticket validado por el PO de `awaiting_user_tests` a `closed`—, reutilizando la cadena que ya hacen `advanceDelegated` y `closeDelegated`. Fuera de alcance: el MCP, la app y cambiar las reglas del motor.
- Usuario o rol afectado: el orquestador o el agente que trabaja con el PO en la terminal, y el PO que dicta la frase.
- Comportamiento actual: aprobar un plan en REVIEW toma 4 comandos (gate-decide, approve-plan, editar la línea del plan, transition) y cerrar un ticket validado toma 12; `cerrar_ticket_delegado` solo funciona dentro de una delegación, y en la corrida vista-agentes el orquestador escribió un script para cerrar 11 tickets.
- Comportamiento esperado: un comando por ceremonia, que exige la frase literal del PO, se detiene en el primer paso que falla diciendo cuál y en qué estado quedó el ticket, y retoma desde ahí si se repite.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la cadena de aprobar y la de cerrar existen ya en código, pero atadas a una delegación. `packages/cli/src/delegation.ts:236` (rama `planned` de `advanceDelegated`) encadena compuerta → `registrarAprobacionDePlan` → línea del gate → `approved`, y `packages/cli/src/delegation.ts:323` (`closeDelegated`) encadena resultado del PO → `in_qa` → punto con archivos → tres transiciones del punto → evidencia → `qaStart` con el HEAD → retest → punto `closed` → `qaClose` → `qa_approved` → consumo → `closeAttempt` → `closed`. Las dos exigen un objeto `Delegation`: `assertInScope` en `delegation.ts:211` y `:330`, `appendDelegationEvent` en `parada` (`delegation.ts:128`) y la frase sale de `delegation.quote` (`delegation.ts:178`, `:250`, `:409`). Fuera de una delegación solo quedan los comandos sueltos: `runGateDecide` (`packages/cli/src/main.ts:925`), `approvePlanCommand` (`packages/cli/src/commands.ts:310`), `runTransition` (`main.ts:1267`) y los de `ESCRITURA` (`main.ts:1051`); por eso aprobar cuesta 4 pasos y cerrar 12.
- Hipótesis pendientes: (H1) extraer de `closeDelegated` una función que reciba la frase y un sumidero de paradas, sin `Delegation`, deja intacto el comportamiento de `delegation close`; se comprueba con `tests/delegation.test.ts` antes y después. (H2) `registrarAprobacionDePlan` (`packages/engine/src/plan-approval.ts:173`) acepta por CLI solo las fuentes de `plan-approval-sources` (`plan-approval.ts:203`); `approve` usará la fuente `cli` como `approvePlanCommand` y no la `delegacion`, que solo habilita `viaDelegacion` (`plan-approval.ts:204`).
- Consumidores afectados: `valmen delegation advance|close` (`main.ts:2025`) y las herramientas MCP `avanzar_ticket_delegado` y `cerrar_ticket_delegado` (`packages/mcp/src/tools.ts:3259`, `:3285`), que llaman a las mismas funciones y no deben cambiar de salida; `tests/delegation.test.ts` y `tests/gate-human-decision.test.ts` las cubren.
- Archivos y flujo investigados: `packages/cli/src/delegation.ts:142` (`resolverCompuerta`: APPROVE sigue, REVIEW solo con motivo, BLOCK se detiene), `packages/engine/src/receipts.ts:125` (`veredictoDeCompuerta`), `packages/engine/src/plan-approval.ts:117` (`aprobacionDePlanVigente` lee solo eventos `plan-approved`), `packages/core/src/validate.ts:282` (`hasPlanGate` exige la línea «aprobado explícitamente por el PO»), `packages/core/src/validate.ts:318` (`hasRecordedUserTestOutcome` lee «Resultado del PO:» en `## Pruebas`), `packages/engine/src/transition.ts:507` (entrar a `closed` exige QA aprobada, criterios marcados o «no aplica» —`unmarkedCriteria`, `packages/engine/src/criteria-marks.ts:78`— y un cierre coherente), `packages/engine/src/criteria-marks.ts:143` (`markManualCriteria` con las palabras del PO), `packages/engine/src/delegation.ts:287` (`hardGateStop`: impactos, riesgo crítico y SECURITY), `packages/cli/src/main.ts:624` (`VALUE_OPTIONS`, donde ya están `--quote`, `--actor`, `--files` y `--po-confirmation`).
- Riesgos y compatibilidad: (R1) el atajo podría aprobar o cerrar sin una persona; se mitiga exigiendo `--quote`/`--po-confirmation` no vacíos, respetando la barrera de sesión desatendida de `registrarAprobacionDePlan` y sin decidir un BLOCK. (R2) `closeDelegated` marca `[x]` los criterios con `test:` por regex (`delegation.ts:380`) sin mirar el recibo; el atajo partirá de `awaiting_user_tests`, donde esa marca ya la hizo la entrega, y no repite ese atajo. (R3) un paso intermedio que falle deja el ticket a medias; cada paso es idempotente por estado (como en `closeDelegated`, que mira bloques antes de anexar) y el error nombra el paso y el estado en que quedó. (R4) refactorizar `closeDelegated` puede cambiar la salida de la delegación; se cubre con sus pruebas actuales.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia solo el CLI del harness y no toca datos sincronizados, esquemas, contenedores ni despliegues.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-326fff; el PO resolvió la REVIEW con «Aprobar (Recomendado)» y aceptó D1–D9 con «Acepto las nueve (Recomendado)».
- Alcance: dos comandos nuevos del CLI (`approve`, `close`) y la extracción de la cadena común que hoy vive en `packages/cli/src/delegation.ts`. Exclusiones: MCP, app, reglas del motor (`transition`, `registrarAprobacionDePlan`, `hasPlanGate`), release y despliegue; las decisiones D1–D9 se aplican con su opción por defecto salvo que el PO diga otra cosa.
- Pasos ordenados:
  1. Crear `packages/cli/src/ceremony.ts` y mover ahí, sin cambiar su lógica, `resolverCompuerta` (`delegation.ts:142`) parametrizada por la frase, el actor, el canal y un sumidero de eventos; la rama de aprobación del plan (`delegation.ts:244-264`) como `aprobarPlanConFrase`; y la cadena de QA y cierre (`delegation.ts:424-503`) como `cerrarConQaDelPo`, que recibe la frase del PO, los datos de cierre y el consumo, y devuelve el paso en que se detuvo. (C18, C19, C20, C21)
  2. Hacer que `advanceDelegated` y `closeDelegated` en `packages/cli/src/delegation.ts` llamen a esas funciones con `delegation.quote`, la fuente `delegacion` y `appendDelegationEvent` como sumidero, sin cambiar sus mensajes. (C21)
  3. Escribir `approveCommand` en `packages/cli/src/ceremony.ts`: exige `--id`, `--actor` y `--quote` (C1); rechaza SECURITY (C8); corre la compuerta `plan` con la dependencia `runGate` solo si no hay recibo aprobado; con REVIEW exige `--reason` (C5, C6); con BLOCK se detiene y nombra el recibo (C7); registra `plan-approved` con fuente `cli` y la frase (C3); escribe la línea del gate (C4); mueve a `approved` (C2); toda parada dice el paso (C19) y el estado (C20).
  4. Escribir `closeCommand` en `packages/cli/src/ceremony.ts`: exige `--po-confirmation` (C9); parte solo de `awaiting_user_tests`, `in_qa` o `qa_approved` (C17, C18); marca los criterios manuales con `markManualCriteria`; comprueba `unmarkedCriteria` antes de anexar nada y se detiene fuera de `closed` (C14) citando el criterio (C15); exige `--source` si no hay consumo (C16); delega en `cerrarConQaDelPo`, que escribe en `## Pruebas` la línea «Resultado del PO:» con la frase literal de `--po-confirmation` (C11), anota el punto con `--files` (C12), arranca el QA con el HEAD de `REAL_GIT` (C13) y termina en `closed` (C10).
  5. Despachar `approve` y `close` en `packages/cli/src/main.ts` junto a `approve-plan` (`main.ts:2107`), con su ayuda; las banderas que usan ya están en `VALUE_OPTIONS` (`main.ts:624`). (C2, C10)
  6. Escribir `tests/approve-close-shortcut.test.ts` sobre una raíz temporal (`mkdtempSync`) con `tests/helpers/fixtures.ts`, recibos construidos con `buildReceipt` y `runGate`/`head`/`dirty` inyectados, sin red ni git real. (C1–C20)
  7. Correr `npx vitest run tests/approve-close-shortcut.test.ts tests/delegation.test.ts tests/gate-human-decision.test.ts` y `npx tsc --build tsconfig.build.json`. (C21, C22)
- Impactos declarados: ninguno; el cambio no toca sincronización, migraciones ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket en la rama; no hay datos ni esquemas que deshacer, y `delegation advance|close` vuelve a su código anterior con el mismo revert.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `valmen approve` sin `--quote` sale con error y no escribe el ticket.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C2. `valmen approve` con la compuerta `plan` en APPROVE deja el ticket en `approved`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C3. `valmen approve` registra un evento `plan-approved` con la frase literal de `--quote`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C4. `valmen approve` escribe en `## Plan` la línea «aprobado explícitamente por el PO» con la frase.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C5. `valmen approve` con la compuerta en REVIEW y sin `--reason` se detiene en `planned`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C6. `valmen approve` con la compuerta en REVIEW y `--reason` registra la decisión humana en el recibo.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C7. `valmen approve` con la compuerta en BLOCK se detiene en `planned` y nombra el recibo.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C8. `valmen approve` rechaza un ticket SECURITY sin escribirlo.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C9. `valmen close` sin `--po-confirmation` sale con error y no escribe el ticket.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C10. `valmen close` desde `awaiting_user_tests` deja el ticket en `closed`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C11. `valmen close` deja en `## Pruebas` la línea «Resultado del PO:» con la frase literal.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C12. `valmen close` anota el punto de QA con los archivos de `--files`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C13. `valmen close` arranca el ciclo de QA con `commit:<HEAD>` como referencia.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C14. `valmen close` con un criterio sin marcar ni «no aplica: <motivo>» deja el ticket fuera de `closed`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C15. El mensaje de esa parada cita el texto del criterio sin marcar.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C16. `valmen close` sin `--source` y sin consumo registrado se detiene antes de `closed`.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C17. `valmen close` desde `in_progress` sale con error sin escribir el ticket.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C18. `valmen close` repetido tras una parada retoma desde el estado en que quedó el ticket.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C19. El mensaje de una parada nombra el paso que falló.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C20. El mensaje de una parada nombra el estado en que quedó el ticket.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C21. `valmen delegation close` conserva su comportamiento tras extraer la cadena común.
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] C22. El monorepo compila sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/ceremony.ts",
      "packages/cli/src/delegation.ts",
      "packages/cli/src/main.ts",
      "tests/approve-close-shortcut.test.ts"
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

- `packages/cli/src/ceremony.ts` (nuevo): la cadena común sin atadura a una delegación. `resolverCompuerta` (APPROVE sigue, REVIEW solo con motivo, BLOCK se detiene) recibe un `OrigenDeDecision` con la frase, el actor, el canal y un sumidero de eventos; `aprobarPlanConFrase` registra `plan-approved` y escribe la línea del gate; `cerrarConQaDelPo` lleva de la espera del PO a `closed` y devuelve el paso en que se detuvo. Cada bloque se anexa solo si falta, así una repetición retoma sin duplicar. `approveCommand` y `closeCommand` son los dos comandos.
- `packages/cli/src/delegation.ts`: `advanceDelegated` y `closeDelegated` llaman a esas funciones con `delegation.quote`, la fuente `delegacion` y `appendDelegationEvent` como sumidero; mensajes y orden de pasos sin cambios.
- `packages/cli/src/main.ts`: despacho de `approve` y `close` junto a `approve-plan`, con su ayuda.
- `tests/approve-close-shortcut.test.ts` (nuevo): 15 pruebas sobre una raíz temporal.
- Decisiones D1–D9 con su opción por defecto. `close` exige además `--environment`, `--tests`, `--technical-summary`, `--functional-summary` y `--release-impact` (los mismos datos de cierre de `delegation close`), y rechaza SECURITY igual que `approve`.

## Pruebas

- Directorio de ejecución: la raíz del worktree (o del repositorio tras integrar). Requisitos: Node 24, `npm install` hecho; las pruebas usan una raíz temporal y un `git init` local, sin red.
- `npx vitest run tests/approve-close-shortcut.test.ts tests/delegation.test.ts tests/gate-human-decision.test.ts` — esperado: todo en verde (15 pruebas del ticket más las de delegación y decisión humana; en el worktree dieron 68 de 68 junto con `delegation-mcp`, `aprobacion-de-plan` y `transicion-approved-registrada`).
- `npx tsc --build tsconfig.build.json` — esperado: sin errores (corrió limpio).
- Validación manual opcional, en un ticket de prueba: `valmen approve --id <ID> --actor <PO> --quote "<frase>"` desde `planned`, y `valmen close --id <ID> --po-confirmation "<frase>" --environment local --tests "<qué dio>" --technical-summary … --functional-summary … --release-impact … --files <a,b> --source manual:<ref>` desde `awaiting_user_tests`; en ambos, sin la frase el comando sale con error y no escribe el ticket.

- Resultado del PO: Cerrarlos (Recomendado). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Pruebas del ticket y suite completa en verde; qa-mechanical approve

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:00b0558788fcfdaa36730e24ac6d7ae7c90e092d",
    "environment": "macOS, Node 24, main tras integrar; suite completa 231 archivos y 3927 pruebas en verde",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde; qa-mechanical approve",
    "reference": "worktree:sha256:1636fcbaa1152da8fd43792877d5c1f2799f00afa754ed1698393f22de69ae0c",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "Comandos approve y close en packages/cli/src/ceremony.ts, que reutilizan la cadena de la delegación: exigen la frase literal del PO, rechazan SECURITY y un BLOCK, y retoman al repetirse.",
    "functional_summary": "Aprobar un plan o cerrar un ticket validado por el PO es un solo comando en vez de 4 y 12 pasos.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sin números por ticket: la sesión no expone sus tokens.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code (subagente de implementación, Sonnet 5.5)",
    "confidence": "low",
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
    "date": "2026-10-09",
    "at": "2026-10-09T14:34:18.115Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T15:37:28.721Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T15:40:05.372Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T15:47:20.438Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009-plan-2, canal cli, decidida 2026-10-09T15:47:20.408Z): PO por AskUserQuestion: \"Aprobar (Recomendado)\" y \"Acepto las nueve (Recomendado)\" (REVIEW por forma de C1, C6, C9; C17, C18, C20 entre 0.75 y 0.86)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T15:47:22.867Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-326fff\",\"source\":\"autorizacion\",\"quote\":\"aprobacion de planes y analisis agentico\",\"planHash\":\"sha256:d9155de2cca27013b699817ee797a092fe26a09726d7c4b17eb6dc0cc99f4c6f\",\"authorizationId\":\"APA-20261009-326fff\",\"authorizationHash\":\"sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009-plan-2\",\"receiptStateHash\":\"sha256:4d8ccc3f1d73855cef10bf59b9d51730e967501143d7d086629593ea569e390b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T15:47:35.664Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-326fff (fuente autorizacion, hash sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d), plan sha256:d9155de2cca27013b699817ee797a092fe26a09726d7c4b17eb6dc0cc99f4c6f."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T15:47:35.664Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T15:47:59.519Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T15:55:21.407Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T16:17:19.588Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:21.598Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:21.758Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:21.900Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.038Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.174Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.368Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.581Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.716Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.849Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:22.983Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:23.123Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:23.257Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:23.383Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
