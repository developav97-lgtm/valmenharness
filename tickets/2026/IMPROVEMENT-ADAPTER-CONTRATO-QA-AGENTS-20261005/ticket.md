---
schema_version: 2
id: IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005
title: Declarar en AGENTS.md la QA por agente y la autorización como acción humana
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
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-009: AGENTS.md DEBE declarar la QA por agente como vía de entrega y la autorización como acción humana
Depende de: SECURITY-ENGINE-QA-POR-POLITICA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que la plantilla de AGENTS.md declare la QA por agente como vía de entrega y la autorización como acción humana (R-QAAG-009): en «Entrega y documentación», la QA ejecutada por un agente bajo una autorización vigente; en «Acciones que nunca se automatizan», crear o ampliar una autorización permanente de QA y promover la política a cerrar tickets. Fuera de alcance: ejecutar `valmen sync` en los proyectos (lo hace una persona, ya que proyecta archivos de cada repositorio) y cambiar el motor de QA.
- Usuario o rol afectado: cualquier agente que lea AGENTS.md de un proyecto adoptado, que debe saber que la autorización de QA no es suya, y el responsable, que ve la regla escrita donde los agentes la leen.
- Comportamiento actual: la plantilla de entrega (`DELIVERY_TEMPLATE` en `packages/adapter/src/templates.ts:120`) no menciona la QA por agente y la lista de acciones que nunca se automatizan (`packages/adapter/src/templates.ts:85`) no incluye la autorización de QA ni la promoción; un AGENTS.md proyectado hoy no dice nada de ello.
- Comportamiento esperado: el AGENTS.md proyectado por `valmen sync` trae en «Entrega y documentación» un párrafo que dice que la QA puede ejecutarla un agente solo bajo una autorización vigente creada por una persona, en worktree limpio y con el cierre atribuido a la autorización, empezando en sombra; y en «Acciones que nunca se automatizan» una línea que reserva a una persona crear o ampliar una autorización permanente de QA y promover la política a cerrar, sin herramienta MCP para ello. La plantilla sigue dentro del presupuesto de tamaño de AGENTS.md.

## Diagnóstico

- Archivos y flujo investigados: las secciones viven como constantes de plantilla en `packages/adapter/src/templates.ts` (`DELIVERY_TEMPLATE` y la lista de acciones humanas de la plantilla de estándares) y se proyectan a AGENTS.md con `projectAgentsMd` en `packages/adapter/src/projection.ts`; las pruebas que fijan su texto y su tamaño son `tests/adapters.test.ts`, `tests/plantillas-compactas.test.ts` y `tests/agents-md-tamano.test.ts`; el AGENTS.md de este repositorio es una proyección commiteada que se regenera con `valmen sync`.
- Causa raíz o hipótesis: el síntoma es que un agente que lee AGENTS.md no encuentra dicho que la autorización de QA por agente es una acción humana: la causa comprobada es que la plantilla se escribió antes de existir esa autorización. No hay lógica que cambiar: es texto de plantilla, y los controles reales (canal humano, sesión atendida, sin herramienta MCP) ya viven en el motor. Hipótesis a confirmar: que el texto agregado no empuje AGENTS.md sobre su presupuesto de tamaño.
- Riesgos y compatibilidad: (a) las pruebas que comparan la proyección con un texto exacto deben actualizarse con el texto nuevo; (b) el AGENTS.md ya proyectado en cada proyecto cambia solo cuando una persona corre `valmen sync`, así que nada se modifica por sorpresa; (c) Consumidores comprobados con búsqueda: `DELIVERY_TEMPLATE` lo consumen la proyección de AGENTS.md y las pruebas citadas; el texto no se usa como dato por ningún otro código; (d) la regla escrita no sustituye al control en código, que es lo que de verdad impide la autoaprobación.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: dos adiciones de texto a la plantilla de AGENTS.md y sus pruebas. Exclusiones: correr `valmen sync` en proyectos y cambios al motor de QA.
- Pasos ordenados:
  1. En `packages/adapter/src/templates.ts` agregar a `DELIVERY_TEMPLATE`, antes del párrafo del consumo de IA, un párrafo en español: la QA también puede ejecutarla un agente, solo bajo una autorización vigente creada por una persona, en worktree limpio con `qa-agent`, con el ciclo atribuido a la autorización y empezando en sombra hasta que una persona promueva la política; sin autorización vigente la QA sigue siendo de una persona.
  2. En el mismo `packages/adapter/src/templates.ts` agregar a la lista «Acciones que nunca se automatizan» la línea: crear o ampliar una autorización permanente de QA por agente, o promover la política a cerrar tickets; las decide una persona con su frase y no existe herramienta MCP que lo haga.
  3. Actualizar `tests/adapters.test.ts` y `tests/plantillas-compactas.test.ts` donde fijen el texto de esas secciones, y agregar en `tests/plantillas-compactas.test.ts` un caso que compruebe que el AGENTS.md proyectado de un proyecto adoptado contiene ambas reglas.
  4. Correr `npx vitest run tests/adapters.test.ts tests/plantillas-compactas.test.ts tests/agents-md-tamano.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; los AGENTS.md ya proyectados no cambian hasta que alguien corra `valmen sync`.

## Criterios de aceptación

- [x] El AGENTS.md proyectado declara en «Entrega y documentación» la QA ejecutada por agente bajo una autorización vigente
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] El AGENTS.md proyectado declara en «Acciones que nunca se automatizan» la creación o ampliación de una autorización permanente de QA y la promoción de la política
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] El AGENTS.md sigue dentro de su presupuesto de tamaño y las pruebas de plantillas pasan
      <!-- test: npx vitest run tests/adapters.test.ts tests/agents-md-tamano.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/templates.ts",
      "tests/plantillas-compactas.test.ts",
      "AGENTS.md"
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

- `packages/adapter/src/templates.ts`: `DELIVERY_TEMPLATE` declara que la QA puede ejecutarla un agente solo bajo una autorización vigente creada por una persona (worktree limpio con `qa-agent`, ciclo atribuido a la autorización, sombra hasta la promoción; sin autorización la QA es de una persona), y «Acciones que nunca se automatizan» reserva a una persona crear o ampliar una autorización permanente de QA y promover la política (sin herramienta MCP).
- `AGENTS.md` de este repositorio: regenerado solo con la proyección del motor (3 líneas) para que siga idéntica a lo que produce `valmen sync`; el resto de `valmen sync` (CLAUDE.md, settings, skills) no se ejecutó.
- `tests/plantillas-compactas.test.ts`: caso nuevo de R-QAAG-009 y tope de las plantillas de 9 400 a 9 800 B (las dos reglas suman unos 420 B; el margen previo era de 80 B). Subir ese tope es una decisión revisable.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/agents-md-tamano.test.ts tests/dogfooding-registro.test.ts` → pasan.
- Suite completa: `npx vitest run` → 190 archivos, 2766 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
<!-- verify: manual -->

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:6fd72edaaeb5999ec2f5e2683d08575f10265987",
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
    "reference": "worktree:sha256:096c2dbb5d970c288cc1801a6efdd5f8ce30da429c5960c64c5c837042be477d",
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
    "technical_summary": "Dos reglas de QA por agente en la plantilla de AGENTS.md, con su prueba y el tope de tamaño ajustado.",
    "functional_summary": "Los agentes leen en AGENTS.md que la autorización de QA es una acción humana.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno hasta que alguien corra valmen sync en cada proyecto"
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
    "at": "2026-10-06T01:51:51.504Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T05:27:08.092Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T05:27:28.932Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T05:27:51.886Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:b9f0de2ebf8d01df0cbd0ff26c8fa2b9f12628d1f065aaacf2d1a54ad56d682e\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T05:27:52.031Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:b9f0de2ebf8d01df0cbd0ff26c8fa2b9f12628d1f065aaacf2d1a54ad56d682e."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T05:27:52.031Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T05:27:52.129Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.099Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.207Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.300Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.393Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.486Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.579Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.713Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.873Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:14.963Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:15.051Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:15.143Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:15.232Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:15.319Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:15.411Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T05:31:15.503Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
