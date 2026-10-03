---
schema_version: 2
id: FEATURE-MC-PANEL-HERRAMIENTAS-20261001
title: Mostrar herramientas y mensajes visibles del ejecutor
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
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-PANEL-HERRAMIENTAS-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-003: El panel DEBE mostrar herramientas y mensajes visibles disponibles por el contrato del ejecutor.
- R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
Depende de: FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001, FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001, FEATURE-ENGINE-MODELO-INTENTO-20261001, FEATURE-MC-SELECTOR-PROYECTOS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: añadir al detalle de Mission Control un panel de actividad por ejecución e intento. Mostrará las señales persistidas, modelos configurados y efectivos, enlaces explícitos de sesión y las capacidades que cada adaptador declara. Los mensajes se solicitan sólo al abrir una sesión Hermes enlazada y por páginas; no se muestran pensamientos privados, secretos ni resultados crudos de herramientas.
- Usuario o rol afectado: responsable que inspecciona desde Mission Control una ejecución de un ticket del proyecto lógico seleccionado.
- Comportamiento actual: el detalle sólo muestra workflow, fases y la contabilidad histórica. El motor ya guarda actividad, modelos y enlaces por intento, y los adaptadores declaran límites, pero la interfaz no los consulta ni distingue una conversación disponible de una no expuesta.
- Comportamiento esperado: el panel declara la actividad y procedencia disponibles, separa modelo configurado de efectivo y lista cada sesión ejecutora enlazada. Para Hermes con perfil coincidente ofrece cargar una página de mensajes visibles; para OpenCode, Codex u otra fuente sin esa capacidad explica el límite en vez de inventar contenido. Abrir o refrescar el detalle nunca lee conversaciones completas.

## Diagnóstico

- Archivos y flujo investigados: síntoma reproducible: si un ticket tiene en `.valmen/executions/events.jsonl` actividad, modelo y una sesión ejecutora enlazada, al abrir `#/ticket/<id>` Mission Control sólo pinta workflow, fases y línea de tiempo; no muestra la ejecución, su fuente, capacidades ni el acceso a mensajes visibles. En `packages/server/web/index.html` el detalle carga `GET /api/tickets/:id`, `GET /api/ticket/fases` y `GET /api/timeline`, pero no existe una consulta de ejecución. `packages/engine/src/execution-status.ts`, `execution-sessions.ts`, `execution-models.ts` y `execution-contract.ts` ya proyectan los hechos append-only por identidad e intento. `packages/adapter/src/hermes.ts` permite únicamente `user` y `assistant` de una sesión Hermes exacta, ordenados y paginados; `opencode.ts` y `codex.ts` declaran expresamente que no exponen mensajes. `packages/server/src/server.ts` resuelve el proyecto seleccionado por `X-Valmen-Project` y puede conservar ese contexto autorizado para una lectura nueva.
- Causa raíz confirmada: no existe todavía una proyección de servidor que conecte el proyecto autorizado con estado, modelos, enlaces y capacidades del ejecutor, ni un componente de detalle que consuma esa proyección. Por eso la información persistida nunca llega al navegador y el responsable no puede saber qué mensajes o herramientas permite la fuente. Usar una coincidencia por título, ruta u hora para elegir sesión cruzaría identidades; leer el ledger al abrir un ticket cargaría contenido que no se pidió.
- Riesgos y compatibilidad: el endpoint debe aceptar sólo el proyecto declarado en el binding local, el ticket y las sesiones previamente enlazadas. Un enlace sin perfil Hermes coincidente, un adaptador sin `read-messages` o ausencia de datos se declara como no disponible; no cambia fases, workflow ni eventos. La carga inicial sólo consulta resúmenes del JSONL y el contenido se obtiene con cursor y límite exclusivamente tras acción explícita. No se cambia el contrato de fases o timeline existente: el nuevo panel se degrada de forma aislada cuando no hay ejecución, binding o mensajes.
- Supuestos y decisiones pendientes: se interpreta «herramientas disponibles» como las capacidades declaradas del adaptador y las señales/mensajes públicos que éste permite leer. Hermes no publica resultados crudos de herramientas y OpenCode/Codex no publican mensajes seguros; el panel debe comunicar esas limitaciones. La actualización SSE, reconciliación y cursors de eventos globales siguen en `FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001`; este ticket no instala watchers ni polling de conversaciones.
- Impactos de sync, migración, Docker o despliegue: no hay `sync` porque no cambian proyecciones generadas; no hay migración porque las lecturas usan el JSONL y las bases existentes sin escribirlas; no hay Docker ni despliegue porque Mission Control sigue siendo servidor local. El impacto funcional se limita al detalle del ticket seleccionado y el de rendimiento queda acotado a una página de una sesión enlazada, nunca a un historial completo.

## Plan

- Alcance y exclusiones: exponer una lectura local y autorizada de la ejecución de un ticket y renderizarla bajo demanda. No se agregan dispatch, escritura de eventos, inferencia de sesiones, streaming, polling ni lectura de contenido de OpenCode/Codex; los refrescos incrementales pertenecen al ticket posterior de servidor.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La compuerta `plan` con evaluador `cascade` aprobó el recibo `GR-20261003-plan` el 2026-10-03 y el PO autorizó: «si pasa se aprueba el plan directamente».
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/server/src/execution-panel.ts` para proyectar, desde un `AuthorizedProject`, las ejecuciones del ticket con `readExecutionStatus`, actividad, enlaces explícitos, modelos configurados/efectivos y el perfil de capacidades del adaptador; derivar la disponibilidad de mensajes sólo de un enlace Hermes y el `hermesProfile` exacto del binding.
  2. Extender `packages/server/src/server.ts` con un contexto de proyecto autorizado y dos lecturas: resumen de ejecuciones por ticket y una página de mensajes visibles de una sesión Hermes ya enlazada. Validar ticket, ejecución, intento, sesión, cursor y límite; rechazar referencias no enlazadas y no consultar ningún mensaje mientras se carga el resumen.
  3. Añadir `tests/execution-panel.test.ts` para el aislamiento de proyecto, separación de modelos, capacidades, ausencia explícita y la lectura paginada de una sesión Hermes exacta; cubrir que otra sesión, otro perfil y los adaptadores sin mensajes no se leen.
  4. Extender `packages/server/web/index.html` para presentar el panel en el detalle: actividad, modelos, capacidades y sesiones, con botones de «Cargar mensajes visibles» y «Cargar más». La carga inicial sólo pide el resumen; cada pulsación conserva y avanza el cursor de su sesión. Ampliar `tests/interfaz-ejecutable.test.ts` para afirmar esa carga diferida y que el panel se ejecuta sin errores.
  5. Ejecutar `npx vitest run tests/execution-panel.test.ts tests/interfaz-ejecutable.test.ts`, `npm run build`, `npx vitest run`, `node packages/cli/dist/main.js estandar revisar` y validar en navegador local que el detalle no muestra mensajes hasta solicitarlos.
- Rollback: revertir el módulo, rutas y panel; no se eliminan ni reescriben eventos, tickets, sesiones ni bases externas.

## Criterios de aceptación

- [x] R-ACT-003: El panel muestra actividad, modelos, enlaces y capacidades declaradas por cada adaptador; los mensajes sólo se ofrecen cuando el contrato de la sesión enlazada los permite y nunca se inventan para una fuente no compatible.
      <!-- test: npx vitest run tests/execution-panel.test.ts tests/interfaz-ejecutable.test.ts -->
- [x] R-VIV-005: La carga inicial consulta sólo el resumen de ejecución y los mensajes visibles de Hermes se leen por una sesión exacta, con cursor y límite, después de una acción explícita; no hay polling ni lectura de conversaciones de OpenCode/Codex.
      <!-- test: npx vitest run tests/execution-panel.test.ts tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/server/src/execution-panel.ts`, una proyección de solo lectura que reúne actividad, liveness, modelos, enlaces explícitos de sesión y capacidades declaradas por adaptador sin abrir conversaciones.
- `packages/server/src/server.ts` expone el resumen por ticket y una página de mensajes sólo para una sesión Hermes que ya esté enlazada al intento y cuyo perfil coincida con el binding autorizado. No acepta rutas ni sesiones arbitrarias.
- Mission Control incorpora el acordeón «Actividad del ejecutor». La foto inicial no carga contenido; los mensajes visibles se solicitan por sesión mediante botón, cursor y límite. Las fuentes sin mensajes seguros muestran su limitación declarada.
- Se añadieron `tests/execution-panel.test.ts` y las dos rutas al contrato de `tests/api-rutas.test.ts`.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/execution-panel.test.ts tests/api-rutas.test.ts tests/interfaz-ejecutable.test.ts` — pasó: 3 archivos y 22 pruebas.
- `npm run build` — pasó: TypeScript y copia de la interfaz.
- `npx vitest run` — pasó: 109 archivos y 1.839 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración.
- `node packages/cli/dist/main.js estandar revisar` — sin colores fijos nuevos.
- `node packages/cli/dist/main.js secrets` — sin secretos en 10 archivos con cambios.
- Validación manual pendiente de ambiente: `http://127.0.0.1:4175` respondió `ERR_CONNECTION_REFUSED`, por lo que no se afirmó una revisión visual inexistente. La ejecución de interfaz automatizada sí recorrió todas las vistas.
- Resultado del PO: autorizó cerrar, commitear y hacer push cuando las pruebas ejecutadas pasaran; las verificaciones declaradas pasaron.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:57d386f62cf7918a8451ddd5ad92ffb2a5edee4b1019e099436afe60fdd3f42a",
    "environment": "local",
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
    "po_confirmation": "El PO autorizó cerrar, commitear y hacer push si pasan las pruebas ejecutadas."
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
    "technical_summary": "Panel de ejecución de solo lectura con sesiones explícitas y mensajes Hermes paginados.",
    "functional_summary": "Mission Control muestra actividad, modelos, capacidades y límites sin leer conversaciones completas.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin impacto de release: interfaz local y endpoints de lectura."
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
    "notes": "Sesión Codex compartida entre varios tickets; el consumo íntegro está en el registro de la sesión, por lo que no se reparte ni se inventan cifras para este ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261003",
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
    "at": "2026-10-01T19:10:44.868Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T18:30:07.166Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T18:34:03.790Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T18:46:39.887Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T18:47:46.960Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T18:47:47.147Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:32.646Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:32.814Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:33.023Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:57.415Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:57.581Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:57.745Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T18:53:58.444Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-03",
    "at": "2026-10-03T18:54:05.185Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
