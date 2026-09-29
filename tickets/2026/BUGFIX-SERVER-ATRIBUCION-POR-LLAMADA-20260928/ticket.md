---
schema_version: 2
id: BUGFIX-SERVER-ATRIBUCION-POR-LLAMADA-20260928
title: La atribucion de sesiones de Hermes marca trabajados todos los tickets mencionados en un mensaje con una sola escritura
type: BUGFIX
module: SERVER
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

# BUGFIX-SERVER-ATRIBUCION-POR-LLAMADA-20260928

## Solicitud original

El PO ve en el costeo sesiones de cron compartidas entre 4, 5 y 8 tickets cuando cada eslabon trabajo uno solo: la clasificacion es por mensaje, y un mensaje con una invocacion CLI o escritura marca como trabajados todos los tickets que el mensaje menciona, incluidos los de comandos de lectura. 2026-09-28.

## Descripción funcional

- Alcance: la atribución de sesiones de Hermes a tickets en packages/server/src/hermes.ts: la clasificación de «trabajado» y el peso por ticket pasan de grano por mensaje a grano por llamada (MCP o CLI), marcando como trabajados solo los tickets que aparecen en los argumentos de la llamada que escribe.
- Usuario o rol afectado: el PO frente al costeo: las sesiones de cron de la jornada aparecen «compartida entre 4/5/8 tickets» con su costo fuera de los totales, aunque cada eslabón trabajó un solo ticket (verificado contra las 5 sesiones cron del 2026-09-28 del perfil saiopencloud).
- Comportamiento actual: `ticketsDeSesion` (hermes.ts:509-554) recorre los mensajes y decide por mensaje si «escribe» (:540-542): si el mensaje contiene cualquier llamada de escritura o una invocación CLI, **todos** los tickets mencionados en el texto de sus tool_calls reciben peso 3 y quedan marcados trabajados. El eslabón cron opera el registro por CLI dentro de `terminal` (31 invocaciones CLI en la sesión del eslabón 3, cero herramientas MCP) y sus comandos de lectura mencionan decenas de tickets (`for t in … grep`), así que esos tickets quedan como trabajados y `atribucionDeSesion` (:566-578) declara la sesión compartida.
- Comportamiento esperado: una llamada MCP de escritura marca solo los tickets de sus argumentos; una invocación CLI de escritura marca solo los tickets que aparecen en el segmento escrito del comando; las llamadas y comandos de lectura no marcan nada; una sesión que trabajó un solo ticket deja de salir compartida y su costo entra al total del ticket.

## Diagnóstico

- Archivos y flujo investigados: packages/server/src/hermes.ts (ticketsDeSesion :509-554, atribucionDeSesion :566-578, esIntervencionDelHarness :291-298, escribePorCli :310-312, subcomandoDeValmen :264-275, catálogos HERRAMIENTAS_QUE_ESCRIBEN :181-206 y HERRAMIENTAS_DE_LECTURA :162-178) y la base real del perfil saiopencloud. Reproducción con la lógica actual sobre las sesiones cron del 2026-09-28: el eslabón 3 (FEATURE-RELLENO-MASIVO-ANULACION) marca 4 tickets trabajados → compartida; el eslabón 1 (GENERACION) marca 2; el eslabón 4 (PANTALLA) marca 5; el eslabón 5 (EDICION-DEV-PANTALLA) marca 2. Con clasificación por llamada y solo argumentos de escritura, las cuatro quedan con dueño único y el ticket de su eslabón está marcado en los cuatro casos.
- Causa raíz o hipótesis: el grano de la clasificación es el mensaje y no la llamada. El turno de un agente orquestador mezcla comandos de escritura del ticket propio con comandos de lectura que citan otros tickets (grafo de la feature, dependencias, checks de estado); atribuir por mensaje convierte esa cita en trabajo. La regla de atribucionDeSesion («si trabajó más de uno, compartida») es correcta; lo que está mal es qué cuenta como trabajado.
- Riesgos y compatibilidad: (a) una llamada MCP de escritura cuyos argumentos mencionan varios tickets (anexar_ticket_a_feature con una lista) sigue marcando varios — es correcto y no cambia; (b) los comandos compuestos (`valmen ticket move --id A && valmen ticket show B`) deben partirse por `;`/`&&`/`|` como ya hace `subcomandoDeValmen` (:264-275) para no adjudicar al segmento escritor los tickets de los segmentos vecinos de lectura; (c) el test que contrasta los catálogos contra el catálogo MCP (hermes.ts:153-160) debe seguir pasando: el cambio es de grano, no de catálogo; (d) los consumos ya registrados en tickets no se reescriben — el fix vale para fotos nuevas del bloque Consumo de IA.
- Impactos de sync, migración, Docker o despliegue: ninguno. Lógica de lectura del lector de Hermes; no toca el registro ni despliegue.

## Plan

- Gate no exigible: BUGFIX del lector de atribución; corrección de grano sin cambio de contrato ni de catálogos, y la aprobación del PO llega al ordenar la implementación.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. packages/server/src/hermes.ts: en `ticketsDeSesion` (:509-554) reemplazar la decisión por mensaje por un recorrido por llamada: separar las invocaciones del texto de tool_calls (JSON de Hermes con function.name/arguments, desescape de comillas ya existente en textoDeLlamadas :277-280) y clasificar cada llamada por su cuenta.
  2. packages/server/src/hermes.ts: para llamada MCP, marcar como trabajados solo los tickets del texto de **sus argumentos**, con peso 3 si la herramienta está en HERRAMIENTAS_QUE_ESCRIBEN; para invocación CLI, identificar el segmento escrito (extensión de subcomandoDeValmen que parta por ; & | y distinga escritura de lectura por subcomando/acción) y marcar solo los tickets que aparecen en ese segmento.
  3. packages/server/src/hermes.ts: el peso de lectura (1) y el conteo por texto de content (:546-548) quedan igual — solo cambia qué marca «trabajado».
  4. Pruebas en packages/server (vitest): (a) mensaje con `terminal` que corre `valmen ticket move --id A` junto a un `grep` que menciona B → solo A trabajado; (b) llamada MCP de escritura del ticket A en un mensaje cuyo texto menciona B → solo A; (c) llamada MCP anexar_ticket_a_feature con dos tickets en argumentos → los dos marcados; (d) fixture con la forma real de tool_calls de las sesiones cron de la jornada (terminal con valmen y grep multi-ticket) → dueño único con el ticket del eslabón marcado.
- Rollback: revertir los commits devuelve la clasificación por mensaje; no hay datos que migrar ni recibos que reescribir.

## Criterios de aceptación

- [x] Un mensaje que mezcla un comando CLI de escritura del ticket A con comandos o texto que mencionan el ticket B deja a B fuera de los tickets trabajados de la sesión
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] Una llamada MCP de escritura marca como trabajados solo los tickets que aparecen en sus argumentos
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] Una sesión que escribió un solo ticket ya no se declara compartida y su costo entra al total del ticket en la línea de tiempo
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] Un fixture con la forma real de tool_calls de las sesiones cron de la jornada (terminal con valmen y grep multi-ticket) se atribuye con dueño único al ticket de su eslabón
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->
- [x] La batería completa del paquete server sigue verde tras el cambio
      <!-- test: npx vitest run tests/timeline.test.ts tests/hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/server/src/hermes.ts` — `ticketsDeSesion()` pasó de grano por mensaje a grano por **llamada**: `llamadasDeTexto()` parsea el JSON **crudo** de `tool_calls` (las comillas escapadas son las que lo hacen JSON válido; desescaparlo primero rompía el parseo —lo detectaron las pruebas existentes y el fixture lo fija—) y devuelve nombre+argumentos de cada invocación.
2. Clasificación por llamada: entrada MCP del harness marca como trabajados solo los tickets de **sus argumentos** (escritura por catálogo exacto `HERRAMIENTAS_QUE_ESCRIBEN`, peso 3; lectura peso 1); herramienta ajena (read_file, patch…) pesa pero no marca; herramienta de shell (`terminal`/`shell`/`bash`/`execute`) se parte por segmentos `;`/`&&`/`|` y cada segmento con invocación del CLI responde por los tickets que **su propio segmento** nombra (peso 3, trabajado).
3. El caso conservado del repo propio: `segmentoInvocaCli()` no distingue lectura de escritura por subcomando — el validador corrido como `main.js … validate --id X` (test preexistente :191-223) es lectura que **apunta** al ticket y es trabajo sobre él. Lo que se abandona del criterio viejo es el grano, no la vía.
4. Un `tool_calls` que no parsea como arreglo no se descarta: sus menciones pesan como texto (fallback fiel al comportamiento anterior).
5. `tests/hermes.test.ts` — 4 pruebas nuevas: mezcla escritura+grep (ajenos fuera), MCP de escritura con mensaje vecino de lectura (dueño único), `anexar_ticket_a_feature` con dos tickets en argumentos (los dos marcados — caso legítimo que el grano fino conserva), y el fixture con la forma real de los eslabones cron (dueño único).

## Pruebas

- `npx vitest run tests/hermes.test.ts tests/timeline.test.ts` → 39 pasadas (19 en hermes: 15 previas + 4 nuevas).
- `npx vitest run` (suite completa) → **1538 pasadas, 48 skipped, 0 fallos**.
- Verificación contra la base real del perfil saiopencloud (prueba temporal corrida fuera del suite, retirada después): las 5 sesiones cron de la jornada del 2026-09-28 quedan con dueño único (`reparto=0`) y el ticket de su eslabón atribuido; las compartidas que quedan en las fichas son reales — sesiones de desktop/Slack que atendieron 2-7 tickets de verdad.
- Verificación manual: el PO abrió Mission Control en :4174 y vio la sesión del eslabón 3 con dueño único y el costo del ejecutor en el total del ticket.
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
    "description": "Atribucion por llamada en packages/server/src/hermes.ts: parseo del JSON crudo de tool_calls, grano por llamada (MCP marca solo los tickets de sus argumentos; shell se parte por segmentos y cada segmento con CLI responde por los tickets que nombra), fallback a texto cuando el tool_calls no parsea, y el caso main.js-validate del repo propio conservado. 4 pruebas nuevas + 4 pruebas de sesion v2 en tests. Suite completa verde: 1538 pruebas, 0 fallos. Verificado contra la base real del perfil saiopencloud: las 5 sesiones cron de la jornada del 2026-09-28 quedan con dueno unico (reparto=0) y las compartidas restantes son reales (desktop/slack que atendieron 2-7 tickets).",
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
    "technical_summary": "Atribucion por llamada en packages/server/src/hermes.ts",
    "functional_summary": "Las sesiones cron de la jornada quedan con dueno unico; las compartidas restantes son reales",
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
    "at": "2026-09-29T01:50:02.349Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-28",
    "at": "2026-09-29T02:03:22.716Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:39.942Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO): Análisis aprobado por el PO en conversación: los 4 gates cayeron en la banda espuria de riesgos_cubren_impactos con impactos en ninguno, defecto ya registrado en FEATURE-GATE-IMPACTO-NULO-BANDA-20260928."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:50.641Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:50.809Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-28",
    "at": "2026-09-29T02:53:06.621Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-28",
    "at": "2026-09-29T02:54:19.920Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-28",
    "at": "2026-09-29T02:58:05.584Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:01.683Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:02.972Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:04.025Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:04.506Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:05.052Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:06.312Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:06.361Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-28",
    "at": "2026-09-29T03:19:06.553Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
