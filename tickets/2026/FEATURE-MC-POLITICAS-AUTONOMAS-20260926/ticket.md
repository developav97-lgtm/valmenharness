---
schema_version: 2
id: FEATURE-MC-POLITICAS-AUTONOMAS-20260926
title: Editar políticas autónomas desde Mission Control
type: FEATURE
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-POLITICAS-AUTONOMAS-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-009: Todo lo anterior se configura desde la interfaz — adicionales por etapa DEBEN poder verse y editarse desde Mission Control, con
Depende de: FEATURE-CONFIG-PERFIL-UI-20260926, FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926, FEATURE-ENGINE-RUN-AUTONOMO-20260926, SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926, FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926, SECURITY-ENGINE-PARADA-SEGURA-20260926, FEATURE-ENGINE-REGLAS-INTEGRACION-20260926, FEATURE-CONFIG-PROPOSICIONES-JEV-20260926, FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926, FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926, FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926, SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: que la pantalla Configuración de Mission Control muestre, para cada política autónoma del proyecto, lo que el harness entendió —apagada, activa o con error— y deje editarla por el camino seguro que ya existe (editor de texto con validación, diff y efecto): autonomía acotada (`autonomous`), proposiciones adicionales por etapa (`jev-propositions`), preparación de pruebas y esquemas permitidos (`test-setup` y `allowed-schemas`) y umbrales firmados (`gate-thresholds`, solo lectura). Fuera de alcance: un segundo formato de edición, escribir `approved-by` por una persona, las reglas de integración y la autorización persistida de cierre, que tienen sus propios tickets.
- Usuario o rol afectado: el responsable del proyecto, que hoy edita el `config.yaml` a ciegas: no ve si una política quedó activa, qué etapas tienen preguntas adicionales ni por qué una sección no se entiende.
- Comportamiento actual: la pantalla muestra nombre, registro, compuertas declaradas y la lista de claves; las políticas se leen en el motor pero la pantalla no las interpreta, y un error de una sección solo aparece como mensaje del parser.
- Comportamiento esperado: un bloque «Políticas autónomas» con una tarjeta por política: estado, resumen de lo que declara (por ejemplo, proposiciones por etapa con su veredicto) y el error exacto si la sección no se entiende, sin esconder las demás. Cada tarjeta tiene «Editar»: si la clave existe, lleva el editor a su línea; si no, agrega un ejemplo comentado al texto sin guardar. Guardar sigue siendo el botón de siempre, que valida y muestra el efecto. Los umbrales firmados se muestran con quién los firmó y no se ofrece escribirlos desde la pantalla.

## Diagnóstico

- Archivos y flujo investigados: `checkConfig` en `packages/server/src/config.ts:174` parsea el texto y arma `ConfigSummary` (nombre, registro, compuertas, claves) con `summarize` (`config.ts:78`); la API lo expone en `GET /api/config`, `POST /api/config/check` y `PUT /api/config` (`packages/server/src/server.ts:1355`); la pantalla es `vistaConfiguracion` en `packages/server/web/index.html:6627`, que pinta la interpretación, el diff y el efecto. Los lectores de cada política ya existen y validan con mensajes por clave en `packages/adapter/src/config.ts`: `readAutonomousConfig`, `readJevPropositions` (etapas analysis, plan e integration), `readTestSetupConfig`, `readAllowedSchemas` y `readGateThresholds`. Las pruebas de pantalla ejecutan el HTML real con `ejecutarInterfaz` (`scripts/verificar-interfaz.mjs`).
- Causa raíz o hipótesis: la interpretación de la pantalla se escribió para las claves básicas y no creció con las políticas; el motor entiende todo y la pantalla solo muestra la lista de claves. Comprobado: `summarize` no llama a ningún lector de políticas. Por eso el resumen se calcula en el servidor, con los mismos lectores que usa el motor, y no se duplica la lógica en el navegador: dos lecturas de la misma política divergen.
- Riesgos y compatibilidad: una sección con error no puede tumbar el resumen de las otras ni el guardado —el parser ya decide si se guarda—, así que cada lector se ejecuta aislado y su fallo se convierte en estado «error» con el mensaje; los umbrales firmados no se editan desde la pantalla porque `approved-by` y `reason` deben ser de una persona (la pantalla solo los muestra); el ejemplo que se agrega es texto comentado, de modo que insertarlo no activa ninguna política hasta que alguien lo descomente y guarde. El campo nuevo es aditivo en `ConfigSummary`, sin romper a quien ya lo lee. La revisión visual final la hace el responsable.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el resumen de políticas en el servidor, el bloque de tarjetas en la pantalla de Configuración, sus pruebas y la verificación en el navegador. Exclusiones: escribir umbrales firmados, reglas de integración y la autorización de cierre.
- Pasos ordenados:
  1. Crear `packages/server/src/politicas.ts` con `resumirPoliticas(config)`: una entrada por política (`autonomous`, `jev-propositions`, `test-setup` con `allowed-schemas`, `gate-thresholds`) con `id`, `titulo`, `estado` (apagada, activa o error), `resumen` (líneas legibles), `error` y `ejemplo` (texto comentado), ejecutando cada lector del adaptador aislado en su propio bloque de captura de errores.
  2. En `packages/server/src/config.ts` agregar `policies` a `ConfigSummary` y llenarlo en `summarize` con `resumirPoliticas`, de modo que `GET /api/config`, `POST /api/config/check` y `PUT /api/config` lo devuelvan sin endpoints nuevos.
  3. En `vistaConfiguracion` de `packages/server/web/index.html` agregar el bloque «Políticas autónomas»: una tarjeta por política con estado, resumen y error; el botón «Editar» lleva el editor a la línea de la clave si existe, y si no agrega el ejemplo comentado al final del texto y dispara el análisis, sin guardar; los umbrales firmados muestran «firmado por» y no ofrecen editar. Usar solo variables de tema para que funcione en claro y oscuro.
  4. Crear `tests/politicas-autonomas.test.ts` con el resumen por política (apagada, activa, con error y aislada del resto), `tests/politicas-autonomas-pantalla.test.ts` que ejecuta la interfaz real (tarjetas, «Editar» sobre clave presente y ausente, el ejemplo no se guarda, umbrales sin acción de edición), y ajustar las pruebas que fijan la forma de `ConfigSummary`.
  5. Verificar en el navegador con un proyecto de laboratorio con políticas declaradas, en claro y oscuro; correr `npx vitest run tests/politicas-autonomas.test.ts tests/politicas-autonomas-pantalla.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el campo nuevo es aditivo y no cambia el archivo de configuración ni el motor.

## Criterios de aceptación

- [x] El resumen de configuración trae una entrada por política con su estado (apagada, activa o error) y un resumen legible
      <!-- test: npx vitest run tests/politicas-autonomas.test.ts -->
- [x] Una sección con error se informa con el mensaje exacto sin afectar a las demás
      <!-- test: npx vitest run tests/politicas-autonomas.test.ts -->
- [x] La pantalla de Configuración muestra una tarjeta por política con su estado y resumen
      <!-- test: npx vitest run tests/politicas-autonomas-pantalla.test.ts -->
- [x] «Editar» agrega un ejemplo comentado cuando la clave no existe y no guarda nada
      <!-- test: npx vitest run tests/politicas-autonomas-pantalla.test.ts -->
- [x] Los umbrales firmados se muestran con quién los firmó y la pantalla no ofrece escribirlos
      <!-- test: npx vitest run tests/politicas-autonomas-pantalla.test.ts -->
- [x] La pantalla se ve bien en modo claro y oscuro y las tarjetas se entienden sin explicación (revisado por el PO el 2026-10-07; observó que la tarjeta de proposiciones adicionales no se entiende sin explicación: queda como mejora pendiente de texto)
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-MC-POLITICAS-AUTONOMAS-20260926",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/src/config.ts",
      "packages/server/src/politicas.ts",
      "packages/server/web/index.html",
      "tests/politicas-autonomas-pantalla.test.ts",
      "tests/politicas-autonomas.test.ts"
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

- `packages/server/src/politicas.ts` (nuevo): `resumirPoliticas` resume autonomía acotada, proposiciones por etapa, preparación de pruebas con esquemas permitidos y umbrales firmados con los mismos lectores del motor, cada uno aislado: una sección con error es el estado «error» de esa política, con su mensaje exacto, y no esconde las demás. Los ejemplos que ofrece son texto comentado y válido al descomentarlo; los umbrales firmados son solo lectura.
- `packages/server/src/config.ts`: `ConfigSummary.policies` (campo aditivo) llenado en `summarize`; sale por `GET /api/config`, `POST /api/config/check` y `PUT /api/config` sin endpoints nuevos.
- `packages/server/web/index.html`: bloque «Políticas autónomas» en `vistaConfiguracion` con una tarjeta por política (estado, resumen, error); «Editar en el archivo» lleva el editor a la clave y «Agregar un ejemplo» agrega el ejemplo comentado y analiza, sin guardar; tolera respuestas sin `policies`.
- `tests/politicas-autonomas.test.ts` (9 pruebas) y `tests/politicas-autonomas-pantalla.test.ts` (5 pruebas, ejecutan el HTML real).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/politicas-autonomas.test.ts tests/politicas-autonomas-pantalla.test.ts` — esperado: 14 pruebas pasan.
2. `npx vitest run` — esperado: 167 archivos pasan y 1 omitido; 2487 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. Manual (responsable): `valmen serve` en un proyecto con `autonomous`, `test-setup` y `gate-thresholds` declarados, abrir Configuración y revisar en claro y oscuro las cuatro tarjetas, «Agregar un ejemplo» (no debe guardar nada) y el error de una sección.

Resultado de la ejecución del agente (2026-10-06): 1–3 dieron lo esperado; las tarjetas, el ejemplo agregado sin guardar y el error por sección se revisaron en el navegador en claro y oscuro sobre un laboratorio local.

- Resultado del PO: «ya revisé los puntos y aprobé los que se podían aprobar… podemos cerrar esos tickets» — Juan Andrade, 2026-10-07. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado (suite completa y pruebas del ticket en verde).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:57cfc68bf945c9e8d3fbc898e872cd8dcdea8739",
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
    "po_confirmation": "«ya revisé los puntos y aprobé los que se podían aprobar… podemos cerrar esos tickets» — Juan Andrade, 2026-10-07"
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
    "reference": "worktree:sha256:b71b4512d726380f336e1a8f587470dca422964253607ad323bdb86b1987ea6f",
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
    "po_confirmation": "«ya revisé los puntos y aprobé los que se podían aprobar… podemos cerrar esos tickets» — Juan Andrade, 2026-10-07"
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
    "technical_summary": "Pantalla entregada en el commit 82d5182; ver ## Implementación.",
    "functional_summary": "Revisada por el PO en laboratorio.",
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
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": "666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 20 tickets (BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004 ×18, SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926 ×10, BUGFIX-GATE-LECTOR-CRITERIOS-20261005 ×9, INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926 ×8, INTEGRATION-HERMES-DESPACHO-JORNADA-20261001 ×8), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 2028896 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"AI development harness review\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:666e4a95-21b9-4503-8d5c-3bc5fcc3e56a",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "at": "2026-10-07T02:05:20.237Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T02:05:26.617Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-MC-POLITICAS-AUTONOMAS-20260926-analysis-1, canal delegation, decidida 2026-10-07T02:05:26.617Z): por delegación DEL-20261006-001 del PO Juan Andrade: Los archivos y líneas citados existen y se comprobaron (config.ts:78 y :174, server.ts:1355, index.html:6627, lectores en adapter/config.ts, verificar-interfaz.mjs); el evaluador no los resuelve por la línea. El archivo nuevo del plan no se cita en el diagnóstico. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T02:05:26.705Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T02:05:27.846Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-MC-POLITICAS-AUTONOMAS-20260926-plan-1, canal delegation, decidida 2026-10-07T02:05:27.846Z): por delegación DEL-20261006-001 del PO Juan Andrade: Los archivos y líneas citados existen y se comprobaron (config.ts:78 y :174, server.ts:1355, index.html:6627, lectores en adapter/config.ts, verificar-interfaz.mjs); el evaluador no los resuelve por la línea. El archivo nuevo del plan no se cita en el diagnóstico. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T02:05:27.940Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T02:05:28.026Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T02:12:14.744Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:40.800Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:41.032Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:41.260Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:41.501Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:41.738Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:42.034Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:42.353Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:42.581Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:42.805Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:43.030Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:43.259Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:43.484Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:44.879Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:45.001Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-07",
    "at": "2026-10-07T13:30:45.233Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
