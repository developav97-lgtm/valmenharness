---
schema_version: 2
id: FEATURE-UI-SSE-FASES-20260929
title: Actualizar banda de fases en vivo con SSE de eventos
type: FEATURE
module: UI
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-29
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-UI-SSE-FASES-20260929

## Solicitud original

Parte del sprint: Presentación en vivo.
- R-S1-002: Transición en vivo — La línea de fases DEBE actualizarse en vivo: la transición nueva aparece en la pantalla en
Depende de: FEATURE-UI-BANDA-FASES-20260929.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la banda de fases del ticket en Mission Control se actualiza en vivo cuando el registro cambia, sobre la vista del ticket ya abierta.
- Usuario o rol afectado: quien sigue un ticket abierto en Mission Control mientras el harness trabaja ese u otro ticket.
- Comportamiento actual: la banda se pinta solo al cargar la vista; una transición nueva aparece cuando el aviso general refresca toda la vista, y si hay un foco en un campo o un diálogo abierto no se refresca nada.
- Comportamiento esperado: el aviso SSE que toca el ticket en pantalla refresca solo la banda (no toda la vista), respetando la regla de no interrumpir: si hay foco o diálogo, queda pospuesto como hoy y la banda aparece al volver.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` — la vista del ticket (`vistaTicket`, `index.html:3835`) ya pinta la banda de fases (eslabón 6), y la conexión en vivo ya existe: `conectarEventos()` abre un `EventSource("/api/events")` (`index.html:6567`), recibe los avisos con `paths` que señalan qué archivos cambiaron, y decide con `elCambioTocaLaVista(rutas)` (`index.html:6771`) si la vista actual se refresca —recargando con `navegar({ conservarVista: true })`— o si solo avisa. El servidor difunde el aviso con las rutas tocadas: `server.ts:1661` mantiene el flujo abierto y `suscriptores.add(response)` lo reparte a toda la pantalla.
- Causa raíz o hipótesis: la banda se pinta una vez al cargar la vista — su fuente (`GET /api/ticket/fases`) no se vuelve a llamar cuando una transición del ticket ocurre con la pantalla abierta, así que el dato «en vivo» solo llega si el refresco completo la vuelve a pintar (R-S1-002). El transporte (SSE) y la banda (eslabón 6) ya existen; lo que falta es que el aviso en vivo refresque **la banda** aunque el resto de la pantalla esté ocupada o con datos sin guardar, que es la condición en que el refresco general hoy se salta (`puedeRefrescar` lo frena, `index.html:6562`).
- Riesgos y compatibilidad: (1) la pantalla conserva la regla de no refrescarse mientras alguien escribe o hay un diálogo abierto — la banda nueva respeta la misma regla y no introduc un refresco brusco: se pospone igual que todo (`avisarQueHayCambios`). (2) La llamada extra al endpoint por aviso es barata pero se desmenuza: solo se llama cuando el aviso toca el ticket que está en pantalla (`elCambioTocaLaVista` ya filtra por hash). (3) Sin colores ni clases literales: se reusa el CSS de la banda del eslabón 6. (4) El refresco parcial no puede pisar el estado del documento: se reemplaza solo el nodo de la banda, sin rearmar la vista, para no perder el recorrido de quien lee.
- Impactos de sync, migración, Docker o despliegue: ninguno — pantalla del paquete `server`, solo lectura y sobre un endpoint ya aprobado; no toca registro, esquema, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La autorización anticipada del PO ya fue dada para la tanda de 7 de la feature timeline-fases: «Dale, abrí las 7 tarjetas kanban» (PO por Telegram, 2026-09-30). El eslabón 7 (este) la replica con su nombre de tarjeta propia, igual que los eslabones 1 a 6.
- Decisiones:
  1. **El aviso SSE refresca solo la banda, no toda la vista**: `vistaTicket` guarda el identificador y una función de refresco de banda; `conectarEventos` la invoca cuando el aviso toca el ticket del hash, **después** del filtro del `elCambioTocaLaVista`, y el resto de la lógica (contadores, avisos pospuestos) queda exactamente como está. Alternativa descartada: no tocar el flujo y esperar el refresco general — es el defecto actual: la banda queda vieja sin transición visible.
  2. **La misma cortesía de siempre: si la pantalla no puede refrescar (`puedeRefrescar` en falso) la banda no se toca** — se pospone como el resto del refresco. La banda en vivo no puede salir más ruidosa que la pantalla que la contiene.
  3. **El refresco de banda reusa el armado del eslabón 6**: la misma función que pinta la banda al cargar la vista se vuelve a llamar con los datos nuevos del endpoint, y reemplaza solo ese nodo. Sin clases nuevas ni duplicación de CSS.
  4. **Caso límite ya cubierto por el eslabón 6**: si la llamada del endpoint falla en el refresco en vivo, la banda queda como estaba — no se borra ni se pinta el aviso de error — porque una falla momentánea no puede borrar el historial que ya se vio.
- Pasos ordenados:
  1. `packages/server/web/index.html` — extraer el armado de la banda del eslabón 6 a una función `pintarBandaDeFases(cont, ticket, id)` que anexa el nodo de la banda y devuelve el refresco parcial: llamarlo en `vistaTicket` donde hoy pinta la banda (el árbol queda igual al cargar).
  2. `packages/server/web/index.html` — en `conectarEventos.onmessage`: si el hash es un ticket y el aviso toca su identificador, y `puedeRefrescar()`, llamar el refresco parcial de la banda con un `setTimeout` corto (el mismo margen de 300 ms que ya existe), sin rearmar la vista.
  3. `tests/interfaz-ejecutable.test.ts` — los casos nuevos: la banda refrescada en vivo cuando el aviso toca el ticket (los tramos de la banda cambian sin recargar la vista); el aviso de otro ticket no la toca; con foco en un campo o diálogo abierto la banda no se reescribe (queda la vieja, en el archivo de la sesión); y la vista se entera al dejar de estar ocupada.
  4. `npx vitest run tests/interfaz-ejecutable.test.ts`, después `npx vitest run` y `npm run typecheck` — los tres en verde sobre el árbol final (los 4 errores de lint preexistentes y ajenos al ticket se declaran en la entrega, no se corrigen aquí).
- Rollback: revertir el commit saca el refresco parcial, su caso de suite y el gancho en `onmessage`; la banda queda pintada al cargar como en el eslabón 6 y nada más cambia — las vistas de la tira y el refresco general quedaron intactos.

## Criterios de aceptación

- [x] Un aviso SSE que toca el ticket en pantalla refresca solo la banda de fases —los tramos cambian sin recargar la vista ni rearmar el resto—, en `tests/interfaz-ejecutable.test.ts`.
  <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [x] Un aviso que toca otro ticket no mueve la banda, y con foco en un campo o un diálogo abierto la banda queda como está hasta que la pantalla pueda refrescar, en `tests/interfaz-ejecutable.test.ts`.
  <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [x] Si la llamada del endpoint falla durante el refresco en vivo, la banda queda con su último contenido — no se borra ni pinta error —, en `tests/interfaz-ejecutable.test.ts`.
  <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

- 2026-10-01 — Implementado el plan aprobado en la sesión `ses_f082ba628ffe2qugza8DD4zQlG`, dedicada exclusivamente a este ticket. Sin commits ni cambios de release.
- `packages/server/web/index.html`: extraído el armado existente a `pintarBandaDeFases(cont, ticket, id)`, que conserva la presentación inicial, registra el identificador de la banda vigente y devuelve su refresco parcial. El refresco arma los tramos antes de reemplazarlos; una falla del endpoint conserva el último contenido. El aviso inicial de API no disponible sigue siendo «Sin línea de fases».
- `conectarEventos.onmessage`: después de `elCambioTocaLaVista` y `puedeRefrescar`, conserva el debounce de 300 ms y refresca solo los tramos de la banda del ticket del hash. Los contadores, el aviso «hay cambios» y el refresco general de las otras vistas permanecen. Se vuelve a comprobar la cortesía al vencer el margen y al recibir la respuesta; navegar cancela el temporizador e invalida la referencia de la banda anterior.
- `tests/interfaz-ejecutable.test.ts`: añadidos tres casos ejecutables sobre el módulo real de la interfaz, con transporte SSE y endpoint simulados en los límites: aviso propio sin recargar el detalle ni reemplazar el resto del DOM; aviso ajeno, foco y diálogo (incluido foco adquirido durante los 300 ms), con reanudación mediante «hay cambios»; falla del endpoint sin borrar ni reemplazar la banda visible.
- Compatibilidad: sin cambios de API, CSS, colores, dependencias, autenticación, registro de fases ni esquemas. Se conservaron los cambios previos del eslabón 6 y los archivos ajenos.
- Revisión local: no se detectaron hallazgos bloqueantes de código. `revisar_presentacion`: sin colores fijos en el archivo de interfaz revisado. La validación visual en navegador queda pendiente: la herramienta devolvió `[browser.disconnected]`, sin navegador de escritorio conectado a esta sesión; no se declara realizada ni se exime QA.
- Preparación: `npm run build` sincronizó la interfaz compilada antes de las pruebas. La primera corrida de desarrollo tuvo 4 fallos: copia compilada desactualizada y `activeElement` ausente en el DOM mínimo de los tres casos SSE; corregidos el montaje de prueba y la preparación del build. La corrida final está detallada debajo.
- Control de regresión: una copia temporal sustituyó el refresco parcial por `navegar({ conservarVista: true })`; los casos de aviso propio y falla del endpoint fallaron (2 fallos esperados, salida 1). La fuente de trabajo no se revirtió y los temporales se eliminaron.
- Gate `qa-mechanical`, evaluador declarado `command`: recibo `GR-20261001-qa-mechanical`, emitido el `2026-10-01T14:25:10.337Z` en `.valmen/receipts/FEATURE-UI-SSE-FASES-20260929.jsonl`, resultado `approve`. Confirma `criterio_01`, `criterio_02` y `criterio_03`: las tres ejecuciones declaradas dieron salida 0 con 13/13 pruebas; criterios marcados después del recibo. No sustituye la validación visual ni la aceptación del responsable.
- Tras marcar los criterios y registrar el consumo, el motor exigió renovar el recibo por cambio de estado evaluado: nueva corrida `command` aprobada el `2026-10-01T14:27:25.977Z` (mismo identificador de recibo, nueva entrada append-only, tres comandos con salida 0 y 13/13 pruebas). El harness movió este ticket a `awaiting_user_tests` y actualizó su fila en el índice derivado; se comprobó antes que `tickets/index.md` coincidía exactamente con la proyección del registro. QA sigue pendiente y release sigue `unreleased`.

## Pruebas

- Resultado del PO: probado por el PO en Mission Control en vivo — port 4175, banda de fases visible y en vivo, sesiones por fase y fuente kanban revisadas. Sus palabras el 2026-10-01: «Dale listo ya las vi entonces podemos proseguir a cerrar los tickets»

Ejecución local del 2026-10-01 sobre el código final. Directorio de todos los comandos: `/Users/juanandrade/Desktop/ValmenHarness`.

| Comando | Resultado real | Resultado esperado al repetir |
|---|---|---|
| `npx vitest run tests/interfaz-ejecutable.test.ts` | Salida 0; 13/13 pruebas aprobadas; 1,81 s. | Los tres casos SSE y los casos previos de la banda y las otras vistas pasan. |
| `npx vitest run` | Salida 0; 88 archivos aprobados, 1 omitido; 1667 pruebas aprobadas y 48 omitidas; 26,75 s. | Suite sin fallos; las 48 equivalencias opcionales siguen omitidas sin `VALMEN_REFERENCE_TICKET_PY`. |
| `npm run typecheck` | Salida 0; build y comprobación TypeScript aprobados. | Compilación y tipos sin errores. |
| `npx eslint tests/interfaz-ejecutable.test.ts` | Salida 0. | Sin errores en las pruebas del ticket. |
| `npm run lint` | Salida 1; exactamente 4 errores preexistentes ajenos. | No se corrigen en este alcance. |

Lint ajeno comprobado: `packages/engine/src/evaluators.ts:24:31` (`Proposition`) y `:24:44` (`PropositionAnswer`), `tests/eventos-con-hora.test.ts:86:22` (`_detalles`) y `tests/mcp-server.test.ts:1045:7` (`SHA`), todos por `@typescript-eslint/no-unused-vars`. No apareció un quinto error en `mcp-server.test.ts:1048`.

Entorno para repetir: Node, dependencias npm instaladas y `npm run build` antes de probar si cambió el HTML (el verificador exige que la copia publicada coincida con la fuente). Los tests de interfaz simulan la API y SSE: no necesitan servidor ni credenciales.

Validación manual pendiente del responsable, en Mission Control con el build actual y este ticket abierto (`#/ticket/FEATURE-UI-SSE-FASES-20260929`):

1. Con la pantalla libre, generar una transición autorizada del ticket en un registro de prueba: tras el SSE y el margen de 300 ms, cambia la banda sin rearmar el detalle ni perder el recorrido de lectura.
2. Cambiar otro ticket: la banda propia permanece. Con foco en un campo o diálogo abierto, generar un aviso propio: no cambia la banda y aparece «hay cambios». Al dejar libre la pantalla y pulsarlo, aparecen las fases nuevas.
3. Interrumpir solo `GET /api/ticket/fases` después de una carga correcta y generar un aviso propio: la banda mantiene el último historial, sin fila de error. Restablecer el endpoint y repetir el aviso para comprobar recuperación.
4. Repetir en tema claro y oscuro y en ancho móvil y escritorio; comprobar la lectura de los tramos y que la actualización no roba el foco. No modificar el registro real ni marcar QA aprobada como parte de este recorrido.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-01",
    "build_reference": "worktree:sha256:f0ab3f6751fa742a0d8ec199ef226660106c08f77c4f75118e0ce8301e629a07",
    "environment": "Mission Control port 4175, navegador + suite vitest del repo",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-01",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Dale listo ya las vi entonces podemos proseguir a cerrar los tickets"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-01",
    "kind": "verification",
    "description": "QA del cierre: prueba del PO en Mission Control port 4175 y suite del arbol final. El arbol hasheado son los archivos del ticket en orden alfabetico: packages/server/web/index.html y tests/interfaz-ejecutable.test.ts.",
    "reference": "worktree:sha256:f0ab3f6751fa742a0d8ec199ef226660106c08f77c4f75118e0ce8301e629a07",
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
    "date": "2026-10-01",
    "technical_summary": "Refresco en vivo de la banda por SSE: solo el nodo de la banda, respetando puedeRefrescar y el margen de 300 ms, con el ultimo contenido si el endpoint falla",
    "functional_summary": "La pantalla del ticket muestra la linea de fases como banda con su duracion y fase en curso, actualizada en vivo sin recargar; probado por el PO en Mission Control.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f082ba628ffe2qugza8DD4zQlG",
    "model": "openrouter/openai/gpt-6.1-sol",
    "reasoning_effort": null,
    "notes": "Sesión de ejecución dedicada exclusivamente a FEATURE-UI-SSE-FASES-20260929. Medición real a 2026-10-01T14:26:51.328Z mediante leerLineaDeTiempo de packages/server/dist/timeline.js sobre la base OpenCode indicada; no es estimación ni reparto. Razonamiento: 2359 tokens; caché leída: 2332706 tokens (fuera de total_tokens, según el contrato del harness). Foto acumulada hasta ese momento: no incluye mensajes posteriores de registro y entrega. Implementación, tres pruebas SSE, control de regresión y verificación final; navegador no conectado, validación visual pendiente.",
    "input_tokens": 973,
    "output_tokens": 11028,
    "total_tokens": 14360,
    "estimated_cost_usd": 0.5720321000000002,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f082ba628ffe2qugza8DD4zQlG",
    "model": "openai/gpt-6.1-sol",
    "reasoning_effort": null,
    "notes": "Sesion OpenCode del eslabon",
    "input_tokens": 997,
    "output_tokens": 12473,
    "total_tokens": 16228,
    "estimated_cost_usd": 0.6815825,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "20260930_210422_62308a2e",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:telegram. Sesión **compartida**: trabajó 5 tickets (FEATURE-UI-BANDA-FASES-20260929 ×124, FEATURE-UI-SSE-FASES-20260929 ×104, FEATURE-API-KANBAN-FASES-20260929 ×103, FEATURE-CORE-DERIVAR-FASES-20260929 ×54, IMPROVEMENT-CLIENTE-DEV-20260930 ×18), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 3692302 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Saludo amistoso\".",
    "input_tokens": null,
    "output_tokens": null,
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
    "at": "2026-09-30T01:34:34.688Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-01T14:16:34.137Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-01T14:16:45.916Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO, Telegram 2026-10-01): El PO aprueba el REVIEW del análisis; sus palabras por Telegram: «Si claro necesito que siga el eslabon 6» y «Si aprobo el review desbloquea» (2026-10-01), extendidas al eslabón 7 de la misma tanda."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-01T14:16:46.061Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-01T14:17:49.026Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade (PO, Telegram 2026-10-01): El PO aprueba el REVIEW del plan; sus palabras: «sí aprobo el review desbloquea» y «Si claro necesito que siga el eslabon 6», extendidas al eslabón 7 de la tanda de 7 (2026-10-01)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-01T14:17:49.171Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-01T14:17:49.316Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-01T14:27:01.376Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-01T14:27:31.064Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-01T17:32:02.266Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-01T17:32:51.984Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:25.978Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:26.127Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:55.444Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:55.596Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:56.173Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:56.222Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-01T17:44:05.343Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
