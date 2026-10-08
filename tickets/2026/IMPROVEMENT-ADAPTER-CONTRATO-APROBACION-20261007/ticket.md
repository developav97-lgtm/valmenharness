---
schema_version: 2
id: IMPROVEMENT-ADAPTER-CONTRATO-APROBACION-20261007
title: Declarar en AGENTS.md la aprobación autónoma y su autorización como acción humana
type: IMPROVEMENT
module: ADAPTER
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ADAPTER-CONTRATO-APROBACION-20261007

## Solicitud original

Parte del sprint: La jornada aprueba los planes elegibles al armarse y la regla queda escrita en AGENTS.md.
- R-APRO-001: La aprobación automática DEBE requerir una autorización persistida creada por una persona
Depende de: SECURITY-MC-AUTORIZACION-APROBACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La aprobación automática DEBE requerir una autorización persistida creada por una persona
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-001: lo cubre SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007 (Guardar autorizaciones de aprobación firmadas, append-only y revocables)
- R-APRO-001: lo cubre SECURITY-MC-AUTORIZACION-APROBACION-20261007 (Crear y revocar autorizaciones de aprobación desde Mission Control y código firmado)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que la plantilla de `AGENTS.md` (`packages/adapter/src/templates.ts`) declare la parte de R-APRO-001 que le toca al contrato del agente: (a) en «Flujo de trabajo», que un análisis o un plan solo se aprueba sin una persona bajo una autorización de aprobación vigente que creó una persona, con la aprobación atribuida a la autorización y no al agente, y que SECURITY, un `block` y un despliegue a producción siguen siendo de una persona; (b) en «Acciones que nunca se automatizan», que crear o ampliar una autorización de aprobación es de una persona y no existe herramienta MCP que lo haga. Fuera de alcance: el almacenamiento y los canales de la autorización (ya cerrados en SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007 y SECURITY-MC-AUTORIZACION-APROBACION-20261007), la aprobación automática en el motor (SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007), el agente revisor (S3), la jornada (FEATURE-ENGINE-JORNADA-APROBACION-20261007), el texto de las skills `planificacion` y `corrida-delegada`, y ejecutar `valmen sync` en los proyectos (lo hace una persona, porque proyecta archivos de cada repositorio).
- Usuario o rol afectado: el agente que lee `AGENTS.md` al empezar una sesión en un proyecto que usa el harness, y el PO, que es quien crea la autorización.
- Comportamiento actual: el `AGENTS.md` proyectado no menciona la autorización de aprobación. «Acciones que nunca se automatizan» solo reserva a una persona la autorización permanente de QA (`packages/adapter/src/templates.ts:93`), y «Gates» y «Continuar un ticket» no dicen quién puede aprobar un plan ni bajo qué autoridad (`packages/adapter/src/templates.ts:47`, `packages/adapter/src/templates.ts:67`). Un agente que lee el contrato no sabe que esa autorización existe, que no puede crearla y que la aprobación que produce no es suya.
- Comportamiento esperado: el `AGENTS.md` proyectado por `valmen sync` dice que la aprobación de un análisis o un plan sin una persona solo vale bajo una autorización de aprobación vigente creada por una persona (`valmen approval-authorize`), atribuida a la autorización; que sin ella la aprobación es de una persona; que SECURITY, un `block` y un despliegue a producción nunca se aprueban así; y lista entre las acciones que nunca se automatizan crear o ampliar esa autorización, sin herramienta MCP. Las plantillas siguen dentro de su tope de tamaño, ajustado y justificado.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la plantilla fija del contrato se escribió antes de que existiera la autorización de aprobación y nadie la actualizó al cerrar S1. `WORKFLOW_TEMPLATE` (`packages/adapter/src/templates.ts:19`) es la única fuente del texto de «Flujo de trabajo» que `valmen sync` proyecta en `AGENTS.md`; su lista de acciones humanas (`packages/adapter/src/templates.ts:85-95`) nombra la autorización de QA (`:93`) pero no la de aprobación, y el párrafo de «Gates» (`:67`) no la menciona. La autorización ya existe en código: `approvalAuthorizeCommand` (`packages/cli/src/commands.ts:3100`) la crea, revoca, lista y canjea; el motor rechaza crearla en una sesión desatendida (`packages/engine/src/approval-authorization.ts:119-123`) y nunca admite SECURITY (`packages/engine/src/approval-authorization.ts:24`, `:165`); los canales aceptados son `cli` y `mission-control` por defecto (`packages/adapter/src/config.ts:1158-1179`); y el MCP solo la lee con `ver_autorizaciones_aprobacion` (`packages/mcp/src/tools.ts:358`), sin herramienta que la cree o amplíe. Memoria consultada (`buscar_memoria` «AGENTS.md aprobación autónoma autorización acción humana adapter contrato»): AP-006, AP-007, AP-009 tratan bloqueos de compuerta y aprobaciones sin firma, no este texto; el precedente directo es IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005 (`tickets/2026/IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005/ticket.md:41`), que hizo lo mismo para la QA por agente (R-QAAG-009).
- Hipótesis pendientes: ninguna sobre la causa. Queda una restricción comprobada que el plan tiene que resolver: las tres plantillas pesan hoy 9 744 B (medido con `node` sobre `WORKFLOW_TEMPLATE` 7 158 + `INVARIANTS_TEMPLATE` 876 + `DELIVERY_TEMPLATE` 1 710) y el tope de `tests/plantillas-compactas.test.ts:41` es 9 800 B: quedan 56 B, y las dos reglas nuevas ocupan unos 400 B.
- Consumidores afectados: `projectAgentsMd` y `valmen sync`, que proyectan la plantilla en el `AGENTS.md` de cada proyecto (este repositorio incluido); las pruebas que afirman el texto de la plantilla: `tests/plantillas-compactas.test.ts:52-100` (tope de bytes, acciones que nunca se automatizan y las frases de R-QAAG-009, que no deben cambiar), `tests/adapters.test.ts:205-215` y `tests/agents-md-tamano.test.ts` (presupuesto del `AGENTS.md` proyectado). No hay consumidor en el motor: la plantilla es texto.
- Archivos y flujo investigados: `packages/adapter/src/templates.ts:19-95` (plantilla de flujo y acciones humanas) y `:121-131` (entrega, con la QA por agente como modelo de redacción); `packages/cli/src/main.ts:249-259` (ayuda de `approval-authorize`); `packages/cli/src/commands.ts:3095-3206`; `packages/engine/src/approval-authorization.ts:1-24`, `:119-165`; `packages/adapter/src/config.ts:1158-1179`; `packages/mcp/src/tools.ts:355-366`; `packages/engine/src/autonomous-run.ts:137-140` (hoy la cola exige la aprobación del plan registrada, R-CTRL-001); `.valmen/features/aprobacion-autonoma-de-planes/spec/aprobacion/spec.md` (R-APRO-001, R-APRO-004, R-APRO-005); `tests/plantillas-compactas.test.ts:30-100`.
- Riesgos y compatibilidad: (1) el tope de 9 800 B se supera con la regla nueva; subirlo tiene precedente (de 9 400 a 9 800 con R-QAAG-009, `tests/plantillas-compactas.test.ts:38-41`), pero cada byte se carga en cada sesión, así que el ajuste se mide y se justifica en el comentario del tope. (2) La aprobación automática en el motor todavía no está implementada (SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007 en `intake`): el texto no debe prometer que el ticket avanza solo, sino decir bajo qué autoridad vale una aprobación sin persona; redactado como condición, es cierto hoy y lo sigue siendo cuando el motor la aplique. (3) Cambiar las frases que fijan las pruebas de R-QAAG-009 (`autorización permanente de QA por agente`, `promover la política a cerrar tickets`, `sin herramienta MCP`) rompería esas pruebas: la línea nueva va aparte. (4) El paso 3 de «Continuar un ticket» («ni se aprueba lo que decide una persona») sigue siendo cierto y no se toca. El cambio es de texto: no hay compatibilidad de datos que preservar.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es texto de una plantilla; `valmen sync` en cada proyecto lo ejecuta una persona y no forma parte del ticket.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: dos adiciones de texto a `WORKFLOW_TEMPLATE` en `packages/adapter/src/templates.ts`, el tope de tamaño de las plantillas y sus pruebas. Exclusiones: el motor de aprobación automática (S2), el agente revisor (S3), la jornada (S4), las skills `planificacion` y `corrida-delegada`, y ejecutar `valmen sync` en los proyectos.
- Texto propuesto (medido: 326 B + 96 B; las plantillas pasan de 9 744 B a 10 166 B):
  - Párrafo nuevo bajo «### Gates», después de `packages/adapter/src/templates.ts:67`: «Un análisis o un plan se aprueba sin una persona solo bajo una **autorización de aprobación** vigente que creó una persona (`valmen approval-authorize`): la aprobación se atribuye a la autorización, nunca al agente. Sin ella aprueba una persona; SECURITY, un `block` y un despliegue a producción, siempre una persona.»
  - Línea nueva en «Acciones que nunca se automatizan», después de `packages/adapter/src/templates.ts:93`: «- Crear o ampliar una autorización de aprobación de análisis y planes (sin herramienta MCP).»
- Pasos ordenados:
  1. Pruebas en rojo en `tests/plantillas-compactas.test.ts`: un caso nuevo `it(... (R-APRO-001))` que afirma sobre `WORKFLOW_TEMPLATE` aplanado la condición de la autorización creada por una persona (C1), la atribución a la autorización y no al agente (C2), y que SECURITY, `block` y despliegue a producción quedan para una persona (C3); y, sobre el tramo desde «### Acciones que nunca se automatizan», la línea de la autorización de aprobación con «sin herramienta MCP» (C4). En `tests/adapters.test.ts`, junto a la aserción de `:213`, que `projectAgentsMd` proyecta la regla nueva en el `AGENTS.md` de un proyecto (C7). (C1, C2, C3, C4, C7)
  2. En `tests/plantillas-compactas.test.ts:36-41` subir `TOPE_BYTES` de 9 800 a 10 200 B y anotar en su comentario que el aumento es de R-APRO-001 (unos 420 B medidos), como se hizo con R-QAAG-009; el título del caso de `:52` pasa a decir 10 200 B. (C6)
  3. En `packages/adapter/src/templates.ts`, `WORKFLOW_TEMPLATE`: insertar el párrafo propuesto después del de «### Gates» (`:67`) y la línea propuesta después de la de la autorización de QA (`:93`), sin tocar las frases que fijan las pruebas de R-QAAG-009 ni la lista de acciones existente. (C1, C2, C3, C4, C5)
  4. Correr `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/agents-md-tamano.test.ts tests/respuesta-agents-md.test.ts`, después la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`. (C1–C8)
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores. El `AGENTS.md` de cada proyecto solo cambia cuando una persona corre `valmen sync`.
- Rollback (obligatorio): revertir el commit del ticket (`git revert <sha>`); los `AGENTS.md` ya proyectados no cambian hasta que alguien vuelva a correr `valmen sync`, y no hay datos ni configuración que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-APRO-001): `WORKFLOW_TEMPLATE` declara que un análisis o un plan solo se aprueba sin una persona bajo una autorización de aprobación vigente que creó una persona
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C2 (R-APRO-001): `WORKFLOW_TEMPLATE` declara que esa aprobación se atribuye a la autorización, nunca al agente
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C3 (R-APRO-004, R-APRO-005): `WORKFLOW_TEMPLATE` declara que SECURITY, un `block` y un despliegue a producción siempre los aprueba una persona
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C4 (R-APRO-001): «Acciones que nunca se automatizan» nombra crear o ampliar una autorización de aprobación, sin herramienta MCP
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C5: las pruebas existentes de las acciones que nunca se automatizan y de R-QAAG-009 siguen pasando sin cambiar sus frases
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C6: las tres plantillas fijas suman 10 400 B o menos (tope sin cambios; caben 10 390 B)
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C7: el `AGENTS.md` que proyecta `projectAgentsMd` contiene la regla de la autorización de aprobación
      <!-- test: npx vitest run tests/adapters.test.ts -->
- [x] C8: el `AGENTS.md` proyectado sigue dentro de su presupuesto de tamaño
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/templates.ts`: párrafo de la autorización de aprobación bajo «### Gates» y línea en «Acciones que nunca se automatizan» (+412 B). El espacio real era 7 B (las plantillas pesaban 10 393 B con tope 10 400, no 9 744/9 800 del plan), así que se recortaron ~415 B de redacción ya existente sin tocar frases que fijan las pruebas; el tope `TOPE_BYTES` queda en 10 400. Resultado: 10 390 B.
- `AGENTS.md` regenerado con `node packages/cli/dist/main.js sync`.
- Pruebas: caso R-APRO-001 en `tests/plantillas-compactas.test.ts` y aserción en `tests/adapters.test.ts`.

## Pruebas

- Directorio: raíz del worktree. Comando: `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/agents-md-tamano.test.ts tests/respuesta-agents-md.test.ts` y `npx tsc --noEmit -p tsconfig.json`.
- Resultado esperado: todo en verde; plantillas 10 390 B <= 10 400 B.
- Validación manual: leer el párrafo bajo «### Gates» y la línea nueva en «Acciones que nunca se automatizan» de `AGENTS.md`.
- Ambiente: Node 24; `npm run build` antes de `sync`.

## QA

```json
[]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: sin números de la sesión del subagente",
    "confidence": "low",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:56.791Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-08T02:18:09.787Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-08T02:19:30.165Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T22:14:33.342Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"y sí apruebo el plan CONTRATO-APROBACION (La B de cierre: prueba y cierra lo que puedas con comandos)\",\"planHash\":\"sha256:e34f30771d1da8b2871426aff89d6e9c4d3cc253318184ca85cb9404c9ecfdb0\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T22:14:33.651Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:e34f30771d1da8b2871426aff89d6e9c4d3cc253318184ca85cb9404c9ecfdb0."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T22:14:33.651Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T22:16:44.563Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T22:17:02.360Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T22:17:02.641Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
