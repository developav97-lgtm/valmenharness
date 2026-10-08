---
schema_version: 2
id: IMPROVEMENT-ADAPTER-CONTRATO-CORRIDA-20261008
title: Declarar en AGENTS.md cómo se pide y se orquesta una corrida
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
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ADAPTER-CONTRATO-CORRIDA-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: AGENTS.md y las plantillas que lo generan declaran cómo se pide una corrida ("ejecuta el feature X" o "los tickets de hoy, con N a la vez"), que solo el orquestador toca el checkout principal, que cada subagente trabaja en su worktree y no corre la suite completa, que la aprobación sale de la política por tipo de ticket y que SECURITY y despliegue son siempre de una persona. Respeta el tope de 9800 bytes de las plantillas (tests/plantillas-compactas.test.ts) y se regenera solo con la proyección.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que `WORKFLOW_TEMPLATE` de `packages/adapter/src/templates.ts` declare, en una sección nueva «### Corrida orquestada» bajo «### Corrida delegada», cómo se pide y se orquesta una corrida: se pide en la sesión («ejecuta el feature X» o «los tickets de hoy, con N a la vez», 3 por defecto); esa sesión es el orquestador y lanza un subagente por ticket en su propio worktree y rama; solo el orquestador toca el checkout principal e integra; el subagente corre las pruebas de su ticket y no la suite completa; la aprobación sale de la política por tipo de ticket (autorización vigente y ticket elegible, o en lote al PO); SECURITY y despliegue son siempre de una persona. Fuera de alcance: la skill `corrida-orquestada` y el puntero a ella (FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008), los comandos `journey next --wave`, `journey brief` y `journey worktree`, la vista de Mission Control, el contrato de aprobación (IMPROVEMENT-ADAPTER-CONTRATO-APROBACION-20261007) y correr `valmen sync` en otros proyectos.
- Usuario o rol afectado: el agente que abre una sesión en un proyecto con el harness y lee `AGENTS.md`, y el PO que pide la corrida.
- Comportamiento actual: `AGENTS.md` solo conoce la «Corrida delegada» (`packages/adapter/src/templates.ts:53-55`) y la jornada por launchd; no dice cómo se pide una corrida en sesión, quién es el orquestador, que cada subagente trabaja en su worktree ni quién aprueba. Un agente sin skills no puede deducir que solo el orquestador toca el checkout principal.
- Comportamiento esperado: el `AGENTS.md` proyectado por `valmen sync` trae la sección con esas seis reglas en unos 570 B, y las tres plantillas siguen bajo un tope ajustado y justificado.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la plantilla se escribió antes de que el PO reemplazara la jornada por la corrida orquestada (`docs/propuesta-corrida-orquestada.md`, secciones 2 y 2.1). `WORKFLOW_TEMPLATE` (`packages/adapter/src/templates.ts:53-55`) solo menciona `corrida-delegada`, y es la única fuente del texto que `valmen sync` proyecta en `AGENTS.md`. Memoria consultada (`buscar_memoria` «AGENTS.md corrida orquestada contrato plantilla adapter»): sin una causa raíz previa; el precedente de redacción es IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005 (R-QAAG-009), que subió el tope de 9 400 a 9 800 B.
- Hipótesis pendientes: ninguna sobre la causa. Restricción medida: las tres plantillas pesan 9 796 B (7 210 + 876 + 1 710, medido importando las constantes) y el tope de `tests/plantillas-compactas.test.ts:41` es 9 800 B: quedan 4 B. La sección propuesta pesa 569 B, de modo que el tope sube de 9 800 a 10 400 B. Choque con los hermanos, a resolver al integrar: el plan de FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008 (paso 4) agrega un puntero de una línea en la frase de «Corrida delegada» (`:55`) y el de IMPROVEMENT-ADAPTER-CONTRATO-APROBACION-20261007 sube el tope a 10 200 B con 422 B. Ambos tocan la línea de `TOPE_BYTES`; este ticket agrega una sección aparte y no edita la frase de `:55`, de modo que solo el valor del tope puede chocar y el total integrado es la suma de los tres añadidos.
- Consumidores afectados: `projectAgentsMd` y `valmen sync` (este repositorio incluido); las pruebas que afirman el texto o el tamaño: `tests/plantillas-compactas.test.ts` (tope y frases fijas), `tests/adapters.test.ts:204-215` (secciones proyectadas), `tests/agents-md-tamano.test.ts` (presupuesto del `AGENTS.md` proyectado) y `tests/respuesta-agents-md.test.ts`. El motor no consume la plantilla.
- Archivos y flujo investigados: `packages/adapter/src/templates.ts:19-95`; `tests/plantillas-compactas.test.ts:30-100`; `tests/adapters.test.ts:204-215`; `docs/propuesta-corrida-orquestada.md` (2.1, pasos 1 a 5); planes de los tres tickets hermanos.
- Riesgos y compatibilidad: (1) cada byte se carga en cada sesión: el aumento es de 569 B y se justifica en el comentario del tope. (2) La regla nombra comportamientos cuyos comandos aún no existen (`journey next --wave`, worktrees): el texto no cita ningún comando, solo roles y límites, para seguir siendo cierto cuando lleguen. (3) La política de aprobación se enuncia como condición («autorización vigente y ticket elegible»), igual que el contrato de aprobación, sin prometer aprobación automática. (4) Cambio de texto: no hay datos que preservar.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es texto de una plantilla; `valmen sync` en cada proyecto lo corre una persona.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: una sección de texto en `WORKFLOW_TEMPLATE` de `packages/adapter/src/templates.ts`, el tope de bytes y sus pruebas. Exclusiones: la skill, el puntero de una línea del hermano, el motor, Mission Control y `valmen sync` en otros proyectos.
- Pasos ordenados:
  1. Pruebas en rojo en `tests/plantillas-compactas.test.ts`: un caso nuevo sobre `WORKFLOW_TEMPLATE` aplanado que afirma cómo se pide la corrida con 3 a la vez por defecto (C1), que la sesión es el orquestador y lanza un subagente por ticket (C2), que cada subagente trabaja en su worktree y rama (C3), que solo el orquestador toca el checkout principal (C4), que el subagente corre las pruebas de su ticket y no la suite completa (C5), la política de aprobación por tipo de ticket (C6) y que SECURITY y despliegue son siempre de una persona (C7); caso de control: la sección no contiene `git push`, `--force` ni `--no-verify` (C8). (C1 a C8)
  2. En `tests/adapters.test.ts`, junto a la aserción de `:213`, comprobar que `projectAgentsMd` proyecta la sección «Corrida orquestada» (C9).
  3. En `tests/plantillas-compactas.test.ts:36-41` subir `TOPE_BYTES` de 9 800 a 10 400 B, anotar en su comentario que el aumento es de la sección de corrida orquestada (569 B medidos) y su «Por qué» en una línea, y cambiar el título del caso de `:53` a 10 400 B (C10).
  4. En `packages/adapter/src/templates.ts`, `WORKFLOW_TEMPLATE`: insertar «### Corrida orquestada» después del párrafo de «### Corrida delegada» (`:55`), sin tocar la frase de `:55` ni las frases que fijan otras pruebas. (C1 a C8, C11)
  5. Ejecutar `npx valmen sync` para regenerar `AGENTS.md` (nunca a mano) y `npx valmen sync --check` para confirmar que quedó al día. (C9, C12)
  6. Correr `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/agents-md-tamano.test.ts tests/respuesta-agents-md.test.ts`, `npx tsc --noEmit -p tsconfig.json` y `npx valmen secrets`. (C1 a C12)
  7. Entrega: contrato de pruebas para el responsable con los comandos del paso 6 ejecutados desde la raíz del worktree (resultado esperado: archivos en verde, `tsc` sin errores, `sync --check` sin diferencias); validación manual: leer la sección en `AGENTS.md` y confirmar que coincide con la sección 2.1 de `docs/propuesta-corrida-orquestada.md`; requisito de ambiente: Node 24 y `node_modules` instalados. El ticket pasa a `awaiting_user_tests` y el commit solo tras la confirmación. Al integrar con los hermanos, el tope final es la suma de los tres añadidos.
- Impactos declarados: sincronización: ninguna, el `AGENTS.md` de otros proyectos solo cambia cuando una persona corre `valmen sync`. Migración: ninguna. Contenedores: ninguno, sin imagen ni publicación.
- Rollback (obligatorio): revertir el commit del ticket (`git revert <hash>`) y correr `npx valmen sync` para regenerar `AGENTS.md`; los `AGENTS.md` de otros proyectos no cambian hasta su próximo `valmen sync`, y no hay datos que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: `WORKFLOW_TEMPLATE` declara que la corrida se pide en la sesión con 3 a la vez por defecto
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C2: `WORKFLOW_TEMPLATE` declara que esa sesión es el orquestador y lanza un subagente por ticket
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C3: `WORKFLOW_TEMPLATE` declara que cada subagente trabaja en su worktree y su rama
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C4: `WORKFLOW_TEMPLATE` declara que solo el orquestador toca el checkout principal
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C5: `WORKFLOW_TEMPLATE` declara que el subagente corre las pruebas de su ticket y no la suite completa
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C6: `WORKFLOW_TEMPLATE` declara que la aprobación sale de la política por tipo de ticket
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C7: `WORKFLOW_TEMPLATE` declara que SECURITY y despliegue son siempre de una persona
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C8: la sección nueva no contiene `git push`, `--force` ni `--no-verify` (caso de control)
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C9: el `AGENTS.md` que proyecta `projectAgentsMd` contiene la sección «Corrida orquestada»
      <!-- test: npx vitest run tests/adapters.test.ts -->
- [x] C10: las tres plantillas fijas suman 10 400 B o menos
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C11: las pruebas existentes de la plantilla siguen pasando sin cambiar sus frases
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts tests/respuesta-agents-md.test.ts -->
- [x] C12: el `AGENTS.md` proyectado sigue dentro de su presupuesto de tamaño
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de IMPROVEMENT-ADAPTER-CONTRATO-CORRIDA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/templates.ts",
      "tests/adapters.test.ts",
      "tests/plantillas-compactas.test.ts"
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

- `packages/adapter/src/templates.ts`: sección «### Corrida orquestada» en `WORKFLOW_TEMPLATE`, después de «Corrida delegada», sin tocar la frase existente ni citar comandos.
- `tests/plantillas-compactas.test.ts`: `TOPE_BYTES` de 9 800 a 10 400 B con su comentario y «Por qué», título del caso actualizado y bloque nuevo «la corrida orquestada» (C1 a C8, con caso de control).
- `tests/adapters.test.ts`: `projectAgentsMd` proyecta la sección (C9).
- `AGENTS.md` regenerado con `sync` del worktree (no a mano); CLAUDE.md y skills no cambiaron. Las tres plantillas pesan 10 334 B.

## Pruebas

Contrato de entrega, desde la raíz del worktree (Node 24, `node_modules` instalados):

- `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/agents-md-tamano.test.ts tests/respuesta-agents-md.test.ts` — esperado: 4 archivos y 105 pruebas en verde (resultado obtenido).
- `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores (obtenido).
- `node packages/cli/dist/main.js sync --check` — esperado: archivos al día, sin diferencias (obtenido).
- Validación manual: leer «Corrida orquestada» en `AGENTS.md` y confirmar que coincide con la sección 2.1 de `docs/propuesta-corrida-orquestada.md`.
- Suite completa: no corrida por este agente; la corre el orquestador al integrar.

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:d1654fbfca4900d34164c7bc26aa5460a0ce9671",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:43cfa2bc08e00f0de94aaac79858230eaa330b694b2d0c0710224a72439a10d8",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Declarar en AGENTS.md cómo se pide y se orquesta una corrida",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
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
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-ticket-contrato-corrida",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×103, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16592385 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "date": "2026-10-08",
    "at": "2026-10-08T13:44:13.375Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T15:11:12.131Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T15:11:45.023Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:58.758Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:456eade1dcd50d2b8690b7662a197c057cee33fb208523c8a56dcbd17caaff25\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:59.576Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:456eade1dcd50d2b8690b7662a197c057cee33fb208523c8a56dcbd17caaff25."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:59.576Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T16:06:10.827Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T16:09:18.528Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T16:09:19.833Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:48.463Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:48.826Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:49.227Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:49.631Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:50.031Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:50.456Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:50.945Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:51.382Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:51.796Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:52.205Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:52.611Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:53.011Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:54.533Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:54.698Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:55.003Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
