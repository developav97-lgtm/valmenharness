---
schema_version: 2
id: FEATURE-ADAPTER-HERMES-LECTURA-20261001
title: Leer Hermes en solo lectura con cursor y sesión ejecutora
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
created: 2026-10-01
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ADAPTER-HERMES-LECTURA-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-002: Cada intento DEBE enlazar su sesión ejecutora sin confundirla con la sesión que pidió el trabajo.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
- R-CON-005: Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.
- R-PRO-003: Una sesión sin directorio DEBE requerir asociación explícita para mostrarse como propia de un proyecto.
Depende de: FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001, FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001, BUGFIX-MC-SESIONES-SIN-DIRECTORIO-20261001, BUGFIX-MC-SESIONES-ABIERTAS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).
- Spec completa: [proyectos/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/proyectos/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: lector opcional de Hermes en `@valmen/adapter` para un perfil local asociado de forma explícita. Observa en solo lectura cambios de `task_events` y sesiones de `state.db` mediante cursores, y permite obtener una página de mensajes visibles de una sesión concreta. No despacha ni modifica las bases de Hermes.
- Usuario o rol afectado: los consumidores futuros de ejecución —servidor, CLI, MCP y Mission Control— que necesiten incorporar actividad de Hermes sin mezclar proyectos ni cargar conversaciones históricas completas.
- Comportamiento actual: `packages/adapter/src/kanban.ts` traduce fases del tablero completo, pero no expone `task_runs`, sesiones ni cursor. `packages/server/src/hermes.ts` resuelve la línea de tiempo actual explorando todas las bases de Hermes, filtra por directorio y, para cada sesión, vuelve a leer sus mensajes. El motor ya puede persistir un enlace de sesión ejecutora, pero Hermes no tiene todavía un lector de adaptador que entregue una referencia verificable para consumirlo.
- Comportamiento esperado: un consumidor selecciona un perfil Hermes que ya fue autorizado por el binding del proyecto, recibe solo los cambios posteriores a su cursor y una referencia portable `hermes/<perfil>/<sessionId>` para sesiones observadas. Los mensajes se leen después, bajo demanda y por página, sin columnas de razonamiento ni contenido de herramientas. `tasks.session_id` queda identificado únicamente como conversación de origen; nunca se convierte en sesión ejecutora por hora, título ni presencia de un `task_run`.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/kanban.ts` ya abre `kanban.db` con `readOnly: true` y separa la traducción pura de su I/O; `packages/adapter/src/capabilities.ts` publica el contrato inmutable de cuatro capacidades. El esquema local comprobado sin leer conversaciones separa `state.db` (`sessions`, `messages`) del board (`tasks`, `task_runs`, `task_events`): `tasks` contiene `session_id`, mientras `task_runs` conserva estado, heartbeat y resultado pero no una sesión de worker. `packages/server/src/hermes.ts` confirma que hoy explora todas las bases y consulta mensajes de cada sesión; `packages/engine/src/execution-sessions.ts` ya persiste el enlace explícito `session.linked`; `packages/engine/src/project-resolution.ts` resuelve por coincidencia exacta de `hermes-profile` en los bindings autorizados.
- Causa raíz confirmada: no existe en `@valmen/adapter` un lector que represente el perfil asociado como ámbito, entregue cambios incrementales o separe la observación de sesiones de la carga de sus mensajes. Reutilizar el lector del servidor mantendría el escaneo global y la lectura repetida de mensajes; deducir la sesión ejecutora desde `tasks.session_id` o `task_runs` violaría R-ACT-002 porque el primero es la conversación de origen y el segundo no declara identidad de worker.
- Riesgos y compatibilidad: las bases pertenecen a Hermes y solo pueden abrirse para lectura; una base ausente, bloqueada o con esquema incompatible debe declararse no disponible, no producir una lista vacía engañosa ni interrumpir otras fuentes. La asociación por perfil no sustituye la verificación del proyecto: el motor entrega el perfil exacto ya autorizado y el adaptador no escanea perfiles ni acepta rutas de la interfaz. El cursor debe ser una frontera estable por fuente y preservar empates; los mensajes siguen opcionales, paginados y limitados a campos visibles, sin leer `reasoning`, `reasoning_content`, `reasoning_details`, `codex_reasoning_items`, `codex_message_items`, `api_content` ni resultados de herramientas.
- Supuestos y decisiones pendientes: se usará el nombre de perfil autorizado como `scope` de `SessionReference`, con `adapter: "hermes"`; el perfil `default` solo podrá consumirse si llega como asociación explícita desde un binding futuro, no por exploración implícita del home. El lector no escribe automáticamente `session.linked`: entrega la referencia de una sesión observada y la puerta autorizada decide si existe evidencia suficiente para anexarla al intento. La latencia visible menor a cinco segundos y el transporte hasta la UI quedan repartidos con `FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001`, `FEATURE-MC-RECONEXION-RECONCILIACION-20261001` y `FEATURE-MC-HOJA-RUTA-20261001`; este ticket entrega la lectura incremental que esas piezas consumen.
- Impactos de sync, migración, Docker o despliegue: `sync_impact`, `migration_impact` y `docker_impact` son `false`; no hay sincronización entre nodos, migración, contenedor ni despliegue. El único impacto es una integración local y opcional de lectura contra SQLite de otro proceso: no abre red, no crea watchers ni polling, no escribe en Hermes y preserva aislamiento por perfil/proyecto y compatibilidad de esquema.

## Plan

- Alcance y exclusiones: añadir el lector Hermes opcional, su cursor, referencias de sesión, página de mensajes visibles y perfil de capacidades. Quedan fuera la escritura en `state.db` o `kanban.db`, el escaneo de todos los perfiles, el despacho, la asociación de perfiles en bindings, el enlace automático al motor, el polling/SSE, la UI y cualquier afirmación de latencia extremo a extremo.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La compuerta `GR-20261003-plan` aprobó el 2026-10-03; autorización vigente: «si el análisis o plan quedan en review te autorizo que revises, corrijas y vuelvas a intentarlo; si pasa se aprueba el plan directamente».
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/adapter/src/hermes.ts` con el perfil explícito `HermesReadSource` —home y perfil, sin rutas de la interfaz—, las rutas derivadas de ese perfil y el perfil de capacidades inmutable: observar estados, leer actividad y leer mensajes disponibles en solo lectura; despacho no disponible y con su límite declarado.
  2. En el mismo módulo, implementar el lector incremental en `readHermesChanges`: abrir cada SQLite con `readOnly: true`, consultar `task_events` posteriores al cursor del board y sesiones posteriores a la frontera ordenada `(last_activity_at, id)`, y devolver el siguiente cursor junto con estados, actividad y referencias `SessionReference` de las sesiones. Distinguir base ausente/ilegible o esquema no compatible de una consulta válida sin cambios; no consultar `messages` durante este recorrido.
  3. Modelar el dato de task/run de modo que `tasks.session_id`, cuando exista, sea únicamente `originSessionId`. No emitir ni inferir una sesión ejecutora desde ese campo, de `task_runs`, título u hora; exponer la referencia de una sesión observada para que una puerta autorizada pueda usar `linkExecutionSession` solo con evidencia explícita.
  4. Añadir `readHermesVisibleMessages` con una referencia Hermes del mismo perfil, límite validado y cursor de página por `messages.id`. Consultar exclusivamente `id`, `role`, `content` y `timestamp` de mensajes de usuario/asistente; excluir herramientas, razonamiento y columnas privadas, y devolver una página vacía ante una sesión inexistente sin escanear conversaciones ajenas.
  5. Exportar el módulo desde `packages/adapter/src/index.ts`. Añadir `tests/adapter-hermes.test.ts` con bases SQLite temporales del esquema observado para cubrir solo lectura, perfil/ámbito explícito, cursor y empates, ausencia de tabla o base, `tasks.session_id` como origen separado, ausencia de vínculo ejecutor inferido, y paginación de mensajes sin acceso a columnas privadas. Mantener las regresiones de fases en `tests/eventos-fase-kanban.test.ts`.
  6. Ejecutar desde la raíz `npx vitest run tests/adapter-hermes.test.ts tests/adapter-capabilities.test.ts tests/eventos-fase-kanban.test.ts`, `npm run build` y, antes de entregar, `npx vitest run`. La medición de menos de cinco segundos se incorporará cuando servidor y vista conecten este cursor a la fila visible.
- Compatibilidad, orden y reversión: es una API nueva y opt-in; ni `leerSesionesDeHermes` ni la línea de tiempo existente cambian en este ticket. Las bases y eventos existentes no se reescriben. Si el lector detecta un esquema no compatible se deshabilita solo esa fuente y conserva el último cursor del consumidor; revertir consiste en dejar de importar el módulo nuevo, sin borrar cursores de clientes ni datos de Hermes.
- Rollback: retirar el export y el lector nuevo de los consumidores posteriores; no se altera ni se elimina información de Hermes ni del registro.

## Criterios de aceptación

- [x] R-ACT-002: Una sesión observada de Hermes entrega una referencia portable con adaptador y perfil; `tasks.session_id` se conserva solo como origen y no genera un vínculo ejecutor inferido.
      <!-- test: npx vitest run tests/adapter-hermes.test.ts -->
- [x] R-VIV-002: El lector entrega cambios disponibles desde su cursor y la frontera siguiente para que servidor y vista los propaguen; no promete por sí solo la latencia extremo a extremo.
      <!-- test: npx vitest run tests/adapter-hermes.test.ts -->
- [x] R-VIV-005: Consultar cambios no lee `messages`; los mensajes visibles se solicitan por sesión, con límite y cursor de página, sin columnas privadas ni resultados de herramientas.
      <!-- test: npx vitest run tests/adapter-hermes.test.ts -->
- [x] R-CON-005: Hermes declara de forma inmutable observación, actividad y mensajes en solo lectura, y declara despacho no disponible con una limitación explícita.
      <!-- test: npx vitest run tests/adapter-hermes.test.ts tests/adapter-capabilities.test.ts -->
- [x] R-PRO-003: El lector exige un perfil como ámbito explícito, no explora perfiles ni atribuye una sesión sin directorio a un proyecto por semejanza de ruta, título u hora.
      <!-- test: npx vitest run tests/adapter-hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/adapter/src/hermes.ts`, un lector por perfil explícito que deriva únicamente las rutas de ese perfil y abre `state.db` y `kanban.db` en modo `readOnly`.
- `readHermesChanges` conserva cursores separados para `task_events` y la frontera `(last_activity_at, id)` de sesiones; no lee la tabla `messages` durante el refresco y distingue fuente ausente de esquema incompatible.
- Las sesiones observadas exponen `SessionReference` portable con `adapter: "hermes"` y el perfil como ámbito. El `session_id` de una tarjeta se publica exclusivamente como `originSessionId`; ningún `task_run`, título u hora crea un vínculo ejecutor.
- `readHermesVisibleMessages` consulta una página de usuario/asistente de una sesión concreta y excluye llamadas de herramienta y cualquier columna de razonamiento o contenido privado.
- El perfil de capacidades declara observación, actividad y mensajes de solo lectura; declara despacho no disponible. Se exportó el módulo desde `@valmen/adapter`.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/adapter-hermes.test.ts tests/adapter-capabilities.test.ts tests/eventos-fase-kanban.test.ts` — pasó: 3 archivos y 17 pruebas. Cubre lectura sin escritura, cursores y empates, perfil explícito, sesiones de origen separadas, esquema/base ausente e incompatible, y paginación sin herramientas ni columnas privadas.
- `npm run build` — pasó: compila los paquetes TypeScript y actualiza el artefacto de interfaz del CLI.
- `npx vitest run` — pasó: 107 archivos y 1.832 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- `npx tsc --noEmit` — no es la compilación declarada del proyecto y falló en tipos preexistentes de `tests/interfaz-ejecutable.test.ts` y `tests/project-selector.test.ts`; no se modificaron esos archivos. La compilación soportada `npm run build` sí pasó.
- `valmen secrets` y `git diff --check` — pasaron; no se detectaron secretos ni errores de espacio.
- Validación manual propuesta: con un perfil Hermes asociado al proyecto, el consumidor debe recibir solo cambios nuevos al repetir el cursor; abrir mensajes de una sesión debe paginarlos y no mostrar llamadas de herramienta. No requiere red ni credenciales.
- Resultado comunicado por el PO: autorizó ejecutar, documentar y aprobar las pruebas deterministas si daban el resultado esperado; las pruebas específicas, compilación, formato, ESLint y suite completa pasaron.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:c983f3f6c69d9b11efcfe5c9a91870bc13faa1977f95651ed7c50c70b0734abf",
    "environment": "local-node-24",
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
    "po_confirmation": "El PO autorizó ejecutar, documentar y aprobar las pruebas deterministas si daban el resultado esperado."
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
    "date": "2026-10-03",
    "technical_summary": "Lector Hermes incremental por perfil, solo lectura, cursor por fuente y mensajes visibles paginados.",
    "functional_summary": "Las fuentes futuras reciben cambios acotados y referencias verificables sin confundir origen y worker.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación ni migración; API opt-in sin modificar bases Hermes."
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
    "notes": "Sesión compartida entre tickets; el consumo agregado no se reparte ni se inventa.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-sesion-compartida-20261003",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:44.771Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T17:25:22.971Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T17:28:53.701Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T17:29:59.509Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T17:29:59.696Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T17:36:37.163Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T17:36:37.675Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T17:36:54.367Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T17:36:54.551Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T17:36:54.711Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T17:37:01.601Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T17:37:01.993Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T17:37:02.154Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
