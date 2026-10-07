---
schema_version: 2
id: FEATURE-ADAPTER-CLAUDE-CODE-RESPUESTA-20261005
title: Generar el output style, activarlo y mantener el bloque de CLAUDE.md
type: FEATURE
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

# FEATURE-ADAPTER-CLAUDE-CODE-RESPUESTA-20261005

## Solicitud original

Parte del sprint: Respuesta concisa en todos los clientes, independiente de los demás sprints.
- R-RESP-002: sync DEBE generar para Claude Code un output style y activarlo sin pisar la configuración existente
- R-RESP-003: sync DEBE mantener en CLAUDE.md un bloque gestionado corto que importe AGENTS.md
Depende de: IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que `valmen sync` proyecte para Claude Code (1) `.claude/output-styles/valmen.md` con el contrato de respuesta y active `outputStyle: "valmen"` en `.claude/settings.json` por fusión, y (2) un bloque gestionado de diez líneas o menos en `CLAUDE.md` que resume el contrato, declara su precedencia sobre los CLAUDE.md superiores e importa `AGENTS.md`. Fuera de alcance: los agentes (R-RESP-004), Codex y OpenCode (R-RESP-007), el presupuesto de tamaño y las herramientas MCP.
- Usuario o rol afectado: quien trabaja con Claude Code en un proyecto con el harness; recibe respuestas cortas sin configurar nada.
- Comportamiento actual: `projectFiles` solo emite `AGENTS.md`, agentes y skills; Claude Code no recibe estilo de salida ni `CLAUDE.md`, de modo que el estilo del cliente o un CLAUDE.md superior pisan el contrato de `AGENTS.md`.
- Comportamiento esperado: tras `valmen sync`, `.claude/output-styles/valmen.md` existe, `.claude/settings.json` conserva todas sus claves y trae `outputStyle: "valmen"`, y `CLAUDE.md` tiene un único bloque gestionado; el texto de la persona fuera del bloque no cambia. `sync --check` compara solo la clave `outputStyle` y el bloque, no el resto del archivo. Solo se proyecta si el runtime `claude` está en alcance.

## Diagnóstico

- Archivos y flujo investigados: `projectFiles` en `packages/adapter/src/projection.ts:108` arma la lista de `ProjectedFile` (ruta y contenido completo) y filtra por `enAlcance`; `syncProject` en `packages/cli/src/commands.ts:775` escribe cada archivo con `atomicWrite` y, con `--check`, compara `onDisk !== file.content`; `syncProjections` y `projectionImpact` en `packages/server/src/config.ts` hacen lo mismo desde Mission Control. El contrato ya vive como datos reutilizables en `packages/adapter/src/templates.ts:154` (`RESPONSE_CONTRACT_RULES`, `RESPONSE_CONTRACT_PRECEDENCE`), hecho a propósito para este ticket.
- Causa raíz o hipótesis: la proyección solo sabe emitir archivos cuyo contenido es íntegro y propio; un `settings.json` o un `CLAUDE.md` mezclan contenido de la persona y del harness. Si `projectFiles` calcula el contenido **fusionado** leyendo el archivo actual del disco, el resto del flujo (escritura y comparación) sigue sin cambios y es idempotente: una fusión ya aplicada devuelve el texto idéntico al de disco, así que `--check` solo marca desactualizado lo que realmente falta.
- Riesgos y compatibilidad: un `settings.json` con JSON inválido no se debe sobrescribir —se falla con un mensaje que lo nombra—; si ya trae `outputStyle: "valmen"` se conserva el texto tal cual (no se reformatea); si trae otro `outputStyle` se cambia a `valmen` porque es lo que pide el requisito y se informa. El bloque de `CLAUDE.md` se delimita con marcadores `<!-- valmen:inicio -->` / `<!-- valmen:fin -->` y no se toca nada fuera; un marcador de inicio sin fin se trata como error y no se escribe. Mission Control calcula el impacto con el mismo `projectFiles`, así que lo ve igual. Los proyectos adoptados sin runtime `claude` no reciben nada.
- Impactos de sync, migración, Docker o despliegue: ninguno (se trata de la proyección de archivos del harness, no de sincronización de datos).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el módulo de fusión para Claude Code, su integración en `projectFiles` y las pruebas. Exclusiones: agentes, Codex, OpenCode, tamaño de `AGENTS.md` y MCP.
- Pasos ordenados:
  1. Crear `packages/adapter/src/claude-code.ts` con `renderOutputStyle()` (frontmatter `name`, `description`, `keep-coding-instructions: true` y el contrato desde `RESPONSE_CONTRACT_RULES`), `mergeOutputStyleSetting(actual)` (parsea el JSON, fija `outputStyle: "valmen"`, conserva el texto si ya está y falla con mensaje claro si no parsea) y `mergeClaudeMdBlock(actual)` (bloque entre marcadores de diez líneas o menos con el contrato resumido, la precedencia y `@AGENTS.md`; reemplaza el bloque existente o lo agrega al final sin tocar el resto).
  2. En `projectFiles` de `packages/adapter/src/projection.ts`, leer `.claude/settings.json` y `CLAUDE.md` del disco y agregar a `files` los tres archivos (`.claude/output-styles/valmen.md`, `.claude/settings.json`, `CLAUDE.md`) cuando el runtime `claude` esté en alcance; exportar las funciones desde `packages/adapter/src/index.ts`.
  3. Hacer que `sync --check` y la comparación de Mission Control digan qué falta: sin cambios de código en `packages/cli/src/commands.ts` ni `packages/server/src/config.ts` si la comparación de contenido fusionado basta; si no, ajustar solo el mensaje.
  4. Crear `tests/claude-code-respuesta.test.ts`: settings con permisos propios (los conserva y fija `outputStyle`), settings ya al día (texto idéntico), settings inválido (falla sin escribir), CLAUDE.md a mano (notas intactas y un solo bloque), segunda corrida (idempotente, un solo bloque), bloque de diez líneas o menos con `@AGENTS.md`, runtime `claude` fuera de alcance (no proyecta) y `sync --check` desactualizado cuando falta el estilo.
  5. Correr `npx vitest run tests/claude-code-respuesta.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`; comprobar con un proyecto de laboratorio que `valmen sync` y `valmen sync --check` se comportan.
- Rollback: revertir el commit del ticket y borrar `.claude/output-styles/valmen.md`, la clave `outputStyle` y el bloque marcado de `CLAUDE.md` en los proyectos ya sincronizados; ningún otro contenido del usuario se modifica.

## Criterios de aceptación

- [x] R-RESP-002: sync escribe `.claude/output-styles/valmen.md` con el contrato de respuesta
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [x] R-RESP-002: sync activa `outputStyle` en `.claude/settings.json` por fusión y conserva los permisos y demás claves
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [x] R-RESP-002: `sync --check` compara solo la clave `outputStyle` de settings y marca desactualizado un proyecto sin ella
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [x] R-RESP-003: sync mantiene en `CLAUDE.md` un bloque gestionado de diez líneas o menos que importa `AGENTS.md`
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [x] R-RESP-003: el contenido de `CLAUDE.md` fuera del bloque no cambia y el bloque aparece una sola vez tras varias corridas
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [x] Un `settings.json` que no es JSON válido no se sobrescribe y el error lo nombra
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->
- [x] Sin el runtime `claude` en alcance no se proyecta nada de lo anterior
      <!-- test: npx vitest run tests/claude-code-respuesta.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ADAPTER-CLAUDE-CODE-RESPUESTA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/claude-code.ts",
      "packages/adapter/src/projection.ts",
      "packages/adapter/src/index.ts",
      "tests/claude-code-respuesta.test.ts",
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

- `packages/adapter/src/claude-code.ts` (nuevo): `renderOutputStyle`, `mergeOutputStyleSetting` (fusiona `outputStyle` sin tocar otras claves, devuelve el texto tal cual si ya está y falla sin sobrescribir un JSON inválido) y `mergeClaudeMdBlock` (bloque entre marcadores, de diez líneas o menos, que importa `@AGENTS.md`; lo de afuera no se toca y un marcador huérfano falla).
- `packages/adapter/src/projection.ts`: `projectFiles` agrega los tres archivos de Claude Code cuando el runtime `claude` está en alcance, leyendo del disco el `settings.json` y el `CLAUDE.md` actuales; así `sync`, `sync --check` y Mission Control comparan el contenido ya fusionado sin lógica aparte.
- `packages/adapter/src/index.ts`: exporta el módulo.
- `tests/claude-code-respuesta.test.ts` (nuevo, 14 pruebas); `tests/adapters.test.ts` y `tests/config-view.test.ts` ajustados a los tres archivos nuevos.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/claude-code-respuesta.test.ts` — esperado: 14 pruebas pasan.
2. `npx vitest run` — esperado: 163 archivos pasan y 1 omitido; 2455 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2455 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:1c84c63cd8d2f15ada6f84764f262d47263782fd",
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
    "description": "npx vitest run (2455 pasan), tsc sin errores",
    "reference": "worktree:sha256:c8d4041664742eac635cec643c680e7ed827e6937689540972490e47d7884667",
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
    "technical_summary": "claude-code.ts fusiona outputStyle y el bloque de CLAUDE.md; projectFiles los proyecta con el runtime claude.",
    "functional_summary": "Claude Code recibe respuestas cortas sin configurar nada: estilo de salida activado y CLAUDE.md con bloque gestionado, sin pisar lo escrito a mano.",
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
    "at": "2026-10-06T01:51:50.335Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:53:45.109Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:53:52.425Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-ADAPTER-CLAUDE-CODE-RESPUESTA-20261005-analysis-1, canal delegation, decidida 2026-10-07T01:53:52.404Z): por delegación DEL-20261006-001 del PO Juan Andrade: Los archivos citados existen (projection.ts:108, commands.ts:775, config.ts, templates.ts:154); claude-code.ts y su prueba son archivos nuevos del plan, por eso el evaluador no los halla. La causa es comprobable en projectFiles. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:53:52.548Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:53:54.010Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-ADAPTER-CLAUDE-CODE-RESPUESTA-20261005-plan-1, canal delegation, decidida 2026-10-07T01:53:54.009Z): por delegación DEL-20261006-001 del PO Juan Andrade: Los archivos citados existen (projection.ts:108, commands.ts:775, config.ts, templates.ts:154); claude-code.ts y su prueba son archivos nuevos del plan, por eso el evaluador no los halla. La causa es comprobable en projectFiles. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:53:54.309Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:53:54.450Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.060Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.176Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.259Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.345Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.425Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.511Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.662Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.848Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:41.929Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:42.010Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:42.089Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:42.167Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:42.247Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:42.329Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T01:56:42.407Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
