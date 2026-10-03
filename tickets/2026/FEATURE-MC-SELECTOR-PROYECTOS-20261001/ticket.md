---
schema_version: 2
id: FEATURE-MC-SELECTOR-PROYECTOS-20261001
title: Cambiar de proyecto en una sola instancia
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
created: 2026-10-01
updated: 2026-10-02
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-SELECTOR-PROYECTOS-20261001

## Solicitud original

Parte del sprint: Priorizar portafolio existente y selector de proyectos en una sola instancia.
- R-PRO-001: Mission Control DEBE permitir cambiar entre proyectos declarados desde una sola instancia.
- R-PRO-002: Cada operación DEBE resolver su proyecto contra una declaración autorizada.
Depende de: FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001, FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [proyectos/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/proyectos/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: selector persistente de proyecto o vista conjunta en Mission Control, y
  resolución del contexto de cada solicitud de API contra el catálogo autorizado
  de la máquina.
- Usuario o rol afectado: responsable que consulta más de un proyecto desde una
  instancia local de Mission Control.
- Comportamiento actual: el portafolio enumera los proyectos declarados, pero la
  interfaz no conserva una selección y todas las rutas de API usan la raíz fija
  con la que se arrancó el servidor.
- Comportamiento esperado: la persona puede elegir un proyecto disponible o la
  vista conjunta; las vistas posteriores operan sobre el proyecto elegido por su
  identificador lógico autorizado. Una respuesta iniciada antes de cambiar de
  proyecto no modifica la vista nueva.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html:1984-2005`
  centraliza las solicitudes del navegador y no transmite contexto de proyecto;
  `:5177-5233` solo pinta el portafolio en lectura; `:6858-6919` navega sin
  descartar una respuesta asíncrona anterior. `packages/server/src/server.ts:323-325`
  deriva `paths` una vez de `context.root`, y el resto de endpoints usa esa raíz.
  El portafolio (`:474-506`) sí obtiene el catálogo autorizado, mientras
  `packages/engine/src/project-resolution.ts:34-110` ya resuelve un `projectId`
  exclusivamente desde bindings locales y valida la política del repositorio.
  `tests/portafolio.test.ts` construye dos raíces autorizadas y
  `tests/interfaz-ejecutable.test.ts` ejecuta las vistas en un DOM mínimo.
- Causa raíz confirmada: la vista y el servidor quedaron implementados como una
  instancia de raíz única. El catálogo sirve para informar, pero no participa en
  la resolución de las solicitudes de Mission Control; por eso no hay selector
  ni barrera que impida que una respuesta pendiente del proyecto anterior
  redibuje el contexto recién elegido. El recorrido concreto es: la persona solo
  puede abrir `#/portafolio`; `vistaPortafolio()` pinta filas sin acción ni
  estado de selección; `enviar()` llama las siguientes rutas sin identidad; y
  `handleApi()` deriva sus `paths` de la misma `context.root` inicial. Por tanto,
  incluso si la persona conoce otro proyecto declarado, ninguna vista puede
  pedirlo al motor y una promesa iniciada para A no tiene forma de saber que la
  interfaz acaba de solicitar B.
- Riesgos y compatibilidad: un `projectId` recibido del navegador no puede
  convertirse en una ruta ni ampliar autoridad; el servidor lo resolverá con el
  binding local y comprobará el `project-id` del repositorio. Las rutas sin
  selección conservan exactamente la raíz con que se abrió Mission Control. El
  portafolio sigue siendo agregado y no recibe selección. El stream SSE actual
  seguirá observando la raíz inicial: la actualización incremental de otros
  proyectos es alcance del ticket `FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001`;
  un aviso de la raíz inicial solo puede forzar una recarga del contexto ya
  seleccionado y no mezclar datos. La UI mantendrá un contador de selección para
  ignorar respuestas tardías.
- Impactos de sync, migración, Docker o despliegue: ninguno; se leen bindings y
  registros ya declarados, sin escribirlos ni abrir red adicional.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
  Aprobación delegada por Juan Andrade el 2026-10-02: autorizó que los planes
  que pasaran la compuerta se aprobaran directamente.
- Pasos ordenados:
  1. En `packages/engine/src/project-resolution.ts`, aceptar opcionalmente el
     archivo de bindings ya inyectado por Mission Control al resolver un
     `projectId`, sin cambiar la validación de identidad ni aceptar una raíz del
     cliente. Actualizar `tests/project-resolution.test.ts` solo si ese contrato
     necesita cubrir el archivo explícito.
  2. En `packages/server/src/server.ts`, resolver un alcance opcional de
     `X-Valmen-Project` antes de despachar rutas de un solo proyecto; construir
     un contexto con la raíz y las rutas devueltas por el motor. Rechazar IDs
     desconocidos o inválidos sin caer a la raíz actual y conservar
     `/api/portafolio` como vista agregada sin selección.
  3. En `packages/server/web/index.html`, cargar un selector accesible desde el
     portafolio autorizado, persistir únicamente el ID lógico seleccionado y
     añadirlo a las solicitudes de proyecto. La opción «Vista conjunta» abrirá
     el portafolio; al cambiar el selector, un contador invalidará las respuestas
     iniciadas con la selección anterior y actualizará la identidad visible.
  4. Crear `tests/project-selector.test.ts` con dos registros temporales para
     comprobar la resolución segura del encabezado, el rechazo de un ID no
     autorizado y el aislamiento de los tickets de cada raíz. Extender
     `tests/interfaz-ejecutable.test.ts` para ejecutar el selector, comprobar el
     encabezado y que una respuesta tardía no reemplace el proyecto recién
     elegido.
  5. Ejecutar `npx vitest run tests/project-selector.test.ts
     tests/interfaz-ejecutable.test.ts`, `npx vitest run` y `npm run build` desde
     la raíz. Levantar `node packages/cli/dist/main.js serve --port 4175` después
     de compilar para recorrer selector, vista conjunta, proyecto disponible y
     proyecto no disponible en el navegador local.
- Rollback: revertir los cambios de resolvedor, servidor, interfaz y pruebas.
  No hay datos migrados ni configuración escrita: al retirar el encabezado, la
  instancia vuelve a usar su raíz inicial como antes.

## Criterios de aceptación

- [x] R-PRO-001: Mission Control DEBE permitir cambiar entre proyectos declarados desde una sola instancia.
      <!-- test: npx vitest run tests/project-selector.test.ts tests/interfaz-ejecutable.test.ts -->
- [x] R-PRO-002: Cada operación DEBE resolver su proyecto contra una declaración autorizada.
      <!-- test: npx vitest run tests/project-selector.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/project-resolution.ts` permite al servidor reutilizar el
  archivo de bindings ya inyectado al resolver un ID lógico, sin aceptar rutas
  de la solicitud ni alterar la comprobación del `project-id` del repositorio.
- `packages/server/src/server.ts` resuelve `X-Valmen-Project` en la frontera
  HTTP para las rutas de un proyecto; rechaza selección vacía, múltiple o no
  autorizada, y conserva `/api/portafolio` como agregado sin selección.
- `packages/server/web/index.html` incorpora un selector accesible con
  «Vista conjunta», persiste solo el ID lógico y descarta respuestas que se
  completan para una selección anterior. El encabezado visible identifica el
  alcance activo.
- Se añadieron pruebas de servidor con dos raíces temporales y pruebas del DOM
  ejecutable que inspeccionan el encabezado enviado por el selector.

## Pruebas

- `npx vitest run tests/project-selector.test.ts tests/interfaz-ejecutable.test.ts`
  — 16 pruebas correctas (2 archivos).
- `npx vitest run` — 1.810 pruebas correctas, 48 omitidas; 103 archivos
  correctos, 1 omitido.
- `npm run build` — compilación correcta y copia de la interfaz web al
  artefacto del CLI.
- Validación manual local: Mission Control compilado en `http://127.0.0.1:4176`.
  Al seleccionar SaiOpenCloud se mostraron sus 116 tickets; al volver a
  ValmenHarness se mostraron sus 88. La consola no registró errores ni avisos.
- Resultado del PO: Juan Andrade autorizó el 2026-10-02 que, si las pruebas
  ejecutadas pasan, el ticket puede cerrarse, confirmarse y enviarse. Las
  pruebas declaradas y la validación manual anterior pasaron.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:603665caf60df5390d45e2494f376ef8f0623321c746bb9f35437f444eacc521",
    "environment": "local Node 24, Mission Control compilado y navegador local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Autorización de Juan Andrade del 2026-10-02: si las pruebas ejecutadas pasan, se puede cerrar, confirmar y enviar; las pruebas declaradas y la validación manual pasaron."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-03",
    "kind": "test",
    "description": "qa-mechanical aprobó los dos criterios con las pruebas focalizadas declaradas; la suite completa y la compilación también finalizaron correctamente. La referencia cubre los seis archivos funcionales cambiados, ordenados y hasheados con ruta y contenido.",
    "reference": "worktree:sha256:603665caf60df5390d45e2494f376ef8f0623321c746bb9f35437f444eacc521",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-03",
    "kind": "manual",
    "description": "Mission Control compilado validado con SaiOpenCloud y ValmenHarness: la lista de tickets cambió de 116 a 88 al cambiar el selector; consola sin errores ni avisos.",
    "reference": null,
    "point_id": null
  }
]
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
    "date": "2026-10-03",
    "technical_summary": "El servidor resuelve X-Valmen-Project exclusivamente contra bindings autorizados; la interfaz persiste el ID lógico y descarta respuestas obsoletas.",
    "functional_summary": "Mission Control permite alternar entre proyectos disponibles o la vista conjunta; cada proyecto muestra sus propios tickets.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación ni migración: cambio local disponible en el siguiente artefacto compilado."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "La interfaz no expone un agregado de consumo por ticket. Esta sesión compartió la continuación del feature y la validación del selector; no se declaran cifras inventadas.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261002",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": "01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "model": null,
    "reasoning_effort": null,
    "notes": "Contadores leídos de la línea de tiempo local; el origen Codex no expone modelo ni coste, por lo que se omiten.",
    "input_tokens": 1701807,
    "output_tokens": 241974,
    "total_tokens": 2016310,
    "estimated_cost_usd": null,
    "source": "codex:01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": "01a0ff0b-dbfa-75a0-8f55-887bda09fe84",
    "model": null,
    "reasoning_effort": null,
    "notes": "Contadores leídos de la línea de tiempo local; el origen Codex no expone modelo ni coste, por lo que se omiten.",
    "input_tokens": 352482,
    "output_tokens": 34420,
    "total_tokens": 400371,
    "estimated_cost_usd": null,
    "source": "codex:01a0ff0b-dbfa-75a0-8f55-887bda09fe84",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:44.490Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-02",
    "at": "2026-10-02T23:59:20.651Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-02",
    "at": "2026-10-03T00:02:03.745Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade: El PO autorizó aprobar este REVIEW no estructural el 2026-10-02; las observaciones remanentes tratan la redacción y citas del diagnóstico, no cambian causa, alcance, riesgos ni criterios."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-02",
    "at": "2026-10-03T00:02:04.028Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-02",
    "at": "2026-10-03T00:04:39.082Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-02",
    "at": "2026-10-03T00:04:39.347Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-02",
    "at": "2026-10-03T00:13:57.429Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-02",
    "at": "2026-10-03T00:13:57.728Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-02",
    "at": "2026-10-03T00:13:57.987Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-02",
    "at": "2026-10-03T00:14:36.736Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-02",
    "at": "2026-10-03T00:14:37.196Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-02",
    "at": "2026-10-03T00:14:37.474Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-02",
    "at": "2026-10-03T00:15:38.058Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-02",
    "at": "2026-10-03T00:15:41.648Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-02",
    "at": "2026-10-03T00:16:32.416Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-02",
    "at": "2026-10-03T00:16:32.702Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-02",
    "at": "2026-10-03T00:16:33.613Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-02",
    "at": "2026-10-03T00:16:33.980Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
