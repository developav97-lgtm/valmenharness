---
schema_version: 2
id: FEATURE-API-FASES-20260929
title: Endpoint de fases de ticket con duración y sesiones
type: FEATURE
module: API
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-29
updated: 2026-09-30
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-API-FASES-20260929

## Solicitud original

Parte del sprint: Núcleo de datos y API.
- R-S1-001: Línea de fases por ticket — La API DEBE exponer, para cada ticket del registro, la secuencia de sus fases con hora de inicio, hora de fin y duración, derivada de las transiciones de estado del ticket.
- R-S1-003: Fase y consumo — Cada fase DEBE enlazar sus sesiones de timeline (las que corrieron durante esa fase) con
- R-S1-004: Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los
Depende de: FEATURE-CORE-DERIVAR-FASES-20260929.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: endpoint `GET /api/ticket/fases?ticket=<ID>&directory=<raíz>` del paquete server: para el ticket pedido, la secuencia de sus fases (secuencia con inicio/fin/duración y fase en curso) más las sesiones del timeline de la fase, reutilizando `leerLineaDeTiempo`.
- Usuario o rol afectado: la pantalla del ticket en Mission Control (sprint-2/sprint-3 de la feature timeline-fases; el eslabón 3 de tests escribe su suite de integración de solo lectura).
- Comportamiento actual: la derivación de fases existe (`packages/engine/src/fases.ts`, commit 004932f) pero no está expuesta: ninguna ruta del servidor ofrece la línea de fases y no hay de dónde leer las sesiones enlazadas a cada fase.
- Comportamiento esperado: el endpoint responde con `ticket`, `fases` (con `enCurso` por fase) y la agrupación `sesionesPorFase` por fase; si no hay datos de consumo responde 200 con `timeline.disponible` en `false` (se distingue de una sesiones vacía); si no existe el ticket, 404 con mensaje del recurso.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/fases.ts` (commit 004932f: `fasesPorTicket(eventos) -> readonly FaseDeTicket[]` con `estado`/`inicio`/`fin`/`ms`/`enCurso`/`motivo`, puro y sin IO); `packages/engine/src/index.ts:16` ya exporta el módulo (`export * from "./fases.js"`); `packages/server/src/server.ts` — despachador `handleApi`: rutas sin parámetros por match de `url.pathname` exacto (`server.ts:669` es la forma de `/api/timeline`), rutas con parámetro tipo `GET /api/features/:slug` (`server.ts:642-656`) y el detalle del ticket que la pantalla ya lee (`readTicket`, `server.ts:813`); `packages/server/src/timeline.ts` — `leerLineaDeTiempo(directory, {ticketId})`, la misma función con la que `GET /api/timeline` llena su vista (`server.ts:672`); `packages/gate/src/definitions.ts:25` — la compuerta `plan` está registrada en el catálogo del proyecto (`appliesTo: ["planned"]`); `tickets/2026/FEATURE-CORE-DERIVAR-FASES-20260929/ticket.md` — plan del eslabón 1, que declara R-S1-001/R-S1-004 del lado derivación y deja «el endpoint (R-S1-001) es de FEATURE-API-FASES-20260929».
- Causa raíz o hipótesis: el síntoma es que la pantalla de ticket de Mission Control no puede pintar la banda de fases: no existe una ruta del server que derive y ofrezca la línea, ni vista para enlazarle las sesiones de cada fase. La causa es de integración, no de lógica de dominio: la sección 1 (eslabón 1) ya dejó la derivación dentro del engine (`packages/engine/src/fases.ts`, exportada en `packages/engine/src/index.ts:16`), pero el server no la consume — `grep fases` sobre `packages/server/src/` no devuelve ninguna coincidencia — y consumir la contabilidad real del proyecto vía `readTicket` + `leerLineaDeTiempo` es la única vía de darle a la banda los datos que ya existen sin duplicar ni derivar por segunda vez. El plan del eslabón 1 lo anticipa en su paso 3: nombrar el módulo de fases del engine al escribir la ruta.
- Riesgos y compatibilidad: cambio de solo lectura — el endpoint deriva fases leyendo el bloque `Eventos` del `ticket.md` (parseo de `readTicket`) y la contabilidad de sesiones (opcional, `leerLineaDeTiempo` no toca el registro ni `task_events`); no hay escritura, no hay esquema, no hay infraestructura. Compatibilidad hacia atrás: ninguna ruta previa cambia; `tests/api-rutas.test.ts` pide rutas anteriores y la intersección `GET /api/tickets/:id` se queda igual (`server.ts:813`). Riesgo acotado: `leerLineaDeTiempo` puede devolver `null` cuando la base de contabilidad no existe — la respuesta declara `timeline.disponible: false` y no se disfraza con una lista vacía (misma regla que ya aplica `GET /api/timeline` en `server.ts:666-668`).
- Impactos de sync, migración, Docker o despliegue: ninguno — endpoint nuevo de solo lectura sobre el paquete `server`, sin esquema nuevo ni cambios de infraestructura y sin tocar el mecanismo de sincronización.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La autorización anticipada del PO ya fue dada para la tanda de 7 de la feature timeline-fases: «Dale, abrí las 7 tarjetas kanban» (PO por Slack, 2026-09-30). El eslabón 1 cerró `planned → approved` con la misma autorización anticipada citada literal; el eslabón 2 (este) la replica con su nombre de tarjetas propias.
- Decisiones: (1) ruta en el server con nombre exacto `/api/ticket/fases` y parámetros de query `ticket` y `directory` (alternativa descartada: ruta dentro de `tickets/:id` — el detalle de ticket ya existe como otra ruta en el despachador y mezclaría los dos contratos en un mismo camino). (2) Reutilizar `leerLineaDeTiempo` exactamente igual que en `server.ts:669-708` (alternativa descartada: re-implementar la lectura de sesiones — duplicaría el lector y no aporta para el alcance de sprint-1). (3) Agrupar sesiones por fase —no por ticket entero— porque la banda de la pantalla (sprint-3) pinta fase por fase (alternativa descartada: devolver la lista plana de sesiones y que la pantalla agrupe en runtime — repetiría la lógica en cada cliente).
- Pasos ordenados:
  1. `packages/server/src/server.ts` — añadir la ruta `GET /api/ticket/fases` con `partes.length === 3` y el query `ticket`/`directory` (leer el ticket con `readTicket` en la ruta del `paths` que ya usa el handler; si no existe, 404); llamar a `fasesPorTicket(detail.events)` y devolver `ticket`, `fases`, y `timeline` (con `disponible: false` si no hay datos). Añadir `fasesPorTicket` a los imports de `@valmen/engine` en `server.ts:26-54` (la derivación del eslabón 1 ya la exporta).
  2. `tests/api-fases-api.test.ts` (nuevo, el archivo que ya anotan los criterios) — prueba del endpoint con el despachador real (`handleApi`) sobre un registro de prueba: (a) un ticket con avance de estados (transiciones `ticket-transition` escritas en `Eventos`) produce `fases` con inicio/fin/duración y `enCurso` en la última; (b) un ticket sin transiciones (solo el evento `created`) responde con su fase única desde el `at` del evento de creación; (c) sin base de contabilidad disponible responde `timeline.disponible: false` sin fingir sesiones (misma regla que `GET /api/timeline`); (d) un ticket inexistente responde 404.
  3. `tests/api-rutas.test.ts:36` (RUTAS) — añadir la fila `GET /api/ticket/fases` a la tabla de rutas del contrato: la prueba escanea `packages/server/web/index.html` y no exige que la interfaz construya la URL todavía (la banda de fases es del sprint-2/sprint-3), así que la fila entra aunque la UI aún no la llame; correr `npx vitest run tests/api-rutas.test.ts` después.
- Rollback: revertir el commit saca la ruta del despachador y su prueba focal; no hay esquema, no hay persistencia, no hay flujo de sync que resetear. Otros consumidores de `@valmen/engine` (CLI) no cambian: no se exporta nada nuevo del server.
- Cobertura de requisitos (la parte API): R-S1-001 (endpoint expone la secuencia de fases con inicio/fin/duración y fase en curso), R-S1-003 (enlace por fase de sesiones de timeline con su coste/tokens/intervenciones), R-S1-004 (read-only: el endpoint solo lee el `ticket.md` y la base de opencode; nada del ticket o del registro se reescribe).

## Criterios de aceptación

- [x] R-S1-001: El endpoint `GET /api/ticket/fases?ticket=<ID>` devuelve la secuencia de fases del ticket —cada una con `estado`, `inicio`, `fin`, `ms` y `enCurso`— derivada del bloque `Eventos` de `readTicket` con `fasesPorTicket` del engine.
  <!-- test: npx vitest run tests/api-fases-api.test.ts -->
- [x] R-S1-003: Cada fase del endpoint trae sus sesiones de timeline enlazadas —las que corrieron durante ese tramo, con `sessions` de `leerLineaDeTiempo(directory, { ticketId })` con `id`, `model`, `costUsd`, tokens e intervenciones—.
  <!-- test: npx vitest run tests/api-fases-api.test.ts -->
- [ ] R-S1-004: El endpoint es solo lectura: no escribe en el registro ni reescribe bloque append-only, y una llamada llega directo a la derivación del engine sin mutation layer conocida.
  <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-30",
    "kind": "external-command",
    "description": "Sesión OpenCode ses_f0b89160cffetWs7A4SrlfveuD (modelo opencode-go/deepseek-v4.1-flash, 2026-09-30, /Users/juanandrade/Desktop/ValmenHarness): implementó GET /api/ticket/fases en packages/server/src/server.ts, tests/api-fases-api.test.ts (4 casos sobre handleApi real) y la fila de tests/api-rutas.test.ts. 29 mensajes en su historial; la implementación está en el árbol sin commitear.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-30",
    "kind": "automated-test",
    "description": "Commit 40eba3c: implementacion y pruebas del endpoint. npx vitest run tests/api-fases-api.test.ts tests/api-rutas.test.ts 10/10 pasadas; bateria completa 1642 pasadas/48 omitidas; typecheck limpio; valmen secrets sin hallazgos antes del commit.",
    "reference": "commit:40eba3ce4abf27946ca48b5861c4b92a9221cccc",
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
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260930_162805_722023",
    "model": "opencode-go/glm-5.3-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes del eslabon 2 (kanban t_49571ce9): analisis y diagnostico del endpoint, compuerta analysis corrida dos veces (REVIEW con diagnostico_explica_el_sintoma en banda en ambas), ticket bloqueado en needs_input. Lectura al momento de registrar: la fila crece hasta que el turno termina. Proveedor opencode-go por suscripcion: coste no declarado (0). No hubo sesion OpenCode: la implementacion no comenzo.",
    "input_tokens": 1601942,
    "output_tokens": 63652,
    "total_tokens": 1665594,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260930_173415_14a12c",
    "model": "opencode-go/glm-5.3-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes del eslabon 2 (kanban t_49571ce9, segunda corrida tras el desbloqueo del PO): compuerta analysis aprobada, transiciones a planned/approved/in_progress, implementacion por OpenCode (ses_f0b89160cffetWs7A4SrlfveuD), verificacion de pruebas, registro de consumo. Proveedor opencode-go por suscripcion: coste no declarado (0). Numeros leidos de session_model_usage al momento de registrar: la fila crece hasta que el turno termina.",
    "input_tokens": 430709,
    "output_tokens": 11199,
    "total_tokens": 441908,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "ses_f0b89160cffetWs7A4SrlfveuD",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion OpenCode de implementacion del eslabon 2: escribio packages/server/src/server.ts (ruta GET /api/ticket/fases), tests/api-fases-api.test.ts y la fila de tests/api-rutas.test.ts. 29 mensajes en su historial al momento de registrar. Proveedor opencode-go por suscripcion: coste no declarado (0).",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": 0,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
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
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:34.393Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-30",
    "at": "2026-09-30T22:01:04.435Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-30",
    "at": "2026-09-30T22:13:00.035Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-30",
    "at": "2026-09-30T22:33:40.050Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO, por Slack): PO aprueba continuar por Slack"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-30",
    "at": "2026-09-30T22:35:48.165Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-30",
    "at": "2026-09-30T22:36:21.415Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-30",
    "at": "2026-09-30T22:36:56.813Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-30",
    "at": "2026-09-30T22:43:02.771Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-30",
    "at": "2026-09-30T22:43:42.438Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-30",
    "at": "2026-09-30T22:43:46.297Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-30",
    "at": "2026-09-30T22:43:54.301Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-30",
    "at": "2026-09-30T22:44:25.093Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  }
]
```
