---
schema_version: 2
id: IMPROVEMENT-ADAPTER-AGENTES-Y-VERBOSIDAD-20261005
title: Limitar los informes de agentes y proyectar la verbosidad de Codex y OpenCode
type: IMPROVEMENT
module: ADAPTER
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

# IMPROVEMENT-ADAPTER-AGENTES-Y-VERBOSIDAD-20261005

## Solicitud original

Parte del sprint: Respuesta concisa en todos los clientes, independiente de los demás sprints.
- R-RESP-004: Los agentes generados DEBEN pedir informes de diez líneas como máximo
- R-RESP-007: Codex y OpenCode DEBERÍAN recibir la configuración de verbosidad que su cliente soporte
Depende de: IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (1) que los agentes que `valmen sync` proyecta a Claude Code, Codex y OpenCode terminen con una sección «Informe final» que pida diez líneas como máximo (hallazgo, rutas y decisión pendiente); (2) que `valmen sync` fije la verbosidad baja en `.codex/config.toml` sin pisar otras claves. Fuera de alcance: el estilo de salida y `CLAUDE.md` (ya cerrados), el presupuesto de `AGENTS.md` y las herramientas MCP.
- Usuario o rol afectado: quien invoca agentes proyectados desde Claude Code, Codex u OpenCode, y quien usa Codex en un proyecto con el harness.
- Comportamiento actual: `renderClaudeAgent`, `renderCodexAgent` y `renderOpencodeAgent` copian las instrucciones tal cual, sin límite de informe; `projectFiles` no emite configuración de Codex.
- Comportamiento esperado: cada agente proyectado termina con la sección «Informe final» (una sola vez, aunque la definición ya la traiga); con el runtime `codex` en alcance, `.codex/config.toml` declara `model_verbosity = "low"` conservando el resto, y una clave `model_verbosity` que la persona ya escribió se respeta. OpenCode no recibe clave de verbosidad porque su configuración de proyecto no declara una que valga para cualquier modelo; queda dicho en el código y en el informe del ticket. Un proyecto la puede apagar con `codex-verbosity: off` en `config.yaml`.

## Diagnóstico

- Archivos y flujo investigados: los tres renderizadores de agentes están en `packages/adapter/src/agents.ts` (`renderCodexAgent`, `renderOpencodeAgent`, `renderClaudeAgent`) y comparten `agent.instructions`; `projectFiles` en `packages/adapter/src/projection.ts:108` arma la lista de archivos y filtra por runtimes en alcance; el contrato de respuesta y sus reglas viven en `packages/adapter/src/templates.ts:154`. Los archivos de configuración compartidos con la persona ya se fusionan como texto en `packages/adapter/src/mcp.ts:299` (`mergeCodexConfig`), así que el config.toml de proyecto de Codex ya existe como destino de otras escrituras y la fusión de verbosidad debe convivir con ella.
- Causa raíz o hipótesis: los agentes se escribieron para delegar trabajo y su informe no tiene tope, por lo que vuelcan el recorrido en la conversación; y la proyección solo sabe emitir archivos propios, sin tocar configuración de cliente. Comprobado: no hay referencia a `model_verbosity` en `packages/adapter/src`. Hipótesis a confirmar en la prueba: Codex lee `model_verbosity` de el config.toml de proyecto de Codex del proyecto como clave de nivel superior; por eso la fusión la inserta antes de la primera sección y la comparación con el disco la deja idempotente.
- Riesgos y compatibilidad: la sección se agrega al final de las instrucciones, así que no cambia el orden del contenido que la persona escribió; un cuerpo que ya trae «## Informe final» no se duplica. La clave de Codex no se pisa si ya existe en el nivel superior, aunque tenga otro valor: es una decisión de la persona. Un valor inválido de `codex-verbosity` falla con mensaje, como `agents-md-budget`. Los tests que cuentan archivos proyectados por runtime (`tests/adapters.test.ts`, `tests/config-view.test.ts`) cambian de cantidad y se ajustan a la regla nueva.
- Impactos de sync, migración, Docker o despliegue: ninguno (proyección de archivos del harness).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la sección de informe en los agentes, la fusión de verbosidad de Codex, sus pruebas y los ajustes de las pruebas de conteo. Exclusiones: OpenCode sin clave, estilo de salida, `CLAUDE.md`, MCP.
- Pasos ordenados:
  1. En `packages/adapter/src/templates.ts` agregar `AGENT_REPORT_TITLE` y `AGENT_REPORT_RULE`, y en `packages/adapter/src/agents.ts` crear `withReportLimit(instructions)` (idempotente) y usarla en `renderCodexAgent`, `renderOpencodeAgent` y `renderClaudeAgent`.
  2. Crear `packages/adapter/src/verbosity.ts` con `readCodexVerbosity` (clave `codex-verbosity`, valores low, medium, high y off; por defecto low; inválido falla) y `mergeCodexVerbosity(actual, valor)` (inserta `model_verbosity` antes de la primera sección; respeta una clave ya declarada; idempotente).
  3. En `packages/adapter/src/projection.ts` agregar `.codex/config.toml` a la lista de `projectFiles` cuando el runtime `codex` esté en alcance y el valor no sea `off`; exportar el módulo desde `packages/adapter/src/index.ts`.
  4. Crear `tests/agentes-y-verbosidad.test.ts` con los tres runtimes (el informe de diez líneas está en cada agente y una sola vez), la fusión de Codex (archivo nuevo, con secciones propias, con clave ya escrita, idempotente), `off`, valor inválido, runtime `codex` fuera de alcance y que OpenCode no recibe clave de verbosidad.
  5. Ajustar los conteos de `tests/adapters.test.ts` y `tests/config-view.test.ts`, y correr `npx vitest run tests/agentes-y-verbosidad.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket y borrar `model_verbosity` de `.codex/config.toml` en los proyectos ya sincronizados; las instrucciones de los agentes se regeneran con `valmen sync`.

## Criterios de aceptación

- [x] R-RESP-004: el agente proyectado a Claude Code incluye el límite de informe de diez líneas
      <!-- test: npx vitest run tests/agentes-y-verbosidad.test.ts -->
- [x] R-RESP-004: lo mismo en los agentes de Codex y de OpenCode, y la sección no se repite si la definición ya la trae
      <!-- test: npx vitest run tests/agentes-y-verbosidad.test.ts -->
- [x] R-RESP-007: con el runtime codex en alcance, sync declara `model_verbosity = "low"` en `.codex/config.toml` conservando las demás claves y secciones
      <!-- test: npx vitest run tests/agentes-y-verbosidad.test.ts -->
- [x] R-RESP-007: una clave `model_verbosity` ya escrita por la persona se respeta y la fusión es idempotente
      <!-- test: npx vitest run tests/agentes-y-verbosidad.test.ts -->
- [x] `codex-verbosity: off` no proyecta el archivo y un valor inválido falla con mensaje
      <!-- test: npx vitest run tests/agentes-y-verbosidad.test.ts -->
- [x] OpenCode no recibe una clave de verbosidad que su cliente no soporta
      <!-- test: npx vitest run tests/agentes-y-verbosidad.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-ADAPTER-AGENTES-Y-VERBOSIDAD-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/templates.ts",
      "packages/adapter/src/agents.ts",
      "packages/adapter/src/verbosity.ts",
      "packages/adapter/src/projection.ts",
      "packages/adapter/src/index.ts",
      "tests/agentes-y-verbosidad.test.ts",
      "tests/adapters.test.ts",
      "tests/config-view.test.ts"
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

- `packages/adapter/src/templates.ts`: `AGENT_REPORT_TITLE` y `AGENT_REPORT_RULE` (informe de diez líneas: hallazgo, rutas y decisión pendiente).
- `packages/adapter/src/agents.ts`: `withReportLimit` (idempotente) aplicada en los renderizadores de Claude Code, Codex y OpenCode.
- `packages/adapter/src/verbosity.ts` (nuevo): `readCodexVerbosity` (clave `codex-verbosity`, por defecto low, `off` apaga, inválido falla) y `mergeCodexVerbosity` (inserta `model_verbosity` antes de la primera sección y respeta la que ya escribió la persona).
- `packages/adapter/src/projection.ts` y `index.ts`: el config.toml de Codex entra en la proyección con el runtime `codex` en alcance. OpenCode no recibe clave: su configuración de proyecto no declara una de verbosidad válida para cualquier modelo.
- `tests/agentes-y-verbosidad.test.ts` (nuevo, 12 pruebas); `tests/adapters.test.ts` y `tests/config-view.test.ts` ajustados a los archivos nuevos.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/agentes-y-verbosidad.test.ts` — esperado: 12 pruebas pasan.
2. `npx vitest run` — esperado: 164 archivos pasan y 1 omitido; 2467 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2467 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:9fc041713503167b60f181c3569ca9640e2a6931",
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
    "description": "npx vitest run (2467 pasan), tsc sin errores",
    "reference": "worktree:sha256:e8d6ebdb222d76fb47bf86c6ebb24d55f396c53eb9f2c29c620ba34701500dbc",
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
    "technical_summary": "withReportLimit en los tres renderizadores y verbosity.ts con la fusión del config.toml de Codex.",
    "functional_summary": "Los agentes devuelven informes cortos y Codex recibe la verbosidad baja sin pisar la configuración de la persona.",
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:50.401Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:57:50.124Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:58:01.270Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-IMPROVEMENT-ADAPTER-AGENTES-Y-VERBOSIDAD-20261005-analysis-1, canal delegation, decidida 2026-10-07T01:58:01.269Z): por delegación DEL-20261006-001 del PO Juan Andrade: Los archivos citados existen (agents.ts, projection.ts:108, templates.ts:154, mcp.ts:299); verbosity.ts y su prueba son archivos nuevos del plan. La causa es comprobable: no hay model_verbosity en packages/adapter/src y los renderizadores copian las instrucciones sin tope. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:58:01.362Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:58:02.484Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Claude Code por delegación del PO (recibo GR-20261007-IMPROVEMENT-ADAPTER-AGENTES-Y-VERBOSIDAD-20261005-plan-1, canal delegation, decidida 2026-10-07T01:58:02.483Z): por delegación DEL-20261006-001 del PO Juan Andrade: Los archivos citados existen (agents.ts, projection.ts:108, templates.ts:154, mcp.ts:299); verbosity.ts y su prueba son archivos nuevos del plan. La causa es comprobable: no hay model_verbosity en packages/adapter/src y los renderizadores copian las instrucciones sin tope. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:58:02.606Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:58:02.692Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:03.527Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:03.659Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:03.744Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:03.831Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:03.914Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:03.993Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.180Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.388Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.466Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.546Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.635Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.721Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.799Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.877Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T02:00:04.958Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
