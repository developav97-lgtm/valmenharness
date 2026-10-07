---
schema_version: 2
id: FEATURE-ENGINE-REVISION-PREVIA-20261005
title: Revisar sin modelo antes de la compuerta y decidir en código los votos del plan
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

# FEATURE-ENGINE-REVISION-PREVIA-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-008: Una revisión sin modelo DEBE correr antes de gastar una llamada de compuerta
- R-CPRE-009: Las comprobaciones del plan que el código puede decidir DEBEN decidirse en código y votar
Depende de: BUGFIX-GATE-LECTOR-CRITERIOS-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (R-CPRE-008) una revisión que el código hace, sin modelo, antes de llamar al evaluador de las compuertas `analysis` y `plan`, y que también se puede correr a mano; y (R-CPRE-009) cuatro comprobaciones del plan que el código decide y que votan en la decisión. Fuera de alcance: la compuerta mecánica `qa-mechanical`, los umbrales y las proposiciones que necesitan juicio.
- Usuario o rol afectado: el agente que entrega un análisis o un plan y paga una llamada para que le digan que falta el Rollback, y quien lee un recibo donde una comprobación de código figura como descriptiva.
- Comportamiento actual: la compuerta llama al modelo aunque el ticket tenga marcadores de plantilla vacíos, el Rollback vacío, archivos citados que no existen, criterios sin anotación de verificación o pasos del plan sin ruta ni comando; `rollback_suficiente`, `pasos_ejecutables` y `criterios_verificables` las responde el modelo, y cuando el ticket tiene criterios pasan a descriptivas junto con `hay_archivos_afectados`, así que un plan con `Rollback:` vacío pudo aprobarse (`FEATURE-MC-FRESCURA-FUENTES-20261001`).
- Comportamiento esperado: antes de llamar a nadie, el motor revisa en código marcadores vacíos, Rollback vacío, archivos citados inexistentes, criterios sin anotación, más criterios que el tope y pasos sin ruta ni comando; si algo falla no llama al modelo y dice qué falta, y el mismo informe sale con un comando a mano. `rollback_suficiente`, `hay_archivos_afectados`, `pasos_ejecutables` y `criterios_verificables` se deciden en código, votan y no pasan a descriptivas por tener criterios.

## Diagnóstico

- Archivos y flujo investigados: `runGate` en `packages/engine/src/gate.ts` ejecuta los checks mecánicos (`runMechanicalChecks` en `packages/engine/src/state.ts`: criterios presentes, rollback si el riesgo es crítico, impactos, secretos) y enseguida expande la compuerta y llama a `evaluateGate` (`packages/engine/src/evaluators.ts`); el único paso previo a ese llamado que cubre criterios sin anotación es `revisarCriteriosVerificables`, y solo para `qa-mechanical`. `PLAN_GATE` (`packages/gate/src/definitions.ts`) declara las cuatro proposiciones como juicio del modelo y `hay_archivos_afectados` con `verdict: false`; `expandGate` (`packages/gate/src/dynamic.ts`) marca como descriptivas todas las fijas cuando el ticket tiene criterios. Un check fijo `archivos_existen` de `ANALYSIS_GATE` está declarado como `skip`: nadie lo ejecuta.
- Causa raíz o hipótesis: lo que el código puede decidir se le pregunta al modelo y, cuando hay criterios, ni siquiera vota; y no hay una revisión de código que corte la llamada cuando el artefacto está incompleto.
- Riesgos y compatibilidad: la comprobación de archivos citados exige un repositorio donde comprobarlos; sin un directorio `.git` en la raíz del proyecto se omite y el informe lo dice, para no rechazar un ticket por citar archivos de un código que el motor no puede ver. Solo se comprueban los archivos que cita el diagnóstico —el plan cita archivos que va a crear—. El tope de criterios es una constante de revisión (40), distinta de las tandas de evaluación: no reintroduce el recorte silencioso. Una falla de la revisión previa no escribe recibo ni cambia el estado, igual que un check mecánico fallido. Las pruebas que evalúan planes con pasos sin ruta o criterios sin anotación deben conformarse a las reglas nuevas: se ajustan sus fixtures, no las reglas. Esta compuerta usa el evaluador de siempre sobre lo que queda para el modelo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la revisión previa en código (módulo, informe, comando y herramienta de solo lectura), su cableado antes del evaluador, y la decisión en código de las cuatro comprobaciones del plan, con pruebas. Exclusiones: la compuerta mecánica y las proposiciones de juicio.
- Pasos ordenados:
  1. Crear `revision-previa.ts` en el motor con `reviewBeforeGate({ root, ticketText, gateId })`, que devuelve la lista de hallazgos con identificador y mensaje: marcadores de plantilla vacíos, Rollback vacío, archivos que cita el diagnóstico y no existen (solo si la raíz es un repositorio git), criterios sin anotación `test:` o `verify:`, más criterios que el tope de 40, y pasos del plan sin ruta, símbolo ni comando entre comillas invertidas; agregar `renderPreReview` que dice qué falta.
  2. En el mismo módulo, agregar `decideInCode(propositionId, ticketText)` para `rollback_suficiente`, `hay_archivos_afectados`, `pasos_ejecutables` y `criterios_verificables`, con respuesta 0.99 si se cumplen y 0 si no.
  3. En `decide.ts` del paquete de compuertas, agregar el campo opcional `decidedInCode` a las proposiciones; en `definitions.ts`, marcarlo en esas cuatro y quitar `verdict: false` de `hay_archivos_afectados`; en `dynamic.ts`, hacer que `expandGate` no las pase a descriptivas aunque el ticket tenga criterios.
  4. En `evaluators.ts`, agregar la entrada opcional `precomputed` a `evaluateGate`: las proposiciones con respuesta precalculada no se envían al evaluador y sus respuestas se suman a las demás.
  5. En la compuerta del motor, llamar a `reviewBeforeGate` antes de evaluar en `analysis` y `plan`: si hay hallazgos devolver el informe con código de invariante sin llamar al evaluador ni escribir recibo; calcular las respuestas de código de las proposiciones marcadas y pasarlas como `precomputed`.
  6. En `main.ts` del CLI, agregar el comando `valmen precheck <compuerta> --id <ID>` que imprime el informe y sale con 3 si falta algo; en `tools.ts` del MCP, agregar la herramienta de solo lectura `revision_previa`, y clasificarla en la lista de lectura de Hermes y en las listas de las pruebas de anotaciones.
  7. Crear `tests/revision-previa.test.ts` con un evaluador simulado que cuenta llamadas: cada hallazgo corta antes del modelo y nombra lo que falta (incluido el `Rollback:` vacío y un archivo inexistente), un ticket completo pasa y llama, las cuatro comprobaciones votan aun con criterios y un plan con Rollback vacío no aprueba, y el comando a mano coincide con la compuerta. Ajustar los fixtures de las pruebas existentes que evalúan planes, y correr `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; no hay datos que migrar y los recibos ya escritos siguen siendo legibles.

## Criterios de aceptación

- [x] Un plan con la línea `Rollback:` vacía no llama al evaluador y el mensaje nombra esa línea
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un diagnóstico que cita un archivo inexistente falla la revisión nombrando ese archivo
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un marcador de plantilla vacío en el diagnóstico corta antes del evaluador
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un criterio sin anotación de verificación corta antes del evaluador en la compuerta del plan
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un paso del plan sin ruta, símbolo ni comando corta antes del evaluador
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un ticket con más criterios que el tope se rechaza antes del evaluador
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un ticket completo pasa la revisión previa y el evaluador se llama una vez
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] La misma revisión se puede correr a mano con `valmen precheck` y dice lo mismo que la compuerta
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] `rollback_suficiente`, `hay_archivos_afectados`, `pasos_ejecutables` y `criterios_verificables` se deciden en código y votan aunque el ticket tenga criterios
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] Un plan sin archivos afectados no aprueba
      <!-- test: npx vitest run tests/revision-previa.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-REVISION-PREVIA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/revision-previa.ts",
      "packages/engine/src/gate.ts",
      "packages/engine/src/evaluators.ts",
      "packages/engine/src/index.ts",
      "packages/gate/src/decide.ts",
      "packages/gate/src/definitions.ts",
      "packages/gate/src/dynamic.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/mcp/src/tools.ts",
      "packages/server/src/hermes.ts",
      "tests/revision-previa.test.ts",
      "tests/helpers/fixtures.ts",
      "tests/gate-command.test.ts",
      "tests/gate-lector-criterios.test.ts",
      "tests/gate-plan-aviso.test.ts",
      "tests/gate-playwright-plan.test.ts",
      "tests/mcp-server.test.ts",
      "tests/mcp-anotaciones.test.ts",
      "tests/next-step.test.ts"
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

`packages/engine/src/revision-previa.ts` (nuevo): `reviewBeforeGate` revisa sin modelo marcadores de plantilla vacíos, `Rollback:` vacío, archivos que cita el diagnóstico y no existen (solo si la raíz es un repositorio git; si no, lo informa como omitido), criterios sin anotación `test:`/`verify:`, más criterios que el tope (`TOPE_DE_CRITERIOS` = 40, distinto de las tandas de evaluación) y pasos del plan sin ruta, símbolo ni comando entre comillas invertidas; `renderPreReview` arma el informe; `decideInCode` decide `rollback_suficiente`, `hay_archivos_afectados`, `pasos_ejecutables` y `criterios_verificables` (0,99 si se cumplen, 0 si no). `packages/engine/src/gate.ts`: tras los checks mecánicos y antes del evaluador, en `analysis` y `plan`, un hallazgo devuelve el informe con código 3 sin llamar al modelo ni escribir recibo; las respuestas de código se pasan como `precomputed`. `packages/engine/src/evaluators.ts`: `evaluateGate` acepta `precomputed` y no envía esas proposiciones al evaluador. `packages/gate/src/decide.ts`, `definitions.ts` y `dynamic.ts`: campo `decidedInCode`; las cuatro del plan lo declaran, `hay_archivos_afectados` deja de ser descriptiva y `expandGate` no las pasa a descriptivas por tener criterios. CLI: `valmen precheck <analysis|plan> --id <ID>`; MCP: herramienta de solo lectura `revision_previa` (clasificada en Hermes y en las listas de anotaciones). Pruebas existentes adaptadas a las reglas nuevas, no al revés: el fixture por defecto anota sus criterios y su paso 3 nombra un comando; los planes de `gate-lector-criterios`, `gate-plan-aviso` y `gate-playwright-plan` ganan su Rollback; `mcp-server` llena la «Descripción funcional»; `next-step` pasa criterios sin anotación explícitos; el conteo de proposiciones que deciden en `gate-command` es 8 de 12. Pruebas nuevas: `tests/revision-previa.test.ts` (14). Nota: el diagnóstico de un ticket no debe citar entre comillas invertidas archivos que todavía no existen, porque la revisión los marca.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/revision-previa.test.ts` — esperado: 14 pruebas pasan.
2. `npx vitest run` — esperado: 157 archivos pasan y 1 omitido; 2381 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. `valmen precheck plan --id <ID de un ticket real>` — esperado: el informe de la revisión previa; con 3 si falta algo.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2381 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:3445b5ded9d529e96b0797dbf43a74fa4e3f5fdf",
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
    "description": "npx vitest run: 2381 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:ee24effb10b2ba9f3116b5731ee9104f8f8cd24a02f25562a2954c9b5eccb467",
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
    "technical_summary": "reviewBeforeGate corta antes del evaluador, decideInCode decide y vota cuatro comprobaciones del plan, valmen precheck y revision_previa la corren a mano; 14 pruebas nuevas y fixtures ajustados",
    "functional_summary": "Un plan con el Rollback vacío, un archivo inexistente o un paso sin comando ya no gasta una llamada: la compuerta dice qué falta, y la revisión se puede correr a mano",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio del motor de compuertas; los tickets deben pasar la revisión previa antes del evaluador"
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
    "at": "2026-10-06T01:51:49.593Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:11:56.345Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:12:23.592Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:12:57.522Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:12:57.652Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:26.647Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:26.805Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:26.925Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:27.047Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:27.190Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:27.328Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:27.791Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.266Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.376Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.473Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.579Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.673Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.773Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.868Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:20:28.955Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
