---
schema_version: 2
id: BUGFIX-CLI-CANAL-DECISION-20261005
title: La decisión de una compuerta tomada por el CLI queda registrada con el canal mission-control
type: BUGFIX
module: CLI
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-CLI-CANAL-DECISION-20261005

## Solicitud original

Solicitud del PO el 2026-10-05, tras cerrar BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004: «sigamos tu recomendacion pero no podemos olvidar la pantalla» (la recomendación incluía abrir este ticket aparte). Hallazgo de ese ticket, comprobado de punta a punta el 2026-10-05: `valmen gate-decide --id <ID> --receipt <recibo> --decision approve --actor <nombre> --reason <frase>` llama a `recordHumanDecision` sin pasar `channel` (`packages/cli/src/main.ts`, alrededor de la línea 777), y esa función usa por defecto `mission-control` (`packages/server/src/gates.ts:630`). Resultado: una decisión tomada por el CLI queda en el recibo y en el evento `gate-approved` del ticket con «canal mission-control», que es falso, y justo ahora que el ticket guarda quién firmó y por qué canal, un informe que lea solo el ticket atribuye al canal equivocado la firma. Mission Control y el enlace de Telegram sí identifican su canal (`server.ts:1347` acepta `channel`; `hermes.ts:622` pasa `CANAL_REMOTO`). Aviso de coordinación: al registrar esto, `packages/cli/src/main.ts` tenía cambios sin commitear de otra sesión; quien lo tome debe esperar a que ese archivo esté limpio o coordinar, y no mezclar ese trabajo en su commit.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- ¿Qué valor identifica el canal del CLI en `humanDecision.channel`? Hoy existen `mission-control` (el defecto de `recordHumanDecision`, `packages/server/src/gates.ts:630`) y `hermes-celular` (`CANAL_REMOTO`, `packages/cli/src/hermes.ts:538`); para el CLI no hay ninguno. Recomendación del que abrió el ticket: `cli`. Hasta que el PO lo confirme, el análisis no planifica sobre otro valor.
- ¿Las decisiones ya registradas con «canal mission-control» que en realidad tomó el CLI se corrigen? Los recibos son append-only y no se reescriben, y el CLI no deja marca para distinguirlas de las de Mission Control. Recomendación: no se corrigen; se deja dicho en la entrega desde qué fecha el canal es fiable.

## Descripción funcional

- Alcance: la decisión humana sobre una compuerta escalada que se toma con `valmen gate-decide --id <ID> --receipt <recibo>` (la rama sin `--code`). Queda fuera la rama `--code` (Telegram), Mission Control y la corrida delegada, que ya declaran su canal.
- Usuario o rol afectado: el PO o responsable que decide compuertas desde la terminal, y quien audita después el recibo o el evento `gate-approved`/`gate-rejected` del ticket para saber por qué canal se firmó.
- Comportamiento actual: la decisión tomada por el CLI queda en `humanDecision.channel` del recibo como `mission-control`, y el evento del ticket dice «canal mission-control». La atribución es falsa.
- Comportamiento esperado: la decisión tomada por el CLI queda con canal `cli` en el recibo y en el evento del ticket; los otros canales (`mission-control`, `hermes-celular`, `delegation`) no cambian.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/cli/src/main.ts:892` `runGateDecide`: con `--code` delega en `decideByCode` (`main.ts:950`); sin `--code`, valida `--id`, `--receipt`, `--decision`, `--actor` y llama `recordHumanDecision(paths, ticketId, receiptId, { decision, actor, reason })` en `main.ts:972-976` **sin `channel`**.
  - `packages/server/src/gates.ts:596` `recordHumanDecision`: `HumanDecisionInput.channel` es opcional (`gates.ts:575`) y se completa con `input.channel ?? "mission-control"` en `gates.ts:635`; el recibo con la decisión se anexa (`appendReceipt`) y luego `appendEvent` escribe `gate-approved`/`gate-rejected` con el texto de `describirDecisionHumana`.
  - `packages/engine/src/receipts.ts:168` `describirDecisionHumana`: redacta «(recibo …, canal ${decision.channel}, decidida …)», la frase que termina en el evento del ticket.
  - `packages/gate/src/receipt.ts:257`: `humanDecision.channel` es un `string` libre; no hay enumeración que ampliar.
- Consumidores de `recordHumanDecision` (todos afectados por el defecto o por su corrección):
  - CLI `gate-decide` — `packages/cli/src/main.ts:972` (el que falla: no pasa canal).
  - Mission Control — `packages/server/src/server.ts:1437-1442`: pasa `channel` solo si el cuerpo lo trae; si no, cae en el defecto `mission-control`, que es correcto para ese canal. Depende del defecto: **no se toca**.
  - Telegram/Hermes — `packages/cli/src/hermes.ts:639-646` (`decideByCode`): pasa `CANAL_REMOTO` = `hermes-celular` (`hermes.ts:554`); lo fija `tests/hermes-notify.test.ts:313`.
  - Corrida delegada — `packages/cli/src/delegation.ts:183` pasa `channel: "delegation"`; `main.ts:2004` inyecta `recordHumanDecision` como `decide`.
  - Lectores del canal: `describirDecisionHumana` (`packages/engine/src/receipts.ts:168`) y el avance que reconoce el evento por recibo (`packages/engine/src/transition.ts:258`); leen el valor tal cual, sin compararlo con una lista.
- Causa raíz (comprobada): `runGateDecide` no pasa `channel` y `recordHumanDecision` rellena el hueco con `mission-control`. No hay otra ruta: el CLI no tiene bandera de canal ni constante propia.
- Hipótesis pendientes: ninguna sobre la causa. Queda la decisión del valor (`cli`, recomendado) en «Supuestos y decisiones pendientes»; el plan usa `cli` y no otro valor.
- Memoria: `buscar_memoria` («canal decisión compuerta CLI mission-control») no devolvió un caso previo de este síntoma; los aprendizajes AP-007 y AP-009 (`.valmen/memory/aprendizajes.md:60`, `:76`) tratan la firma en el recibo, no el canal.
- Riesgos y compatibilidad: cambio de una línea en un solo llamador; el campo es texto libre, así que `cli` no rompe lectores ni el formato del recibo. Los recibos y eventos ya escritos con «canal mission-control» por el CLI no se reescriben (append-only) ni se pueden distinguir de los de Mission Control; el canal es fiable desde el commit de este ticket. Riesgo de choque: `tests/firma-de-compuerta.test.ts:300` ya usa `channel: "cli"` como dato de prueba, lo que confirma el valor y no choca. Coordinación: el aviso del registro sobre cambios sin commitear en `main.ts` ya no aplica (el checkout principal solo tiene `.valmen/journeys/events.jsonl` modificado al 2026-10-08).
- Impactos de sync, migración, Docker o despliegue: ninguno — cambio en el CLI local y su prueba; sin datos migrados, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: solo la rama `--id/--receipt` de `runGateDecide` y sus pruebas. Exclusiones: no se cambia el defecto `mission-control` de `recordHumanDecision` (lo usa Mission Control), ni Hermes, ni la corrida delegada, ni se reescriben recibos o eventos históricos.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. En `packages/cli/src/main.ts`, junto a `runGateDecide`, declarar y exportar la constante `CANAL_CLI = "cli"` con un comentario que diga por qué existe; en la llamada a `recordHumanDecision` (`main.ts:972`) agregar `channel: CANAL_CLI`. Cubre los criterios 1 y 2.
  2. En `tests/gate-human-decision.test.ts`, agregar un `describe` que llame `runGateDecide` (importado de `packages/cli/src/main.ts`) con `--id`, `--receipt`, `--decision approve`, `--actor` y `--reason` sobre un recibo escalado y un ticket creado en el laboratorio (mismo patrón de `ticketEn` en `tests/firma-de-compuerta.test.ts`), y que compruebe `humanDecision.channel === "cli"` en el recibo vigente. Cubre el criterio 1.
  3. En el mismo `describe` de `tests/gate-human-decision.test.ts`, comprobar que el evento `gate-approved` del ticket contiene «canal cli» y no «canal mission-control». Cubre el criterio 2.
  4. En `tests/gate-human-decision.test.ts`, agregar el caso control: `recordHumanDecision` sin `channel` sigue escribiendo `mission-control` (el camino de Mission Control en `packages/server/src/server.ts:1437`). Cubre el criterio 3.
  5. Correr `npx vitest run tests/gate-human-decision.test.ts` y esperar todas las pruebas en verde. Cubre los criterios 1, 2 y 3.
  6. Correr `npx vitest run tests/hermes-notify.test.ts` para comprobar que la rama `--code` sigue firmando `hermes-celular`. Cubre el criterio 4.
  7. Correr `npx vitest run tests/delegation.test.ts` para comprobar que la corrida delegada (`packages/cli/src/delegation.ts:183`) no cambia. Cubre el criterio 5.
  8. Correr `npx vitest run tests/firma-de-compuerta.test.ts` para comprobar que la constancia de firma en el evento sigue igual. Cubre el criterio 6.
  9. Correr `npx tsc --noEmit -p tsconfig.json` y esperar cero errores. Cubre el criterio 7.
  10. Verificación manual en el laboratorio: revisar con `git diff` que ningún archivo bajo `.valmen/receipts/` ni ningún bloque `## Eventos` previo cambió, y dejar en la entrega la fecha desde la cual el canal del CLI es fiable. Cubre el criterio 8.
  11. Entrega: escribir en `## Pruebas` el contrato —comandos de los pasos 5 a 9, directorio de ejecución el worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-canal-decision`), resultado esperado (todas en verde, `tsc` sin errores), validación manual (correr `valmen gate-decide --id <ID> --receipt <recibo escalado> --decision approve --actor <nombre> --reason <frase>` sobre un ticket de prueba y leer «canal cli» en el evento) y requisitos de ambiente (Node 24, `npm install` hecho)—; correr la compuerta `qa-mechanical` con `valmen gate qa-mechanical --id BUGFIX-CLI-CANAL-DECISION-20261005 --evaluator command`, registrar el consumo de IA, correr `valmen secrets` y commitear solo `packages/cli/src/main.ts`, `tests/gate-human-decision.test.ts` y el ticket en la rama del worktree.
- Dependencias: ninguna externa. La decisión del valor del canal es del PO (ver «Supuestos y decisiones pendientes»).
- Rollback: revertir el commit del ticket en la rama (`git revert <hash>`): el CLI vuelve a escribir `mission-control`. Los recibos escritos con `cli` mientras tanto quedan como están (append-only) y siguen siendo legibles porque `humanDecision.channel` es texto libre (`packages/gate/src/receipt.ts:257`).

## Criterios de aceptación

<!-- Una afirmación verificable por criterio. Una frase con «y» son dos criterios:
     cada uno se despliega como una proposición propia, y una que agrupa varias
     afirmaciones cae en banda de revisión aunque el plan la cubra entera. -->
- [x] Una decisión tomada con `valmen gate-decide --id --receipt` queda en el recibo con `humanDecision.channel` igual a `cli`.
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [x] El evento `gate-approved` que el CLI anexa al ticket dice «canal cli».
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [x] `recordHumanDecision` sin canal explícito sigue registrando `mission-control`.
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [x] La decisión por código desde Telegram sigue registrando `hermes-celular`.
      <!-- test: npx vitest run tests/hermes-notify.test.ts -->
- [x] La corrida delegada sigue pasando sus pruebas sin cambios.
      <!-- test: npx vitest run tests/delegation.test.ts -->
- [x] La constancia de firma en el evento del ticket sigue pasando sus pruebas sin cambios.
      <!-- test: npx vitest run tests/firma-de-compuerta.test.ts -->
- [x] El proyecto compila sin errores de tipos.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] Ningún recibo ni evento ya registrado se reescribe.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de BUGFIX-CLI-CANAL-DECISION-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/main.ts",
      "tests/gate-human-decision.test.ts"
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

- `packages/cli/src/main.ts`: constante exportada `CANAL_CLI = "cli"` y `channel: CANAL_CLI` en la llamada a `recordHumanDecision` de la rama `--id/--receipt` de `runGateDecide`.
- `tests/gate-human-decision.test.ts`: `describe` «el canal de la decisión» (canal `cli` en recibo y evento; caso control `mission-control` sin canal).
- El canal del CLI es fiable desde el commit de este ticket (2026-10-08); las decisiones anteriores tomadas por el CLI quedan como `mission-control` (append-only, no se corrigen).

## Pruebas

Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-canal-decision` (Node 24, `npm install` hecho).

- `npx vitest run tests/gate-human-decision.test.ts` (9 en verde)
- `npx vitest run tests/hermes-notify.test.ts tests/delegation.test.ts tests/firma-de-compuerta.test.ts` (75 en verde)
- `npx tsc --noEmit -p tsconfig.json` (sin errores)

Validación manual: `valmen gate-decide --id <ID> --receipt <recibo escalado> --decision approve --actor <nombre> --reason <frase>` sobre un ticket de prueba y leer «canal cli» en el evento. El diff no toca recibos ni eventos previos.

- Verificación 2026-10-08: `git show --numstat` de los commits del ticket: 0 líneas borradas en `.valmen/receipts`; las líneas borradas de `ticket.md` son el texto de sus propios criterios, ningún evento.

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:d1654fbfca4900d34164c7bc26aa5460a0ce9671",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:3ec7c8a18440b81df9c3901312f8d42e28fe7ddc6a61cd0f65d715c283bfd176",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "La decisión de una compuerta tomada por el CLI queda registrada con el canal mission-control",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: sesión de implementación (subagente Sonnet 5.5), sin números expuestos",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
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
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×114, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×103, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×101, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×82), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16587469 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-004"
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
    "at": "2026-10-06T03:08:46.802Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:13:15.518Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:14:12.455Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:31.627Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 3 planes de bugfix con las recomendaciones)\",\"planHash\":\"sha256:9832d12a700ffdbab2a00649153f6bd3b3349be387378d95107dca08ac2711e0\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:32.115Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:9832d12a700ffdbab2a00649153f6bd3b3349be387378d95107dca08ac2711e0."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:32.115Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:21:10.997Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:53.410Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:53.877Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:35.136Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:35.484Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:35.843Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:36.201Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:36.583Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:36.972Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:37.324Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:37.656Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:37.934Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:38.232Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:38.536Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:38.824Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:40.654Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:40.819Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:40.947Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-08",
    "at": "2026-10-08T22:18:41.261Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
