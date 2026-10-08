---
schema_version: 2
id: FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007
title: Listar las aprobaciones automáticas, contarlas aparte en el parte diario y mostrar la reversión
type: FEATURE
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007

## Solicitud original

Parte del sprint: Un ticket elegible con la compuerta en approve se aprueba solo, atribuido a la autorización, con elegibilidad decidida en código y visible.
- R-APRO-007: Toda aprobación automática DEBE ser visible y reversible
Depende de: SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Toda aprobación automática DEBE ser visible y reversible
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: R-APRO-007 sobre lo que ya registra `aprobarPorAutorizacion`. Tres piezas de solo lectura: (1) listar cada aprobación automática de análisis o plan con su autorización (id y hash), su recibo, el modo de la autorización, la fecha y el estado actual de la autorización; (2) contar en el parte diario (`valmen hermes brief`) las aprobaciones automáticas del día aparte de las humanas; (3) mostrar en la lista de autorizaciones el comando de reversión de cada vigente. Excluido: crear, ampliar o revocar autorizaciones (ya existe y es de una persona), el agente revisor (R-APRO-003, otro ticket), la jornada que aprueba al armarse (R-APRO-006, FEATURE-ENGINE-JORNADA-APROBACION-20261007) y una clave nueva de configuración para apagar la aprobación automática.
- Usuario o rol afectado: el PO que delega la aprobación y revisa el parte del día; el orquestador que lee el registro.
- Comportamiento actual: la aprobación automática se registra como un evento `plan-approved` o `analysis-approved` con `source: autorizacion` dentro de `## Eventos` de cada ticket, y un uso de cupo en `.valmen/approval/uses.jsonl`; no hay ningún comando, herramienta ni parte que las reúna. El parte diario no distingue aprobaciones automáticas de humanas, y `approval-authorize list` no dice cómo revertir.
- Comportamiento esperado: `valmen approval-authorize approvals` lista las aprobaciones automáticas con autorización, recibo y modo; el parte diario las cuenta aparte de las humanas; la lista de autorizaciones muestra, para cada vigente, el comando de revocación; tras revocar, ninguna aprobación posterior se hace con ella y las ya registradas siguen listadas con su atribución.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la aprobación automática ya queda registrada, pero solo dentro de cada ticket. `packages/engine/src/approval-eligibility.ts:395` arma el detalle del evento (`source`, `authorizationId`, `authorizationHash`, `stage`, `receiptId`, `planHash`) y `packages/engine/src/approval-eligibility.ts:406` lo anexa con la acción de `packages/engine/src/approval-eligibility.ts:286` (`plan-approved` o `analysis-approved`). Ningún lector recorre esos eventos entre tickets: los únicos lectores son `aprobacionDePlanVigente` en `packages/engine/src/plan-approval.ts` (un solo ticket, la última aprobación) y `motivoDeAprobacionPorAutorizacionInvalida` en `packages/engine/src/approval-eligibility.ts:417` (re-verificación al entrar a `approved`). El evento no guarda el modo: el modo vive en la autorización (`packages/engine/src/approval-authorization.ts:49`) y se obtiene uniendo por `authorizationId` con `leerAutorizacionesDeAprobacion` (`packages/engine/src/approval-authorization.ts:251`). El parte diario lo arma `armarParte` en `packages/cli/src/hermes.ts:1302` y lo imprime `renderBrief` en `packages/engine/src/notify.ts:632` sobre `BriefInput` (`packages/engine/src/notify.ts:326`), sin campo de aprobaciones. La lista de autorizaciones (`packages/cli/src/commands.ts:3367` y la herramienta `ver_autorizaciones_aprobacion` en `packages/mcp/src/tools.ts:2531`) imprime id, estado, tipos, módulos, modo y frase, pero no la reversión. La reversión ya existe: `revocarAutorizacionDeAprobacion` (`packages/engine/src/approval-authorization.ts:231`, CLI en `packages/cli/src/commands.ts:3355`) vale desde ese instante, y la prueba C15 de `tests/elegibilidad-aprobacion.test.ts:896` comprueba que una revocación anula una aprobación pendiente.
- Hipótesis pendientes: ninguna que bloquee. La spec admite volver al modo manual por «un cambio de configuración o la revocación»; la revocación ya existe y basta para cumplir R-APRO-007, así que no se agrega una clave de configuración nueva (si el PO la quiere, es otro ticket). La fuente `delegacion` (`packages/engine/src/plan-approval.ts:154`) proviene de una delegación del PO y se cuenta como humana; solo `source: autorizacion` (`packages/engine/src/plan-approval.ts:52`) se cuenta como automática.
- Consumidores afectados: `armarParte` y `hermesBrief` (`packages/cli/src/hermes.ts`), `renderBrief` y `BriefInput` (`packages/engine/src/notify.ts`), `approvalAuthorizeCommand` (`packages/cli/src/commands.ts:3270`) y su ruta en `packages/cli/src/main.ts:2077`, la herramienta MCP `ver_autorizaciones_aprobacion` (`packages/mcp/src/tools.ts:2531`), y las pruebas `tests/hermes-notify.test.ts`, `tests/notify.test.ts`, `tests/elegibilidad-aprobacion.test.ts` y `tests/autorizacion-aprobacion.test.ts`. El campo nuevo de `BriefInput` es opcional, así que `renderBrief` sigue igual para quien no lo pase.
- Archivos y flujo investigados: `packages/engine/src/approval-authorization.ts` (registro, estado, cupo), `packages/engine/src/approval-eligibility.ts` (elegibilidad, registro del evento, re-verificación), `packages/engine/src/plan-approval.ts` (fuentes y lectura de `plan-approved`), `packages/engine/src/tickets.ts:174` (`listTickets`), `packages/engine/src/journey-handoff.ts` (parte de la jornada, que ya separa los cierres por política de QA y no cubre aprobaciones de plan), `packages/cli/src/hermes.ts` y `packages/engine/src/notify.ts` (parte diario), `packages/cli/src/commands.ts` y `packages/mcp/src/tools.ts` (listas). Memoria consultada (`buscar_memoria`): AP-007 recuerda que la aprobación debe quedar atada al recibo; la lista la cita con `receiptId`.
- Riesgos y compatibilidad: todo es lectura; no cambia el formato de eventos, del registro de autorizaciones ni de usos de cupo, ni ninguna transición. Un ticket malformado no debe tumbar la lista ni el parte: se reutiliza el mismo patrón de tolerancia de `armarParte` (se omite y se dice). Recorrer todos los tickets en el parte cuesta una lectura por ticket, la misma que ya hace `listTickets` ahí. Una autorización revocada o con hash roto sigue apareciendo en la lista con su estado, para no borrar la atribución.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: solo lectura sobre lo que ya registra `aprobarPorAutorizacion`; no cambia eventos, registros `.jsonl`, transiciones ni la elegibilidad. Excluido: clave de configuración nueva, agente revisor, jornada que aprueba al armarse.
- Pasos ordenados:
  1. En `packages/engine/src/approval-eligibility.ts`, agregar la función exportada `listarAprobacionesAutomaticas(paths, { desde?, ahora? })`: recorre `findAllTickets` de `packages/engine/src/discovery.ts`, lee de `## Eventos` las acciones de `ACCION_DE_ETAPA` (`plan-approved`, `analysis-approved`) con `source: autorizacion` y devuelve por cada una ticket, etapa, `authorizationId`, `authorizationHash`, `receiptId`, fecha (`at` del evento), modo y estado actual de la autorización (unidos con `leerAutorizacionesDeAprobacion` de `packages/engine/src/approval-authorization.ts`). Un ticket ilegible se omite y se cuenta en `omitidos`, sin lanzar. Agregar `contarAprobacionesDelDia(paths, dia)` que devuelve `{ automaticas, humanas }`, donde humana es todo `plan-approved` cuya fuente no es `autorizacion`. Se exporta por el `export *` ya presente en `packages/engine/src/index.ts`. (C1, C2, C3, C10)
  2. En `packages/cli/src/commands.ts`, agregar `approvalAuthorizationApprovalsCommand(paths, flags)` que imprime una línea por aprobación automática: ticket, etapa, autorización, recibo, modo, fecha y estado de la autorización, con una línea final de cuántos tickets se omitieron si hubo alguno. En `packages/cli/src/main.ts`, enrutar `approval-authorize approvals` a esa función con `resolvePaths(options)` y sumar la línea a `USAGE`. (C5)
  3. En `approvalAuthorizeCommand` de `packages/cli/src/commands.ts` (acción `list`) y en el caso `ver_autorizaciones_aprobacion` de `packages/mcp/src/tools.ts`, agregar a cada autorización vigente la reversión: `valmen approval-authorize revoke --id <APA-…> --actor <tú> --reason "<motivo>"`. Las revocadas y vencidas no la llevan. (C6, C7)
  4. En `packages/engine/src/notify.ts`, sumar a `BriefInput` el campo opcional `aprobaciones?: { automaticas: readonly { ticket, etapa, autorizacion }[]; humanas: number }` y en `renderBrief` imprimir, solo si hay alguna, dos líneas separadas: «🤖 N aprobación(es) automática(s) hoy:» con una viñeta por automática (ticket · etapa · autorización) y, en su propia línea, «✍ M aprobación(es) humana(s) hoy». En `armarParte` de `packages/cli/src/hermes.ts`, llenarlo con `contarAprobacionesDelDia` y `listarAprobacionesAutomaticas` del día, tolerando el fallo como ya hace con el consumo. (C8, C9, C11)
  5. Pruebas en archivos que ya existen: `tests/elegibilidad-aprobacion.test.ts` (lista, humana excluida, revocación, rechazo posterior, ticket ilegible, comando `approvals`), `tests/autorizacion-aprobacion.test.ts` (reversión en `list` y en la herramienta MCP), `tests/notify.test.ts` (`renderBrief` con y sin aprobaciones) y `tests/hermes-notify.test.ts` (`armarParte` cuenta aparte). Correr `npx vitest run tests/elegibilidad-aprobacion.test.ts tests/autorizacion-aprobacion.test.ts tests/notify.test.ts tests/hermes-notify.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C12)
  6. Entrega: escribir en `## Pruebas` el contrato (comandos del paso 5, directorio el worktree del ticket, resultado esperado, validación manual de `valmen approval-authorize approvals` y `valmen hermes brief` sobre el registro real), correr la compuerta `qa-mechanical`, registrar el consumo de IA, correr `valmen secrets`, commitear con `git add` explícito en la rama del worktree y mover a `awaiting_user_tests`. (C12, C13)
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores, y el cambio no escribe en ningún registro.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <hash>`. No hay datos ni formatos que deshacer: las funciones nuevas solo leen, el campo de `BriefInput` es opcional y los registros `.valmen/approval/*.jsonl` y los eventos quedan como estaban.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `listarAprobacionesAutomaticas` devuelve cada aprobación de fuente `autorizacion` con su ticket, etapa, autorización, recibo y modo.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C2. Una aprobación de plan registrada por una persona no aparece en la lista de aprobaciones automáticas.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C3. Tras revocar la autorización, la aprobación ya registrada sigue listada con su atribución y el estado `revocada`.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C4. Tras revocar la autorización, `aprobarPorAutorizacion` rechaza una aprobación posterior con ella.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C5. `valmen approval-authorize approvals` imprime una línea por aprobación automática con autorización, recibo y modo.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C6. `valmen approval-authorize list` muestra el comando de revocación junto a cada autorización vigente.
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] C7. La herramienta `ver_autorizaciones_aprobacion` muestra el comando de revocación junto a cada autorización vigente.
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] C8. `renderBrief` imprime las aprobaciones automáticas del día en una línea aparte de las humanas.
      <!-- test: npx vitest run tests/notify.test.ts -->
- [x] C9. `renderBrief` no imprime la línea de aprobaciones cuando no hubo ninguna.
      <!-- test: npx vitest run tests/notify.test.ts -->
- [x] C10. Un ticket ilegible no impide listar las aprobaciones automáticas de los demás.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C11. `armarParte` cuenta las aprobaciones automáticas del día separadas de las humanas.
      <!-- test: npx vitest run tests/hermes-notify.test.ts -->
- [x] C12. El proyecto compila sin errores de tipos.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C13. El parte real del proyecto (`valmen hermes brief`) muestra las aprobaciones automáticas del día cuando las hay.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Solo lectura; no cambia eventos, registros ni transiciones.

- `packages/engine/src/approval-eligibility.ts`: `listarAprobacionesAutomaticas` (une cada evento `plan-approved`/`analysis-approved` de fuente `autorizacion` con su autorización: modo y estado; omite y cuenta los tickets ilegibles) y `contarAprobacionesDelDia` (`{ automaticas, humanas }`; humana = todo `plan-approved` cuya fuente no es `autorizacion`, la delegación incluida).
- `packages/engine/src/approval-authorization.ts`: `comandoDeRevocacionDeAprobacion`.
- `packages/cli/src/commands.ts` y `packages/cli/src/main.ts`: `valmen approval-authorize approvals` (ruta mínima en main + línea de USAGE) y `revertir: …` junto a cada autorización vigente en `approval-authorize list`.
- `packages/mcp/src/tools.ts`: `ver_autorizaciones_aprobacion` muestra la reversión de cada vigente (sin herramientas nuevas: los conteos de MCP no cambian).
- `packages/engine/src/notify.ts` y `packages/cli/src/hermes.ts`: `BriefInput.aprobaciones` opcional; `renderBrief` imprime las automáticas y las humanas en líneas separadas solo si hubo alguna; `armarParte` lo llena tolerando el fallo.
- Sin clave de configuración nueva (supuesto aprobado por el PO).
- Limitación: el registro real no tiene aprobaciones automáticas todavía, así que C13 solo se pudo comprobar para la línea de humanas.

## Pruebas

Directorio: la raíz del worktree del ticket (o del repositorio tras integrar).

1. `npx vitest run tests/elegibilidad-aprobacion.test.ts tests/autorizacion-aprobacion.test.ts tests/notify.test.ts tests/hermes-notify.test.ts` — esperado: todo en verde (C1–C11).
2. `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores (C12).
3. Validación manual (C13, sin marcar): con una aprobación automática del día en el registro real, `valmen hermes brief` muestra «🤖 N aprobación(es) automática(s) hoy» y, aparte, «✍ M aprobación(es) humana(s) hoy». Además `valmen approval-authorize approvals` lista cada una con autorización, recibo y modo, y `valmen approval-authorize list` muestra `revertir:` bajo cada vigente.
Ambiente: Node 24, `npm ci`, dist compilado (`npx tsc --build tsconfig.build.json`).
Corrido por el agente: los cuatro archivos (153 pruebas) y tsc en verde; también tests/mcp-server y mcp-anotaciones y los 20 archivos que citan el parte o USAGE (408 pruebas).

- Confirmación del PO 2026-10-08: el comando muestra las aprobaciones. El orquestador comprobó que `valmen hermes brief` imprime la línea de humanas («23 aprobación(es) humana(s) hoy»); la de automáticas aparece cuando las hay y la cubren las pruebas de `tests/notify.test.ts`.

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
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: sesión de implementación Sonnet 5.5, sin números expuestos",
    "confidence": "low",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:56.362Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:41:12.996Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:42:36.231Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:45:37.012Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de VISIBILIDAD-APROBACIONES: sin clave de configuración, la revocación cubre el modo manual; las aprobaciones por delegación cuentan como humanas)\",\"planHash\":\"sha256:98b06c35fa0cd1ce2c7e4b3193735b5d1c4371f88ac759afa9c804cfca972bef\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:45:37.315Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:98b06c35fa0cd1ce2c7e4b3193735b5d1c4371f88ac759afa9c804cfca972bef."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:45:37.315Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:45:56.142Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:49:15.861Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:49:18.770Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
