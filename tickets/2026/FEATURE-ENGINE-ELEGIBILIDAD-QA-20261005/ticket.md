---
schema_version: 2
id: FEATURE-ENGINE-ELEGIBILIDAD-QA-20261005
title: Decidir en código la elegibilidad para QA por agente
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
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-ELEGIBILIDAD-QA-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-002: La elegibilidad para QA por agente DEBE decidirse en código
Depende de: SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: decidir **en código** si un ticket es elegible para QA por agente (R-QAAG-002): una función pura que, con el ticket, la autorización persistida y el diff entregado, devuelve si es elegible o la lista de reglas que no cumple, cada una con su motivo; el cupo diario de la autorización; y el comando `valmen qa-eligibility --id <ID>` que lo muestra. Fuera de alcance: correr la compuerta `qa-agent`, el árbol limpio, cerrar el ticket por política y el periodo en sombra (tickets siguientes de S6).
- Usuario o rol afectado: el responsable que autorizó una política de cierre por agente y necesita saber, ticket por ticket, por qué cumple o no; y el agente, que no decide su propia elegibilidad.
- Comportamiento actual: no existe una elegibilidad para QA por agente; la elegibilidad del run autónomo (`packages/engine/src/autonomous-run.ts`) decide qué ticket se ejecuta, no cuál se puede cerrar sin una persona, y la autorización persistida (ticket anterior) solo se guarda y se consulta.
- Comportamiento esperado: un ticket es elegible solo si: (1) una autorización vigente cubre su tipo y su módulo y queda cupo hoy; (2) su tipo es `BUGFIX`, `IMPROVEMENT`, `CHORE` o `FEATURE`, nunca `SECURITY`, `SYNC`, `INTEGRATION` ni `AGENT`, aunque la autorización los listara; (3) su riesgo es `normal` o menor y no declara impactos de sincronización, migración ni contenedores; (4) todos sus criterios se verifican por comando (`test:`) o por petición (`http:`), y uno `manual` o `dev` lo vuelve no elegible nombrando el criterio; (5) el diff no toca pantallas, migraciones, configuración de despliegue, autenticación, CI, `.valmen/` ni los scripts que corren las pruebas; (6) no tiene puntos abiertos ni reapertura previa, y `valmen secrets` y `valmen drift` están limpios. La decisión no consulta a ningún modelo y cita el id de la autorización que la respalda.

## Diagnóstico

- Archivos y flujo investigados: la autorización persistida y `autorizacionQueCubre` están en `packages/engine/src/qa-authorization.ts` (ticket anterior); los criterios se leen con `extractCriteriaSpecs` y `criterioDeclarado` en `packages/gate/src/dynamic.ts`, que ya reconoce `test:`, `verify:` y `http:`; los puntos abiertos se leen del bloque `Puntos` del ticket con `BLOCKING_POINT_STATES` (`packages/core/src/contract.ts:190`); la reapertura queda en el bloque `QA` y en los eventos del ticket; el escáner de secretos es `scanPendingChanges` (`packages/engine/src/secrets.ts:250`) y el de drift `scanDrift` (`packages/engine/src/drift.ts:310`); el diff entregado se obtiene con la lista cerrada de git (`ejecutarGitPermitido`, `packages/engine/src/integration-rules.ts`), que admite `diff`; la elegibilidad del run autónomo vive en `packages/engine/src/autonomous-run.ts` y no se toca.
- Causa raíz o hipótesis: la seguridad de cerrar sin una persona no está en que el agente prometa portarse bien sino en que **cada condición se compruebe en código y sea auditable**; falta la pieza que reúne las seis condiciones en una sola decisión con motivos. Comprobado: ninguna función del motor decide algo parecido y el único sitio que lee la autorización es su propio módulo. El cupo diario necesita un registro de usos que no existe: se agrega uno append-only junto al de autorizaciones.
- Riesgos y compatibilidad: una elegibilidad demasiado laxa habilita cerrar lo que no se debe, por eso cada regla es conservadora y la lista de rutas prohibidas es explícita y probada una por una; por ser un cambio sobre cómo se cierran tickets sin persona, la decisión no aprueba nada por sí sola (solo dice si se puede intentar) y el cierre por política es otro ticket. Consumidores comprobados con búsqueda: `autorizacionQueCubre` y `autorizacionesVigentes` solo los llaman sus pruebas; `scanDrift` lo llaman `packages/cli/src/commands.ts` y sus pruebas, y `scanPendingChanges` lo llaman `packages/engine/src/autonomous-run.ts`, `packages/engine/src/integration-commit.ts` y el CLI; esta función los consume sin cambiarlos. Un proyecto sin autorizaciones obtiene «no elegible» con el motivo de qué falta, que es el comportamiento apagado por defecto.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la elegibilidad en código con sus seis reglas, el cupo diario y el comando que la muestra. Exclusiones: la compuerta `qa-agent`, el cierre por política y el periodo en sombra.
- Pasos ordenados:
  1. En `packages/engine/src/qa-authorization.ts` agregar el registro de usos `.valmen/qa/uses.jsonl` con `registrarUsoDeCupo({ root, authorizationId, ticketId, ahora })` y `cupoRestante(root, autorizacion, ahora)`, que cuenta los usos del día (UTC) contra `dailyQuota`.
  2. Crear `packages/engine/src/qa-eligibility.ts` con `rutaProhibidaParaQaAgente(ruta, scriptsDePrueba)` (pantallas, migraciones, configuración de despliegue, autenticación, CI, `.valmen/` y los scripts que corren las pruebas), `archivosDelDiff(root, base, ejecutor?)` (con `git diff --name-only` por la lista cerrada) y `elegibilidadQa({ paths, ticketId, ahora, archivosDelDiff, secretos?, drift? })`, que evalúa las seis reglas **sin ningún modelo**, devuelve `elegible` o la lista `{ regla, detalle }` completa (no solo la primera) y, si es elegible, el id y el hash de la autorización que la respalda.
  3. Agregar a `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` el comando `qa-eligibility --id <ID> [--base <commit>]` que imprime cada regla con su resultado y sale con código de invariante si el ticket no es elegible, con su ayuda y la bandera declarada.
  4. Crear `tests/elegibilidad-qa.test.ts` con un caso por regla: un criterio `manual` o `dev` nombra el criterio, cada ruta prohibida (pantalla, migración, despliegue, autenticación, CI, `.valmen/`, script de pruebas) hace no elegible nombrando el archivo, sin autorización o sin cupo no es elegible, `SECURITY`, `SYNC`, `INTEGRATION` y `AGENT` no lo son aunque la autorización los listara, el riesgo alto y los impactos lo impiden, un punto abierto, una reapertura previa, un secreto y un drift lo impiden, un ticket que cumple todo es elegible y cita la autorización, y la decisión no usa ningún modelo ni cambia entre corridas; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la elegibilidad no la llama ningún flujo todavía y el registro de usos es un archivo nuevo.

## Criterios de aceptación

- [x] Un ticket con un criterio `manual` o `dev` no es elegible y el motivo nombra el criterio
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts -->
- [x] Un diff que toca pantallas, migraciones, despliegue, autenticación, CI, `.valmen/` o un script de pruebas no es elegible y el motivo nombra el archivo
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts -->
- [x] Sin una autorización vigente que cubra su tipo y su módulo, o sin cupo diario, no es elegible
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts -->
- [x] `SECURITY`, `SYNC`, `INTEGRATION` y `AGENT`, el riesgo alto y los impactos de sincronización, migración o contenedores no son elegibles aunque la autorización los cubriera
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts -->
- [x] Un punto abierto, una reapertura previa, un secreto o un drift lo vuelven no elegible
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts -->
- [x] Un ticket que cumple todas las reglas es elegible, cita la autorización que lo respalda y la decisión no consulta a ningún modelo
      <!-- test: npx vitest run tests/elegibilidad-qa.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-ELEGIBILIDAD-QA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/qa-authorization.ts",
      "packages/engine/src/qa-eligibility.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "tests/elegibilidad-qa.test.ts"
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

- `packages/engine/src/qa-eligibility.ts` (nuevo): `elegibilidadQa` evalúa en código, sin modelo, las reglas de R-QAAG-002: autorización vigente y cupo diario, tipo (SECURITY/SYNC/INTEGRATION/AGENT nunca), riesgo e impactos, criterios solo `test:`/`http:`, diff sin rutas prohibidas (pantallas, migraciones, despliegue, autenticación, CI, `.valmen/`, scripts de pruebas de `test-commands`), puntos abiertos, reapertura, secretos y drift. Devuelve todas las reglas con su motivo y cita `{id, hash}` de la autorización.
- `packages/engine/src/qa-authorization.ts`: cupo diario (`registrarUsoDeCupo`, `cupoRestante`, `.valmen/qa/uses.jsonl`).
- `packages/engine/src/index.ts`, `packages/cli/src/commands.ts`, `packages/cli/src/main.ts`: export y comando `valmen qa-eligibility --id [--base]`.
- `tests/elegibilidad-qa.test.ts`: un caso por regla y por categoría de ruta.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/elegibilidad-qa.test.ts` → 33 pruebas pasan.
- Suite completa: `npx vitest run` → 185 archivos, 2706 pruebas pasan, 48 omitidas.
- `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
<!-- verify: manual -->

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:b4696771872b08ad35f264a28f8acd7b39da36f1",
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
    "reference": "worktree:sha256:33cf09f4f74245e8be346f60c2c0058a2c2fa12c0072a6157661a343ae671131",
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
    "technical_summary": "Regla de elegibilidad pura en engine con cupo diario y comando de CLI.",
    "functional_summary": "Un ticket solo es elegible para QA por agente si cumple todas las reglas, y cada incumplimiento se nombra.",
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
    "at": "2026-10-06T01:51:51.161Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:26:09.852Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:26:25.789Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:26:50.696Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:3d0e30807009a6a11bd2c8f09eaa638655b8a3dd89dff02eb9b9bb86153476d7\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:26:50.831Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:3d0e30807009a6a11bd2c8f09eaa638655b8a3dd89dff02eb9b9bb86153476d7."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:26:50.831Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:26:50.918Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:26.939Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.069Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.157Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.248Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.332Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.417Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.585Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.776Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.861Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:27.948Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:28.032Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:28.117Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:28.204Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:28.290Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T04:30:28.377Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
