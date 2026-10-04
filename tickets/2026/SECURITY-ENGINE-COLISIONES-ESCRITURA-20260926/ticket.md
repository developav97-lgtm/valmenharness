---
schema_version: 2
id: SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926
title: Detectar colisiones de escritura antes de paralelizar
type: SECURITY
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
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-003: Colisiones de escritura antes de paralelizar — DEBE contrastar los archivos que cada plan declara tocar y aplicar la política
Depende de: FEATURE-ENGINE-RUN-AUTONOMO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: preparar la decisión mecánica que debe ocurrir antes de que un futuro despachador ejecute dos tickets autónomos en paralelo dentro del mismo repositorio.
- Usuario o rol afectado: responsable que habilita autonomía y el despachador futuro; no cambia la ejecución secuencial existente de `valmen run`.
- Comportamiento actual: `valmen run --ticket` y `valmen run --queue` despachan un único ticket en orden estable. La política declara `max-concurrent`, pero no existe aún una comparación de las rutas de escritura de un lote.
- Comportamiento esperado: el motor recibe tickets con rutas estructuradas en `Puntos[].affected_files`, detecta las rutas comunes de forma determinista y produce una decisión para el lote según `warn`, `serialize` o `block`, sin iniciar ejecutores ni inferir archivos desde prosa.

## Diagnóstico

- Síntoma observable: una política puede declarar `max-concurrent: 2` y dos tickets aprobados pueden declarar la misma ruta en `Puntos[].affected_files`; el motor actual no ofrece ningún resultado que diga si ambos pueden arrancar juntos, cuál debe esperar o si deben bloquearse. Hoy no provoca una escritura concurrente porque `valmen run` selecciona uno solo, pero cualquier despachador que usara el límite sin esa decisión previa podría iniciar ambas escrituras sobre el mismo archivo.
- Archivos y flujo investigados: `packages/engine/src/autonomous-run.ts` lee todos los tickets, filtra la elegibilidad y escoge uno; documenta expresamente que la ejecución es secuencial. `packages/adapter/src/config.ts` valida la sección `autonomous.limits`, pero no incluye una política de colisiones. `packages/engine/src/references.ts` ya obtiene la lista estructurada y canónica de `Puntos[].affected_files` mediante `declaredFunctionalFiles`, sin leer citas de texto. `tests/config-autonomous.test.ts` y `tests/autonomous-run.test.ts` cubren respectivamente la política y el despacho secuencial actual.
- Causa raíz o hipótesis: el límite `max-concurrent` carece de un contrato previo que convierta las declaraciones de archivo de varios tickets en una decisión segura. Extraer rutas de ``Plan`` o de cualquier cita permitiría que una mención narrativa alterara el despacho; inferirlas con un modelo rompería el requisito de detección mecánica. Una lista vacía tampoco prueba independencia, por lo que no habilitará paralelismo.
- Riesgos y compatibilidad: no se activa paralelismo ni se modifica la semántica de `valmen run` secuencial. La nueva planificación será pura —sin transiciones ni ejecuciones— y su resultado estable permitirá al futuro despachador reservar solo tickets independientes. `serialize` conserva el primer ticket por orden léxico y difiere los que colisionan; `block` excluye todos los participantes de una colisión; `warn` los conserva y expone el aviso. El lector rechazará una política inválida y las configuraciones existentes se actualizarán con un valor explícito.
- Impactos de sync, migración, Docker o despliegue: ninguno. No se toca red, datos, contenedores ni despliegue.

### Memoria consultada

- `AP-002` (`.valmen/learnings/`): los imports por índice pueden ocultar ciclos de evaluación. El módulo de planificación importará `declaredFunctionalFiles` por su ruta directa, no a través del índice de `@valmen/engine`.
- `AP-006`: el tratamiento de una compuerta bloqueada dos veces exige evidencia y autorización humana; no aplica como decisión automática de este ticket, pero se conserva la trazabilidad completa de sus gates.

## Plan

- Alcance y exclusiones: se añade el contrato de configuración y un planificador puro de colisiones para un lote. Quedan fuera el paralelismo real, reservas de máquina, reintentos, transiciones de tickets, invocación de ejecutores y cambios a la integración Git; corresponden a tickets posteriores.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts`, declarar `autonomous.limits.collision-policy`, aceptar exclusivamente `warn`, `serialize` y `block`, y exponer el valor tipado junto a los demás límites. Actualizar `tests/config-autonomous.test.ts` con lectura, valor inválido y política apagada.
  2. Crear `packages/engine/src/autonomous-collisions.ts` con una entrada tipada de tickets ya localizados. Para cada ticket, leer solo `Puntos[].affected_files` con `declaredFunctionalFiles`; una lista vacía queda marcada como no paralelizable. Normalizar el lote por identificador, agrupar coincidencias exactas de ruta y devolver colisiones ordenadas y decisión sin escribir en disco.
  3. Aplicar la política al resultado: `warn` conserva los tickets con una advertencia; `serialize` selecciona un subconjunto independiente estable y difiere los que comparten una ruta con uno seleccionado; `block` excluye todo participante de una colisión. Exportar el módulo desde `packages/engine/src/index.ts`, sin conectarlo todavía al ejecutor secuencial.
  4. En `tests/autonomous-collisions.test.ts`, cubrir rutas disjuntas, rutas comunes, declaración ausente, orden estable y las tres políticas. Extender `tests/config-autonomous.test.ts` y `docs/12-FUNCIONALIDADES-PROXIMAS.md` con el contrato YAML explícito.
  5. Ejecutar las pruebas focales, la suite completa, compilación y validaciones del registro; documentar el contrato de verificación. La entrega no activa concurrencia: verifica el resultado puro que la habilitación futura consumirá.
- Compatibilidad y reversión: los comandos secuenciales existentes no invocan el módulo nuevo. Revertir los archivos de esta entrega quita el planificador y la clave de configuración, restaurando exactamente el comportamiento secuencial previo; no hay estado persistente ni ejecución concurrente que deshacer.

## Criterios de aceptación

- [x] R-S5-003a: Para un lote de tickets con `Puntos[].affected_files`, el motor informa cada ruta canónica compartida y todos los IDs que la declaran, sin examinar texto libre del plan.
      <!-- test: npx vitest run tests/autonomous-collisions.test.ts -->
- [x] R-S5-003b: Un ticket sin rutas declaradas queda fuera de la selección paralela y el informe indica que faltan declaraciones; no se infiere una ruta desde el plan.
      <!-- test: npx vitest run tests/autonomous-collisions.test.ts -->
- [x] R-S5-003c: Con una misma colisión, `warn` conserva el lote y avisa, `serialize` conserva solo un subconjunto independiente en orden léxico y `block` excluye a todos los participantes de la colisión.
      <!-- test: npx vitest run tests/autonomous-collisions.test.ts -->
- [x] R-S5-003d: `.valmen/config.yaml` acepta únicamente `autonomous.limits.collision-policy` con `warn`, `serialize` o `block`; un valor distinto se rechaza al leer la configuración.
      <!-- test: npx vitest run tests/config-autonomous.test.ts -->
- [x] R-S5-003e: `valmen run --ticket` y `valmen run --queue` siguen siendo secuenciales y no invocan el planificador de colisiones.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/config.ts` incorpora `autonomous.limits.collision-policy` como una unión tipada de `warn`, `serialize` y `block`; una política activa sin uno de esos valores se rechaza al leer el YAML. La autonomía apagada expone `block` como valor conservador, aunque no despacha nada.
- `packages/engine/src/autonomous-collisions.ts` entrega un planificador puro para lotes futuros. Lee exclusivamente `Puntos[].affected_files` a través de `declaredFunctionalFiles`, agrupa rutas compartidas, excluye tickets sin declaración y devuelve selección, diferimientos, colisiones y avisos ordenados.
- `warn` conserva los tickets declarados e informa las rutas comunes; `serialize` conserva el primer ticket por identificador y difiere los que comparten una ruta ya reservada; `block` difiere a todos los participantes de una colisión. No se inicia proceso, no se escribe el registro y `valmen run` conserva su ejecución de un único ticket.
- Se exportó el planificador desde `packages/engine/src/index.ts`; `docs/12-FUNCIONALIDADES-PROXIMAS.md` documenta la nueva clave, y las pruebas cubren el contrato de configuración y las tres decisiones.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- Focal: `npx vitest run tests/autonomous-collisions.test.ts tests/config-autonomous.test.ts tests/autonomous-run.test.ts`.
  Resultado: pasó (3 archivos, 12 pruebas). Cubre rutas comunes y prosa ignorada, ausencia de declaración, orden estable, `warn`/`serialize`/`block`, configuración válida e inválida y la regresión del ejecutor secuencial.
- Compilación: `npm run build`.
  Resultado: pasó; TypeScript construyó los paquetes y actualizó la copia de interfaz.
- Suite completa: `npx vitest run`.
  Resultado: pasó (120 archivos; 1 omitido; 1.878 pruebas aprobadas y 48 omitidas).
- Registro y formato: `npx valmen validate --all`, `git diff --check` y `npx prettier --check packages/adapter/src/config.ts packages/engine/src/autonomous-collisions.ts packages/engine/src/index.ts tests/autonomous-collisions.test.ts tests/config-autonomous.test.ts tests/autonomous-run.test.ts docs/12-FUNCIONALIDADES-PROXIMAS.md tickets/2026/SECURITY-ENGINE-COLISIONES-ESCRITURA-20260926/ticket.md`.
  Resultado: pasaron; 88 tickets válidos y las rutas del cambio con formato válido.
- Lint global: `npm run lint` continúa fallando por 37 errores preexistentes fuera del alcance, incluidos archivos generados que ESLint no encuentra en el proyecto TypeScript y avisos ya existentes en `packages/engine/src/autonomous-run.ts`. La compilación, las pruebas focales y la suite completa no reportaron fallo atribuible a este ticket.
- Validación manual propuesta: cuando el futuro despachador paralelo consuma el planificador, crear dos tickets `approved` con la misma ruta en `Puntos[].affected_files` y un tercero con una ruta distinta. Con `warn` debe recibir los tres declarados y el aviso; con `serialize`, el primero por ID y el independiente; con `block`, solo el independiente. Un ticket sin `affected_files` debe quedar fuera en los tres casos. Esta entrega no expone aún un comando paralelo, por lo que la comprobación se cubre de forma unitaria.
- Resultado del PO: autorizó cerrar los tickets cuando las pruebas ejecutadas pasaran. Se registra omisión explícita de la validación manual propuesta porque este ticket no habilita todavía un despachador paralelo observable; el contrato queda cubierto por las 12 pruebas focales y la suite completa aprobada.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:16767e1f41a1a39a8b1d891578114057b7d592daf3916746acd3359d41bcb3d2",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó cerrar tras las pruebas ejecutadas; las 12 focales, compilación y suite completa aprobaron. La validación manual se omitió explícitamente porque aún no existe un despachador paralelo observable."
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-04",
    "technical_summary": "Se añadió una política tipada de colisiones y un planificador puro que usa exclusivamente affected_files, sin habilitar paralelismo.",
    "functional_summary": "El futuro despachador podrá decidir de manera auditable si varios tickets autónomos pueden ejecutarse juntos, serializarse o bloquearse antes de iniciar ejecutores.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin release ni despliegue; cambio interno del harness pendiente de commit selectivo."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-04",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesión de Codex atendió varios tickets del feature control-jornadas-ejecucion; no hay agregado atribuible por ticket sin inventar un reparto. Los recibos de análisis, plan y qa-mechanical quedan en el ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261004",
    "confidence": "high",
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
    "date": "2026-10-04",
    "at": "2026-10-04T19:33:07.655Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-04",
    "at": "2026-10-04T19:34:30.004Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-04",
    "at": "2026-10-04T19:35:55.901Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-04",
    "at": "2026-10-04T19:35:56.466Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-04",
    "at": "2026-10-04T19:41:45.150Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-04",
    "at": "2026-10-04T19:42:55.153Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-04",
    "at": "2026-10-04T19:42:55.811Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-04",
    "at": "2026-10-04T19:43:05.922Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-04",
    "at": "2026-10-04T19:43:22.978Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-04",
    "at": "2026-10-04T19:43:23.526Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-04",
    "at": "2026-10-04T19:43:48.247Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-04",
    "at": "2026-10-04T19:43:48.793Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
