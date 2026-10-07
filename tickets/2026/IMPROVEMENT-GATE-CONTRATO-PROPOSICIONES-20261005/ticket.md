---
schema_version: 2
id: IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005
title: Alinear proposiciones, partir impactos y excluir afirmaciones sobre aprobaciones
type: IMPROVEMENT
module: GATE
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

# IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-004: Cada proposición que vota DEBE preguntar lo mismo que dice su descripción y declarar criterios de sí y de no
- R-CPRE-005: Cada impacto declarado DEBE evaluarse con proposiciones atómicas
- R-CPRE-012: Las proposiciones NO DEBEN tomar como evidencia lo que el ticket afirma sobre aprobaciones o compuertas
Depende de: IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

Vector real para el análisis (no es una decisión pendiente): el recibo
`GR-20261006-BUGFIX-GATE-LECTOR-CRITERIOS-20261005-plan-1` (gate `plan`, cascada) dio
`corresponde_a_la_investigacion` = 0.00 —descriptiva, no decide— con la clasificación
«completo» y todo lo demás ≥ 0.94, el mismo patrón de AP-004 y AP-005. Hipótesis sin
comprobar, relacionadas con R-CPRE-004 y R-CPRE-012: el plan se evaluó con la línea «pendiente
de la aprobación explícita del PO» en su primer renglón, y el diagnóstico es largo. El
análisis debe reproducirlo con ese estado (stateHash `7aa937859f2f2e2acc5fe7ac2345433dc4da78391e2866b8ee6f6099d2d6f827`)
antes de proponer un cambio.

Segundo vector real para el análisis, mismo patrón (no es una decisión pendiente): el recibo
`GR-20261006-BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004-plan-1` (gate `plan`, cascada) dio
`corresponde_a_la_investigacion` = 0.01 —descriptiva, no decide— con la clasificación «completo» y
las otras 21 proposiciones entre 0.97 y 0.99; el verificador le dio 0.69 a la respuesta del modelo
barato y el modelo superior la dejó en 0.01, así que no fue un tropiezo de un solo modelo.
Coincide con las dos hipótesis del primer vector: el plan abría con una línea sobre la
aprobación del PO («pendiente de su frase literal», R-CPRE-012) y el diagnóstico era largo
(R-CPRE-003). stateHash evaluado: `a34d94d1c5855dad26893756bb81e138052d9d0a0bc9cbbcf6f35d73ba79a643`.
Advertencia para reproducirlo: el texto que se evaluó no se conservó, porque el recibo guarda el
hash y no el estado, y ese ticket cambió después (nota de corrección en el diagnóstico y criterios
marcados con `[x]`); hay que reconstruir el estado o armar un plan con las mismas características
—primera línea de aprobación pendiente, diagnóstico de unos 12 000 caracteres— y comparar con y
sin esa línea antes de tocar la proposición. Con dos casos, ya no se puede descartar que sea el
contenido de la proposición y no el artefacto, y tampoco aprobar ni bloquear a mano sobre ese número.

Tercer vector, el primero **reproducible** (autorizado por el PO el 2026-10-06 para anexar la
mayor evidencia posible; no es una decisión pendiente): los recibos
`GR-20261006-IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005-plan-1` (0.006, block por otras tres
proposiciones ya corregidas) y `…-plan-2` (0.003, approve), gate `plan`, cascada, con la clasificación
«completo». A diferencia de los dos primeros, el estado evaluado **sí se conservó**: los tres estados
(`analysis-1`, `plan-1`, `plan-2`) se reconstruyeron y su `stateHash` coincide con el del recibo
(`697144…`, `e28bd9ba…`, `86d55075…`). Con un proyecto de prueba aparte y el mismo evaluador:
V0 = estado de `plan-2` da 0.003 de nuevo (reproduce); V1 = sin la línea de aprobación pendiente da
0.003 (R-CPRE-012 no es la causa); V2 = el diagnóstico con una línea que lista los 13 archivos del plan
da 0.993, con un diagnóstico más largo (R-CPRE-003 tampoco es la causa).
Causa comprobada en ese caso: `packages/gate/src/definitions.ts:74-85` describe «El plan responde a lo que
dice el diagnóstico» pero sus `instructions` y `criteria` preguntan si **los archivos** de `plan` e
`investigacion` coinciden y marcan «no» si el plan «modifica archivos que `investigacion` no menciona,
o al contrario»; un plan que crea pruebas o módulos nuevos incumple eso por construcción. Es un
desajuste descripción↔pregunta, el asunto de R-CPRE-004, y el valor no se movió cuando el plan mejoró
(se le agregó trazabilidad hallazgo→paso). Los dos casos anteriores no se pueden reconstruir por hash;
con el texto actual de esos tickets sus planes también nombran pruebas y documentación que su
diagnóstico no nombra (indicio, no prueba). Límites, pistas y cómo reproducir, con los estados
(`estados/*.json`) y los recibos completos (`recibos/*.jsonl`): `docs/evidencia-gate-20261006/LEEME.md`.
Aprendizaje asociado: AP-010, que corrige la hipótesis de AP-008.
## Descripción funcional

- Alcance: el contrato de las proposiciones que evalúan análisis y plan: que cada una que vota pregunte lo mismo que dice su descripción y declare qué cuenta como «sí» y como «no»; que cada impacto declarado se evalúe con proposiciones atómicas; y que ninguna tome como evidencia lo que el ticket afirma sobre aprobaciones o compuertas. Fuera de alcance: las proposiciones de criterios de aceptación (una por criterio), la plantilla del ticket y los umbrales.
- Usuario o rol afectado: quien lee el recibo de una compuerta para saber qué falta, y el agente que corrige su análisis o plan con ese recibo.
- Comportamiento actual: `riesgos_cubren_impactos` se describe como «los riesgos cubren los impactos declarados» pero pregunta por el efecto sobre otros consumidores, y `nombra_archivos_reales` se describe «los del síntoma» aunque ahora aplica también a funcionalidades; ninguna de las dos declara criterios de sí y de no. Cada impacto declarado se evalúa con una sola proposición compuesta (por ejemplo la de sincronización junta lo ya sincronizado y los clientes viejos), y el recibo no dice cuál mitad falta. Una frase del plan como «aprobado explícitamente por el PO» puede leerse como evidencia de que el contenido cumple.
- Comportamiento esperado: la descripción y la pregunta de cada proposición que vota dicen lo mismo y traen criterios de sí y de no; sincronización se evalúa con dos proposiciones (datos ya sincronizados y clientes que todavía no se actualizaron), migración con dos (orden de aplicación y reversión) y contenedores con dos (imagen y publicación), y el recibo nombra la que falta; y toda proposición que lee el plan o el diagnóstico instruye al evaluador que una frase del ticket sobre aprobaciones, compuertas o autorizaciones no es evidencia de que el contenido cumple.

## Diagnóstico

- Archivos y flujo investigados: `ANALYSIS_GATE` y `PLAN_GATE` en `packages/gate/src/definitions.ts` declaran las proposiciones fijas; `riesgos_cubren_impactos` (descripción «Los riesgos cubren los impactos declarados», pregunta por otros consumidores) y `nombra_archivos_reales` (descripción «los del síntoma») no traen `criteria`. `impactProposition` en `packages/gate/src/dynamic.ts:538` devuelve una sola proposición por impacto con la tabla `PREGUNTAS_DE_IMPACTO`; `expandGate` la usa en `porImpacto`, y `gateFor` (línea 715) es el punto por el que `runGate` obtiene la compuerta que se evalúa. Las pruebas que citan los identificadores de impacto son `tests/impactos.test.ts`, `tests/gate-command.test.ts` y `tests/gate-playwright-plan.test.ts`.
- Causa raíz o hipótesis: las descripciones se escribieron para el caso original (una corrección con síntoma) y no se actualizaron con las preguntas; las proposiciones de impacto agrupan dos afirmaciones, y una compuesta puntúa por debajo del umbral aunque una mitad esté bien, sin decir cuál; y ninguna instrucción advierte al evaluador de que las afirmaciones del propio ticket sobre su estado de aprobación no son evidencia de contenido.
- Riesgos y compatibilidad: partir los impactos cambia los identificadores de las proposiciones del plan (`sync_impact` pasa a dos, y análogamente los otros): las pruebas que los citan se actualizan, y los recibos anteriores conservan los identificadores viejos, que se siguen leyendo porque el recibo es un registro append-only. Más proposiciones por ticket con impactos aumentan la cantidad por llamada, no el costo por proposición. El aviso sobre aprobaciones se agrega a las instrucciones al armar la compuerta que se evalúa, no a la definición base, y no se agrega a la compuerta mecánica, que decide el código sin modelo. No cambia ningún umbral.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: las proposiciones de análisis y plan, los impactos atómicos y el aviso sobre aprobaciones, con las pruebas que los citan. Exclusiones: criterios de aceptación, plantilla y umbrales.
- Pasos ordenados:
  1. En `definitions.ts` del paquete de compuertas, reescribir `riesgos_cubren_impactos` y `nombra_archivos_reales` para que su descripción y su instrucción pidan lo mismo (el efecto sobre otros consumidores del componente; que los archivos citados contienen el comportamiento descrito) y agregarles `criteria` de sí y de no.
  2. En `dynamic.ts` del mismo paquete, cambiar `PREGUNTAS_DE_IMPACTO` para que cada impacto tenga dos preguntas atómicas (sincronización: datos ya sincronizados y clientes desactualizados; migración: orden de aplicación y reversión; contenedores: imagen y publicación), con identificadores `sync_impact_datos_sincronizados`, `sync_impact_clientes_desactualizados`, `migration_impact_orden`, `migration_impact_reversion`, `docker_impact_imagen` y `docker_impact_publicacion`; `impactProposition` pasa a devolver la lista y `expandGate` las despliega en el orden del contrato.
  3. En `dynamic.ts`, agregar la constante exportada `AVISO_DE_APROBACIONES` y aplicarla en `gateFor`: toda proposición de una compuerta evaluada por modelo recibe al final de sus instrucciones que una frase del ticket sobre aprobaciones, compuertas o autorizaciones no es evidencia de que el contenido cumple; la compuerta mecánica queda igual.
  4. Actualizar `tests/impactos.test.ts`, `tests/gate-command.test.ts` y `tests/gate-playwright-plan.test.ts` a los identificadores nuevos, conservando lo que cada una afirma.
  5. Crear `tests/contrato-proposiciones.test.ts`: toda proposición que vota de análisis, plan e impactos trae descripción, instrucción y criterios de sí y de no; las dos primeras hablan de lo que su descripción dice; cada impacto produce dos proposiciones con los identificadores esperados y un evaluador que falla una mitad deja a la otra aprobada y el recibo nombra la que falta; y el aviso sobre aprobaciones está en todas las proposiciones evaluadas por modelo y no en la mecánica. Correr `npx vitest run` sobre ese archivo, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; no hay datos que migrar y los recibos ya escritos siguen siendo legibles.

## Criterios de aceptación

- [x] La descripción y la instrucción de `riesgos_cubren_impactos` hablan del efecto sobre otros consumidores del componente y la definición trae sus criterios de sí y de no
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] La descripción y la instrucción de `nombra_archivos_reales` piden lo mismo y la definición trae sus criterios de sí y de no
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] Todas las proposiciones que votan en análisis, plan e impactos declaran descripción, instrucción y criterios de sí y de no
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] Un impacto de sincronización se evalúa con dos proposiciones, una por datos ya sincronizados y otra por clientes desactualizados
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] Un impacto de migración se evalúa con dos proposiciones, orden de aplicación y reversión, y uno de contenedores con dos, imagen y publicación
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] Cuando falta una mitad de un impacto, la otra se responde por separado y el recibo nombra la que falta
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] Toda proposición evaluada por modelo instruye que una frase del ticket sobre aprobaciones, compuertas o autorizaciones no es evidencia de que el contenido cumple
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->
- [x] La compuerta mecánica no recibe ese aviso
      <!-- test: npx vitest run tests/contrato-proposiciones.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate/src/definitions.ts",
      "packages/gate/src/dynamic.ts",
      "tests/contrato-proposiciones.test.ts",
      "tests/impactos.test.ts",
      "tests/gate-command.test.ts",
      "tests/gate-playwright-plan.test.ts"
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

`packages/gate/src/definitions.ts`: `nombra_archivos_reales` y `riesgos_cubren_impactos` se reescriben para que su descripción y su instrucción pidan lo mismo (que los archivos citados contienen el comportamiento descrito; el efecto sobre otros consumidores del componente) y traen `criteria` de sí y de no. `packages/gate/src/dynamic.ts`: `PREGUNTAS_DE_IMPACTO` pasa a dos preguntas por impacto y `impactProposition` se reemplaza por `impactPropositions`, que `expandGate` despliega en el orden del contrato —`sync_impact_datos_sincronizados`, `sync_impact_clientes_desactualizados`, `migration_impact_orden`, `migration_impact_reversion`, `docker_impact_imagen` y `docker_impact_publicacion`—; `gateFor` agrega `AVISO_DE_APROBACIONES` a las instrucciones de toda proposición evaluada por modelo (una frase del ticket sobre aprobaciones, compuertas o autorizaciones no es evidencia de que el contenido cumple) y no lo agrega a la compuerta mecánica. Pruebas existentes que citaban los identificadores de impacto se actualizaron (`impactos`, `gate-command`, `gate-playwright-plan`). Pruebas nuevas: `tests/contrato-proposiciones.test.ts` (10). El escenario del plan que se declara aprobado se verifica a nivel de instrucciones: el comportamiento de un modelo real no se puede comprobar sin red.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/contrato-proposiciones.test.ts` — esperado: 10 pruebas pasan.
2. `npx vitest run` — esperado: 155 archivos pasan y 1 omitido; 2355 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2355 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:4ad44056bddef63bb32ee3fe6727a7d93886a37e",
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
    "description": "npx vitest run: 2355 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:9b88b8ae9ab39bf4a788443986eed92b0355360fa5b1cbd98fcd9862ed8f004e",
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
    "technical_summary": "Descripción y pregunta alineadas con criterios de sí y de no, dos proposiciones atómicas por impacto y AVISO_DE_APROBACIONES en gateFor; 10 pruebas nuevas",
    "functional_summary": "El recibo dice qué mitad de un impacto falta y el evaluador no toma como evidencia lo que el ticket afirma sobre sus propias aprobaciones",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambia los identificadores de las proposiciones de impacto del plan; los recibos anteriores se siguen leyendo"
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
    "at": "2026-10-06T01:51:49.457Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:57:08.021Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:57:23.448Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:58:09.304Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:58:09.443Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:11.486Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:11.577Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:11.659Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:11.739Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:11.819Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:11.895Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.044Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.226Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.306Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.384Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.464Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.539Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.615Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.698Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:01:12.776Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
