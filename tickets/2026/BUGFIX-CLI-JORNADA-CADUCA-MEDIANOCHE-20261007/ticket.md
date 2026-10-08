---
schema_version: 2
id: BUGFIX-CLI-JORNADA-CADUCA-MEDIANOCHE-20261007
title: Que la jornada siga viva hasta terminar sus tickets en vez de caducar a medianoche UTC
type: BUGFIX
module: CLI
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-CLI-JORNADA-CADUCA-MEDIANOCHE-20261007

## Solicitud original

La jornada se identifica por la fecha UTC (JOR-AAAAMMDD). A medianoche UTC —las 19:00 en Colombia— el disparador pasa a buscar la jornada del día nuevo, no la encuentra y responde sin-jornada: deja de preparar y ejecutar aunque queden tickets sin terminar, y hay que volver a armarla con valmen journey plan. Pasó la noche del 2026-10-07 al 2026-10-08 con la jornada JOR-20261007. El PO espera programar tickets una vez y que la jornada siga hasta que todos terminen. Debe: que el avance use la jornada más reciente que todavía tenga tickets sin cerrar cuando no exista la del día; que armar la jornada de un día nuevo conserve los tickets pendientes de la anterior; y que una jornada sin tickets pendientes se dé por terminada y lo avise por el canal de avisos.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el avance de la jornada (`valmen journey advance`, que invoca el disparador periódico), el armado de la jornada (`valmen journey plan` y la herramienta MCP `armar_jornada`) y el vigilante de avisos (`pendientesDeAvisar` / `hermesNotifyPendientes`). Queda fuera cambiar el formato del identificador `JOR-AAAAMMDD` (sigue en UTC) y el despacho en sí (`dispatchJourney`, `despacharPreparacion`).
- Usuario o rol afectado: el PO que programa tickets una vez con `valmen journey plan` y espera que el disparador los lleve hasta el final sin volver a armar la jornada.
- Comportamiento actual: a las 00:00 UTC (19:00 en Colombia) el avance busca `JOR-<fecha nueva>`, no la encuentra y responde `sin-jornada` sin despachar ni preparar nada, aunque la jornada del día anterior tenga tickets sin cerrar. Armar la jornada del día nuevo solo contiene los tickets que se nombran en ese armado: los pendientes de la anterior se pierden si no se repiten a mano. Nadie avisa cuando una jornada termina.
- Comportamiento esperado: si no existe la jornada del día, el avance usa la jornada más reciente que todavía tenga tickets sin cerrar; armar la jornada de un día nuevo hereda los tickets pendientes de esa jornada anterior; y cuando la jornada más reciente ya no tiene tickets pendientes se da por terminada y el vigilante lo avisa una sola vez por el canal de avisos (Telegram).

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el avance calcula la jornada solo por la fecha UTC: `packages/engine/src/journey-advance.ts:86-88` (`jornadaDelDia` = `JOR-` + `toISOString().slice(0,10)`) y `packages/engine/src/journey-advance.ts:96` la usa cuando no llega `journeyId`; si esa jornada no existe en el historial, `packages/engine/src/journey-advance.ts:98-102` devuelve `sin-jornada` sin mirar otras jornadas. El CLI repite el mismo cálculo para la pasada de error en `packages/cli/src/commands.ts:2788`. En el armado, `packages/engine/src/journey-plan.ts:137-139` decide el identificador por la fecha UTC y `packages/engine/src/journey-plan.ts:106-118` arma la lista solo con los tickets pedidos: nada consulta la jornada anterior. Comprobado en el registro: `.valmen/journeys/events.jsonl` tiene `JOR-20261007` con tickets sin cerrar y hubo que crear `JOR-20261008` a mano (cursor 11, `2026-10-08T01:00:55Z`).
- Hipótesis pendientes: ninguna sobre la causa. Sobre la herencia: un ticket ya despachado bajo la jornada anterior y heredado por la nueva no se despacha dos veces, porque la selección solo elige tickets en `approved` (`packages/engine/src/journey-selection.ts:167`); se cubre igual con una prueba (C4).
- Consumidores afectados: `journeyAdvanceCommand` (`packages/cli/src/commands.ts:2770-2830`) y la pasada que anexa (`registrarPasada`, que usa `avance.journeyId`); `journeyPlanCommand` (`packages/cli/src/commands.ts:3459`); la herramienta MCP `armar_jornada` (`packages/mcp/src/tools.ts:2505`); el vigilante `pendientesDeAvisar` (`packages/cli/src/hermes.ts:755`) y su envío en `hermesNotifyPendientes` (`packages/cli/src/hermes.ts:902`, rama `arbol-sucio` en `:996` como modelo); el registro de avisos de `packages/engine/src/approval.ts` (tipos `:171-188`, lector con lista de tipos `:462-472`, `arbolesSuciosAvisados` `:503`, exclusión de avisos `:614`); los renderizadores de `packages/engine/src/notify.ts:520`. Pruebas existentes: `tests/avance-jornada.test.ts:156-178,357-386` (casos `sin-jornada`), `tests/jornada-diaria.test.ts:147-150`, `tests/vigilante-jornada.test.ts`.
- Archivos y flujo investigados: disparador → `journeyAdvanceCommand` → `avanzarJornada` → `readJourneys` (`packages/engine/src/journeys.ts:143`, proyecta la última foto de cada jornada en orden de creación) → `avanzarEjecucion` / `avanzarPreparacion` con `executionId = journeyId`. Armado: `journeyPlanCommand` / `armar_jornada` → `armarJornada` → `createJourney` / `reviseJourney`. Avisos: `hermesNotifyPendientes` → `pendientesDeAvisar` → `appendApproval` como marca de entregado. `buscar_memoria` («jornada caduca medianoche UTC sin-jornada disparador») no devolvió antecedentes de este síntoma.
- Riesgos y compatibilidad: (1) el vigilante podría avisar de golpe todas las jornadas históricas ya cerradas; se acota a la jornada más reciente del historial y con una marca `journey-finished-notice` por jornada. (2) Los casos de prueba actuales de `sin-jornada` deben seguir valiendo cuando no hay ninguna jornada con pendientes. (3) El historial de jornadas es append-only: heredar escribe una foto nueva de la jornada del día, nunca edita la anterior. (4) Una línea `journey-finished-notice` en `approvals.jsonl` escrita por la versión nueva la ignora una versión anterior, porque el lector filtra por tipos conocidos (`approval.ts:462-472`). (5) Si `--journey` se pasa explícito, se respeta tal cual (sin búsqueda).
- Impactos de sync, migración, Docker o despliegue: ninguno — cambio del motor y del CLI del harness; no hay sincronización, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. `packages/engine/src/journey-advance.ts`: nueva función exportada `jornadaVigente(project, ahora)` que devuelve la jornada del día si existe; si no, la más reciente por orden de creación de `readJourneys` con al menos un ticket que exista en el registro y no esté `closed` (leído con `findTicket` + `parseTicket`); si no hay ninguna, `null`. `avanzarJornada` la usa cuando no llega `journeyId`; con `null` devuelve `sin-jornada` y el detalle nombra la jornada más reciente como terminada cuando la hay. (C1, C2, C3)
  2. `packages/cli/src/commands.ts:2788`: la pasada de error usa `jornadaVigente` en vez de `jornadaDelDia` para que la pasada registre la misma jornada que el avance. (C1)
  3. `packages/engine/src/journey-plan.ts`: al **crear** la jornada de un día nuevo (no al revisarla), `armarJornada` antepone los tickets pendientes de `jornadaVigente` anterior (otro id), en su orden y con sus dependencias, sin duplicar los pedidos; el tope `maximo` se aplica a la lista combinada. `JornadaArmada` gana `heredados: { desde: string; tickets: string[] } | null` y `renderPlanDelDia` añade la línea «Heredados de JOR-…: …». `journeyPlanCommand` y `armar_jornada` (MCP) muestran esa línea y el MCP la devuelve en sus datos. (C4, C5, C6)
  4. `packages/engine/src/approval.ts`: tipo `JourneyFinishedNotice` (`kind: "journey-finished-notice"`, `journeyId`, `notifiedAt`), añadido al lector, a la exclusión de `:614` y una función `jornadasTerminadasAvisadas(paths)`. `packages/engine/src/notify.ts`: `renderJourneyFinishedNotification({ journeyId, tickets })`. (C7, C8)
  5. `packages/cli/src/hermes.ts`: `pendientesDeAvisar` agrega `kind: "jornada-terminada"` solo para la jornada más reciente del historial cuando todos sus tickets están `closed` y no tiene marca; `hermesNotifyPendientes` la envía y anota la marca solo si la entrega salió (mismo patrón que `arbol-sucio`). (C7, C8, C9)
  6. Pruebas en `tests/avance-jornada.test.ts`, `tests/jornada-diaria.test.ts` y `tests/vigilante-jornada.test.ts` para cada criterio; correr la suite completa y `npx tsc --build tsconfig.build.json`. (C1–C10)
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Rollback (obligatorio): revertir el commit del ticket. El historial de jornadas no cambia de formato y las marcas `journey-finished-notice` ya escritas las ignora la versión anterior, así que no hay datos que deshacer.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Sin jornada del día, el avance despacha el ticket aprobado de la jornada más reciente que tiene tickets sin cerrar
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C2. Si existe la jornada del día, el avance la usa aunque otra jornada anterior tenga pendientes
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C3. Sin ninguna jornada con tickets pendientes, el avance devuelve sin-jornada sin invocar al ejecutor
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C4. Un ticket ya en in_progress heredado de la jornada anterior no se despacha otra vez
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C5. Crear la jornada de un día nuevo incluye primero los tickets pendientes de la jornada anterior sin duplicarlos
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] C6. El plan del día nombra los tickets heredados y la jornada de la que vienen
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] C7. El vigilante avisa una vez que la jornada más reciente terminó cuando todos sus tickets están cerrados
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] C8. Una segunda pasada del vigilante no repite el aviso de jornada terminada
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] C9. Un aviso de jornada terminada que no se entregó vuelve a salir en la pasada siguiente del vigilante
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] C10. El proyecto compila sin errores de tipos
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/journey-advance.ts`: `ticketsPendientesDeJornada` y `jornadaVigente(project, ahora)` (la del día si existe; si no, la más reciente con tickets existentes sin cerrar; si no, `null`). `avanzarJornada` la usa sin `journeyId` (un `journeyId` explícito se respeta); con `null` devuelve `sin-jornada` y nombra la jornada más reciente como terminada.
- `packages/cli/src/commands.ts`: la pasada de error de `journeyAdvanceCommand` usa `jornadaVigente`.
- `packages/engine/src/journey-plan.ts`: al crear la jornada de un día nuevo se anteponen los pendientes de la vigente anterior (orden y dependencias propios, sin duplicar pedidos, `maximo` sobre la lista combinada); `JornadaArmada.heredados` y la línea «Heredados de JOR-…» en `renderPlanDelDia`. `packages/mcp/src/tools.ts`: `armar_jornada` devuelve `heredados`.
- `packages/engine/src/approval.ts`: `JourneyFinishedNotice` (`journey-finished-notice`), lector, exclusión del conteo de intentos y `jornadasTerminadasAvisadas`. `packages/engine/src/notify.ts`: `renderJourneyFinishedNotification`.
- `packages/engine/src/journeys.ts`: `ultimaJornadaDelRegistro(root)`, lectura tolerante solo por raíz, porque `pendientesDeAvisar` recibe rutas y no un proyecto autorizado (desviación menor del plan, que no la nombraba).
- `packages/cli/src/hermes.ts`: `pendientesDeAvisar` agrega `jornada-terminada` solo para la jornada más reciente con todos sus tickets existentes cerrados y sin marca; `hermesNotifyPendientes` anota la marca solo si la entrega salió.

## Pruebas

Contrato de entrega (desde la raíz del repositorio, Node 24):

- `npx vitest run tests/avance-jornada.test.ts tests/jornada-diaria.test.ts tests/vigilante-jornada.test.ts` — esperado: todo pasa (53 pruebas; C1–C9).
- `npx tsc --build tsconfig.build.json` — esperado: sin salida (C10).
- `npx vitest run` — esperado: sin fallos nuevos. Hay 53 fallos previos («Una sesión desatendida no puede decidir una compuerta») en hermes-notify, delegation, gate-*, firma-de-compuerta y autorizacion-*; son de ambiente, no de este ticket.
- Validación manual: ninguna. Requisitos de ambiente: ninguno.

Resultado: las tres suites del ticket pasan (53/53); `npx tsc --build tsconfig.build.json` sale sin errores; la suite completa tiene 53 fallos, los mismos 53 (mismos archivos y conteos) con y sin este cambio (comprobado con `git stash -u`), todos de la sesión desatendida.

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
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-07",
    "at": "2026-10-08T01:00:49.304Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-08T01:21:02.590Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-08T01:21:27.700Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:47.459Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A (aprueba los tres planes: caducidad a medianoche, elegibilidad de aprobación y agente revisor)\",\"planHash\":\"sha256:40f2a204c2bf5aef5c5d80d5a22042b5a27c2af25ea4e574ec31892383dd1e9c\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:48.107Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:40f2a204c2bf5aef5c5d80d5a22042b5a27c2af25ea4e574ec31892383dd1e9c."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:48.107Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:58.080Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-08T02:37:15.267Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
