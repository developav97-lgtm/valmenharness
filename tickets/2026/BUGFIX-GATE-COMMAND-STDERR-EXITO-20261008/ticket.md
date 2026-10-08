---
schema_version: 2
id: BUGFIX-GATE-COMMAND-STDERR-EXITO-20261008
title: El gate qa-mechanical marca falla de entorno a toda suite que pasa porque no lee stderr con exit 0
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
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-COMMAND-STDERR-EXITO-20261008

## Solicitud original

PO (2026-10-08): "referente al gate de qa-mechanical yo creo que podemos generar el ticket en el harness para corregir". Síntoma observado durante la feature superadmin-ampliacion de SaiOpenCloud: `valmen gate qa-mechanical` devuelve REVIEW con «falla del entorno: la salida no trae el resumen de pruebas de Django; el comando no llegó a ejecutar la suite» en todos los criterios, aunque el comando salga con exit 0 y la suite pase (por ejemplo `docker compose run --rm -T -e DB_NAME=x backend python manage.py test SuperAdmin.tests.test_models --keepdb`, 4 tests OK). Causa localizada: en packages/gate-command/src/command.ts (~líneas 290-350) la rama de éxito de `execFileSync` solo guarda `stdout` y deja `stderr` vacío; Django (unittest) imprime `Ran N tests ... OK` por stderr, así que `classifyEnvironmentFailure` (RUNNERS, patrón `Ran\s+\d+\s+tests?`) nunca lo ve. Los recibos viejos pasaron antes de que existiera esa clasificación. Efecto: ~40 tickets de SaiOpenCloud tuvieron que cerrarse a mano por REVIEW sin que ninguna prueba hubiera fallado.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Autoevaluación de la compuerta: la `qa-mechanical` de este ticket la evalúa el mismo evaluador `command` que el ticket modifica, y la regla del proyecto dice que un gate no amplía su propia autoridad. ¿El PO acepta correrla con el binario del checkout principal (sin el cambio; los criterios son de vitest, que imprime su resumen por stdout, así que no depende del arreglo) en vez del `dist` del worktree? Recomendación: sí, con el binario principal.
- Autoridad y umbral: el plan no toca umbrales, `VALOR_DE_REVISION` ni la tabla `RUNNERS`; solo corrige la lectura de stderr, que hace pasar a APPROVE criterios que hoy quedan en REVIEW. ¿El PO confirma que eso es una corrección de lectura y no una ampliación de la autoridad de la compuerta?
- Tickets de SaiOpenCloud cerrados a mano (~40): ¿se dejan como están (recomendado; sus recibos son append-only) o se abre otro ticket para revisarlos?

## Descripción funcional

- Alcance: la captura de la salida del evaluador `command` (`packages/gate-command/src/command.ts`, función `runCommandCheck`) cuando el comando sale con código 0. No cambia la tabla `RUNNERS`, los umbrales, el valor de revisión (`VALOR_DE_REVISION`) ni la autoridad de la compuerta `qa-mechanical`.
- Usuario o rol afectado: el agente o la persona que corre `valmen gate qa-mechanical` en cualquier proyecto cuyo runner imprime el resumen por stderr —Django/unittest (`Ran N tests ... OK`) es el caso visto en SaiOpenCloud—, y el PO que hoy cierra a mano esos tickets.
- Comportamiento actual: un criterio con `<!-- test: ... manage.py test ... -->` cuyo comando sale con 0 y pasa toda la suite recibe `environmentFailure` («la salida no trae el resumen de pruebas de Django; el comando no llegó a ejecutar la suite»), responde 0.5 y la compuerta queda en REVIEW. Además el recibo guarda `stderr` vacío y el sha256 de la cadena vacía, aunque el comando haya escrito en stderr.
- Comportamiento esperado: con salida 0, la clasificación mira stdout y stderr completos, como ya hace con salida distinta de 0; un comando Django que imprime su resumen por stderr y sale con 0 responde 1 y no lleva `environmentFailure`; el recibo guarda la cola, el sha256 y los bytes reales de stderr. Un runner conocido que no imprime su resumen por ningún canal sigue yendo a revisión.

## Diagnóstico

Memoria consultada (`buscar_memoria` «qa-mechanical falla del entorno stderr exit 0 resumen de pruebas Django»): sin antecedentes; AP-002, AP-003, AP-004 y AP-010 no tratan la captura de salida.

- Causa comprobada (con `ruta:línea`): `packages/gate-command/src/command.ts:291` asigna a `stdout` el valor de retorno de `execFileSync`, que con `encoding: "utf8"` devuelve solo stdout; `stderr` se canaliza (`stdio: ["ignore", "pipe", "pipe"]`, `command.ts:297`) pero en la rama de éxito se descarta y la variable queda en `""` (`command.ts:288`). Solo la rama de error (`command.ts:328-329`) lee `error.stdout` y `error.stderr`. La clasificación recibe `${stdout}\n${stderr}` (`command.ts:347`), así que con salida 0 nunca ve stderr. `classifyEnvironmentFailure` (`command.ts:184-202`) busca el runner por la línea (`RUNNERS`, Django en `command.ts:158`, patrón `manage\.py\s+test` y resumen `Ran\s+\d+\s+tests?`) y, sin resumen, devuelve el motivo de `command.ts:199` aunque el código sea el esperado. unittest escribe `Ran N tests in Xs` y `OK` en stderr (su `TextTestRunner` usa `sys.stderr` por omisión), de modo que toda suite Django que pasa cae en revisión. `evaluateWithCommands` traduce ese `environmentFailure` en un criterio a `VALOR_DE_REVISION` = 0.5 (`command.ts:272`, `command.ts:436-438`).
- Hipótesis pendientes: que los ~40 tickets de SaiOpenCloud cerrados a mano lo fueron solo por esta causa no se comprobó recibo por recibo; el pedido lo atribuye a ella y el patrón coincide (los recibos anteriores a la clasificación por resumen pasaban). La revisión de esos recibos queda fuera de alcance.
- Consumidores afectados: `packages/engine/src/evaluators.ts:268` (llama a `evaluateWithCommands` para el evaluador `command` de toda compuerta con checks por comando, entre ellas `qa-mechanical`) y `packages/engine/src/evaluators.ts:111` (`commandResults` que pasan al recibo); `packages/engine/src/gate.ts:55` (tipo `CommandCheck`); `packages/gate/src/receipt.ts:69-85` (copia del tipo `CommandCheckResult` que se serializa en el recibo: `stderr`, `stderrSha256`, `stderrBytes` pasarán a tener contenido real con salida 0); el CLI (`packages/cli`) y el servidor llegan por el motor. Pruebas que lo ejercitan: `tests/comando-fallo-entorno.test.ts` y `tests/evaluators.test.ts`.
- Archivos y flujo investigados: `packages/gate-command/src/command.ts` (`runCommandCheck` 280-367, `classifyEnvironmentFailure` 184-202, `evaluateWithCommands` 380-460), `packages/gate-command/src/index.ts`, `packages/engine/src/evaluators.ts`, `packages/gate/src/receipt.ts`, `tests/comando-fallo-entorno.test.ts` (el ayudante `comando` escribe solo por stdout, por eso ninguna prueba vio el hueco), `.valmen/config.yaml` (`test-commands`, `test-timeout: 420`).
- Riesgos y compatibilidad: el cambio vuelve APPROVE criterios que hoy dan REVIEW solo cuando el resumen del runner está en stderr; no cambia el veredicto de un comando que sale distinto de 0 ni el de un runner sin resumen. Cambiar `execFileSync` por `spawnSync` exige conservar la distinción de arranque fallido (`ENOENT` → `COMMAND_NOT_FOUND`) y tiempo agotado (`ETIMEDOUT`/`SIGTERM` → `COMMAND_TIMEOUT`), que hoy salen del `catch`; si se pierde, un comando inexistente contaría como criterio falso. Los recibos crecen como mucho en la cola acotada de stderr (`tailOf`, `MAX_CAPTURED_OUTPUT`). Los recibos ya emitidos no se reescriben (append-only). Esta compuerta evalúa el código que este ticket modifica: es una decisión del PO cómo se corre la `qa-mechanical` de este mismo ticket (ver Plan).
- Impactos de sync, migración, Docker o despliegue: ninguno; es código del harness, sin datos sincronizados, migraciones, imágenes ni despliegue. Docker solo aparece como el entorno donde SaiOpenCloud corre sus pruebas.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: solo la captura de stdout y stderr en `runCommandCheck` de `packages/gate-command/src/command.ts` y sus pruebas. Exclusiones: la tabla `RUNNERS`, `MENSAJES_DE_ENTORNO`, `VALOR_DE_REVISION`, los umbrales y la autoridad de la compuerta `qa-mechanical`, los recibos ya emitidos y la revisión de los tickets de SaiOpenCloud cerrados a mano.
- Pasos ordenados:
  1. En `packages/gate-command/src/command.ts`, función `runCommandCheck`, reemplazar `execFileSync` por `spawnSync` (de `node:child_process`) con las mismas opciones (`cwd`, `encoding: "utf8"`, `timeout`, `maxBuffer`, `stdio`), y leer `result.stdout` y `result.stderr` en ambos desenlaces, para que la clasificación (`classifyEnvironmentFailure`, llamada en la línea 343) reciba stderr también con salida 0 (C1, C2, C3).
  2. En la misma función, conservar la distinción de arranque y tiempo: `result.error?.code === "ENOENT"` lanza `CommandError` `COMMAND_NOT_FOUND`; `result.error?.code === "ETIMEDOUT"` o `result.signal === "SIGTERM"` lanza `COMMAND_TIMEOUT`; en otro caso `exitCode = result.status ?? 1`, igual que hoy (C5, C6, C7).
  3. En `tests/comando-fallo-entorno.test.ts`, añadir al ayudante `comando` un canal opcional para escribir por `process.stderr`, y añadir pruebas: un comando con `manage.py test` que sale con 0 y escribe `Ran 4 tests in 0.1s\n\nOK` solo por stderr responde 1 en `evaluateWithCommands` (C1); su resultado no lleva `environmentFailure` (C2); el resultado de `runCommandCheck` guarda en `stderr` la cola con `Ran 4 tests` (C3); `stderrBytes` es mayor que 0 (C4); el mismo runner con salida 0 y sin resumen en ningún canal sigue respondiendo 0.5 (C5). Correr `npx vitest run tests/comando-fallo-entorno.test.ts` (C1–C7).
  4. Correr `npx vitest run tests/evaluators.test.ts` para el resto del evaluador por comando (C8) y `npx tsc --noEmit -p tsconfig.json` para el tipado (C9).
  5. Reconstruir con `npm run build` para que el `dist` que usa el CLI tenga el cambio, y dejar al PO la verificación en SaiOpenCloud: la compuerta `qa-mechanical` del CLI sobre un ticket con un criterio `docker compose run --rm -T ... python manage.py test ...` que pasa da APPROVE sin `environmentFailure` (C10).
  6. Entrega: escribir en `## Pruebas` el contrato (comandos de los pasos 3 y 4, cwd el worktree, resultado esperado verde, validación manual del paso 5, requisito Node 24 y Docker en SaiOpenCloud), correr la compuerta `qa-mechanical` del ticket según la decisión del PO en «Supuestos y decisiones pendientes», registrar el consumo de IA, correr `valmen secrets` y mover a `awaiting_user_tests`.
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Rollback (obligatorio): revertir el commit del ticket con `git revert <hash>` y reconstruir con `npm run build`; vuelve la captura con `execFileSync` y el comportamiento previo (REVIEW para suites Django que pasan). No hay datos ni recibos que deshacer: los recibos emitidos con el cambio siguen siendo válidos porque solo añaden stderr real.

## Criterios de aceptación

- [x] C1. Un criterio cuyo comando incluye `manage.py test`, sale con 0 e imprime su resumen solo por stderr responde 1 en `evaluateWithCommands`.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C2. Ese mismo resultado no lleva `environmentFailure`.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C3. Con salida 0, el resultado de `runCommandCheck` guarda en `stderr` la cola de lo que el comando escribió por stderr.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C4. Con salida 0, `stderrBytes` refleja los bytes reales escritos por stderr.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C5. Un runner conocido que sale con 0 sin su resumen en stdout ni en stderr sigue respondiendo 0.5 con `environmentFailure`.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C6. Un comando inexistente en un criterio sigue respondiendo 0.5 sin detener la compuerta.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C7. Un comando que agota el tiempo en un criterio sigue respondiendo 0.5 con el motivo de tiempo máximo.
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] C8. Las pruebas existentes del evaluador por comando siguen pasando.
      <!-- test: npx vitest run tests/evaluators.test.ts -->
- [x] C9. El proyecto compila sin errores de tipos.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C10. En SaiOpenCloud, `valmen gate qa-mechanical` sobre un criterio Django en Docker que pasa da APPROVE sin `environmentFailure`.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de BUGFIX-GATE-COMMAND-STDERR-EXITO-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate-command/src/command.ts",
      "tests/comando-fallo-entorno.test.ts"
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

`runCommandCheck` (`packages/gate-command/src/command.ts`) usa `spawnSync` en lugar de `execFileSync`: lee `stdout` y `stderr` también con salida 0, de modo que la clasificación ve el resumen de Django. Se conserva `COMMAND_NOT_FOUND` (ENOENT) y `COMMAND_TIMEOUT` (ETIMEDOUT/SIGTERM). Pruebas nuevas en `tests/comando-fallo-entorno.test.ts` (ayudante `comando` con canal stderr).

## Pruebas

- Directorio: raíz del worktree/checkout, Node 24.
- `npx vitest run tests/comando-fallo-entorno.test.ts tests/evaluators.test.ts` -> verde (51 pruebas).
- `npx tsc --noEmit -p tsconfig.json` -> sin errores.
- Manual (C10, sin marcar, del PO): tras `npm run build`, en SaiOpenCloud correr `valmen gate qa-mechanical` sobre un ticket con un criterio `docker compose run --rm -T ... python manage.py test ...` que pasa; esperado APPROVE sin `environmentFailure`. Requiere Docker.

- Verificación 2026-10-08 sin Docker (no hay Docker en esta máquina): sobre un registro de laboratorio, una prueba de `python3 -m unittest`, que sale con 0 y escribe `Ran 2 tests … OK` solo por stderr —el mismo mecanismo de Django—, dio `approve` en `valmen gate qa-mechanical --evaluator command` con el binario del checkout principal, sin `environmentFailure`. Queda sin probar el caso con `docker compose run` real en SaiOpenCloud.

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:39214d83d425e9db724d7b737bf5fdb6c6374479",
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
    "reference": "worktree:sha256:b9c4c561d867f28cb66199a1c2bc62653a7113cce9b2f84fd55fd62e1f7fcbcc",
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
    "functional_summary": "El gate qa-mechanical marca falla de entorno a toda suite que pasa porque no lee stderr con exit 0",
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
    "source": "manual: implementación en subagente sonnet, sin números expuestos",
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
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×104, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16627901 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "date": "2026-10-08",
    "at": "2026-10-08T16:16:57.061Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:13:28.233Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:14:31.258Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:32.518Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 3 planes de bugfix con las recomendaciones)\",\"planHash\":\"sha256:c7eb2ca1ef0b80c974cabcf387e6f957f7196539c24b7fcca84230eb9739ddc3\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:32.967Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:c7eb2ca1ef0b80c974cabcf387e6f957f7196539c24b7fcca84230eb9739ddc3."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:32.967Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:21:17.385Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:42.412Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:46.538Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:07.648Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:07.980Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:08.335Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:08.625Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:08.907Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:09.232Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:09.569Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:09.851Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:10.133Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:10.447Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:10.784Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:11.074Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:12.869Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:13.054Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:13.409Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
