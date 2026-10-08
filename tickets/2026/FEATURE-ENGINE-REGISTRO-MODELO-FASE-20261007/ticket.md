---
schema_version: 2
id: FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007
title: Registrar el modelo realmente usado por fase, compararlo con el declarado y decir «sin reportar» el costo ausente
type: FEATURE
module: ENGINE
workflow_status: approved
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

# FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007

## Solicitud original

Parte del sprint: Cada fase se despacha al ejecutor y modelo de su proveedor, sin caídas silenciosas, y el modelo usado queda registrado.
- R-PERF-006: El modelo realmente usado DEBE quedar registrado por fase
Depende de: SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El modelo realmente usado DEBE quedar registrado por fase
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-006: lo cubre FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 (Mostrar el modelo efectivo, su origen y el realmente usado por fase)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la parte de motor de R-PERF-006 en las sesiones **desatendidas** que lanza el harness (preparación de la jornada y `valmen run`): cada renglón de `.valmen/journeys/fases.jsonl` guarda, además del modelo declarado por el despacho, el modelo que el cliente reportó haber usado y el costo que reportó (o `null`); el renglón dice si el usado difiere del declarado; el parte diario lo compara por fase y dice «sin reportar» cuando el cliente no reporta modelo o costo. La vista en Mission Control y el CLI de perfiles quedan para FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 y FEATURE-CLI-PERFILES-MODELOS-20261007; la delegación interactiva a subagentes, para FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007.
- Usuario o rol afectado: el PO que lee el parte diario (Telegram/Hermes) y audita el costo por fase; el agente revisor, que necesita saber qué modelo produjo el análisis y el plan para no revisarse a sí mismo.
- Comportamiento actual: el registro por fase guarda como `modelo` el que el harness **pidió** (`despacho.model`), no el que el cliente **usó**; el ejecutor de Claude se lanza con salida de texto (`--print`), así que el modelo efectivo y el costo se pierden; el parte muestra solo los modelos pedidos y siempre dice «costo sin reportar por el cliente», aunque el cliente sí lo reporte.
- Comportamiento esperado: el renglón de cada fase trae `modelo` (declarado), `modeloUsado` (reportado por el cliente, o `null` = sin reportar), `coincide` (`true`/`false`/`null`) y `costeUsd` (reportado o `null`); el parte por fase lista los modelos usados, señala cada fase cuyo usado difiere del declarado y dice «sin reportar» cuando falta el modelo o el costo, sin inventar un número.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - `packages/engine/src/journey-phases.ts:29-42`: `RegistroDeFase` tiene un solo campo `modelo`; no hay dónde guardar el modelo usado ni el costo.
  - `packages/engine/src/autonomous-run.ts:302-323` (`runAutonomous`) y `packages/engine/src/journey-preparation.ts:174-189` y `:224-235` (`prepararTicket`/`registrar`) escriben `modelo: despacho.model` —el pedido—, sin leer nada de la salida del ejecutor.
  - `packages/engine/src/autonomous-run.ts:180-183` (`autonomousExecutorCommand`) lanza `claude --model … --print <prompt>`: salida de texto, sin `modelUsage` ni `total_cost_usd`. El resultado del ejecutor (`autonomous-run.ts:196-214`, `journey-preparation.ts:85-105`) ya trae `stdout`, pero nadie lo lee para el registro.
  - `packages/cli/src/hermes.ts:1360-1380` (`armarParte`): el parte agrupa `s2.modelo` (el pedido) y fija `costeUsd: null` por fase; `packages/engine/src/notify.ts:596-606` (`BriefJornada`) no tiene campo para el usado ni para la diferencia, y `notify.ts:676-682` imprime siempre «costo sin reportar por el cliente» cuando `costeUsd` es `null`.
- Lo que ya existe y se reutiliza (no se duplica):
  - `despachoDeFase` (`packages/adapter/src/routing.ts:1106`) y `resolverDespachoDeFase` (`journey-phases.ts:102`): son la fuente del modelo **declarado** y de su origen (perfil, enrutado o política); no cambian.
  - `normalizarModelo` (`packages/adapter/src/routing.ts:1310`): la comparación declarado/usado se hace sobre identificadores normalizados, con la misma regla de prefijo que ya usa `packages/credentials/src/claude-cli.ts:454-459` para el alias de Claude (`claude-haiku-4-5` frente a `claude-haiku-4-5-20251001`).
  - La lectura de `--output-format json` de Claude ya existe en `packages/credentials/src/claude-cli.ts:303-318` (`leerResultado`, privada); el motor no depende de `@valmen/credentials` (`packages/engine/package.json`), así que la lectura del resultado se pone en `@valmen/adapter` junto a `normalizarModelo` y no se copia en dos paquetes del motor.
  - `packages/server/src/agentes.ts:171-172` ya lee el modelo real de los subagentes de la corrida orquestada desde sus transcripts; es del servidor (el motor no puede importarlo) y cubre la sesión interactiva, no la desatendida: este ticket no lo duplica y la vista de Mission Control lo une.
  - `packages/engine/src/execution-models.ts:57` (`observeEffectiveExecutionModel`) es el contrato por intento de FEATURE-ENGINE-MODELO-INTENTO; la jornada no lo alimenta hoy y este ticket no lo cablea (ver hipótesis).
- Hipótesis pendientes:
  - Codex (`codex exec`) y OpenCode (`opencode run`) no exponen en su salida actual un modelo ni un costo que el harness lea; hasta que se compruebe un formato estable, su renglón queda `modeloUsado: null` y `costeUsd: null` («sin reportar»). No se deduce de la configuración.
  - Con la suscripción de Claude, `total_cost_usd` es el costo equivalente que reporta el CLI, no una factura; se registra como «reportado por el cliente» (decisión para el PO en el plan).
- Consumidores afectados:
  - `packages/cli/src/hermes.ts:1362` (`armarParte`, parte diario de Hermes/Telegram) y `packages/engine/src/notify.ts:596` y `:671-687` (`BriefJornada` y su render).
  - `packages/engine/src/reviewer.ts:127-136` (`productoresDelTicket`): hoy toma `registro.modelo`; con el usado registrado debe preferirlo, para no elegir como revisor el mismo modelo que de verdad produjo el plan.
  - Pruebas que fijan el formato: `tests/vigilante-jornada.test.ts:136-137` (texto del parte), `tests/jornada-ejecucion.test.ts`, `tests/agente-revisor.test.ts`, `tests/autonomous-run.test.ts` (argumentos del ejecutor).
  - Consumidores futuros que dependen de este contrato: FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 y FEATURE-CLI-PERFILES-MODELOS-20261007.
- Archivos y flujo investigados: `despachoDeFase` (`routing.ts:1106`) → `resolverDespachoDeFase` (`journey-phases.ts:102`) → `runAutonomousInner` (`autonomous-run.ts:363-372`) / `prepararTicketInner` (`journey-preparation.ts:210-222`) → `autonomousExecutorCommand` (`autonomous-run.ts:159`) → `execute`/`ejecutarDeVerdad` (stdout) → `registrarFase` (`journey-phases.ts:49`) → `leerFases` (`journey-phases.ts:69`) → `armarParte` (`hermes.ts:1362`) → `renderBrief` (`notify.ts:671`) y `productoresDelTicket` (`reviewer.ts:127`). Memoria consultada (`buscar_memoria`): AP-003 (`.valmen/memory/aprendizajes.md:21`) —la vista pertenece a otro ticket del grafo; este cubre el contrato de motor—.
- Riesgos y compatibilidad:
  - `fases.jsonl` es append-only y ya tiene renglones `version: 1` sin los campos nuevos: se agregan como **opcionales** en la misma versión y un renglón viejo se lee como «sin reportar»; nada se reescribe.
  - Pasar Claude a `--output-format json` cambia el `stdout` del ejecutor de texto a JSON; hoy ese `stdout` no lo consume nadie en el motor (`autonomous-run.ts` y `journey-preparation.ts` solo leen `status`/`stderr`), pero las pruebas que fijan los argumentos cambian.
  - Una salida JSON truncada o ilegible no puede romper el registro: se registra `modeloUsado: null` y la fase sigue.
  - El costo y el modelo vienen del cliente: se guardan solo identificadores y números, nunca texto del prompt ni del resultado.
- Impactos de sync, migración, Docker o despliegue: ninguno — cambio de motor y CLI local; el archivo `fases.jsonl` crece con campos opcionales compatibles hacia atrás.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: contrato de motor de R-PERF-006 para las sesiones desatendidas (preparación de la jornada y `valmen run`) y su lectura en el parte diario y en el revisor. Fuera: la vista de Mission Control (FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007), el CLI de perfiles (FEATURE-CLI-PERFILES-MODELOS-20261007), la sesión interactiva con subagentes (FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007, cuyo modelo real ya lee `packages/server/src/agentes.ts`) y el cableado a `packages/engine/src/execution-models.ts`.
- Dependencias: SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007 ya integrado en `main` (`despachoDeFase` en `packages/adapter/src/routing.ts`); se reutiliza sin cambiarlo.
- Responsable: subagente de implementación (sonnet) en el worktree `valmen/ticket-registro-modelo-fase`; pruebas del responsable y QA, el PO.
- Pasos ordenados:
  1. En `packages/adapter/src/routing.ts`, junto a `normalizarModelo`, agregar `reporteDelEjecutor(ejecutor, modeloDeclarado, stdout)`, que devuelve `{ modeloUsado: string | null, costeUsd: number | null }`: para `claude` lee la salida `--output-format json` (objeto o lista cuyo último `type: "result"` vale, como `leerResultado` en `packages/credentials/src/claude-cli.ts`), toma de `modelUsage` el id que coincide con el declarado por prefijo normalizado o el primero, y `total_cost_usd` si es un número finito no negativo; para `codex`, `opencode` o una salida ilegible devuelve `null` en ambos. Agregar `mismoModelo(a, b)` sobre `normalizarModelo` con la regla de prefijo. Exportarlos desde `packages/adapter/src/index.ts`. Pruebas en `tests/routing.test.ts`. (C2, C3, C4, C5)
  2. En `packages/engine/src/autonomous-run.ts` (`autonomousExecutorCommand`), lanzar Claude con `--output-format json` además de `--print`; ajustar la expectativa de argumentos en `tests/autonomous-run.test.ts`. (C1)
  3. En `packages/engine/src/journey-phases.ts`, ampliar `RegistroDeFase` con los opcionales `modeloUsado: string | null`, `coincide: boolean | null` y `costeUsd: number | null`, sin cambiar `version: 1`; `registrarFase` calcula `coincide` con `mismoModelo` (o `null` si no hay usado), y `leerFases` normaliza un renglón viejo a `null` en los tres. Pruebas en `tests/jornada-ejecucion.test.ts`. (C6, C7, C8)
  4. En `packages/engine/src/autonomous-run.ts` (`runAutonomous`, `runAutonomousInner`), guardar en `contexto` el `stdout` del ejecutor y pasar `reporteDelEjecutor(despacho.ejecutor, despacho.model, stdout)` a `registrarFase`; si el despacho se detuvo, `modeloUsado` y `costeUsd` quedan `null`. Prueba con un `execute` falso que devuelve un JSON de Claude en `tests/jornada-ejecucion.test.ts`. (C9)
  5. En `packages/engine/src/journey-preparation.ts` (`prepararTicket`, `prepararTicketInner`, `registrar`), lo mismo para la fase `analysis` con el `stdout` de la corrida. Prueba en `tests/jornada-preparacion.test.ts`. (C10)
  6. En `packages/engine/src/notify.ts`, ampliar cada fase de `BriefJornada` con `modelosUsados`, `distintos` (pares declarado → usado) y `sinReportarModelo`/`sinReportarCoste` (conteos); en `renderBrief`, la línea de la fase lista los usados, agrega «⚠ distinto al declarado: <declarado> → <usado>» por cada par, dice «modelo usado sin reportar en N sesión(es)» y «costo sin reportar por el cliente» cuando falta, o la suma reportada más «(N sin reportar)» cuando falta en parte. En `packages/cli/src/hermes.ts` (`armarParte`), llenar esos campos desde `leerFases`. Pruebas en `tests/vigilante-jornada.test.ts`, conservando la línea vieja para renglones sin datos. (C11, C12, C13, C14)
  7. En `packages/engine/src/reviewer.ts` (`productoresDelTicket`), usar `modeloUsado` cuando exista y `modelo` si no. Prueba en `tests/agente-revisor.test.ts`. (C15)
  8. Correr `npx vitest run tests/routing.test.ts tests/autonomous-run.test.ts tests/jornada-ejecucion.test.ts tests/jornada-preparacion.test.ts tests/vigilante-jornada.test.ts tests/agente-revisor.test.ts tests/journey-brief.test.ts tests/hermes.test.ts` y `npx tsc --noEmit -p tsconfig.json` (tras `npm run build`). (C16)
  9. Entrega: escribir el contrato en `## Pruebas` (comandos del paso 8, directorio el worktree, resultado esperado, validación manual de C17 con una corrida real de `valmen run --ticket <id>` con Claude y lectura de `.valmen/journeys/fases.jsonl`), registrar el consumo de IA, correr `valmen secrets`, compuerta `qa-mechanical` y pasar a `awaiting_user_tests`. (C17)
- Impactos declarados: ninguno de sincronización, migración ni contenedores. `.valmen/journeys/fases.jsonl` es append-only: los campos nuevos son opcionales en `version: 1` y un renglón previo se lee como «sin reportar»; ningún renglón se reescribe.
- Decisiones para el PO:
  - D1: con la suscripción de Claude, `total_cost_usd` es el costo equivalente que reporta el CLI, no una factura. El plan lo registra como costo reportado por el cliente; la alternativa es registrarlo `null` («sin reportar») cuando el ejecutor va por suscripción.
  - D2: Codex y OpenCode quedan «sin reportar» hasta que se compruebe un formato estable de su salida; leer sus bases de sesión (`~/.codex/sessions`, `opencode.db`) sería otro ticket.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); Claude vuelve a `--print` en texto y el parte a la línea anterior. Los renglones ya escritos con `modeloUsado`, `coincide` y `costeUsd` se quedan en `fases.jsonl` (append-only) y el lector anterior los ignora porque solo exige `kind`, `version` y `ticketId` (`packages/engine/src/journey-phases.ts`, `leerFases`); no hay datos que migrar ni borrar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1: El ejecutor de Claude de la jornada se lanza con `--output-format json`.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->
- [ ] C2: `reporteDelEjecutor` toma de la salida JSON de Claude el modelo de `modelUsage` que coincide con el declarado.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [ ] C3: `reporteDelEjecutor` toma de la salida JSON de Claude el costo de `total_cost_usd`.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [ ] C4: Una salida truncada o ilegible deja `modeloUsado` y `costeUsd` en `null`.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [ ] C5: Un ejecutor `codex` u `opencode` deja `modeloUsado` y `costeUsd` en `null`.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [ ] C6: `registrarFase` guarda `coincide: false` cuando el modelo usado difiere del declarado.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [ ] C7: `registrarFase` guarda `coincide: true` cuando el usado es el declarado con otro nombre del mismo modelo (alias o sufijo de fecha).
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [ ] C8: `leerFases` lee un renglón anterior sin los campos nuevos con `modeloUsado`, `coincide` y `costeUsd` en `null`.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [ ] C9: `runAutonomous` registra en la fase el modelo usado y el costo que reportó el ejecutor.
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [ ] C10: La preparación de la jornada registra en la fase `analysis` el modelo usado que reportó el ejecutor.
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [ ] C11: El parte señala la fase cuyo modelo usado difiere del declarado, con los dos modelos.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C12: El parte dice «modelo usado sin reportar» en la fase cuyas sesiones no reportaron modelo.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C13: El parte dice «costo sin reportar por el cliente» en la fase sin costo reportado.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C14: El parte suma el costo reportado de la fase y dice cuántas sesiones quedaron sin reportar.
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [ ] C15: `productoresDelTicket` usa el modelo usado cuando el registro lo trae.
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [ ] C16: El monorepo compila sin errores de tipos.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C17: Una corrida real de `valmen run` con Claude deja en `.valmen/journeys/fases.jsonl` el modelo usado y el costo reportados.
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
    "at": "2026-10-07T18:03:48.456Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:32:59.771Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:34:17.390Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:35:33.293Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A, apruebo (plan de REGISTRO-MODELO-FASE: el costo de Claude con suscripción se registra como reportado por el cliente)\",\"planHash\":\"sha256:b1a5302b2dba1b98efff1e63a21e9cbfa0233eea5ac24234624cf74440e91a6d\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:35:33.636Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:b1a5302b2dba1b98efff1e63a21e9cbfa0233eea5ac24234624cf74440e91a6d."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:35:33.636Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
