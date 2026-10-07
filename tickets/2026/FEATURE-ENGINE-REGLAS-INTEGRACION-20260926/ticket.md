---
schema_version: 2
id: FEATURE-ENGINE-REGLAS-INTEGRACION-20260926
title: Decidir integración automática por cambio y criterios
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
created: 2026-09-26
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-REGLAS-INTEGRACION-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-006: Integración desatendida (commit y push) bajo condiciones — `valmen run` DEBE poder commitear y hacer push sin intervención cuando **todas**
Depende de: FEATURE-GATE-VERIFY-DEV-20260926, FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: las reglas de integración de la jornada (R-JORN-009, mitad de reglas): declarar la rama de trabajo en la configuración, rechazar las ramas de producción, y un módulo que decide si un ticket terminado se puede commitear —rama permitida, árbol limpio al empezar, ningún archivo prohibido en el cambio— y que solo admite las operaciones de git permitidas (nunca push, `--force`, tags ni reinicios destructivos). Fuera de alcance: ejecutar el commit (es `INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926`) y cualquier operación sobre un remoto.
- Usuario o rol afectado: el responsable que deja correr la jornada y necesita que lo entregado quede en una rama de trabajo, ticket por ticket, sin tocar `main` ni publicar nada.
- Comportamiento actual: el despacho entrega tickets en `awaiting_user_tests` sin commitear; no hay rama de trabajo declarada, ni reglas que digan qué se puede commitear, ni una lista de lo que git puede hacer en nombre de la jornada.
- Comportamiento esperado: `execution.work-branch` declara la rama (por defecto `valmen/jornada-<AAAAMMDD>`) y `execution.protected-branches` las que nunca se aceptan (por defecto `main`, `master` y `production`); la configuración que apunta a una rama protegida se rechaza con el mensaje de la clave; `reglasDeIntegracion` devuelve si se puede commitear o la lista de violaciones; y `ejecutarGitPermitido` solo corre `status`, `rev-parse`, `diff`, `add -- <archivos>`, `commit`, `switch` y `checkout -b`, y rechaza todo lo demás.

## Diagnóstico

- Archivos y flujo investigados: la política de ejecución del proyecto se lee en `packages/adapter/src/config.ts` (`readExecutionCapabilities`, clave `execution` con `observation-sources` y `dispatch-executors`) y llega al motor por `packages/engine/src/journey-authorization.ts`; `runAutonomous` (`packages/engine/src/autonomous-run.ts`) y `prepararTicket` (`packages/engine/src/journey-preparation.ts`) revisan el árbol con `git status` pero no tienen reglas de qué se puede commitear; el escáner de secretos para cambios pendientes es `scanPendingChanges` (`packages/engine/src/secrets.ts`) y la política de commits del proyecto está escrita en `AGENTS.md` (sin autocommits, sin `git add -A` sin revisión, `valmen secrets` antes de cada commit).
- Causa raíz o hipótesis: la jornada se diseñó hasta las pruebas del responsable; el commit por ticket es una capacidad nueva y lo que la hace segura son reglas **en código** y una lista cerrada de operaciones de git, no un prompt que pida portarse bien. Comprobado: ninguna referencia a `work-branch`, a ramas protegidas ni a una lista de operaciones permitidas en `packages/*/src`.
- Riesgos y compatibilidad: las claves nuevas están dentro de `execution`, que ya existe, son opcionales y no cambian a los proyectos que no las declaran; el módulo no ejecuta commits ni toca remotos, solo decide y expone el ejecutor de git restringido. Consumidores comprobados con búsqueda: `readExecutionCapabilities` lo llaman `packages/engine/src/journey-authorization.ts` y `packages/server/src/politicas.ts`, que no leen las claves nuevas; no hay llamadores de una lista de operaciones de git porque no existe. Las reglas de pantalla quedan para el ticket que integra.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la configuración de la rama de trabajo y de las ramas protegidas, las reglas de integración y el ejecutor de git restringido. Exclusiones: el commit mismo, el remoto y la integración con la jornada.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` agregar `readIntegrationConfig(config)` que lee `execution.work-branch` (patrón `^[A-Za-z0-9._/<>-]+$`, con `<AAAAMMDD>` opcional y defecto `valmen/jornada-<AAAAMMDD>`) y `execution.protected-branches` (defecto `main`, `master`, `production`), y falla con el mensaje de la clave si la rama de trabajo coincide con una protegida o tiene una forma inválida; agregar `resolveWorkBranch(config, fecha)`.
  2. Crear `packages/engine/src/integration-rules.ts` con `reglasDeIntegracion({ root, ticketId, ramaActual, ramaDeTrabajo, estadoDelArbol, archivosCambiados })` que devuelve `permitido` o la lista de violaciones: rama distinta de la de trabajo o protegida, árbol sucio al empezar el ticket, archivos prohibidos en el cambio (`.env`, credenciales, `.valmen/config.yaml`, `.valmen/routing.yaml`, lo que está fuera del proyecto) y secretos detectados.
  3. En el mismo módulo agregar `ejecutarGitPermitido(root, argumentos, ejecutor?)` con una lista cerrada de operaciones (`status`, `rev-parse`, `diff`, `add -- <archivos>`, `commit`, `switch` y `checkout -b`) que rechaza `push`, `--force` y `-f`, `tag`, `reset --hard`, `clean`, `rebase`, `branch -D`, `add -A` y `add .`, y cualquier operación fuera de la lista, con el motivo; exportarlo desde `packages/engine/src/index.ts`.
  4. Crear `tests/reglas-integracion.test.ts` con: la rama de trabajo por defecto y la resolución con fecha, el rechazo de `main`, `master`, `production` y de una rama configurada como protegida, la forma inválida, las violaciones por rama, árbol sucio y archivos prohibidos, el árbol limpio en una rama de trabajo que sí pasa, y el ejecutor de git que acepta lo permitido y rechaza push, force, tags y los demás; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; las claves son opcionales y el módulo nuevo no lo llama todavía ningún flujo.

## Criterios de aceptación

- [x] La rama de trabajo se declara en `execution.work-branch`, con defecto `valmen/jornada-<AAAAMMDD>`, y se resuelve con la fecha
      <!-- test: npx vitest run tests/reglas-integracion.test.ts -->
- [x] Una configuración cuya rama de trabajo es `main`, `master`, `production` o una protegida se rechaza con el mensaje de la clave
      <!-- test: npx vitest run tests/reglas-integracion.test.ts -->
- [x] Las reglas rechazan un commit en una rama que no es la de trabajo, con el árbol sucio al empezar o con archivos prohibidos, y listan cada violación
      <!-- test: npx vitest run tests/reglas-integracion.test.ts -->
- [x] El ejecutor de git nunca admite push, `--force`, tags ni reinicios destructivos, y dice el motivo
      <!-- test: npx vitest run tests/reglas-integracion.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-REGLAS-INTEGRACION-20260926",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/engine/src/integration-rules.ts",
      "packages/engine/src/index.ts",
      "tests/reglas-integracion.test.ts"
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

- `packages/adapter/src/config.ts`: `readIntegrationConfig` (`execution.work-branch`, por defecto `valmen/jornada-<AAAAMMDD>`, y `execution.protected-branches`, por defecto `main`, `master` y `production`), `resolveWorkBranch` y las constantes por defecto. Falla con el mensaje de la clave si la rama de trabajo es una protegida —también si la plantilla se resuelve hoy a una— o tiene una forma inválida.
- `packages/engine/src/integration-rules.ts` (nuevo): `reglasDeIntegracion` (rama de trabajo o protegida, árbol limpio al empezar, archivos prohibidos —credenciales, la configuración y el enrutamiento del harness, rutas fuera del proyecto—, secretos; acumula todas las violaciones), `motivoDeGitProhibido` y `ejecutarGitPermitido` (lista cerrada: `status`, `rev-parse`, `diff`, `add -- <archivos>`, `commit`, `switch` y `checkout -b`; rechaza push, force, tags, reinicios destructivos, `--amend`, `--no-verify` y `add -A`/`.` antes de lanzar nada). No ejecuta commits ni toca remotos.
- `tests/reglas-integracion.test.ts` (nuevo, 26 pruebas).
- Nota para el responsable: el requisito heredado del ticket (R-S5-006 de `evolucion-harness`) hablaba de «commit y push»; el requisito vigente de esta feature (R-JORN-009) prohíbe el push, y aquí se implementó este último: ningún camino de la jornada puede publicar.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red ni tocar ningún repositorio:

1. `npx vitest run tests/reglas-integracion.test.ts` — esperado: 26 pruebas pasan.
2. `npx vitest run` — esperado: 179 archivos pasan y 1 omitido; 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2605 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:70457c558a8f9332b177dab3d13728ceb0f62694",
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
    "description": "npx vitest run (2605 pasan), tsc sin errores",
    "reference": "worktree:sha256:8f4687947d64d770ef485256417e18c6b1f7100dd960d555486dca869e0ff832",
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
    "technical_summary": "readIntegrationConfig, reglasDeIntegracion y ejecutarGitPermitido con lista cerrada de operaciones.",
    "functional_summary": "La rama de trabajo se declara y se protege de producción, y está escrito en código qué se puede commitear y qué git puede hacer una jornada.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguno"
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:54.479Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:56:14.549Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:56:38.422Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:2d6c86ab173b540a759c2bfaf4dae2f32b1fbbf7bd4ae965bc83c6b59f452b76\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:56:38.574Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:2d6c86ab173b540a759c2bfaf4dae2f32b1fbbf7bd4ae965bc83c6b59f452b76."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:56:38.574Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:56:38.663Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.370Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.469Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.559Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.649Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.735Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.820Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:22.953Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.119Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.204Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.285Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.372Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.460Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.542Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.626Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:58:23.712Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
