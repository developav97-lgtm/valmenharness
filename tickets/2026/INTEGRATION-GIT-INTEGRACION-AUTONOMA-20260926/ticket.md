---
schema_version: 2
id: INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926
title: Hacer commit y push solo bajo condiciones seguras
type: INTEGRATION
module: GIT
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

# INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-006: Integración desatendida (commit y push) bajo condiciones — `valmen run` DEBE poder commitear y hacer push sin intervención cuando **todas**
Depende de: FEATURE-ENGINE-REGLAS-INTEGRACION-20260926, SECURITY-ENGINE-PARADA-SEGURA-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: que cada ticket que termina su ejecución en una jornada quede en **su propio commit**, en la rama de trabajo, solo con los archivos atribuibles al ticket y correspondiendo al árbol que se probó (R-JORN-009, mitad de integración): asegurar la rama de trabajo, exigir el árbol limpio al empezar cada ticket, commitear tras `qa-mechanical` en verde con las reglas del ticket anterior y comprobar que el commit contiene exactamente el árbol probado. Fuera de alcance: cualquier push o publicación —el título histórico del ticket nombraba el push, pero el requisito vigente lo prohíbe y la regla del responsable es que solo se hace cuando él lo ordena—, tags y la integración con ramas de producción.
- Usuario o rol afectado: el responsable que revisa lo que la jornada entregó, ticket por ticket, y quiere un historial que se pueda revertir de a uno.
- Comportamiento actual: la ejecución de la jornada deja el ticket en `awaiting_user_tests` con los cambios sin commitear; el segundo ticket de una jornada se ejecuta sobre un árbol que ya trae los cambios del primero, y no hay forma de saber qué cambio es de cuál.
- Comportamiento esperado: antes de despachar un ticket, el árbol está limpio y en la rama de trabajo (se crea o se cambia a ella si hace falta); tras `qa-mechanical` en verde y el paso a `awaiting_user_tests`, el motor aplica las reglas, agrega los archivos explícitos del ticket —los funcionales que cambió, su ticket, sus recibos y el índice—, hace un commit y verifica que su contenido es el árbol probado; el segundo ticket arranca con el árbol limpio; con la rama de trabajo en `main` la configuración ya se rechazó; y nada en el camino hace push, `--force` ni tags.

## Diagnóstico

- Archivos y flujo investigados: `runAutonomous` (`packages/engine/src/autonomous-run.ts`) mueve el ticket, lanza el ejecutor, corre `qa-mechanical` y lo deja en `awaiting_user_tests`; `dispatchJourney` (`packages/engine/src/journey-dispatch.ts`) reserva capacidad y lo invoca; `reglasDeIntegracion`, `motivoDeGitProhibido` y `ejecutarGitPermitido` (`packages/engine/src/integration-rules.ts`, ticket anterior) deciden qué se puede commitear y qué git se puede lanzar; la rama de trabajo sale de `readIntegrationConfig` (`packages/adapter/src/config.ts`); el hash del contenido de los archivos que respalda la evidencia de QA se calcula con `calculateWorktreeReference` (`packages/engine/src/references.ts:150`) y se compara contra el commit con `hashArbolDeCommit` (`packages/engine/src/append.ts`), con el mismo encuadre de ruta y contenido.
- Causa raíz o hipótesis: la jornada se construyó hasta las pruebas del responsable y no tiene el paso que fija lo probado en un commit; sin él, lo que se probó y lo que queda en disco pueden divergir sin que nadie lo vea. Comprobado: ningún flujo del motor hace `git add` ni `git commit`. El «árbol probado» se fija con un hash del contenido de los archivos cambiados calculado **antes** de correr `qa-mechanical` y repetido sobre el contenido del commit.
- Riesgos y compatibilidad: es opt-in por el contexto de la jornada: `valmen run` suelto y los proyectos que no son un repositorio git conservan su comportamiento, porque el despacho solo pasa el contexto de integración cuando hay `.git`. Los archivos de estado del propio harness que cambian al despachar (`.valmen/journeys/`, el registro de avisos, las paradas y las aprobaciones de procesos) no cuentan para el árbol limpio ni se commitean: no son del ticket. Un rechazo de las reglas, un árbol que cambió tras la prueba o una verificación del commit que no coincide dejan una parada con su motivo y no commitean nada. Consumidores comprobados con búsqueda: `runAutonomous` lo llaman `packages/engine/src/journey-dispatch.ts`, `packages/cli/src/run.ts` y `tests/autonomous-run.test.ts`; el parámetro nuevo es opcional y las llamadas actuales no cambian.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la rama de trabajo asegurada, el árbol limpio al empezar, el commit por ticket con verificación del árbol probado y su integración en el despacho. Exclusiones: push, tags, ramas de producción y la revisión de código.
- Pasos ordenados:
  1. Crear `packages/engine/src/integration-commit.ts` con `estadoDelArbolDeTrabajo(root, ejecutor?)` (archivos cambiados leídos de `git status --porcelain -uall`, sin las rutas de estado del harness), `asegurarRamaDeTrabajo({ root, ramaDeTrabajo, ramasProtegidas, ejecutor? })` (cambia o crea la rama con `switch` solo si el árbol está limpio y rechaza si no), `hashDeArchivos(root, archivos)` y `hashDeArchivosEnCommit(root, commit, archivos)` con el mismo encuadre que la evidencia de QA.
  2. En el mismo módulo agregar `integrarTicket({ paths, ticketId, titulo, ramaDeTrabajo, ramasProtegidas, arbolLimpioAlEmpezar, hashProbado, archivosProbados, ejecutor?, secretos? })`: aplica `reglasDeIntegracion`, comprueba que el hash del contenido actual es el probado, agrega con `git add --` solo los archivos funcionales del ticket, su ticket, sus recibos y el índice, hace el commit con un mensaje que cita el ticket y su recibo de `qa-mechanical`, y verifica que el contenido del commit coincide con el hash probado; todo git pasa por `ejecutarGitPermitido`.
  3. En `packages/engine/src/autonomous-run.ts` aceptar `integracion` en `runAutonomous`: antes de lanzar el ejecutor registrar el estado del árbol y el hash de los archivos, y tras pasar a `awaiting_user_tests` llamar a `integrarTicket`; un rechazo o una verificación que no coincide dejan una parada `verification-failed` con el motivo y devuelven `stopped`.
  4. En `packages/engine/src/journey-dispatch.ts` armar el contexto de integración cuando el proyecto es un repositorio git (rama de trabajo resuelta con la fecha de `at` y ramas protegidas de `readIntegrationConfig`), asegurar la rama y rechazar el despacho con el motivo si el árbol no está limpio.
  5. Crear `tests/integracion-autonoma.test.ts` con un repositorio git de laboratorio: dos tickets seguidos dejan dos commits en la rama de trabajo, cada uno con sus archivos y el segundo arranca con el árbol limpio; `main` no recibe commits; un archivo prohibido, un árbol sucio al empezar y un árbol modificado tras la prueba no commitean y dejan parada; el commit coincide con el árbol probado; el repositorio no tiene push, tags ni `--force` en ningún comando lanzado; y un proyecto sin git conserva su comportamiento; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el contexto de integración es opcional y, sin él, el despacho entrega como antes sin commitear.

## Criterios de aceptación

- [x] Dos tickets seguidos en una jornada dejan dos commits en la rama de trabajo, cada uno con sus archivos, y el segundo arranca con el árbol limpio
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [x] `main` no recibe commits y ningún comando lanzado hace push, `--force` ni tags
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [x] El commit contiene exactamente el árbol que se probó; si el contenido cambió después de la prueba no se commitea y queda una parada
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [x] Un archivo prohibido o un árbol sucio al empezar impiden el commit o el despacho y lo dicen
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->
- [x] Un proyecto que no es un repositorio git conserva su comportamiento sin commits
      <!-- test: npx vitest run tests/integracion-autonoma.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/integration-commit.ts",
      "packages/engine/src/autonomous-run.ts",
      "packages/engine/src/journey-dispatch.ts",
      "packages/engine/src/index.ts",
      "tests/integracion-autonoma.test.ts"
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

- `packages/engine/src/integration-commit.ts` (nuevo): `estadoDelArbolDeTrabajo` (sin el estado del propio harness: journeys, ejecuciones, avisos, paradas y corridas de procesos), `ramaActual`, `asegurarRamaDeTrabajo` (cambia o crea la rama con `switch` solo con el árbol limpio), `hashDeArchivos` y `hashDeArchivosEnCommit` (mismo encuadre que la evidencia de QA), `repartirCambios` (funcionales, del registro del ticket y ajenos) e `integrarTicket` (aplica las reglas, rechaza archivos de otro ticket, comprueba que el contenido es el probado, agrega solo archivos explícitos, hace el commit citando el ticket y el recibo de `qa-mechanical`, y verifica que el contenido del commit es el árbol probado). Todo lo que escribe pasa por `ejecutarGitPermitido`: no hay push, `--force`, tags ni `add -A`.
- `packages/engine/src/autonomous-run.ts`: con el contexto `integracion`, `runAutonomous` asegura la rama y exige el árbol limpio antes de mover el ticket, fija el hash de los archivos antes de `qa-mechanical`, y tras pasar a `awaiting_user_tests` integra; un rechazo deja una parada `verification-failed` con el motivo. `packages/engine/src/journey-dispatch.ts` arma ese contexto cuando el proyecto es un repositorio git (rama de `readIntegrationConfig` resuelta con la fecha) y rechaza el despacho con el motivo si el árbol no está limpio.
- `tests/integracion-autonoma.test.ts` (nuevo, 9 pruebas con un repositorio git de verdad). Descubrió que el registro de ejecuciones ensuciaba el árbol: se agregó al estado del harness que no cuenta.
- Alcance, dicho sin adornos: se implementó el commit; el push queda fuera —el título histórico del ticket lo nombraba, el requisito vigente (R-JORN-009) y la regla del responsable lo prohíben—.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red; las pruebas crean repositorios git temporales y no tocan este:

1. `npx vitest run tests/integracion-autonoma.test.ts` — esperado: 9 pruebas pasan.
2. `npx vitest run tests/autonomous-run.test.ts tests/journey-dispatch.test.ts tests/avance-jornada.test.ts tests/jornada-topes.test.ts` — esperado: todas pasan.
3. `npx vitest run` — esperado: 180 archivos pasan y 1 omitido; 2614 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2614 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:1d8ef9e3c4054f6bc0836ca991baf578c194bb2a",
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
    "description": "npx vitest run (2614 pasan), tsc sin errores",
    "reference": "worktree:sha256:58c3fff4d1ecb755504eb78d61380373fd07726c186caa04a4593952ef5a663e",
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
    "technical_summary": "integrarTicket con rama de trabajo asegurada, árbol limpio, reglas, verificación del árbol probado y git de lista cerrada.",
    "functional_summary": "Cada ticket entregado por la jornada queda en su propio commit revertible, sin tocar main y sin publicar.",
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
    "at": "2026-10-07T03:59:28.494Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:59:43.659Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:00:07.899Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:06af9a92872cc4dadc9f5574f770d5d06c655f82376900448059b167b512aa13\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:00:08.036Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:06af9a92872cc4dadc9f5574f770d5d06c655f82376900448059b167b512aa13."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:00:08.036Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:00:08.123Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:35.932Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.064Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.166Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.252Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.345Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.429Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.584Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.771Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.855Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:36.942Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:37.028Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:37.113Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:37.197Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:37.283Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T04:03:37.364Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
