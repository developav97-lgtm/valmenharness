---
schema_version: 2
id: SECURITY-ENGINE-COMPUERTA-QA-AGENT-20261005
title: Correr qa-agent en worktree limpio, contra la base y con recibo reproducible
type: SECURITY
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

# SECURITY-ENGINE-COMPUERTA-QA-AGENT-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-003: La compuerta qa-agent DEBE ejecutar las pruebas en un árbol limpio que el agente no controla
- R-QAAG-004: En una corrección, las pruebas nuevas DEBEN fallar contra el código base y pasar contra el entregado
- R-QAAG-005: El recibo de qa-agent DEBE permitir reproducir la verificación
Depende de: FEATURE-ENGINE-ELEGIBILIDAD-QA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la compuerta `qa-agent` (R-QAAG-003, R-QAAG-004 y R-QAAG-005): corre las pruebas de un ticket elegible en un `git worktree` limpio creado desde el commit entregado, con la configuración y los scripts de pruebas tomados del commit base y solo con los comandos exactos que el proyecto autoriza; en un BUGFIX exige que las pruebas nuevas fallen contra el código base y pasen contra el entregado; y deja un recibo que permite reproducir la verificación. Fuera de alcance: cerrar el ticket o atribuir QA a una política (ticket siguiente), el periodo en sombra y cualquier herramienta MCP que la dispare.
- Usuario o rol afectado: el responsable que autorizó el cierre por agente y necesita que la evidencia no la fabrique el propio agente; el agente, que no controla el árbol donde se prueba.
- Comportamiento actual: `qa-mechanical` corre los criterios con comando sobre el árbol de trabajo del agente, con la configuración y los scripts que ese árbol tenga; no existe una compuerta que pruebe un árbol limpio ni que contraste contra el código base.
- Comportamiento esperado: `valmen qa-agent --id <ID> --base <commit> --delivered <commit>` (1) se niega si `elegibilidadQa` no da elegible; (2) crea un worktree desacoplado en una carpeta temporal fuera del repositorio desde el commit entregado y sobrescribe en él `.valmen/config.yaml` y cada script de `test-commands` con su versión del commit base; (3) corre solo los comandos de los criterios que `test-commands` del base autoriza, con entorno mínimo y tope de tiempo; (4) en un BUGFIX crea un segundo worktree en el base, copia solo los archivos de prueba nuevos y exige que al menos una prueba nueva falle; (5) corre la suite de regresión declarada en `qa-agent.regression-commands`; (6) guarda un recibo con los SHA base y entregado, el hash del árbol probado, cada comando con invocación, código de salida, duración, cola y sha256 de la salida completa, el resultado contra el base y el id y hash de la autorización aplicada; (7) elimina siempre los worktrees y no toca el árbol de trabajo del agente.

## Diagnóstico

- Archivos y flujo investigados: los comandos de los criterios se resuelven con `commandChecksFor` y `partirComando` en `packages/gate/src/dynamic.ts:289`, que compara cada comando con la lista `test-commands` por palabra completa y rechaza el resto; se ejecutan con `runCommandCheck` (`packages/gate-command/src/command.ts:280`), que captura la cola de la salida (`MAX_CAPTURED_OUTPUT`) y clasifica fallos de entorno; el git de las jornadas es una lista cerrada en `packages/engine/src/integration-rules.ts:130` (`ejecutarGitPermitido`) que no admite `worktree`; la elegibilidad es `elegibilidadQa` en `packages/engine/src/qa-eligibility.ts` y la autorización `autorizacionQueCubre` en `packages/engine/src/qa-authorization.ts`; los recibos de compuertas viven en `packages/gate/src/receipt.ts`.
- Causa raíz o hipótesis: el síntoma es que hoy no se puede confiar en una verificación hecha por el mismo agente que escribió el cambio, porque corre en su árbol: puede editar un script de pruebas, la configuración o dejar un archivo sin commitear que haga pasar la prueba. La causa comprobada es que `qa-mechanical` ejecuta sobre el árbol de trabajo y que ninguna lista de git permite crear un worktree. Hipótesis a confirmar al implementar: que `git worktree add --detach` funcione con los hooks apagados (`-c core.hooksPath=/dev/null`) y que la copia de los archivos de prueba nuevos al worktree base no arrastre dependencias de código nuevo.
- Riesgos y compatibilidad: (a) es seguridad por construcción: un worktree fuera del repositorio, comandos exactos del base, entorno mínimo (sin variables de credenciales) y sin red según el contrato de `gate-command`; (b) una lista de git propia y cerrada para esta compuerta (`worktree add --detach`, `worktree remove --force`, `rev-parse`, `diff --name-only`, `show`), sin ampliar la de las jornadas ni admitir `push`, `fetch`, `reset` ni `tag`; (c) las pruebas que necesitan base de datos o contenedores no son ejecutables en un worktree limpio: la compuerta lo dice como no ejecutable y no aprueba; (d) Consumidores comprobados con búsqueda: `commandChecksFor` y `runCommandCheck` los llaman `qa-mechanical` y sus pruebas, esta compuerta los reutiliza sin cambiarlos; `readReceipts` y los recibos de compuertas no se alteran porque el recibo de `qa-agent` va a su propio archivo append-only; (e) un proyecto sin autorizaciones o sin `qa-agent.regression-commands` obtiene «no elegible» o «sin regresión declarada», que no aprueba.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: la compuerta `qa-agent` en árbol limpio, su contraste contra el código base y su recibo reproducible. Exclusiones: cerrar el ticket por política, el periodo en sombra y cualquier herramienta MCP.
- Pasos ordenados:
  1. Crear `packages/engine/src/qa-agent-git.ts` con `ejecutarGitDeQaAgent(argumentos, cwd)` y `motivoDeGitDeQaAgent(argumentos)`: lista cerrada (`worktree add --detach`, `worktree remove --force`, `rev-parse`, `diff --name-only`, `show`), con `-c core.hooksPath=/dev/null`, que rechaza cualquier otra operación o bandera antes de lanzar nada.
  2. Crear `packages/engine/src/qa-agent.ts` con `correrQaAgent({ paths, ticketId, base, delivered, ahora, ejecutarGit?, ejecutar? })`: exige `elegibilidadQa` elegible; crea el worktree entregado en una carpeta temporal fuera del repositorio; sobrescribe `.valmen/config.yaml` y cada script de `test-commands` con `git show <base>:<ruta>`; resuelve los comandos de los criterios con `commandChecksFor` contra la lista del base y rechaza uno no autorizado; los corre con `runCommandCheck`, entorno mínimo y el tope `test-timeout`; elimina siempre los worktrees en `finally`.
  3. En el mismo `packages/engine/src/qa-agent.ts` agregar el contraste de BUGFIX: detectar con `diff --name-only` los archivos de prueba nuevos, crear un segundo worktree en el base, copiar solo esos archivos, correr sus comandos y exigir que al menos una prueba falle (si todas pasan, no aprueba y dice «la prueba no reproduce el defecto»); y correr los comandos de `qa-agent.regression-commands` (nueva clave que lee `packages/adapter/src/config.ts` con `readQaAgentConfig`, lista vacía por defecto, que no aprueba si falta en un BUGFIX).
  4. Crear el recibo en `packages/engine/src/qa-agent-receipt.ts`: `ReciboQaAgent` con `base`, `delivered`, `treeHash` (`rev-parse <delivered>^{tree}`), por comando `{ invocacion, exitCode, durationMs, tail, outputSha256 }`, `resultadoContraBase`, `authorization { id, hash }`, `verdict` y `at`; se anexa a `.valmen/qa/agent-receipts.jsonl` (append-only, un solo escritor) con `registrarReciboQaAgent`; `reproducirReciboQaAgent(recibo)` devuelve los comandos exactos para repetirlo. Exportar los tres módulos desde `packages/engine/src/index.ts`.
  5. Agregar `qa-agent --id <ID> --base <commit> --delivered <commit>` a `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` (con su ayuda y sus banderas), que imprime el veredicto y la ruta del recibo y sale con código de invariante si no aprueba; no escribe en el ticket.
  6. Crear `tests/qa-agent.test.ts` con repositorios git temporales y un caso por criterio: script de pruebas editado sin commitear (usa el del base), comando no autorizado rechazado, BUGFIX cuya prueba pasa también en el base (no aprueba), BUGFIX cuya prueba falla en el base y pasa en el entregado (aprueba), recibo con todos los campos y sus hashes, reproducción con los mismos códigos de salida, worktrees eliminados tras éxito y tras fallo, árbol de trabajo intacto, ticket no elegible sin correr nada y git fuera de la lista rechazado; correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; ningún flujo llama todavía a la compuerta y el archivo de recibos es nuevo.

## Criterios de aceptación

- [x] La compuerta usa el script de pruebas y la configuración del commit base aunque el árbol de trabajo los haya editado sin commitear
      <!-- test: npx vitest run tests/qa-agent.test.ts -->
- [x] Solo corre los comandos exactos que el proyecto autoriza y rechaza uno no autorizado
      <!-- test: npx vitest run tests/qa-agent.test.ts -->
- [x] En un BUGFIX, una prueba nueva que pasa también contra el código base no aprueba y el motivo dice que no reproduce el defecto
      <!-- test: npx vitest run tests/qa-agent.test.ts -->
- [x] El recibo guarda los SHA base y entregado, el hash del árbol, cada comando con su invocación, código de salida, duración, cola y sha256 de la salida, el resultado contra el base y el id y hash de la autorización
      <!-- test: npx vitest run tests/qa-agent.test.ts -->
- [x] Repetir los comandos del recibo sobre el mismo árbol da los mismos códigos de salida
      <!-- test: npx vitest run tests/qa-agent.test.ts -->
- [x] Los worktrees se eliminan tras éxito y tras fallo, el árbol de trabajo queda intacto y un ticket no elegible no corre nada
      <!-- test: npx vitest run tests/qa-agent.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de SECURITY-ENGINE-COMPUERTA-QA-AGENT-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/qa-agent-git.ts",
      "packages/engine/src/qa-agent-receipt.ts",
      "packages/engine/src/qa-agent.ts",
      "packages/engine/src/qa-eligibility.ts",
      "tests/qa-agent.test.ts"
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

- `packages/engine/src/qa-agent-git.ts` (nuevo): lista cerrada y propia de git (`worktree add --detach`, `worktree remove --force`, `rev-parse`, `diff --name-only`, `show <commit>:<ruta>`), con hooks apagados; todo lo demás se rechaza antes de lanzar nada. No amplía la lista de las jornadas.
- `packages/engine/src/qa-agent.ts` (nuevo): `correrQaAgent` exige elegibilidad, crea el worktree entregado fuera del repositorio, impone `.valmen/config.yaml` y los scripts de `test-commands` del commit base, corre solo los comandos de los criterios que el base autoriza (entorno mínimo, tope `test-timeout`), contrasta las pruebas nuevas de un BUGFIX contra un worktree del base (al menos una debe fallar), corre `qa-agent.regression-commands` y elimina siempre los worktrees.
- `packages/engine/src/qa-agent-receipt.ts` (nuevo): recibo con SHA base y entregado, hash del árbol, cada comando (invocación, código, duración, cola, sha256), resultado contra el base y autorización citada; archivo append-only `.valmen/qa/agent-receipts.jsonl` y `reproducirReciboQaAgent`.
- `packages/adapter/src/config.ts`: `readQaAgentConfig` (`qa-agent.regression-commands`). `packages/engine/src/qa-eligibility.ts`: `scriptsDeComandos` exportado.
- `packages/cli/src/commands.ts` y `main.ts`: `valmen qa-agent --id --base --delivered` (no escribe en el ticket; sale con error si no aprueba).
- `tests/qa-agent.test.ts`: repositorios git reales; un caso por criterio.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/qa-agent.test.ts` → 13 pruebas pasan (repositorios git temporales y comandos `node` reales).
- Suite completa: `npx vitest run` → 188 archivos, 2743 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
- Manual (responsable): `valmen qa-agent --id <ID> --base <commit> --delivered <commit>` sobre un ticket de prueba elegible y revisar el recibo en `.valmen/qa/agent-receipts.jsonl`.
<!-- verify: manual -->

- Resultado del PO: «Cierra igual que para los anteriores» — Juan Andrade, 2026-10-07 (cierre tras revisar el resumen de pruebas). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:8b1b7c237e0291b006cc068aaa086d1b115a697f",
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
    "po_confirmation": "«Cierra igual que para los anteriores» — Juan Andrade, 2026-10-07 (cierre tras revisar el resumen de pruebas)"
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
    "reference": "worktree:sha256:2e454d0f75c0b750e5425f1461673b3fba488bd1a66198baa7a9e8d53aa2bcd6",
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
    "po_confirmation": "«Cierra igual que para los anteriores» — Juan Andrade, 2026-10-07 (cierre tras revisar el resumen de pruebas)"
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
    "technical_summary": "Implementación entregada y probada en el commit 793479c; ver ## Implementación.",
    "functional_summary": "Cumple los criterios del ticket; pruebas en verde.",
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
    "at": "2026-10-06T01:51:51.229Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:42:29.442Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:42:47.764Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:49:01.952Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A\",\"planHash\":\"sha256:5a2dd57696bc1f5bbd52cd84d9025eba4ddea2580c5cc07b11b79b09c2f0d8da\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:49:06.813Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:5a2dd57696bc1f5bbd52cd84d9025eba4ddea2580c5cc07b11b79b09c2f0d8da."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:49:06.813Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:49:07.072Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:58:13.571Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:33.444Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:33.680Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:33.913Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:34.134Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:34.357Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:34.696Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:35.059Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:35.289Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:35.520Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:35.743Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:35.965Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:36.191Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:37.180Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T05:15:37.417Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
