---
schema_version: 2
id: FEATURE-CLI-AVISO-DECISION-20261010
title: Aviso de Telegram al pasar a Necesita tu decisión
type: FEATURE
module: CLI
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CLI-AVISO-DECISION-20261010

## Solicitud original

Parte del sprint: El PO lee cuatro estados públicos con una sola función y recibe aviso cuando algo espera su decisión.
- R-EPU-003: El vigilante DEBE avisar por Telegram cuando un ticket pasa a «Necesita tu decisión»
Depende de: FEATURE-CORE-ESTADO-PUBLICO-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El vigilante DEBE avisar por Telegram cuando un ticket pasa a «Necesita tu decisión»
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- **Enlace a la pantalla del ticket (S-1).** La spec pide «el enlace a su pantalla», pero el vigilante en TypeScript no conoce la dirección de Mission Control: `HermesConfig` (`packages/adapter/src/config.ts:481-499`) no tiene ninguna base de URL, y el único sitio que arma el enlace es el script `templates/programar/aviso-eslabon.sh:136-138` (`http://<IP LAN>:<puerto>/#/ticket/<ID>`), que levanta o releva el servidor. La ruta de la pantalla sí existe: `#/ticket/<ID>` (`packages/server/web/index.html:3314`). Pregunta al PO: ¿de dónde sale la base del enlace? A) una clave nueva `hermes.notify.screen-url` en `.valmen/config.yaml`; sin ella el aviso dice «sin enlace» y da la ruta del ticket, como hoy `pruebas-listas` → no inventa una URL (Recomendado). B) calcular IP de la red local y un puerto fijo como el script → enlace que puede no abrir si el servidor no escucha ahí. El plan se escribe con A y queda sujeto a esta respuesta en la aprobación del plan.
- **Compuerta escalada no avisable a distancia (S-2).** Un ticket de riesgo `critical` o con impacto crítico no recibe el aviso `gate` (el techo de riesgo lo niega, `packages/cli/src/hermes.ts:1166-1190`). Pregunta al PO: ¿el aviso nuevo debe cubrir ese caso con un aviso informativo, sin código? A) no: el motivo «compuerta escalada» queda siempre a cargo del aviso `gate`, que ya lo lista como «no avisable» → cero duplicados (Recomendado). B) sí: aviso informativo solo cuando `gate` se negó → un camino más que probar.

- Decisión del PO (2026-10-11): S-1 «Clave nueva en la configuración (Recomendado)»: la dirección del enlace sale de `hermes.notify.screen-url`; si falta, el aviso dice «sin enlace» y da la ruta del ticket. S-2 «Sigue a cargo del aviso de compuertas (Recomendado)»: una compuerta escalada que no se puede avisar por Telegram queda en el aviso de compuertas, sin aviso extra.

## Descripción funcional

- Alcance: el vigilante de avisos (`valmen hermes notify` sin `--id`, `packages/cli/src/main.ts:1783-1795` → `hermesNotifyPendientes`, `packages/cli/src/hermes.ts:969`) suma un tipo de aviso nuevo, «necesita tu decisión», que sale una vez por cada entrada de un ticket a ese estado público, con el ticket, el motivo y el enlace a su pantalla. No cambia la función `estadoPublico` ni los seis avisos existentes.
- Usuario o rol afectado: el PO, que recibe los avisos por el bot de Telegram del perfil del proyecto (estándar «Gateway y avisos por Telegram», `.valmen/rules/estandares-proceso.md:15`).
- Comportamiento actual: el vigilante avisa seis tipos (`gate`, `autonomous-stop`, `jornada-terminada`, `proceso`, `cierre-por-politica`, `pruebas-listas`; `packages/cli/src/hermes.ts:723-762`). Un ticket que pasa a `blocked`, a `changes_requested` o a `planned` con el plan esperando a una persona no genera ningún aviso: el PO se entera solo si abre la pantalla.
- Comportamiento esperado (R-EPU-003): cuando un ticket entra a «Necesita tu decisión» llega un aviso con el ticket, el motivo (bloqueado, plan por aprobar, cambios pedidos) y el enlace a su pantalla, una sola vez por entrada. Los motivos «pruebas listas» y «compuerta escalada» ya los avisan `pruebas-listas` y `gate`; esa misma entrada no recibe un segundo aviso.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es un requisito nuevo, no un defecto con síntoma previo (como AP-005, `.valmen/memory/aprendizajes.md:41`). Lo que falta está comprobado en el código: `pendientesDeAvisar` (`packages/cli/src/hermes.ts:764-904`) recorre recibos escalados, corridas detenidas, paradas autónomas, jornadas, `awaiting_user_tests` (`hermes.ts:847-862`) y cierres por política, y en ningún punto consulta `estadoPublicoDelTicket` (`packages/engine/src/public-state.ts:24-45`) ni mira los estados `blocked`, `changes_requested` o `planned`. El registro de avisos (`readApprovalLog`, `packages/engine/src/approval.ts:477-505`) no tiene una marca para «necesita tu decisión», así que hoy no hay forma de saber si una entrada ya se avisó.
- Cómo se identifica «una entrada al estado»: cada transición deja en `## Eventos` un evento `ticket-transition` con `details` «Workflow: a -> b.», que ya leen `packages/engine/src/etapas.ts:37-40` (`TRANSICION_RE`) y `packages/engine/src/fases.ts:65`. El id del último evento cuya transición llega al estado actual (`EVENT-NNN`) es la clave de la entrada: una salida y un regreso a `blocked` producen otro evento y, por tanto, otro aviso; la misma entrada no se repite. Los tickets de prueba de `tests/helpers/fixtures.ts:212-223` solo traen el evento `created`, sin transición.
- Motivo y no duplicación: el motivo sale de `estadoPublico` (`packages/core/src/public-state.ts:41-66`): `blocked` → «bloqueado», `changes_requested` → «cambios pedidos», `planned` con `planWaitsForPerson` → «plan por aprobar». `user-tests` lo cubre `pruebas-listas` por ciclo de QA (`hermes.ts:847-862`, marca `tests-ready-notice`, `approval.ts:553-559`) y `escalated-gate` lo cubre `gate` por recibo (`hermes.ts:771-791`); el aviso nuevo no se emite con esos dos motivos (ver S-2).
- Enlace: la pantalla del ticket es `#/ticket/<ID>` (`packages/server/web/index.html:3314`); la base de la URL no existe en el código TypeScript (ver S-1).
- Patrón a seguir: el de `pruebas-listas`: se calcula en `pendientesDeAvisar`, se envía con `hermesSendChannel(...).notify(render...)` y se anota en el diario de aprobaciones (`approvalLogPath`, `packages/engine/src/approval.ts:473-475`) con `appendApproval` **solo** si la entrega salió (`hermes.ts:1096-1124`); un envío fallido no se anota y se reintenta en la corrida siguiente.
- Hipótesis pendientes: ninguna sobre la causa. Quedan las dos decisiones S-1 y S-2 del PO.
- Consumidores afectados: `valmen hermes notify` (CLI, `main.ts:1788`), el cron o gancho que lo corre, `readApprovalLog` y quienes lo leen (`pendingApprovals`, `avisosEntregados`, `avisosSinEntregar`), y las pruebas que llaman a `pendientesDeAvisar`: `tests/hermes-notify.test.ts`, `tests/vigilante-jornada.test.ts`, `tests/qa-por-politica.test.ts`, `tests/retiro-disparador.test.ts`. Sus tickets de prueba no tienen eventos de transición, así que no producen el aviso nuevo.
- Archivos y flujo investigados: `packages/cli/src/hermes.ts` (tipo `PendienteDeAvisar`, `pendientesDeAvisar`, `hermesNotifyPendientes`), `packages/engine/src/approval.ts` (`ApprovalLogEntry`, `readApprovalLog`, `pruebasListasAvisadas`), `packages/engine/src/notify.ts:550-584` (`renderTestsReadyNotification`), `packages/engine/src/public-state.ts`, `packages/core/src/public-state.ts`, `packages/engine/src/etapas.ts`, `packages/adapter/src/config.ts:481-524` (`readHermesConfig`), `packages/server/web/index.html:3314`, `templates/programar/aviso-eslabon.sh:136-138`. Archivos nuevos o tocados por el cambio: esos cuatro primeros más `packages/adapter/src/config.ts` y un archivo de prueba nuevo, aviso-decision.test.ts, en tests/ (todavía no existe).
- Riesgos y compatibilidad: (1) la primera corrida avisaría todas las entradas vigentes del registro; hoy el checkout principal no tiene tickets en `blocked`, `changes_requested` ni `planned` (225 cerrados, 2 en intake, 1 en `awaiting_user_tests`), así que no hay inundación. (2) Un tipo nuevo en el diario de aprobaciones lo ignora una versión vieja del CLI (`readApprovalLog` filtra por tipo conocido), así que convivir es seguro. (3) Las pruebas jamás envían un mensaje real: usan un `CommandRunner` falso, como `runnerOk` de `tests/hermes-notify.test.ts:127-135`. (4) Un plan aprobado por autorización vigente no es «Necesita tu decisión» y no debe avisarse; lo decide `elegibilidadDeAprobacion` dentro de `estadoPublicoDelTicket`.
- Impactos de sync, migración, Docker o despliegue: ninguno: cambio del CLI y del motor local, sin sincronización, sin migración de datos, sin contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar tal cual (Recomendado)».
- Alcance: un tipo de aviso nuevo en el vigilante (`necesita-decision`) para los motivos «bloqueado», «cambios pedidos» y «plan por aprobar», con su marca en el diario de aprobaciones, su texto y la clave opcional `hermes.notify.screen-url`. Exclusiones: no cambia `estadoPublico`, ni los seis avisos existentes, ni la web, ni el bot o la gateway de Telegram; los motivos «pruebas listas» y «compuerta escalada» siguen a cargo de `pruebas-listas` y `gate`.
- Tamaño previsto: unas 390 líneas (unas 140 de producción, unas 250 de pruebas), 19 criterios.
- Si excede el tope: si al implementar pasa de 400 líneas (`delivery-budget`), se parte en dos tickets dependientes: (a) motor —entrada al estado, marca y texto del aviso: pasos 3, 4 y 5, criterios C2, C3, C9, C10, C11, C12, C13, C17— y (b) vigilante —clave de configuración y tipo nuevo en `pendientesDeAvisar` y `hermesNotifyPendientes`: pasos 2 y 6, criterios C1, C4, C5, C6, C7, C8, C14, C15, C16, C18—, con (b) dependiendo de (a).
- Pruebas existentes que el plan cambia a propósito: ninguna. Los tickets de prueba de `tests/helpers/fixtures.ts:212-223` no traen eventos de transición, así que las pruebas que llaman a `pendientesDeAvisar` no ven el aviso nuevo; se corren como regresión (C19).
- Pasos ordenados:
  1. Prueba primero: crear el archivo de prueba aviso-decision.test.ts en tests/ con un caso por criterio C1–C18. Los tickets salen de `writeFixtureTicket` con un evento `ticket-transition` («Workflow: in_progress -> blocked.») en `## Eventos`; la autorización vigente se crea como en `tests/estado-publico.test.ts:79`; el envío usa un `CommandRunner` falso como `runnerOk` (`tests/hermes-notify.test.ts:127-135`) y uno caído para C16, sin enviar nunca un mensaje real a Telegram. Correr `npx vitest run tests/aviso-decision.test.ts` y verlas en rojo (C1–C18).
  2. En `packages/adapter/src/config.ts`: añadir a `HermesConfig` el campo opcional `screenUrl?: string` y leerlo en `readHermesConfig` de `hermes.notify.screen-url`, vacío por defecto; opcional para no tocar los objetos de configuración que arman las pruebas existentes (C14, C15).
  3. En `packages/engine/src/approval.ts`: tipo `DecisionNeededNotice` (`kind: "decision-needed-notice"`, `ticketId`, `entryEvent`, `reason`, `notifiedAt`), sumarlo a `ApprovalLogEntry` y al filtro de `readApprovalLog`, y exportar `decisionesAvisadas(paths)`, que devuelve el conjunto `ticket:evento` como `pruebasListasAvisadas` (C2, C3, C17).
  4. En `packages/engine/src/public-state.ts`: exportar `entradaAlEstado(eventos, estado)`, que devuelve el id del último evento `ticket-transition` cuyo destino es `estado` (misma expresión que `TRANSICION_RE`, `packages/engine/src/etapas.ts:40`) o `null` si no hay ninguno (C3, C9).
  5. En `packages/engine/src/notify.ts`: `renderDecisionNeededNotification({ ticketId, title, reason, entryEvent, screenUrl, ticketPath })` con clave `decision-needed:<ticket>:<evento>`, el id del ticket, el motivo en palabras del PO («bloqueado», «cambios pedidos», «plan por aprobar») y el enlace `<screenUrl sin barra final>/#/ticket/<ID>`; sin `screenUrl`, la línea dice «sin enlace» con la ruta del ticket y la clave que falta (C10, C11, C12, C13).
  6. En `packages/cli/src/hermes.ts`: sumar `necesita-decision` a `PendienteDeAvisar`; en `pendientesDeAvisar`, para cada ticket en `blocked`, `changes_requested` o `planned`, derivar `estadoPublicoDelTicket(paths, id, now)`, quedarse con los motivos `blocked`, `changes-requested` y `plan-approval`, calcular `entradaAlEstado` sobre sus eventos, descartar la entrada sin evento o ya presente en `decisionesAvisadas` (C1, C4, C5, C6, C7, C8, C9). En `hermesNotifyPendientes`, una rama como la de `pruebas-listas` (`hermes.ts:1096-1124`): enviar con `hermesSendChannel(...).notify(renderDecisionNeededNotification(...))` usando `request.config.screenUrl`; si no salió, sumarlo a `fallidos` sin anotar; si salió, `appendApproval` con `decision-needed-notice` y sumar `<ticket> · necesita tu decisión (<motivo>)` a `notificados` (C16, C17, C18).
  7. Correr `npx vitest run tests/aviso-decision.test.ts` en verde, la regresión de C19, `npm run typecheck` y `npm run lint` (C1–C19).
- Impactos declarados: ninguno de sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket. Las líneas `decision-needed-notice` que ya estén en el diario de aprobaciones no estorban: `readApprovalLog` de la versión anterior filtra por tipo conocido y las ignora; la clave `hermes.notify.screen-url` también se ignora. No hay datos que limpiar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-EPU-003): un ticket que pasó de `in_progress` a `blocked` produce un pendiente `necesita-decision` con motivo «bloqueado»
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C2 (R-EPU-003): una entrada ya avisada no vuelve a salir en la corrida siguiente
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C3 (R-EPU-003): una nueva entrada a `blocked`, con otro evento de transición, produce un aviso nuevo
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C4 (R-EPU-003): un ticket que pasó a `changes_requested` produce el aviso con motivo «cambios pedidos»
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C5 (R-EPU-003): un ticket que pasó a `planned` sin autorización vigente produce el aviso con motivo «plan por aprobar»
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C6 (R-EPU-003): un ticket en `planned` cubierto por una autorización de aprobación vigente no produce el aviso
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C7 (R-EPU-003): un ticket en `awaiting_user_tests` no produce el aviso `necesita-decision`
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C8 (R-EPU-003): un ticket en `in_progress` con una compuerta escalada sin decisión no produce el aviso `necesita-decision`
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C9 (R-EPU-003): un ticket en `blocked` sin evento de transición hacia `blocked` no produce el aviso
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C10 (R-EPU-003): el cuerpo del aviso nombra el id del ticket
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C11 (R-EPU-003): el cuerpo del aviso nombra el motivo en palabras del PO
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C12 (R-EPU-003): con `screenUrl` declarado, el cuerpo lleva el enlace `<screenUrl>/#/ticket/<ID>`
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C13 (R-EPU-003): sin `screenUrl`, el cuerpo dice «sin enlace» con la ruta del ticket
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C14 (R-EPU-003): `readHermesConfig` devuelve en `screenUrl` el valor de `hermes.notify.screen-url`
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C15 (R-EPU-003): `readHermesConfig` sin la clave `hermes.notify.screen-url` devuelve `screenUrl` vacío
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C16 (R-EPU-003): un envío que el transporte falso no entrega deja el aviso pendiente para la corrida siguiente
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C17 (R-EPU-003): una entrega anota en el diario de aprobaciones una línea `decision-needed-notice` con la entrada `ticket:evento`
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C18 (R-EPU-003): `hermesNotifyPendientes` con `json` cuenta el aviso entregado en `notificados`
      <!-- test: npx vitest run tests/aviso-decision.test.ts -->
- [x] C19 (regresión de `valmen hermes notify`): las pruebas existentes del vigilante pasan sin cambios
      <!-- test: npx vitest run tests/hermes-notify.test.ts tests/vigilante-jornada.test.ts tests/qa-por-politica.test.ts tests/retiro-disparador.test.ts -->

## Puntos

```json
[]
```

## Implementación

Hecho tal como el plan, en la rama valmen/ticket-aviso-decision:

- packages/adapter/src/config.ts: `HermesConfig.screenUrl?` y su lectura de `hermes.notify.screen-url` (vacía por defecto).
- packages/engine/src/approval.ts: aviso `decision-needed-notice` en el diario (tipo, lectura y exclusión del conteo de intentos) y `decisionesAvisadas`.
- packages/engine/src/public-state.ts: `entradaAlEstado(eventos, estado)`.
- packages/engine/src/notify.ts: `renderDecisionNeededNotification` (clave `decision-needed:<ticket>:<evento>`, enlace o «sin enlace»).
- packages/cli/src/hermes.ts: pendiente `necesita-decision` en `pendientesDeAvisar` y su rama de entrega en `hermesNotifyPendientes`.
- tests/aviso-decision.test.ts: 18 pruebas (C1–C18), vistas en rojo antes de implementar (12 en rojo, las 6 negativas pasaban por vacío); todas con transporte falso, ningún mensaje real.

Tamaño del diff: unas 194 líneas de producción y 292 de pruebas (unas 486 en total, sobre las 400 de `delivery-budget`). Si la revisión previa lo exige, se parte como dice el plan: (a) motor —approval.ts, public-state.ts, notify.ts y sus pruebas C2, C3, C9, C10–C13, C17— y (b) vigilante —config.ts, hermes.ts y sus pruebas C1, C4–C8, C14–C16, C18—, con (b) dependiendo de (a). No se partió: las dos mitades se prueban juntas y el PO aprobó el plan con el tamaño previsto.
Pruebas existentes: ninguna se editó.

## Pruebas

Directorio de ejecución: la raíz del repositorio (o del worktree). Sin requisitos de ambiente: todo el envío usa un transporte falso.

- `npx vitest run tests/aviso-decision.test.ts` → 18 pruebas en verde (C1–C18).
- `npx vitest run tests/hermes-notify.test.ts tests/vigilante-jornada.test.ts tests/qa-por-politica.test.ts tests/retiro-disparador.test.ts` → en verde, sin cambios (C19).
- `npx tsc --noEmit -p .`, `npx eslint packages tests/aviso-decision.test.ts`, `npx prettier --check packages tests/aviso-decision.test.ts`, `node scripts/exports-sin-uso.mjs` → sin hallazgos.

Validaciones manuales: ninguna. El aviso real a Telegram no se probó (por regla); con `hermes.notify.screen-url` ausente el aviso dice «sin enlace» hasta que el orquestador la declare en main.

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
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Implementación en subagente sonnet; la sesión no expone los números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de implementación sin agregado expuesto",
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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:35.255Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T20:57:34.094Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T21:00:28.904Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T21:25:02.601Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:4e9b2deea709d976b8383317f9a0783c02eaad8f8ef83377ed0e84e9b703a0f7\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T21:25:03.167Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:4e9b2deea709d976b8383317f9a0783c02eaad8f8ef83377ed0e84e9b703a0f7."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T21:25:03.167Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T21:25:03.508Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T21:28:48.104Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T21:28:48.586Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T21:29:14.283Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":486,\"borradas\":1,\"total\":487,\"tope\":400,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
