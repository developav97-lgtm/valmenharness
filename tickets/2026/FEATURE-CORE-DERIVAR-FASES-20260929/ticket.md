---
schema_version: 2
id: FEATURE-CORE-DERIVAR-FASES-20260929
title: Derivar fases de ticket desde transiciones del registro
type: FEATURE
module: CORE
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

# FEATURE-CORE-DERIVAR-FASES-20260929

## Solicitud original

Parte del sprint: Núcleo de datos y API.
- R-S1-001: Línea de fases por ticket — La API DEBE exponer, para cada ticket del registro, la secuencia de sus fases con hora de inicio, hora de fin y duración, derivada de las transiciones de estado del ticket.
- R-S1-004: Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/engine/src/etapas.ts:58` — `duracionesPorEtapa` ya deriva marcas de estado desde el bloque `Eventos`: la creación (`action: "created"`) abre la serie en `intake` y cada transición llega por el evento `ticket-transition` cuyo `details` tiene la forma `Workflow: <estado-origen> -> <estado-destino>.` (regex en `etapas.ts:40`). Devuelve `estado`, `at` y `ms`, pero sin cierre de fase: no distingue fase abierta de fase cerrada ni marca la fase en curso.
  - `packages/engine/src/transition.ts:128` — el motor anexa un evento por transición con `action: \`ticket-transition\`` y `details` de la forma anterior; la reapertura (`transition.ts:350-368`) anexa un `Workflow: closed -> changes_requested.` con el motivo en `details` (`Reapertura por hallazgo: …`) y dos entradas del bloque `QA` que **no** son transiciones (no aparecen en `Eventos`).
  - `packages/core/src/edit.ts:141` — `newEvent` escribe `at` desde 2026-09-26: los eventos previos no tienen hora y su duración es `null` («no reconstruible», `etapas.ts:92`).
  - `packages/core/src/blocks.ts:424-460` — el bloque `Eventos` es append-only y el validador exige `kind: ticket-event`, `date`, `action`, `actor`, `details`.
  - `packages/engine/src/index.ts:15` — `etapas.js` ya se exporta del paquete; la derivación de fases entra junto a ella.
- Causa raíz o hipótesis: el síntoma es que un ticket en Mission Control no puede mostrar cuándo empezó cada fase, cuánto duró ni cuál corre ahora. La causa es que la estructura existe pero falta la derivación: el bloque `Eventos` registra la hora de cada cambio de estado, pero no hay código que la transforme en fases — `duracionesPorEtapa` lista marcas sueltas (`etapas.ts:58`) sin cerrar tramos (no produce hora de fin), sin distinguir fase abierta de cerrada (no marca la fase en curso) y sin extraer el motivo del bloqueo (`reapertura`), y ningún otro módulo del paquete calcula eso. Por eso la API no tiene de dónde leer la línea de fases: el dato está escrito una vez y nadie lo computa.
- Riesgos y compatibilidad: cambio read-only sobre `Eventos`; no toca el mecanismo de sincronización, migraciones, contenedores ni despliegue. Compatibilidad hacia atrás: eventos sin `at` dejan su tramo en `null` —igual que hoy—; una transición que el regex no reconoce no rompe la derivación, sólo no produce fase.
- Impactos de sync, migración, Docker o despliegue: ninguno — la derivación es código interno del engine sin escritura al registro, sin esquema nuevo ni cambios de infraestructura.
- Requisitos cubiertos (la parte derivación): R-S1-001 (la secuencia con inicio/fin/duración y fase en curso, y «fase única desde `created_at`» para un ticket sin transiciones) y R-S1-004 (read-only, nada se reescribe). El endpoint (R-S1-001) es de `FEATURE-API-FASES-20260929`.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). «Apruebo» (PO por Slack, 2026-09-30) — decisión humana registrada en el recibo GR-20260930-analysis (`valmen gate-decide`, accor Juan Andrade (PO)); la banda de `diagnostico_explica_el_sintoma` (0.86) queda reportada como ruido conocido del caso cero y el resto de las proposiciones en verde. No existe recibo de compuerta de plan: la transición `planned → approved` se cerró directamente con la aprobación humana explícita del PO citada arriba — el gate de plan definido en la feature aplica solo sobre `planned` y nunca se corrió `valmen gate plan` sobre este artefacto. El brief del eslabón 1 (t_b1f5ea9f) declara el commit pre-autorizado de archivos propios del ticket y el tope en `awaiting_user_tests`.
- Decisiones: (1) derivadora pura en el engine (`fasesPorTicket`) sobre el bloque `Eventos`, y no un lector de `kanban.db`: R-S1-001 ya está cubierto con `Eventos` y el lector kanban es el eslabón INTEGRATION-ADAPTER-KANBAN-READER-20260929; (2) la hora de un ticket sin transiciones es el `at` del evento `created` —el spec dice «desde `created_at`» y ese evento es la única marca que el registro ya tiene—; (3) tramo sin hora queda `null` (no se estima), igual que `etapas.ts:92`. Descarte: reutilizar `duracionesPorEtapa` tal cual no alcanza porque no cierra tramos ni marca fase en curso; construir sobre sus mismas reglas evita tener dos parsers de `details`.
- Pasos ordenados:
  1. `packages/engine/src/fases.ts` (nuevo): exportar `FaseDeTicket` (estado al que se llegó vía transición, instante de inicio y fin, duración `ms | null`, `enCurso: boolean`, `motivo | null` para el bloqueo con su motivo si `details` lo trae) y `fasesPorTicket(eventos: readonly JsonObject[]): readonly FaseDeTicket[]`, read-only: corrre la serie de eventos (same rules que `etapas.ts` — `created` abre `intake`, `ticket-transition` parsea `details` con una regex; un tramo sin marca no se rellena) y concatena tramos por estado.
  2. `packages/engine/src/index.ts:15` — añadir `export * from "./fases.js";` junto al de `etapas.js`.
  3. `tests/derivacion-fases.test.ts` (nuevo): pruebas (a) caso vacío → fase única `intake` en curso con la marca del evento `created`; (b) transiciones normales → cada fase con inicio/fin/duración de dos marcas; (c) eventos sin `at` → tramo `null` («no reconstruible»); (d) bloqueo con motivo (`Workflow: in_progress -> blocked. Reapertura por hallazgo: x`-style `details`) → fase con el motivo; (e) recepción de eventos ajenos (evidencia, consumo) → no se confunden con fases; (f) ticket closed → la fase closed es la última y `enCurso` es `false`.
- Rollback: revertir el commit borra el módulo nuevo, su export y su test; nada persistente sobrevive ni se pierde — la derivación no escribe en el registro.

## Criterios de aceptación

- [x] R-S1-001: La derivación de fases toma una serie de eventos y produce la secuencia de fases con hora de inicio, hora de fin, duración y la fase en curso identificada — la prueba del paquete lo comprueba sobre `Eventos` del registro.
  <!-- test: npx vitest run tests/derivacion-fases.test.ts -->
- [ ] R-S1-002: La derivación es read-only: lee `Eventos` y no escribe ni reescribe ningún bloque — nada del módulo nuevo toca el disco.
  <!-- verify: manual -->
- [x] R-S1-003: Un ticket sin transiciones (sólo el evento de creación) aparece con su fase única desde `created_at`.
  <!-- test: npx vitest run tests/derivacion-fases.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se creó `packages/engine/src/fases.ts` (`FaseDeTicket` y `fasesPorTicket`), se exportó desde `packages/engine/src/index.ts` junto a `etapas.js` y se agregó `tests/derivacion-fases.test.ts`; `npx vitest run tests/derivacion-fases.test.ts` quedó en verde (6/6 pruebas, 1/1 archivo).

## Pruebas

- Verificación mecánica de criterios: `npx vitest run tests/derivacion-fases.test.ts` — 6/6 pruebas pasadas (1 archivo); criterio R-S1-001 y R-S1-003. Batería completa `npx vitest run`: 85 archivos pasados | 1 omitido, 1638 pruebas pasadas | 48 omitidas. Criterio R-S1-002 (`verify: manual`): la derivación `fasesPorTicket` es una función pura sobre la lista de eventos recibida — no importa `node:fs` ni toca el disco; se declara sin tildar para quien prueba.

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
    "date": "2026-09-30",
    "session_reference": "20260930_152600_952588",
    "model": "opencode-go/glm-5.3-flash",
    "reasoning_effort": null,
    "notes": "Sesión Hermes del eslabon 1 (kanban t_b1f5ea9f): analisis, diagnostic y compuerta analysis. Lectura al momento de registrar, proveedor por suscripcion (coste no declarado). No hubo sesion OpenCode: la implementacion no comenzo. Fila 20260930_152600_952588",
    "input_tokens": 248858,
    "output_tokens": 9305,
    "total_tokens": 258163,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260930_154157_aeb318",
    "model": "opencode-go/glm-5.3-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes (kanban) del eslabon 1 reanudado tras la aprobacion del PO del gate analysis: gate plan skip legal, OpenCode (ses_f0be7dfbbffeaVbN0qB44bPqKy) implemento, gates qa-mechanical y transiciones hasta awaiting_user_tests, commit 004932f. Proveedor opencode-go por suscripcion: coste no declarado (0).",
    "input_tokens": 132931,
    "output_tokens": 21121,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260930_161158_64c6d0",
    "model": "opencode-go/glm-5.3-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes del retrabajo de la ronda 1 (kanban t_b1f5ea9f, run 35): tres correcciones acotadas al registro del ticket, validate, vitest focal 6/6 reconfirmado, secrets, commit 62a3d09. Sin sesion OpenCode: el codigo no se toca. Proveedor por suscripcion: coste no declarado. Fuente leida al momento de registrar.",
    "input_tokens": 97276,
    "output_tokens": 8155,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
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
    "at": "2026-09-30T01:34:34.297Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-30",
    "at": "2026-09-30T20:29:21.303Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-30",
    "at": "2026-09-30T20:29:58.429Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-30",
    "at": "2026-09-30T20:41:02.695Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO): «Apruebo» (PO por Slack, 2026-09-30): el diagnóstico y el plan suman dos corridas de mejora y la banda restante es del ruido conocido del caso cero (riesgos_cubren_impactos=0.51 con impactos en ninguno). Continúa según el brief del eslabón 1 de 7."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-30",
    "at": "2026-09-30T20:45:22.773Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-30",
    "at": "2026-09-30T20:45:22.950Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-30",
    "at": "2026-09-30T20:56:20.526Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-30",
    "at": "2026-09-30T20:56:29.156Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-30",
    "at": "2026-09-30T20:57:42.652Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-30",
    "at": "2026-09-30T21:18:45.997Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  }
]
```
