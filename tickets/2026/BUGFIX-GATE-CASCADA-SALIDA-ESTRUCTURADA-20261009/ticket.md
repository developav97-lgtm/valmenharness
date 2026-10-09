---
schema_version: 2
id: BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009
title: La cascada falla porque el productor no entrega todas las proposiciones del esquema
type: BUGFIX
module: GATE
workflow_status: awaiting_user_tests
qa_status: pending
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

# BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009

## Solicitud original

El PO eligió el 2026-10-09 por AskUserQuestion «Arreglar cascade con haiku (Recomendado)»: falló en casi todas las compuertas de hoy y cae a jev, el evaluador más débil. Síntoma, que ahora el recibo deja escrito (`evaluatorFailure`): «INVALID_REQUEST … error_max_structured_output_retries … Failed to provide valid structured output after 5 attempts … must have required property 'cubre_todos_los_criterios'» (también `structured_output_retry_exhausted`), con el productor claude-haiku-4-5-20251001. Se vio en las compuertas de plan de IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009, IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009 y las cuatro de BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008; en otras corridas la cascada sí funcionó (por ejemplo la del plan de FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009 con 40 criterios). Modo según EST-008: harness completo, porque la causa no está clara (puede ser el tamaño del esquema, el número de proposiciones por tanda o el modelo productor).

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- 2026-10-09, decidido por el PO por AskUserQuestion: «Aprobar el análisis (Recomendado)» (gate-decide registrado, actor PO).
- 2026-10-09, decidido por el PO por AskUserQuestion: «Reintento con sonnet (Recomendado)»: si el productor falla, la tanda se repite una vez con el modelo de escalado antes de caer a jev.
- Sin decisiones pendientes.

## Descripción funcional

- Alcance: el paso de producción de la cascada verificada (`verifiedCascade`, productor `claude-haiku-4-5-20251001` por `claude-code`) cuando el CLI agota sus reintentos de salida estructurada, y la degradación que hoy sigue a ese fallo.
- Usuario o rol afectado: el PO y los agentes que corren `valmen gate analysis|plan --evaluator cascade`; reciben un veredicto de jev, el evaluador más débil, en lugar del de la cascada.
- Comportamiento actual: en una fracción de las corridas el productor devuelve `error_max_structured_output_retries` y la compuerta cae a jev sin reintentar la cascada; el recibo queda con `evaluator: jev` y `evaluatorFailure`.
- Comportamiento esperado: un agotamiento de salida estructurada del productor no hace caer la compuerta a jev mientras haya un modelo capaz en la cadena; la compuerta termina con `evaluator: cascade` y el recibo deja escrito que el productor falló y quién produjo en su lugar.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): **la causa es del modelo productor, no del tamaño del esquema ni de cómo se arma.** Reproducido el 2026-10-09 con el CLI con sesión (`claude auth status`: loggedIn) y el estado real de IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009 (versión `a64e4cf`, puesto en `planned` en una copia en el scratchpad): 1 de 4 corridas reales de `valmen gate plan --evaluator cascade` reprodujo el error literal del recibo; un envoltorio en `VALMEN_CLAUDE_BIN` registró las 15 llamadas y la fallida fue la del productor en la **primera tanda** (16 proposiciones: 4 globales + 12 criterios; esquema de 6995 caracteres). Repitiendo esa llamada con `--output-format stream-json` (16 corridas), haiku llama a la herramienta `StructuredOutput` con **un objeto de una sola clave** —una proposición por llamada, en orden: `cubre_todos_los_criterios`, `corresponde_a_la_investigacion`, `compatibilidad_hacia_atras`, `clasificacion`, `criterio_01`—; el CLI valida cada llamada contra el esquema completo, responde «must have required property …» y haiku sigue con la clave siguiente, así que tras 5 intentos el CLI corta (`structured_output_retry_exhausted`). Medido: 2 de 8 corridas con el prompt actual agotaron los 5 intentos y 3 de las 6 restantes perdieron un intento parcial antes de mandar las 16 claves. El esquema lo arma `buildSchema` (`packages/gate-llm-judge/src/judge.ts:107-159`) con todas las claves en `required` y `additionalProperties: false`, correcto; viaja por `--json-schema` (`packages/credentials/src/claude-cli.ts:162-164`). El código convierte el fallo del modelo en el síntoma en dos puntos: `runSemanticEnTandas` (`packages/engine/src/evaluators.ts:369-387`) cae a jev ante cualquier fallo distinto de AUTH, con un comentario que da el fallo por «determinista» (`evaluators.ts:375-376`), y no lo es; y `verifiedCascade` (`packages/engine/src/cascade.ts:252-261`) llama al productor una sola vez, sin plan B dentro de la cadena.
- Hipótesis pendientes: (1) descartado que el tamaño cause el error: el mismo estado partido en tandas de 12 y 8 criterios homogéneos respondió en un intento (6 de 6 llamadas, `num_turns 2`), y el análisis de BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008 falló con solo 5 proposiciones; queda sin comprobar si lo dispara mezclar proposiciones globales y la `choice` `clasificacion` con los criterios. (2) Descartado que un prompt más explícito lo arregle: pedir «una sola llamada a StructuredOutput con todas las claves» empeoró, 3 de 8 corridas agotadas. (3) El escalado `claude-sonnet-5-5` con esfuerzo `high` y el mismo esquema de 16 claves respondió en un intento 4 de 4 veces (unos 13 s, unos 18.6 k tokens de entrada y 2.1 k de salida); en las 15 llamadas registradas del gate real, sonnet tampoco falló.
- Consumidores afectados: `runGate` (`packages/engine/src/gate.ts:906-911` y `945-949`, que escriben `requestedEvaluator` y `evaluatorFailure` en el recibo); el MCP `evaluar_compuerta` y `cascada_verificada`, y Mission Control, que pasan por el mismo `evaluateGate`; `verifiedCascade` también la usan las tareas de cascada (`tests/cascada-tareas.test.ts`). Los recibos del 2026-10-09 con `evaluatorFailure`: IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009 (plan-2, 3, 5 y 6, 43 proposiciones), IMPROVEMENT-CLI-APROBAR-Y-CERRAR-EN-UN-PASO-20261009 (plan-1, 28) y BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008 (analysis-1 con 5, plan-2 con 24); funcionó, por ejemplo, en FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009 plan-2 (48).
- Archivos y flujo investigados: `evaluateGateBase` → `runSemanticEnTandas` (`evaluators.ts:365-390`) → `partirEnTandas` (`evaluators.ts:345-356`, tope `MAX_CRITERIA_PROPOSITIONS = 12` en `packages/gate/src/dynamic.ts:32`, las proposiciones globales viajan en la primera tanda) → `runCascade` (`evaluators.ts:509-535`) → `verifiedCascade` (`cascade.ts:241-330`: produce, verifica con jev, escala lo no respaldado) → `evaluateWithJudge` (`judge.ts:295-333`) → `callChat` → `callClaudeCli` (`claude-cli.ts:372-456`, que convierte `is_error` en `ChatError` `INVALID_REQUEST`). La cadena sale de `.valmen/routing.yaml` (roles `producer`: haiku, esfuerzo `medium`; `escalation`: sonnet, esfuerzo `high`). Evidencia en el scratchpad de la sesión (`scratchpad/logs/` y `scratchpad/stream/`), no versionada.
- Riesgos y compatibilidad: el arreglo toca el evaluador de las compuertas, así que este ticket modifica el gate que lo evalúa y sus compuertas las decide una persona. Reintentar con el escalado cuesta una llamada de sonnet solo cuando el productor falla (con la tasa medida, alrededor de 1 de cada 8 primeras tandas); en suscripción el recibo registra `costUsd` 0. Si el recibo gana un campo, tiene que ser opcional para no romper la lectura de los recibos que ya existen. La degradación a jev se conserva como último recurso, y un fallo AUTH o CREDENTIAL_MISSING sigue sin taparse. Alternativas evaluadas, para que decida el plan: cambiar el rol `producer` a sonnet en `routing.yaml` (cambio de configuración, sin código, que encarece cada corrida y deja la cascada sin modelo barato); partir las globales en una tanda propia (una llamada más por compuerta, sin evidencia de que lo evite).
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por PO con valmen approve («Aprobar el plan (Recomendado)»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: reintento único de la producción con el modelo de escalado dentro de `verifiedCascade`, el registro de ese reintento en el recibo y en el informe del gate, y la corrección del motivo de `runSemanticEnTandas`. Fuera de alcance: cambiar `routing.yaml`, el prompt del juez (`judge.ts`), el tamaño de las tandas y el transporte `claude-cli.ts`.
- Pasos ordenados:
  1. `packages/engine/src/cascade.ts`, función `verifiedCascade` (paso 1, `cascade.ts:252-261`): envolver la llamada al productor en un `try`; si el error es de salida estructurada agotada —código `INVALID_REQUEST` y mensaje con `structured_output_retry_exhausted` o `error_max_structured_output_retries`—, repetir la misma tanda una sola vez con `judge` usando `cadena.escalation.provider`, `cadena.escalation.model` y su esfuerzo, y seguir con la verificación y el escalamiento como siempre. Si el reintento también falla, relanzar el error del reintento. Un error AUTH, CREDENTIAL_MISSING o de otra clase se relanza sin reintentar. (C1, C2, C7, C8)
  2. `packages/engine/src/cascade.ts`, interfaz `CascadeRun`: añadir el campo opcional `producerRetry` con `from` (proveedor y modelo del productor), `to` (proveedor y modelo del escalado) y `error` (`code` y `message` reales del productor); sumar el consumo y la latencia del intento fallido conocidos (cero si el CLI no los da) y del reintento a `usage` y `latencyMs`. (C4, C5)
  3. `packages/engine/src/evaluators.ts`: añadir `producerRetries?` (lista, una entrada por tanda que reintentó) a `EvaluationOutcome`; `runCascade` la llena desde `corrida.producerRetry` y `runSemanticEnTandasDe` las acumula entre tandas como ya hace con `escalations`. (C3, C4)
  4. `packages/engine/src/evaluators.ts`, función `runSemanticEnTandas` (`evaluators.ts:369-387`): corregir el comentario, que da el fallo por «determinista»; el texto nuevo dice que el fallo de salida estructurada del productor es intermitente (medido el 2026-10-09: 1 de 4 compuertas y 2 de 8 llamadas), que ya se reintentó una vez con el escalado dentro de la cascada, y que la caída a jev es el último recurso. La lógica de degradación no cambia. (C6, C14)
  5. `packages/gate/src/receipt.ts`: añadir `producerRetries?` opcional a `GateReceipt` y a `ReceiptInput`, y copiarlo en `buildReceipt` solo cuando viene, fuera de `stateHash` y de `gateHash`, como `requestedEvaluator`. Un recibo sin el campo se sigue leyendo igual. (C4, C11)
  6. `packages/engine/src/gate.ts`, función `runGate` (`gate.ts:906-911`): pasar `evaluation.producerRetries` al recibo; y en el informe (`gate.ts:945-949`) añadir una línea por reintento: «Productor <modelo> falló (<código>); la tanda se repitió con <modelo de escalado>». (C3, C4, C13)
  7. Prueba nueva `tests/cascada-productor-reintento.test.ts`, con `judge` y `jev` inyectados (sin red): productor que lanza el error literal del recibo y escalado que responde (C1, C2, C3, C4, C5); productor y reintento que fallan, con caída a jev y `evaluatorFailure` (C6); productor con AUTH, sin reintento (C7); productor que responde a la primera, sin llamada de producción al escalado (C8); un recibo literal de `.valmen/receipts/` anterior al cambio leído con `readReceipts` (C11).
  8. Regresión: `npx vitest run tests/gate-cascade-fallo.test.ts` (C9) y `npx vitest run tests/cascada-verificada.test.ts` (C10); compilación con `npx tsc --build tsconfig.build.json` (C12).
  9. Verificación manual, a cargo del responsable: una corrida real de `valmen gate plan --evaluator cascade` sobre un ticket con más de 12 criterios termina con `evaluator: cascade` (C13); y la lectura de `evaluators.ts` confirma que el comentario de `runSemanticEnTandas` ya no dice «determinista» (C14).
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Compatibilidad: los campos nuevos del recibo son opcionales; los recibos existentes no cambian ni se reescriben (append-only). El orden de las respuestas y la decisión por umbrales no cambian.
- Rollback (obligatorio): revertir el commit del ticket en la rama; los recibos escritos con `producerRetries` se siguen leyendo con el código anterior porque el lector ignora campos desconocidos, y no hay datos que migrar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Cuando el productor falla con `INVALID_REQUEST` por salida estructurada agotada, `verifiedCascade` vuelve a pedir la producción una vez al modelo de escalado.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C2. Ese reintento con el escalado produce todas las proposiciones de la tanda.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C3. Una compuerta cuyo productor falló y cuyo reintento respondió escribe un recibo con `evaluator: cascade`.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C4. Ese recibo nombra al productor que falló y al modelo que produjo en su lugar.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C5. Ese recibo conserva el mensaje real del error del productor.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C6. Si el reintento con el escalado también falla, la compuerta degrada a jev con `requestedEvaluator: cascade` y `evaluatorFailure`.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C7. Un fallo AUTH del productor no dispara el reintento.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C8. Un productor que responde a la primera no llama al escalado para producir.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C9. Las pruebas existentes del fallo de la cascada siguen pasando.
      <!-- test: npx vitest run tests/gate-cascade-fallo.test.ts -->
- [x] C10. Las pruebas existentes de la cascada verificada siguen pasando.
      <!-- test: npx vitest run tests/cascada-verificada.test.ts -->
- [x] C11. Un recibo escrito antes del cambio se sigue leyendo sin error.
      <!-- test: npx vitest run tests/cascada-productor-reintento.test.ts -->
- [x] C12. El monorepo compila con `npx tsc --build tsconfig.build.json`.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [ ] C13. Una corrida real de `valmen gate plan --evaluator cascade` sobre un ticket con más de 12 criterios termina con `evaluator: cascade`.
      <!-- verify: manual -->
- [ ] C14. El comentario de `runSemanticEnTandas` en `packages/engine/src/evaluators.ts` ya no describe el fallo de salida estructurada como determinista.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/cascade.ts`: `verifiedCascade` envuelve la producción; ante `INVALID_REQUEST` con `structured_output_retry_exhausted` o `error_max_structured_output_retries` repite la tanda una vez con el modelo de escalado y esfuerzo de `cadena.escalation`; otro error se relanza, y el error del reintento también. `CascadeRun.producerRetry` (`from`, `to`, `error`) opcional; el consumo y la latencia salen de la producción que respondió.
- `packages/engine/src/evaluators.ts`: `EvaluationOutcome.producerRetries?`, llenado por `runCascade` y acumulado entre tandas; comentario de `runSemanticEnTandas` corregido (intermitente, no determinista). La lógica de degradación a jev no cambia.
- `packages/gate/src/receipt.ts`: `ProducerRetryRecord` y `producerRetries?` opcional en `GateReceipt` y `ReceiptInput`, fuera de `stateHash` y `gateHash`.
- `packages/engine/src/gate.ts`: pasa `producerRetries` al recibo y añade al informe una línea por reintento.
- `tests/cascada-productor-reintento.test.ts`: jueces falsos, sin red, con controles (AUTH, otro `INVALID_REQUEST`, productor que responde, reintento que falla, recibo anterior).
- Pendiente del responsable: C13 (corrida real) y C14 (lectura del comentario).

## Pruebas

Directorio de ejecución: raíz del repositorio (el worktree de la rama `valmen/ticket-cascada-salida-estructurada`). Sin red ni credenciales: jueces y jev falsos.

1. `npx vitest run tests/cascada-productor-reintento.test.ts` — esperado: 10 pruebas pasan (C1 a C8, C11).
2. `npx vitest run tests/gate-cascade-fallo.test.ts tests/cascada-verificada.test.ts tests/cascada-tareas.test.ts tests/evaluators.test.ts tests/receipts-compat.test.ts tests/receipt-identity.test.ts` — esperado: sin fallos (C9, C10).
3. `npx tsc --build tsconfig.build.json` — esperado: sin salida y código 0 (C12).

Resultado de la sesión: 12 archivos de prueba, 274 pruebas pasadas; compilación en 0.

Validaciones manuales a cargo del responsable:
- C13: `valmen gate plan --id <ticket con más de 12 criterios> --evaluator cascade`; esperado `evaluator: cascade` (con el CLI con sesión de Claude; el reintento solo se ve si el productor falla, cerca de 1 de cada 8 primeras tandas).
- C14: leer `packages/engine/src/evaluators.ts`, función `runSemanticEnTandas`: el comentario ya no dice «determinista» para el fallo de salida estructurada.

Requisitos de ambiente: Node 24, `npm install` hecho; para C13, `claude auth status` con sesión.

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
    "date": "2026-10-09",
    "at": "2026-10-09T18:25:01.408Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T18:48:23.442Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T18:52:12.974Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261009-BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009-analysis-1, canal cli, decidida 2026-10-09T18:52:12.967Z): PO por AskUserQuestion: \"Aprobar el análisis (Recomendado)\"; arreglo elegido: \"Reintento con sonnet (Recomendado)\""
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T18:53:15.239Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T19:20:29.925Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009-plan-2, canal cli, decidida 2026-10-09T19:20:29.923Z): por el PO PO (valmen approve): C2 y C6 en 0.90, justo en el umbral; forma, no cobertura — palabras del PO: «Aprobar el plan (Recomendado)»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T19:20:30.104Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar el plan (Recomendado)\",\"planHash\":\"sha256:bf20d7f095dc5863b0d5a632dd470e11ce81f32110426fc2995fb2f7b801b659\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T19:20:30.266Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:bf20d7f095dc5863b0d5a632dd470e11ce81f32110426fc2995fb2f7b801b659."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T19:20:30.266Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T19:20:54.531Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T19:23:05.822Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
