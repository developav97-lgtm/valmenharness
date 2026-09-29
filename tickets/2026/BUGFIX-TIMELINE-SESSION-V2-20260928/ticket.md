---
schema_version: 2
id: BUGFIX-TIMELINE-SESSION-V2-20260928
title: La linea de tiempo no ve las sesiones de opencode 2.0.16 que viven en session_v2
type: BUGFIX
module: TIMELINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-28
updated: 2026-09-28
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-TIMELINE-SESSION-V2-20260928

## Solicitud original

El PO reviso el costeo de Mission Control y la sesion del ejecutor OpenCode de FEATURE-RELLENO-MASIVO-ANULACION-20260924 ($0.073 registrada a mano en el ticket) no aparece en la linea de tiempo: el lector solo consulta la tabla session de opencode.db, congelada desde 2026-09-24, mientras la sesion vive en session_v2 de opencode 2.0.16. 2026-09-28.

## Descripción funcional

- Alcance: el lector de la línea de tiempo de opencode (packages/server/src/timeline.ts): leer además la tabla `session_v2` de opencode 2.0.16 con sus mensajes en `session_message`, manteniendo la lectura actual de `session`/`message`/`part` para bases viejas. Sin cambio de contrato del registro ni de la API `/api/timeline`.
- Usuario o rol afectado: el PO y cualquier consumidor de Mission Control: hoy el ejecutor real del trabajo (OpenCode) es invisible y el costeo por ticket subestima lo que costó.
- Comportamiento actual: `leerLineaDeTiempo` consulta solo `FROM session s JOIN message m ... WHERE s.directory LIKE ?` (timeline.ts:493-509) y las partes de herramienta desde `part` (timeline.ts:528-565). En la base real la tabla `session` lleva congelada desde 2026-09-24 (8 filas) mientras `session_v2` acumula 58 filas (55 del proyecto SaiOpenCloud, última 2026-09-28 13:23): la sesión del ejecutor de FEATURE-RELLENO-MASIVO-ANULACION-20260924 (ses_f1792526fffekptiRjRGokU4T1, cost 0.07315299, tokens 174613/19625/34365/4855680) vive en `session_v2` y no aparece en ninguna fila del timeline; llegó al ticket solo porque el eslabón la registró a mano en `## Consumo de IA`.
- Comportamiento esperado: las sesiones de `session_v2` entran a la línea de tiempo con source opencode, modelo normalizado, tokens y coste reales; la atribución por ticket y el conteo de intervenciones funcionan con los mensajes de `session_message`; una base vieja sin `session_v2` sigue devolviendo la línea de siempre.

## Diagnóstico

- Archivos y flujo investigados: el lector de opencode en packages/server/src/timeline.ts (SQL de sesiones en :493-509, partes en :528-565, atribución por sesión en :567-638, filtro por ticket en :723-734) y sus lectores alternos leerSesionesDeCodex (:331) y leerSesionesDeHermes (:337); la base real ~/.local/share/opencode/opencode.db, donde `session` tiene 8 filas (última 2026-09-24 14:42) y `session_v2` 58 (última 2026-09-28 13:23, 55 del proyecto); la sesión del ejecutor existe solo en `session_v2` (directory, title con el ID del ticket, cost, tokens_*, model como JSON {"id","providerID"}), y sus mensajes están en `session_message` (43 filas; tipos user/assistant/system/idle; 42 filas mencionan valmen_; la fila assistant trae agent y model dentro de data), mientras `message`/`part` no tienen ninguna fila para esa sesión.
- Causa raíz o hipótesis: opencode 2.0.16 migró el esquema de su contabilidad (`session`→`session_v2`, `message`→`session_message`) dejando las tablas viejas presentes pero sin datos nuevos; el lector del harness quedó consultando las tablas viejas y el timeline solo ve lo viejo: sesiones de Hermes, de codex y las opencode anteriores al 24-sep. El defecto no es de consulta sino de cobertura de esquema: falta la segunda forma de la misma contabilidad.
- Riesgos y compatibilidad: (a) conviven bases de ambas versiones según la máquina — el lector debe soportar las dos formas y preferir `session_v2` cuando exista, deduplicando por id si una sesión apareciera en ambas; (b) `session_message` guarda los mensajes como data JSON y no hay tabla `part` para las v2 — el conteo de intervenciones y la atribución pueden necesitar el camino por texto que ya usa el lector de Hermes (hermes.ts:291-298), con la precisión menor que eso implica; se declara y el criterio lo fija por conteo, no por vía; (c) `session_v2.agent` puede venir NULL (la del ejecutor viene NULL) — el agente se toma del mensaje o queda vacío, igual que el respaldo que ya hace timeline.ts:574-589.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es un lector de solo lectura sobre la contabilidad del cliente; no toca el esquema del registro ni despliegue.

## Plan

- Gate no exigible: BUGFIX de lector de solo lectura; no cambia contratos del registro ni estados, y la aprobación del PO llega al ordenar la implementación.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. packages/server/src/timeline.ts: en `consultar()` (:469) agregar la lectura de `session_v2` (id, directory, title, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, agent, model, time_created) con el mismo filtro `directory LIKE ?`, combinándola con las filas de `session` y deduplicando por id; si la tabla no existe (base vieja), seguir solo con `session` sin error.
  2. packages/server/src/timeline.ts: para las sesiones v2 construir los mensajes desde `session_message` (data JSON con time/content/agent/model) y derivar las llamadas a herramientas del harness con la semántica existente: si la fila trae partes de tipo tool usarlas; si no, contar la intervención por texto con `esIntervencionDelHarness` de packages/server/src/hermes.ts:291 (misma heurística CLI/MCP).
  3. packages/server/src/timeline.ts: normalizar el modelo de `session_v2.model` (viene como JSON {"id","providerID"}) reutilizando `modeloDeSesion()` (:261-277), tomando coste y tokens directamente de las columnas de la fila.
  4. Pruebas en packages/server (vitest) con una base temporal de fixture: (a) un ticket trabajado por el ejecutor v2 aparece con coste y tokens reales; (b) una sesión presente en ambas tablas no se duplica; (c) una base vieja sin session_v2 sigue funcionando; y regresión de los golden existentes del timeline.
- Rollback: revertir los commits del ticket devuelve el lector a las tablas viejas; no hay cambio de esquema ni de datos, y la pantalla vuelve al estado actual sin pasos extra.

## Criterios de aceptación

- [x] Un ticket trabajado por el ejecutor de opencode 2.0.16 muestra en la línea de tiempo su fila source opencode con modelo normalizado, tokens y coste reales de session_v2
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] Una sesión presente en session y en session_v2 aparece una sola vez en la línea de tiempo
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] Una base de opencode sin tabla session_v2 sigue devolviendo la línea de tiempo desde session/message/part sin error
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] La batería completa del paquete server sigue verde tras el cambio
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/server/src/timeline.ts` — la lectura de `session_v2` entró en `consultar()` con el filtro `directory LIKE ?` y dedup por id contra las sesiones ya leídas de `session` (una sesión en las dos tablas aparece una sola vez; gana la vieja). La consulta de `session_v2` y la de `session_message` son tolerantes a la ausencia: una base vieja sigue igual, y una base solo-v2 también se lee — la decisión quedó escrita en el código: la consulta vieja puede fallar sin tumbar la línea si la forma v2 trae datos (`falloLaVieja && !hayV2` es el único `null`).
2. Los mensajes v2 se leen de `session_message` (parseo del data JSON; la consulta preparada se arma una vez y falla en silencio si la tabla no existe). De cada mensaje assistant se toman coste, agent y model; de los entries `type: "tool"` (con `name` y `state.input`) la clasificación: entrada MCP del harness por catálogo exacto con `herramientaDelHarnessDeOpencode()` (catálogos importados de hermes.ts, una sola fuente), y la vía CLI por herramienta de shell cuyo comando invoca `valmen`/`main.js`.
3. El modelo se normaliza con `modeloDeSesion()` — `session_v2.model` llega como JSON `{"id","providerID"}`. El coste y los tokens van directo de las columnas de la fila; el desglose harness/exploración integra los mensajes v2 en los contadores que ya existían.
4. Atribución al ticket: por llamada (bruto del entry que nombra el ticket → `sesionesDelTicket` + intervención con su coste por mensaje) y, como última vía, por mención del título o del primer mensaje del usuario — el caso del ejecutor que nunca tocó el registro.
5. `tests/timeline.test.ts` — 4 pruebas nuevas con base v2 de fixture: ejecutor con coste y tokens reales, llamada MCP que atribuye, dedup de sesión en las dos tablas, y base vieja sin `session_v2`.

Desviación declarada del plan: el plan decía «si la fila trae partes de tipo tool usarlas» — en la forma real no hay tabla `part` para las v2, las llamadas viven dentro del `content` del mensaje assistant, y así se implementó. Otra: el fallback de intervenciones por texto de `hermes.ts` no hizo falta para la vía MCP (el entry trae `name`/`state` completos), y el conteo quedó exacto, no aproximado.

## Pruebas

- `npx vitest run tests/timeline.test.ts tests/hermes.test.ts` → 39 pasadas (16 en timeline: 12 previas + 4 nuevas; 19 en hermes; sin fallos ni saltos nuevos).
- `npx vitest run` (suite completa del monorepo) → **1538 pasadas, 48 skipped, 0 fallos**.
- Verificación contra la base real de opencode (prueba temporal corrida fuera del suite, retirada del working tree después): el ejecutor de FEATURE-RELLENO-MASIVO-ANULACION-20260924 aparece con $0.073153 (0 intervenciones del registro, atribuido por mención del título/prompt); el de FEATURE-HUECOS-DETECCION-API-20260924 con $0.376873 y 31 intervenciones; SYNC-PRODUCTOS-FACTURABLE-20260922 mantiene sus 2 sesiones de codex.
- Verificación manual: el PO abrió Mission Control en :4174 y vio la fila del ejecutor con su coste.
- Resultado del PO: Aprueba el QA — «si apruebo la Qa ya se ve bien» — y ordena commit y push y continuar con los IMPROVEMENT.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-29",
    "build_reference": "worktree:sha256:d63ab2a3ceff2a93cb84c42a344d787238431c90f6bd7ff50737158f7ca97a7f",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-29",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "si apruebo la Qa ya se ve bien"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Lector session_v2 implementado en packages/server/src/timeline.ts: sesiones v2 con coste/tokens/modelo normalizado, mensajes desde session_message, atribucion por llamada MCP del harness o invocacion CLI en shell, mencion de titulo/primer mensaje como ultima via, base solo-v2 o vieja soportadas y dedup por id. Suite completa verde: 1538 pruebas pasadas, 0 fallos. Verificado contra la base real de opencode: el ejecutor de FEATURE-RELLENO-MASIVO-ANULACION-20260924 aparece con $0.073153 (0 intervenciones, atribuido por mencion), el de FEATURE-HUECOS-DETECCION-API-20260924 con $0.376873 y 31 intervenciones, y las 2 sesiones codex de SYNC-PRODUCTOS-FACTURABLE-20260922 intactas.",
    "reference": "worktree:sha256:d63ab2a3ceff2a93cb84c42a344d787238431c90f6bd7ff50737158f7ca97a7f",
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
    "date": "2026-09-29",
    "technical_summary": "Lector de la forma v2 de opencode 2.0.16 en packages/server/src/timeline.ts",
    "functional_summary": "El coste del ejecutor de opencode se ve en la linea de tiempo del ticket",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguno"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesion 20260928_140418_c56444 del escritorio Hermes: trabajo meta directo del harness - diagnostico, implementacion, pruebas y cierre. Sirvio a los dos BUGFIX y al diseno del pipeline; su gasto completo queda en la base del perfil saiopencloud: 3.169.166 tokens entrada + 348.987 salida + 211.763 razonamiento, 248 llamadas, modelo glm-5.3-flash, sin costo por token de suscripcion",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:hermes",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": "20260928_140418_c56444",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 9 tickets (BUGFIX-TIMELINE-SESSION-V2-20260928 ×136, BUGFIX-SERVER-ATRIBUCION-POR-LLAMADA-20260928 ×113, FEATURE-RELLENO-MASIVO-ANULACION-20260924 ×81, FEATURE-HUECOS-DETECCION-API-20260924 ×42, IMPROVEMENT-ENGINE-QA-REFERENCIA-COMMIT-20260928 ×42), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 3806872 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Evolucionar flujo de trabajo SciOpenCloud\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/saiopencloud/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "date": "2026-09-28",
    "at": "2026-09-29T01:50:02.208Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-28",
    "at": "2026-09-29T02:03:22.862Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:39.767Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO): Análisis aprobado por el PO en conversación: los 4 gates cayeron en la banda espuria de riesgos_cubren_impactos con impactos en ninguno, defecto ya registrado en FEATURE-GATE-IMPACTO-NULO-BANDA-20260928."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:50.380Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:50.513Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-28",
    "at": "2026-09-29T02:53:06.403Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-28",
    "at": "2026-09-29T02:54:19.524Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-28",
    "at": "2026-09-29T02:58:05.322Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:56.050Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:56.614Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:57.167Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:57.466Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:57.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:59.694Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-28",
    "at": "2026-09-29T03:18:59.823Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:00.379Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
