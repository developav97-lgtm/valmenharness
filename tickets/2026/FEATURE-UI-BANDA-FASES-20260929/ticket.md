---
schema_version: 2
id: FEATURE-UI-BANDA-FASES-20260929
title: Banda de fases en pantalla de ticket de Mission Control
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

# FEATURE-UI-BANDA-FASES-20260929

## Solicitud original

Parte del sprint: Presentación en vivo.
- R-S1-005: Presetación — La pantalla de ticket en Mission Control DEBE mostrar la línea como una banda
Depende de: FEATURE-API-FASES-20260929.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la vista de un ticket en Mission Control muestra la línea de fases como una banda con la duración de cada fase cerrada, la fase en curso con su comienzo y el tiempo llevado, y el bloqueo con su motivo.
- Usuario o rol afectado: quien sigue un ticket desde Mission Control.
- Comportamiento actual: la pantalla muestra el paso por dónde va (tira de estados) pero no la duración por fase ni el tiempo en curso.
- Comportamiento esperado: además de la tira, una banda de fases alimentada por `GET /api/ticket/fases`, con cada fase rotulada, su duración visible, la fase activa destacada y el motivo del bloqueo declarado en la banda.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` — toda la UI de Mission Control es un solo archivo (6735 líneas): la vista de un ticket es `vistaTicket(id)` (`index.html:3835`), que arma la cabecera, la tira de estado (`tiraDeEstado`, `index.html:4546`) y las secciones de gates, plan y timeline. El cargue de datos es por `api("GET", …)` contra el servidor local (`index.html:2065` es el patrón). La API que alimenta la banda ya existe y está aprobada: `GET /api/ticket/fases?ticket=<ID>` (`server.ts:757`), que responde `{ ticket, fases, timeline, sesionesPorFase, kanban }`, con cada fase como `{ estado, inicio, fin, ms, enCurso, motivo }`.
- Causa raíz o hipótesis: la banda no existe — la única visual de flujo del ticket es la tira de pasos numerados (`tiraDeEstado`), que muestra el orden canónico de estados pero no **cuándo** empezó cada fase, cuánto duró ni cuál corre ahora (R-S1-005). El dato ya lo publica el endpoint de fases; falta el consumidor de pantalla. La banda nueva se agrega en `vistaTicket` entre la tira de estado y las secciones, consumiendo el endpoint existente, sin tocar `tiraDeEstado` ni ninguna vista más.
- Riesgos y compatibilidad: (1) la banda no sustituye la tira: la tira es navegación por estados (sus pasos filtren la lista); la banda es historia temporal. (2) Un ticket sin transiciones (`fases` con una sola fase desde `created_at`) debe verse como banda de una sola fase, no como ausencia. (3) `fases` puede venir con fase `enCurso` y con `motivo` en `blocked`/`changes_requested`; el bloqueo se pinta dentro de la banda con su texto, no como chip aparte. (4) Sin colores fijos: los estilos salen de las variables del tema (`--fondo`, `--texto`, `--panel`, `--borde`, y las que ya usan `.estado-paso.hecho` / `.actual`). (5) El HTML es estático servido por `serveStatic` — sin framework ni build: el cambio es de `index.html` y su prueba es la suite de Mission Control más inspección de pantalla.
- Impactos de sync, migración, Docker o despliegue: ninguno — es una pantalla del paquete `server`, de solo lectura, que consume un endpoint ya aprobado; no toca registro, esquema, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La autorización anticipada del PO ya fue dada para la tanda de 7 de la feature timeline-fases: «Dale, abrí las 7 tarjetas kanban» (PO por Telegram, 2026-09-30). El eslabón 6 (este) la replica con su nombre de tarjeta propia, igual que los eslabones 1 a 5 de la misma tanda.
- Decisiones:
  1. **La banda es una sección nueva de `vistaTicket`, no una pieza de `tiraDeEstado`.** La tira responde «¿por dónde va?» y es navegación por estados; la banda responde «¿cuándo y cuánto duró?». Fusionarlas acopla dos vidas distintas y rompe los criterios de la tira.
  2. **La banda se alimenta del endpoint ya aprobado `GET /api/ticket/fases`** y su dispnonibilidad: si la llamada falla, `vistaTicket` pinta la banda como «Sin línea de fases» — como una fila informativa, no como aviso de error — y el resto de la pantalla pinta igual (criterio 3); una pantalla que muere porque una API no respondió no lo hace la vida del usuario fácil.
  3. **Cada fase es un tramo con su rótulo y duración; la fase en curso lleva su comienzo y el tiempo llevado, la cerrada lleva fin y ms.** El motivo de bloqueo va una línea dentro del tramo, rotulado en español.
  4. **Estilos con variables del tema igual que `estado-paso`**, sin colores literales: la banda hereda la misma paleta, y así el modo oscuro sigue cobijado.
  5. **Sin dependencia nueva**: la vista ya tiene `api("GET", …)` para el cargue de datos; el nuevo fetch no pide helpers ni frameworks, así que el HTML sigue estático servido por `serveStatic`.
- Pasos ordenados:
  1. `packages/server/web/index.html` — CSS de la banda: seccción `.banda-fases` y tramos (`.banda-fase`, `.banda-fase.actual`, `.banda-fase.motivo-de-bloqueo`) con variables del tema, junto a la regla de `estado-ticket` (por ~línea 1330).
  2. `packages/server/web/index.html` — función `bandaDeFases(ticket)` en `vistaTicket`: llama `api("GET", `/api/ticket/fases?ticket=${id}`)`, arma los tramos y los anexa después de `tiraDeEstado`; si la llamada falla, sigue la vista sin abbandonar (criterio 3 en la suite).
  3. `tests/interfaz-ejecutable.test.ts` — los tres criterios nuevos: la banda con fase única que aparece para un ticket de una sola fase (_raise_ el stub de api con `fases` real de uno de los tickets del registro), con fase en curso y con `motivo` en la fase cerrada; el motivo pintado en la banda sin colores literales (grep de la regla, no del valor en la clase); y la vista sin la API de fases que pinta igual el resto.
  4. `npx vitest run tests/interfaz-ejecutable.test.ts`, después `npx vitest run` y `npm run typecheck` — tres corriendos reales en el árbol final con resultados verdes (el lint global tiene 3 faltas conocidas, ajenas al ticket, y se declaran presentada en la entrega).
- Rollback: revertir el commit saca el CSS de la banda, la función y los tres casos de suite de una sola vez. La pantalla queda como hoy: la `tiraDeEstado` no cambió y ninguna otra vista toca la banda.

## Criterios de aceptación

- [x] La vista del ticket pinta la banda de fases: cada fase rotulada con su duración, la fase en curso marcada y un ticket de fase única se ve como banda de un solo tramo, en `tests/interfaz-ejecutable.test.ts`.
  <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [x] La banda muestra el motivo del bloqueo —`motivo` del phase `blocked`/`changes_requested`— dentro de la banda sin chips nuevos ni colores fijos, y su CSS usa solo variables del tema, en `tests/interfaz-ejecutable.test.ts`.
  <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [x] La vista del ticket sigue funcionando con la API de fases caída: la banda no rompe la vista (sin «No se pudo cargar la vista») y la pantalla pinta lo demás igual, en `tests/interfaz-ejecutable.test.ts`.
  <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

- 2026-10-01 — Implementado el plan aprobado, exclusivamente en `packages/server/web/index.html` y `tests/interfaz-ejecutable.test.ts`; este ticket conserva el diagnóstico, el plan y los eventos previos. Sin commits ni cambios ajenos.
- CSS junto a `estado-ticket`: `.banda-fases`, contenedor flexible de tramos, `.banda-fase`, variante `.actual` y motivo de bloqueo. Todos los colores se resuelven mediante variables del tema; sin dependencias nuevas ni modificaciones de `tiraDeEstado`.
- `bandaDeFases(ticket)` dentro de `vistaTicket`: sección inmediatamente después de la tira; consume `GET /api/ticket/fases?ticket=<ID>` y presenta rótulos españoles, comienzo, fin y duración de fases cerradas, fase activa y tiempo llevado al cargar la respuesta. El motivo de `blocked`/`changes_requested` se presenta como texto dentro del tramo, nunca como HTML ni chip.
- La llamada es independiente del resto del cargue: mientras está pendiente se muestra «Leyendo las fases…»; una respuesta vacía o fallida muestra «Sin línea de fases» como fila informativa. Las horas y duraciones ausentes se declaran, no se inventan.
- Tres pruebas nuevas: fase única derivada del evento de creación real de este ticket y secuencia de fases cerrada/activa; motivo de bloqueo/reapertura seguro y CSS sin literales; igualdad de toda la vista excepto la banda cuando la API rechaza o queda sin responder. También se comprueba ubicación tras la tira y ausencia de horas/duraciones.
- Resultados reales: `npx vitest run tests/interfaz-ejecutable.test.ts` **10/10**; `npx vitest run` **88 archivos aprobados, 1 omitido; 1664 pruebas aprobadas y 48 omitidas**; `npm run typecheck` **correcto**. La primera corrida de interfaz tuvo 9/10: la aserción buscaba una frase citada por el propio ticket; se corrigió para detectar el nodo de aviso real, no el texto documental.
- Revisión de presentación: **sin colores fijos, 1 archivo de interfaz revisado**. `npm run lint` continúa con **4 errores en los 3 lugares preexistentes**: dos imports no usados en `packages/engine/src/evaluators.ts:24`, `_detalles` en `tests/eventos-con-hora.test.ts:86` y `SHA` en `tests/mcp-server.test.ts:1045`. Ninguno pertenece a este cambio; se conservaron.
- Gate `qa-mechanical` con evaluador `command`, recibo `GR-20261001-qa-mechanical` (2026-10-01T14:11:13.064Z): **approve**, tres criterios ejecutados con salida 0, 10/10 cada corrida. Casillas marcadas según ese recibo; no se llamó a un modelo para este gate mecánico.
- Limitación de ambiente: CodeGraph no está inicializado en este repositorio; se consultaron los archivos directamente sin crear su índice. La herramienta de navegador respondió `browser.disconnected`; no se declara inspección visual realizada ni QA aprobada. Queda el recorrido manual para el responsable.
- Control negativo sobre el HTML anterior de `HEAD`, copiado por bytes a un temporal fuera del repositorio: la interfaz anterior se ejecuta, pero carece de banda, de CSS de banda y de la fila «Sin línea de fases». Las aserciones nuevas requieren esas piezas y detectan su ausencia. El temporal se eliminó; no se sustituyó ni revirtió ningún archivo de trabajo.
- El ticket conserva `in_progress`: la inspección visual previa a la entrega no pudo realizarse, y se evita una transición que regeneraría el índice compartido fuera de las rutas del plan. No se cierra ni se exime ninguna validación; el responsable dispone abajo del contrato de pruebas y del recorrido pendiente.

## Pruebas

- Resultado del PO: probado por el PO en Mission Control en vivo — port 4175, banda de fases visible y en vivo, sesiones por fase y fuente kanban revisadas. Sus palabras el 2026-10-01: «Dale listo ya las vi entonces podemos proseguir a cerrar los tickets»

- Directorio para todos los comandos: `/Users/juanandrade/Desktop/ValmenHarness`.
- Entorno: dependencias npm instaladas, Node compatible con el proyecto (recomendado Node 24). `npm run build` se ejecutó antes de la suite para actualizar la copia estática ignorada en `packages/cli/dist/web`; no se añadió al registro Git.

| Comando | Resultado observado / esperado al repetir |
| --- | --- |
| `npx vitest run tests/interfaz-ejecutable.test.ts` | Salida 0; 10 pruebas aprobadas. |
| `npx vitest run` | Salida 0; 1664 aprobadas, 48 omitidas por referencia externa desactivada. |
| `npm run typecheck` | Salida 0; build y comprobación TypeScript correctos. |
| `npm run lint` | Salida 1; únicamente los 4 errores ajenos ya detallados, no verde. |

- Recorrido manual pendiente, sobre Mission Control servido desde este repositorio y el HTML recompilado: abrir `#/ticket/FEATURE-UI-BANDA-FASES-20260929`, comprobar banda después de la tira, rótulos, comienzo/fin, duración y fase actual; alternar tema claro/oscuro y tamaño de escritorio/móvil. En datos de prueba con `blocked` o `changes_requested` y `motivo`, comprobar el motivo dentro del tramo sin chips. Simular fallo de `/api/ticket/fases` desde las herramientas del navegador y comprobar «Sin línea de fases» con el resto de secciones y navegación operativas. La tira mantiene su navegación por estado. El resultado del responsable sigue pendiente; no se exime QA ni se publica.

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
    "technical_summary": "Banda de fases en la vista del ticket de Mission Control: fases rotuladas, duracion, fase en curso destacada, motivo de bloqueo, CSS con vars del tema y degradacion amable",
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
    "session_reference": "ses_f0838ca4bffe6kXq1jkItay0d2",
    "model": "openrouter/openai/gpt-6.1-sol",
    "reasoning_effort": null,
    "notes": "Sesión de ejecución dedicada exclusivamente a este ticket. Corte real consultado con sqlite3 -readonly en session_v2: tokens_input=938, tokens_output=8196, tokens_reasoning=1534, tokens_cache_read=1789161; 34 mensajes assistant en session_message. Total declarado = entrada + salida + razonamiento, sin caché. Costo agregado registrado por OpenCode al momento de la consulta; no es una estimación ni incluye intervenciones posteriores a este corte.",
    "input_tokens": 938,
    "output_tokens": 8196,
    "total_tokens": 10668,
    "estimated_cost_usd": 0.4875725,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f0838ca4bffe6kXq1jkItay0d2",
    "model": "openai/gpt-6.1-sol",
    "reasoning_effort": null,
    "notes": "Sesion OpenCode del eslabon",
    "input_tokens": 980,
    "output_tokens": 9910,
    "total_tokens": 13572,
    "estimated_cost_usd": 0.6821338,
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
    "at": "2026-09-30T01:34:34.632Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-01T13:54:27.614Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-01T14:03:16.933Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO, Telegram 2026-10-01): El PO aprueba el REVIEW del análisis; sus palabras por Telegram: «Si claro necesito que siga el eslabon 6» y «Si aprobo el review desbloquea» (2026-10-01)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-01T14:03:17.088Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-01T14:03:22.142Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-01T14:03:22.310Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-01T14:11:53.971Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-01T14:15:16.434Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-01T17:32:02.091Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-01T17:32:51.612Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:25.698Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:25.842Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:54.528Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:54.680Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:55.257Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-01T17:43:55.304Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-01T17:44:04.763Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
